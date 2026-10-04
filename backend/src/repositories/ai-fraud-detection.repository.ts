import { pool } from '@/config/db.js';

export const MODULE_3_MODEL_VERSION = '3.0.0-isolation-forest-rules';

export type FraudRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface FraudAnalysisFilters {
  riskLevel?: FraudRiskLevel;
  limit: number;
  offset: number;
}

export interface FraudAnalysisRecord {
  tender_id: string;
  public_tender_id: string;
  tender_title: string;
  state: string;
  district: string;
  panchayat: string | null;
  risk_score: number;
  risk_level: FraudRiskLevel;
  model_version: string;
  features: Record<string, unknown>;
  flags: Record<string, unknown>;
  summary: string;
  raw_response: Record<string, unknown> | null;
  created_at: Date;
}

export interface FraudAnalysisSummary {
  total_analyzed_tenders: number;
  low_count: number;
  medium_count: number;
  high_count: number;
  average_risk_score: number;
  minimum_risk_score: number;
  maximum_risk_score: number;
  tenders_with_flagged_or_anomalous_bids: number;
}

function listConditions(riskLevel?: FraudRiskLevel): {
  whereClause: string;
  values: unknown[];
} {
  if (!riskLevel) {
    return { whereClause: '', values: [] };
  }
  return {
    whereClause: 'AND a.risk_level = $2',
    values: [riskLevel],
  };
}

export const aiFraudDetectionRepository = {
  async findAll(filters: FraudAnalysisFilters): Promise<{
    items: FraudAnalysisRecord[];
    total: number;
  }> {
    const { whereClause, values } = listConditions(filters.riskLevel);
    const queryValues = [MODULE_3_MODEL_VERSION, ...values];
    const limitIndex = queryValues.length + 1;

    const [countResult, rowsResult] = await Promise.all([
      pool.query<{ total: string }>(
        `SELECT COUNT(*) AS total
         FROM ai_analyses AS a
         WHERE a.model_version = $1 ${whereClause}`,
        queryValues,
      ),
      pool.query<FraudAnalysisRecord>(
        `SELECT a.tender_id, t.tender_id AS public_tender_id, t.title AS tender_title,
                t.state, t.district, t.panchayat, a.risk_score, a.risk_level,
                a.model_version, a.features, a.flags, a.summary, a.raw_response,
                a.created_at
         FROM ai_analyses AS a
         JOIN tenders AS t ON t.id = a.tender_id
         WHERE a.model_version = $1 ${whereClause}
         ORDER BY a.created_at DESC, a.tender_id ASC
         LIMIT $${limitIndex} OFFSET $${limitIndex + 1}`,
        [...queryValues, filters.limit, filters.offset],
      ),
    ]);

    return {
      items: rowsResult.rows,
      total: Number(countResult.rows[0]?.total ?? 0),
    };
  },

  async findByTenderId(
    tenderId: string,
  ): Promise<FraudAnalysisRecord | null> {
    const { rows } = await pool.query<FraudAnalysisRecord>(
      `SELECT a.tender_id, t.tender_id AS public_tender_id, t.title AS tender_title,
              t.state, t.district, t.panchayat, a.risk_score, a.risk_level,
              a.model_version, a.features, a.flags, a.summary, a.raw_response,
              a.created_at
       FROM ai_analyses AS a
       JOIN tenders AS t ON t.id = a.tender_id
       WHERE (a.tender_id = $1 OR t.tender_id = $1)
         AND a.model_version = $2
       ORDER BY a.created_at DESC
       LIMIT 1`,
      [tenderId, MODULE_3_MODEL_VERSION],
    );
    return rows[0] ?? null;
  },

  async getSummary(): Promise<FraudAnalysisSummary> {
    const { rows } = await pool.query<{
      total_analyzed_tenders: string;
      low_count: string;
      medium_count: string;
      high_count: string;
      average_risk_score: string | null;
      minimum_risk_score: number | null;
      maximum_risk_score: number | null;
      tenders_with_flagged_or_anomalous_bids: string;
    }>(
      `SELECT
         COUNT(*) AS total_analyzed_tenders,
         COUNT(*) FILTER (WHERE risk_level = 'LOW') AS low_count,
         COUNT(*) FILTER (WHERE risk_level = 'MEDIUM') AS medium_count,
         COUNT(*) FILTER (WHERE risk_level = 'HIGH') AS high_count,
         AVG(risk_score) AS average_risk_score,
         MIN(risk_score) AS minimum_risk_score,
         MAX(risk_score) AS maximum_risk_score,
         COUNT(*) FILTER (
           WHERE COALESCE((features->>'suspicious_bid_count')::numeric, 0) > 0
              OR COALESCE((features->>'anomalous_bid_count')::numeric, 0) > 0
         ) AS tenders_with_flagged_or_anomalous_bids
       FROM ai_analyses
       WHERE model_version = $1`,
      [MODULE_3_MODEL_VERSION],
    );
    const row = rows[0]!;
    return {
      total_analyzed_tenders: Number(row.total_analyzed_tenders),
      low_count: Number(row.low_count),
      medium_count: Number(row.medium_count),
      high_count: Number(row.high_count),
      average_risk_score: Number(row.average_risk_score ?? 0),
      minimum_risk_score: row.minimum_risk_score ?? 0,
      maximum_risk_score: row.maximum_risk_score ?? 0,
      tenders_with_flagged_or_anomalous_bids: Number(
        row.tenders_with_flagged_or_anomalous_bids,
      ),
    };
  },
};
