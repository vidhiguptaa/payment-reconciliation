import json
import time
import shutil
from pathlib import Path
from typing import Optional
from PIL import Image

from app.config import settings
from app.services.ocr.base import BaseOCRProvider, OCRResultData

class TesseractOCRProvider(BaseOCRProvider):
    def __init__(self, tesseract_path: Optional[str] = None) -> None:
        self.tesseract_path = tesseract_path or settings.TESSERACT_PATH

    @property
    def provider_name(self) -> str:
        return "tesseract"

    def health_check(self) -> bool:
        if self.tesseract_path and Path(self.tesseract_path).exists():
            return True
        return shutil.which("tesseract") is not None

    def extract_text(self, image_path: str) -> str:
        result = self.extract_document(image_path)
        if result.status == "FAILED":
            raise RuntimeError(result.error_message or "Tesseract OCR failed")
        return result.raw_text

    def extract_document(self, image_path: str) -> OCRResultData:
        start_time = time.time()

        if not self.health_check():
            elapsed_ms = int((time.time() - start_time) * 1000)
            return OCRResultData(
                raw_text="",
                raw_json=json.dumps({"error": "Tesseract binary not installed"}),
                confidence=0.0,
                processing_time_ms=elapsed_ms,
                provider_name=self.provider_name,
                status="FAILED",
                error_message="Tesseract binary not found on PATH or TESSERACT_PATH."
            )

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

        try:
            import pytesseract

            if self.tesseract_path and Path(self.tesseract_path).exists():
                pytesseract.pytesseract.tesseract_cmd = self.tesseract_path

            with Image.open(image_path) as img:
                raw_text = pytesseract.image_to_string(img)
                data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)

            conf_scores = [float(c) for c in data.get("conf", []) if isinstance(c, (int, float, str)) and str(c).replace('.','',1).isdigit() and float(c) > 0]
            avg_conf = sum(conf_scores) / len(conf_scores) if conf_scores else 75.0

            elapsed_ms = int((time.time() - start_time) * 1000)
            raw_json = json.dumps({
                "provider": "tesseract",
                "extracted_words": [w for w in data.get("text", []) if w.strip()],
                "confidence_avg": avg_conf
            })

            return OCRResultData(
                raw_text=raw_text.strip(),
                raw_json=raw_json,
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
                error_message=f"Tesseract Exception: {str(e)}"
            )
