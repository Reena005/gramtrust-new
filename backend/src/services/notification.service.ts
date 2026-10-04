import { notificationRepository } from '@/repositories/notification.repository.js';
import { AppError } from '@/utils/app-error.js';
import {
  createNotificationSchema,
  type CreateNotificationInput,
} from '@/validators/notification.validators.js';

export const notificationService = {
  async create(input: CreateNotificationInput) {
    const validation = createNotificationSchema.safeParse(input);
    if (!validation.success) {
      throw new AppError(
        'Notification data is invalid.',
        400,
        validation.error.flatten(),
      );
    }
    return notificationRepository.create(validation.data);
  },

  async listForUser(userId: string) {
    return notificationRepository.findByRecipient(userId);
  },

  async getUnreadCount(userId: string) {
    return notificationRepository.countUnreadForRecipient(userId);
  },

  async markAsRead(userId: string, notificationId: string) {
    const existing = await notificationRepository.findByIdForRecipient(
      notificationId,
      userId,
    );
    if (!existing) {
      throw new AppError('Notification not found.', 404);
    }
    const notification = await notificationRepository.markAsReadForRecipient(
      notificationId,
      userId,
    );
    if (!notification) {
      throw new AppError('Notification not found.', 404);
    }
    return notification;
  },

  async markAllAsRead(userId: string) {
    return notificationRepository.markAllAsReadForRecipient(userId);
  },
};
