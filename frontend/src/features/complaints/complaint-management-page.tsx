import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
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
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';

type ComplaintStatus =
  | 'Open'
  | 'UnderInvestigation'
  | 'Resolved'
  | 'Closed'
  | 'Rejected';
type ComplaintPriority = 'Low' | 'Medium' | 'High' | 'Critical';

type Complaint = {
  id: string;
  display_id: string;
  project_id: string | null;
  project_code: string | null;
  filed_by: string | null;
  assigned_to: string | null;
  title: string;
  description: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

type ComplaintListResponse = {
  success: boolean;
  count: number;
  data: Complaint[];
};

type ComplaintResponse = {
  success: boolean;
  data: Complaint;
};

const statuses: ComplaintStatus[] = [
  'Open',
  'UnderInvestigation',
  'Resolved',
  'Closed',
  'Rejected',
];
const priorities: ComplaintPriority[] = ['Low', 'Medium', 'High', 'Critical'];

function getErrorMessage(error: unknown, context: 'list' | 'detail' | 'update') {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401) return 'Your session has expired. Please sign in again.';
    if (status === 403) return 'You are not authorized to manage complaints.';
    if (status === 404 && context === 'detail') return 'This complaint could not be found.';
    if (status === 400 && context === 'update') {
      return 'Check the status and resolution notes, then try again.';
    }
    if (status && status >= 500) {
      return context === 'update'
        ? 'Unable to update the complaint. Please try again.'
        : 'Unable to load complaints. Please try again.';
    }
    if (!error.response) {
      return 'Could not connect to GramTrust. Check your connection and try again.';
    }
  }
  return context === 'update'
    ? 'Unable to update the complaint. Please try again.'
    : 'Unable to load complaints. Please try again.';
}

function formatDate(value: string | null): string {
  if (!value) return 'Not resolved';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return formatDateTime(date.toISOString());
}

function statusLabel(status: ComplaintStatus): string {
  return status === 'UnderInvestigation' ? 'Under Investigation' : status;
}

function statusVariant(status: ComplaintStatus) {
  if (status === 'Resolved' || status === 'Closed') return 'success';
  if (status === 'Rejected') return 'danger';
  if (status === 'UnderInvestigation') return 'warning';
  return 'secondary';
}

function priorityVariant(priority: ComplaintPriority) {
  if (priority === 'Critical' || priority === 'High') return 'danger';
  if (priority === 'Medium') return 'warning';
  return 'secondary';
}

export function ComplaintManagementPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<ComplaintPriority | ''>('');
  const [search, setSearch] = useState('');
  const [statusDraft, setStatusDraft] = useState<ComplaintStatus>('Open');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const submittingRef = useRef(false);

  const complaintsQuery = useQuery<Complaint[], unknown>({
    queryKey: ['complaints', 'management'],
    queryFn: async () => {
      const { data } = await apiClient.get<ComplaintListResponse>('/complaints');
      return data.data;
    },
  });

  const detailQuery = useQuery<Complaint, unknown>({
    queryKey: ['complaints', 'management', selectedId],
    queryFn: async () => {
      const { data } = await apiClient.get<ComplaintResponse>(
        `/complaints/${encodeURIComponent(selectedId)}`,
      );
      return data.data;
    },
    enabled: Boolean(selectedId),
  });

  const updateMutation = useMutation<
    Complaint,
    unknown,
    { id: string; status: ComplaintStatus; resolutionNotes?: string }
  >({
    mutationFn: async ({ id, status, resolutionNotes: notes }) => {
      const { data } = await apiClient.patch<ComplaintResponse>(
        `/complaints/${encodeURIComponent(id)}/status`,
        {
          status,
          ...(notes === undefined ? {} : { resolutionNotes: notes }),
        },
      );
      return data.data;
    },
    onSuccess: async (updated) => {
      setSuccessMessage('Complaint updated successfully.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['complaints', 'management'] }),
        queryClient.invalidateQueries({
          queryKey: ['complaints', 'management', updated.id],
        }),
      ]);
    },
  });

  const detail = detailQuery.data;
  useEffect(() => {
    if (detail) {
      setStatusDraft(detail.status);
      setResolutionNotes(detail.resolution_notes ?? '');
    }
  }, [detail]);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredComplaints = (complaintsQuery.data ?? []).filter((complaint) => (
    (!statusFilter || complaint.status === statusFilter) &&
    (!priorityFilter || complaint.priority === priorityFilter) &&
    (!normalizedSearch ||
      complaint.display_id.toLowerCase().includes(normalizedSearch) ||
      complaint.title.toLowerCase().includes(normalizedSearch))
  ));

  function handleUpdate() {
    if (!detail || submittingRef.current) return;
    const trimmedNotes = resolutionNotes.trim();
    if (resolutionNotes.length > 0 && !trimmedNotes) return;
    const shouldUpdateNotes =
      Boolean(trimmedNotes) || Boolean(detail.resolution_notes && !resolutionNotes);

    submittingRef.current = true;
    setSuccessMessage('');
    updateMutation.mutate(
      {
        id: detail.id,
        status: statusDraft,
        ...(shouldUpdateNotes ? { resolutionNotes: trimmedNotes } : {}),
      },
      {
        onSettled: () => {
          submittingRef.current = false;
        },
      },
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Citizen transparency"
        title="Complaint Management"
        description="Review citizen complaints and update their status and resolution notes."
      />

      {complaintsQuery.isLoading ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-slate-600">
            Loading complaints...
          </CardContent>
        </Card>
      ) : complaintsQuery.isError ? (
        <Card>
          <CardContent className="space-y-4 py-8 text-center">
            <p role="alert" className="text-sm text-red-700">
              {getErrorMessage(complaintsQuery.error, 'list')}
            </p>
            <Button
              variant="outline"
              onClick={() => void complaintsQuery.refetch()}
              disabled={complaintsQuery.isFetching}
            >
              {complaintsQuery.isFetching ? 'Retrying...' : 'Retry'}
            </Button>
          </CardContent>
        </Card>
      ) : (complaintsQuery.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <h2 className="font-semibold text-slate-900">
              No complaints have been submitted yet.
            </h2>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Complaints</CardTitle>
              <CardDescription>
                Select a complaint to review its details and update its status.
              </CardDescription>
              <div className="grid gap-3 pt-3 md:grid-cols-3">
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  Search
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search complaint ID or title"
                  />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  Status
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as ComplaintStatus | '')}
                    className="flex h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">All statuses</option>
                    {statuses.map((status) => (
                      <option key={status} value={status}>{statusLabel(status)}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  Priority
                  <select
                    value={priorityFilter}
                    onChange={(event) => setPriorityFilter(event.target.value as ComplaintPriority | '')}
                    className="flex h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">All priorities</option>
                    {priorities.map((priority) => (
                      <option key={priority} value={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
              </div>
            </CardHeader>
            <CardContent>
              {filteredComplaints.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Complaint ID</TableHead>
                      <TableHead>Project ID</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Filed By</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredComplaints.map((complaint) => (
                      <TableRow key={complaint.id}>
                        <TableCell className="max-w-36 break-all font-medium">
                          {complaint.display_id}
                        </TableCell>
                        <TableCell className="max-w-36 break-all">
                          {complaint.project_code ?? 'Not linked'}
                        </TableCell>
                        <TableCell className="min-w-48">{complaint.title}</TableCell>
                        <TableCell>
                          <Badge variant={priorityVariant(complaint.priority)}>
                            {complaint.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(complaint.status)}>
                            {statusLabel(complaint.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-36 break-all">
                          {complaint.filed_by ?? 'Unknown'}
                        </TableCell>
                        <TableCell className="max-w-36 break-all">
                          {complaint.assigned_to ?? 'Not assigned'}
                        </TableCell>
                        <TableCell className="min-w-40">
                          {formatDate(complaint.created_at)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant={selectedId === complaint.id ? 'secondary' : 'outline'}
                            size="sm"
                            disabled={updateMutation.isPending}
                            onClick={() => {
                              setSelectedId(complaint.id);
                              setSuccessMessage('');
                              updateMutation.reset();
                            }}
                          >
                            {selectedId === complaint.id ? 'Selected' : 'Review'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
                  No complaints match the selected filters.
                </p>
              )}
            </CardContent>
          </Card>

          {selectedId && (
            <Card>
              <CardHeader>
                <CardTitle>Complaint Details</CardTitle>
                <CardDescription>
                  Review complaint information and record a status update.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {detailQuery.isLoading ? (
                  <p className="py-4 text-sm text-slate-600">
                    Loading complaint details...
                  </p>
                ) : detailQuery.isError ? (
                  <div className="space-y-4">
                    <p role="alert" className="text-sm text-red-700">
                      {getErrorMessage(detailQuery.error, 'detail')}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => void detailQuery.refetch()}
                      disabled={detailQuery.isFetching}
                    >
                      {detailQuery.isFetching ? 'Retrying...' : 'Retry'}
                    </Button>
                  </div>
                ) : detail ? (
                  <div className="space-y-6">
                    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                      <DetailField label="Complaint ID" value={detail.display_id} />
                      <DetailField label="Project" value={detail.project_code ?? 'Not linked'} />
                      <DetailField label="Filed By" value={detail.filed_by ?? 'Unknown'} />
                      <DetailField label="Title" value={detail.title} />
                      <DetailField label="Priority" value={detail.priority} />
                      <DetailField
                        label="Current Status"
                        value={statusLabel(detail.status)}
                      />
                      <DetailField
                        label="Assigned To"
                        value={detail.assigned_to ?? 'Not assigned'}
                      />
                      <DetailField label="Created Date" value={formatDate(detail.created_at)} />
                      <DetailField label="Updated Date" value={formatDate(detail.updated_at)} />
                      <DetailField
                        label="Resolved Date"
                        value={formatDate(detail.resolved_at)}
                      />
                      <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Description
                        </dt>
                        <dd className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
                          {detail.description}
                        </dd>
                      </div>
                      <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Existing Resolution Notes
                        </dt>
                        <dd className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
                          {detail.resolution_notes || 'No resolution notes'}
                        </dd>
                      </div>
                    </dl>

                    <div className="border-t border-slate-200 pt-5">
                      <h3 className="mb-4 font-semibold text-slate-900">
                        Update Complaint
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="space-y-2 text-sm font-semibold text-slate-800">
                          Status
                          <select
                            value={statusDraft}
                            onChange={(event) => {
                              const selected = statuses.find(
                                (status) => status === event.target.value,
                              );
                              if (selected) setStatusDraft(selected);
                            }}
                            disabled={updateMutation.isPending}
                            className="flex h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-normal text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {statuses.map((status) => (
                              <option key={status} value={status}>
                                {statusLabel(status)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-2 text-sm font-semibold text-slate-800 sm:col-span-2">
                          Resolution Notes
                          <textarea
                            value={resolutionNotes}
                            onChange={(event) => setResolutionNotes(event.target.value)}
                            disabled={updateMutation.isPending}
                            rows={4}
                            placeholder="Add notes about the complaint resolution or investigation."
                            className="flex w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-normal text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </label>
                      </div>

                      {resolutionNotes.length > 0 && !resolutionNotes.trim() && (
                        <p role="alert" className="mt-3 text-sm text-red-700">
                          Resolution notes cannot contain only whitespace.
                        </p>
                      )}
                      {updateMutation.isError && (
                        <p role="alert" className="mt-3 text-sm text-red-700">
                          {getErrorMessage(updateMutation.error, 'update')}
                        </p>
                      )}
                      {successMessage && (
                        <p role="status" className="mt-3 text-sm text-green-700">
                          {successMessage}
                        </p>
                      )}
                      <Button
                        className="mt-4"
                        onClick={handleUpdate}
                        disabled={
                          updateMutation.isPending ||
                          (resolutionNotes.length > 0 && !resolutionNotes.trim())
                        }
                      >
                        {updateMutation.isPending ? 'Updating...' : 'Update Complaint'}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="break-words text-sm text-slate-800">{value}</dd>
    </div>
  );
}
