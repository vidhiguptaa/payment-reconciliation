import json
import re
from typing import Dict, Any, Optional

from app.services.extraction.normalizer import TransactionNormalizer

class TransactionExtractor:
    def __init__(self, api_key: Optional[str] = None) -> None:
        self.normalizer = TransactionNormalizer()

    def extract(self, raw_text: str) -> Dict[str, Any]:
        return self.extract_from_text(raw_text)

    def extract_from_text(self, raw_text: str) -> Dict[str, Any]:
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
            "raw_ai_json": ""
        }

        if not raw_text:
            data["raw_ai_json"] = json.dumps(data)
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
