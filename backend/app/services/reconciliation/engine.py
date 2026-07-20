import json
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy.orm import Session

from app.models import (
    ExtractedTransaction,
    TransactionMatch,
    MatchType,
)
from app.services.reconciliation.matcher import TransactionMatcher

class ReconciliationEngine:
    def __init__(self) -> None:
        self.matcher = TransactionMatcher()

    def reconcile_transaction(
        self,
        extracted_transaction_id: int,
        db: Session
    ) -> Optional[TransactionMatch]:
        extracted = (
            db.query(ExtractedTransaction)
            .filter(ExtractedTransaction.id == extracted_transaction_id)
            .first()
        )
        if not extracted:
            return None

        # Check existing match
        existing_match = (
            db.query(TransactionMatch)
            .filter(TransactionMatch.extracted_transaction_id == extracted_transaction_id)
            .first()
        )

        # LOCK CHECK: Never overwrite manual matches
        if existing_match and existing_match.match_type == MatchType.MANUALLY_MATCHED.value:
            return existing_match

        # Execute deterministic matching
        decision = self.matcher.match_transaction(extracted, db)

        stmt_id = decision.best_statement_transaction.id if decision.best_statement_transaction else None

        if existing_match:
            existing_match.statement_transaction_id = stmt_id
            existing_match.match_status = decision.match_status
            existing_match.match_type = MatchType.AUTO_MATCHED.value
            existing_match.confidence_score = decision.confidence_score
            existing_match.match_reason_json = json.dumps(decision.reasons, ensure_ascii=False)
            existing_match.field_scores_json = json.dumps(decision.field_scores, ensure_ascii=False)
            existing_match.updated_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(existing_match)
            return existing_match
        else:
            new_match = TransactionMatch(
                extracted_transaction_id=extracted_transaction_id,
                statement_transaction_id=stmt_id,
                match_status=decision.match_status,
                match_type=MatchType.AUTO_MATCHED.value,
                confidence_score=decision.confidence_score,
                match_reason_json=json.dumps(decision.reasons, ensure_ascii=False),
                field_scores_json=json.dumps(decision.field_scores, ensure_ascii=False),
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            db.add(new_match)
            db.commit()
            db.refresh(new_match)
            return new_match

    def reconcile_all(self, db: Session) -> List[TransactionMatch]:
        extracted_txs = db.query(ExtractedTransaction).all()
        results: List[TransactionMatch] = []
        for tx in extracted_txs:
            res = self.reconcile_transaction(tx.id, db)
            if res:
                results.append(res)
        return results
