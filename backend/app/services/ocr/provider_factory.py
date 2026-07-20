from typing import Optional, Dict, Type
from app.config import settings
from app.services.ocr.base import BaseOCRProvider
from app.services.ocr.providers.gemini_provider import GeminiOCRProvider
from app.services.ocr.providers.tesseract_provider import TesseractOCRProvider
from app.services.ocr.providers.paddle_provider import PaddleOCRProvider

class OCRProviderFactory:
    _providers: Dict[str, Type[BaseOCRProvider]] = {
        "paddle": PaddleOCRProvider,
        "paddleocr": PaddleOCRProvider,
        "tesseract": TesseractOCRProvider,
        "gemini": GeminiOCRProvider,
    }

    @classmethod
    def get_provider(cls, provider_name: Optional[str] = None) -> BaseOCRProvider:
        name = (provider_name or settings.OCR_PROVIDER or "paddle").lower().strip()
        provider_class = cls._providers.get(name)
        
        if not provider_class:
            provider_class = PaddleOCRProvider

        return provider_class()

