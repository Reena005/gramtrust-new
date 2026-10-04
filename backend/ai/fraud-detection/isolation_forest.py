"""Run an Isolation Forest over real GramTrust bid-level features."""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from feature_extraction import load_bid_features

MODEL_FEATURE_COLUMNS = [
    "bid_amount",
    "tender_estimated_value",
    "bid_to_estimate_ratio",
    "vendor_bid_count",
    "vendor_total_bid_value",
    "vendor_average_bid",
    "vendor_min_bid",
    "vendor_max_bid",
    "vendor_win_count",
    "vendor_win_rate",
    "tender_bid_count",
    "tender_average_bid",
    "bid_deviation_from_tender_average",
]

SAMPLE_COLUMNS = [
    "bid_id",
    "tender_id",
    "vendor_name",
    "bid_amount",
    "tender_estimated_value",
    "bid_to_estimate_ratio",
    "anomaly_score",
    "anomaly_prediction",
]


def detect_anomalies(features: pd.DataFrame) -> pd.DataFrame:
    """Return feature rows with Isolation Forest prediction and score."""
    missing_columns = set(MODEL_FEATURE_COLUMNS).difference(features.columns)
    if missing_columns:
        raise ValueError(
            f"Feature data is missing model columns: {', '.join(sorted(missing_columns))}"
        )

    model_features = features[MODEL_FEATURE_COLUMNS].apply(
        pd.to_numeric, errors="raise"
    )
    values = model_features.to_numpy(dtype=np.float64)
    if not np.isfinite(values).all():
        raise ValueError("Isolation Forest input contains missing or infinite values.")

    model = IsolationForest(
        n_estimators=200,
        contamination="auto",
        random_state=42,
        n_jobs=-1,
    )
    result = features.copy()
    result["anomaly_prediction"] = model.fit_predict(model_features)
    result["anomaly_score"] = model.decision_function(model_features)

    if not result["anomaly_prediction"].isin([-1, 1]).all():
        raise RuntimeError("Isolation Forest returned an unexpected prediction value.")
    if not pd.api.types.is_numeric_dtype(result["anomaly_score"]):
        raise RuntimeError("Isolation Forest anomaly scores are not numeric.")

    return result


def main() -> None:
    features = load_bid_features()
    result = detect_anomalies(features)

    total_records = len(result)
    anomalous_records = int((result["anomaly_prediction"] == -1).sum())
    normal_records = int((result["anomaly_prediction"] == 1).sum())
    anomaly_percentage = (
        anomalous_records / total_records * 100 if total_records else 0.0
    )

    print("Isolation Forest Model")
    print("----------------------")
    print(f"Total records: {total_records}")
    print(f"Anomalous records: {anomalous_records}")
    print(f"Normal records: {normal_records}")
    print(f"Anomaly percentage: {anomaly_percentage:.2f}%")
    print("\nFeature columns used:")
    print("\n".join(MODEL_FEATURE_COLUMNS))
    print("\nOutput columns:")
    print("\n".join(result.columns))
    print("\nSample anomaly records:")
    print(
        result.loc[result["anomaly_prediction"] == -1, SAMPLE_COLUMNS]
        .head(10)
        .to_string(index=False)
    )
    print("\nAnomaly score statistics (decision_function; not a fraud probability):")
    print(result["anomaly_score"].describe().to_string())
    print("\nInterpretation: ANOMALOUS - AUDITOR REVIEW REQUIRED")
    print(
        "An anomaly indicates an unusual bidding pattern according to the model; "
        "it is not a confirmation of fraud."
    )


if __name__ == "__main__":
    main()
