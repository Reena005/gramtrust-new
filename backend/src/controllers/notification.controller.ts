import type { Request, Response } from 'express';
import { notificationService } from '@/services/notification.service.js';
import { AppError } from '@/utils/app-error.js';
import { asyncHandler } from '@/utils/async-handler.js';

function getAuthenticatedUserId(req: Request): string {
  if (!req.user?.sub) {
    throw new AppError('Authentication required.', 401);
  }
  return req.user.sub;
}

export const notificationController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const notifications = await notificationService.listForUser(
      getAuthenticatedUserId(req),
    );
    res.json({
      success: true,
      count: notifications.length,
      data: notifications,
    });
  }),

  unreadCount: asyncHandler(async (req: Request, res: Response) => {
    const count = await notificationService.getUnreadCount(
      getAuthenticatedUserId(req),
    );
    res.json({ success: true, data: { count } });
  }),

  markAsRead: asyncHandler(
    async (req: Request<{ id: string }>, res: Response) => {
      const notification = await notificationService.markAsRead(
        getAuthenticatedUserId(req),
        req.params.id,
      );
      res.json({ success: true, data: notification });
    },
  ),

  markAllAsRead: asyncHandler(async (req: Request, res: Response) => {
    const count = await notificationService.markAllAsRead(
      getAuthenticatedUserId(req),
    );
    res.json({ success: true, data: { updatedCount: count } });
  }),
};
