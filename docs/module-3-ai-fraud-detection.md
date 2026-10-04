# AI Fraud & Anomaly Detection

## Objective

Module 3 identifies unusual bidding, spending, and vendor activity patterns
that may warrant further human review. It provides review indicators, not
determinations of wrongdoing. **AI anomaly detection does not establish fraud
by itself.**

The risk score is a deterministic 0–100 review-risk index. Isolation Forest
decision scores and risk scores are not probabilities of fraud.

## Input data and features

The validated analysis used 1,748 bid records, 896 unique vendors, and 705
tenders.

The bid-level feature extraction includes:

- Bid amount
- Tender estimated value
- Bid-to-estimate ratio
- Vendor bid count
- Vendor total bid value
- Vendor average bid
- Vendor minimum bid
- Vendor maximum bid
- Vendor win count
- Vendor win rate
- Tender bid count
- Tender average bid
- Bid deviation from tender average

The Python implementation is in `backend/ai/fraud-detection/`. Feature
extraction is shared by the model and rule engine rather than duplicating its
database query or calculations.

## Machine learning

The bid-level model uses Isolation Forest with:

| Parameter | Value |
| --- | --- |
| `n_estimators` | 200 |
| `contamination` | `auto` |
| `random_state` | 42 |
| `n_jobs` | -1 |

Isolation Forest identifies observations that are unusual relative to the
analyzed bidding data. Its `anomaly_score` is the model's decision-function
score, not a probability.

## Rule engine

The rule engine evaluates all six rules for each bid. Rule flags are evidence
for review and do not label a vendor or bid as fraudulent.

| Flag | Trigger |
| --- | --- |
| `HIGH_BID_TO_ESTIMATE_RATIO` | `bid_to_estimate_ratio > 1.20` |
| `LOW_BID_TO_ESTIMATE_RATIO` | `bid_to_estimate_ratio < 0.70` |
| `LARGE_BID_DEVIATION` | `abs(bid_deviation_from_tender_average) > 0.50` |
| `HIGH_VENDOR_BID_ACTIVITY` | `vendor_bid_count >= 7` |
| `HIGH_VENDOR_WIN_RATE` | `vendor_win_rate >= 0.75` and `vendor_bid_count >= 4` |
| `LOW_TENDER_COMPETITION` | `tender_bid_count <= 2` |

For every bid the engine records all triggered rule flags and explanations,
the rule count, rule status, and final status.

## Final status logic

| Isolation Forest | Rule flags | Final status |
| --- | --- | --- |
| Anomaly (`-1`) | One or more | `SUSPICIOUS — AUDITOR REVIEW REQUIRED` |
| Anomaly (`-1`) | None | `ANOMALOUS — AUDITOR REVIEW REQUIRED` |
| Normal (`1`) | One or more | `SUSPICIOUS — AUDITOR REVIEW REQUIRED` |
| Normal (`1`) | None | `NORMAL` |

## Tender aggregation and risk index

Bid-level results are aggregated into one tender-level result per tender. The
aggregation calculates anomaly and suspicious bid counts and proportions,
rule-flagged bid counts, vendor and rule indicators, and a tender summary.

Each risk-index component is normalized to 0–100 before weighting:

1. **Suspicious or anomalous bid proportion — 40%:** the proportion of bids
   whose final status is suspicious or anomalous.
2. **Rule-flagged bid proportion — 25%:** the proportion of bids with at least
   one rule flag.
3. **Strongest anomaly signal — 20%:** inverse min-max normalization of the
   most negative Isolation Forest `decision_function` score in the tender,
   relative to the full analyzed bid set. This is a relative model signal, not
   a probability.
4. **Vendor/rule concentration indicators — 15%:** the unweighted mean of
   (a) high-activity vendors divided by known vendors, (b) high-win-rate
   vendors divided by known vendors, (c) a 0-or-100 low-tender-competition
   indicator, and (d) the most frequent rule flag divided by tender bid count.

The risk score is the rounded sum of each normalized component multiplied by
its weight, clipped to 0–100. Risk levels are review categories:

| Risk level | Score |
| --- | --- |
| LOW | 0–29 |
| MEDIUM | 30–59 |
| HIGH | 60–100 |

These categories are not fraud probabilities or proof of fraud.

## Persisted results

Tender-level results are stored in the existing `ai_analyses` table without
schema changes:

- `model_version`: `3.0.0-isolation-forest-rules`
- One analysis record per tender for this model version
- Persistence is idempotent: the script checks for existing tender/model
  records and serializes concurrent runs before inserting missing records.

The generated `backend/ai/fraud-detection/tender_risk_results.csv` is the
validated tender aggregation output and the input to the persistence script.
It contains the JSON-compatible features, flags, summary, and raw response
needed for persistence. Its raw response includes bid-level and vendor-level
details; the API limits which roles can receive that response.

## API

All endpoints use the existing JWT authentication and role middleware:

- `GET /api/ai/fraud-detection` — list Module 3 analyses; supports `riskLevel`,
  `limit`, and `offset`.
- `GET /api/ai/fraud-detection/:tenderId` — retrieve a tender analysis. For
  CITIZEN access, the identifier is the public tender ID.
- `GET /api/ai/fraud-detection/summary` — calculate aggregate counts and risk
  score statistics from Module 3 records.

Repository queries are constrained to model version
`3.0.0-isolation-forest-rules`. Response projections are enforced by the
backend:

- **ADMIN:** Full permitted Module 3 analysis, including the raw response.
- **OFFICIAL:** Review-oriented tender analysis, features, and flags; excludes
  the raw response.
- **CITIZEN:** Public/sanitized tender risk information and explanations.
  Responses omit raw response data, raw bid/vendor detail, internal database
  tender IDs, and implementation/debug information.
- **AUDITOR:** Authorized for the Module 3 endpoints and receives the
  review-oriented projection.

## Frontend

The dashboard is available at `/ai/fraud-detection` and is linked in the
role-filtered application navigation:

- **ADMIN** sees the full permitted analysis detail and administrative
  columns.
- **OFFICIAL** sees review-oriented analysis, including risk indicators and
  aggregate features.
- **CITIZEN** sees public tender identifiers, risk scores and levels, public
  summaries, and sanitized explanations only.

All role views describe AI-assisted findings as patterns for review. They do
not present a risk score as a probability or an anomaly as a finding of fraud.

## Validation results

The persisted Module 3 results were verified against the database:

| Measure | Verified result |
| --- | ---: |
| Bids analyzed | 1,748 |
| Unique vendors | 896 |
| Tender analyses | 705 |
| LOW | 281 |
| MEDIUM | 53 |
| HIGH | 371 |
| Minimum risk score | 1 |
| Maximum risk score | 92 |
| Average risk score | Approximately 47.57 |

Validation found 705 unique tender IDs, no duplicate tender/model-version
pairs, no invalid risk scores or levels, and no invalid JSON fields. API
validation covered authenticated ADMIN, OFFICIAL, and CITIZEN access,
pagination, risk-level filtering, detail and summary requests, a 404 for a
missing tender analysis, and a 401 for an unauthenticated request. Frontend
validation exercised the dashboard, filters, pagination, and role-specific
detail views.
