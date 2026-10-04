import { Router } from 'express';
import { complaintController } from '@/controllers/complaint.controller.js';
import { requireRole } from '@/middlewares/auth.middleware.js';
import { validateRequest } from '@/middlewares/validate.middleware.js';
import {
  complaintIdSchema,
  createComplaintSchema,
  updateComplaintStatusSchema,
} from '@/validators/complaint.validators.js';

export const complaintRoutes = Router();

complaintRoutes.post(
  '/',
  requireRole('CITIZEN'),
  validateRequest(createComplaintSchema),
  complaintController.create,
);
complaintRoutes.get('/', complaintController.list);
complaintRoutes.get(
  '/:id',
  validateRequest(complaintIdSchema, 'params'),
  complaintController.getById,
);
complaintRoutes.patch(
  '/:id/status',
  requireRole('OFFICIAL', 'ADMIN'),
  validateRequest(complaintIdSchema, 'params'),
  validateRequest(updateComplaintStatusSchema),
  complaintController.updateStatus,
);
