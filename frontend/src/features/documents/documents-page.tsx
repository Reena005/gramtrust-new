import { useEffect, useMemo, useState } from 'react';

import {
  DocumentTextIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowTopRightOnSquareIcon,
  ShieldCheckIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';

import { useAuth } from '@/features/auth/auth-context';

interface DocumentRecord {
  id: string | number;
  document_name: string;
  document_type: string;
  file_path?: string;
  sha256_hash?: string;
  source_dataset?: string;
  verification_status?: string;
  is_tampered?: boolean;
  uploaded_by?: string;
  created_at?: string;
  verified_at?: string;
  blockchain_hash?: string | null;
  blockchain_tx_id?: string | null;
  blockchain_status?: string | null;
}

type FilterType =
  | 'All'
  | 'Verified'
  | 'Recorded'
  | 'Pending'
  | 'Tampered';

export function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] =
    useState<FilterType>('All');

  const [actionState, setActionState] = useState<
    Record<string, string>
  >({});

  const { user } = useAuth();

  const canAnchor =
    user?.role === 'ADMIN' || user?.role === 'OFFICIAL';

  const API_SERVER = (
    import.meta.env.VITE_API_BASE_URL ??
    'http://localhost:4000'
  ).replace(/\/api\/?$/, '');

  const API_URL = `${API_SERVER}/api`;

  // ==========================================================
  // LOAD DOCUMENTS
  // ==========================================================

  async function loadDocuments() {
    try {
      setLoading(true);
      setError('');

      const token = localStorage.getItem('gramtrust_token');

      const response = await fetch(`${API_URL}/documents`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',

          ...(token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {}),
        },
      });

      if (!response.ok) {
        const text = await response.text();

        throw new Error(
          `Failed to load documents (${response.status}) ${
            text || response.statusText
          }`,
        );
      }

      const result = await response.json();

      console.log('Documents API response:', result);

      const records = Array.isArray(result)
        ? result
        : Array.isArray(result.data)
          ? result.data
          : Array.isArray(result.documents)
            ? result.documents
            : [];

      setDocuments(records);
    } catch (err) {
      console.error('Documents loading error:', err);

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load documents',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, []);

  // ==========================================================
  // PDF URL
  // ==========================================================

  function getFileUrl(document: DocumentRecord) {
    if (!document.file_path) {
      return '';
    }

    // If backend already returns a complete URL
    if (
      document.file_path.startsWith('http://') ||
      document.file_path.startsWith('https://')
    ) {
      return document.file_path;
    }

    // Normalize Windows paths
    const normalizedPath = document.file_path.replace(/\\/g, '/');

    const fileName = normalizedPath.split('/').pop();

    if (!fileName) {
      return '';
    }

    return `${API_SERVER}/documents/files/${encodeURIComponent(
      fileName,
    )}`;
  }

  // ==========================================================
  // OPEN PDF
  // ==========================================================

  function openDocument(document: DocumentRecord) {
    const fileUrl = getFileUrl(document);

    if (!fileUrl) {
      setError('PDF file is not available for this document.');
      return;
    }

    window.open(fileUrl, '_blank', 'noopener,noreferrer');
  }

  // ==========================================================
  // DOCUMENT STATUS
  // ==========================================================

  function getStatus(document: DocumentRecord) {
    if (document.is_tampered) {
      return {
        label: 'Tampered',
        className:
          'bg-red-50 text-red-700 border-red-200',
        icon: ExclamationTriangleIcon,
      };
    }

    if (
      document.verification_status === 'VERIFIED' ||
      document.verification_status === 'Verified'
    ) {
      return {
        label: 'Verified',
        className:
          'bg-green-50 text-green-700 border-green-200',
        icon: CheckCircleIcon,
      };
    }

    if (
      document.verification_status === 'RECORDED' ||
      document.verification_status === 'Recorded'
    ) {
      return {
        label: 'Recorded',
        className:
          'bg-blue-50 text-blue-700 border-blue-200',
        icon: ShieldCheckIcon,
      };
    }

    return {
      label: document.verification_status || 'Pending',
      className:
        'bg-amber-50 text-amber-700 border-amber-200',
      icon: ShieldCheckIcon,
    };
  }

  // ==========================================================
  // BLOCKCHAIN ACTION
  // ==========================================================

  async function runDocumentAction(
    id: string,
    action: 'anchor' | 'verify',
  ) {
    try {
      setActionState((current) => ({
        ...current,
        [id]: action,
      }));

      const token = localStorage.getItem('gramtrust_token');

      const response = await fetch(
        `${API_URL}/documents/${encodeURIComponent(id)}/${action}`,
        {
          method: 'POST',
          headers: token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {},
        },
      );

      if (!response.ok) {
        throw new Error(
          `Document ${action} failed (${response.status})`,
        );
      }

      await loadDocuments();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Document ${action} failed`,
      );
    } finally {
      setActionState((current) => {
        const next = { ...current };

        delete next[id];

        return next;
      });
    }
  }

  // ==========================================================
  // SUMMARY COUNTS
  // ==========================================================

  const totalDocuments = documents.length;

  const verifiedDocuments = documents.filter(
    (document) =>
      !document.is_tampered &&
      (document.verification_status === 'VERIFIED' ||
        document.verification_status === 'Verified'),
  ).length;

  const reviewRequired = documents.filter(
    (document) =>
      document.is_tampered ||
      !(
        document.verification_status === 'VERIFIED' ||
        document.verification_status === 'Verified'
      ),
  ).length;

  // ==========================================================
  // FILTER + SEARCH
  // ==========================================================

  const filteredDocuments = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return documents.filter((document) => {
      const matchesSearch =
        !searchValue ||
        String(document.id)
          .toLowerCase()
          .includes(searchValue) ||
        document.document_name
          ?.toLowerCase()
          .includes(searchValue) ||
        document.document_type
          ?.toLowerCase()
          .includes(searchValue) ||
        document.source_dataset
          ?.toLowerCase()
          .includes(searchValue);

      if (!matchesSearch) {
        return false;
      }

      if (activeFilter === 'All') {
        return true;
      }

      if (activeFilter === 'Verified') {
        return (
          !document.is_tampered &&
          (document.verification_status === 'VERIFIED' ||
            document.verification_status === 'Verified')
        );
      }

      if (activeFilter === 'Tampered') {
        return Boolean(document.is_tampered);
      }

      if (activeFilter === 'Pending') {
        return (
          !document.is_tampered &&
          !(
            document.verification_status === 'VERIFIED' ||
            document.verification_status === 'Verified' ||
            document.verification_status === 'RECORDED' ||
            document.verification_status === 'Recorded'
          )
        );
      }

      if (activeFilter === 'Recorded') {
        return (
          document.verification_status === 'RECORDED' ||
          document.verification_status === 'Recorded'
        );
      }

      return true;
    });
  }, [documents, search, activeFilter]);

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <div className="min-h-full bg-slate-50/40">

      {/* HEADER */}
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-600">
          DOCUMENT REGISTRY
        </p>

        <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-950">
          Government documents and integrity status
        </h1>

        <p className="mt-3 text-sm text-slate-500">
          Review official government documents, verification status,
          and cryptographic integrity records.
        </p>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid gap-5 md:grid-cols-3">

        {/* TOTAL */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            TOTAL DOCUMENTS
          </p>

          <p className="mt-5 text-3xl font-bold text-slate-950">
            {totalDocuments}
          </p>
        </div>

        {/* VERIFIED */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            VERIFIED DOCUMENTS
          </p>

          <p className="mt-5 text-3xl font-bold text-green-700">
            {verifiedDocuments}
          </p>
        </div>

        {/* REVIEW */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            REVIEW REQUIRED
          </p>

          <p className="mt-5 text-3xl font-bold text-amber-700">
            {reviewRequired}
          </p>
        </div>
      </div>

      {/* DOCUMENT TABLE */}
      <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

        {/* TABLE HEADER */}
        <div className="border-b border-slate-200 px-6 py-6">

          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

            <div>
              <h2 className="text-xl font-bold text-slate-950">
                Document table
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Open the original government PDF directly from the table.
              </p>
            </div>

            {/* SEARCH */}
            <div className="relative w-full lg:w-[450px]">

              <MagnifyingGlassIcon
                className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
              />

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search by document, ID, source, or type"
                className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          {/* FILTERS */}
          <div className="mt-6 flex flex-wrap items-center gap-2">

            <FunnelIcon className="mr-1 h-5 w-5 text-slate-400" />

            {(
              [
                'All',
                'Verified',
                'Recorded',
                'Pending',
                'Tampered',
              ] as FilterType[]
            ).map((filter) => {

              const active = activeFilter === filter;

              return (
                <button
                  key={filter}
                  onClick={() =>
                    setActiveFilter(filter)
                  }
                  className={
                    active
                      ? 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm'
                      : 'rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50'
                  }
                >
                  {filter}
                </button>
              );
            })}
          </div>
        </div>

        {/* LOADING */}
        {loading && (
          <div className="p-12 text-center">

            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />

            <p className="mt-4 text-sm text-slate-500">
              Loading documents...
            </p>
          </div>
        )}

        {/* ERROR */}
        {!loading && error && (
          <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-6">

            <div className="flex items-start gap-3">

              <ExclamationTriangleIcon className="h-6 w-6 flex-shrink-0 text-red-600" />

              <div>
                <h2 className="font-semibold text-red-800">
                  Unable to load documents
                </h2>

                <p className="mt-1 text-sm text-red-700">
                  {error}
                </p>

                <button
                  onClick={loadDocuments}
                  className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* EMPTY */}
        {!loading &&
          !error &&
          filteredDocuments.length === 0 && (
            <div className="p-16 text-center">

              <DocumentTextIcon className="mx-auto h-12 w-12 text-slate-300" />

              <h2 className="mt-4 text-lg font-semibold text-slate-900">
                No documents found
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Try changing your search or filter.
              </p>
            </div>
          )}

        {/* TABLE */}
        {!loading &&
          !error &&
          filteredDocuments.length > 0 && (

            <div className="overflow-x-auto">

              <table className="w-full min-w-[1100px] text-left">

                <thead className="border-b border-slate-200 bg-slate-50">

                  <tr>

                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Document
                    </th>

                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Type
                    </th>

                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Source
                    </th>

                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </th>

                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Created
                    </th>

                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Blockchain
                    </th>

                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">

                  {filteredDocuments.map((document) => {

                    const status = getStatus(document);

                    const StatusIcon = status.icon;

                    const action =
                      actionState[String(document.id)];

                    return (
                      <tr
                        key={document.id}
                        className="transition-colors hover:bg-slate-50"
                      >

                        {/* DOCUMENT + OPEN FILE */}
                        <td className="px-6 py-5">

                          <div className="flex items-center gap-3">

                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50">

                              <DocumentTextIcon className="h-5 w-5 text-blue-600" />

                            </div>

                            <div className="min-w-0">

                              <p className="max-w-[280px] truncate font-semibold text-slate-900">
                                {document.document_name}
                              </p>

                              <p className="mt-1 text-xs text-slate-500">
                                ID: {document.id}
                              </p>

                              {/* ⭐ OPEN FILE BUTTON */}
                              {document.file_path ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openDocument(document)
                                  }
                                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
                                >
                                  Open File

                                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                                </button>
                              ) : (
                                <span className="mt-3 inline-block text-xs text-slate-400">
                                  PDF unavailable
                                </span>
                              )}

                            </div>
                          </div>
                        </td>

                        {/* TYPE */}
                        <td className="px-6 py-5">

                          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                            {document.document_type || 'PDF'}
                          </span>

                        </td>

                        {/* SOURCE */}
                        <td className="px-6 py-5">

                          <span className="text-sm text-slate-600">
                            {document.source_dataset ||
                              'Government Dataset'}
                          </span>

                        </td>

                        {/* STATUS */}
                        <td className="px-6 py-5">

                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${status.className}`}
                          >

                            <StatusIcon className="h-3.5 w-3.5" />

                            {status.label}

                          </span>

                        </td>

                        {/* CREATED */}
                        <td className="px-6 py-5">

                          <span className="text-sm text-slate-600">

                            {document.created_at
                              ? new Date(
                                  document.created_at,
                                ).toLocaleDateString(
                                  'en-IN',
                                )
                              : '—'}

                          </span>

                        </td>

                        {/* BLOCKCHAIN */}
                        <td className="px-6 py-5">

                          <div className="flex flex-col gap-2">

                            <p className="text-xs font-semibold text-slate-700">
                              {document.blockchain_hash
                                ? 'Anchored'
                                : 'Not anchored'}
                            </p>

                            <p
                              className={`text-xs font-medium ${
                                document.is_tampered
                                  ? 'text-red-600'
                                  : 'text-slate-500'
                              }`}
                            >
                              Tampered:{' '}
                              {document.is_tampered
                                ? 'Yes'
                                : 'No'}
                            </p>

                            {document.blockchain_tx_id && (
                              <p
                                className="max-w-[180px] truncate text-xs text-slate-400"
                                title={
                                  document.blockchain_tx_id
                                }
                              >
                                {document.blockchain_tx_id}
                              </p>
                            )}

                            {/* BLOCKCHAIN ACTION */}
                            {document.blockchain_hash ? (
                              <button
                                type="button"
                                onClick={() =>
                                  runDocumentAction(
                                    String(document.id),
                                    'verify',
                                  )
                                }
                                disabled={Boolean(action)}
                                className="w-fit rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 disabled:opacity-50"
                              >
                                {action === 'verify'
                                  ? 'Verifying...'
                                  : 'Verify'}
                              </button>
                            ) : canAnchor ? (
                              <button
                                type="button"
                                onClick={() =>
                                  runDocumentAction(
                                    String(document.id),
                                    'anchor',
                                  )
                                }
                                disabled={Boolean(action)}
                                className="w-fit rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                              >
                                {action === 'anchor'
                                  ? 'Anchoring...'
                                  : 'Anchor'}
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">
                                Awaiting anchor
                              </span>
                            )}

                          </div>

                        </td>

                      </tr>
                    );
                  })}

                </tbody>
              </table>
            </div>
          )}

        {/* BOTTOM COUNT */}
        {!loading &&
          !error &&
          filteredDocuments.length > 0 && (

            <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">

              <p className="text-sm text-slate-500">

                Showing{' '}

                <span className="font-semibold text-slate-700">
                  {filteredDocuments.length}
                </span>{' '}

                of{' '}

                <span className="font-semibold text-slate-700">
                  {documents.length}
                </span>{' '}

                documents

              </p>

            </div>
          )}

      </div>
    </div>
  );
}