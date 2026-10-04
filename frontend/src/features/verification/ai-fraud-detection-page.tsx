import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/features/auth/auth-context';
import { apiClient } from '@/lib/api-client';

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
type RiskFilter = 'ALL' | RiskLevel;

interface FraudAnalysisSummary {
  total_analyzed_tenders: number;
  low_count: number;
  medium_count: number;
  high_count: number;
  average_risk_score: number;
  minimum_risk_score: number;
  maximum_risk_score: number;
  tenders_with_flagged_or_anomalous_bids: number;
}

interface FraudAnalysis {
  tender_id: string;
  public_tender_id?: string;
  tender_title?: string;
  state?: string;
  district?: string;
  panchayat?: string | null;
  risk_score: number;
  risk_level: RiskLevel;
  model_version?: string;
  features?: Record<string, unknown>;
  flags?: Record<string, unknown>;
  summary: string;
  raw_response?: Record<string, unknown> | null;
  public_explanation?: string;
  public_indicators?: Array<{
    indicator: string;
    affected_bid_count: number;
  }>;
  public_features?: Record<string, unknown>;
  created_at: string;
}

interface FraudAnalysisListResponse {
  model_version?: string;
  total: number;
  limit: number;
  offset: number;
  items: FraudAnalysis[];
}

const PAGE_SIZE = 20;

const RISK_BADGE_VARIANT: Record<RiskLevel, 'success' | 'warning' | 'danger'> = {
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'danger',
};

const FEATURE_LABELS: Record<string, string> = {
  tender_bid_count: 'Tender Bid Count',
  anomaly_bid_count: 'Anomalous Bid Count',
  anomaly_bid_percentage: 'Anomalous Bid Percentage',
  suspicious_bid_count: 'Suspicious Bid Count',
  suspicious_bid_percentage: 'Suspicious Bid Percentage',
  anomalous_bid_count: 'Anomalous Bid Count',
  rule_flagged_bid_count: 'Rule-Flagged Bid Count',
  unique_vendor_count: 'Unique Vendor Count',
  high_vendor_activity_count: 'High Vendor Activity Count',
  high_vendor_win_rate_count: 'High Vendor Win-Rate Count',
  low_tender_competition_flag: 'Low Tender Competition',
  highest_anomaly_score: 'Highest Anomaly Score',
  average_anomaly_score: 'Average Anomaly Score',
};

const FLAG_EXPLANATIONS: Record<string, string> = {
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

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && !error.response) {
    return 'Could not connect to GramTrust. Please check your connection and try again.';
  }
  return 'Unable to load AI fraud analysis data. Please try again.';
}

function displayValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(3);
  }
  if (typeof value === 'string') return value;
  return 'Not available';
}

function getAnalysisFlags(analysis: FraudAnalysis): Array<[string, number]> {
  const summary = analysis.flags?.['rule_flags_summary'];
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return [];
  }
  return Object.entries(summary as Record<string, unknown>).filter(
    (entry): entry is [string, number] =>
      typeof entry[1] === 'number' && entry[1] > 0,
  );
}

export function AIFraudDetectionPage() {
  const { user } = useAuth();
  const isCitizen = user?.role === 'CITIZEN';
  const isAdmin = user?.role === 'ADMIN';

  const [summary, setSummary] = useState<FraudAnalysisSummary | null>(null);
  const [summaryError, setSummaryError] = useState('');
  const [analyses, setAnalyses] = useState<FraudAnalysis[]>([]);
  const [total, setTotal] = useState(0);
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('ALL');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [listReload, setListReload] = useState(0);
  const [selectedAnalysis, setSelectedAnalysis] = useState<FraudAnalysis | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    let active = true;
    apiClient
      .get<{ success: boolean; data: FraudAnalysisSummary }>(
        '/ai/fraud-detection/summary',
      )
      .then(({ data }) => {
        if (active) setSummary(data.data);
      })
      .catch((error: unknown) => {
        if (active) setSummaryError(getErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setListError('');

    const params: Record<string, string | number> = {
      limit: PAGE_SIZE,
      offset,
    };
    if (riskFilter !== 'ALL') params['riskLevel'] = riskFilter;

    apiClient
      .get<{ success: boolean; data: FraudAnalysisListResponse }>(
        '/ai/fraud-detection',
        { params },
      )
      .then(({ data }) => {
        if (!active) return;
        setAnalyses(data.data.items);
        setTotal(data.data.total);
      })
      .catch((error: unknown) => {
        if (active) setListError(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [listReload, offset, riskFilter]);

  async function openAnalysis(analysis: FraudAnalysis) {
    setSelectedAnalysis(null);
    setDetailLoading(true);
    setDetailError('');
    try {
      const { data } = await apiClient.get<{
        success: boolean;
        data: FraudAnalysis;
      }>(`/ai/fraud-detection/${encodeURIComponent(analysis.tender_id)}`);
      setSelectedAnalysis(data.data);
    } catch {
      setDetailError('Unable to load the selected tender analysis.');
    } finally {
      setDetailLoading(false);
    }
  }

  const pageNumber = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const featureEntries = selectedAnalysis
    ? Object.entries(
        isCitizen
          ? selectedAnalysis.public_features ?? {}
          : selectedAnalysis.features ?? {},
      ).filter(([key]) => FEATURE_LABELS[key])
    : [];
  const flags = selectedAnalysis ? getAnalysisFlags(selectedAnalysis) : [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="AI Fraud & Anomaly Detection"
        description="AI-assisted analysis identifies unusual spending, bidding and vendor patterns that may require further review. These results do not confirm fraud."
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        Risk score is a 0–100 review-risk index, not a probability of fraud. Anomalies and rule flags describe patterns for human review; they do not prove wrongdoing.
      </div>

      {summaryError ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {summaryError}
        </div>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label={isCitizen ? 'Tenders Analyzed' : 'Total Analyzed Tenders'}
            value={summary?.total_analyzed_tenders}
          />
          <SummaryCard label="High Risk" value={summary?.high_count} level="HIGH" />
          <SummaryCard label="Medium Risk" value={summary?.medium_count} level="MEDIUM" />
          <SummaryCard label="Low Risk" value={summary?.low_count} level="LOW" />
          <SummaryCard
            label="Tenders with Flagged or Anomalous Bids"
            value={summary?.tenders_with_flagged_or_anomalous_bids}
          />
          <SummaryCard
            label="Average Risk Score"
            value={summary?.average_risk_score.toFixed(1)}
          />
          <SummaryCard
            label="Risk Score Range"
            value={
              summary
                ? `${summary.minimum_risk_score}–${summary.maximum_risk_score}`
                : undefined
            }
          />
        </section>
      )}

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>{isCitizen ? 'Public Tender Risk Overview' : 'Tender Risk Analyses'}</CardTitle>
              <CardDescription>
                {isCitizen
                  ? 'Public-facing summaries of AI-assisted tender review indicators.'
                  : 'Select a tender to review its risk indicators and supporting aggregate features.'}
              </CardDescription>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              Risk level
              <select
                value={riskFilter}
                onChange={(event) => {
                  setRiskFilter(event.target.value as RiskFilter);
                  setOffset(0);
                  setSelectedAnalysis(null);
                }}
                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="ALL">All</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-48 items-center justify-center text-sm text-slate-500">
              Loading AI analysis data…
            </div>
          ) : listError ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
              <p>{listError}</p>
              <Button className="mt-3" variant="outline" onClick={() => setListReload((value) => value + 1)}>
                Try again
              </Button>
            </div>
          ) : analyses.length === 0 ? (
            <div className="py-14 text-center text-sm text-slate-500">
              No tender risk analyses found.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tender ID</TableHead>
                    <TableHead>Title</TableHead>
                    {isAdmin && <TableHead>State</TableHead>}
                    <TableHead>District</TableHead>
                    <TableHead>Panchayat</TableHead>
                    <TableHead>Risk Score</TableHead>
                    <TableHead>Risk Level</TableHead>
                    {isAdmin && <TableHead>Analysis Date</TableHead>}
                    <TableHead><span className="sr-only">Details</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analyses.map((analysis) => (
                    <TableRow key={analysis.tender_id}>
                      <TableCell className="font-medium text-slate-950">
                        {analysis.public_tender_id ?? analysis.tender_id}
                      </TableCell>
                      <TableCell>{analysis.tender_title ?? 'Tender'}</TableCell>
                      {isAdmin && <TableCell>{analysis.state ?? '—'}</TableCell>}
                      <TableCell>{analysis.district ?? '—'}</TableCell>
                      <TableCell>{analysis.panchayat ?? '—'}</TableCell>
                      <TableCell>{analysis.risk_score}</TableCell>
                      <TableCell>
                        <Badge variant={RISK_BADGE_VARIANT[analysis.risk_level]}>
                          {analysis.risk_level}
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell>{new Date(analysis.created_at).toLocaleDateString()}</TableCell>
                      )}
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`View risk analysis for tender ${analysis.public_tender_id ?? analysis.tender_id}`}
                          onClick={() => void openAnalysis(analysis)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  Showing {offset + 1}–{Math.min(offset + analyses.length, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  >
                    <ArrowLeftIcon className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="px-2 text-sm text-slate-600">
                    Page {pageNumber} of {pageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset + analyses.length >= total}
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                  >
                    Next
                    <ArrowRightIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {(detailLoading || detailError || selectedAnalysis) && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>
                  {isCitizen ? 'Public Tender Risk Detail' : 'Tender Analysis Detail'}
                </CardTitle>
                <CardDescription>
                  {selectedAnalysis?.tender_title ?? 'AI-assisted review information'}
                </CardDescription>
              </div>
              {selectedAnalysis && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedAnalysis(null)}
                >
                  Close
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {detailLoading ? (
              <p className="py-5 text-sm text-slate-500">Loading selected tender analysis…</p>
            ) : detailError ? (
              <p role="alert" className="text-sm text-red-700">{detailError}</p>
            ) : selectedAnalysis ? (
              <div className="space-y-6">
                {isCitizen ? (
                  <>
                    <DetailSection title="Tender">
                      <DetailValue label="Tender ID" value={selectedAnalysis.tender_id} />
                      <DetailValue label="Title" value={selectedAnalysis.tender_title} />
                      <DetailValue label="District" value={selectedAnalysis.district} />
                      <DetailValue label="Panchayat" value={selectedAnalysis.panchayat} />
                    </DetailSection>
                    <DetailSection title="AI Findings">
                      <DetailValue label="Risk Score" value={selectedAnalysis.risk_score} />
                      <DetailValue label="Risk Level" value={selectedAnalysis.risk_level} />
                      <p className="text-sm leading-6 text-slate-700">{selectedAnalysis.summary}</p>
                      <p className="text-sm leading-6 text-slate-600">
                        {selectedAnalysis.public_explanation}
                      </p>
                      {selectedAnalysis.public_indicators?.map((indicator) => (
                        <div key={indicator.indicator} className="rounded-lg border border-slate-200 p-3">
                          <p className="text-sm font-semibold text-slate-800">{indicator.indicator}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Bids with this indicator: {indicator.affected_bid_count}
                          </p>
                        </div>
                      ))}
                    </DetailSection>
                    <ReviewNotice />
                  </>
                ) : (
                  <>
                    <DetailSection title="Tender Information">
                      <DetailValue label="Tender ID" value={selectedAnalysis.public_tender_id ?? selectedAnalysis.tender_id} />
                      <DetailValue label="Title" value={selectedAnalysis.tender_title} />
                      <DetailValue label="State" value={selectedAnalysis.state} />
                      <DetailValue label="District" value={selectedAnalysis.district} />
                      <DetailValue label="Panchayat" value={selectedAnalysis.panchayat} />
                    </DetailSection>
                    <DetailSection title="AI Findings">
                      <DetailValue label="Risk Score" value={`${selectedAnalysis.risk_score} / 100`} />
                      <DetailValue label="Risk Level" value={selectedAnalysis.risk_level} />
                      <p className="text-sm leading-6 text-slate-700">{selectedAnalysis.summary}</p>
                    </DetailSection>
                    <DetailSection title="Risk Indicators">
                      {flags.length > 0 ? (
                        flags.map(([flag, count]) => (
                          <div key={flag} className="rounded-lg border border-slate-200 p-3">
                            <p className="text-sm font-semibold text-slate-800">{flag}</p>
                            <p className="mt-1 text-sm text-slate-600">
                              {FLAG_EXPLANATIONS[flag] ?? 'This predefined review condition was triggered.'}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">Affected bids: {count}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">
                          No explicit rule indicators were recorded for this tender.
                        </p>
                      )}
                    </DetailSection>
                    <DetailSection title="Relevant Features">
                      {featureEntries.length > 0 ? (
                        featureEntries.map(([key, value]) => (
                          <DetailValue
                            key={key}
                            label={FEATURE_LABELS[key] ?? key}
                            value={displayValue(value)}
                          />
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">No aggregate features available.</p>
                      )}
                    </DetailSection>
                    <DetailSection title="Review Information">
                      {!isCitizen && selectedAnalysis.model_version && (
                        <DetailValue label="Model Version" value={selectedAnalysis.model_version} />
                      )}
                      <DetailValue
                        label="Analysis Date"
                        value={new Date(selectedAnalysis.created_at).toLocaleString()}
                      />
                      <p className="text-sm font-medium leading-6 text-amber-800">
                        Auditor/official review required where indicated. AI findings describe unusual patterns and do not confirm fraud.
                      </p>
                    </DetailSection>
                    <ReviewNotice />
                  </>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  level,
}: {
  label: string;
  value: number | string | undefined;
  level?: RiskLevel;
}) {
  const accent =
    level === 'HIGH'
      ? 'text-red-700'
      : level === 'MEDIUM'
        ? 'text-amber-700'
        : level === 'LOW'
          ? 'text-emerald-700'
          : 'text-slate-950';
  return (
    <Card>
      <CardHeader>
        <CardDescription className="metric-label">{label}</CardDescription>
        <CardTitle className={`metric-value mt-2 ${accent}`}>
          {value ?? '—'}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-slate-100 pt-5 first:border-0 first:pt-0">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function DetailValue({ label, value }: { label: string; value: unknown }) {
  const content = value === null || value === undefined ? 'Not available' : String(value);
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm text-slate-800">{content}</p>
    </div>
  );
}

function ReviewNotice() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
      <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
      <p>
        The Isolation Forest identifies patterns that are unusual relative to
        the analyzed data. Rule flags indicate predefined review conditions.
        Neither proves fraud; human review may be required.
      </p>
    </div>
  );
}
