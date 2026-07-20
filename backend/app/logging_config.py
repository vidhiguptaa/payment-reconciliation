"""
Structured Rotating Logging & Global Exception Handler.

Configures log rotation for:
- backend.log
- ocr.log
- watcher.log
- reconciliation.log
- errors.log

Includes uncaught exception handling generating crash-report.txt.
"""
import sys
import os
import platform
import logging
from logging.handlers import RotatingFileHandler
from datetime import datetime, timezone
from pathlib import Path

from app.config import APP_DATA_DIR, settings

LOGS_DIR = Path(APP_DATA_DIR) / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)

CRASH_REPORT_PATH = Path(APP_DATA_DIR) / "crash-report.txt"

LOG_FORMAT = logging.Formatter(
    "%(asctime)s [%(levelname)s] %(name)s (%(filename)s:%(lineno)d): %(message)s"
)


def create_rotating_handler(filename: str, level: int = logging.INFO) -> RotatingFileHandler:
    path = LOGS_DIR / filename
    handler = RotatingFileHandler(
        filename=str(path),
        maxBytes=5 * 1024 * 1024,  # 5 MB
        backupCount=3,
        encoding="utf-8"
    )
    handler.setLevel(level)
    handler.setFormatter(LOG_FORMAT)
    return handler


def setup_logging() -> None:
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    # Console Handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(LOG_FORMAT)
    root_logger.addHandler(console_handler)

    # Main backend log
    backend_handler = create_rotating_handler("backend.log", logging.INFO)
    root_logger.addHandler(backend_handler)

    # Global Errors Log
    errors_handler = create_rotating_handler("errors.log", logging.WARNING)
    root_logger.addHandler(errors_handler)

    # Module-specific loggers
    ocr_logger = logging.getLogger("app.services.ocr")
    ocr_logger.addHandler(create_rotating_handler("ocr.log", logging.INFO))

    watcher_logger = logging.getLogger("app.services.watcher")
    watcher_logger.addHandler(create_rotating_handler("watcher.log", logging.INFO))

    reconciliation_logger = logging.getLogger("app.services.reconciliation")
    reconciliation_logger.addHandler(create_rotating_handler("reconciliation.log", logging.INFO))

    logger = logging.getLogger(__name__)
    logger.info(f"[Logging] Configured rotating logs at: {LOGS_DIR}")


def write_crash_report(exc_type: type, exc_value: BaseException, exc_traceback: any) -> None:
    """Generate structured crash-report.txt on uncaught exceptions."""
    import traceback
    timestamp = datetime.now(timezone.utc).isoformat()
    tb_str = "".join(traceback.format_exception(exc_type, exc_value, exc_traceback))

    report_content = f"""==============================================================================
CRASH REPORT - {settings.APP_NAME}
==============================================================================
Timestamp: {timestamp}
Application Version: {settings.APP_VERSION}
Environment: {settings.APP_ENV}
Operating System: {platform.system()} {platform.release()} ({sys.platform})
Platform Detail: {platform.platform()}
Python Version: {platform.python_version()}
Process ID: {os.getpid()}
Database URL: {settings.DATABASE_URL}
==============================================================================
EXCEPTION DETAILS:
Exception Type: {exc_type.__name__}
Exception Message: {str(exc_value)}

STACK TRACE:
{tb_str}
==============================================================================
"""
    try:
        with open(CRASH_REPORT_PATH, "w", encoding="utf-8") as f:
            f.write(report_content)
        logging.critical(f"[CrashReporter] Uncaught exception written to {CRASH_REPORT_PATH}")
    except Exception as e:
        logging.critical(f"[CrashReporter Error] Could not write crash report: {e}")


def uncaught_exception_handler(exc_type: type, exc_value: BaseException, exc_traceback: any) -> None:
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
        return

    logging.critical("Uncaught Exception encountered", exc_info=(exc_type, exc_value, exc_traceback))
    write_crash_report(exc_type, exc_value, exc_traceback)


sys.excepthook = uncaught_exception_handler
