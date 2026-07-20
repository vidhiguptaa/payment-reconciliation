from dataclasses import dataclass

@dataclass
class ReconciliationRulesConfig:
    # Rule Weights
    WEIGHT_REF_EXACT: float = 60.0
    WEIGHT_UTR_EXACT: float = 60.0
    WEIGHT_TXN_ID_EXACT: float = 50.0
    WEIGHT_AMOUNT_EXACT: float = 25.0
    WEIGHT_AMOUNT_TOLERANCE: float = 20.0  # within ±1.0
    WEIGHT_DATE_EXACT: float = 10.0
    WEIGHT_DATE_TOLERANCE: float = 5.0    # within ±1 day
    WEIGHT_BENEFICIARY_MAX: float = 10.0   # 0 to 10 based on fuzzy ratio
    WEIGHT_SENDER_MAX: float = 5.0        # 0 to 5 based on fuzzy ratio
    WEIGHT_TXN_TYPE_MATCH: float = 5.0
    WEIGHT_BANK_NAME_MATCH: float = 2.0
    WEIGHT_IFSC_MATCH: float = 3.0

    # Decision Thresholds
    THRESHOLD_MATCHED: float = 90.0
    THRESHOLD_POSSIBLE_MATCH: float = 70.0

default_rules = ReconciliationRulesConfig()
