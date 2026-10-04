import { z } from 'zod';
import {
  aiFraudDetectionRepository,
  MODULE_3_MODEL_VERSION,
  type FraudAnalysisFilters,
  type FraudAnalysisRecord,
  type FraudRiskLevel,
} from '@/repositories/ai-fraud-detection.repository.js';
import { AppError } from '@/utils/app-error.js';

const listQuerySchema = z.object({
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const aiFraudDetectionService = {
  async list(query: unknown, role: string) {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new AppError(
        'Invalid AI fraud-detection query parameters.',
        400,
        parsed.error.flatten(),
      );
    }

    const filters: FraudAnalysisFilters = {
      ...(parsed.data.riskLevel
        ? { riskLevel: parsed.data.riskLevel as FraudRiskLevel }
        : {}),
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    };
    const result = await aiFraudDetectionRepository.findAll(filters);
    const items =
      role === 'CITIZEN'
        ? result.items.map(toCitizenAnalysis)
        : role === 'ADMIN'
          ? result.items
          : result.items.map(toOfficialAnalysis);
    return {
      ...(role === 'ADMIN' || role === 'AUDITOR'
        ? { model_version: MODULE_3_MODEL_VERSION }
        : {}),
      total: result.total,
      limit: filters.limit,
      offset: filters.offset,
      items,
    };
  },

  async getByTenderId(tenderId: string, role: string) {
    const analysis = await aiFraudDetectionRepository.findByTenderId(tenderId);
    if (!analysis) {
      throw new AppError(
        `Module 3 AI analysis for tender '${tenderId}' not found.`,
        404,
      );
    }
    if (role === 'CITIZEN') return toCitizenAnalysis(analysis);
    if (role !== 'ADMIN') return toOfficialAnalysis(analysis);
    return analysis;
  },

  async summary(role: string) {
    return {
      ...(role === 'ADMIN' || role === 'AUDITOR'
        ? { model_version: MODULE_3_MODEL_VERSION }
        : {}),
      ...(await aiFraudDetectionRepository.getSummary()),
    };
  },
};

const PUBLIC_RULE_EXPLANATIONS: Record<string, string> = {
  HIGH_BID_TO_ESTIMATE_RATIO:
    'One or more bids were substantially above the tender estimate.',
  LOW_BID_TO_ESTIMATE_RATIO:
    'One or more bids were substantially below the tender estimate.',
  LARGE_BID_DEVIATION:
    'One or more bids differed substantially from the tender average.',
  HIGH_VENDOR_BID_ACTIVITY:
    'The analysis observed a high level of vendor bidding activity.',
  HIGH_VENDOR_WIN_RATE:
    'The analysis observed a high rank-1 rate across multiple bids.',
  LOW_TENDER_COMPETITION:
    'The tender had two or fewer recorded bids.',
};

function toOfficialAnalysis<T extends FraudAnalysisRecord>(analysis: T) {
  const { raw_response: _rawResponse, ...officialAnalysis } = analysis;
  return officialAnalysis;
}

function toCitizenAnalysis(analysis: FraudAnalysisRecord) {
  const ruleSummary = analysis.flags['rule_flags_summary'];
  const flagCounts =
    ruleSummary && typeof ruleSummary === 'object' && !Array.isArray(ruleSummary)
      ? (ruleSummary as Record<string, unknown>)
      : {};
  const publicIndicators = Object.entries(flagCounts)
    .filter(([, count]) => typeof count === 'number' && count > 0)
    .map(([flag, count]) => ({
      indicator: PUBLIC_RULE_EXPLANATIONS[flag] ?? 'An unusual bidding pattern was flagged.',
      affected_bid_count: count,
    }));
  const features = analysis.features;

  return {
    tender_id: analysis.public_tender_id,
    tender_title: analysis.tender_title,
    state: analysis.state,
    district: analysis.district,
    panchayat: analysis.panchayat,
    risk_score: analysis.risk_score,
    risk_level: analysis.risk_level,
    summary:
      'This tender shows patterns that differ from the bidding patterns analyzed by the system. This does not by itself establish fraud. Further human review may be required.',
    public_explanation:
      publicIndicators.length > 0
        ? 'The analysis identified one or more unusual bidding indicators. These indicators do not establish wrongdoing and may require human review.'
        : 'The model identified a bidding pattern for review. This does not by itself establish fraud.',
    public_indicators: publicIndicators,
    public_features: {
      tender_bid_count: features['tender_bid_count'],
      suspicious_bid_count: features['suspicious_bid_count'],
      anomalous_bid_count: features['anomalous_bid_count'],
      rule_flagged_bid_count: features['rule_flagged_bid_count'],
      unique_vendor_count: features['unique_vendor_count'],
      low_tender_competition_flag: features['low_tender_competition_flag'],
    },
    created_at: analysis.created_at,
  };
}
