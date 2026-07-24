import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from PIL import Image

from app.config import settings
from app.database import get_db, SessionLocal
from app.models import Screenshot, ScreenshotStatus
from app.services.screenshot_scanner import ScreenshotScannerService

router = APIRouter(prefix="/api/screenshots", tags=["screenshots"])

class ScreenshotSchema(BaseModel):
    id: int
    filename: str
    filepath: str
    file_hash: str
    extension: str
    file_size: int
    created_at: str
    imported_at: str
    status: str
    thumbnail_path: Optional[str] = None
    image_url: str
    thumbnail_url: Optional[str] = None

class ScreenshotsListResponse(BaseModel):
    total: int
    items: List[ScreenshotSchema]

def format_screenshot(item: Screenshot) -> Dict[str, Any]:
    return {
        "id": item.id,
        "filename": item.filename,
        "filepath": item.filepath,
        "file_hash": item.file_hash,
        "extension": item.extension,
        "file_size": item.file_size,
        "created_at": item.created_at.isoformat() if item.created_at else "",
        "imported_at": item.imported_at.isoformat() if item.imported_at else "",
        "status": item.status,
        "thumbnail_path": item.thumbnail_path,
        "image_url": f"/api/screenshots/{item.id}/image",
        "thumbnail_url": f"/api/screenshots/{item.id}/thumbnail" if item.thumbnail_path else f"/api/screenshots/{item.id}/image"
    }

@router.post("/scan")
def scan_screenshots(db: Session = Depends(get_db)):
    scanner = ScreenshotScannerService(db=db)
    result = scanner.scan()
    return result

@router.get("", response_model=ScreenshotsListResponse)
def get_screenshots(db: Session = Depends(get_db)):
    items = db.query(Screenshot).order_by(Screenshot.imported_at.desc()).all()
    formatted = [format_screenshot(item) for item in items]
    return {
        "total": len(formatted),
        "items": formatted
    }

@router.get("/{screenshot_id}", response_model=ScreenshotSchema)
def get_screenshot_by_id(screenshot_id: int, db: Session = Depends(get_db)):
    item = db.query(Screenshot).filter(Screenshot.id == screenshot_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Screenshot not found")
    return format_screenshot(item)

@router.get("/{screenshot_id}/image")
def get_screenshot_file(screenshot_id: int, db: Session = Depends(get_db)):
    item = db.query(Screenshot).filter(Screenshot.id == screenshot_id).first()
    if not item or not Path(item.filepath).exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")
    return FileResponse(path=item.filepath)

@router.get("/{screenshot_id}/thumbnail")
def get_screenshot_thumbnail(screenshot_id: int, db: Session = Depends(get_db)):
    item = db.query(Screenshot).filter(Screenshot.id == screenshot_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Screenshot record not found")
    
    if item.thumbnail_path and Path(item.thumbnail_path).exists():
        return FileResponse(path=item.thumbnail_path, media_type="image/png")
    elif Path(item.filepath).exists():
        return FileResponse(path=item.filepath)
    else:
        raise HTTPException(status_code=404, detail="Image thumbnail not found")

# --- Duplicate Check and Upload Schemas ---
class FileInfo(BaseModel):
    filename: str
    size: int
    hash: str

class CheckDuplicatesRequest(BaseModel):
    files: List[FileInfo]

class ExistingFileInfo(BaseModel):
    hash: str
    screenshot_id: int
    imported_at: str

class MissingFileInfo(BaseModel):
    filename: str
    hash: str

class InvalidFileInfo(BaseModel):
    filename: str
    hash: str
    reason: str

class DuplicateCheckSummary(BaseModel):
    total_checked: int
    existing_count: int
    missing_count: int
    invalid_count: int

class CheckDuplicatesResponse(BaseModel):
    summary: DuplicateCheckSummary
    existing: List[ExistingFileInfo]
    missing: List[MissingFileInfo]
    invalid: List[InvalidFileInfo]

class BatchUploadDetail(BaseModel):
    id: Optional[int] = None
    filename: str
    status: str
    hash: str
    reason: Optional[str] = None

class BatchUploadResponse(BaseModel):
    batch_id: str
    imported_count: int
    details: List[BatchUploadDetail]
# ------------------------------------------

@router.post("/check-duplicates", response_model=CheckDuplicatesResponse)
def check_duplicates(request: CheckDuplicatesRequest, db: Session = Depends(get_db)):
    existing = []
    missing = []
    invalid = []
    
    # Extract hashes to check
    hashes_to_check = [f.hash for f in request.files if f.hash]
    
    # Query database for existing matches in bulk
    existing_screenshots = db.query(Screenshot).filter(Screenshot.file_hash.in_(hashes_to_check)).all()
    existing_map = {s.file_hash: s for s in existing_screenshots}
    
    for f in request.files:
        if not f.hash or len(f.hash) != 64:
            invalid.append(InvalidFileInfo(
                filename=f.filename,
                hash=f.hash or "",
                reason="Invalid or missing SHA-256 hash"
            ))
            continue
            
        if f.size <= 0:
            invalid.append(InvalidFileInfo(
                filename=f.filename,
                hash=f.hash,
                reason="Empty file (size is 0)"
            ))
            continue
            
        if f.hash in existing_map:
            s = existing_map[f.hash]
            existing.append(ExistingFileInfo(
                hash=s.file_hash,
                screenshot_id=s.id,
                imported_at=s.imported_at.isoformat()
            ))
        else:
            missing.append(MissingFileInfo(
                filename=f.filename,
                hash=f.hash
            ))
            
    summary = DuplicateCheckSummary(
        total_checked=len(request.files),
        existing_count=len(existing),
        missing_count=len(missing),
        invalid_count=len(invalid)
    )
    
    return CheckDuplicatesResponse(
        summary=summary,
        existing=existing,
        missing=missing,
        invalid=invalid
    )

def _create_thumbnail(image_path: Path, file_hash: str) -> Optional[str]:
    try:
        settings.THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)
        thumb_filename = f"thumb_{file_hash[:16]}.png"
        thumb_filepath = settings.THUMBNAILS_DIR / thumb_filename
        if not thumb_filepath.exists():
            with Image.open(image_path) as img:
                img.thumbnail((300, 300))
                output_img = img.convert("RGBA") if img.mode not in ("RGB", "RGBA") else img
                output_img.save(thumb_filepath, "PNG")
        return str(thumb_filepath.resolve())
    except Exception:
        return None

def run_screenshots_pipeline():
    from app.services.processing_pipeline import ProcessingPipelineService
    import logging
    logger = logging.getLogger(__name__)
    logger.info("[Background Task] Starting Processing Pipeline...")
    db = SessionLocal()
    try:
        pipeline = ProcessingPipelineService(db)
        pipeline.process_all_pending()
        logger.info("[Background Task] Processing Pipeline completed.")
    except Exception as e:
        logger.error(f"[Background Task] Processing Pipeline failed: {e}", exc_info=True)
    finally:
        db.close()

@router.post("/batch-upload", response_model=BatchUploadResponse)
async def batch_upload_screenshots(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    import uuid
    batch_id = str(uuid.uuid4())[:8]
    details = []
    imported_count = 0
    screenshots_added = []
    
    settings.SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    
    for file in files:
        try:
            contents = await file.read()
            file_hash = hashlib.sha256(contents).hexdigest()
            
            # Check duplicate in db
            existing = db.query(Screenshot).filter(Screenshot.file_hash == file_hash).first()
            if existing:
                details.append(BatchUploadDetail(
                    id=existing.id,
                    filename=file.filename,
                    status="SKIPPED_DUPLICATE",
                    hash=file_hash,
                    reason="Screenshot already exists in database"
                ))
                continue
                
            # Save file to disk
            ext = Path(file.filename).suffix.lower()
            if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
                details.append(BatchUploadDetail(
                    filename=file.filename,
                    status="FAILED",
                    hash=file_hash,
                    reason=f"Unsupported file extension '{ext}'"
                ))
                continue
                
            unique_filename = f"{file_hash[:16]}_{Path(file.filename).name}"
            saved_path = settings.SCREENSHOTS_DIR / unique_filename
            
            with open(saved_path, "wb") as f:
                f.write(contents)
                
            # Verify image content
            try:
                with Image.open(saved_path) as img:
                    img.verify()
            except Exception as img_err:
                if saved_path.exists():
                    saved_path.unlink()
                details.append(BatchUploadDetail(
                    filename=file.filename,
                    status="FAILED",
                    hash=file_hash,
                    reason=f"Corrupt image file: {str(img_err)}"
                ))
                continue
                
            # Create thumbnail
            thumbnail_path = _create_thumbnail(saved_path, file_hash)
            
            # Create DB entry
            screenshot = Screenshot(
                filename=file.filename,
                filepath=str(saved_path.resolve()),
                file_hash=file_hash,
                extension=ext,
                file_size=len(contents),
                created_at=datetime.now(timezone.utc),
                imported_at=datetime.now(timezone.utc),
                status=ScreenshotStatus.PENDING.value,
                thumbnail_path=thumbnail_path
            )
            db.add(screenshot)
            
            detail = BatchUploadDetail(
                filename=file.filename,
                status="IMPORTED",
                hash=file_hash
            )
            details.append(detail)
            screenshots_added.append((screenshot, detail))
            imported_count += 1
            
        except Exception as e:
            details.append(BatchUploadDetail(
                filename=file.filename,
                status="FAILED",
                hash="",
                reason=f"Upload error: {str(e)}"
            ))
            
    if screenshots_added:
        try:
            db.commit()
            for screenshot, d in screenshots_added:
                db.refresh(screenshot)
                d.id = screenshot.id
                
            background_tasks.add_task(run_screenshots_pipeline)
        except Exception as db_err:
            db.rollback()
            # Clean up files on commit failure
            for screenshot, d in screenshots_added:
                try:
                    p = Path(screenshot.filepath)
                    if p.exists():
                        p.unlink()
                    if screenshot.thumbnail_path:
                        tp = Path(screenshot.thumbnail_path)
                        if tp.exists():
                            tp.unlink()
                except Exception:
                    pass
                d.status = "FAILED"
                d.reason = f"Database commit failed: {str(db_err)}"
            imported_count = 0
            
    return BatchUploadResponse(
        batch_id=batch_id,
        imported_count=imported_count,
        details=details
    )
