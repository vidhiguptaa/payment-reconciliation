import json
from pathlib import Path
from typing import List, Dict, Any

from app.services.statements.mapper import ColumnMapper
from app.services.statements.normalizer import StatementNormalizer

class XLSXStatementParser:
    def __init__(self, filepath: str) -> None:
        self.filepath = filepath
        self.normalizer = StatementNormalizer()

    def parse(self) -> List[Dict[str, Any]]:
        path = Path(self.filepath)
        if not path.exists():
            raise FileNotFoundError(f"Excel statement file not found at {self.filepath}")

        import pandas as pd  # type: ignore

        # Read full excel sheet without header first to detect header row
        df_raw = pd.read_excel(self.filepath, header=None)
        if df_raw.empty:
            return []

        header_idx = 0
        for idx in range(min(20, len(df_raw))):
            row_str = " ".join(df_raw.iloc[idx].dropna().astype(str)).lower()
            if any(clue in row_str for clue in ["date", "txn", "narration", "description", "amount", "debit", "credit", "balance"]):
                header_idx = idx
                break

        # Re-read with detected header
        df = pd.read_excel(self.filepath, skiprows=header_idx)
        if df.empty:
            return []

        parsed_transactions: List[Dict[str, Any]] = []

        for _, row in df.iterrows():
            row_dict = {str(k): (v if pd.notna(v) else None) for k, v in row.items()}
            # Skip empty rows
            if not any(val is not None and str(val).strip() for val in row_dict.values()):
                continue

            mapped = ColumnMapper.map_row(row_dict)

            tx_date = self.normalizer.normalize_date(mapped["transaction_date"])
            val_date = self.normalizer.normalize_date(mapped["value_date"])
            debit_amt = self.normalizer.normalize_amount(mapped["debit"])
            credit_amt = self.normalizer.normalize_amount(mapped["credit"])
            net_amt = self.normalizer.normalize_amount(mapped["amount"])
            balance_amt = self.normalizer.normalize_amount(mapped["balance"])

            if net_amt is None:
                if credit_amt is not None:
                    net_amt = credit_amt
                elif debit_amt is not None:
                    net_amt = -abs(debit_amt)

            ref_no = self.normalizer.normalize_text(mapped["reference_number"])
            utr_no = self.normalizer.normalize_text(mapped["utr_number"]) or ref_no

            parsed_transactions.append({
                "transaction_date": tx_date,
                "value_date": val_date,
                "description": self.normalizer.normalize_text(mapped["description"]),
                "reference_number": ref_no,
                "utr_number": utr_no,
                "transaction_id": self.normalizer.normalize_text(mapped["transaction_id"]),
                "debit": debit_amt,
                "credit": credit_amt,
                "amount": net_amt,
                "balance": balance_amt,
                "currency": "INR",
                "bank_name": None,
                "raw_row_json": json.dumps(row_dict, default=str, ensure_ascii=False)
            })

        return parsed_transactions
