import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Link } from 'react-router-dom';
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
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';

const submitComplaintLinkClass =
  'inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

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
  title: string;
  description: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

type ComplaintsResponse = {
  success: boolean;
  data: Complaint[];
};

function getComplaintsErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) {
      return 'Your session has expired. Please sign in again.';
    }
    if (error.response?.status === 403) {
      return 'You are not authorized to view these complaints.';
    }
  }
  return 'Unable to load your complaints. Please try again.';
}

function formatComplaintDate(value: string | null): string {
  if (!value) return 'Not resolved';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return formatDateTime(date.toISOString());
}

function getStatusLabel(status: ComplaintStatus): string {
  return status === 'UnderInvestigation'
    ? 'Under Investigation'
    : status;
}

function getStatusVariant(status: ComplaintStatus) {
  if (status === 'Resolved' || status === 'Closed') return 'success';
  if (status === 'Rejected') return 'danger';
  if (status === 'UnderInvestigation') return 'warning';
  return 'secondary';
}

function getPriorityVariant(priority: ComplaintPriority) {
  if (priority === 'Critical' || priority === 'High') return 'danger';
  if (priority === 'Medium') return 'warning';
  return 'secondary';
}

interface MyComplaintsPageProps {
  embedded?: boolean;
}

export function MyComplaintsPage({ embedded = false }: MyComplaintsPageProps) {
  const {
    data: complaints = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<Complaint[], unknown>({
    queryKey: ['complaints', 'mine'],
    queryFn: async () => {
      const { data } = await apiClient.get<ComplaintsResponse>('/complaints');
      return data.data;
    },
  });

  return (
    <div className="space-y-8">
      {!embedded && (
        <PageHeader
          eyebrow="Citizen transparency"
          title="My Complaints"
          description="View the complaints you have submitted and their current status."
          actions={
            <Link to="/complaints/new" className={submitComplaintLinkClass}>
              Submit a Complaint
            </Link>
          }
        />
      )}

      {isLoading ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-slate-600">
            Loading complaints...
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="space-y-4 py-8 text-center">
            <p role="alert" className="text-sm text-red-700">
              {getComplaintsErrorMessage(error)}
            </p>
            <Button
              variant="outline"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching ? 'Retrying...' : 'Retry'}
            </Button>
          </CardContent>
        </Card>
      ) : complaints.length === 0 ? (
        <Card>
          <CardContent className="space-y-4 py-10 text-center">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-slate-900">
                No complaints submitted yet.
              </h2>
              <p className="text-sm text-slate-600">
                Your submitted complaints will appear here.
              </p>
            </div>
            <Link to="/complaints/new" className={submitComplaintLinkClass}>
              Submit a Complaint
            </Link>
          </CardContent>
        </Card>
      ) : (
        <section aria-label="Submitted complaints" className="space-y-4">
          {complaints.map((complaint) => (
            <Card key={complaint.id}>
              <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <CardTitle>{complaint.title}</CardTitle>
                  <CardDescription className="break-all">
                    Complaint ID: {complaint.display_id}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={getStatusVariant(complaint.status)}>
                    {getStatusLabel(complaint.status)}
                  </Badge>
                  <Badge variant={getPriorityVariant(complaint.priority)}>
                    {complaint.priority} priority
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                  {complaint.description}
                </p>

                <dl className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Project
                    </dt>
                    <dd className="break-all text-sm text-slate-800">
                      {complaint.project_code ?? 'Project no longer available'}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Submitted
                    </dt>
                    <dd className="text-sm text-slate-800">
                      {formatComplaintDate(complaint.created_at)}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Resolution
                    </dt>
                    <dd className="whitespace-pre-wrap break-words text-sm text-slate-800">
                      {complaint.resolution_notes || 'No resolution notes yet.'}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Resolved date
                    </dt>
                    <dd className="text-sm text-slate-800">
                      {formatComplaintDate(complaint.resolved_at)}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
