import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
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

import { fetcher } from '@/lib/api-client';
import { formatCurrency } from '@/lib/utils';
import { getIntegrityBadgeVariant } from '@/lib/status';

import type { IntegrityReport, LedgerProject } from '@/types/ledger';

export function IntegrityReportPage() {
  const { data: report } = useQuery<IntegrityReport>({
    queryKey: ['integrity-report'],
    queryFn: () => fetcher<IntegrityReport>('/integrity-report'),
  });

  const { data: projects = [] } = useQuery<LedgerProject[]>({
    queryKey: ['projects'],
    queryFn: () => fetcher<LedgerProject[]>('/projects'),
  });

  const comparisonData = useMemo(
    () =>
      projects.map((project) => ({
        name: project.id,
        database: project.amount,
        blockchain: project.blockchainAmount,
      })),
    [projects],
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Financial reconciliation"
        title="Integrity report"
        description="Compare the database amount and blockchain amount to understand ledger drift at a glance."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ReportMetric
          label="Database Amount"
          value={formatCurrency(report?.databaseAmount ?? 0)}
        />

        <ReportMetric
          label="Blockchain Amount"
          value={formatCurrency(report?.blockchainAmount ?? 0)}
        />

        <ReportMetric
          label="Difference"
          value={formatCurrency(report?.difference ?? 0)}
          highlight={(report?.difference ?? 0) === 0}
        />

        <Card>
          <CardHeader>
            <CardDescription className="metric-label">
              Status
            </CardDescription>

            <CardTitle className="mt-2 text-2xl font-semibold">
              <Badge
                variant={getIntegrityBadgeVariant(
                  report?.status ?? 'Review Required',
                )}
              >
                {report?.status ?? 'Review Required'}
              </Badge>
            </CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-sm leading-6 text-slate-600">
              This status reflects the current state of the full dataset.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>
              Database vs blockchain amounts
            </CardTitle>

            <CardDescription>
              Project-level comparison of the current ledger state.
            </CardDescription>
          </CardHeader>

          <CardContent className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={comparisonData}
                margin={{
                  top: 10,
                  right: 0,
                  left: 0,
                  bottom: 0,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                />

                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                />

                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) =>
                    `${Number(value) / 1000000}L`
                  }
                />

                <Tooltip
                  formatter={(value: number) =>
                    formatCurrency(value)
                  }
                />

                <Bar
                  dataKey="database"
                  radius={[12, 12, 0, 0]}
                  fill="#2563eb"
                />

                <Bar
                  dataKey="blockchain"
                  radius={[12, 12, 0, 0]}
                  fill="#0f766e"
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Mismatched projects
            </CardTitle>

            <CardDescription>
              These records need review before publishing the audit
              summary.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {report?.mismatchedProjects?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      Project
                    </TableHead>

                    <TableHead>
                      Difference
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {report?.mismatchedProjects?.map((project) => (
                    <TableRow key={project.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium text-slate-950">
                            {project.name}
                          </p>

                          <p className="text-xs text-slate-500">
                            {project.id}
                          </p>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge variant="danger">
                          {formatCurrency(
                            project.amount -
                              project.blockchainAmount,
                          )}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-800">
                No mismatches detected. The database total matches
                the immutable blockchain ledger.
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function ReportMetric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="metric-label">
          {label}
        </CardDescription>

        <CardTitle
          className={`mt-2 text-2xl font-semibold ${
            highlight
              ? 'text-emerald-700'
              : 'text-slate-950'
          }`}
        >
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}