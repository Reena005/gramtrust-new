"""Explain unusual GramTrust bid patterns with review-oriented rules."""

from __future__ import annotations

import numpy as np
import pandas as pd

from feature_extraction import load_bid_features
from isolation_forest import MODEL_FEATURE_COLUMNS, detect_anomalies

RULES = (
    (
        "HIGH_BID_TO_ESTIMATE_RATIO",
        "Bid amount is more than 20% above the tender estimated value.",
        lambda frame: frame["bid_to_estimate_ratio"] > 1.20,
    ),
    (
        "LOW_BID_TO_ESTIMATE_RATIO",
        "Bid amount is more than 30% below the tender estimated value.",
        lambda frame: frame["bid_to_estimate_ratio"] < 0.70,
    ),
    (
        "LARGE_BID_DEVIATION",
        "Bid differs from the tender's average bid by more than 50%.",
        lambda frame: frame["bid_deviation_from_tender_average"].abs() > 0.50,
    ),
    (
        "HIGH_VENDOR_BID_ACTIVITY",
        "Vendor has submitted bids for seven or more tenders in the analyzed data.",
        lambda frame: frame["vendor_bid_count"] >= 7,
    ),
    (
        "HIGH_VENDOR_WIN_RATE",
        "Vendor has a high rank-1 rate across at least four bids in the analyzed data.",
        lambda frame: (frame["vendor_win_rate"] >= 0.75)
        & (frame["vendor_bid_count"] >= 4),
    ),
    (
        "LOW_TENDER_COMPETITION",
        "Tender has two or fewer recorded bids in the analyzed data.",
        lambda frame: frame["tender_bid_count"] <= 2,
    ),
)

NORMAL_STATUS = "NORMAL"
SUSPICIOUS_STATUS = "SUSPICIOUS — AUDITOR REVIEW REQUIRED"
ANOMALOUS_STATUS = "ANOMALOUS — AUDITOR REVIEW REQUIRED"

SAMPLE_COLUMNS = [
    "bid_id",
    "tender_id",
    "vendor_name",
    "bid_amount",
    "tender_estimated_value",
    "bid_to_estimate_ratio",
    "anomaly_score",
    "anomaly_prediction",
    "rule_flags",
    "rule_explanations",
    "rule_count",
    "final_status",
]


def apply_validation_rules(anomaly_results: pd.DataFrame) -> pd.DataFrame:
    """Add rule evidence and a human-review status without changing model output."""
    required_columns = set(MODEL_FEATURE_COLUMNS) | {"anomaly_prediction"}
    missing_columns = required_columns.difference(anomaly_results.columns)
    if missing_columns:
        raise ValueError(
            f"Anomaly results are missing required columns: "
            f"{', '.join(sorted(missing_columns))}"
        )

    features = anomaly_results.copy()
    for column, _, _ in RULES:
        feature_name = {
            "HIGH_BID_TO_ESTIMATE_RATIO": "bid_to_estimate_ratio",
            "LOW_BID_TO_ESTIMATE_RATIO": "bid_to_estimate_ratio",
            "LARGE_BID_DEVIATION": "bid_deviation_from_tender_average",
            "HIGH_VENDOR_BID_ACTIVITY": "vendor_bid_count",
            "HIGH_VENDOR_WIN_RATE": "vendor_win_rate",
            "LOW_TENDER_COMPETITION": "tender_bid_count",
        }[column]
        features[feature_name] = pd.to_numeric(
            features[feature_name], errors="raise"
        )

    if not features["anomaly_prediction"].isin([-1, 1]).all():
        raise ValueError("anomaly_prediction must contain only -1 and 1.")

    rule_flags: list[list[str]] = [[] for _ in range(len(features))]
    rule_explanations: list[list[str]] = [[] for _ in range(len(features))]
    for flag, explanation, predicate in RULES:
        triggered = predicate(features).fillna(False).to_numpy(dtype=bool)
        for index in np.flatnonzero(triggered):
            rule_flags[index].append(flag)
            rule_explanations[index].append(explanation)

    result = features.copy()
    result["rule_flags"] = rule_flags
    result["rule_explanations"] = rule_explanations
    result["rule_count"] = result["rule_flags"].map(len).astype("int64")
    result["rule_status"] = np.where(result["rule_count"] > 0, "FLAGGED", "CLEAR")

    is_anomalous = result["anomaly_prediction"].eq(-1)
    has_rules = result["rule_count"].gt(0)
    result["final_status"] = np.select(
        [has_rules, is_anomalous],
        [SUSPICIOUS_STATUS, ANOMALOUS_STATUS],
        default=NORMAL_STATUS,
    )
    return result


def main() -> None:
    feature_data = load_bid_features()
    anomaly_results = detect_anomalies(feature_data)
    result = apply_validation_rules(anomaly_results)

    total_records = len(result)
    anomalous_records = int(result["anomaly_prediction"].eq(-1).sum())
    flagged_records = int(result["rule_count"].gt(0).sum())
    status_counts = result["final_status"].value_counts()

    print("Rule-Based Validation")
    print("---------------------")
    print(f"\nTotal records: {total_records}")
    print(f"\nIsolation Forest anomalies: {anomalous_records}")
    print(f"\nRecords with at least one rule flag: {flagged_records}")
    print("\nFinal status:")
    print(f"{NORMAL_STATUS}: {int(status_counts.get(NORMAL_STATUS, 0))}")
    print(f"{SUSPICIOUS_STATUS}: {int(status_counts.get(SUSPICIOUS_STATUS, 0))}")
    print(f"{ANOMALOUS_STATUS}: {int(status_counts.get(ANOMALOUS_STATUS, 0))}")
    print("\nRule frequency:")
    for flag, _, _ in RULES:
        frequency = sum(flag in flags for flags in result["rule_flags"])
        print(f"{flag}: {frequency}")

    flagged = result.loc[result["final_status"] != NORMAL_STATUS, SAMPLE_COLUMNS]
    print("\nExample flagged records:")
    print(flagged.head(10).to_string(index=False))

    numeric_values = result[MODEL_FEATURE_COLUMNS].to_numpy(dtype=np.float64)
    if not np.isfinite(numeric_values).all():
        raise RuntimeError("Rule engine introduced invalid numeric feature values.")


if __name__ == "__main__":
    main()
