"""
Database Backup & Restore Service.

Provides automatic daily backups, manual backups, restore functionality,
and automatic pruning keeping only the 10 most recent backups.
"""
import shutil
import logging
import sqlite3
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Dict, Any

from app.config import DB_PATH, APP_DATA_DIR
from app.services.settings_service import settings_service

logger = logging.getLogger(__name__)

MAX_BACKUPS = 10


class BackupService:
    def get_backup_dir(self) -> Path:
        custom_dir = settings_service.get("backup_dir")
        if custom_dir:
            p = Path(custom_dir)
        else:
            p = Path(APP_DATA_DIR) / "backups"
        p.mkdir(parents=True, exist_ok=True)
        return p

    def create_backup(self, is_auto: bool = False) -> Dict[str, Any]:
        """Create a new database backup copy."""
        if not DB_PATH.exists():
            raise FileNotFoundError("Active database file does not exist.")

        backup_dir = self.get_backup_dir()
        prefix = "auto_backup" if is_auto else "manual_backup"
        timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"{prefix}_{timestamp_str}.db"
        target_path = backup_dir / filename

        # Safe copy using sqlite3 backup API if possible, or shutil
        try:
            src_conn = sqlite3.connect(str(DB_PATH))
            dst_conn = sqlite3.connect(str(target_path))
            with dst_conn:
                src_conn.backup(dst_conn)
            src_conn.close()
            dst_conn.close()
            logger.info(f"[BackupService] Database backup created via SQLite API: {target_path}")
        except Exception as e:
            logger.warning(f"[BackupService] SQLite backup fallback to file copy: {e}")
            shutil.copy2(DB_PATH, target_path)

        self.prune_old_backups()

        return {
            "filename": filename,
            "filepath": str(target_path),
            "size_bytes": target_path.stat().st_size if target_path.exists() else 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_auto": is_auto,
        }

    def prune_old_backups(self) -> int:
        """Keep only the 10 most recent backups and delete older ones."""
        backup_dir = self.get_backup_dir()
        backups = sorted(
            [f for f in backup_dir.glob("*.db") if f.is_file()],
            key=lambda x: x.stat().st_mtime,
            reverse=True
        )

        deleted_count = 0
        if len(backups) > MAX_BACKUPS:
            for old_backup in backups[MAX_BACKUPS:]:
                try:
                    old_backup.unlink()
                    deleted_count += 1
                    logger.info(f"[BackupService] Pruned old backup: {old_backup.name}")
                except Exception as e:
                    logger.error(f"[BackupService] Failed to prune backup {old_backup.name}: {e}")

        return deleted_count

    def list_backups(self) -> List[Dict[str, Any]]:
        """List available backups ordered from newest to oldest."""
        backup_dir = self.get_backup_dir()
        backups = sorted(
            [f for f in backup_dir.glob("*.db") if f.is_file()],
            key=lambda x: x.stat().st_mtime,
            reverse=True
        )

        result: List[Dict[str, Any]] = []
        for b in backups:
            stat = b.stat()
            result.append({
                "filename": b.name,
                "filepath": str(b),
                "size_bytes": stat.st_size,
                "created_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                "is_auto": b.name.startswith("auto_backup"),
            })
        return result

    def restore_backup(self, filename: str) -> Dict[str, Any]:
        """Restore active database from specified backup file."""
        backup_dir = self.get_backup_dir()
        backup_path = backup_dir / filename

        if not backup_path.exists():
            raise FileNotFoundError(f"Backup file '{filename}' not found.")

        # Validate backup file integrity with sqlite3
        try:
            conn = sqlite3.connect(str(backup_path))
            cursor = conn.cursor()
            cursor.execute("PRAGMA quick_check")
            check_result = cursor.fetchone()
            conn.close()
            if not check_result or check_result[0] != "ok":
                raise ValueError("Backup file integrity check failed.")
        except Exception as e:
            raise ValueError(f"Corrupt backup file: {e}")

        # Create safety backup of current DB before restoring
        try:
            self.create_backup(is_auto=True)
        except Exception:
            pass

        # Perform restore
        shutil.copy2(backup_path, DB_PATH)
        logger.info(f"[BackupService] Database restored from backup: {filename}")

        return {
            "restored_filename": filename,
            "restored_at": datetime.now(timezone.utc).isoformat(),
            "status": "success",
        }

    def check_daily_auto_backup(self) -> None:
        """Run daily auto backup if no auto backup exists for today."""
        backups = self.list_backups()
        today_str = datetime.now(timezone.utc).strftime("%Y%m%d")

        has_today = any(
            b["is_auto"] and today_str in b["filename"]
            for b in backups
        )

        if not has_today:
            logger.info("[BackupService] Triggering daily automatic database backup...")
            try:
                self.create_backup(is_auto=True)
            except Exception as e:
                logger.error(f"[BackupService] Daily auto backup failed: {e}")


backup_service = BackupService()
