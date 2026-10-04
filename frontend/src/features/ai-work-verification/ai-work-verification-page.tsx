import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import axios from 'axios';
import { ArrowUpTrayIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
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
import { apiClient, fetcher } from '@/lib/api-client';
import type { LedgerProject } from '@/types/ledger';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
]);

type VerificationResult = {
  id: string;
  project_id: string;
  image_path: string;
  model_name: string;
  predicted_stage: string | null;
  similarity_score: number | null;
  result: 'VERIFIED' | 'REVIEW_REQUIRED' | 'INSUFFICIENT_EVIDENCE';
  reason: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

type AnalyzeResponse = {
  message: string;
  data: VerificationResult;
};

type StageSimilarity = {
  stage: string;
  description: string;
  similarity_score: number;
};

function getApiErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return 'Unable to complete AI-assisted visual assessment. Please try again.';
  }

  const status = error.response?.status;
  const responseMessage = error.response?.data?.message;

  if (status === 400) {
    return typeof responseMessage === 'string'
      ? responseMessage
      : 'Check the project, description, and image, then try again.';
  }
  if (status === 401) {
    return 'Your session has expired. Please sign in again.';
  }
  if (status === 403) {
    return 'Your account is not authorized to run AI Work Verification.';
  }
  if (status === 413) {
    return 'The selected image is larger than the 10 MB upload limit.';
  }
  if (status === 502 || status === 503) {
    return 'The AI service is temporarily unavailable. Please try again later.';
  }
  if (status === 504) {
    return 'The AI analysis timed out. Please try again.';
  }
  if (!error.response) {
    return 'Could not connect to GramTrust. Check your connection and try again.';
  }

  return 'The analysis could not be completed. Please try again.';
}

function getResultGuidance(result: VerificationResult['result']): string {
  if (result === 'INSUFFICIENT_EVIDENCE') {
    return 'Insufficient visual evidence was available for a reliable assessment.';
  }
  if (result === 'VERIFIED') {
    return 'AI-assisted visual evidence is consistent with the submitted project description. Human verification should still be considered.';
  }
  return 'The AI result requires human review before drawing conclusions.';
}

function getBadgeVariant(result: VerificationResult['result']) {
  if (result === 'VERIFIED') return 'success';
  if (result === 'INSUFFICIENT_EVIDENCE') return 'secondary';
  return 'warning';
}

function getStageSimilarities(details: VerificationResult['details']): StageSimilarity[] {
  const values = details?.['construction_stage_similarities'];
  if (!Array.isArray(values)) return [];

  return values.filter(
    (item): item is StageSimilarity =>
      typeof item === 'object' &&
      item !== null &&
      typeof item.stage === 'string' &&
      typeof item.description === 'string' &&
      typeof item.similarity_score === 'number' &&
      Number.isFinite(item.similarity_score),
  );
}

export function AIWorkVerificationPage() {
  const [projects, setProjects] = useState<LedgerProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState('');
  const [projectId, setProjectId] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);

  useEffect(() => {
    let active = true;

    fetcher<LedgerProject[]>('/projects')
      .then((records) => {
        if (active) setProjects(records);
      })
      .catch(() => {
        if (active) {
          setProjectsError('Unable to load projects. Please refresh and try again.');
        }
      })
      .finally(() => {
        if (active) setProjectsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!image) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(image);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [image]);

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFieldError('');
    setAnalysisError('');
    setResult(null);

    if (!selected) {
      setImage(null);
      return;
    }
    if (!ACCEPTED_IMAGE_TYPES.has(selected.type)) {
      setImage(null);
      event.target.value = '';
      setFieldError('Choose a JPEG, PNG, WebP, GIF, or BMP image.');
      return;
    }
    if (selected.size > MAX_IMAGE_SIZE) {
      setImage(null);
      event.target.value = '';
      setFieldError('The image must be 10 MB or smaller.');
      return;
    }

    setImage(selected);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError('');
    setAnalysisError('');
    setResult(null);

    if (!projectId) {
      setFieldError('Select a project before analyzing.');
      return;
    }
    if (!projectDescription.trim()) {
      setFieldError('Enter a project description before analyzing.');
      return;
    }
    if (!image) {
      setFieldError('Select a work-site image before analyzing.');
      return;
    }

    const formData = new FormData();
    formData.append('projectId', projectId);
    formData.append('projectDescription', projectDescription.trim());
    formData.append('image', image);

    setAnalysisLoading(true);
    try {
      const { data } = await apiClient.post<AnalyzeResponse>(
        '/ai-work-verification/analyze',
        formData,
        { timeout: 150_000 },
      );
      setResult(data.data);
    } catch (error) {
      setAnalysisError(getApiErrorMessage(error));
    } finally {
      setAnalysisLoading(false);
    }
  }

  const stageSimilarities = result ? getStageSimilarities(result.details) : [];

  return (
    <div className="space-y-8">
      <PageHeader

        title="AI Work Verification"
        description="Upload a work-site image to perform AI-assisted visual verification of a GramTrust project."
      />

      <Card>
        <CardHeader>
          <CardTitle>Submit project evidence</CardTitle>
          <CardDescription>
            Compare one work-site image with the selected project description.
            AI similarity is experimental and requires human review.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="projectId" className="text-sm font-semibold text-slate-800">
                Project
              </label>
              <select
                id="projectId"
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  setFieldError('');
                  setAnalysisError('');
                  setResult(null);
                }}
                disabled={projectsLoading || projects.length === 0}
                className="flex h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">
                  {projectsLoading ? 'Loading projects...' : 'Select a project'}
                </option>
                {projects.map((project) => {
                  const id = project.code || project.id;
                  return (
                    <option key={id} value={id}>
                      {project.name} · {id}
                      {project.status ? ` · ${project.status}` : ''}
                    </option>
                  );
                })}
              </select>
              {projectsLoading && (
                <p className="text-sm text-slate-500">Loading projects...</p>
              )}
              {projectsError && (
                <p role="alert" className="text-sm text-red-700">{projectsError}</p>
              )}
              {!projectsLoading && !projectsError && projects.length === 0 && (
                <p className="text-sm text-slate-500">No projects are currently available.</p>
              )}
            </div>

            <div className="space-y-2">
              <label
                htmlFor="projectDescription"
                className="text-sm font-semibold text-slate-800"
              >
                Project description
              </label>
              <textarea
                id="projectDescription"
                value={projectDescription}
                onChange={(event) => {
                  setProjectDescription(event.target.value);
                  setFieldError('');
                  setAnalysisError('');
                  setResult(null);
                }}
                placeholder="Example: Construction of a rural road"
                rows={4}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="space-y-3">
              <label htmlFor="workImage" className="text-sm font-semibold text-slate-800">
                Work-site image
              </label>
              <Input
                id="workImage"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
                onChange={handleImageChange}
                className="h-auto py-3 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue-700"
              />
              <p className="text-xs text-slate-500">
                JPEG, PNG, WebP, GIF, or BMP · Maximum 10 MB
              </p>
              {previewUrl && image && (
                <div className="max-w-lg space-y-2">
                  <img
                    src={previewUrl}
                    alt={`Selected work-site evidence: ${image.name}`}
                    className="max-h-80 w-full rounded-xl border border-slate-200 object-contain bg-slate-50"
                  />
                  <p className="break-all text-xs text-slate-500">{image.name}</p>
                </div>
              )}
            </div>

            {fieldError && (
              <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {fieldError}
              </div>
            )}
            {analysisError && (
              <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <p>{analysisError}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={analysisLoading || projectsLoading || Boolean(projectsError)}
            >
              <ArrowUpTrayIcon className="h-4 w-4" />
              {analysisLoading ? 'Analyzing...' : 'Analyze Work'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>AI Analysis Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Predicted stage
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {result.predicted_stage ?? 'Not available'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Similarity score
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {typeof result.similarity_score === 'number'
                    ? result.similarity_score.toFixed(4)
                    : 'Not available'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </p>
                <div className="mt-2">
                  <Badge variant={getBadgeVariant(result.result)}>{result.result}</Badge>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Model
                </p>
                <p className="mt-1 text-sm font-medium text-slate-800">{result.model_name}</p>
              </div>
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
              <p className="text-sm leading-6 text-slate-700">
                {getResultGuidance(result.result)}
              </p>
              {result.reason && (
                <p className="mt-2 text-sm leading-6 text-slate-600">{result.reason}</p>
              )}
            </div>

            {stageSimilarities.length > 0 && (
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Construction Stage Similarities
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Similarity scores are image-text alignment values, not completion percentages.
                  </p>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Stage</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Similarity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stageSimilarities.map((stage) => (
                        <TableRow key={stage.stage}>
                          <TableCell className="font-medium">{stage.stage}</TableCell>
                          <TableCell>{stage.description}</TableCell>
                          <TableCell>{stage.similarity_score.toFixed(4)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type CitizenPhotoMetadata = {
  latitude: number | null;
  longitude: number | null;
  capture_timestamp: string | null;
};

type CitizenPhotoResult =
  | {
      result: 'NO_REFERENCE_PHOTO';
      message: string;
    }
  | {
      result: 'VERIFIED' | 'REVIEW_REQUIRED' | 'INSUFFICIENT_EVIDENCE';
      similarity_score: number;
      model_name: string;
      reason: string;
      metadata?: CitizenPhotoMetadata | null;
    };

type CitizenPhotoResponse = {
  message: string;
  data: CitizenPhotoResult;
};

function getCitizenPhotoErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return 'Photo verification failed. Please try again.';
  }

  const status = error.response?.status;
  const responseMessage = error.response?.data?.message;

  if (status === 400) {
    return typeof responseMessage === 'string'
      ? responseMessage
      : 'Check the selected project and image, then try again.';
  }
  if (status === 401) {
    return 'Your session has expired. Please sign in again.';
  }
  if (status === 403) {
    return 'Your account is not authorized to submit a citizen photo.';
  }
  if (status === 413) {
    return 'The selected image is larger than the 10 MB upload limit.';
  }
  if (status === 503 || status === 504) {
    return 'The AI service is temporarily unavailable. Please try again later.';
  }
  if (!error.response) {
    return 'Could not connect to GramTrust. Check your connection and try again.';
  }

  return 'Photo verification failed. Please try again.';
}

export function CitizenPhotoVerificationPage() {
  const [projects, setProjects] = useState<LedgerProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState('');
  const [projectId, setProjectId] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<CitizenPhotoResult | null>(null);

  useEffect(() => {
    let active = true;

    fetcher<LedgerProject[]>('/projects')
      .then((records) => {
        if (active) setProjects(records);
      })
      .catch(() => {
        if (active) {
          setProjectsError('Unable to load projects. Please refresh and try again.');
        }
      })
      .finally(() => {
        if (active) setProjectsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!image) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(image);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [image]);

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFormError('');
    setVerificationError('');
    setResult(null);

    if (!selected) {
      setImage(null);
      return;
    }
    if (!ACCEPTED_IMAGE_TYPES.has(selected.type)) {
      setImage(null);
      event.target.value = '';
      setFormError('Choose a JPEG, PNG, WebP, GIF, or BMP image.');
      return;
    }
    if (selected.size > MAX_IMAGE_SIZE) {
      setImage(null);
      event.target.value = '';
      setFormError('The image must be 10 MB or smaller.');
      return;
    }

    setImage(selected);
  }

  async function handleCitizenPhotoSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    setVerificationError('');
    setResult(null);

    if (!projectId) {
      setFormError('Select a project before verifying the photo.');
      return;
    }
    if (!image) {
      setFormError('Select a project photo to submit for verification.');
      return;
    }

    const formData = new FormData();
    formData.append('projectId', projectId);
    formData.append('image', image);

    setIsSubmitting(true);
    try {
      const { data } = await apiClient.post<CitizenPhotoResponse>(
        '/ai-work-verification/citizen-photo-verification',
        formData,
        { timeout: 150_000 },
      );
      setResult(data.data);
    } catch (error) {
      setVerificationError(getCitizenPhotoErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader 
        title="Citizen Photo Verification"
        description="Submit a project photo for AI-assisted visual similarity verification against an available official reference image."
      />

      <Card>
        <CardHeader>
          <CardTitle>Submit a project photo</CardTitle>
          <CardDescription>
            Select an existing GramTrust project and upload a photo for comparison.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCitizenPhotoSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="citizenProjectId" className="text-sm font-semibold text-slate-800">
                Project
              </label>
              <select
                id="citizenProjectId"
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  setFormError('');
                  setVerificationError('');
                  setResult(null);
                }}
                disabled={projectsLoading || projects.length === 0}
                className="flex h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">
                  {projectsLoading ? 'Loading projects...' : 'Select a project'}
                </option>
                {projects.map((project) => {
                  const id = project.code || project.id;
                  return (
                    <option key={id} value={id}>
                      {project.name} · {id}
                      {project.status ? ` · ${project.status}` : ''}
                    </option>
                  );
                })}
              </select>
              {projectsLoading && (
                <p className="text-sm text-slate-500">Loading projects...</p>
              )}
              {projectsError && (
                <p role="alert" className="text-sm text-red-700">{projectsError}</p>
              )}
              {!projectsLoading && !projectsError && projects.length === 0 && (
                <p className="text-sm text-slate-500">No projects are currently available.</p>
              )}
            </div>

            <div className="space-y-3">
              <label htmlFor="citizenProjectImage" className="text-sm font-semibold text-slate-800">
                Project photo
              </label>
              <Input
                id="citizenProjectImage"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
                onChange={handleImageChange}
                className="h-auto py-3 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue-700"
              />
              <p className="text-xs text-slate-500">
                JPEG, PNG, WebP, GIF, or BMP · Maximum 10 MB
              </p>
              {previewUrl && image && (
                <div className="max-w-lg space-y-2">
                  <img
                    src={previewUrl}
                    alt={`Selected project photo: ${image.name}`}
                    className="max-h-80 w-full rounded-xl border border-slate-200 bg-slate-50 object-contain"
                  />
                  <p className="break-all text-xs text-slate-500">{image.name}</p>
                </div>
              )}
            </div>

            {formError && (
              <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {formError}
              </div>
            )}
            {verificationError && (
              <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <p>{verificationError}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={
                isSubmitting ||
                projectsLoading ||
                Boolean(projectsError) ||
                !projectId ||
                !image
              }
            >
              <ArrowUpTrayIcon className="h-4 w-4" />
              {isSubmitting ? 'Verifying...' : 'Verify Photo'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Citizen Photo Verification Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {result.result === 'NO_REFERENCE_PHOTO' ? (
              <div
                role="status"
                className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                <p className="font-semibold">{result.message}</p>
                <p>
                  An official reference photo must be uploaded before citizen photo
                  verification can be performed.
                </p>
              </div>
            ) : (
              <>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Result
                    </p>
                    <div className="mt-2">
                      <Badge variant={getBadgeVariant(result.result)}>{result.result}</Badge>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Similarity score
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {result.similarity_score.toFixed(4)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Model
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-800">{result.model_name}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Reason
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-700">{result.reason}</p>
                  </div>
                </div>

                {result.metadata && (
                  <div className="space-y-3 border-t border-slate-200 pt-5">
                    <h3 className="font-semibold text-slate-900">Photo metadata</h3>
                    <dl className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Capture timestamp
                        </dt>
                        <dd className="mt-1 text-sm text-slate-800">
                          {result.metadata.capture_timestamp ?? 'Unavailable in image metadata'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Latitude
                        </dt>
                        <dd className="mt-1 text-sm text-slate-800">
                          {result.metadata.latitude ?? 'Unavailable in image metadata'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Longitude
                        </dt>
                        <dd className="mt-1 text-sm text-slate-800">
                          {result.metadata.longitude ?? 'Unavailable in image metadata'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                )}

                <p className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm leading-6 text-slate-700">
                  The AI result is not proof that two photos were taken at the same physical location.
                  Results should be reviewed when required.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
