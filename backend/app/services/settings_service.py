"""
Persistent User Settings & Config Service.

Stores user-configurable application settings in config.json within the OS AppData folder.
Settings are loaded at startup and can be modified at runtime via the Settings API.
Changes to folder paths automatically trigger watcher restarts.
"""
import json
import logging
from pathlib import Path
from typing import Any, Dict
from dataclasses import dataclass, asdict

from app.config import BASE_DIR, APP_DATA_DIR

logger = logging.getLogger(__name__)

CONFIG_FILE = APP_DATA_DIR / "config.json"
LEGACY_SETTINGS_FILE = BASE_DIR / "data" / "settings.json"


@dataclass
class UserSettings:
    # Folder paths
    screenshots_dir: str = str(BASE_DIR / "data" / "payment-screenshots")
    statements_dir: str = str(BASE_DIR / "data" / "account-statements")
    backup_dir: str = str(APP_DATA_DIR / "backups")

    # OCR Configuration
    ocr_provider: str = "paddleocr"
    tesseract_path: str = ""
    paddle_language: str = "en"

    # UI & Preferences
    theme: str = "dark"
    last_tab: str = "screenshots"
    window_width: int = 1280
    window_height: int = 800

    # Automation toggles
    auto_start_watcher: bool = True
    auto_reconcile: bool = True
    auto_import_statements: bool = True
    show_processing_notifications: bool = True
    auto_check_updates: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class SettingsService:
    def __init__(self) -> None:
        self._settings: UserSettings = UserSettings()
        self._load()

    def _migrate_legacy(self) -> None:
        if not CONFIG_FILE.exists() and LEGACY_SETTINGS_FILE.exists():
            try:
                CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
                with open(LEGACY_SETTINGS_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2)
                logger.info(f"[SettingsService] Migrated legacy settings to {CONFIG_FILE}")
            except Exception as e:
                logger.warning(f"[SettingsService] Failed legacy settings migration: {e}")

    def _load(self) -> None:
        self._migrate_legacy()

        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                valid_fields = UserSettings.__dataclass_fields__
                filtered_data = {k: v for k, v in data.items() if k in valid_fields}
                self._settings = UserSettings(**{**asdict(UserSettings()), **filtered_data})
                logger.info(f"[SettingsService] Loaded user config from {CONFIG_FILE}")
            except Exception as e:
                logger.warning(f"[SettingsService] Error loading config file, using defaults: {e}")
                self._settings = UserSettings()
        else:
            logger.info(f"[SettingsService] No config file found at {CONFIG_FILE}, creating defaults.")
            self._save()

    def _save(self) -> None:
        try:
            CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(self._settings.to_dict(), f, indent=2)
            logger.info(f"[SettingsService] Configuration saved to {CONFIG_FILE}")
        except Exception as e:
            logger.error(f"[SettingsService] Error saving configuration: {e}")

    def get_all(self) -> Dict[str, Any]:
        return self._settings.to_dict()

    def get(self, key: str) -> Any:
        return getattr(self._settings, key, None)

    def update(self, updates: Dict[str, Any]) -> Dict[str, Any]:
        changed_keys: list[str] = []
        for key, value in updates.items():
            if hasattr(self._settings, key):
                old_value = getattr(self._settings, key)
                if old_value != value:
                    setattr(self._settings, key, value)
                    changed_keys.append(key)

        if changed_keys:
            self._save()
            logger.info(f"[SettingsService] Updated config keys: {changed_keys}")

        return {"updated_keys": changed_keys, "settings": self._settings.to_dict()}

    def validate_folder(self, folder_path: str) -> Dict[str, Any]:
        p = Path(folder_path)
        exists = p.exists()
        is_directory = p.is_dir() if exists else False
        is_writable = False
        if exists and is_directory:
            try:
                test_file = p / ".write_test"
                test_file.touch()
                test_file.unlink()
                is_writable = True
            except Exception:
                is_writable = False
        return {
            "path": folder_path,
            "exists": exists,
            "is_directory": is_directory,
            "is_writable": is_writable,
            "valid": exists and is_directory and is_writable,
        }


settings_service = SettingsService()
