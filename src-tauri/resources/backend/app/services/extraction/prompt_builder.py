class ExtractionPromptBuilder:
    @staticmethod
    def build_prompt(raw_ocr_text: str) -> str:
        return f"""You are an expert financial payment transaction parser.
Your task is to analyze the raw OCR text extracted from a payment screenshot or bank receipt and extract structured fields into strict JSON format.

RAW OCR TEXT FROM SCREENSHOT:
----------------------------------------
{raw_ocr_text}
----------------------------------------

Return ONLY a valid, single JSON object with the following fields:
{{
  "amount": 117994.00,             // Number (float/int) or null
  "currency": "INR",               // String e.g. "INR", "USD"
  "transaction_date": "2026-01-18",// String YYYY-MM-DD or null
  "transaction_time": "16:52:00",  // String HH:MM:SS or null
  "reference_number": "...",       // String or null (Ref No / UPI Ref / Order ID)
  "utr_number": "...",             // String or null (UTR number)
  "transaction_id": "...",         // String or null (Transaction ID / Txn ID)
  "sender_name": "...",            // String or null (Payer / Sender)
  "receiver_name": "...",          // String or null (Payee / Beneficiary)
  "sender_account": "...",         // String or null (Sender A/c or UPI ID)
  "receiver_account": "...",       // String or null (Receiver A/c or UPI ID)
  "bank_name": "...",              // String or null (Bank Name)
  "ifsc": "...",                   // String or null (IFSC Code)
  "transaction_type": "NEFT",      // String e.g. "UPI", "NEFT", "RTGS", "IMPS", "CARD"
  "payment_status": "SUCCESS",     // String "SUCCESS", "PENDING", "FAILED"
  "remarks": "",                   // String remarks/notes or empty string
  "confidence": 0.95               // Float score between 0.0 and 1.0
}}

RULES:
1. Return ONLY pure valid JSON. No markdown codeblocks (no ```json). No introductory or trailing text.
2. If a field cannot be determined, set its value to null or empty string.
3. Clean commas and currency symbols from the amount field.
"""
