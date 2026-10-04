import { Router } from 'express';
import { tenderController } from '@/controllers/tender.controller.js';
import { requireRole } from '@/middlewares/auth.middleware.js';

export const tenderRoutes = Router();

// Public / Read access: CITIZEN, OFFICIAL, AUDITOR, ADMIN
tenderRoutes.get('/', tenderController.getTenders);
tenderRoutes.get('/stats', tenderController.getStats);
tenderRoutes.get('/:id', tenderController.getTenderById);
tenderRoutes.get('/:id/versions', tenderController.getVersions);
tenderRoutes.get('/:id/bids', tenderController.getBids);
tenderRoutes.get('/:id/audit', tenderController.getAuditHistory);
tenderRoutes.get('/:id/source', tenderController.getSource);
tenderRoutes.get(
  '/:id/verify',
  requireRole('OFFICIAL', 'ADMIN'),
  tenderController.verifyIntegrity,
);


// Official Modifications (Git-like version creation): OFFICIAL, ADMIN
tenderRoutes.post('/:id/versions', requireRole('OFFICIAL', 'ADMIN'), tenderController.createVersion);
tenderRoutes.post('/:id/bids/:bidId/versions', requireRole('OFFICIAL', 'ADMIN'), tenderController.modifyBid);
