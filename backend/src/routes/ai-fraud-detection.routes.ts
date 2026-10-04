import { Router } from 'express';
import { aiFraudDetectionController } from '@/controllers/ai-fraud-detection.controller.js';

export const aiFraudDetectionRoutes = Router();

aiFraudDetectionRoutes.get('/', aiFraudDetectionController.list);
aiFraudDetectionRoutes.get('/summary', aiFraudDetectionController.summary);
aiFraudDetectionRoutes.get('/:tenderId', aiFraudDetectionController.getByTenderId);
