import os
import sys
import json
import shutil
from pathlib import Path
from typing import Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent


DATA_ROOT = Path(os.getenv("DATA_ROOT", "./data")).resolve()
DB_PATH = DATA_ROOT / "reconciliation.db"
DATA_ROOT.mkdir(parents=True, exist_ok=True)


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

DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "https://tauri.localhost",
    "tauri://localhost",
    "http://tauri.localhost",
    "http://localhost:8000",
]


class Settings(BaseSettings):
    APP_NAME: str = "Payment & Bank Statement Reconciliation"
    APP_VERSION: str = "0.1.0"
    APP_ENV: str = env_name
    DEBUG: bool = False
    DATA_ROOT: Path = DATA_ROOT
    DATABASE_URL: str = f"sqlite:///{DB_PATH}"
    CORS_ORIGINS: Union[list[str], str] = DEFAULT_CORS_ORIGINS

    SCREENSHOTS_DIR: Path = DATA_ROOT / "payment-screenshots"
    STATEMENTS_DIR: Path = DATA_ROOT / "account-statements"
    THUMBNAILS_DIR: Path = DATA_ROOT / "thumbnails"
    FRONTEND_DIST_DIR: Path = BASE_DIR / "frontend" / "dist"

    # OCR Configuration Settings
    OCR_PROVIDER: str = "paddle"
    TESSERACT_PATH: str = ""
    PADDLE_LANGUAGE: str = "en"


    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Union[str, list[str]]) -> list[str]:
        if isinstance(v, str):
            v_str = v.strip()
            if v_str.startswith("[") and v_str.endswith("]"):
                try:
                    parsed = json.loads(v_str)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if str(item).strip()]
                except Exception:
                    pass
            return [origin.strip() for origin in v_str.split(",") if origin.strip()]
        return v if isinstance(v, list) else [v]


    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def fix_postgres_url(cls, v: str) -> str:
        if isinstance(v, str) and v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql://", 1)
        return v

    model_config = SettingsConfigDict(
        env_file=selected_env_file if selected_env_file else ".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()

