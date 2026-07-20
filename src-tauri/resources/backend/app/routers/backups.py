import logging
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, Body

from app.services.backup_service import backup_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/backups", tags=["backups"])


@router.get("", response_model=List[Dict[str, Any]])
def list_backups() -> List[Dict[str, Any]]:
    """List all available database backups."""
    return backup_service.list_backups()


@router.post("/create", response_model=Dict[str, Any])
def create_backup() -> Dict[str, Any]:
    """Create a manual database backup."""
    try:
        return backup_service.create_backup(is_auto=False)
    except Exception as e:
        logger.error(f"[Backup Router] Failed to create backup: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/restore", response_model=Dict[str, Any])
def restore_backup(filename: str = Body(..., embed=True)) -> Dict[str, Any]:
    """Restore active database from backup file."""
    try:
        return backup_service.restore_backup(filename)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[Backup Router] Restore failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{filename}")
def delete_backup(filename: str) -> Dict[str, Any]:
    """Delete a specific backup file."""
    backup_dir = backup_service.get_backup_dir()
    file_path = backup_dir / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Backup '{filename}' not found.")
    try:
        file_path.unlink()
        return {"deleted": filename, "status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
