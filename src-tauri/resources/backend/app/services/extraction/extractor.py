import json
import re
from typing import Dict, Any, Optional

from app.config import settings
from app.services.extraction.normalizer import TransactionNormalizer
from app.services.extraction.prompt_builder import ExtractionPromptBuilder

class TransactionExtractor:
    def __init__(self, api_key: Optional[str] = None) -> None:
        self.api_key = api_key or settings.GOOGLE_API_KEY
        self.normalizer = TransactionNormalizer()

    def _has_valid_ai_key(self) -> bool:
        if not self.api_key or not self.api_key.strip():
            return False
        if "YourGeminiApiKey" in self.api_key or "YOUR_API_KEY" in self.api_key:
            return False
        return True

    def _fallback_regex_extraction(self, raw_text: str) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "amount": None,
            "currency": "INR",
            "transaction_date": None,
            "transaction_time": None,
            "reference_number": None,
            "utr_number": None,
            "transaction_id": None,
            "sender_name": None,
            "receiver_name": None,
            "sender_account": None,
            "receiver_account": None,
            "bank_name": None,
            "ifsc": None,
            "transaction_type": "UPI",
            "payment_status": "SUCCESS",
            "remarks": "",
            "confidence": 0.60,
            "raw_ai_json": json.dumps({"source": "fallback_regex", "raw_text_length": len(raw_text)})
        }

        if not raw_text:
            return data

        amt_match = re.search(r"(?:[₹$]|Rs\.?|INR)?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{2})?)", raw_text, re.IGNORECASE)
        if amt_match:
            data["amount"] = self.normalizer.normalize_amount(amt_match.group(0))

        date_match = re.search(r"\b(?:\d{1,2}[-/\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-/\s]\d{4}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b", raw_text, re.IGNORECASE)
        if date_match:
            data["transaction_date"] = self.normalizer.normalize_date(date_match.group(0))

        time_match = re.search(r"\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\s*(?:AM|PM|am|pm)?\b", raw_text)
        if time_match:
            data["transaction_time"] = self.normalizer.normalize_time(time_match.group(0))

        ref_match = re.search(r"(?:Ref|Reference|UPI\s*Ref|UTR|Txn\s*ID|Order\s*ID)[:\s#]*([A-Z0-9]{8,22})", raw_text, re.IGNORECASE)
        if ref_match:
            data["reference_number"] = self.normalizer.normalize_uppercase(ref_match.group(1))
            data["utr_number"] = data["reference_number"]

        # Receiver / Payee Name regex matching
        payee_match = re.search(r"(?:Paid\s*to|To|Beneficiary|Receiver)[:\s]*([A-Za-z0-9\s&.-]{3,50})", raw_text, re.IGNORECASE)
        if payee_match:
            data["receiver_name"] = self.normalizer.normalize_text(payee_match.group(1))

        ifsc_match = re.search(r"\b[A-Z]{4}0[A-Z0-9]{6}\b", raw_text)
        if ifsc_match:
            data["ifsc"] = self.normalizer.normalize_uppercase(ifsc_match.group(0))

        if re.search(r"\b(failed|unsuccessful|declined)\b", raw_text, re.IGNORECASE):
            data["payment_status"] = "FAILED"
        elif re.search(r"\b(pending|processing)\b", raw_text, re.IGNORECASE):
            data["payment_status"] = "PENDING"
        else:
            data["payment_status"] = "SUCCESS"

        data["raw_ai_json"] = json.dumps(data)
        return data

    def extract_from_text(self, raw_text: str) -> Dict[str, Any]:
        if not raw_text or not raw_text.strip():
            return self._fallback_regex_extraction("")

        raw_ai_json_str = "{}"
        raw_data: Dict[str, Any] = {}

        if self._has_valid_ai_key():
            try:
                from google import genai
                client = genai.Client(api_key=self.api_key)
                prompt = ExtractionPromptBuilder.build_prompt(raw_text)

                response = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=[prompt]
                )
                resp_text = (response.text or "").strip()

                cleaned_json = re.sub(r"^```(?:json)?\s*", "", resp_text, flags=re.MULTILINE)
                cleaned_json = re.sub(r"\s*```$", "", cleaned_json, flags=re.MULTILINE).strip()

                raw_ai_json_str = cleaned_json
                raw_data = json.loads(cleaned_json)
            except Exception as e:
                raw_ai_json_str = json.dumps({"error": str(e)})
                raw_data = self._fallback_regex_extraction(raw_text)
        else:
            raw_data = self._fallback_regex_extraction(raw_text)
            raw_ai_json_str = json.dumps(raw_data)

        normalized: Dict[str, Any] = {
            "amount": self.normalizer.normalize_amount(raw_data.get("amount")),
            "currency": self.normalizer.normalize_text(raw_data.get("currency")) or "INR",
            "transaction_date": self.normalizer.normalize_date(raw_data.get("transaction_date")),
            "transaction_time": self.normalizer.normalize_time(raw_data.get("transaction_time")),
            "reference_number": self.normalizer.normalize_uppercase(raw_data.get("reference_number")),
            "utr_number": self.normalizer.normalize_uppercase(raw_data.get("utr_number") or raw_data.get("reference_number")),
            "transaction_id": self.normalizer.normalize_uppercase(raw_data.get("transaction_id")),
            "sender_name": self.normalizer.normalize_text(raw_data.get("sender_name")),
            "receiver_name": self.normalizer.normalize_text(raw_data.get("receiver_name")),
            "sender_account": self.normalizer.normalize_text(raw_data.get("sender_account")),
            "receiver_account": self.normalizer.normalize_text(raw_data.get("receiver_account")),
            "bank_name": self.normalizer.normalize_text(raw_data.get("bank_name")),
            "ifsc": self.normalizer.normalize_uppercase(raw_data.get("ifsc")),
            "transaction_type": self.normalizer.normalize_uppercase(raw_data.get("transaction_type")) or "UPI",
            "payment_status": self.normalizer.normalize_uppercase(raw_data.get("payment_status")) or "SUCCESS",
            "remarks": self.normalizer.normalize_text(raw_data.get("remarks")),
            "raw_ai_json": raw_ai_json_str,
            "confidence": float(raw_data.get("confidence") or 0.85)
        }

        return normalized
