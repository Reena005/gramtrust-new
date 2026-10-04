"""Aggregate bid-level anomaly results into tender-level review summaries.

Risk-index formula (each component is normalized to 0-100):
  * Bid review proportion: (suspicious + anomalous bids) / all tender bids.
  * Rule proportion: bids with one or more rule flags / all tender bids.
  * Strongest anomaly signal: inverse min-max normalization of the most
    negative Isolation Forest decision_function score across all bids. This
    is a relative model signal, not a probability.
  * Vendor/rule concentration: average of high-activity vendors / known
    vendors, high-win-rate vendors / known vendors, the low-competition
    indicator (0 or 100), and the most frequent rule flag / tender bid count.

The weighted index is 40% bid review proportion, 25% rule proportion, 20%
strongest anomaly signal, and 15% vendor/rule concentration. It is a review
category index, not a fraud probability or proof of fraud.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from feature_extraction import load_bid_features
from isolation_forest import detect_anomalies
from rule_engine import (
    ANOMALOUS_STATUS,
    SUSPICIOUS_STATUS,
    apply_validation_rules,
)

MODEL_VERSION = "3.0.0-isolation-forest-rules"
OUTPUT_PATH = Path(__file__).resolve().with_name("tender_risk_results.csv")

REQUIRED_COLUMNS = {
    "bid_id",
    "tender_id",
    "vendor_id",
    "vendor_name",
    "tender_estimated_value",
    "vendor_bid_count",
    "vendor_win_rate",
    "anomaly_prediction",
    "anomaly_score",
    "rule_flags",
    "rule_explanations",
    "rule_count",
    "final_status",
}

OUTPUT_COLUMNS = [
    "tender_id",
    "tender_estimated_value",
    "tender_bid_count",
    "anomaly_bid_count",
    "anomaly_bid_percentage",
    "suspicious_bid_count",
    "suspicious_bid_percentage",
    "anomalous_bid_count",
    "highest_anomaly_score",
    "average_anomaly_score",
    "rule_flagged_bid_count",
    "unique_vendor_count",
    "high_vendor_activity_count",
    "high_vendor_win_rate_count",
    "low_tender_competition_flag",
    "rule_flags_summary",
    "risk_score",
    "risk_level",
    "summary",
    "model_version",
    "features",
    "flags",
    "raw_response",
]

RULE_FLAGS = (
    "HIGH_BID_TO_ESTIMATE_RATIO",
    "LOW_BID_TO_ESTIMATE_RATIO",
    "LARGE_BID_DEVIATION",
    "HIGH_VENDOR_BID_ACTIVITY",
    "HIGH_VENDOR_WIN_RATE",
    "LOW_TENDER_COMPETITION",
)


def _json_safe(value: Any) -> Any:
    """Convert pandas/numpy values to JSON-compatible Python values."""
    if value is None or value is pd.NA:
        return None
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float) and not np.isfinite(value):
        return None
    if pd.isna(value):
        return None
    return value


def _numeric_value(value: Any) -> float:
    numeric = pd.to_numeric(value, errors="coerce")
    if pd.isna(numeric) or not np.isfinite(float(numeric)):
        return 0.0
    return float(numeric)


def _normalize_proportion(count: int, total: int) -> float:
    return 100.0 * count / total if total else 0.0


def _risk_level(risk_score: int) -> str:
    if risk_score <= 29:
        return "LOW"
    if risk_score <= 59:
        return "MEDIUM"
    return "HIGH"


def aggregate_tenders(bid_results: pd.DataFrame) -> pd.DataFrame:
    """Produce one risk-indexed, JSON-compatible output row per tender."""
    missing_columns = REQUIRED_COLUMNS.difference(bid_results.columns)
    if missing_columns:
        raise ValueError(
            f"Step 4 output is missing required columns: "
            f"{', '.join(sorted(missing_columns))}"
        )
    if bid_results["tender_id"].isna().any():
        raise ValueError("Step 4 output contains bids without a tender_id.")
    if not bid_results["anomaly_prediction"].isin([-1, 1]).all():
        raise ValueError("anomaly_prediction must contain only -1 and 1.")

    anomaly_scores = pd.to_numeric(bid_results["anomaly_score"], errors="coerce")
    if anomaly_scores.isna().any() or not np.isfinite(
        anomaly_scores.to_numpy(dtype=np.float64)
    ).all():
        raise ValueError("Step 4 output contains invalid anomaly_score values.")

    global_min_score = float(anomaly_scores.min()) if len(anomaly_scores) else 0.0
    global_max_score = float(anomaly_scores.max()) if len(anomaly_scores) else 0.0
    score_range = global_max_score - global_min_score
    output_rows: list[dict[str, Any]] = []

    for tender_id, bids in bid_results.groupby("tender_id", sort=False):
        total_bids = len(bids)
        if total_bids == 0:
            continue

        predictions = pd.to_numeric(bids["anomaly_prediction"], errors="raise")
        anomalous_mask = predictions.eq(-1)
        suspicious_mask = bids["final_status"].eq(SUSPICIOUS_STATUS)
        anomalous_only_mask = bids["final_status"].eq(ANOMALOUS_STATUS)
        rule_flagged_mask = pd.to_numeric(
            bids["rule_count"], errors="raise"
        ).gt(0)

        anomaly_bid_count = int(anomalous_mask.sum())
        suspicious_bid_count = int(suspicious_mask.sum())
        anomalous_bid_count = int(anomalous_only_mask.sum())
        rule_flagged_bid_count = int(rule_flagged_mask.sum())
        unique_vendor_count = int(bids["vendor_id"].nunique(dropna=True))

        vendors = bids.loc[bids["vendor_id"].notna()].drop_duplicates("vendor_id")
        high_vendor_activity_count = int(
            pd.to_numeric(vendors["vendor_bid_count"], errors="coerce")
            .ge(7)
            .sum()
        )
        high_vendor_win_rate_count = int(
            (
                pd.to_numeric(vendors["vendor_win_rate"], errors="coerce").ge(0.75)
                & pd.to_numeric(vendors["vendor_bid_count"], errors="coerce").ge(4)
            ).sum()
        )

        flag_counts = {flag: 0 for flag in RULE_FLAGS}
        for flags in bids["rule_flags"]:
            if isinstance(flags, (list, tuple)):
                for flag in flags:
                    if flag in flag_counts:
                        flag_counts[flag] += 1
        rule_flags_summary = {
            flag: count for flag, count in flag_counts.items() if count > 0
        }
        low_competition = flag_counts["LOW_TENDER_COMPETITION"] > 0

        strongest_score = float(anomaly_scores.loc[bids.index].min())
        if score_range > 0:
            strongest_signal_component = (
                100.0 * (global_max_score - strongest_score) / score_range
            )
        else:
            strongest_signal_component = 0.0
        strongest_signal_component = float(
            np.clip(strongest_signal_component, 0.0, 100.0)
        )

        review_bid_component = _normalize_proportion(
            suspicious_bid_count + anomalous_bid_count,
            total_bids,
        )
        rule_bid_component = _normalize_proportion(
            rule_flagged_bid_count,
            total_bids,
        )
        known_vendor_denominator = unique_vendor_count
        activity_vendor_component = _normalize_proportion(
            high_vendor_activity_count,
            known_vendor_denominator,
        )
        win_rate_vendor_component = _normalize_proportion(
            high_vendor_win_rate_count,
            known_vendor_denominator,
        )
        competition_component = 100.0 if low_competition else 0.0
        largest_rule_frequency = max(flag_counts.values(), default=0)
        rule_concentration_component = _normalize_proportion(
            largest_rule_frequency,
            total_bids,
        )
        vendor_rule_component = float(
            np.mean(
                [
                    activity_vendor_component,
                    win_rate_vendor_component,
                    competition_component,
                    rule_concentration_component,
                ]
            )
        )

        component_scores = {
            "suspicious_or_anomalous_bid_proportion": review_bid_component,
            "rule_flagged_bid_proportion": rule_bid_component,
            "strongest_anomaly_signal": strongest_signal_component,
            "vendor_rule_concentration_indicators": vendor_rule_component,
        }
        weighted_points = {
            "suspicious_or_anomalous_bid_proportion": 0.40 * review_bid_component,
            "rule_flagged_bid_proportion": 0.25 * rule_bid_component,
            "strongest_anomaly_signal": 0.20 * strongest_signal_component,
            "vendor_rule_concentration_indicators": 0.15 * vendor_rule_component,
        }
        risk_score = int(round(sum(weighted_points.values())))
        risk_score = int(np.clip(risk_score, 0, 100))
        risk_level = _risk_level(risk_score)
        flagged_pattern_count = suspicious_bid_count + anomalous_bid_count
        summary = (
            f"Tender has {total_bids} bids. {flagged_pattern_count} bids were "
            "flagged by the anomaly/rule pipeline. Auditor review is "
            "recommended based on the observed bidding patterns."
        )

        bid_values = [
            {
                column: _json_safe(row[column])
                for column in (
                    "bid_id",
                    "vendor_id",
                    "vendor_name",
                    "bid_amount",
                    "bid_to_estimate_ratio",
                    "anomaly_prediction",
                    "anomaly_score",
                    "rule_flags",
                    "rule_explanations",
                    "rule_count",
                    "rule_status",
                    "final_status",
                )
                if column in row.index
            }
            for _, row in bids.iterrows()
        ]
        features = {
            "tender_bid_count": total_bids,
            "tender_estimated_value": _numeric_value(
                bids["tender_estimated_value"].iloc[0]
            ),
            "anomaly_bid_count": anomaly_bid_count,
            "anomaly_bid_percentage": _normalize_proportion(
                anomaly_bid_count, total_bids
            ),
            "suspicious_bid_count": suspicious_bid_count,
            "suspicious_bid_percentage": _normalize_proportion(
                suspicious_bid_count, total_bids
            ),
            "anomalous_bid_count": anomalous_bid_count,
            "rule_flagged_bid_count": rule_flagged_bid_count,
            "unique_vendor_count": unique_vendor_count,
            "high_vendor_activity_count": high_vendor_activity_count,
            "high_vendor_win_rate_count": high_vendor_win_rate_count,
            "low_tender_competition_flag": low_competition,
            "highest_anomaly_score": float(anomaly_scores.loc[bids.index].max()),
            "average_anomaly_score": float(anomaly_scores.loc[bids.index].mean()),
            "normalized_risk_components": component_scores,
            "weighted_risk_points": weighted_points,
            "risk_index_formula": (
                "risk_score = round(0.40 * suspicious_or_anomalous_bid_proportion "
                "+ 0.25 * rule_flagged_bid_proportion "
                "+ 0.20 * strongest_anomaly_signal "
                "+ 0.15 * vendor_rule_concentration_indicators); each component "
                "is normalized to 0-100 before weighting. The anomaly signal "
                "is inverse min-max normalized from the Isolation Forest "
                "decision_function across this analyzed bid set; it is not a "
                "probability."
            ),
            "risk_level_bands": {
                "LOW": "0-29",
                "MEDIUM": "30-59",
                "HIGH": "60-100",
            },
            "risk_level_interpretation": (
                "Review category only; not a fraud probability or proof of fraud."
            ),
        }
        flags = {
            "rule_flags_summary": rule_flags_summary,
            "low_tender_competition_flag": low_competition,
            "suspicious_bid_count": suspicious_bid_count,
            "anomalous_bid_count": anomalous_bid_count,
            "rule_flagged_bid_count": rule_flagged_bid_count,
        }
        raw_response = {
            "model_version": MODEL_VERSION,
            "isolation_forest_anomaly_count": anomaly_bid_count,
            "bid_results": bid_values,
        }

        output_rows.append(
            {
                "tender_id": tender_id,
                "tender_estimated_value": _numeric_value(
                    bids["tender_estimated_value"].iloc[0]
                ),
                "tender_bid_count": total_bids,
                "anomaly_bid_count": anomaly_bid_count,
                "anomaly_bid_percentage": _normalize_proportion(
                    anomaly_bid_count, total_bids
                ),
                "suspicious_bid_count": suspicious_bid_count,
                "suspicious_bid_percentage": _normalize_proportion(
                    suspicious_bid_count, total_bids
                ),
                "anomalous_bid_count": anomalous_bid_count,
                "highest_anomaly_score": float(anomaly_scores.loc[bids.index].max()),
                "average_anomaly_score": float(
                    anomaly_scores.loc[bids.index].mean()
                ),
                "rule_flagged_bid_count": rule_flagged_bid_count,
                "unique_vendor_count": unique_vendor_count,
                "high_vendor_activity_count": high_vendor_activity_count,
                "high_vendor_win_rate_count": high_vendor_win_rate_count,
                "low_tender_competition_flag": low_competition,
                "rule_flags_summary": rule_flags_summary,
                "risk_score": risk_score,
                "risk_level": risk_level,
                "summary": summary,
                "model_version": MODEL_VERSION,
                "features": features,
                "flags": flags,
                "raw_response": raw_response,
            }
        )

    return pd.DataFrame(output_rows, columns=OUTPUT_COLUMNS)


def validate_aggregation(
    bid_results: pd.DataFrame,
    tender_results: pd.DataFrame,
) -> None:
    """Fail explicitly if tender aggregation loses or corrupts data."""
    if bid_results["tender_id"].isna().any():
        raise ValueError("Input contains a bid without a tender_id.")
    if len(tender_results) != 705:
        raise ValueError(
            f"Expected exactly 705 output tenders; got {len(tender_results)}."
        )
    if tender_results["tender_id"].isna().any():
        raise ValueError("Tender output contains a missing tender_id.")
    if tender_results["tender_id"].duplicated().any():
        raise ValueError("Tender output contains duplicate tender_id values.")
    if int(tender_results["tender_bid_count"].sum()) != len(bid_results):
        raise ValueError("Tender aggregation did not account for every input bid.")
    if not tender_results["risk_score"].between(0, 100).all():
        raise ValueError("Tender risk_score must be between 0 and 100.")
    if not tender_results["risk_level"].isin({"LOW", "MEDIUM", "HIGH"}).all():
        raise ValueError("Tender output contains an invalid risk_level.")

    numeric_columns = tender_results.select_dtypes(include=[np.number]).columns
    if not np.isfinite(
        tender_results[numeric_columns].to_numpy(dtype=np.float64)
    ).all():
        raise ValueError("Tender output contains NaN or infinite numeric values.")

    input_tenders = set(bid_results["tender_id"])
    output_tenders = set(tender_results["tender_id"])
    if input_tenders != output_tenders:
        raise ValueError("Input and output tender IDs do not match.")


def _write_csv(tender_results: pd.DataFrame, output_path: Path) -> None:
    csv_results = tender_results.copy()
    for column in ("rule_flags_summary", "features", "flags", "raw_response"):
        csv_results[column] = csv_results[column].map(
            lambda value: json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        )
    csv_results.to_csv(output_path, index=False, encoding="utf-8")


def main() -> None:
    bid_features = load_bid_features()
    bid_anomalies = detect_anomalies(bid_features)
    bid_results = apply_validation_rules(bid_anomalies)
    tender_results = aggregate_tenders(bid_results)
    validate_aggregation(bid_results, tender_results)
    _write_csv(tender_results, OUTPUT_PATH)

    risk_counts = tender_results["risk_level"].value_counts()
    print("Tender-Level Aggregation Validation")
    print("------------------------------------")
    print(f"Total tenders processed: {tender_results['tender_id'].nunique()}")
    print(f"Total input bids: {len(bid_results)}")
    print(f"Total output tenders: {len(tender_results)}")
    print(f"LOW: {int(risk_counts.get('LOW', 0))}")
    print(f"MEDIUM: {int(risk_counts.get('MEDIUM', 0))}")
    print(f"HIGH: {int(risk_counts.get('HIGH', 0))}")
    print(f"Minimum risk score: {tender_results['risk_score'].min()}")
    print(f"Maximum risk score: {tender_results['risk_score'].max()}")
    print(f"Average risk score: {tender_results['risk_score'].mean():.2f}")
    print(
        "Tenders with at least one flagged bid: "
        f"{int((tender_results['suspicious_bid_count'] + tender_results['anomalous_bid_count']).gt(0).sum())}"
    )
    print(f"CSV output: {OUTPUT_PATH}")
    print("Step 5B aggregation complete — database persistence not performed.")


if __name__ == "__main__":
    main()
