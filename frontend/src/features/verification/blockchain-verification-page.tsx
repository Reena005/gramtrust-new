import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
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
import { apiClient, fetcher } from '@/lib/api-client';
import { formatCurrency } from '@/lib/utils';
import {
  getBlockchainBadgeVariant,
  getIntegrityBadgeVariant,
} from '@/lib/status';
import { useAuth } from '@/features/auth/auth-context';
import type { LedgerProject } from '@/types/ledger';

export function BlockchainVerificationPage() {
  const { user } = useAuth();

  // Citizen can view blockchain information but cannot run verification.
  const canVerify = user?.role !== 'CITIZEN';

  const queryClient = useQueryClient();

  const { data: projects = [] } = useQuery<LedgerProject[]>({
    queryKey: ['projects'],
    queryFn: () => fetcher<LedgerProject[]>('/projects'),
  });

  const [projectId, setProjectId] = useState('');
  const [result, setResult] = useState<LedgerProject | null>(null);
  const [message, setMessage] = useState<string>(
    'Select a project and run a verification sweep.',
  );

  // Automatically select the first project when the project list loads.
  useEffect(() => {
    if (
      projects.length &&
      !projects.some((project) => project.id === projectId)
    ) {
      setProjectId(projects[0].id);
    }
  }, [projectId, projects]);

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ data: LedgerProject }>(
        `/projects/${projectId}/verify`,
      );

      return data.data;
    },

    onSuccess: async (project) => {
      setResult(project);

      const msg =
        project.integrityStatus === 'Verified'
          ? `Verified — ${project.name} matches the blockchain record.`
          : `Integrity Failed! DB amount ≠ Blockchain amount. Possible tampering detected.`;

      setMessage(msg);

      await queryClient.invalidateQueries();
    },

    onError: () => {
      setMessage(
        'Unable to verify the selected project. Check the project ID and try again.',
      );
    },
  });

  const selectedProject = projects.find(
    (project) => project.id === projectId,
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Verification console"
        title="Blockchain verification"
        description="Confirm whether a project is still aligned with its immutable on-chain record."
      />

      <section className="grid gap-6 xl:grid-cols-[1fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Run a verification</CardTitle>
            <CardDescription>
              Select a project from the available project records.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div>
              <label className="metric-label mb-2 block">
                Project
              </label>

              <select
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  setResult(null);
                  setMessage(
                    'Select a project and run a verification sweep.',
                  );
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.id} — {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {canVerify && (
                <Button
                  onClick={() => verifyMutation.mutate()}
                  disabled={!projectId || verifyMutation.isPending}
                >
                  <ShieldExclamationIcon className="h-4 w-4" />

                  {verifyMutation.isPending
                    ? 'Verifying...'
                    : 'Verify Blockchain'}
                </Button>
              )}

              <Button
                variant="outline"
                onClick={() => {
                  setProjectId(projects[0]?.id ?? '');
                  setResult(null);
                  setMessage(
                    'Select a project and run a verification sweep.',
                  );
                }}
                disabled={!projects.length}
              >
                Reset to first project
              </Button>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm leading-6 text-slate-700">
              {message}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Selected project</CardTitle>
              <CardDescription>
                Current record loaded from the ledger.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {selectedProject ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {selectedProject.name}
                      </p>

                      <p className="text-sm text-slate-500">
                        {selectedProject.district},{' '}
                        {selectedProject.state}
                      </p>
                    </div>

                    <Badge
                      variant={getBlockchainBadgeVariant(
                        selectedProject.blockchainStatus,
                      )}
                    >
                      {selectedProject.blockchainStatus}
                    </Badge>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <MiniStat
                      label="Database Amount"
                      value={formatCurrency(selectedProject.amount)}
                    />

                    <MiniStat
                      label="Blockchain Amount"
                      value={formatCurrency(
                        selectedProject.blockchainAmount,
                      )}
                    />

                    <MiniStat
                      label="Integrity"
                      value={
                        <Badge
                          variant={getIntegrityBadgeVariant(
                            selectedProject.integrityStatus,
                          )}
                        >
                          {selectedProject.integrityStatus}
                        </Badge>
                      }
                    />

                    <MiniStat
                      label="Blockchain Hash"
                      value={
                        selectedProject.blockchainHash
                          ? `${selectedProject.blockchainHash.slice(
                              0,
                              18,
                            )}...`
                          : 'Not available'
                      }
                    />
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-600">
                  The selected project ID does not exist in the current
                  dataset.
                </div>
              )}
            </CardContent>
          </Card>

          {result ? (
            <Card>
              <CardHeader>
                <CardTitle>Verification result</CardTitle>

                <CardDescription>
                  Latest outcome returned from the blockchain verification
                  endpoint.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3 text-sm leading-6 text-slate-700">
                <ResultLine
                  icon={
                    <CheckCircleIcon className="h-4 w-4 text-emerald-600" />
                  }
                  label="Project"
                  value={result.name}
                />

                <ResultLine
                  icon={
                    <CheckCircleIcon className="h-4 w-4 text-emerald-600" />
                  }
                  label="Integrity"
                  value={result.integrityStatus}
                />

                <ResultLine
                  icon={
                    <CheckCircleIcon className="h-4 w-4 text-emerald-600" />
                  }
                  label="Blockchain Status"
                  value={result.blockchainStatus}
                />

                <ResultLine
                  icon={
                    <CheckCircleIcon className="h-4 w-4 text-emerald-600" />
                  }
                  label="Ledger Hash"
                  value={result.blockchainHash}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Verification state</CardTitle>

                <CardDescription>
                  The latest verification result appears here after each run.
                </CardDescription>
              </CardHeader>

              <CardContent className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" />

                No verification has been executed yet.
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="metric-label mb-2">{label}</p>

      <div className="text-sm font-medium text-slate-800">
        {value}
      </div>
    </div>
  );
}

function ResultLine({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mt-0.5">{icon}</div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          {label}
        </p>

        <p className="mt-1 break-all font-medium text-slate-900">
          {value}
        </p>
      </div>
    </div>
  );
}