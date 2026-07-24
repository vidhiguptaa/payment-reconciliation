from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncGenerator, Dict, Any
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.config import settings, DB_PATH
from app.database import engine, Base, get_db
from app.logging_config import setup_logging
from app.routers.screenshots import router as screenshots_router
from app.routers.jobs import router as jobs_router
from app.routers.ocr import router as ocr_router
from app.routers.extraction import router as extraction_router
from app.routers.statements import router as statements_router
from app.routers.reconciliation import router as reconciliation_router
from app.routers.events import router as events_router
from app.routers.settings import router as settings_router
from app.routers.backups import router as backups_router
from app.services.watcher.watcher import watcher_service
from app.services.settings_service import settings_service, CONFIG_FILE
from app.services.backup_service import backup_service
from app.services.metrics_service import metrics_service

# Initialize structured rotating logging
setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    Base.metadata.create_all(bind=engine)
    settings.THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)

    user_settings = settings_service.get_all()
    Path(user_settings["screenshots_dir"]).mkdir(parents=True, exist_ok=True)
    Path(user_settings["statements_dir"]).mkdir(parents=True, exist_ok=True)

    # Check and perform daily automatic backup
    try:
        backup_service.check_daily_auto_backup()
    except Exception as e:
        import logging
        logging.error(f"[Main Lifespan] Daily backup error: {e}")

    if user_settings.get("auto_start_watcher", True):
        watcher_service.start(
            screenshots_dir=user_settings["screenshots_dir"],
            statements_dir=user_settings["statements_dir"],
        )
    yield
    watcher_service.stop()


class RootResponse(BaseModel):
    message: str
    docs: str
    health: str


class DetailedHealthResponse(BaseModel):
    status: str
    app_name: str
    version: str
    environment: str
    database: str
    timestamp: str
    components: Dict[str, Any]
    metrics: Dict[str, Any]


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Local-first Payment Screenshot and Bank Statement Reconciliation Backend",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if settings.THUMBNAILS_DIR.exists():
    app.mount("/thumbnails", StaticFiles(directory=settings.THUMBNAILS_DIR), name="thumbnails")

app.include_router(screenshots_router)
app.include_router(jobs_router)
app.include_router(ocr_router)
app.include_router(extraction_router)
app.include_router(statements_router)
app.include_router(reconciliation_router)
app.include_router(events_router)
app.include_router(settings_router)
app.include_router(backups_router)


@app.api_route("/api/health", methods=["GET", "HEAD"], response_model=DetailedHealthResponse)
def health_check(db: Session = Depends(get_db)) -> DetailedHealthResponse:
    db_status = "disconnected"
    try:
        result = db.execute(text("SELECT 1")).scalar()
        if result == 1:
            db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"

    user_settings = settings_service.get_all()
    ocr_provider_name = user_settings.get("ocr_provider", settings.OCR_PROVIDER)

    from app.services.ocr.provider_factory import OCRProviderFactory
    active_provider = OCRProviderFactory.get_provider(ocr_provider_name)
    provider_available = active_provider.health_check()

    components = {
        "backend_running": True,
        "watcher_running": watcher_service.is_running(),
        "database_connected": db_status == "connected",
        "ocr_provider": active_provider.provider_name,
        "ocr_provider_available": provider_available,
        "db_path": str(DB_PATH),
        "config_path": str(CONFIG_FILE),
    }


    return DetailedHealthResponse(
        status="ok" if db_status == "connected" else "degraded",
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
        environment=settings.APP_ENV,
        database=db_status,
        timestamp=datetime.now(timezone.utc).isoformat(),
        components=components,
        metrics=metrics_service.get_summary(),
    )


dist_dir = settings.FRONTEND_DIST_DIR
if dist_dir.exists():
    assets_dir = dist_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="static_assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa_frontend(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("docs") or full_path.startswith("redoc") or full_path.startswith("thumbnails/"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="API endpoint not found")

        file_path = dist_dir / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)

        index_file = dist_dir / "index.html"
        if index_file.exists():
            return FileResponse(index_file)

        return {"message": "Frontend distribution build missing."}
else:
    @app.api_route("/", methods=["GET", "HEAD"], response_model=RootResponse)
    def root() -> RootResponse:
        return RootResponse(
            message=f"Welcome to {settings.APP_NAME} ({settings.APP_ENV} mode)",
            docs="/docs",
            health="/api/health",
        )
