import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftIcon, ArrowPathIcon, ClockIcon } from '@heroicons/react/24/outline';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/auth-context';
import { apiClient, fetcher } from '@/lib/api-client';
import { formatCurrency, formatDateTime, formatShortDate } from '@/lib/utils';
import { getBlockchainBadgeVariant, getIntegrityBadgeVariant, getProjectBadgeVariant, getTransactionBadgeVariant } from '@/lib/status';
import type { LedgerProject, LedgerTransaction } from '@/types/ledger';

export function ProjectDetailsPage() {
  const { user } = useAuth();
  const canModifyProject = user?.role !== 'CITIZEN';
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  
  // Demo editing states
  const [isEditing, setIsEditing] = useState(false);
  const [editAmount, setEditAmount] = useState('');

  const projectQuery = useQuery<LedgerProject>({
    queryKey: ['project', projectId],
    queryFn: () => fetcher<LedgerProject>(`/projects/${projectId}`),
    enabled: Boolean(projectId),
  });

  const historyQuery = useQuery<LedgerTransaction[]>({
    queryKey: ['transactions', projectId],
    queryFn: () => fetcher<LedgerTransaction[]>(`/projects/${projectId}/transactions`),
    enabled: Boolean(projectId),
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ data: LedgerProject }>(`/projects/${projectId}/verify`);
      return data.data;
    },
    onSuccess: async (project) => {
      const status = project.integrityStatus === 'Verified'
        ? '✅ Integrity Verified — Database matches Blockchain.'
        : `❌ Integrity Failed! DB: ${project.amount}, Chain: ${project.blockchainAmount}, Diff: ${(project.amount - project.blockchainAmount).toFixed(2)}`;
      setStatusMessage(status);
      await queryClient.invalidateQueries();
    },
  });

  const editMutation = useMutation({
    mutationFn: async (newAmount: number) => {
      const { data } = await apiClient.put<{ data: LedgerProject }>(`/projects/${projectId}`, {
        amount: newAmount,
      });
      return data.data;
    },
    onSuccess: async () => {
      setStatusMessage('⚠️ Amount tampered in PostgreSQL only. Blockchain remains unchanged. Click Verify Integrity to detect the mismatch.');
      setIsEditing(false);
      await queryClient.invalidateQueries();
    },
  });

  const project = projectQuery.data;

  const summary = useMemo(() => {
    if (!project) {
      return null;
    }

    return {
      difference: project.amount - project.blockchainAmount,
      verified: project.amount === project.blockchainAmount,
    };
  }, [project]);

  if (projectQuery.isLoading) {
    return <div className="rounded-2xl border bg-white p-8 text-slate-600">Loading project details...</div>;
  }

  if (projectQuery.isError || !project) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Project not found</CardTitle>
          <CardDescription>The requested project does not exist in the current ledger snapshot.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => navigate('/projects')}>
            <ArrowLeftIcon className="h-4 w-4" />
            Back to projects
          </Button>
        </CardContent>
      </Card>
    );
  }

  const handleStartEdit = () => {
    setEditAmount(project.amount.toString());
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const val = Number(editAmount);
    if (!isNaN(val) && val >= 0) {
      editMutation.mutate(val);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Project details"
        title={`${project.id} · ${project.name}`}
        description="Inspect the fund trail, compare on-chain records, and view project integrity information."
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/projects')}>
              <ArrowLeftIcon className="h-4 w-4" />
              Back to projects
            </Button>
            <Button variant="secondary" onClick={() => setHistoryOpen((current) => !current)}>
              <ClockIcon className="h-4 w-4" />
              Blockchain History
            </Button>
            {canModifyProject && (
              <Button onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending}>
                <ArrowPathIcon className="h-4 w-4" />
                {verifyMutation.isPending ? 'Verifying...' : 'Verify Integrity'}
              </Button>
            )}
          </>
        }
      />

      {statusMessage ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {statusMessage}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Project information</CardTitle>
              <CardDescription>Administrative and financial metadata for the selected project.</CardDescription>
            </div>
            {canModifyProject && !isEditing ? (
              <Button variant="outline" size="sm" onClick={handleStartEdit}>
                Edit Amount (Demo)
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {canModifyProject && isEditing ? (
              <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/50 p-5 space-y-4">
                <p className="text-sm font-semibold text-slate-800">Tamper database amount (PostgreSQL Only):</p>
                <div className="flex gap-3 max-w-md">
                  <Input
                    type="number"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                  />
                  <Button onClick={handleSaveEdit} disabled={editMutation.isPending}>Save</Button>
                  <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                </div>
              </div>
            ) : null}

            <div className="grid gap-5 sm:grid-cols-2">
              <DetailItem label="District" value={project.district} />
              <DetailItem label="State" value={project.state} />
              <DetailItem label="Financial Year" value={project.financialYear} />
              <DetailItem label="Project Status" value={<Badge variant={getProjectBadgeVariant(project.status)}>{project.status}</Badge>} />
              <DetailItem label="Blockchain Status" value={<Badge variant={getBlockchainBadgeVariant(project.blockchainStatus)}>{project.blockchainStatus}</Badge>} />
              <DetailItem label="Integrity Status" value={<Badge variant={getIntegrityBadgeVariant(project.integrityStatus)}>{project.integrityStatus}</Badge>} />
              <DetailItem label="Database Amount" value={formatCurrency(project.amount)} />
              <DetailItem label="Blockchain Amount" value={formatCurrency(project.blockchainAmount)} />
              <DetailItem label="Last Updated" value={formatShortDate(project.lastUpdatedAt)} />
              <DetailItem label="Remarks" value={project.remarks} fullWidth />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Integrity snapshot</CardTitle>
              <CardDescription>Quick reconciliation of database and blockchain values.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <BalanceRow label="Database amount" value={formatCurrency(project.amount)} />
              <BalanceRow label="Blockchain amount" value={formatCurrency(project.blockchainAmount)} />
              <BalanceRow label="Difference" value={formatCurrency(summary?.difference ?? 0)} highlight={summary?.verified ?? false} />
              <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                A zero difference means the immutable ledger and the local dataset are aligned.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ledger hash</CardTitle>
              <CardDescription>Blockchain fingerprint recorded for the current project state.</CardDescription>
            </CardHeader>
            <CardContent>
              <code className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                {project.blockchainHash}
              </code>
            </CardContent>
          </Card>
        </div>
      </section>

      {historyOpen ? (
        <Card>
          <CardHeader>
            <CardTitle>Blockchain history</CardTitle>
            <CardDescription>Chronological audit trail of ledger activity for this project.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(historyQuery.data ?? []).map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>
                      <Badge variant={getTransactionBadgeVariant(transaction.type)}>{transaction.type}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xl text-slate-700">{transaction.description}</TableCell>
                    <TableCell>{formatCurrency(transaction.amount)}</TableCell>
                    <TableCell>{formatDateTime(transaction.timestamp)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function DetailItem({
  label,
  value,
  fullWidth = false,
}: {
  label: string;
  value: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? 'sm:col-span-2' : ''}>
      <p className="metric-label mb-2">{label}</p>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">{value}</div>
    </div>
  );
}

function BalanceRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${highlight ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700'}`}>
      <span>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
