import { randomUUID } from 'node:crypto';
import { pool } from '@/config/db.js';
import type { CreateNotificationInput } from '@/validators/notification.validators.js';

export type NotificationType =
  | 'COMPLAINT_SUBMITTED'
  | 'COMPLAINT_STATUS_UPDATED'
  | 'COMPLAINT_RESOLVED'
  | 'COMPLAINT_CLOSED'
  | 'COMPLAINT_REJECTED';

export interface Notification {
  id: string;
  recipient_user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  metadata: Record<string, unknown> | null;
  read_at: Date | null;
  created_at: Date;
}

export const notificationRepository = {
  async create(input: CreateNotificationInput): Promise<Notification> {
    const { rows } = await pool.query<Notification>(
      `INSERT INTO notifications
        (id, recipient_user_id, title, message, type, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING *`,
      [
        randomUUID(),
        input.recipientUserId,
        input.title,
        input.message,
        input.type,
        input.metadata === undefined ? null : JSON.stringify(input.metadata),
      ],
    );
    return rows[0]!;
  },

  async findByRecipient(recipientUserId: string): Promise<Notification[]> {
    const { rows } = await pool.query<Notification>(
      `SELECT *
       FROM notifications
       WHERE recipient_user_id = $1
       ORDER BY created_at DESC, id DESC`,
      [recipientUserId],
    );
    return rows;
  },

  async findByIdForRecipient(
    id: string,
    recipientUserId: string,
  ): Promise<Notification | null> {
    const { rows } = await pool.query<Notification>(
      `SELECT *
       FROM notifications
       WHERE id = $1 AND recipient_user_id = $2
       LIMIT 1`,
      [id, recipientUserId],
    );
    return rows[0] ?? null;
  },

  async markAsReadForRecipient(
    id: string,
    recipientUserId: string,
  ): Promise<Notification | null> {
    const { rows } = await pool.query<Notification>(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1 AND recipient_user_id = $2
       RETURNING *`,
      [id, recipientUserId],
    );
    return rows[0] ?? null;
  },

  async markAllAsReadForRecipient(recipientUserId: string): Promise<number> {
    const { rowCount } = await pool.query(
      `UPDATE notifications
       SET read_at = NOW()
       WHERE recipient_user_id = $1 AND read_at IS NULL`,
      [recipientUserId],
    );
    return rowCount ?? 0;
  },

  async countUnreadForRecipient(recipientUserId: string): Promise<number> {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM notifications
       WHERE recipient_user_id = $1 AND read_at IS NULL`,
      [recipientUserId],
    );
    return Number(rows[0]?.count ?? 0);
  },
};
