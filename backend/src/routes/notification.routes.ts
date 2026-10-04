import { Router } from 'express';
import { notificationController } from '@/controllers/notification.controller.js';
import { validateRequest } from '@/middlewares/validate.middleware.js';
import { notificationIdSchema } from '@/validators/notification.validators.js';

export const notificationRoutes = Router();

notificationRoutes.get('/unread-count', notificationController.unreadCount);
notificationRoutes.patch('/read-all', notificationController.markAllAsRead);
notificationRoutes.get('/', notificationController.list);
notificationRoutes.patch(
  '/:id/read',
  validateRequest(notificationIdSchema, 'params'),
  notificationController.markAsRead,
);
