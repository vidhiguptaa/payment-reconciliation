import re
from dataclasses import dataclass
from datetime import datetime
from difflib import SequenceMatcher
from typing import Dict, List

from app.models import ExtractedTransaction, StatementTransaction
from app.services.reconciliation.rules import ReconciliationRulesConfig, default_rules

@dataclass
class ScoreResult:
    total_score: float
    field_scores: Dict[str, float]
    reasons: List[str]

class ReconciliationScorer:
    def __init__(self, config: ReconciliationRulesConfig = default_rules) -> None:
        self.config = config

    @staticmethod
    def fuzzy_ratio(s1: str, s2: str) -> float:
        if not s1 or not s2:
            return 0.0
        str1 = s1.lower().strip()
        str2 = s2.lower().strip()
        if not str1 or not str2:
            return 0.0

        if str1 in str2 or str2 in str1:
            return 1.0

        seq_ratio = SequenceMatcher(None, str1, str2).ratio()

        # Token word intersection ratio for financial narrations
        words1 = set(re.findall(r"\w+", str1))
        words2 = set(re.findall(r"\w+", str2))
        stop_words = {"pvt", "ltd", "inc", "corp", "co", "limited", "upi", "imps", "neft", "rtgs", "ach", "transfer", "pay", "vendor"}
        w1_clean = words1 - stop_words
        w2_clean = words2 - stop_words

        if w1_clean and w2_clean:
            overlap = w1_clean.intersection(w2_clean)
            if overlap:
                token_ratio = len(overlap) / min(len(w1_clean), len(w2_clean))
                return max(seq_ratio, token_ratio)

        return seq_ratio

    @staticmethod
    def parse_date(date_str: str) -> datetime | None:
        if not date_str:
            return None
        try:
            return datetime.strptime(date_str.strip(), "%Y-%m-%d")
        except ValueError:
            return None

    def calculate_score(
        self,
        extracted: ExtractedTransaction,
        statement: StatementTransaction
    ) -> ScoreResult:
        field_scores: Dict[str, float] = {}
        reasons: List[str] = []
        total_score = 0.0

        # 1. Reference Number & UTR matching
        ext_ref = (extracted.reference_number or "").strip()
        ext_utr = (extracted.utr_number or "").strip()
        ext_id = (extracted.transaction_id or "").strip()

        stmt_ref = (statement.reference_number or "").strip()
        stmt_utr = (statement.utr_number or "").strip()
        stmt_id = (statement.transaction_id or "").strip()
        stmt_desc = (statement.description or "").strip()

        ref_matched = False
        if ext_ref and (ext_ref == stmt_ref or ext_ref == stmt_utr or ext_ref == stmt_id or ext_ref in stmt_desc):
            score = self.config.WEIGHT_REF_EXACT
            field_scores["reference_number"] = score
            total_score += score
            reasons.append(f"Exact Reference Number match ({ext_ref})")
            ref_matched = True

        if not ref_matched and ext_utr and (ext_utr == stmt_utr or ext_utr == stmt_ref or ext_utr == stmt_id or ext_utr in stmt_desc):
            score = self.config.WEIGHT_UTR_EXACT
            field_scores["utr_number"] = score
            total_score += score
            reasons.append(f"Exact UTR match ({ext_utr})")
            ref_matched = True

        if not ref_matched and ext_id and (ext_id == stmt_id or ext_id in stmt_desc):
            score = self.config.WEIGHT_TXN_ID_EXACT
            field_scores["transaction_id"] = score
            total_score += score
            reasons.append(f"Exact Transaction ID match ({ext_id})")
            ref_matched = True

        # Fuzzy reference check for minor OCR errors if no exact match
        if not ref_matched and ext_ref and len(ext_ref) >= 6:
            codes = re.findall(r"\b[A-Za-z0-9]{6,18}\b", stmt_desc)
            best_ref_ratio = 0.0
            for code in codes:
                r = SequenceMatcher(None, ext_ref.lower(), code.lower()).ratio()
                if r > best_ref_ratio:
                    best_ref_ratio = r
            if best_ref_ratio >= 0.85:
                fuzzy_score = round(self.config.WEIGHT_REF_EXACT * best_ref_ratio * 0.7, 1)
                field_scores["reference_number"] = fuzzy_score
                total_score += fuzzy_score
                reasons.append(f"Fuzzy Reference Number similarity ({int(best_ref_ratio * 100)}%)")

        # 2. Amount matching
        ext_amt = extracted.amount
        stmt_amt = statement.amount
        if stmt_amt is None and statement.credit is not None:
            stmt_amt = statement.credit
        elif stmt_amt is None and statement.debit is not None:
            stmt_amt = statement.debit

        if ext_amt is not None and stmt_amt is not None:
            ext_abs = abs(ext_amt)
            stmt_abs = abs(stmt_amt)
            diff = abs(ext_abs - stmt_abs)

            if diff < 0.01:
                score = self.config.WEIGHT_AMOUNT_EXACT
                field_scores["amount"] = score
                total_score += score
                reasons.append(f"Exact Amount match (₹{ext_abs:,.2f})")
            elif diff <= 1.0:
                score = self.config.WEIGHT_AMOUNT_TOLERANCE
                field_scores["amount"] = score
                total_score += score
                reasons.append(f"Amount within ₹1.00 tolerance (Diff: ₹{diff:.2f})")

        # 3. Date matching
        ext_date_dt = self.parse_date(extracted.transaction_date or "")
        stmt_date_dt = self.parse_date(statement.transaction_date or "")

        if ext_date_dt and stmt_date_dt:
            days_diff = abs((ext_date_dt - stmt_date_dt).days)
            if days_diff == 0:
                score = self.config.WEIGHT_DATE_EXACT
                field_scores["date"] = score
                total_score += score
                reasons.append("Same Transaction Date")
            elif days_diff <= 1:
                score = self.config.WEIGHT_DATE_TOLERANCE
                field_scores["date"] = score
                total_score += score
                reasons.append("Date within ±1 day tolerance")

        # 4. Beneficiary / Receiver Similarity
        rec_name = (extracted.receiver_name or "").strip()
        if rec_name and stmt_desc:
            ratio = self.fuzzy_ratio(rec_name, stmt_desc)
            if ratio >= 0.5:
                ben_score = round(self.config.WEIGHT_BENEFICIARY_MAX * ratio, 1)
                field_scores["beneficiary"] = ben_score
                total_score += ben_score
                reasons.append(f"Beneficiary similarity ({int(ratio * 100)}%)")

        # 5. Sender Similarity
        send_name = (extracted.sender_name or "").strip()
        if send_name and stmt_desc:
            ratio = self.fuzzy_ratio(send_name, stmt_desc)
            if ratio >= 0.5:
                send_score = round(self.config.WEIGHT_SENDER_MAX * ratio, 1)
                field_scores["sender"] = send_score
                total_score += send_score
                reasons.append(f"Sender similarity ({int(ratio * 100)}%)")

        # 6. Transaction Type match
        ext_type = (extracted.transaction_type or "").strip().lower()
        if ext_type and stmt_desc:
            if ext_type in stmt_desc.lower():
                score = self.config.WEIGHT_TXN_TYPE_MATCH
                field_scores["transaction_type"] = score
                total_score += score
                reasons.append(f"Transaction Type match ({extracted.transaction_type})")

        final_score = min(100.0, round(total_score, 1))

        return ScoreResult(
            total_score=final_score,
            field_scores=field_scores,
            reasons=reasons
        )
