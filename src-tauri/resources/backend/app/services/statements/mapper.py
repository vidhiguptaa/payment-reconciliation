import re
from typing import Dict, Any, Optional

class ColumnMapper:
    COLUMN_ALIASES = {
        "transaction_date": [
            "transaction date", "txn date", "date", "txndate", "tran date",
            "post date", "booking date", "transaction_date"
        ],
        "value_date": [
            "value date", "val date", "value_date", "vdate"
        ],
        "description": [
            "description", "narration", "particulars", "remarks", "details",
            "transaction description", "transaction details", "description / narration"
        ],
        "reference_number": [
            "reference number", "ref no", "ref. no.", "reference", "ref_no",
            "cheque no", "cheque/ref no", "chq/ref no", "ref num", "reference_number"
        ],
        "utr_number": [
            "utr", "utr number", "utr no", "utr_number", "rrn", "rrn number"
        ],
        "transaction_id": [
            "transaction id", "txn id", "txnid", "transaction_id", "id"
        ],
        "debit": [
            "debit", "withdrawal", "withdrawals", "debit amount", "dr", "dr amount"
        ],
        "credit": [
            "credit", "deposit", "deposits", "credit amount", "cr", "cr amount"
        ],
        "amount": [
            "amount", "net amount", "transaction amount", "amt"
        ],
        "balance": [
            "balance", "closing balance", "running balance", "avail balance", "bal"
        ],
    }

    @classmethod
    def match_header(cls, header_name: str) -> Optional[str]:
        cleaned = re.sub(r"[^\w\s]", "", str(header_name).lower()).strip()
        for canonical, aliases in cls.COLUMN_ALIASES.items():
            if cleaned in aliases:
                return canonical
        return None

    @classmethod
    def map_row(cls, row_dict: Dict[str, Any]) -> Dict[str, Any]:
        mapped: Dict[str, Any] = {
            "transaction_date": None,
            "value_date": None,
            "description": None,
            "reference_number": None,
            "utr_number": None,
            "transaction_id": None,
            "debit": None,
            "credit": None,
            "amount": None,
            "balance": None,
        }

        for raw_key, raw_val in row_dict.items():
            if not raw_key:
                continue
            matched_canonical = cls.match_header(str(raw_key))
            if matched_canonical and mapped[matched_canonical] is None:
                mapped[matched_canonical] = raw_val

        return mapped
