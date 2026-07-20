import json
import time
from pathlib import Path
from typing import Optional

from app.config import settings
from app.services.ocr.base import BaseOCRProvider, OCRResultData

class PaddleOCRProvider(BaseOCRProvider):
    def __init__(self, lang: Optional[str] = None) -> None:
        self.lang = lang or settings.PADDLE_LANGUAGE

    @property
    def provider_name(self) -> str:
        return "paddle"

    def health_check(self) -> bool:
        try:
            import paddleocr  # type: ignore # noqa: F401
            return True
        except ImportError:
            return False

    def extract_text(self, image_path: str) -> str:
        result = self.extract_document(image_path)
        if result.status == "FAILED":
            raise RuntimeError(result.error_message or "PaddleOCR failed")
        return result.raw_text

    def extract_document(self, image_path: str) -> OCRResultData:
        start_time = time.time()

        if not Path(image_path).exists():
            elapsed_ms = int((time.time() - start_time) * 1000)
            return OCRResultData(
                raw_text="",
                raw_json=json.dumps({"error": "File not found"}),
                confidence=0.0,
                processing_time_ms=elapsed_ms,
                provider_name=self.provider_name,
                status="FAILED",
                error_message=f"Image file missing at path: {image_path}"
            )

        if not self.health_check():
            elapsed_ms = int((time.time() - start_time) * 1000)
            return OCRResultData(
                raw_text="",
                raw_json=json.dumps({"error": "PaddleOCR library not installed"}),
                confidence=0.0,
                processing_time_ms=elapsed_ms,
                provider_name=self.provider_name,
                status="FAILED",
                error_message="PaddleOCR package not installed. Install paddlepaddle and paddleocr to enable."
            )

        try:
            from paddleocr import PaddleOCR  # type: ignore
            ocr = PaddleOCR(use_angle_cls=True, lang=self.lang, show_log=False)
            res = ocr.ocr(image_path, cls=True)

            lines = []
            conf_scores = []
            if res and isinstance(res, list):
                for line_item in res[0]:
                    if len(line_item) >= 2:
                        _, (text_str, conf) = line_item[0], line_item[1]
                        lines.append(text_str)
                        conf_scores.append(float(conf))

            raw_text = "\n".join(lines)
            avg_conf = (sum(conf_scores) / len(conf_scores) * 100.0) if conf_scores else 80.0
            elapsed_ms = int((time.time() - start_time) * 1000)

            return OCRResultData(
                raw_text=raw_text,
                raw_json=json.dumps({"provider": "paddle", "lines": lines}),
                confidence=round(avg_conf, 2),
                processing_time_ms=elapsed_ms,
                provider_name=self.provider_name,
                status="SUCCESS",
                error_message=None
            )
        except Exception as e:
            elapsed_ms = int((time.time() - start_time) * 1000)
            return OCRResultData(
                raw_text="",
                raw_json=json.dumps({"error": str(e)}),
                confidence=0.0,
                processing_time_ms=elapsed_ms,
                provider_name=self.provider_name,
                status="FAILED",
                error_message=f"PaddleOCR Exception: {str(e)}"
            )
