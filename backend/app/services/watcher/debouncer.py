import time
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

class FileStabilityChecker:
    @staticmethod
    def is_file_stable(
        filepath: Path,
        timeout_sec: float = 10.0,
        check_interval_sec: float = 0.5
    ) -> bool:
        """
        Polls a newly created file until its size and modification timestamp remain unchanged
        for consecutive checks, ensuring file copy / save is complete.
        """
        if not filepath.exists():
            return False

        start_time = time.time()
        last_size = -1
        last_mtime = -1.0

        while (time.time() - start_time) < timeout_sec:
            try:
                if not filepath.exists():
                    return False

                stat = filepath.stat()
                current_size = stat.st_size
                current_mtime = stat.st_mtime

                # File must not be empty
                if current_size > 0 and current_size == last_size and current_mtime == last_mtime:
                    logger.info(f"File stability confirmed for {filepath.name} ({current_size} bytes)")
                    return True

                last_size = current_size
                last_mtime = current_mtime
            except OSError as e:
                logger.warning(f"File stat error while waiting for stability on {filepath.name}: {e}")

            time.sleep(check_interval_sec)

        logger.warning(f"File stability timeout reached ({timeout_sec}s) for {filepath.name}")
        return filepath.exists() and filepath.stat().st_size > 0
