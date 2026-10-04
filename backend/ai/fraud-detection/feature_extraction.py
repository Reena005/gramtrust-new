"""Extract bid-level numeric features for GramTrust fraud detection."""

from __future__ import annotations

import logging
import os
from pathlib import Path

import pandas as pd
import psycopg
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

FEATURE_COLUMNS = [
    "bid_id",
    "tender_id",
    "vendor_id",
    "vendor_name",
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

NUMERIC_FEATURE_COLUMNS = [
    column
    for column in FEATURE_COLUMNS
    if column not in {"bid_id", "tender_id", "vendor_id", "vendor_name"}
]

_BID_QUERY = """
    SELECT
        b.id AS bid_id,
        b.tender_id AS tender_id,
        b.vendor_id AS vendor_id,
        COALESCE(NULLIF(BTRIM(b.vendor_name), ''), v.name, '') AS vendor_name,
        b.bid_amount AS bid_amount,
        t.estimated_value AS tender_estimated_value,
        b.financial_rank AS financial_rank
    FROM bids AS b
    JOIN tenders AS t ON t.id = b.tender_id
    LEFT JOIN vendors AS v ON v.id = b.vendor_id
    ORDER BY b.id
"""


def _vendor_group_key(row: pd.Series) -> str:
    vendor_id = row["vendor_id"]
    if pd.notna(vendor_id) and str(vendor_id).strip():
        return f"vendor:{vendor_id}"

    # Missing vendor IDs must not cause unrelated bids to share aggregates.
    return f"bid:{row['bid_id']}"


def build_bid_features(bids: pd.DataFrame) -> pd.DataFrame:
    """Build one ML-ready feature row per joined bid."""
    required_columns = {
        "bid_id",
        "tender_id",
        "vendor_id",
        "vendor_name",
        "bid_amount",
        "tender_estimated_value",
        "financial_rank",
    }
    missing_columns = required_columns.difference(bids.columns)
    if missing_columns:
        raise ValueError(
            f"Bid query is missing required columns: {', '.join(sorted(missing_columns))}"
        )

    features = bids.copy()
    for column in ("bid_amount", "tender_estimated_value"):
        features[column] = pd.to_numeric(features[column], errors="coerce")

    # Keep every bid row while ensuring ML features remain numeric and finite.
    features[["bid_amount", "tender_estimated_value"]] = (
        features[["bid_amount", "tender_estimated_value"]]
        .fillna(0)
        .astype("float64")
    )
    features["vendor_name"] = features["vendor_name"].fillna("").astype(str)
    features["_vendor_group"] = features.apply(_vendor_group_key, axis=1)
    features["_is_win"] = features["financial_rank"].map(
        lambda rank: isinstance(rank, str) and rank.strip() == "1"
    )

    vendor_features = (
        features.groupby("_vendor_group", sort=False)
        .agg(
            vendor_bid_count=("bid_id", "count"),
            vendor_total_bid_value=("bid_amount", "sum"),
            vendor_average_bid=("bid_amount", "mean"),
            vendor_min_bid=("bid_amount", "min"),
            vendor_max_bid=("bid_amount", "max"),
            vendor_win_count=("_is_win", "sum"),
        )
        .reset_index()
    )
    vendor_features["vendor_win_rate"] = (
        vendor_features["vendor_win_count"]
        .div(vendor_features["vendor_bid_count"].where(
            vendor_features["vendor_bid_count"] != 0
        ))
        .fillna(0)
    )

    tender_features = (
        features.groupby("tender_id", dropna=False, sort=False)
        .agg(
            tender_bid_count=("bid_id", "count"),
            tender_average_bid=("bid_amount", "mean"),
        )
        .reset_index()
    )

    features = features.merge(vendor_features, on="_vendor_group", how="left")
    features = features.merge(tender_features, on="tender_id", how="left")
    features["bid_to_estimate_ratio"] = features["bid_amount"].div(
        features["tender_estimated_value"].where(
            features["tender_estimated_value"] != 0
        )
    )
    features["bid_deviation_from_tender_average"] = (
        features["bid_amount"] - features["tender_average_bid"]
    ).div(features["tender_average_bid"].where(
        features["tender_average_bid"] != 0
    ))

    features[NUMERIC_FEATURE_COLUMNS] = (
        features[NUMERIC_FEATURE_COLUMNS]
        .apply(pd.to_numeric, errors="coerce")
        .replace([float("inf"), float("-inf")], pd.NA)
        .fillna(0)
        .astype("float64")
    )

    return features[FEATURE_COLUMNS].reset_index(drop=True)


def load_bid_features(database_url: str | None = None) -> pd.DataFrame:
    """Read GramTrust bid, tender, and vendor data and return bid features."""
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    connection_string = database_url or os.getenv("DATABASE_URL")
    if not connection_string:
        raise RuntimeError(
            "DATABASE_URL is not set. Configure it in backend/.env or the environment."
        )

    with psycopg.connect(connection_string) as connection:
        with connection.cursor() as cursor:
            cursor.execute(_BID_QUERY)
            rows = cursor.fetchall()
            columns = [column.name for column in cursor.description]
    raw_bids = pd.DataFrame.from_records(rows, columns=columns)

    return build_bid_features(raw_bids)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    features = load_bid_features()
    logger.info("Extracted rows: %d", len(features))
    logger.info("Feature columns: %d", len(features.columns))
    logger.info("Columns: %s", ", ".join(features.columns))
    print("\nFirst 5 rows:")
    print(features.head().to_string(index=False))
    print("\nMissing values:")
    print(features.isna().sum().to_string())
    print("\nNumeric feature statistics:")
    print(features[NUMERIC_FEATURE_COLUMNS].describe().to_string())


if __name__ == "__main__":
    main()
