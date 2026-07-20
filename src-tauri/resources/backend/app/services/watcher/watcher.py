import logging
from pathlib import Path
from typing import Optional
from watchdog.observers import Observer

from app.services.watcher.file_events import ScreenshotFileHandler, StatementFileHandler

logger = logging.getLogger(__name__)


class BackgroundWatcherService:
    def __init__(self) -> None:
        self.observer: Optional[Observer] = None
        self._screenshots_dir: Optional[str] = None
        self._statements_dir: Optional[str] = None

    def start(self, screenshots_dir: Optional[str] = None, statements_dir: Optional[str] = None) -> None:
        # Resolve paths from settings_service at startup
        if screenshots_dir is None or statements_dir is None:
            from app.services.settings_service import settings_service
            s = settings_service.get_all()
            screenshots_dir = screenshots_dir or s["screenshots_dir"]
            statements_dir = statements_dir or s["statements_dir"]

        self._screenshots_dir = screenshots_dir
        self._statements_dir = statements_dir

        if self.observer and self.observer.is_alive():
            logger.info("Background watcher is already running.")
            return

        sc_path = Path(self._screenshots_dir)
        st_path = Path(self._statements_dir)
        sc_path.mkdir(parents=True, exist_ok=True)
        st_path.mkdir(parents=True, exist_ok=True)

        self.observer = Observer()

        screenshot_handler = ScreenshotFileHandler()
        self.observer.schedule(screenshot_handler, str(sc_path), recursive=False)

        statement_handler = StatementFileHandler()
        self.observer.schedule(statement_handler, str(st_path), recursive=False)

        self.observer.start()
        logger.info(f"[Background Watcher] Started monitoring:\n - {sc_path}\n - {st_path}")

    def stop(self) -> None:
        if self.observer and self.observer.is_alive():
            self.observer.stop()
            self.observer.join()
            self.observer = None
            logger.info("[Background Watcher] Stopped monitoring directories.")

    def restart(self, screenshots_dir: Optional[str] = None, statements_dir: Optional[str] = None) -> None:
        logger.info("[Background Watcher] Restarting watcher with updated directories...")
        self.stop()
        self.start(screenshots_dir=screenshots_dir, statements_dir=statements_dir)

    def is_running(self) -> bool:
        return self.observer is not None and self.observer.is_alive()


watcher_service = BackgroundWatcherService()
