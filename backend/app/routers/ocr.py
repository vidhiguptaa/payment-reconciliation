from datetime import datetime, timezone
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Screenshot, OCRResult
from app.services.ocr.provider_factory import OCRProviderFactory

router = APIRouter(prefix="/api/ocr", tags=["ocr"])

class OCRResultSchema(BaseModel):
    id: int
    screenshot_id: int
    provider: str
    raw_text: str
    raw_json: str
    confidence: float
    processing_time_ms: int
    status: str
    error_message: Optional[str] = None
    created_at: str

def format_ocr_result(res: OCRResult) -> Dict[str, Any]:
    return {
        "id": res.id,
        "screenshot_id": res.screenshot_id,
        "provider": res.provider,
        "raw_text": res.raw_text,
        "raw_json": res.raw_json,
        "confidence": res.confidence,
        "processing_time_ms": res.processing_time_ms,
        "status": res.status,
        "error_message": res.error_message,
        "created_at": res.created_at.isoformat() if res.created_at else "",
    }

@router.post("/run/{screenshot_id}", response_model=OCRResultSchema)
def run_ocr(screenshot_id: int, provider_name: Optional[str] = None, db: Session = Depends(get_db)):
    screenshot = db.query(Screenshot).filter(Screenshot.id == screenshot_id).first()
    if not screenshot:
        raise HTTPException(status_code=404, detail=f"Screenshot ID {screenshot_id} not found.")

    provider = OCRProviderFactory.get_provider(provider_name)
    ocr_result_data = provider.extract_document(screenshot.filepath)

    ocr_record = OCRResult(
        screenshot_id=screenshot.id,
        provider=ocr_result_data.provider_name,
        raw_text=ocr_result_data.raw_text,
        raw_json=ocr_result_data.raw_json,
        confidence=ocr_result_data.confidence,
        processing_time_ms=ocr_result_data.processing_time_ms,
        status=ocr_result_data.status,
        error_message=ocr_result_data.error_message,
        created_at=datetime.now(timezone.utc)
    )
    db.add(ocr_record)
    db.commit()
    db.refresh(ocr_record)

    return format_ocr_result(ocr_record)

@router.get("/{screenshot_id}", response_model=OCRResultSchema)
def get_latest_ocr_result(screenshot_id: int, db: Session = Depends(get_db)):
    result = (
        db.query(OCRResult)
        .filter(OCRResult.screenshot_id == screenshot_id)
        .order_by(OCRResult.created_at.desc())
        .first()
    )
    if not result:
        raise HTTPException(status_code=404, detail=f"No OCR results found for screenshot ID {screenshot_id}.")
    return format_ocr_result(result)
