import { Router } from 'express';
import { documentController } from '@/controllers/document.controller.js';
import { requireRole } from '@/middlewares/auth.middleware.js';

export const documentRoutes = Router();

documentRoutes.get(
  '/',
  documentController.getAll
);

documentRoutes.get(
  '/:id',
  documentController.getById
);

documentRoutes.post(
  '/:id/verify',
  requireRole('OFFICIAL', 'ADMIN'),
  documentController.verify
);

documentRoutes.post(
  '/:id/anchor',
  requireRole('OFFICIAL', 'ADMIN'),
  documentController.anchor
);
