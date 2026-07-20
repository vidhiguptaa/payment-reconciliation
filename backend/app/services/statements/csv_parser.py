import csv
import json
from pathlib import Path
from typing import List, Dict, Any

from app.services.statements.mapper import ColumnMapper
from app.services.statements.normalizer import StatementNormalizer

class CSVStatementParser:
    def __init__(self, filepath: str) -> None:
        self.filepath = filepath
        self.normalizer = StatementNormalizer()

    def parse(self) -> List[Dict[str, Any]]:
        path = Path(self.filepath)
        if not path.exists():
            raise FileNotFoundError(f"CSV statement file not found at {self.filepath}")

        # Read lines and detect header index
        lines = []
        with open(self.filepath, mode="r", encoding="utf-8-sig", errors="replace") as f:
            lines = f.readlines()

        if not lines:
            return []

        header_index = 0
        # Find first line containing date/amount header clues
        for idx, line in enumerate(lines[:15]):
            line_lower = line.lower()
            if any(clue in line_lower for clue in ["date", "txn", "narration", "description", "amount", "debit", "credit", "balance"]):
                header_index = idx
                break

        csv_reader = csv.DictReader(lines[header_index:])
        parsed_transactions: List[Dict[str, Any]] = []

        for row in csv_reader:
            # Skip empty rows
            if not row or not any(str(val).strip() for val in row.values() if val):
                continue

            mapped = ColumnMapper.map_row(row)
            
            tx_date = self.normalizer.normalize_date(mapped["transaction_date"])
            val_date = self.normalizer.normalize_date(mapped["value_date"])
            debit_amt = self.normalizer.normalize_amount(mapped["debit"])
            credit_amt = self.normalizer.normalize_amount(mapped["credit"])
            net_amt = self.normalizer.normalize_amount(mapped["amount"])
            balance_amt = self.normalizer.normalize_amount(mapped["balance"])

            # Compute net signed amount if not explicitly provided
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
                "raw_row_json": json.dumps(row, ensure_ascii=False)
            })

        return parsed_transactions
