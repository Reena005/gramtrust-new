import { randomUUID } from 'node:crypto';
import { pool } from '@/config/db';

export type ChangeType =
  | 'UPDATE'
  | 'UNAUTHORIZED_UPDATE'
  | 'DIRECT_DATABASE_CHANGE'
  | 'BLOCKCHAIN_MISMATCH'
  | 'HASH_MISMATCH';

export type TamperStatus =
  | 'AUTHORIZED'
  | 'BLOCKED'
  | 'DETECTED'
  | 'TAMPERED';

export interface TamperLogEntry {
  id: string;
  recordId: string;
  bidId: string | null;
  tenderId: string | null;
  vendorName: string | null;
  vendorId: string | null;
  userId: string | null;
  userName: string;
  userRole: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  trustedHash: string | null;
  currentHash: string | null;
  originalAmount: string | null;
  currentAmount: string | null;
  changeType: ChangeType;
  status: TamperStatus;
  timestamp: Date;
}

export interface TamperLogFilters {
  userId?: string | undefined;
  userRole?: string | undefined;
  changeType?: string | undefined;
  status?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  recordId?: string | undefined;
  limit?: number | undefined;
}

export type CreateTamperLogInput = {
  recordId: string;
  bidId?: string | null;
  tenderId?: string | null;
  vendorName?: string | null;
  vendorId?: string | null;
  userId?: string | null;
  userName: string;
  userRole: string;
  fieldName: string;
  oldValue?: string | null;
  newValue?: string | null;
  trustedHash?: string | null;
  currentHash?: string | null;
  originalAmount?: string | null;
  currentAmount?: string | null;
  changeType: ChangeType;
  status: TamperStatus;
};

function toEntry(row: Record<string, unknown>): TamperLogEntry {
  return {
    id: row['id'] as string,
    recordId: row['record_id'] as string,
    bidId: (row['bid_id'] as string | null) ?? null,
    tenderId: (row['tender_id'] as string | null) ?? null,
    vendorName: (row['vendor_name'] as string | null) ?? null,
    vendorId: (row['vendor_id'] as string | null) ?? null,
    userId: (row['user_id'] as string | null) ?? null,
    userName: row['user_name'] as string,
    userRole: row['user_role'] as string,
    fieldName: row['field_name'] as string,
    oldValue: (row['old_value'] as string | null) ?? null,
    newValue: (row['new_value'] as string | null) ?? null,
    trustedHash: (row['trusted_hash'] as string | null) ?? null,
    currentHash: (row['current_hash'] as string | null) ?? null,
    originalAmount:
      (row['original_amount'] as string | null) ?? null,
    currentAmount:
      (row['current_amount'] as string | null) ?? null,
    changeType: row['change_type'] as ChangeType,
    status: row['status'] as TamperStatus,
    timestamp: row['timestamp'] as Date,
  };
}

export const tamperLogRepository = {
  async create(
    data: CreateTamperLogInput,
  ): Promise<TamperLogEntry> {
    const { rows } = await pool.query(
      `INSERT INTO tamper_logs
        (
          id,
          record_id,
          bid_id,
          tender_id,
          vendor_name,
          vendor_id,
          user_id,
          user_name,
          user_role,
          field_name,
          old_value,
          new_value,
          trusted_hash,
          current_hash,
          original_amount,
          current_amount,
          change_type,
          status
        )
       VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,
         $10,$11,$12,$13,$14,$15,$16,$17,$18
       )
       RETURNING *`,
      [
        randomUUID(),
        data.recordId,
        data.bidId ?? null,
        data.tenderId ?? null,
        data.vendorName ?? null,
        data.vendorId ?? null,
        data.userId ?? null,
        data.userName,
        data.userRole,
        data.fieldName,
        data.oldValue ?? null,
        data.newValue ?? null,
        data.trustedHash ?? null,
        data.currentHash ?? null,
        data.originalAmount ?? null,
        data.currentAmount ?? null,
        data.changeType,
        data.status,
      ],
    );

    return toEntry(rows[0]!);
  },

  async findExistingMismatch(
    recordId: string,
    hash: string,
  ): Promise<TamperLogEntry | null> {
    const { rows } = await pool.query(
      `SELECT *
       FROM tamper_logs
       WHERE record_id = $1
         AND (
           trusted_hash = $2
           OR current_hash = $2
           OR new_value = $2
           OR old_value = $2
         )
         AND change_type IN (
           'HASH_MISMATCH',
           'BLOCKCHAIN_MISMATCH'
         )
       ORDER BY timestamp DESC
       LIMIT 1`,
      [recordId, hash],
    );

    return rows.length > 0
      ? toEntry(rows[0]!)
      : null;
  },

  async findAll(
    filters: TamperLogFilters = {},
  ): Promise<TamperLogEntry[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (filters.userId) {
      conditions.push(`user_id = $${i++}`);
      values.push(filters.userId);
    }

    if (filters.userRole) {
      conditions.push(`user_role = $${i++}`);
      values.push(filters.userRole);
    }

    if (filters.changeType) {
      conditions.push(`change_type = $${i++}`);
      values.push(filters.changeType);
    }

    if (filters.status) {
      conditions.push(`status = $${i++}`);
      values.push(filters.status);
    }

    if (filters.recordId) {
      conditions.push(`record_id = $${i++}`);
      values.push(filters.recordId);
    }

    if (filters.dateFrom) {
      conditions.push(`timestamp >= $${i++}`);
      values.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      conditions.push(`timestamp <= $${i++}`);
      values.push(filters.dateTo);
    }

    const where =
      conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

    const limit = filters.limit ?? 500;

    const { rows } = await pool.query(
      `SELECT *
       FROM tamper_logs
       ${where}
       ORDER BY timestamp DESC
       LIMIT $${i}`,
      [...values, limit],
    );

    return rows.map(toEntry);
  },

  async count(): Promise<number> {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM tamper_logs`,
    );

    return Number(rows[0]?.['cnt'] ?? 0);
  },

  async countByStatus(
    status: TamperStatus,
  ): Promise<number> {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM tamper_logs
       WHERE status = $1`,
      [status],
    );

    return Number(rows[0]?.['cnt'] ?? 0);
  },

  async findLatest(): Promise<TamperLogEntry | null> {
    const { rows } = await pool.query(
      `SELECT *
       FROM tamper_logs
       ORDER BY timestamp DESC
       LIMIT 1`,
    );

    return rows.length > 0
      ? toEntry(rows[0]!)
      : null;
  },
};