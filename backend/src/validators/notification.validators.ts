import { z } from 'zod';

export const notificationIdSchema = z.object({
  id: z.string().trim().min(1),
});

export const createNotificationSchema = z.object({
  recipientUserId: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(2000),
  type: z.enum([
    'COMPLAINT_SUBMITTED',
    'COMPLAINT_STATUS_UPDATED',
    'COMPLAINT_RESOLVED',
    'COMPLAINT_CLOSED',
    'COMPLAINT_REJECTED',
  ]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
