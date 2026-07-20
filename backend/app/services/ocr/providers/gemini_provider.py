import json
import time
from pathlib import Path
from typing import Optional
from PIL import Image

from app.config import settings
from app.services.ocr.base import BaseOCRProvider, OCRResultData

class GeminiOCRProvider(BaseOCRProvider):
    def __init__(self, api_key: Optional[str] = None) -> None:
        self.api_key = api_key or settings.GOOGLE_API_KEY

    @property
    def provider_name(self) -> str:
        return "gemini"

    def health_check(self) -> bool:
        if not self.api_key or not self.api_key.strip():
            return False
        if "YourGeminiApiKey" in self.api_key or "YOUR_API_KEY" in self.api_key:
            return False
        return True

    def extract_text(self, image_path: str) -> str:
        result = self.extract_document(image_path)
        if result.status == "FAILED":
            raise RuntimeError(result.error_message or "Gemini OCR failed")
        return result.raw_text

    def extract_document(self, image_path: str) -> OCRResultData:
        start_time = time.time()
        
        if not self.health_check():
            elapsed_ms = int((time.time() - start_time) * 1000)
            return OCRResultData(
                raw_text="",
                raw_json=json.dumps({"error": "Google API key missing or unconfigured"}),
                confidence=0.0,
                processing_time_ms=elapsed_ms,
                provider_name=self.provider_name,
                status="FAILED",
                error_message="Google API Key missing or unconfigured. Provide GOOGLE_API_KEY in environment to enable Gemini Vision."
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
            from google import genai
            client = genai.Client(api_key=self.api_key)
            
            with Image.open(image_path) as img:
                response = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=[
                        "Extract all text from this payment screenshot image as plain text.",
                        img
                    ]
                )
                raw_text = response.text or ""
                
            elapsed_ms = int((time.time() - start_time) * 1000)
            raw_json = json.dumps({
                "provider": "gemini",
                "model": "gemini-2.5-flash",
                "extracted_lines": [line.strip() for line in raw_text.split("\n") if line.strip()]
            })

            return OCRResultData(
                raw_text=raw_text,
                raw_json=raw_json,
                confidence=95.0,
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
                error_message=f"Gemini API Exception: {str(e)}"
            )
