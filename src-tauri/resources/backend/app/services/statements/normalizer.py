import re
from datetime import datetime
from typing import Any, Optional

class StatementNormalizer:
    @staticmethod
    def normalize_amount(val: Any) -> Optional[float]:
        if val is None:
            return None
        if isinstance(val, (int, float)):
            return float(val)

        s = str(val).strip()
        if not s or s.lower() in ("nan", "null", "none", "-"):
            return None

        # Remove prefix currency symbols/text (e.g. ₹, Rs., Rs, INR, $)
        s = re.sub(r"^(?:[₹$]|Rs\.?|INR)\s*", "", s, flags=re.IGNORECASE).strip()
        # Remove commas
        s = s.replace(",", "")

        # Extract float match
        match = re.search(r"[-+]?\d+(?:\.\d+)?", s)
        if match:
            try:
                return float(match.group(0))
            except ValueError:
                return None
        return None

    @staticmethod
    def normalize_date(val: Any) -> Optional[str]:
        if not val:
            return None
        s = str(val).strip()
        if not s or s.lower() in ("nan", "null", "none"):
            return None

        # Format ISO if already timestamp
        if isinstance(val, datetime):
            return val.strftime("%Y-%m-%d")

        formats = [
            "%Y-%m-%d",
            "%d-%m-%Y",
            "%d/%m/%Y",
            "%d %b %Y",
            "%d %B %Y",
            "%b %d, %Y",
            "%B %d, %Y",
            "%Y/%m/%d",
            "%d.%m.%Y",
            "%d-%b-%Y",
            "%d-%b-%y",
        ]

        for fmt in formats:
            try:
                dt = datetime.strptime(s, fmt)
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                continue

        # Regex fallback
        iso_match = re.search(r"\b(20\d{2})[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b", s)
        if iso_match:
            return f"{iso_match.group(1)}-{iso_match.group(2)}-{iso_match.group(3)}"

        dmy_match = re.search(r"\b(0[1-9]|[12]\d|3[01])[-/.](0[1-9]|1[0-2])[-/.](20\d{2})\b", s)
        if dmy_match:
            return f"{dmy_match.group(3)}-{dmy_match.group(2)}-{dmy_match.group(1)}"

        return s

    @staticmethod
    def normalize_text(val: Any) -> Optional[str]:
        if val is None:
            return None
        s = str(val).strip()
        return s if s and s.lower() not in ("nan", "null", "none") else None
