import hashlib
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.config import settings
from app.database import get_db, SessionLocal
from app.models import StatementFile, StatementTransaction
from app.services.statements.importer import StatementImporterService
from app.services.statements.csv_parser import CSVStatementParser
from app.services.statements.xlsx_parser import XLSXStatementParser

router = APIRouter(prefix="/api/statements", tags=["bank-statements"])

class StatementFileSchema(BaseModel):
    id: int
    filename: str
    filepath: str
    file_hash: str
    extension: str
    imported_at: str
    status: str
    total_transactions: int
    processing_time_ms: int
    created_at: str

class StatementFileListResponse(BaseModel):
    total: int
    items: List[StatementFileSchema]

class StatementTransactionSchema(BaseModel):
    id: int
    statement_file_id: int
    transaction_date: Optional[str] = None
    value_date: Optional[str] = None
    description: Optional[str] = None
    reference_number: Optional[str] = None
    utr_number: Optional[str] = None
    transaction_id: Optional[str] = None
    debit: Optional[float] = None
    credit: Optional[float] = None
    amount: Optional[float] = None
    balance: Optional[float] = None
    currency: str
    bank_name: Optional[str] = None
    raw_row_json: str
    created_at: str

class StatementTransactionsPaginatedResponse(BaseModel):
    total: int
    page: int
    page_size: int
    total_pages: int
    transactions: List[StatementTransactionSchema]

def format_file(f: StatementFile) -> Dict[str, Any]:
    return {
        "id": f.id,
        "filename": f.filename,
        "filepath": f.filepath,
        "file_hash": f.file_hash,
        "extension": f.extension,
        "imported_at": f.imported_at.isoformat() if f.imported_at else "",
        "status": f.status,
        "total_transactions": f.total_transactions,
        "processing_time_ms": f.processing_time_ms,
        "created_at": f.created_at.isoformat() if f.created_at else "",
    }

def format_tx(tx: StatementTransaction) -> Dict[str, Any]:
    return {
        "id": tx.id,
        "statement_file_id": tx.statement_file_id,
        "transaction_date": tx.transaction_date,
        "value_date": tx.value_date,
        "description": tx.description,
        "reference_number": tx.reference_number,
        "utr_number": tx.utr_number,
        "transaction_id": tx.transaction_id,
        "debit": tx.debit,
        "credit": tx.credit,
        "amount": tx.amount,
        "balance": tx.balance,
        "currency": tx.currency or "INR",
        "bank_name": tx.bank_name,
        "raw_row_json": tx.raw_row_json or "{}",
        "created_at": tx.created_at.isoformat() if tx.created_at else "",
    }

@router.post("/import")
def import_bank_statements(db: Session = Depends(get_db)):
    importer = StatementImporterService(db)
    result = importer.import_statements()
    return {
        "total_scanned": result.total_scanned,
        "new_imported": result.new_imported,
        "skipped_duplicates": result.skipped_duplicates,
        "unsupported_ignored": result.unsupported_ignored,
        "failed_errors": result.failed_errors,
        "details": result.details
    }

@router.get("", response_model=StatementFileListResponse)
def list_statement_files(db: Session = Depends(get_db)):
    files = db.query(StatementFile).order_by(StatementFile.imported_at.desc()).all()
    return StatementFileListResponse(
        total=len(files),
        items=[format_file(f) for f in files]
    )

@router.get("/{id}", response_model=StatementFileSchema)
def get_statement_file(id: int, db: Session = Depends(get_db)):
    file_record = db.query(StatementFile).filter(StatementFile.id == id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail=f"Statement file ID {id} not found.")
    return format_file(file_record)

@router.get("/{id}/transactions", response_model=StatementTransactionsPaginatedResponse)
def list_statement_transactions(
    id: int,
    search: Optional[str] = Query(None, description="Search description, reference, or UTR"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db)
):
    query = db.query(StatementTransaction).filter(StatementTransaction.statement_file_id == id)

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                StatementTransaction.description.ilike(term),
                StatementTransaction.reference_number.ilike(term),
                StatementTransaction.utr_number.ilike(term),
                StatementTransaction.transaction_id.ilike(term),
                StatementTransaction.transaction_date.ilike(term),
            )
        )

    total_count = query.count()
    total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 1

    txs = (
        query.order_by(StatementTransaction.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return StatementTransactionsPaginatedResponse(
        total=total_count,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        transactions=[format_tx(tx) for tx in txs]
    )

# --- Duplicate Check and Upload Schemas ---
class StatementFileInfo(BaseModel):
    filename: str
    size: int
    hash: str

class CheckStatementDuplicatesRequest(BaseModel):
    files: List[StatementFileInfo]

class ExistingStatementFileInfo(BaseModel):
    hash: str
    statement_file_id: int
    imported_at: str

class MissingStatementFileInfo(BaseModel):
    filename: str
    hash: str

class InvalidStatementFileInfo(BaseModel):
    filename: str
    hash: str
    reason: str

class StatementDuplicateCheckSummary(BaseModel):
    total_checked: int
    existing_count: int
    missing_count: int
    invalid_count: int

class CheckStatementDuplicatesResponse(BaseModel):
    summary: StatementDuplicateCheckSummary
    existing: List[ExistingStatementFileInfo]
    missing: List[MissingStatementFileInfo]
    invalid: List[InvalidStatementFileInfo]

class BatchStatementUploadDetail(BaseModel):
    id: Optional[int] = None
    filename: str
    status: str
    hash: str
    new_transactions: int
    reason: Optional[str] = None

class BatchStatementUploadResponse(BaseModel):
    processed_files: int
    details: List[BatchStatementUploadDetail]
# ------------------------------------------

@router.post("/check-duplicates", response_model=CheckStatementDuplicatesResponse)
def check_statement_duplicates(request: CheckStatementDuplicatesRequest, db: Session = Depends(get_db)):
    existing = []
    missing = []
    invalid = []
    
    hashes_to_check = [f.hash for f in request.files if f.hash]
    
    existing_files = db.query(StatementFile).filter(StatementFile.file_hash.in_(hashes_to_check)).all()
    existing_map = {f.file_hash: f for f in existing_files}
    
    for f in request.files:
        if not f.hash or len(f.hash) != 64:
            invalid.append(InvalidStatementFileInfo(
                filename=f.filename,
                hash=f.hash or "",
                reason="Invalid or missing SHA-256 hash"
            ))
            continue
            
        if f.size <= 0:
            invalid.append(InvalidStatementFileInfo(
                filename=f.filename,
                hash=f.hash,
                reason="Empty file (size is 0)"
            ))
            continue
            
        if f.hash in existing_map:
            sf = existing_map[f.hash]
            existing.append(ExistingStatementFileInfo(
                hash=sf.file_hash,
                statement_file_id=sf.id,
                imported_at=sf.imported_at.isoformat()
            ))
        else:
            missing.append(MissingStatementFileInfo(
                filename=f.filename,
                hash=f.hash
            ))
            
    summary = StatementDuplicateCheckSummary(
        total_checked=len(request.files),
        existing_count=len(existing),
        missing_count=len(missing),
        invalid_count=len(invalid)
    )
    
    return CheckStatementDuplicatesResponse(
        summary=summary,
        existing=existing,
        missing=missing,
        invalid=invalid
    )

def run_statements_reconciliation():
    from app.services.reconciliation.engine import ReconciliationEngine
    import logging
    logger = logging.getLogger(__name__)
    logger.info("[Background Task] Starting Statement Reconciliation...")
    db = SessionLocal()
    try:
        recon_engine = ReconciliationEngine()
        recon_engine.reconcile_all(db)
        logger.info("[Background Task] Statement Reconciliation completed.")
    except Exception as e:
        logger.error(f"[Background Task] Statement Reconciliation failed: {e}", exc_info=True)
    finally:
        db.close()

@router.post("/batch-upload", response_model=BatchStatementUploadResponse)
async def batch_upload_statements(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    details = []
    processed_files = 0
    statements_added = []
    
    settings.STATEMENTS_DIR.mkdir(parents=True, exist_ok=True)
    
    for file in files:
        start_time = time.time()
        try:
            contents = await file.read()
            file_hash = hashlib.sha256(contents).hexdigest()
            
            # Check duplicate in db
            existing = db.query(StatementFile).filter(StatementFile.file_hash == file_hash).first()
            if existing:
                details.append(BatchStatementUploadDetail(
                    id=existing.id,
                    filename=file.filename,
                    status="SKIPPED_DUPLICATE",
                    hash=file_hash,
                    new_transactions=0,
                    reason="Statement file hash already imported"
                ))
                continue
                
            # Save file to disk
            ext = Path(file.filename).suffix.lower()
            if ext not in {".csv", ".xlsx", ".xls"}:
                details.append(BatchStatementUploadDetail(
                    filename=file.filename,
                    status="FAILED",
                    hash=file_hash,
                    new_transactions=0,
                    reason=f"Unsupported file extension '{ext}'"
                ))
                continue
                
            unique_filename = f"{file_hash[:16]}_{Path(file.filename).name}"
            saved_path = settings.STATEMENTS_DIR / unique_filename
            
            with open(saved_path, "wb") as f:
                f.write(contents)
                
            # Parse transactions
            try:
                if ext == ".csv":
                    parser = CSVStatementParser(str(saved_path.resolve()))
                    transactions_data = parser.parse()
                else:
                    parser = XLSXStatementParser(str(saved_path.resolve()))
                    transactions_data = parser.parse()
            except Exception as parse_err:
                if saved_path.exists():
                    saved_path.unlink()
                details.append(BatchStatementUploadDetail(
                    filename=file.filename,
                    status="FAILED",
                    hash=file_hash,
                    new_transactions=0,
                    reason=f"Parse error: {str(parse_err)}"
                ))
                continue
                
            elapsed_ms = int((time.time() - start_time) * 1000)
            
            # Create DB entry for file
            statement_file = StatementFile(
                filename=file.filename,
                filepath=str(saved_path.resolve()),
                file_hash=file_hash,
                extension=ext,
                imported_at=datetime.now(timezone.utc),
                status="PROCESSED",
                total_transactions=len(transactions_data),
                processing_time_ms=elapsed_ms,
                created_at=datetime.now(timezone.utc)
            )
            db.add(statement_file)
            db.flush()  # Gets statement_file.id without committing transaction
            
            # Bulk save transactions
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
                db.bulk_save_objects(db_txs)
                
            detail = BatchStatementUploadDetail(
                filename=file.filename,
                status="IMPORTED",
                hash=file_hash,
                new_transactions=len(transactions_data)
            )
            details.append(detail)
            statements_added.append((statement_file, detail))
            processed_files += 1
            
        except Exception as e:
            details.append(BatchStatementUploadDetail(
                filename=file.filename,
                status="FAILED",
                hash="",
                new_transactions=0,
                reason=f"Upload error: {str(e)}"
            ))
            
    if statements_added:
        try:
            db.commit()
            for statement_file, d in statements_added:
                db.refresh(statement_file)
                d.id = statement_file.id
                
            background_tasks.add_task(run_statements_reconciliation)
        except Exception as db_err:
            db.rollback()
            # Clean up files on commit failure
            for statement_file, d in statements_added:
                try:
                    p = Path(statement_file.filepath)
                    if p.exists():
                        p.unlink()
                except Exception:
                    pass
                d.status = "FAILED"
                d.reason = f"Database commit failed: {str(db_err)}"
            processed_files = 0
            
    return BatchStatementUploadResponse(
        processed_files=processed_files,
        details=details
    )
