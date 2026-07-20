import logging
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy.orm import Session

from app.models import (
    Screenshot,
    ProcessingJob,
    PipelineStage,
    JobStatus,
    ScreenshotStatus,
    OCRResult,
    ExtractedTransaction,
)
from app.services.ocr.provider_factory import OCRProviderFactory
from app.services.extraction.extractor import TransactionExtractor

logger = logging.getLogger(__name__)

class ProcessingPipelineService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def process_screenshot(self, screenshot_id: int) -> ProcessingJob:
        screenshot = self.db.query(Screenshot).filter(Screenshot.id == screenshot_id).first()
        if not screenshot:
            raise ValueError(f"Screenshot ID {screenshot_id} not found.")

        job = (
            self.db.query(ProcessingJob)
            .filter(ProcessingJob.screenshot_id == screenshot_id)
            .first()
        )

        if not job:
            import uuid
            job = ProcessingJob(
                job_id=str(uuid.uuid4()),
                screenshot_id=screenshot_id,
                current_stage=PipelineStage.QUEUED.value,
                status=JobStatus.PENDING.value,
                started_at=None,
                finished_at=None,
                error_message=None,
            )
            self.db.add(job)
            self.db.commit()
            self.db.refresh(job)

        self._execute_pipeline(job, screenshot)
        return job

    def process_all_pending(self) -> List[ProcessingJob]:
        pending_screenshots = (
            self.db.query(Screenshot)
            .filter(Screenshot.status == ScreenshotStatus.PENDING.value)
            .all()
        )
        completed_jobs: List[ProcessingJob] = []

        for sc in pending_screenshots:
            try:
                job = self.process_screenshot(sc.id)
                completed_jobs.append(job)
            except Exception as e:
                logger.error(f"Error processing screenshot {sc.id}: {e}")

        return completed_jobs

    def _execute_pipeline(self, job: ProcessingJob, screenshot: Screenshot) -> None:
        job.status = JobStatus.RUNNING.value
        job.started_at = datetime.now(timezone.utc)
        screenshot.status = ScreenshotStatus.PROCESSING.value
        self.db.commit()

        try:
            # Stage 1: OCR
            ocr_result = self._execute_stage_ocr(job, screenshot)

            # Stage 2: Transaction Extraction
            extracted_tx = self._execute_stage_extraction(job, screenshot, ocr_result)

            # Stage 3: Reconciliation
            self._execute_stage_reconciliation(job, extracted_tx)

            # Pipeline Completed
            job.current_stage = PipelineStage.COMPLETED.value
            job.status = JobStatus.COMPLETED.value
            job.finished_at = datetime.now(timezone.utc)
            screenshot.status = ScreenshotStatus.PROCESSED.value
            self.db.commit()

        except Exception as e:
            logger.exception(f"Processing pipeline failed for job {job.job_id}: {e}")
            job.current_stage = PipelineStage.FAILED.value
            job.status = JobStatus.FAILED.value
            job.finished_at = datetime.now(timezone.utc)
            job.error_message = str(e)
            screenshot.status = ScreenshotStatus.FAILED.value
            self.db.commit()

    def _execute_stage_ocr(self, job: ProcessingJob, screenshot: Screenshot) -> OCRResult:
        job.current_stage = PipelineStage.OCR.value
        self.db.commit()

        existing_ocr = (
            self.db.query(OCRResult)
            .filter(OCRResult.screenshot_id == screenshot.id)
            .order_by(OCRResult.created_at.desc())
            .first()
        )
        if existing_ocr and existing_ocr.status == "SUCCESS":
            return existing_ocr

        provider = OCRProviderFactory.get_provider()
        res_data = provider.extract_document(screenshot.filepath)

        ocr_record = OCRResult(
            screenshot_id=screenshot.id,
            provider=res_data.provider_name,
            raw_text=res_data.raw_text,
            raw_json=res_data.raw_json,
            confidence=res_data.confidence,
            processing_time_ms=res_data.processing_time_ms,
            status=res_data.status,
            error_message=res_data.error_message,
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(ocr_record)
        self.db.commit()
        self.db.refresh(ocr_record)
        return ocr_record

    def _execute_stage_extraction(
        self,
        job: ProcessingJob,
        screenshot: Screenshot,
        ocr_result: OCRResult
    ) -> ExtractedTransaction:
        job.current_stage = PipelineStage.EXTRACTION.value
        self.db.commit()

        existing_tx = (
            self.db.query(ExtractedTransaction)
            .filter(ExtractedTransaction.screenshot_id == screenshot.id)
            .first()
        )
        if existing_tx:
            return existing_tx

        extractor = TransactionExtractor()
        extracted_data = extractor.extract(ocr_result.raw_text)

        tx_record = ExtractedTransaction(
            ocr_result_id=ocr_result.id,
            screenshot_id=screenshot.id,
            amount=extracted_data.get("amount"),
            currency=extracted_data.get("currency", "INR"),
            transaction_date=extracted_data.get("transaction_date"),
            transaction_time=extracted_data.get("transaction_time"),
            reference_number=extracted_data.get("reference_number"),
            utr_number=extracted_data.get("utr_number"),
            transaction_id=extracted_data.get("transaction_id"),
            sender_name=extracted_data.get("sender_name"),
            receiver_name=extracted_data.get("receiver_name"),
            sender_account=extracted_data.get("sender_account"),
            receiver_account=extracted_data.get("receiver_account"),
            bank_name=extracted_data.get("bank_name"),
            ifsc=extracted_data.get("ifsc"),
            transaction_type=extracted_data.get("transaction_type"),
            payment_status=extracted_data.get("payment_status", "SUCCESS"),
            remarks=extracted_data.get("remarks"),
            raw_ai_json=extracted_data.get("raw_ai_json", "{}"),
            confidence=extracted_data.get("confidence", 0.0),
            is_manually_edited=False,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        self.db.add(tx_record)
        self.db.commit()
        self.db.refresh(tx_record)
        return tx_record

    def _execute_stage_reconciliation(
        self,
        job: ProcessingJob,
        extracted_tx: Optional[ExtractedTransaction]
    ) -> None:
        job.current_stage = PipelineStage.RECONCILIATION.value
        self.db.commit()

        if extracted_tx:
            from app.services.reconciliation.engine import ReconciliationEngine
            engine = ReconciliationEngine()
            engine.reconcile_transaction(extracted_tx.id, self.db)
