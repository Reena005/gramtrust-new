import type { Request, Response } from 'express';
import { complaintService } from '@/services/complaint.service.js';
import { AppError } from '@/utils/app-error.js';
import { asyncHandler } from '@/utils/async-handler.js';

export const complaintController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user?.sub) {
      throw new AppError('Authentication required.', 401);
    }
    const complaint = await complaintService.create(user, req.body);
    res.status(201).json({ success: true, data: complaint });
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user?.sub) {
      throw new AppError('Authentication required.', 401);
    }
    const complaints = await complaintService.list(user);
    res.json({
      success: true,
      count: complaints.length,
      data: complaints,
    });
  }),

  getById: asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const user = req.user;
    if (!user?.sub) {
      throw new AppError('Authentication required.', 401);
    }
    const complaint = await complaintService.getById(user, req.params.id);
    res.json({ success: true, data: complaint });
  }),

  updateStatus: asyncHandler(
    async (req: Request<{ id: string }>, res: Response) => {
      const user = req.user;
      if (!user?.sub) {
        throw new AppError('Authentication required.', 401);
      }
      const complaint = await complaintService.updateStatus(
        user,
        req.params.id,
        req.body.status,
        req.body.resolutionNotes,
      );
      res.json({ success: true, data: complaint });
    },
  ),
};
