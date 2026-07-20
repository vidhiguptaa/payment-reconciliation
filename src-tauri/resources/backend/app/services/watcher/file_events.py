import logging
import time
from pathlib import Path
from watchdog.events import FileSystemEventHandler

from app.database import SessionLocal
from app.models import ProcessingLog
from app.services.screenshot_scanner import ScreenshotScannerService
from app.services.processing_pipeline import ProcessingPipelineService
from app.services.statements.importer import StatementImporterService
from app.services.reconciliation.engine import ReconciliationEngine
from app.services.watcher.debouncer import FileStabilityChecker
from app.routers.events import manager

logger = logging.getLogger(__name__)

SUPPORTED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
SUPPORTED_STATEMENT_EXTS = {".csv", ".xlsx", ".xls"}

class ScreenshotFileHandler(FileSystemEventHandler):
    def on_created(self, event) -> None:
        if event.is_directory:
            return
        self._process_event(Path(event.src_path))

    def on_modified(self, event) -> None:
        if event.is_directory:
            return
        self._process_event(Path(event.src_path))

    def _process_event(self, filepath: Path) -> None:
        if filepath.name.startswith(".") or filepath.suffix.lower() not in SUPPORTED_IMAGE_EXTS:
            return

        start_time = time.time()
        logger.info(f"[Watcher] New screenshot detected: {filepath.name}")

        if not FileStabilityChecker.is_file_stable(filepath):
            logger.warning(f"[Watcher] File not stable, skipping: {filepath.name}")
            return

        db = SessionLocal()
        try:
            # 1. Scan folder
            scanner = ScreenshotScannerService(db)
            scan_res = scanner.scan()

            # 2. Run pipeline
            pipeline = ProcessingPipelineService(db)
            jobs = pipeline.process_all_pending()

            elapsed_ms = int((time.time() - start_time) * 1000)

            # 3. Log success
            log_entry = ProcessingLog(
                filename=filepath.name,
                filepath=str(filepath),
                operation="SCREENSHOT_AUTO_PROCESSED",
                success=True,
                duration_ms=elapsed_ms,
                error_message=None,
            )
            db.add(log_entry)
            db.commit()

            # 4. Broadcast WebSocket notification
            manager.broadcast("SCREENSHOT_IMPORTED", {
                "filename": filepath.name,
                "scanned_summary": scan_res.to_dict() if hasattr(scan_res, "to_dict") else str(scan_res),
                "processed_jobs": len(jobs),
            })

        except Exception as e:
            db.rollback()
            elapsed_ms = int((time.time() - start_time) * 1000)
            logger.exception(f"[Watcher Error] Failed processing screenshot {filepath.name}: {e}")

            log_entry = ProcessingLog(
                filename=filepath.name,
                filepath=str(filepath),
                operation="SCREENSHOT_AUTO_PROCESSED",
                success=False,
                duration_ms=elapsed_ms,
                error_message=str(e),
            )
            db.add(log_entry)
            db.commit()

            manager.broadcast("PROCESSING_FAILED", {
                "filename": filepath.name,
                "error": str(e),
            })
        finally:
            db.close()

class StatementFileHandler(FileSystemEventHandler):
    def on_created(self, event) -> None:
        if event.is_directory:
            return
        self._process_event(Path(event.src_path))

    def on_modified(self, event) -> None:
        if event.is_directory:
            return
        self._process_event(Path(event.src_path))

    def _process_event(self, filepath: Path) -> None:
        if filepath.name.startswith(".") or filepath.suffix.lower() not in SUPPORTED_STATEMENT_EXTS:
            return

        start_time = time.time()
        logger.info(f"[Watcher] New statement detected: {filepath.name}")

        if not FileStabilityChecker.is_file_stable(filepath):
            logger.warning(f"[Watcher] Statement file not stable, skipping: {filepath.name}")
            return

        db = SessionLocal()
        try:
            # 1. Import statement
            importer = StatementImporterService(db)
            import_res = importer.import_statements()

            # 2. Trigger auto-reconciliation across all unmatched transactions
            recon_engine = ReconciliationEngine()
            recon_matches = recon_engine.reconcile_all(db)

            elapsed_ms = int((time.time() - start_time) * 1000)

            # 3. Log success
            log_entry = ProcessingLog(
                filename=filepath.name,
                filepath=str(filepath),
                operation="STATEMENT_AUTO_PROCESSED",
                success=True,
                duration_ms=elapsed_ms,
                error_message=None,
            )
            db.add(log_entry)
            db.commit()

            # 4. Broadcast WebSocket notification
            manager.broadcast("STATEMENT_IMPORTED", {
                "filename": filepath.name,
                "new_imported": import_res.new_imported,
                "reconciled_matches": len(recon_matches),
            })

        except Exception as e:
            db.rollback()
            elapsed_ms = int((time.time() - start_time) * 1000)
            logger.exception(f"[Watcher Error] Failed processing statement {filepath.name}: {e}")

            log_entry = ProcessingLog(
                filename=filepath.name,
                filepath=str(filepath),
                operation="STATEMENT_AUTO_PROCESSED",
                success=False,
                duration_ms=elapsed_ms,
                error_message=str(e),
            )
            db.add(log_entry)
            db.commit()

            manager.broadcast("PROCESSING_FAILED", {
                "filename": filepath.name,
                "error": str(e),
            })
        finally:
            db.close()
