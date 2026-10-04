import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  MagnifyingGlassIcon,
  CheckBadgeIcon,
  BeakerIcon,
  DocumentTextIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

import { PageHeader } from '@/components/layout/page-header';
import {
  Card,
  CardContent,
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/features/auth/auth-context';
import type { TamperLog } from '@/types/tender';

export function TamperLogsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canSimulateTampering =
    user?.role === 'ADMIN' || user?.role === 'OFFICIAL';

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterDate, setFilterDate] = useState('');
  const [simulationMessage, setSimulationMessage] =
    useState<string | null>(null);

  // ------------------------------------------------------------
  // FETCH TAMPER LOGS
  // ------------------------------------------------------------

  const {
    data: logs = [],
    refetch,
    isFetching,
  } = useQuery<TamperLog[]>({
    queryKey: ['tamper-logs'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: TamperLog[] }>(
        '/tamper-logs',
      );

      return data.data;
    },
  });

  // ------------------------------------------------------------
  // SIMULATE TENDER TAMPERING
  // Existing tender functionality is preserved.
  // ------------------------------------------------------------

  const simulateMutation = useMutation({
    mutationFn: async (tenderId?: string) => {
      const { data } = await apiClient.post<{
        message: string;
        data: any;
      }>('/actions/simulate-tender-tampering', {
        tenderId,
      });

      return data;
    },

    onSuccess: (data) => {
      setSimulationMessage(
        data.message || 'Tampering simulated successfully.',
      );

      queryClient.invalidateQueries({
        queryKey: ['tamper-logs'],
      });

      queryClient.invalidateQueries({
        queryKey: ['tenders'],
      });

      refetch();
    },

    onError: (err: any) => {
      setSimulationMessage(
        `Simulation failed: ${
          err?.response?.data?.message || err.message
        }`,
      );
    },
  });

  // ------------------------------------------------------------
  // DOCUMENT DETECTION
  // Only DOCxxx records are treated as document records.
  // Everything else keeps the existing tender behavior.
  // ------------------------------------------------------------

  const isDocumentLog = (log: TamperLog) => {
    return Boolean(log.recordId?.toUpperCase().startsWith('DOC'));
  };

  // ------------------------------------------------------------
  // DOCUMENT DESCRIPTION
  // ------------------------------------------------------------

  const getDocumentDescription = (log: TamperLog) => {
    const field = log.fieldName || 'document_integrity';

    if (field === 'document_name') {
      return (
        <>
          <span className="font-semibold text-rose-700">
            Document Tampering:
          </span>{' '}
          Document name modification detected.
        </>
      );
    }

    if (field === 'document_type') {
      return (
        <>
          <span className="font-semibold text-rose-700">
            Document Tampering:
          </span>{' '}
          Document type modification detected.
        </>
      );
    }

    if (field === 'file_path') {
      return (
        <>
          <span className="font-semibold text-rose-700">
            Document Tampering:
          </span>{' '}
          Document file path modification detected.
        </>
      );
    }

    if (field === 'source_dataset') {
      return (
        <>
          <span className="font-semibold text-rose-700">
            Document Tampering:
          </span>{' '}
          Document source dataset modification detected.
        </>
      );
    }

    if (field === 'amount') {
      return (
        <>
          <span className="font-semibold text-rose-700">
            Document Tampering:
          </span>{' '}
          Document amount modification detected.
        </>
      );
    }

    return (
      <>
        <span className="font-semibold text-rose-700">
          Document Tampering:
        </span>{' '}
        Document integrity hash does not match the anchored blockchain
        hash.
      </>
    );
  };

  // ------------------------------------------------------------
  // FILTERING
  // ------------------------------------------------------------

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();

        const matchTender = log.tenderId
          ?.toLowerCase()
          .includes(q);

        const matchVendor = log.vendorName
          ?.toLowerCase()
          .includes(q);

        const matchRecord = log.recordId
          ?.toLowerCase()
          .includes(q);

        const matchUser = log.userName
          ?.toLowerCase()
          .includes(q);

        const matchField = log.fieldName
          ?.toLowerCase()
          .includes(q);

        if (
          !matchTender &&
          !matchVendor &&
          !matchRecord &&
          !matchUser &&
          !matchField
        ) {
          return false;
        }
      }

      // Status
      if (filterStatus !== 'ALL') {
        if (filterStatus === 'TAMPERED') {
          if (
            log.status !== 'TAMPERED' &&
            log.status !== 'DETECTED'
          ) {
            return false;
          }
        } else if (log.status !== filterStatus) {
          return false;
        }
      }

      // Date
      if (filterDate) {
        const logDate = new Date(log.timestamp)
          .toISOString()
          .split('T')[0];

        if (logDate !== filterDate) {
          return false;
        }
      }

      return true;
    });
  }, [logs, searchQuery, filterStatus, filterDate]);

  // ------------------------------------------------------------
  // COUNTS
  // ------------------------------------------------------------

  const tamperedCount = logs.filter(
    (log) =>
      log.status === 'TAMPERED' ||
      log.status === 'DETECTED',
  ).length;

  const documentTamperedCount = logs.filter(
    (log) =>
      isDocumentLog(log) &&
      (log.status === 'TAMPERED' ||
        log.status === 'DETECTED'),
  ).length;

  const authorizedCount = logs.filter(
    (log) => log.status === 'AUTHORIZED',
  ).length;

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------

  return (
    <div className="space-y-8">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

        <PageHeader
          eyebrow="Security & Audit Trail"
          title="Tamper Logs"
          description="Monitor detected database alterations, document integrity violations, and authorized changes."
        />

        <div className="flex flex-wrap items-center gap-2">

          {/* Existing tender simulation */}
          {canSimulateTampering && (
            <Button
              onClick={() =>
                simulateMutation.mutate('T705')
              }
              disabled={simulateMutation.isPending}
              variant="outline"
              className="flex items-center gap-1.5 border-rose-200 bg-rose-50/50 text-rose-700 hover:bg-rose-100 hover:text-rose-800"
            >
              <BeakerIcon className="h-4 w-4" />

              {simulateMutation.isPending
                ? 'Simulating...'
                : 'Simulate Tender Tampering (T705)'}
            </Button>
          )}

          <Button
            onClick={() => refetch()}
            disabled={isFetching}
            variant="outline"
            className="flex items-center gap-1.5"
          >
            <ArrowPathIcon
              className={`h-4 w-4 ${
                isFetching ? 'animate-spin' : ''
              }`}
            />

            Refresh
          </Button>

        </div>
      </div>

      {/* ======================================================
          SIMULATION MESSAGE
      ====================================================== */}

      {simulationMessage && (
        <div className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">

          <div className="flex items-center gap-2">

            <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-rose-600" />

            <span>{simulationMessage}</span>

          </div>

          <button
            onClick={() => setSimulationMessage(null)}
            className="ml-4 text-rose-600 underline hover:text-rose-900"
          >
            Dismiss
          </button>

        </div>
      )}

      {/* ======================================================
          OVERVIEW CARDS
      ====================================================== */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

        {/* Total */}
        <Card className="border-slate-200 shadow-soft">
          <CardContent className="p-5">

            <div className="flex items-center justify-between">

              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Logs
              </span>

              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <ShieldCheckIcon className="h-5 w-5" />
              </span>

            </div>

            <div className="mt-3 text-2xl font-bold text-slate-900">
              {logs.length}
            </div>

            <p className="mt-1 text-xs text-slate-500">
              All registered change events
            </p>

          </CardContent>
        </Card>

        {/* All tampered */}
        <Card className="border-rose-200 bg-rose-50/30 shadow-soft">
          <CardContent className="p-5">

            <div className="flex items-center justify-between">

              <span className="text-xs font-semibold uppercase tracking-wider text-rose-600">
                Tampered Incidents
              </span>

              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                <ExclamationTriangleIcon className="h-5 w-5" />
              </span>

            </div>

            <div className="mt-3 text-2xl font-bold text-rose-700">
              {tamperedCount}
            </div>

            <p className="mt-1 text-xs font-medium text-rose-600">
              Integrity violations detected
            </p>

          </CardContent>
        </Card>

        {/* Documents */}
        <Card className="border-amber-200 bg-amber-50/30 shadow-soft">
          <CardContent className="p-5">

            <div className="flex items-center justify-between">

              <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                Document Tampering
              </span>

              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <DocumentTextIcon className="h-5 w-5" />
              </span>

            </div>

            <div className="mt-3 text-2xl font-bold text-amber-700">
              {documentTamperedCount}
            </div>

            <p className="mt-1 text-xs font-medium text-amber-700">
              Document integrity violations
            </p>

          </CardContent>
        </Card>

        {/* Authorized */}
        <Card className="border-emerald-200 bg-emerald-50/30 shadow-soft">
          <CardContent className="p-5">

            <div className="flex items-center justify-between">

              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                Authorized Changes
              </span>

              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                <CheckBadgeIcon className="h-5 w-5" />
              </span>

            </div>

            <div className="mt-3 text-2xl font-bold text-emerald-700">
              {authorizedCount}
            </div>

            <p className="mt-1 text-xs text-emerald-600">
              Legitimate version modifications
            </p>

          </CardContent>
        </Card>

      </div>

      {/* ======================================================
          FILTERS
      ====================================================== */}

      <Card className="border-slate-200 shadow-soft">

        <CardHeader className="pb-3">

          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Filter Tamper Records
          </CardTitle>

        </CardHeader>

        <CardContent>

          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">

            {/* Search */}
            <div>

              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Document ID / Tender / Vendor
              </label>

              <div className="relative">

                <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />

                <Input
                  placeholder="e.g. DOC200 or T705"
                  value={searchQuery}
                  onChange={(event) =>
                    setSearchQuery(event.target.value)
                  }
                  className="pl-9 text-xs"
                />

              </div>

            </div>

            {/* Status */}
            <div>

              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Status
              </label>

              <select
                value={filterStatus}
                onChange={(event) =>
                  setFilterStatus(event.target.value)
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="ALL">
                  All Statuses
                </option>

                <option value="TAMPERED">
                  ⚠ Tampered / Detected
                </option>

                <option value="AUTHORIZED">
                  Authorized
                </option>

                <option value="BLOCKED">
                  Blocked
                </option>
              </select>

            </div>

            {/* Date */}
            <div>

              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Detection Date
              </label>

              <Input
                type="date"
                value={filterDate}
                onChange={(event) =>
                  setFilterDate(event.target.value)
                }
                className="text-xs"
              />

            </div>

          </div>

        </CardContent>

      </Card>

      {/* ======================================================
          TABLE
      ====================================================== */}

      <Card className="overflow-hidden border-slate-200 shadow-soft">

        <CardContent className="p-0">

          <div className="overflow-x-auto">

            <Table>

              <TableHeader className="bg-slate-50">

                <TableRow>

                  <TableHead className="w-[150px]">
                    Record
                  </TableHead>

                  <TableHead className="min-w-[210px]">
                    Subject
                  </TableHead>

                  <TableHead className="w-[150px]">
                    Status
                  </TableHead>

                  <TableHead className="w-[180px]">
                    Detected At
                  </TableHead>

                  <TableHead className="min-w-[350px]">
                    Incident Details
                  </TableHead>

                </TableRow>

              </TableHeader>

              <TableBody>

                {filteredLogs.length > 0 ? (

                  filteredLogs.map((log) => {

                    const isTampered =
                      log.status === 'TAMPERED' ||
                      log.status === 'DETECTED';

                    const isDocument =
                      isDocumentLog(log);

                    const tenderId =
                      log.tenderId ||
                      (
                        log.recordId?.startsWith('T')
                          ? log.recordId
                          : null
                      );

                    const vendorName =
                      log.vendorName ||
                      'Not specified';

                    return (

                      <TableRow
                        key={log.id}
                        className={
                          isTampered
                            ? 'border-l-4 border-l-rose-500 bg-rose-50/40 transition-colors hover:bg-rose-50/70'
                            : 'transition-colors hover:bg-slate-50/50'
                        }
                      >

                        {/* =================================================
                            RECORD
                        ================================================= */}

                        <TableCell>

                          {isDocument ? (

                            <div className="flex items-center gap-2">

                              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">

                                <DocumentTextIcon className="h-4 w-4" />

                              </span>

                              <span className="font-mono text-sm font-bold text-slate-800">
                                {log.recordId}
                              </span>

                            </div>

                          ) : tenderId ? (

                            <Link
                              to={`/tenders/${tenderId}`}
                              className="inline-flex items-center gap-1 font-mono text-sm font-bold text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {tenderId}
                            </Link>

                          ) : (

                            <span className="font-mono text-xs font-semibold text-slate-700">
                              {log.recordId}
                            </span>

                          )}

                        </TableCell>

                        {/* =================================================
                            SUBJECT
                        ================================================= */}

                        <TableCell>

                          {isDocument ? (

                            <div>

                              <div className="flex items-center gap-2 font-semibold text-slate-900">

                                <DocumentTextIcon className="h-4 w-4 text-amber-600" />

                                Document Integrity

                              </div>

                              <p className="mt-1 text-[11px] text-slate-500">

                                {log.fieldName
                                  ? `${log.fieldName} modification`
                                  : 'Anchored document modified'}

                              </p>

                            </div>

                          ) : (

                            <div>

                              <div className="font-semibold text-slate-900">
                                {vendorName}
                              </div>

                              {isTampered && (

                                <p className="mt-0.5 text-[11px] text-rose-600">
                                  Bid associated with this vendor altered
                                </p>

                              )}

                            </div>

                          )}

                        </TableCell>

                        {/* =================================================
                            STATUS
                        ================================================= */}

                        <TableCell>

                          {isTampered ? (

                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-100 px-3 py-1.5 text-xs font-extrabold text-rose-800">

                              <ExclamationTriangleIcon className="h-4 w-4 text-rose-600" />

                              TAMPERED

                            </span>

                          ) : log.status === 'AUTHORIZED' ? (

                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">

                              <CheckBadgeIcon className="h-3.5 w-3.5" />

                              Authorized

                            </span>

                          ) : (

                            <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">

                              {log.status}

                            </span>

                          )}

                        </TableCell>

                        {/* =================================================
                            DETECTED AT
                        ================================================= */}

                        <TableCell>

                          <div className="flex items-start gap-2">

                            <ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />

                            <span className="font-mono text-xs text-slate-600">
                              {formatDateTime(log.timestamp)}
                            </span>

                          </div>

                        </TableCell>

                        {/* =================================================
                            INCIDENT DETAILS
                        ================================================= */}

                        <TableCell>

                          {isTampered ? (

                            isDocument ? (

                              /* ============================================
                                 DOCUMENT TAMPERING
                              ============================================ */

                              <div className="rounded-xl border border-rose-200 bg-white p-3">

                                <div className="text-xs leading-5 text-slate-800">

                                  <div className="mb-2">

                                    {getDocumentDescription(log)}

                                  </div>

                                  {log.oldValue &&
                                    log.newValue && (

                                      <div className="space-y-2">

                                        <div>

                                          <span className="font-semibold text-slate-500">
                                            Original value
                                          </span>

                                          <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-700 break-all">
                                            {log.oldValue}
                                          </div>

                                        </div>

                                        <div>

                                          <span className="font-semibold text-slate-500">
                                            Attempted value
                                          </span>

                                          <div className="mt-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 font-mono text-[11px] text-rose-700 break-all">
                                            {log.newValue}
                                          </div>

                                        </div>

                                      </div>

                                  )}

                                  {!log.oldValue &&
                                    !log.newValue && (

                                      <p className="text-xs text-slate-500">
                                        The document integrity value does not
                                        match the anchored blockchain record.
                                      </p>

                                  )}

                                </div>

                              </div>

                            ) : (

                              /* ============================================
                                 EXISTING TENDER / BID TAMPERING
                              ============================================ */

                              <div className="text-xs text-slate-800">

                                <span className="font-semibold text-rose-700">
                                  Database Tampering:{' '}
                                </span>

                                {log.oldValue &&
                                log.newValue ? (

                                  <span>

                                    Bid amount modified in DB from{' '}

                                    <span className="font-bold text-slate-900">

                                      ₹
                                      {Number(
                                        log.oldValue,
                                      ).toLocaleString('en-IN')}

                                    </span>{' '}

                                    to{' '}

                                    <span className="font-bold text-rose-700">

                                      ₹
                                      {Number(
                                        log.newValue,
                                      ).toLocaleString('en-IN')}

                                    </span>

                                  </span>

                                ) : (

                                  <span>
                                    Direct unauthorized database
                                    modification detected
                                  </span>

                                )}

                              </div>

                            )

                          ) : (

                            <div className="text-xs text-slate-600">

                              <span className="font-medium text-slate-800">
                                {log.fieldName}:{' '}
                              </span>

                              {log.oldValue || '—'}

                              {' → '}

                              {log.newValue || '—'}

                            </div>

                          )}

                        </TableCell>

                      </TableRow>

                    );

                  })

                ) : (

                  <TableRow>

                    <TableCell
                      colSpan={5}
                      className="py-16 text-center"
                    >

                      <div className="flex flex-col items-center justify-center">

                        <ShieldCheckIcon className="mb-3 h-12 w-12 text-slate-300" />

                        <p className="font-semibold text-slate-700">
                          No tamper logs found
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          Try clearing the filters or refresh the
                          integrity records.
                        </p>

                      </div>

                    </TableCell>

                  </TableRow>

                )}

              </TableBody>

            </Table>

          </div>

        </CardContent>

      </Card>

    </div>
  );
}

export default TamperLogsPage;