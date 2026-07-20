import json
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    TransactionMatch,
    ExtractedTransaction,
    StatementTransaction,
    MatchStatus,
    MatchType,
)
from app.services.reconciliation.engine import ReconciliationEngine
from app.services.reconciliation.explanation import ExplanationGenerator

router = APIRouter(prefix="/api/reconciliation", tags=["reconciliation"])

class ManualMatchPayload(BaseModel):
    statement_transaction_id: int

class TransactionMatchSchema(BaseModel):
    id: int
    extracted_transaction_id: int
    statement_transaction_id: Optional[int] = None
    match_status: str
    match_type: str
    confidence_score: float
    match_reason_json: str
    field_scores_json: str
    created_at: str
    updated_at: str

class MatchListResponse(BaseModel):
    total: int
    matched_count: int
    possible_count: int
    needs_review_count: int
    unmatched_count: int
    items: List[Dict[str, Any]]

class ReconciliationDetailResponse(BaseModel):
    match: Dict[str, Any]
    extracted_transaction: Dict[str, Any]
    statement_transaction: Optional[Dict[str, Any]] = None
    screenshot_image_url: str
    field_comparison: Dict[str, Dict[str, Any]]

def format_match(m: TransactionMatch) -> Dict[str, Any]:
    return {
        "id": m.id,
        "extracted_transaction_id": m.extracted_transaction_id,
        "statement_transaction_id": m.statement_transaction_id,
        "match_status": m.match_status,
        "match_type": m.match_type,
        "confidence_score": m.confidence_score,
        "match_reason_json": m.match_reason_json or "[]",
        "field_scores_json": m.field_scores_json or "{}",
        "created_at": m.created_at.isoformat() if m.created_at else "",
        "updated_at": m.updated_at.isoformat() if m.updated_at else "",
    }

def format_extracted(ext: ExtractedTransaction) -> Dict[str, Any]:
    return {
        "id": ext.id,
        "screenshot_id": ext.screenshot_id,
        "amount": ext.amount,
        "currency": ext.currency,
        "transaction_date": ext.transaction_date,
        "transaction_time": ext.transaction_time,
        "reference_number": ext.reference_number,
        "utr_number": ext.utr_number,
        "transaction_id": ext.transaction_id,
        "sender_name": ext.sender_name,
        "receiver_name": ext.receiver_name,
        "bank_name": ext.bank_name,
        "ifsc": ext.ifsc,
        "transaction_type": ext.transaction_type,
    }

def format_stmt(stmt: StatementTransaction) -> Dict[str, Any]:
    return {
        "id": stmt.id,
        "statement_file_id": stmt.statement_file_id,
        "transaction_date": stmt.transaction_date,
        "value_date": stmt.value_date,
        "description": stmt.description,
        "reference_number": stmt.reference_number,
        "utr_number": stmt.utr_number,
        "debit": stmt.debit,
        "credit": stmt.credit,
        "amount": stmt.amount,
        "balance": stmt.balance,
        "bank_name": stmt.bank_name,
    }

@router.post("/run")
def run_batch_reconciliation(db: Session = Depends(get_db)):
    engine = ReconciliationEngine()
    results = engine.reconcile_all(db)
    return {
        "total_processed": len(results),
        "results": [format_match(r) for r in results]
    }

@router.post("/run/{extracted_transaction_id}")
def run_single_reconciliation(extracted_transaction_id: int, db: Session = Depends(get_db)):
    engine = ReconciliationEngine()
    res = engine.reconcile_transaction(extracted_transaction_id, db)
    if not res:
        raise HTTPException(status_code=404, detail=f"Extracted transaction ID {extracted_transaction_id} not found.")
    return format_match(res)

@router.get("", response_model=MatchListResponse)
def list_reconciliation_matches(
    match_status: Optional[str] = Query(None, description="Filter by Match status"),
    db: Session = Depends(get_db)
):
    query = db.query(TransactionMatch)
    if match_status and match_status.strip():
        query = query.filter(TransactionMatch.match_status == match_status.strip())

    matches = query.order_by(TransactionMatch.updated_at.desc()).all()

    # Calculate count stats across all matches in DB
    all_matches = db.query(TransactionMatch).all()
    matched_c = sum(1 for m in all_matches if m.match_status == MatchStatus.MATCHED.value)
    possible_c = sum(1 for m in all_matches if m.match_status == MatchStatus.POSSIBLE_MATCH.value)
    needs_review_c = sum(1 for m in all_matches if m.match_status == MatchStatus.NEEDS_REVIEW.value)
    unmatched_c = sum(1 for m in all_matches if m.match_status == MatchStatus.UNMATCHED.value)

    items = []
    for m in matches:
        match_dict = format_match(m)
        ext = db.query(ExtractedTransaction).filter(ExtractedTransaction.id == m.extracted_transaction_id).first()
        stmt = db.query(StatementTransaction).filter(StatementTransaction.id == m.statement_transaction_id).first() if m.statement_transaction_id else None
        
        match_dict["extracted_transaction"] = format_extracted(ext) if ext else None
        match_dict["statement_transaction"] = format_stmt(stmt) if stmt else None
        match_dict["screenshot_id"] = ext.screenshot_id if ext else None
        match_dict["screenshot_filename"] = ext.screenshot.filename if ext and ext.screenshot else ""
        items.append(match_dict)

    return MatchListResponse(
        total=len(all_matches),
        matched_count=matched_c,
        possible_count=possible_c,
        needs_review_count=needs_review_c,
        unmatched_count=unmatched_c,
        items=items
    )

@router.get("/{id}", response_model=ReconciliationDetailResponse)
def get_reconciliation_detail(id: int, db: Session = Depends(get_db)):
    match_record = db.query(TransactionMatch).filter(TransactionMatch.id == id).first()
    if not match_record:
        raise HTTPException(status_code=404, detail=f"Reconciliation match ID {id} not found.")

    ext = db.query(ExtractedTransaction).filter(ExtractedTransaction.id == match_record.extracted_transaction_id).first()
    if not ext:
        raise HTTPException(status_code=404, detail="Extracted transaction record missing.")

    stmt = db.query(StatementTransaction).filter(StatementTransaction.id == match_record.statement_transaction_id).first() if match_record.statement_transaction_id else None

    comparison = ExplanationGenerator.get_field_comparison(ext, stmt)
    image_url = f"/api/screenshots/{ext.screenshot_id}/file" if ext.screenshot_id else ""

    return ReconciliationDetailResponse(
        match=format_match(match_record),
        extracted_transaction=format_extracted(ext),
        statement_transaction=format_stmt(stmt) if stmt else None,
        screenshot_image_url=image_url,
        field_comparison=comparison
    )

@router.post("/{id}/manual-match")
def manual_match_transaction(
    id: int,
    payload: ManualMatchPayload,
    db: Session = Depends(get_db)
):
    match_record = db.query(TransactionMatch).filter(TransactionMatch.id == id).first()
    if not match_record:
        raise HTTPException(status_code=404, detail=f"Reconciliation match ID {id} not found.")

    stmt = db.query(StatementTransaction).filter(StatementTransaction.id == payload.statement_transaction_id).first()
    if not stmt:
        raise HTTPException(status_code=404, detail=f"Statement transaction ID {payload.statement_transaction_id} not found.")

    ext = db.query(ExtractedTransaction).filter(ExtractedTransaction.id == match_record.extracted_transaction_id).first()

    match_record.statement_transaction_id = stmt.id
    match_record.match_status = MatchStatus.MATCHED.value
    match_record.match_type = MatchType.MANUALLY_MATCHED.value
    match_record.confidence_score = 100.0
    match_record.match_reason_json = json.dumps(["Manually matched by user"], ensure_ascii=False)
    
    if ext:
        comparison = ExplanationGenerator.get_field_comparison(ext, stmt)
        scores = {k: 100.0 if v["status"] == "MATCH" else 50.0 for k, v in comparison.items() if v["status"] != "NOT AVAILABLE"}
        match_record.field_scores_json = json.dumps(scores, ensure_ascii=False)

    match_record.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(match_record)

    return format_match(match_record)

@router.post("/{id}/reject")
def reject_match_candidate(id: int, db: Session = Depends(get_db)):
    match_record = db.query(TransactionMatch).filter(TransactionMatch.id == id).first()
    if not match_record:
        raise HTTPException(status_code=404, detail=f"Reconciliation match ID {id} not found.")

    match_record.statement_transaction_id = None
    match_record.match_status = MatchStatus.UNMATCHED.value
    match_record.match_type = MatchType.MANUALLY_MATCHED.value
    match_record.confidence_score = 0.0
    match_record.match_reason_json = json.dumps(["Rejected by user (Marked Unmatched)"], ensure_ascii=False)
    match_record.field_scores_json = json.dumps({}, ensure_ascii=False)
    match_record.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(match_record)

    return format_match(match_record)
