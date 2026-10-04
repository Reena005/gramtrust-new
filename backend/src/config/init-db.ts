import { pool } from './db.js';

export async function initDb() {
  await pool.query('SELECT 1');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient_user_id TEXT NOT NULL
        REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN (
        'COMPLAINT_SUBMITTED',
        'COMPLAINT_STATUS_UPDATED',
        'COMPLAINT_RESOLVED',
        'COMPLAINT_CLOSED',
        'COMPLAINT_REJECTED'
      )),
      metadata JSONB,
      read_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS notifications_recipient_created_at_idx
    ON notifications (recipient_user_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS notifications_unread_recipient_idx
    ON notifications (recipient_user_id)
    WHERE read_at IS NULL
  `);

  console.log('DB connection ready');
}