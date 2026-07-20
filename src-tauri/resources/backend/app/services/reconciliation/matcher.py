from dataclasses import dataclass
from typing import List, Optional, Dict
from sqlalchemy.orm import Session

from app.models import ExtractedTransaction, StatementTransaction, MatchStatus
from app.services.reconciliation.rules import ReconciliationRulesConfig, default_rules
from app.services.reconciliation.scoring import ReconciliationScorer, ScoreResult

@dataclass
class MatchDecision:
    match_status: str
    best_statement_transaction: Optional[StatementTransaction]
    confidence_score: float
    reasons: List[str]
    field_scores: Dict[str, float]
    candidate_matches_count: int

class TransactionMatcher:
    def __init__(self, config: ReconciliationRulesConfig = default_rules) -> None:
        self.config = config
        self.scorer = ReconciliationScorer(config)

    def match_transaction(
        self,
        extracted: ExtractedTransaction,
        db: Session
    ) -> MatchDecision:
        # Fetch candidate statement transactions
        # Quick pre-filter: if amount is present, filter statement transactions within ±10% or ±100 rupees
        query = db.query(StatementTransaction)
        candidates = query.all()

        if not candidates:
            return MatchDecision(
                match_status=MatchStatus.UNMATCHED.value,
                best_statement_transaction=None,
                confidence_score=0.0,
                reasons=["No bank statement transactions imported yet."],
                field_scores={},
                candidate_matches_count=0
            )

        scored_candidates: List[tuple[StatementTransaction, ScoreResult]] = []
        for candidate in candidates:
            score_res = self.scorer.calculate_score(extracted, candidate)
            if score_res.total_score >= self.config.THRESHOLD_POSSIBLE_MATCH:
                scored_candidates.append((candidate, score_res))

        if not scored_candidates:
            return MatchDecision(
                match_status=MatchStatus.UNMATCHED.value,
                best_statement_transaction=None,
                confidence_score=0.0,
                reasons=["No matching statement transactions found above confidence threshold (70%)."],
                field_scores={},
                candidate_matches_count=0
            )

        # Sort candidates descending by total_score
        scored_candidates.sort(key=lambda x: x[1].total_score, reverse=True)

        top_candidate, top_score_res = scored_candidates[0]

        # Check for multi-candidate collision >= 90
        high_score_candidates = [c for c in scored_candidates if c[1].total_score >= self.config.THRESHOLD_MATCHED]

        if len(high_score_candidates) > 1:
            # Multiple strong candidate matches -> NEEDS_REVIEW
            reasons = [
                f"Multiple ({len(high_score_candidates)}) statement candidates score above {self.config.THRESHOLD_MATCHED}%. Requires human review."
            ] + top_score_res.reasons
            return MatchDecision(
                match_status=MatchStatus.NEEDS_REVIEW.value,
                best_statement_transaction=top_candidate,
                confidence_score=top_score_res.total_score,
                reasons=reasons,
                field_scores=top_score_res.field_scores,
                candidate_matches_count=len(high_score_candidates)
            )

        if top_score_res.total_score >= self.config.THRESHOLD_MATCHED:
            return MatchDecision(
                match_status=MatchStatus.MATCHED.value,
                best_statement_transaction=top_candidate,
                confidence_score=top_score_res.total_score,
                reasons=top_score_res.reasons,
                field_scores=top_score_res.field_scores,
                candidate_matches_count=1
            )

        # Score is between 70.0 and 89.9
        return MatchDecision(
            match_status=MatchStatus.POSSIBLE_MATCH.value,
            best_statement_transaction=top_candidate,
            confidence_score=top_score_res.total_score,
            reasons=top_score_res.reasons,
            field_scores=top_score_res.field_scores,
            candidate_matches_count=len(scored_candidates)
        )
