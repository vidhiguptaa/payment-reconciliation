import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from app.database import Base

def get_utc_now():
    return datetime.now(timezone.utc)

class MatchStatus(str, enum.Enum):
    MATCHED = "Matched"
    POSSIBLE_MATCH = "Possible Match"
    NEEDS_REVIEW = "Needs Review"
    UNMATCHED = "Unmatched"

class MatchType(str, enum.Enum):
    AUTO_MATCHED = "AUTO_MATCHED"
    MANUALLY_MATCHED = "MANUALLY_MATCHED"

class ScreenshotStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    PROCESSED = "PROCESSED"
    FAILED = "FAILED"

class PipelineStage(str, enum.Enum):
    QUEUED = "QUEUED"
    OCR = "OCR"
    EXTRACTION = "EXTRACTION"
    RECONCILIATION = "RECONCILIATION"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

class JobStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

class Screenshot(Base):
    __tablename__ = "screenshots"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False, index=True)
    filepath = Column(String(512), nullable=False)
    file_hash = Column(String(64), nullable=False, index=True, unique=True)
    extension = Column(String(20), nullable=False)
    file_size = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=get_utc_now)
    imported_at = Column(DateTime, default=get_utc_now)
    status = Column(String(50), default=ScreenshotStatus.PENDING.value, nullable=False)
    thumbnail_path = Column(String(512), nullable=True)

    processing_jobs = relationship("ProcessingJob", back_populates="screenshot", cascade="all, delete-orphan")
    ocr_results = relationship("OCRResult", back_populates="screenshot", cascade="all, delete-orphan")
    extracted_transactions = relationship("ExtractedTransaction", back_populates="screenshot", cascade="all, delete-orphan")

class OCRResult(Base):
    __tablename__ = "ocr_results"

    id = Column(Integer, primary_key=True, index=True)
    screenshot_id = Column(Integer, ForeignKey("screenshots.id"), nullable=False, index=True)
    provider = Column(String(50), nullable=False)
    raw_text = Column(Text, nullable=False, default="")
    raw_json = Column(Text, nullable=False, default="{}")
    confidence = Column(Float, nullable=False, default=0.0)
    processing_time_ms = Column(Integer, nullable=False, default=0)
    status = Column(String(50), nullable=False, default="SUCCESS")
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_utc_now)

    screenshot = relationship("Screenshot", back_populates="ocr_results")
    extracted_transactions = relationship("ExtractedTransaction", back_populates="ocr_result", cascade="all, delete-orphan")

class ExtractedTransaction(Base):
    __tablename__ = "extracted_transactions"

    id = Column(Integer, primary_key=True, index=True)
    ocr_result_id = Column(Integer, ForeignKey("ocr_results.id"), nullable=True, index=True)
    screenshot_id = Column(Integer, ForeignKey("screenshots.id"), nullable=False, index=True)

    amount = Column(Float, nullable=True)
    currency = Column(String(10), default="INR", nullable=False)
    transaction_date = Column(String(20), nullable=True)
    transaction_time = Column(String(20), nullable=True)
    reference_number = Column(String(100), nullable=True, index=True)
    utr_number = Column(String(100), nullable=True, index=True)
    transaction_id = Column(String(100), nullable=True)

    sender_name = Column(String(255), nullable=True)
    receiver_name = Column(String(255), nullable=True)
    sender_account = Column(String(100), nullable=True)
    receiver_account = Column(String(100), nullable=True)
    bank_name = Column(String(255), nullable=True)
    ifsc = Column(String(50), nullable=True)

    transaction_type = Column(String(50), nullable=True)
    payment_status = Column(String(50), default="SUCCESS", nullable=False)
    remarks = Column(Text, nullable=True)

    raw_ai_json = Column(Text, nullable=False, default="{}")
    confidence = Column(Float, nullable=False, default=0.0)
    is_manually_edited = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, default=get_utc_now)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)

    screenshot = relationship("Screenshot", back_populates="extracted_transactions")
    ocr_result = relationship("OCRResult", back_populates="extracted_transactions")
    reconciliation_match = relationship("TransactionMatch", back_populates="extracted_transaction", uselist=False, cascade="all, delete-orphan")

class StatementFile(Base):
    __tablename__ = "statement_files"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False, index=True)
    filepath = Column(String(512), nullable=False)
    file_hash = Column(String(64), nullable=False, index=True, unique=True)
    extension = Column(String(20), nullable=False)
    imported_at = Column(DateTime, default=get_utc_now)
    status = Column(String(50), default="PROCESSED", nullable=False)
    total_transactions = Column(Integer, default=0, nullable=False)
    processing_time_ms = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=get_utc_now)

    transactions = relationship("StatementTransaction", back_populates="statement_file", cascade="all, delete-orphan")

class StatementTransaction(Base):
    __tablename__ = "statement_transactions"

    id = Column(Integer, primary_key=True, index=True)
    statement_file_id = Column(Integer, ForeignKey("statement_files.id"), nullable=False, index=True)

    transaction_date = Column(String(20), nullable=True, index=True)
    value_date = Column(String(20), nullable=True)
    description = Column(Text, nullable=True)
    reference_number = Column(String(100), nullable=True, index=True)
    utr_number = Column(String(100), nullable=True, index=True)
    transaction_id = Column(String(100), nullable=True, index=True)

    debit = Column(Float, nullable=True)
    credit = Column(Float, nullable=True)
    amount = Column(Float, nullable=True, index=True)
    balance = Column(Float, nullable=True)
    currency = Column(String(10), default="INR", nullable=False)
    bank_name = Column(String(255), nullable=True)

    raw_row_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=get_utc_now)

    statement_file = relationship("StatementFile", back_populates="transactions")
    matched_reconciliations = relationship("TransactionMatch", back_populates="statement_transaction")

class TransactionMatch(Base):
    __tablename__ = "transaction_matches"

    id = Column(Integer, primary_key=True, index=True)
    extracted_transaction_id = Column(Integer, ForeignKey("extracted_transactions.id"), nullable=False, unique=True, index=True)
    statement_transaction_id = Column(Integer, ForeignKey("statement_transactions.id"), nullable=True, index=True)

    match_status = Column(String(50), nullable=False, default=MatchStatus.UNMATCHED.value, index=True)
    match_type = Column(String(50), nullable=False, default=MatchType.AUTO_MATCHED.value)

    confidence_score = Column(Float, nullable=False, default=0.0)
    match_reason_json = Column(Text, nullable=False, default="[]")
    field_scores_json = Column(Text, nullable=False, default="{}")

    created_at = Column(DateTime, default=get_utc_now)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)

    extracted_transaction = relationship("ExtractedTransaction", back_populates="reconciliation_match")
    statement_transaction = relationship("StatementTransaction", back_populates="matched_reconciliations")

class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String(36), nullable=False, index=True, unique=True)
    screenshot_id = Column(Integer, ForeignKey("screenshots.id"), nullable=False, index=True)
    current_stage = Column(String(50), default=PipelineStage.QUEUED.value, nullable=False)
    status = Column(String(50), default=JobStatus.PENDING.value, nullable=False)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_utc_now)

    screenshot = relationship("Screenshot", back_populates="processing_jobs")

class ProcessingLog(Base):
    __tablename__ = "processing_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=get_utc_now, index=True)
    filename = Column(String(255), nullable=False, index=True)
    filepath = Column(String(512), nullable=False)
    operation = Column(String(100), nullable=False, index=True)
    success = Column(Boolean, nullable=False, default=True)
    duration_ms = Column(Integer, nullable=False, default=0)
    error_message = Column(Text, nullable=True)

class ScreenshotTransaction(Base):
    __tablename__ = "screenshot_transactions"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    filepath = Column(String(512), nullable=False)
    amount = Column(Float, nullable=True)
    transaction_date = Column(DateTime, nullable=True)
    beneficiary = Column(String(255), nullable=True)
    reference_number = Column(String(255), index=True, nullable=True)
    confidence_score = Column(Float, default=0.0)
    status = Column(String(50), default=MatchStatus.UNMATCHED.value, nullable=False)
    created_at = Column(DateTime, default=get_utc_now)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)
