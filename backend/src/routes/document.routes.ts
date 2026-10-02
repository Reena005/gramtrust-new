import { Router } from 'express';
import { documentController } from '@/controllers/document.controller.js';

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
  documentController.verify
);

documentRoutes.post(
  '/:id/anchor',
  documentController.anchor
);