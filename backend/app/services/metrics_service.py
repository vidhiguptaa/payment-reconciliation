"""
Performance Metrics Tracker Service.

Records execution durations (in milliseconds) for OCR, Extraction,
Statement Import, and Reconciliation stages without changing business logic.
"""
import time
import logging
from typing import Dict, Any, List
from collections import deque
from contextlib import contextmanager

logger = logging.getLogger(__name__)

MAX_HISTORY = 100


class StageMetrics:
    def __init__(self) -> None:
        self.durations: deque[float] = deque(maxlen=MAX_HISTORY)
        self.total_count: int = 0

    def record(self, duration_ms: float) -> None:
        self.durations.append(duration_ms)
        self.total_count += 1

    def to_dict(self) -> Dict[str, Any]:
        if not self.durations:
            return {
                "total_runs": self.total_count,
                "avg_ms": 0.0,
                "min_ms": 0.0,
                "max_ms": 0.0,
                "last_ms": 0.0,
            }
        return {
            "total_runs": self.total_count,
            "avg_ms": round(sum(self.durations) / len(self.durations), 2),
            "min_ms": round(min(self.durations), 2),
            "max_ms": round(max(self.durations), 2),
            "last_ms": round(self.durations[-1], 2),
        }


class PerformanceMetricsService:
    def __init__(self) -> None:
        self.ocr = StageMetrics()
        self.extraction = StageMetrics()
        self.import_statement = StageMetrics()
        self.reconciliation = StageMetrics()

    @contextmanager
    def measure(self, stage: str):
        start = time.perf_counter()
        try:
            yield
        finally:
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            self.record_duration(stage, elapsed_ms)

    def record_duration(self, stage: str, duration_ms: float) -> None:
        stage_map = {
            "ocr": self.ocr,
            "extraction": self.extraction,
            "import": self.import_statement,
            "reconciliation": self.reconciliation,
        }
        if stage in stage_map:
            stage_map[stage].record(duration_ms)
            logger.info(f"[Metrics] Recorded {stage} duration: {duration_ms:.2f}ms")

    def get_summary(self) -> Dict[str, Any]:
        return {
            "ocr": self.ocr.to_dict(),
            "extraction": self.extraction.to_dict(),
            "import": self.import_statement.to_dict(),
            "reconciliation": self.reconciliation.to_dict(),
        }


metrics_service = PerformanceMetricsService()
