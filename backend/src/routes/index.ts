import { Router } from 'express';

import { projectRoutes } from './project.routes.js';
import { importRoutes } from './import.routes.js';
import { blockchainRoutes } from './blockchain.routes.js';
import { verifyRoutes } from './verify.routes.js';
import { dashboardRoutes } from './dashboard.routes.js';
import { actionsRoutes } from './actions.routes.js';
import { integrityReportRoutes } from './integrity-report.routes.js';
import { authRoutes } from './auth.routes.js';
import { tamperLogRoutes } from './tamper-log.routes.js';
import { tenderRoutes } from './tender.routes.js';
import { vendorRoutes } from './vendor.routes.js';
import { sourceRoutes } from './source.routes.js';
import { aiWorkVerificationRoutes } from './ai-work-verification.routes.js';
import { aiFraudDetectionRoutes } from './ai-fraud-detection.routes.js';
import { complaintRoutes } from './complaint.routes.js';
import { notificationRoutes } from './notification.routes.js';

// Document Integrity Verification Module
import { documentRoutes } from './document.routes.js';

import { authenticate, requireRole } from '@/middlewares/auth.middleware.js';

export const apiRoutes = Router();

// ─── Public ───────────────────────────────────────────────────────────────────

apiRoutes.use('/auth', authRoutes);

// ─── All routes below require authentication ──────────────────────────────────

apiRoutes.use(authenticate);

apiRoutes.use(
  '/ai/fraud-detection',
  requireRole('AUDITOR', 'ADMIN', 'OFFICIAL', 'CITIZEN'),
  aiFraudDetectionRoutes,
);

apiRoutes.use(
  '/ai-work-verification',
  aiWorkVerificationRoutes,
);

apiRoutes.use(
  '/complaints',
  requireRole('CITIZEN', 'OFFICIAL', 'ADMIN', 'AUDITOR'),
  complaintRoutes,
);

apiRoutes.use('/notifications', notificationRoutes);

// ─── Tender & Vendor Transparency Module ──────────────────────────────────────

apiRoutes.use(
  '/tenders',
  requireRole('CITIZEN', 'OFFICIAL', 'AUDITOR', 'ADMIN'),
  tenderRoutes,
);

apiRoutes.use(
  '/vendors',
  requireRole('CITIZEN', 'OFFICIAL', 'AUDITOR', 'ADMIN'),
  vendorRoutes,
);

apiRoutes.use(
  '/sources',
  requireRole('CITIZEN', 'OFFICIAL', 'AUDITOR', 'ADMIN'),
  sourceRoutes,
);

// ─── Document Integrity Verification Module ───────────────────────────────────

apiRoutes.use(
  '/documents',
  requireRole('CITIZEN', 'OFFICIAL', 'AUDITOR', 'ADMIN'),
  documentRoutes,
);

// ─── Existing GramTrust Fund Ledger ──────────────────────────────────────────

apiRoutes.use(
  '/projects',
  requireRole('CITIZEN', 'OFFICIAL', 'AUDITOR', 'ADMIN'),
  projectRoutes,
);

apiRoutes.use(
  '/blockchain',
  requireRole('CITIZEN', 'OFFICIAL', 'AUDITOR', 'ADMIN'),
  blockchainRoutes,
);

apiRoutes.use(
  '/verify',
  requireRole('CITIZEN', 'OFFICIAL', 'AUDITOR', 'ADMIN'),
  verifyRoutes,
);

apiRoutes.use(
  '/dashboard',
  requireRole('CITIZEN', 'OFFICIAL', 'AUDITOR', 'ADMIN'),
  dashboardRoutes,
);

apiRoutes.use(
  '/tamper-logs',
  requireRole('CITIZEN', 'OFFICIAL', 'AUDITOR', 'ADMIN'),
  tamperLogRoutes,
);

// OFFICIAL + ADMIN: operational fund actions

apiRoutes.use(
  '/actions',
  requireRole('OFFICIAL', 'ADMIN'),
  actionsRoutes,
);

// ADMIN only: legacy CSV import & integrity reports

apiRoutes.use(
  '/import',
  requireRole('ADMIN'),
  importRoutes,
);

apiRoutes.use(
  '/integrity-report',
  requireRole('ADMIN', 'OFFICIAL', 'AUDITOR'),
  integrityReportRoutes,
);