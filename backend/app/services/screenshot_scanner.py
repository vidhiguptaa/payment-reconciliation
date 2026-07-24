import hashlib
from pathlib import Path
from typing import Dict, List, Any, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from PIL import Image

from app.config import settings
from app.models import Screenshot, ScreenshotStatus

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

class ScanResult:
    def __init__(self) -> None:
        self.total_scanned: int = 0
        self.new_imported: int = 0
        self.skipped_duplicates: int = 0
        self.unsupported_ignored: int = 0
        self.failed_errors: int = 0
        self.details: List[Dict[str, Any]] = []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_scanned": self.total_scanned,
            "new_imported": self.new_imported,
            "skipped_duplicates": self.skipped_duplicates,
            "unsupported_ignored": self.unsupported_ignored,
            "failed_errors": self.failed_errors,
            "details": self.details
        }

class ScreenshotScannerService:
    def __init__(self, db: Session, target_dir: Optional[Path] = None) -> None:
        self.db = db
        self.target_dir = target_dir or settings.SCREENSHOTS_DIR
        self.thumbnails_dir = settings.THUMBNAILS_DIR

    def _ensure_directories(self) -> None:
        self.target_dir.mkdir(parents=True, exist_ok=True)
        self.thumbnails_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def calculate_sha256(filepath: Path) -> str:
        sha256 = hashlib.sha256()
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    def _create_thumbnail(self, image_path: Path, file_hash: str) -> Optional[str]:
        try:
            thumb_filename = f"thumb_{file_hash[:16]}.png"
            thumb_filepath = self.thumbnails_dir / thumb_filename
            if not thumb_filepath.exists():
                with Image.open(image_path) as img:
                    img.thumbnail((300, 300))
                    output_img = img.convert("RGBA") if img.mode not in ("RGB", "RGBA") else img
                    output_img.save(thumb_filepath, "PNG")
            return str(thumb_filepath)
        except Exception:
            return None

    def scan(self) -> Dict[str, Any]:
        self._ensure_directories()
        result = ScanResult()

        if not self.target_dir.exists():
            return result.to_dict()

        try:
            entries = sorted(list(self.target_dir.iterdir()))
        except Exception as e:
            result.details.append({
                "filename": str(self.target_dir),
                "status": "FAILED",
                "reason": f"Permission/Directory error: {str(e)}"
            })
            return result.to_dict()

        for entry in entries:
            if entry.is_dir() or entry.name.startswith("."):
                continue

            result.total_scanned += 1
            ext = entry.suffix.lower()

            if ext not in SUPPORTED_EXTENSIONS:
                result.unsupported_ignored += 1
                result.details.append({
                    "filename": entry.name,
                    "status": "IGNORED",
                    "reason": f"Unsupported file extension '{ext}'"
                })
                continue

            try:
                file_hash = self.calculate_sha256(entry)

                existing = self.db.query(Screenshot).filter(Screenshot.file_hash == file_hash).first()
                if existing:
                    result.skipped_duplicates += 1
                    result.details.append({
                        "filename": entry.name,
                        "status": "SKIPPED_DUPLICATE",
                        "file_hash": file_hash,
                        "existing_id": existing.id
                    })
                    continue

                try:
                    with Image.open(entry) as test_img:
                        test_img.verify()
                except Exception as img_err:
                    result.failed_errors += 1
                    result.details.append({
                        "filename": entry.name,
                        "status": "FAILED",
                        "reason": f"Corrupt image file: {str(img_err)}"
                    })
                    continue

                stat_info = entry.stat()
                file_size = stat_info.st_size
                created_at = datetime.fromtimestamp(stat_info.st_ctime, tz=timezone.utc)

                thumbnail_path = self._create_thumbnail(entry, file_hash)

                screenshot = Screenshot(
                    filename=entry.name,
                    filepath=str(entry.resolve()),
                    file_hash=file_hash,
                    extension=ext,
                    file_size=file_size,
                    created_at=created_at,
                    imported_at=datetime.now(timezone.utc),
                    status=ScreenshotStatus.PENDING.value,
                    thumbnail_path=thumbnail_path
                )
                self.db.add(screenshot)
                self.db.commit()
                self.db.refresh(screenshot)

                result.new_imported += 1
                result.details.append({
                    "id": screenshot.id,
                    "filename": entry.name,
                    "status": "IMPORTED",
                    "file_hash": file_hash,
                    "file_size": file_size
                })

            except Exception as e:
                self.db.rollback()
                result.failed_errors += 1
                result.details.append({
                    "filename": entry.name,
                    "status": "FAILED",
                    "reason": str(e)
                })

        return result.to_dict()
