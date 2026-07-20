from datetime import datetime, timezone
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Screenshot, OCRResult, ExtractedTransaction
from app.services.extraction.extractor import TransactionExtractor

router = APIRouter(prefix="/api/extraction", tags=["extraction"])

class ExtractedTransactionSchema(BaseModel):
    id: int
    ocr_result_id: Optional[int] = None
    screenshot_id: int
    amount: Optional[float] = None
    currency: str
    transaction_date: Optional[str] = None
    transaction_time: Optional[str] = None
    reference_number: Optional[str] = None
    utr_number: Optional[str] = None
    transaction_id: Optional[str] = None
    sender_name: Optional[str] = None
    receiver_name: Optional[str] = None
    sender_account: Optional[str] = None
    receiver_account: Optional[str] = None
    bank_name: Optional[str] = None
    ifsc: Optional[str] = None
    transaction_type: Optional[str] = None
    payment_status: str
    remarks: Optional[str] = None
    raw_ai_json: str
    confidence: float
    is_manually_edited: bool
    created_at: str
    updated_at: str

class ExtractedTransactionUpdateSchema(BaseModel):
    amount: Optional[float] = None
    currency: Optional[str] = None
    transaction_date: Optional[str] = None
    transaction_time: Optional[str] = None
    reference_number: Optional[str] = None
    utr_number: Optional[str] = None
    transaction_id: Optional[str] = None
    sender_name: Optional[str] = None
    receiver_name: Optional[str] = None
    sender_account: Optional[str] = None
    receiver_account: Optional[str] = None
    bank_name: Optional[str] = None
    ifsc: Optional[str] = None
    transaction_type: Optional[str] = None
    payment_status: Optional[str] = None
    remarks: Optional[str] = None

def format_extracted(tx: ExtractedTransaction) -> Dict[str, Any]:
    return {
        "id": tx.id,
        "ocr_result_id": tx.ocr_result_id,
        "screenshot_id": tx.screenshot_id,
        "amount": tx.amount,
        "currency": tx.currency or "INR",
        "transaction_date": tx.transaction_date,
        "transaction_time": tx.transaction_time,
        "reference_number": tx.reference_number,
        "utr_number": tx.utr_number,
        "transaction_id": tx.transaction_id,
        "sender_name": tx.sender_name,
        "receiver_name": tx.receiver_name,
        "sender_account": tx.sender_account,
        "receiver_account": tx.receiver_account,
        "bank_name": tx.bank_name,
        "ifsc": tx.ifsc,
        "transaction_type": tx.transaction_type,
        "payment_status": tx.payment_status or "SUCCESS",
        "remarks": tx.remarks,
        "raw_ai_json": tx.raw_ai_json or "{}",
        "confidence": tx.confidence,
        "is_manually_edited": tx.is_manually_edited,
        "created_at": tx.created_at.isoformat() if tx.created_at else "",
        "updated_at": tx.updated_at.isoformat() if tx.updated_at else "",
    }

@router.get("/{screenshot_id}", response_model=ExtractedTransactionSchema)
def get_extracted_transaction(screenshot_id: int, db: Session = Depends(get_db)):
    tx = (
        db.query(ExtractedTransaction)
        .filter(ExtractedTransaction.screenshot_id == screenshot_id)
        .order_by(ExtractedTransaction.id.desc())
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail=f"No extracted transaction found for screenshot ID {screenshot_id}.")
    return format_extracted(tx)

@router.post("/run/{screenshot_id}", response_model=ExtractedTransactionSchema)
def run_extraction(screenshot_id: int, db: Session = Depends(get_db)):
    screenshot = db.query(Screenshot).filter(Screenshot.id == screenshot_id).first()
    if not screenshot:
        raise HTTPException(status_code=404, detail=f"Screenshot ID {screenshot_id} not found.")

    latest_ocr = (
        db.query(OCRResult)
        .filter(OCRResult.screenshot_id == screenshot_id)
        .order_by(OCRResult.created_at.desc())
        .first()
    )

    raw_ocr_text = latest_ocr.raw_text if latest_ocr else ""
    ocr_result_id = latest_ocr.id if latest_ocr else None

    extractor = TransactionExtractor()
    data = extractor.extract_from_text(raw_ocr_text)

    tx_record = ExtractedTransaction(
        ocr_result_id=ocr_result_id,
        screenshot_id=screenshot_id,
        amount=data["amount"],
        currency=data["currency"],
        transaction_date=data["transaction_date"],
        transaction_time=data["transaction_time"],
        reference_number=data["reference_number"],
        utr_number=data["utr_number"],
        transaction_id=data["transaction_id"],
        sender_name=data["sender_name"],
        receiver_name=data["receiver_name"],
        sender_account=data["sender_account"],
        receiver_account=data["receiver_account"],
        bank_name=data["bank_name"],
        ifsc=data["ifsc"],
        transaction_type=data["transaction_type"],
        payment_status=data["payment_status"],
        remarks=data["remarks"],
        raw_ai_json=data["raw_ai_json"],
        confidence=data["confidence"],
        is_manually_edited=False,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc)
    )
    db.add(tx_record)
    db.commit()
    db.refresh(tx_record)

    return format_extracted(tx_record)

@router.put("/{extracted_id}", response_model=ExtractedTransactionSchema)
def update_extracted_transaction(extracted_id: int, payload: ExtractedTransactionUpdateSchema, db: Session = Depends(get_db)):
    tx = db.query(ExtractedTransaction).filter(ExtractedTransaction.id == extracted_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail=f"Extracted transaction ID {extracted_id} not found.")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(tx, key, value)

    setattr(tx, "is_manually_edited", True)
    setattr(tx, "updated_at", datetime.now(timezone.utc))

    db.commit()
    db.refresh(tx)
    return format_extracted(tx)
