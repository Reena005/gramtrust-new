import { Router } from 'express';
import { blockchainController } from '@/controllers/blockchain.controller';
import { requireRole } from '@/middlewares/auth.middleware';
import { validateRequest } from '@/middlewares/validate.middleware';
import { blockchainActionSchema } from '@/validators/blockchain.validators';

export const blockchainRoutes = Router();

blockchainRoutes.post(
  '/store',
  requireRole('OFFICIAL', 'ADMIN'),
  validateRequest(blockchainActionSchema),
  blockchainController.store,
);
blockchainRoutes.get('/:id/history', blockchainController.history);
