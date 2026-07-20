import hashlib
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any
from sqlalchemy.orm import Session

from app.config import settings
from app.models import StatementFile, StatementTransaction
from app.services.statements.csv_parser import CSVStatementParser
from app.services.statements.xlsx_parser import XLSXStatementParser

@dataclass
class StatementImportResult:
    total_scanned: int
    new_imported: int
    skipped_duplicates: int
    unsupported_ignored: int
    failed_errors: int
    details: List[Dict[str, Any]]

class StatementImporterService:
    SUPPORTED_EXTENSIONS = {".csv", ".xlsx", ".xls"}

    def __init__(self, db: Session, target_dir: str = settings.STATEMENTS_DIR) -> None:
        self.db = db
        self.target_dir = Path(target_dir)

    def compute_sha256(self, filepath: Path) -> str:
        sha256 = hashlib.sha256()
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    def import_statements(self) -> StatementImportResult:
        if not self.target_dir.exists():
            self.target_dir.mkdir(parents=True, exist_ok=True)

        files = [f for f in self.target_dir.iterdir() if f.is_file() and not f.name.startswith(".")]

        total_scanned = len(files)
        new_imported = 0
        skipped_duplicates = 0
        unsupported_ignored = 0
        failed_errors = 0
        details: List[Dict[str, Any]] = []

        for file_path in files:
            ext = file_path.suffix.lower()
            if ext not in self.SUPPORTED_EXTENSIONS:
                unsupported_ignored += 1
                details.append({
                    "filename": file_path.name,
                    "status": "IGNORED",
                    "reason": f"Unsupported file extension '{ext}'"
                })
                continue

            file_hash = self.compute_sha256(file_path)

            existing_file = self.db.query(StatementFile).filter(StatementFile.file_hash == file_hash).first()
            if existing_file:
                skipped_duplicates += 1
                details.append({
                    "id": existing_file.id,
                    "filename": file_path.name,
                    "status": "SKIPPED_DUPLICATE",
                    "file_hash": file_hash,
                    "reason": "Statement file hash already imported."
                })
                continue

            start_time = time.time()
            try:
                if ext == ".csv":
                    parser = CSVStatementParser(str(file_path))
                    transactions_data = parser.parse()
                elif ext in (".xlsx", ".xls"):
                    parser = XLSXStatementParser(str(file_path))
                    transactions_data = parser.parse()
                else:
                    transactions_data = []

                elapsed_ms = int((time.time() - start_time) * 1000)

                statement_file = StatementFile(
                    filename=file_path.name,
                    filepath=str(file_path),
                    file_hash=file_hash,
                    extension=ext,
                    imported_at=datetime.now(timezone.utc),
                    status="PROCESSED",
                    total_transactions=len(transactions_data),
                    processing_time_ms=elapsed_ms,
                    created_at=datetime.now(timezone.utc)
                )
                self.db.add(statement_file)
                self.db.commit()
                self.db.refresh(statement_file)

                db_txs = [
                    StatementTransaction(
                        statement_file_id=statement_file.id,
                        transaction_date=tx["transaction_date"],
                        value_date=tx["value_date"],
                        description=tx["description"],
                        reference_number=tx["reference_number"],
                        utr_number=tx["utr_number"],
                        transaction_id=tx["transaction_id"],
                        debit=tx["debit"],
                        credit=tx["credit"],
                        amount=tx["amount"],
                        balance=tx["balance"],
                        currency=tx["currency"],
                        bank_name=tx["bank_name"],
                        raw_row_json=tx["raw_row_json"],
                        created_at=datetime.now(timezone.utc)
                    )
                    for tx in transactions_data
                ]
                if db_txs:
                    self.db.bulk_save_objects(db_txs)
                    self.db.commit()

                new_imported += 1
                details.append({
                    "id": statement_file.id,
                    "filename": file_path.name,
                    "status": "IMPORTED",
                    "file_hash": file_hash,
                    "total_transactions": len(transactions_data),
                    "processing_time_ms": elapsed_ms
                })

            except Exception as e:
                self.db.rollback()
                failed_errors += 1
                elapsed_ms = int((time.time() - start_time) * 1000)

                failed_file = StatementFile(
                    filename=file_path.name,
                    filepath=str(file_path),
                    file_hash=file_hash,
                    extension=ext,
                    imported_at=datetime.now(timezone.utc),
                    status="FAILED",
                    total_transactions=0,
                    processing_time_ms=elapsed_ms,
                    created_at=datetime.now(timezone.utc)
                )
                self.db.add(failed_file)
                self.db.commit()

                details.append({
                    "filename": file_path.name,
                    "status": "FAILED",
                    "file_hash": file_hash,
                    "reason": f"Import error: {str(e)}"
                })

        return StatementImportResult(
            total_scanned=total_scanned,
            new_imported=new_imported,
            skipped_duplicates=skipped_duplicates,
            unsupported_ignored=unsupported_ignored,
            failed_errors=failed_errors,
            details=details
        )
