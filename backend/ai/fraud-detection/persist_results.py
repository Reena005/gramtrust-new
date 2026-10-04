"""Persist validated tender-level Module 3 results to the existing table."""

from __future__ import annotations

import csv
import json
import os
import sys
import uuid
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

import psycopg
from dotenv import load_dotenv

MODEL_VERSION = "3.0.0-isolation-forest-rules"
EXPECTED_TENDER_COUNT = 705
SCRIPT_DIRECTORY = Path(__file__).resolve().parent
CSV_PATH = SCRIPT_DIRECTORY / "tender_risk_results.csv"
ENV_PATH = SCRIPT_DIRECTORY.parents[1] / ".env"
RISK_LEVELS = {"LOW", "MEDIUM", "HIGH"}
JSON_COLUMNS = ("features", "flags", "raw_response")

INSERT_SQL = """
    INSERT INTO ai_analyses
        (id, tender_id, risk_score, risk_level, model_version,
         features, flags, summary, raw_response)
    VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s::jsonb)
"""


class MissingTendersError(ValueError):
    def __init__(self, tender_ids: list[str]) -> None:
        self.tender_ids = tender_ids
        super().__init__("CSV contains tender IDs not present in the tenders table.")


def _parse_json_object(value: str, column: str, row_number: int) -> dict[str, Any]:
    try:
        parsed = json.loads(value)
    except (json.JSONDecodeError, TypeError) as exc:
        raise ValueError(f"Invalid JSON in {column} at CSV row {row_number}.") from exc
    if not isinstance(parsed, dict):
        raise ValueError(
            f"{column} must contain a JSON object at CSV row {row_number}."
        )
    return parsed


def _parse_row(row: dict[str, str], row_number: int) -> dict[str, Any]:
    tender_id = (row.get("tender_id") or "").strip()
    if not tender_id:
        raise ValueError(f"Missing tender_id at CSV row {row_number}.")

    try:
        score_decimal = Decimal(row.get("risk_score", ""))
    except (InvalidOperation, TypeError) as exc:
        raise ValueError(f"Invalid risk_score at CSV row {row_number}.") from exc
    if (
        not score_decimal.is_finite()
        or score_decimal != score_decimal.to_integral_value()
        or not 0 <= score_decimal <= 100
    ):
        raise ValueError(
            f"risk_score must be an integer from 0 to 100 at CSV row {row_number}."
        )
    risk_score = int(score_decimal)

    risk_level = (row.get("risk_level") or "").strip()
    if risk_level not in RISK_LEVELS:
        raise ValueError(f"Invalid risk_level at CSV row {row_number}.")

    model_version = (row.get("model_version") or "").strip()
    if model_version != MODEL_VERSION:
        raise ValueError(f"Unexpected model_version at CSV row {row_number}.")

    summary = (row.get("summary") or "").strip()
    if not summary:
        raise ValueError(f"Missing summary at CSV row {row_number}.")

    json_values = {
        column: _parse_json_object(row.get(column, ""), column, row_number)
        for column in JSON_COLUMNS
    }
    return {
        "tender_id": tender_id,
        "risk_score": risk_score,
        "risk_level": risk_level,
        "model_version": model_version,
        **json_values,
        "summary": summary,
    }


def read_and_validate_csv(csv_path: Path = CSV_PATH) -> list[dict[str, Any]]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        required_columns = {
            "tender_id",
            "risk_score",
            "risk_level",
            "model_version",
            "features",
            "flags",
            "summary",
            "raw_response",
        }
        missing_columns = required_columns.difference(reader.fieldnames or [])
        if missing_columns:
            raise ValueError(
                f"CSV is missing required columns: {', '.join(sorted(missing_columns))}"
            )
        rows = [
            _parse_row(row, row_number)
            for row_number, row in enumerate(reader, start=2)
        ]

    tender_ids = [row["tender_id"] for row in rows]
    if len(rows) != EXPECTED_TENDER_COUNT:
        raise ValueError(
            f"Expected {EXPECTED_TENDER_COUNT} CSV rows; found {len(rows)}."
        )
    if len(set(tender_ids)) != EXPECTED_TENDER_COUNT:
        raise ValueError(
            f"Expected {EXPECTED_TENDER_COUNT} unique tender IDs in the CSV."
        )
    return rows


def persist_results(csv_path: Path = CSV_PATH) -> dict[str, int]:
    rows = read_and_validate_csv(csv_path)
    tender_ids = [row["tender_id"] for row in rows]

    load_dotenv(ENV_PATH)
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is not configured in backend/.env or the environment."
        )

    inserted_count = 0
    already_existing_count = 0
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            # Serialize concurrent runs so the existence check remains idempotent.
            cursor.execute(
                "SELECT pg_advisory_xact_lock(hashtext(%s))",
                [f"gramtrust-ai-analyses:{MODEL_VERSION}"],
            )

            cursor.execute(
                "SELECT id FROM tenders WHERE id = ANY(%s)",
                [tender_ids],
            )
            database_tender_ids = {record[0] for record in cursor.fetchall()}
            missing_tenders = sorted(set(tender_ids) - database_tender_ids)
            if missing_tenders:
                raise MissingTendersError(missing_tenders)

            cursor.execute(
                """
                SELECT tender_id, COUNT(*)
                FROM ai_analyses
                WHERE model_version = %s AND tender_id = ANY(%s)
                GROUP BY tender_id
                HAVING COUNT(*) > 1
                """,
                [MODEL_VERSION, tender_ids],
            )
            preexisting_duplicates = cursor.fetchall()
            if preexisting_duplicates:
                raise ValueError(
                    "Duplicate Module 3 tender/model records already exist; "
                    "no rows were inserted."
                )

            cursor.execute(
                """
                SELECT tender_id
                FROM ai_analyses
                WHERE model_version = %s AND tender_id = ANY(%s)
                """,
                [MODEL_VERSION, tender_ids],
            )
            existing_ids = {record[0] for record in cursor.fetchall()}
            new_rows = [row for row in rows if row["tender_id"] not in existing_ids]
            already_existing_count = len(rows) - len(new_rows)

            parameters = [
                (
                    str(uuid.uuid4()),
                    row["tender_id"],
                    row["risk_score"],
                    row["risk_level"],
                    row["model_version"],
                    json.dumps(row["features"], ensure_ascii=False, allow_nan=False),
                    json.dumps(row["flags"], ensure_ascii=False, allow_nan=False),
                    row["summary"],
                    json.dumps(
                        row["raw_response"], ensure_ascii=False, allow_nan=False
                    ),
                )
                for row in new_rows
            ]
            if parameters:
                cursor.executemany(INSERT_SQL, parameters)
                inserted_count = len(parameters)

            cursor.execute(
                """
                SELECT tender_id, risk_score, risk_level
                FROM ai_analyses
                WHERE model_version = %s AND tender_id = ANY(%s)
                """,
                [MODEL_VERSION, tender_ids],
            )
            persisted_rows = cursor.fetchall()
            persisted_by_tender: dict[str, tuple[int, str]] = {}
            duplicate_ids: set[str] = set()
            for tender_id, risk_score, risk_level in persisted_rows:
                if tender_id in persisted_by_tender:
                    duplicate_ids.add(tender_id)
                persisted_by_tender[tender_id] = (risk_score, risk_level)

            missing_persisted = sorted(set(tender_ids) - set(persisted_by_tender))
            if missing_persisted:
                raise RuntimeError(
                    "Persistence verification failed: expected records are missing."
                )
            if duplicate_ids:
                raise RuntimeError(
                    "Persistence verification found duplicate tender/model pairs."
                )
            invalid_records = [
                tender_id
                for tender_id, (score, level) in persisted_by_tender.items()
                if not 0 <= score <= 100 or level not in RISK_LEVELS
            ]
            if invalid_records:
                raise RuntimeError(
                    "Persistence verification found invalid risk fields."
                )

            cursor.execute(
                "SELECT COUNT(*) FROM ai_analyses WHERE model_version = %s",
                [MODEL_VERSION],
            )
            total_module_3_records = int(cursor.fetchone()[0])

    return {
        "csv_rows_read": len(rows),
        "tenders_validated": len(database_tender_ids),
        "tenders_missing_from_database": 0,
        "records_already_existing": already_existing_count,
        "records_inserted": inserted_count,
        "total_module_3_records_after_persistence": total_module_3_records,
    }


def main() -> int:
    try:
        result = persist_results()
    except MissingTendersError as exc:
        print("Tenders missing from database; no records were inserted:")
        for tender_id in exc.tender_ids:
            print(tender_id)
        return 1
    except Exception as exc:
        print(f"Persistence failed ({type(exc).__name__}); transaction was not committed.")
        return 1

    print(f"CSV rows read: {result['csv_rows_read']}")
    print(f"Tenders validated: {result['tenders_validated']}")
    print(
        "Tenders missing from database: "
        f"{result['tenders_missing_from_database']}"
    )
    print(f"Records already existing: {result['records_already_existing']}")
    print(f"Records inserted: {result['records_inserted']}")
    print(
        "Total Module 3 records after persistence: "
        f"{result['total_module_3_records_after_persistence']}"
    )
    print(
        "Step 5C persistence complete — Module 3 tender-level AI results stored "
        "in ai_analyses."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
