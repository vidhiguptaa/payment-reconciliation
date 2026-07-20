import os
import sys
import shutil
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent


def get_app_data_dir() -> Path:
    """Return OS-specific application data directory."""
    if sys.platform == "win32":
        app_data = os.getenv("APPDATA")
        base = Path(app_data) if app_data else Path.home() / "AppData" / "Roaming"
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path.home() / ".local" / "share"

    dir_path = base / "PaymentReconciliation"
    dir_path.mkdir(parents=True, exist_ok=True)
    return dir_path


APP_DATA_DIR = get_app_data_dir()
DB_PATH = APP_DATA_DIR / "reconciliation.db"


def migrate_legacy_database(target_db_path: Path) -> None:
    """Migrate legacy database from project folder if target DB does not exist."""
    if target_db_path.exists():
        return

    candidates = [
        BASE_DIR / "reconciliation.db",
        BASE_DIR / "backend" / "reconciliation.db",
        BASE_DIR / "data" / "reconciliation.db",
        Path("./reconciliation.db").resolve(),
    ]

    for candidate in candidates:
        if candidate.exists() and candidate.resolve() != target_db_path.resolve():
            try:
                target_db_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(candidate, target_db_path)
                print(f"[DB Migration] Successfully migrated existing database: {candidate} -> {target_db_path}")
                break
            except Exception as e:
                print(f"[DB Migration Error] Failed to migrate database from {candidate}: {e}")


migrate_legacy_database(DB_PATH)

env_name = os.getenv("APP_ENV", "development").lower()
config_env_file = BASE_DIR / "backend" / "config" / f"{env_name}.env"
dot_env_file = BASE_DIR / ".env"

selected_env_file = str(config_env_file) if config_env_file.exists() else (str(dot_env_file) if dot_env_file.exists() else None)


class Settings(BaseSettings):
    APP_NAME: str = "Payment & Bank Statement Reconciliation"
    APP_VERSION: str = "0.1.0"
    APP_ENV: str = env_name
    DEBUG: bool = False
    APP_DATA_DIR: str = str(APP_DATA_DIR)
    DATABASE_URL: str = f"sqlite:///{DB_PATH}"
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8000", "*"]

    SCREENSHOTS_DIR: str = str(APP_DATA_DIR / "data" / "payment-screenshots")
    STATEMENTS_DIR: str = str(APP_DATA_DIR / "data" / "account-statements")
    THUMBNAILS_DIR: str = str(APP_DATA_DIR / "data" / "thumbnails")
    FRONTEND_DIST_DIR: str = str(BASE_DIR / "frontend" / "dist")

    # OCR Configuration Settings
    OCR_PROVIDER: str = "paddleocr"
    GOOGLE_API_KEY: str = ""
    TESSERACT_PATH: str = ""
    PADDLE_LANGUAGE: str = "en"

    model_config = SettingsConfigDict(
        env_file=selected_env_file if selected_env_file else ".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
