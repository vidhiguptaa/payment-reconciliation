from typing import Dict, Any, Optional
from app.models import ExtractedTransaction, StatementTransaction
from app.services.reconciliation.scoring import ReconciliationScorer

class FieldComparisonStatus:
    MATCH = "MATCH"
    PARTIAL_MATCH = "PARTIAL MATCH"
    MISMATCH = "MISMATCH"
    NOT_AVAILABLE = "NOT AVAILABLE"

class ExplanationGenerator:
    @staticmethod
    def get_field_comparison(
        extracted: ExtractedTransaction,
        statement: Optional[StatementTransaction]
    ) -> Dict[str, Dict[str, Any]]:
        fields = [
            "amount", "date", "reference", "utr", "beneficiary",
            "sender", "transaction_type", "bank", "ifsc"
        ]

        result: Dict[str, Dict[str, Any]] = {}

        if not statement:
            for field in fields:
                result[field] = {
                    "extracted": getattr(extracted, field, None) if hasattr(extracted, field) else None,
                    "statement": None,
                    "status": FieldComparisonStatus.NOT_AVAILABLE,
                }
            return result

        # 1. Amount Comparison
        ext_amt = extracted.amount
        stmt_amt = statement.amount or statement.credit or statement.debit
        amt_status = FieldComparisonStatus.NOT_AVAILABLE
        if ext_amt is not None and stmt_amt is not None:
            diff = abs(abs(ext_amt) - abs(stmt_amt))
            if diff < 0.01:
                amt_status = FieldComparisonStatus.MATCH
            elif diff <= 1.0:
                amt_status = FieldComparisonStatus.PARTIAL_MATCH
            else:
                amt_status = FieldComparisonStatus.MISMATCH

        result["amount"] = {
            "extracted": f"₹{ext_amt:,.2f}" if ext_amt is not None else None,
            "statement": f"₹{stmt_amt:,.2f}" if stmt_amt is not None else None,
            "status": amt_status
        }

        # 2. Date Comparison
        ext_date = extracted.transaction_date
        stmt_date = statement.transaction_date
        date_status = FieldComparisonStatus.NOT_AVAILABLE
        if ext_date and stmt_date:
            if ext_date == stmt_date:
                date_status = FieldComparisonStatus.MATCH
            else:
                ext_dt = ReconciliationScorer.parse_date(ext_date)
                stmt_dt = ReconciliationScorer.parse_date(stmt_date)
                if ext_dt and stmt_dt and abs((ext_dt - stmt_dt).days) <= 1:
                    date_status = FieldComparisonStatus.PARTIAL_MATCH
                else:
                    date_status = FieldComparisonStatus.MISMATCH

        result["date"] = {
            "extracted": ext_date,
            "statement": stmt_date,
            "status": date_status
        }

        # 3. Reference Comparison
        ext_ref = extracted.reference_number
        stmt_ref = statement.reference_number
        stmt_desc = statement.description or ""
        ref_status = FieldComparisonStatus.NOT_AVAILABLE
        if ext_ref:
            if stmt_ref and ext_ref.strip().lower() == stmt_ref.strip().lower():
                ref_status = FieldComparisonStatus.MATCH
            elif ext_ref.strip() in stmt_desc:
                ref_status = FieldComparisonStatus.MATCH
            elif stmt_ref or stmt_desc:
                ref_status = FieldComparisonStatus.MISMATCH

        result["reference"] = {
            "extracted": ext_ref,
            "statement": stmt_ref or (ext_ref if (ext_ref and ext_ref in stmt_desc) else None),
            "status": ref_status
        }

        # 4. UTR Comparison
        ext_utr = extracted.utr_number
        stmt_utr = statement.utr_number
        utr_status = FieldComparisonStatus.NOT_AVAILABLE
        if ext_utr:
            if stmt_utr and ext_utr.strip().lower() == stmt_utr.strip().lower():
                utr_status = FieldComparisonStatus.MATCH
            elif ext_utr.strip() in stmt_desc:
                utr_status = FieldComparisonStatus.MATCH
            elif stmt_utr or stmt_desc:
                utr_status = FieldComparisonStatus.MISMATCH

        result["utr"] = {
            "extracted": ext_utr,
            "statement": stmt_utr or (ext_utr if (ext_utr and ext_utr in stmt_desc) else None),
            "status": utr_status
        }

        # 5. Beneficiary Comparison
        ext_ben = extracted.receiver_name
        ben_status = FieldComparisonStatus.NOT_AVAILABLE
        if ext_ben:
            ratio = ReconciliationScorer.fuzzy_ratio(ext_ben, stmt_desc)
            if ratio >= 0.8:
                ben_status = FieldComparisonStatus.MATCH
            elif ratio >= 0.5:
                ben_status = FieldComparisonStatus.PARTIAL_MATCH
            else:
                ben_status = FieldComparisonStatus.MISMATCH

        result["beneficiary"] = {
            "extracted": ext_ben,
            "statement": stmt_desc,
            "status": ben_status
        }

        # 6. Sender Comparison
        ext_send = extracted.sender_name
        send_status = FieldComparisonStatus.NOT_AVAILABLE
        if ext_send:
            ratio = ReconciliationScorer.fuzzy_ratio(ext_send, stmt_desc)
            if ratio >= 0.8:
                send_status = FieldComparisonStatus.MATCH
            elif ratio >= 0.5:
                send_status = FieldComparisonStatus.PARTIAL_MATCH
            else:
                send_status = FieldComparisonStatus.MISMATCH

        result["sender"] = {
            "extracted": ext_send,
            "statement": stmt_desc,
            "status": send_status
        }

        # 7. Transaction Type
        ext_type = extracted.transaction_type
        type_status = FieldComparisonStatus.NOT_AVAILABLE
        if ext_type:
            if ext_type.lower() in stmt_desc.lower():
                type_status = FieldComparisonStatus.MATCH
            else:
                type_status = FieldComparisonStatus.MISMATCH

        result["transaction_type"] = {
            "extracted": ext_type,
            "statement": ext_type if type_status == FieldComparisonStatus.MATCH else None,
            "status": type_status
        }

        # 8. Bank Name
        ext_bank = extracted.bank_name
        stmt_bank = statement.bank_name
        bank_status = FieldComparisonStatus.NOT_AVAILABLE
        if ext_bank:
            if stmt_bank and ext_bank.lower() in stmt_bank.lower():
                bank_status = FieldComparisonStatus.MATCH
            else:
                bank_status = FieldComparisonStatus.MISMATCH

        result["bank"] = {
            "extracted": ext_bank,
            "statement": stmt_bank,
            "status": bank_status
        }

        # 9. IFSC Code
        ext_ifsc = extracted.ifsc
        ifsc_status = FieldComparisonStatus.NOT_AVAILABLE
        if ext_ifsc:
            if ext_ifsc in stmt_desc:
                ifsc_status = FieldComparisonStatus.MATCH
            else:
                ifsc_status = FieldComparisonStatus.MISMATCH

        result["ifsc"] = {
            "extracted": ext_ifsc,
            "statement": ext_ifsc if ifsc_status == FieldComparisonStatus.MATCH else None,
            "status": ifsc_status
        }

        return result
