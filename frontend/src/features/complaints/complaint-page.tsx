import { useEffect, useRef, useState, type FormEvent } from 'react';
import axios from 'axios';
import { ArrowUpTrayIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
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
import { apiClient, fetcher } from '@/lib/api-client';
import type { LedgerProject } from '@/types/ledger';

const priorities = ['Low', 'Medium', 'High', 'Critical'] as const;
type ComplaintPriority = (typeof priorities)[number];
type ComplaintProject = Pick<LedgerProject, 'name' | 'code' | 'district' | 'state'> & {
  databaseId: string;
};

type Complaint = {
  id: string;
  display_id: string;
  project_id: string | null;
  project_code: string | null;
  title: string;
  description: string;
  priority: ComplaintPriority;
  status: 'Open' | 'UnderInvestigation' | 'Resolved' | 'Closed' | 'Rejected';
  created_at: string;
};

type CreateComplaintResponse = {
  success: boolean;
  data: Complaint;
};

function getProjectLoadError(error: unknown): string {
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    return 'Your session has expired. Please sign in again.';
  }
  return 'Unable to load projects. Please refresh the page and try again.';
}

function getSubmissionError(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return 'Unable to submit the complaint. Please try again.';
  }

  const status = error.response?.status;
  const message = error.response?.data?.message;
  if (status === 400) {
    return typeof message === 'string'
      ? message
      : 'Check the complaint details and selected project, then try again.';
  }
  if (status === 401) {
    return 'Your session has expired. Please sign in again.';
  }
  if (status === 403) {
    return 'You are not authorized to submit a complaint.';
  }
  if (status === 404) {
    return 'The selected project could not be found. Please select another project.';
  }
  if (status && status >= 500) {
    return 'The service is temporarily unavailable. Please try again later.';
  }
  if (!error.response) {
    return 'Could not connect to GramTrust. Check your connection and try again.';
  }
  return 'Unable to submit the complaint. Please try again.';
}

export function ComplaintSubmissionPage() {
  const [projects, setProjects] = useState<ComplaintProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState('');
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<ComplaintPriority>('Medium');
  const [formError, setFormError] = useState('');
  const [submissionError, setSubmissionError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdComplaint, setCreatedComplaint] = useState<Complaint | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    let active = true;

    fetcher<ComplaintProject[]>('/projects')
      .then((records) => {
        if (!active) return;
        if (
          records.some(
            (project) =>
              typeof project.databaseId !== 'string' ||
              project.databaseId.trim().length === 0,
          )
        ) {
          setProjectsError('Project identifiers are unavailable. Please try again later.');
          return;
        }
        setProjects(records);
      })
      .catch((error: unknown) => {
        if (active) setProjectsError(getProjectLoadError(error));
      })
      .finally(() => {
        if (active) setProjectsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    setFormError('');
    setSubmissionError('');
    if (!projectId) {
      setFormError('Select a project before submitting your complaint.');
      return;
    }
    if (!title.trim()) {
      setFormError('Enter a complaint title.');
      return;
    }
    if (title.trim().length > 200) {
      setFormError('The complaint title must be 200 characters or fewer.');
      return;
    }
    if (!description.trim()) {
      setFormError('Enter a description of the issue.');
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const { data } = await apiClient.post<CreateComplaintResponse>(
        '/complaints',
        {
          projectId,
          title: title.trim(),
          description: description.trim(),
          priority,
        },
      );
      setCreatedComplaint(data.data);
      setProjectId('');
      setTitle('');
      setDescription('');
      setPriority('Medium');
    } catch (error) {
      setSubmissionError(getSubmissionError(error));
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Citizen transparency"
        title="Submit a complaint"
        description="Tell us about an issue with a GramTrust project. Your complaint will be linked to the selected project."
      />

      {createdComplaint && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <CheckCircleIcon className="mt-0.5 h-6 w-6 flex-shrink-0 text-green-600" />
              <div className="space-y-2">
                <h2 className="font-semibold text-green-900">
                  Complaint submitted successfully.
                </h2>
                <p className="text-sm text-slate-700">
                  Complaint ID: <span className="font-medium">{createdComplaint.display_id}</span>
                </p>
                <p className="text-sm text-slate-700">
                  Status: <Badge variant="warning">{createdComplaint.status}</Badge>
                </p>
                <p className="text-sm text-slate-700">
                  {createdComplaint.title} · {createdComplaint.priority}
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => setCreatedComplaint(null)}>
              Submit Another Complaint
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Complaint details</CardTitle>
          <CardDescription>
            Select the project and provide enough detail to help review your concern.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label
                htmlFor="complaintProjectId"
                className="text-sm font-semibold text-slate-800"
              >
                Project
              </label>
              <select
                id="complaintProjectId"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                disabled={projectsLoading || Boolean(projectsError) || projects.length === 0}
                required
                className="flex h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">
                  {projectsLoading ? 'Loading projects...' : 'Choose a project'}
                </option>
                {projects.map((project) => (
                  <option key={project.databaseId} value={project.databaseId}>
                    {project.name} · {project.code ?? 'Project'} · {project.district},{' '}
                    {project.state}
                  </option>
                ))}
              </select>
              {projectsLoading && (
                <p className="text-sm text-slate-500">Loading projects...</p>
              )}
              {projectsError && (
                <p role="alert" className="text-sm text-red-700">{projectsError}</p>
              )}
              {!projectsLoading && !projectsError && projects.length === 0 && (
                <p className="text-sm text-slate-500">
                  No projects are currently available.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label
                htmlFor="complaintTitle"
                className="text-sm font-semibold text-slate-800"
              >
                Complaint Title
              </label>
              <Input
                id="complaintTitle"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Enter a short title for your complaint"
                maxLength={200}
                required
              />
              <p className="text-xs text-slate-500">Maximum 200 characters.</p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="complaintDescription"
                className="text-sm font-semibold text-slate-800"
              >
                Description
              </label>
              <textarea
                id="complaintDescription"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe the issue in detail..."
                required
                rows={5}
                className="flex w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="complaintPriority"
                className="text-sm font-semibold text-slate-800"
              >
                Priority
              </label>
              <select
                id="complaintPriority"
                value={priority}
                onChange={(event) => {
                  const selected = priorities.find(
                    (value) => value === event.target.value,
                  );
                  if (selected) setPriority(selected);
                }}
                className="flex h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {priorities.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>

            {formError && (
              <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {formError}
              </div>
            )}
            {submissionError && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {submissionError}
              </div>
            )}

            <Button
              type="submit"
              disabled={
                isSubmitting ||
                projectsLoading ||
                Boolean(projectsError) ||
                projects.length === 0
              }
            >
              <ArrowUpTrayIcon className="h-4 w-4" />
              {isSubmitting ? 'Submitting...' : 'Submit Complaint'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
