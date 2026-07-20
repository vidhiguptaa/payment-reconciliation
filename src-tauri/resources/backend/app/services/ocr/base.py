from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from typing import Dict, Any, Optional

@dataclass
class OCRResultData:
    raw_text: str
    raw_json: str
    confidence: float
    processing_time_ms: int
    provider_name: str
    status: str = "SUCCESS"
    error_message: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

class BaseOCRProvider(ABC):
    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Name identifier for the OCR provider."""
        pass

    @abstractmethod
    def extract_text(self, image_path: str) -> str:
        """Extract raw unformatted text from image file."""
        pass

    @abstractmethod
    def extract_document(self, image_path: str) -> OCRResultData:
        """Extract text and structured metadata into unified OCRResultData container."""
        pass

    @abstractmethod
    def health_check(self) -> bool:
        """Check whether provider dependencies and credentials are valid and ready."""
        pass
