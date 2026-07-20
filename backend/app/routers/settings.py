import logging
from typing import Dict, Any
from fastapi import APIRouter, Body

from app.services.settings_service import settings_service
from app.services.watcher.watcher import watcher_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
def get_settings() -> Dict[str, Any]:
    """Return all current user settings."""
    return settings_service.get_all()


@router.put("")
def update_settings(updates: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """
    Update one or more settings fields.
    If folder paths change, automatically restart the background watcher.
    """
    # Detect folder path changes before applying
    old = settings_service.get_all()
    result = settings_service.update(updates)

    new = settings_service.get_all()
    folders_changed = (
        old.get("screenshots_dir") != new.get("screenshots_dir")
        or old.get("statements_dir") != new.get("statements_dir")
    )

    # Restart watcher if folder paths changed
    if folders_changed:
        logger.info("[Settings] Folder paths changed. Restarting background watcher...")
        watcher_service.restart(
            screenshots_dir=new["screenshots_dir"],
            statements_dir=new["statements_dir"],
        )
        result["watcher_restarted"] = True
    else:
        result["watcher_restarted"] = False

    # Handle auto_start_watcher toggle
    if "auto_start_watcher" in updates:
        if new["auto_start_watcher"] and not watcher_service.is_running():
            watcher_service.start(
                screenshots_dir=new["screenshots_dir"],
                statements_dir=new["statements_dir"],
            )
            result["watcher_started"] = True
        elif not new["auto_start_watcher"] and watcher_service.is_running():
            watcher_service.stop()
            result["watcher_stopped"] = True

    return result


@router.post("/validate-folder")
def validate_folder(path: str = Body(..., embed=True)) -> Dict[str, Any]:
    """Validate whether a given folder path exists, is a directory, and is writable."""
    return settings_service.validate_folder(path)


@router.post("/create-folder")
def create_folder(path: str = Body(..., embed=True)) -> Dict[str, Any]:
    """Create a folder if it doesn't exist."""
    from pathlib import Path
    try:
        p = Path(path)
        p.mkdir(parents=True, exist_ok=True)
        return {"path": path, "created": True, "valid": p.exists() and p.is_dir()}
    except Exception as e:
        return {"path": path, "created": False, "valid": False, "error": str(e)}


@router.get("/watcher-status")
def get_watcher_status() -> Dict[str, Any]:
    """Return current watcher service running status."""
    return {
        "running": watcher_service.is_running(),
    }
