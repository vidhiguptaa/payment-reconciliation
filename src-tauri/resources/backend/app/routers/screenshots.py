from pathlib import Path
from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Screenshot
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
