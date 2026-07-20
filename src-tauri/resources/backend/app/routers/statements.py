from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app.models import StatementFile, StatementTransaction
from app.services.statements.importer import StatementImporterService

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
