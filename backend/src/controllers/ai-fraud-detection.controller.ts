import type { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler.js';
import { aiFraudDetectionService } from '@/services/ai-fraud-detection.service.js';

export const aiFraudDetectionController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await aiFraudDetectionService.list(
      req.query,
      req.user?.role ?? '',
    );
    res.json({ success: true, data: result });
  }),

  getByTenderId: asyncHandler(
    async (req: Request<{ tenderId: string }>, res: Response) => {
      const result = await aiFraudDetectionService.getByTenderId(
        req.params.tenderId,
        req.user?.role ?? '',
      );
      res.json({ success: true, data: result });
    },
  ),

  summary: asyncHandler(async (req: Request, res: Response) => {
    const result = await aiFraudDetectionService.summary(req.user?.role ?? '');
    res.json({ success: true, data: result });
  }),
};
