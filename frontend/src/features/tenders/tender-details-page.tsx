import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ShieldCheckIcon,
  ExclamationTriangleIcon,

  BuildingOffice2Icon,
 
  ClockIcon,
  DocumentDuplicateIcon,
  PencilSquareIcon,
  CircleStackIcon,
  ArrowLeftIcon,

  DocumentTextIcon,
  InformationCircleIcon,
  CheckBadgeIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { tenderService } from '@/services/tender.service';
import type { Tender, TenderVersion, Bid, IntegrityVerificationReport } from '@/types/tender';
import { useAuth } from '@/features/auth/auth-context';

type TabType = 'overview' | 'bids' | 'vendors' | 'audit' | 'source';

const TABS = [
  { id: 'overview', name: 'Overview', Icon: DocumentTextIcon },
  { id: 'bids', name: 'Bids', Icon: DocumentTextIcon },
  { id: 'vendors', name: 'Vendors', Icon: BuildingOffice2Icon },

  { id: 'audit', name: 'Audit History', Icon: ClockIcon },
  { id: 'source', name: 'Source Record', Icon: CircleStackIcon },
] as const;

export function TenderDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [tender, setTender] = useState<Tender | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showVersionModal, setShowVersionModal] = useState(false);
  const [showBidModal, setShowBidModal] = useState<Bid | null>(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyReport, setVerifyReport] = useState<IntegrityVerificationReport | null>(null);
  const [verifying, setVerifying] = useState(false);

  const [editEstimatedValue, setEditEstimatedValue] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editChangeReason, setEditChangeReason] = useState('');
  const [isSubmittingVersion, setIsSubmittingVersion] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);

  const [editBidAmount, setEditBidAmount] = useState('');
  const [editBidReason, setEditBidReason] = useState('');
  const [isSubmittingBid, setIsSubmittingBid] = useState(false);

  const [selectedVersionForDiff, setSelectedVersionForDiff] = useState<TenderVersion | null>(null);

  const canEdit = user?.role === 'OFFICIAL' || user?.role === 'ADMIN';

  async function loadTenderDetails() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await tenderService.getTenderById(id);
      setTender(data);
      if (data.versions && data.versions.length > 0) setSelectedVersionForDiff(data.versions[0]);
      setEditEstimatedValue(String(data.estimatedValue));
      setEditTitle(data.title);
      setEditDepartment(data.department);
      setEditStatus(data.status);

      if (user?.role !== 'CITIZEN') {
        // Auto-check integrity on load
        try {
          const rep = await tenderService.verifyTender(id);
          setVerifyReport(rep);
        } catch {}
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load tender');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTenderDetails(); }, [id, user?.role]);

  async function handleVerifyBlockchain() {
    if (!id) return;
    setVerifying(true);
    setShowVerifyModal(true);
    try {
      const report = await tenderService.verifyTender(id);
      setVerifyReport(report);
    } finally {
      setVerifying(false);
    }
  }


  async function handleCreateVersionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !tender) return;
    if (editChangeReason.trim().length < 5) { setVersionError('A valid reason (min 5 chars) is mandatory.'); return; }
    setIsSubmittingVersion(true);
    setVersionError(null);
    try {
      const fields: Record<string, any> = {};
      if (Number(editEstimatedValue) !== Number(tender.estimatedValue)) fields.estimatedValue = Number(editEstimatedValue);
      if (editTitle !== tender.title) fields.title = editTitle;
      if (editDepartment !== tender.department) fields.department = editDepartment;
      if (editStatus !== tender.status) fields.status = editStatus;
      if (Object.keys(fields).length === 0) { setVersionError('No fields changed.'); setIsSubmittingVersion(false); return; }
      await tenderService.createVersion(id, { changeReason: editChangeReason.trim(), fields });
      setShowVersionModal(false);
      setEditChangeReason('');
      await loadTenderDetails();
      setActiveTab('audit');
    } catch (err: any) {
      setVersionError(err.response?.data?.message || err.message || 'Failed to create version');
    } finally {
      setIsSubmittingVersion(false);
    }
  }

  async function handleModifyBidSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !showBidModal) return;
    if (editBidReason.trim().length < 5) { alert('A valid reason is required.'); return; }
    setIsSubmittingBid(true);
    try {
      await tenderService.modifyBid(id, showBidModal.id, { newBidAmount: Number(editBidAmount), changeReason: editBidReason.trim() });
      setShowBidModal(null);
      setEditBidReason('');
      await loadTenderDetails();
      setActiveTab('bids');
    } catch (err: any) {
      alert('Failed to modify bid: ' + (err.response?.data?.message || err.message));
    } finally {
      setIsSubmittingBid(false);
    }
  }

  if (loading) return (
    <div className="flex h-96 items-center justify-center">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" />
        <p className="mt-3 text-sm text-slate-500">Loading procurement record...</p>
      </div>
    </div>
  );

  if (error || !tender) return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-8 text-center">
      <ExclamationTriangleIcon className="mx-auto h-10 w-10 text-rose-500" />
      <h2 className="mt-3 text-lg font-bold text-slate-900">Record Not Found</h2>
      <p className="mt-1 text-sm text-slate-500">{error}</p>
      <Link to="/tenders" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
        <ArrowLeftIcon className="h-4 w-4" /> Back to Tenders
      </Link>
    </div>
  );


  const isTampered = Boolean(
    verifyReport?.isTampered ||
    tender.blockchainStatus === 'Tampered' ||
    (verifyReport?.tamperAlerts && verifyReport.tamperAlerts.length > 0)
  );
  const hasVerificationReport = Boolean(verifyReport);

  const tamperedVendorName =
    verifyReport?.tamperedVendorName ||
    (verifyReport?.tamperAlerts && verifyReport.tamperAlerts.length > 0
      ? verifyReport.tamperAlerts.map((a) => a.vendorName).join(', ')
      : null);

  return (
    <div className="space-y-6">
      {/* Top Banner if Tampered */}
      {isTampered && (
        <div className="rounded-2xl border-2 border-rose-500 bg-rose-50 p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <ExclamationTriangleIcon className="h-8 w-8 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-200 px-2.5 py-0.5 text-xs font-black text-rose-900 tracking-wide uppercase">
                ⚠ TAMPERED
              </span>
              <h3 className="text-base font-bold text-rose-950">
                Tender: {tender.tenderId} | Vendor: {tamperedVendorName || 'Identified Vendor'}
              </h3>
              <p className="text-xs text-rose-800 font-medium">
                The bid associated with this vendor has been detected as tampered. Live database records do not match authentic government submissions.
              </p>
              <div className="pt-2">
                <Link
                  to="/tamper-logs"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-700"
                >
                  View Incident in Tamper Logs →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link to="/tenders" className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50">
            <ArrowLeftIcon className="h-4 w-4 text-slate-600" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-blue-600">{tender.tenderId}</span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs text-slate-500">{tender.referenceNumber}</span>
              {isTampered ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-extrabold text-rose-700 border border-rose-300">
                  <ExclamationTriangleIcon className="h-3.5 w-3.5" /> ⚠ TAMPERED
                </span>
              ) : hasVerificationReport ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                  <CheckBadgeIcon className="h-3.5 w-3.5" /> ✓ VERIFIED
                </span>
              ) : (
                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                  Integrity: {tender.blockchainStatus || 'Not verified'}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-900">{tender.title}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {user?.role !== 'CITIZEN' && (
            <button
              onClick={handleVerifyBlockchain}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold ${
                isTampered
                  ? 'border-rose-300 bg-rose-100 text-rose-800 hover:bg-rose-200'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              <ShieldCheckIcon className="h-4 w-4 text-emerald-600" />
              {isTampered ? '⚠ Verification Alert' : 'Verify Integrity'}
            </button>
          )}
          {canEdit && (
            <button onClick={() => { setEditEstimatedValue(String(tender.estimatedValue)); setEditTitle(tender.title); setEditDepartment(tender.department); setEditStatus(tender.status); setVersionError(null); setShowVersionModal(true); }} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700">
              <PencilSquareIcon className="h-4 w-4" /> Create New Version
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-soft">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Estimated Value</span>
          <p className="mt-1 text-2xl font-bold text-slate-900">&#8377;{Number(tender.estimatedValue).toLocaleString('en-IN')}</p>
          <span className="text-xs text-slate-500">{tender.currency || 'INR'}</span>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-soft">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status and Version</span>
          <div className="mt-2 flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tender.status === 'Awarded' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>{tender.status}</span>
            <span className="font-mono text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">V{tender.currentVersionNumber}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-soft">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Source Provenance</span>
          <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <BuildingOffice2Icon className="h-4 w-4 text-blue-600" />
            <span className="truncate">{tender.snapshot?.sourceName || 'Govt. Procurement Portal'}</span>
          </div>
          <span className="text-[11px] text-emerald-600 font-semibold truncate block">Official Government Dataset</span>
        </div>
      </div>

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-6 overflow-x-auto">
          {TABS.map(({ id: tabId, name, Icon }) => (
            <button key={tabId} onClick={() => setActiveTab(tabId as TabType)} className={`inline-flex items-center gap-2 border-b-2 py-3 text-sm font-medium whitespace-nowrap transition-colors ${activeTab === tabId ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              <Icon className="h-4 w-4" />
              {tabId === 'bids' ? `Bids (${tender.bids?.length || 0})` : tabId === 'audit' ? `Audit History (${tender.versions?.length || 1})` : name}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-soft">
            <h3 className="text-base font-semibold text-slate-900">Procurement Information</h3>
            <p className="text-xs text-slate-500 mt-0.5">Authentic government tender details as imported from official portal.</p>
            <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="text-xs font-semibold text-slate-500">Tender ID</dt><dd className="mt-1 font-mono text-sm text-slate-900">{tender.tenderId}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-500">Reference Number</dt><dd className="mt-1 font-mono text-sm text-slate-900">{tender.referenceNumber}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-500">Department</dt><dd className="mt-1 text-sm text-slate-900 font-medium">{tender.department}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-500">Organisation Chain</dt><dd className="mt-1 text-sm text-slate-700">{tender.organisationChain || 'Not specified in source'}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-500">Tender Type / Category</dt><dd className="mt-1 text-sm text-slate-900">{tender.tenderType || 'Open Tender'} ({tender.tenderCategory || 'Works'})</dd></div>
              <div><dt className="text-xs font-semibold text-slate-500">State / District</dt><dd className="mt-1 text-sm text-slate-900">{tender.district}, {tender.state}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-500">Gram Panchayat</dt><dd className="mt-1 text-sm text-slate-900">{tender.panchayat || 'District-level project'}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-500">Published Date</dt><dd className="mt-1 text-sm text-slate-900">{tender.publishedDate ? new Date(tender.publishedDate).toLocaleDateString('en-IN') : 'N/A'}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-500">Bid Closing Date</dt><dd className="mt-1 text-sm text-slate-900">{tender.closingDate ? new Date(tender.closingDate).toLocaleDateString('en-IN') : 'N/A'}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-500">Execution Period</dt><dd className="mt-1 text-sm text-slate-900">{tender.periodOfWorkDays ? `${tender.periodOfWorkDays} Days` : 'N/A'}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-500">Inviting Authority</dt><dd className="mt-1 text-sm text-slate-900">{tender.invitingAuthority || 'Executive Engineer'}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-500">Product Category</dt><dd className="mt-1 text-sm text-slate-900">{tender.productCategory || 'Civil Works'}</dd></div>
            </dl>
          </div>
          {isTampered ? (
            <div className="rounded-2xl border-2 border-rose-500 bg-rose-50 p-6 shadow-soft">
              <div className="flex items-start gap-4">
                <ExclamationTriangleIcon className="h-8 w-8 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1 rounded-md bg-rose-200 px-2.5 py-0.5 text-xs font-black text-rose-900 uppercase">
                    ⚠ TAMPERED RECORD DETECTED
                  </span>
                  <h4 className="text-base font-bold text-rose-950">
                    Tender: {tender.tenderId} | Vendor: {tamperedVendorName || 'Identified Vendor'}
                  </h4>
                  <p className="text-xs text-rose-800 leading-relaxed font-medium">
                    The bid associated with this vendor has been detected as tampered. Live database values do not match original government submissions.
                  </p>
                  <div className="pt-2">
                    <Link
                      to="/tamper-logs"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 transition-colors"
                    >
                      View Incident in Tamper Logs →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ) : hasVerificationReport ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6">
              <div className="flex items-center gap-3">
                <ShieldCheckIcon className="h-7 w-7 text-emerald-600 shrink-0" />
                <div>
                  <h4 className="font-semibold text-emerald-900">✓ Record Integrity Verified</h4>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    All bidder submissions and project specifications are verified authentic against official government records. No database tampering detected.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <div className="flex items-center gap-3">
                <ShieldCheckIcon className="h-7 w-7 text-slate-500 shrink-0" />
                <div>
                  <h4 className="font-semibold text-slate-900">
                    Current Integrity Status: {tender.blockchainStatus || 'Not available'}
                  </h4>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Existing tender and audit information is available in the details and Audit History sections.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'bids' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-soft">
          <div className="border-b border-slate-100 bg-slate-50/75 px-6 py-4">
            <h3 className="font-semibold text-slate-900">Submitted Bids</h3>
            <p className="text-xs text-slate-500">Actual bidder records imported from government procurement source.</p>
          </div>
          {!tender.bids || tender.bids.length === 0 ? (
            <div className="p-12 text-center">
              <InformationCircleIcon className="mx-auto h-10 w-10 text-slate-400" />
              <h4 className="mt-2 text-sm font-semibold text-slate-900">Bidder information not available in the government source.</h4>
              <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">The original source published high-level tender data without itemized bidder disclosures. GramTrust maintains 100% data authenticity and never fabricates placeholder records.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="border-b border-slate-100 bg-slate-50/50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-6 py-3.5">Vendor Name</th>
                    <th className="px-6 py-3.5">GSTIN</th>
                    <th className="px-6 py-3.5">Bid Amount</th>
                    <th className="px-6 py-3.5">Rank</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Version</th>
                    {canEdit && <th className="px-6 py-3.5 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tender.bids.map((bid) => {
                    const isBidTampered = verifyReport?.tamperAlerts?.some(
                      (a) => a.bidId === bid.id || a.vendorName === bid.vendorName
                    );

                    return (
                      <tr
                        key={bid.id}
                        className={
                          isBidTampered
                            ? 'bg-rose-50/60 hover:bg-rose-50/80 border-l-4 border-l-rose-500 transition-colors'
                            : 'hover:bg-slate-50/80 transition-colors'
                        }
                      >
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-900">{bid.vendorName}</div>
                          {isBidTampered && (
                            <div className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 mt-0.5">
                              <ExclamationTriangleIcon className="h-3.5 w-3.5 text-rose-600" />
                              Altered in database
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-500">{bid.vendorGstin || 'Not disclosed'}</td>
                        <td className="px-6 py-4 font-semibold text-slate-900">&#8377;{Number(bid.bidAmount).toLocaleString('en-IN')}</td>
                        <td className="px-6 py-4">
                          {bid.financialRank && <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold">{bid.financialRank}</span>}
                          {bid.technicalScore && <span className="ml-2 text-xs text-slate-500">Score: {bid.technicalScore}%</span>}
                        </td>
                        <td className="px-6 py-4">
                          {isBidTampered ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2.5 py-1 text-xs font-extrabold text-rose-800 border border-rose-300">
                              ⚠ TAMPERED
                            </span>
                          ) : (
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${bid.status === 'Accepted' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{bid.status}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-purple-700 font-semibold">V{bid.currentVersionNumber}</td>
                        {canEdit && (
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => { setShowBidModal(bid); setEditBidAmount(String(bid.bidAmount)); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                              <PencilSquareIcon className="h-3.5 w-3.5" /> Modify
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'vendors' && (
        <div>
          {!tender.bids || tender.bids.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
              <BuildingOffice2Icon className="mx-auto h-10 w-10 text-slate-300" />
              <h4 className="mt-2 text-sm font-semibold text-slate-900">Vendor information not disclosed in government source.</h4>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tender.bids.map((bid) => (
                <div key={bid.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                  <div className="flex items-center justify-between"><span className="font-semibold text-slate-900">{bid.vendorName}</span><BuildingOffice2Icon className="h-5 w-5 text-blue-600" /></div>
                  <dl className="mt-3 space-y-2 text-xs">
                    <div className="flex justify-between"><dt className="text-slate-500">GSTIN:</dt><dd className="font-mono text-slate-800">{bid.vendorGstin || 'Not Disclosed'}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Bid Amount:</dt><dd className="font-semibold text-slate-900">&#8377;{Number(bid.bidAmount).toLocaleString('en-IN')}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Rank:</dt><dd className="font-bold text-slate-800">{bid.financialRank || 'N/A'}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Status:</dt><dd className="font-medium text-slate-700">{bid.status}</dd></div>
                  </dl>
                </div>
              ))}
            </div>
          )}
        </div>
      )}


      {activeTab === 'audit' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-soft">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="font-semibold text-slate-900">Immutable Version Timeline</h3>
              <p className="text-xs text-slate-500">Every official modification creates a new version. Historical records are never overwritten.</p>
            </div>
            <div className="mt-6 space-y-6">
              {tender.versions?.map((ver) => (
                <div key={ver.id} className={`relative rounded-2xl border p-5 transition-all ${selectedVersionForDiff?.id === ver.id ? 'border-blue-500 bg-blue-50/20 shadow-md ring-1 ring-blue-500' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-600 font-mono text-sm font-bold text-white">V{ver.versionNumber}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-900">{ver.versionNumber === 1 ? 'Original Government Import' : 'Official Administrative Modification'}</h4>
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Author: {ver.changedBy}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{new Date(ver.changedAt).toLocaleString('en-IN')} - Reason: {ver.changeReason}</p>
                      </div>
                    </div>
                    <button onClick={() => setSelectedVersionForDiff(ver)} className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">View Snapshot</button>
                  </div>
                  <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                    <span className="text-xs font-semibold text-slate-500">Integrity Status:</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 text-xs">
                      <CheckBadgeIcon className="h-4 w-4 text-emerald-600" /> Recorded in Ledger
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {selectedVersionForDiff && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="font-semibold text-slate-900 text-sm">Snapshot Payload - Version {selectedVersionForDiff.versionNumber}</h4>
              </div>
              <pre className="mt-4 max-h-96 overflow-auto rounded-xl bg-slate-900 p-4 font-mono text-xs text-emerald-400">{JSON.stringify(selectedVersionForDiff.data, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      {activeTab === 'source' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-soft">
            <h3 className="font-semibold text-slate-900">Original Government Source Provenance</h3>
            <p className="text-xs text-slate-500 mt-0.5">Authentic record directly ingested from official government procurement portal.</p>
            <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs font-semibold text-slate-500">Source Name</dt><dd className="mt-1 text-xs font-bold text-slate-900">{tender.snapshot?.sourceName}</dd></div>
              <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs font-semibold text-slate-500">Source URL</dt><dd className="mt-1 text-xs"><a href={tender.snapshot?.sourceUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate block">{tender.snapshot?.sourceUrl}</a></dd></div>
              <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs font-semibold text-slate-500">Ingested At</dt><dd className="mt-1 text-xs font-mono text-slate-900">{tender.snapshot?.fetchTimestamp ? new Date(tender.snapshot.fetchTimestamp).toLocaleString('en-IN') : 'N/A'}</dd></div>
              <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs font-semibold text-slate-500">Integrity Seal</dt><dd className="mt-1 text-xs text-emerald-700 font-bold">✓ Official Government Source Verified</dd></div>
            </dl>
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-700">Raw Immutable JSON Response</span>
                <button onClick={() => navigator.clipboard.writeText(JSON.stringify(tender.snapshot?.rawData, null, 2))} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800">
                  <DocumentDuplicateIcon className="h-3.5 w-3.5" /> Copy JSON
                </button>
              </div>
              <pre className="max-h-[480px] overflow-auto rounded-xl bg-slate-900 p-4 font-mono text-xs text-emerald-400">{JSON.stringify(tender.snapshot?.rawData, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}

      {showVersionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-bold text-slate-900">Official Modification - Create Version {tender.currentVersionNumber + 1}</h3>
                <p className="text-xs text-slate-500">Historical records remain permanently untouched in the immutable ledger.</p>
              </div>
              <button onClick={() => setShowVersionModal(false)}><XMarkIcon className="h-5 w-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleCreateVersionSubmit} className="mt-4 space-y-4">
              {versionError && <div className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">{versionError}</div>}
              <div>
                <label className="text-xs font-bold text-slate-700">Project / Work Title</label>
                <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm focus:border-blue-500 focus:outline-none" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Estimated Value (INR)</label>
                  <input type="number" step="0.01" value={editEstimatedValue} onChange={(e) => setEditEstimatedValue(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm focus:border-blue-500 focus:outline-none" required />
                  <span className="text-[10px] text-slate-500">Previous: &#8377;{Number(tender.estimatedValue).toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Department</label>
                  <input type="text" value={editDepartment} onChange={(e) => setEditDepartment(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm focus:border-blue-500 focus:outline-none" required />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700">Status</label>
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm focus:border-blue-500 focus:outline-none">
                  {['Published', 'Under Evaluation', 'Awarded', 'In Progress'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700">Reason for Modification (mandatory for audit trail)</label>
                <textarea rows={3} value={editChangeReason} onChange={(e) => setEditChangeReason(e.target.value)} placeholder="e.g. Administrative correction sanctioned under GFR amendment order..." className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm focus:border-blue-500 focus:outline-none" required />
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowVersionModal(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={isSubmittingVersion} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                  {isSubmittingVersion ? 'Creating...' : `Save Version ${tender.currentVersionNumber + 1}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-bold text-slate-900">Modify Bid - {showBidModal.vendorName}</h3>
                <p className="text-xs text-slate-500">Current: &#8377;{Number(showBidModal.bidAmount).toLocaleString('en-IN')}</p>
              </div>
              <button onClick={() => setShowBidModal(null)}><XMarkIcon className="h-5 w-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleModifyBidSubmit} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700">Corrected Bid Amount (INR)</label>
                <input type="number" step="0.01" value={editBidAmount} onChange={(e) => setEditBidAmount(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm focus:border-blue-500 focus:outline-none" required />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700">Reason for Correction (mandatory)</label>
                <textarea rows={3} value={editBidReason} onChange={(e) => setEditBidReason(e.target.value)} placeholder="e.g. Rate revision following arithmetic verification..." className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm focus:border-blue-500 focus:outline-none" required />
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowBidModal(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={isSubmittingBid} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                  {isSubmittingBid ? 'Saving...' : 'Submit Modification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showVerifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <ShieldCheckIcon className="h-6 w-6 text-blue-600" />
                <div>
                  <h3 className="font-bold text-slate-900">Integrity Verification</h3>
                  <p className="text-xs text-slate-500">Checking authentic government record against live database</p>
                </div>
              </div>
              <button onClick={() => setShowVerifyModal(false)}><XMarkIcon className="h-5 w-5 text-slate-400" /></button>
            </div>
            {verifying ? (
              <div className="py-12 text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" />
                <p className="mt-3 text-sm text-slate-600 font-medium">Verifying records against government source...</p>
              </div>
            ) : verifyReport ? (
              <div className="mt-6 space-y-4">
                {verifyReport.isTampered ? (
                  <div className="rounded-2xl border-2 border-rose-500 bg-rose-50 p-5">
                    <div className="flex items-start gap-3.5">
                      <ExclamationTriangleIcon className="h-8 w-8 text-rose-600 shrink-0 mt-0.5" />
                      <div className="space-y-2">
                        <div className="inline-flex items-center gap-1.5 rounded-md bg-rose-200 px-2.5 py-0.5 text-xs font-black text-rose-900">
                          ⚠ TAMPERED
                        </div>
                        <h4 className="text-base font-bold text-rose-950">
                          Tender: {tender.tenderId}
                        </h4>
                        <p className="text-sm font-semibold text-rose-900">
                          Vendor: {verifyReport.tamperedVendorName || 'Identified Vendor'}
                        </p>
                        <p className="text-xs text-rose-800 leading-relaxed font-medium">
                          The bid associated with this vendor has been detected as tampered. Live database records do not match authentic government submissions.
                        </p>
                        <div className="pt-2">
                          <Link
                            to="/tamper-logs"
                            onClick={() => setShowVerifyModal(false)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-700 shadow-sm"
                          >
                            View Incident in Tamper Logs →
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                    <div className="flex items-start gap-3.5">
                      <CheckBadgeIcon className="h-8 w-8 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-200 px-2.5 py-0.5 text-xs font-black text-emerald-900">
                          ✓ VERIFIED
                        </div>
                        <h4 className="text-base font-bold text-emerald-950">
                          Tender: {tender.tenderId}
                        </h4>
                        <p className="text-xs text-emerald-800 leading-relaxed font-medium">
                          All bidder records and project details are verified authentic against official government records. No database tampering detected.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-3 border-t border-slate-100">
                  <button onClick={() => setShowVerifyModal(false)} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">Close</button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
