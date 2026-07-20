import re
from datetime import datetime
from typing import Any, Optional

class TransactionNormalizer:
    @staticmethod
    def normalize_amount(val: Any) -> Optional[float]:
        if val is None:
            return None
        if isinstance(val, (int, float)):
            return float(val)

        s = str(val).strip()
        if not s:
            return None

        # Remove prefix currency symbols/text (e.g. ₹, Rs., Rs, INR, $)
        s = re.sub(r"^(?:[₹$]|Rs\.?|INR)\s*", "", s, flags=re.IGNORECASE).strip()
        # Remove commas
        s = s.replace(",", "")

        # Extract first valid float pattern
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
        if not s:
            return None

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
        ]

        for fmt in formats:
            try:
                dt = datetime.strptime(s, fmt)
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                continue

        iso_match = re.search(r"\b(20\d{2})[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b", s)
        if iso_match:
            return f"{iso_match.group(1)}-{iso_match.group(2)}-{iso_match.group(3)}"

        dmy_match = re.search(r"\b(0[1-9]|[12]\d|3[01])[-/.](0[1-9]|1[0-2])[-/.](20\d{2})\b", s)
        if dmy_match:
            return f"{dmy_match.group(3)}-{dmy_match.group(2)}-{dmy_match.group(1)}"

        return s

    @staticmethod
    def normalize_time(val: Any) -> Optional[str]:
        if not val:
            return None
        s = str(val).strip()
        if not s:
            return None

        formats = [
            "%I:%M:%S %p",
            "%I:%M %p",
            "%I:%M:%S%p",
            "%I:%M%p",
            "%H:%M:%S",
            "%H:%M",
        ]

        for fmt in formats:
            try:
                dt = datetime.strptime(s, fmt)
                return dt.strftime("%H:%M:%S")
            except ValueError:
                continue

        time_match = re.search(r"\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM|am|pm)?\b", s)
        if time_match:
            hours = int(time_match.group(1))
            minutes = int(time_match.group(2))
            seconds = int(time_match.group(3)) if time_match.group(3) else 0
            meridiem = time_match.group(4)

            if meridiem:
                meridiem = meridiem.upper()
                if meridiem == "PM" and hours < 12:
                    hours += 12
                elif meridiem == "AM" and hours == 12:
                    hours = 0

            return f"{hours:02d}:{minutes:02d}:{seconds:02d}"

        return s

    @staticmethod
    def normalize_text(val: Any) -> Optional[str]:
        if val is None:
            return None
        s = str(val).strip()
        return s if s else None

    @staticmethod
    def normalize_uppercase(val: Any) -> Optional[str]:
        if val is None:
            return None
        s = str(val).strip().upper()
        s = re.sub(r"\s+", "", s)
        return s if s else None
