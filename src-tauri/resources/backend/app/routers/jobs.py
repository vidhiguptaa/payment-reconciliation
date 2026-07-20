from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ProcessingJob
from app.services.processing_pipeline import ProcessingPipelineService

router = APIRouter(prefix="/api/jobs", tags=["processing-jobs"])

class ProcessingJobSchema(BaseModel):
    id: int
    job_id: str
    screenshot_id: int
    current_stage: str
    status: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    error_message: Optional[str] = None
    created_at: str

class ProcessingJobListResponse(BaseModel):
    total: int
    jobs: List[ProcessingJobSchema]

def format_job(job: ProcessingJob) -> Dict[str, Any]:
    return {
        "id": job.id,
        "job_id": job.job_id,
        "screenshot_id": job.screenshot_id,
        "current_stage": job.current_stage,
        "status": job.status,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        "error_message": job.error_message,
        "created_at": job.created_at.isoformat() if job.created_at else "",
    }

@router.post("/process/{screenshot_id}", response_model=ProcessingJobSchema)
def process_screenshot(screenshot_id: int, db: Session = Depends(get_db)):
    pipeline = ProcessingPipelineService(db)
    try:
        job = pipeline.process_screenshot(screenshot_id)
        return format_job(job)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/process-pending", response_model=ProcessingJobListResponse)
def process_all_pending(db: Session = Depends(get_db)):
    pipeline = ProcessingPipelineService(db)
    jobs = pipeline.process_all_pending()
    formatted = [format_job(job) for job in jobs]
    return {
        "total": len(formatted),
        "jobs": formatted
    }

@router.get("", response_model=ProcessingJobListResponse)
def get_jobs(db: Session = Depends(get_db)):
    jobs = db.query(ProcessingJob).order_by(ProcessingJob.created_at.desc()).all()
    formatted = [format_job(job) for job in jobs]
    return {
        "total": len(formatted),
        "jobs": formatted
    }

@router.get("/{job_id}", response_model=ProcessingJobSchema)
def get_job_by_id(job_id: str, db: Session = Depends(get_db)):
    job = db.query(ProcessingJob).filter(ProcessingJob.job_id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    return format_job(job)
