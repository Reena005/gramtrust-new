import { randomUUID } from 'node:crypto';
import { pool } from '@/config/db.js';

export type ComplaintPriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type ComplaintStatus =
  | 'Open'
  | 'UnderInvestigation'
  | 'Resolved'
  | 'Closed'
  | 'Rejected';

export interface Complaint {
  id: string;
  display_id: string;
  project_id: string | null;
  project_code: string | null;
  filed_by: string | null;
  assigned_to: string | null;
  title: string;
  description: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  resolution_notes: string | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateComplaintInput {
  projectId: string;
  filedBy: string;
  title: string;
  description: string;
  priority: ComplaintPriority;
}

export const complaintRepository = {
  async projectExists(projectId: string): Promise<boolean> {
    const { rows } = await pool.query(
      'SELECT id FROM projects WHERE id = $1 LIMIT 1',
      [projectId],
    );
    return rows.length > 0;
  },

  async create(input: CreateComplaintInput): Promise<Complaint> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO complaints
        (id, project_id, filed_by, assigned_to, title, description, priority,
         status, resolution_notes, resolved_at, created_at, updated_at)
       VALUES ($1, $2, $3, NULL, $4, $5, $6, 'Open', NULL, NULL, NOW(), NOW())
       RETURNING *`,
      [
        randomUUID(),
        input.projectId,
        input.filedBy,
        input.title,
        input.description,
        input.priority,
      ],
    );
    const complaint = await this.findById(rows[0]!.id);
    if (!complaint) {
      throw new Error('Created complaint could not be retrieved.');
    }
    return complaint;
  },

  async findAll(): Promise<Complaint[]> {
    const { rows } = await pool.query<Complaint>(
      `WITH numbered_complaints AS (
         SELECT c.*,
                'C' || LPAD(
                  ROW_NUMBER() OVER (ORDER BY c.created_at ASC, c.id ASC)::text,
                  3,
                  '0'
                ) AS display_id
         FROM complaints c
       )
       SELECT c.*, p.code AS project_code
       FROM numbered_complaints c
       LEFT JOIN projects p ON p.id = c.project_id
       ORDER BY c.created_at DESC`,
    );
    return rows;
  },

  async findByCitizen(citizenId: string): Promise<Complaint[]> {
    const { rows } = await pool.query<Complaint>(
      `WITH numbered_complaints AS (
         SELECT c.*,
                'C' || LPAD(
                  ROW_NUMBER() OVER (ORDER BY c.created_at ASC, c.id ASC)::text,
                  3,
                  '0'
                ) AS display_id
         FROM complaints c
       )
       SELECT c.*, p.code AS project_code
       FROM numbered_complaints c
       LEFT JOIN projects p ON p.id = c.project_id
       WHERE c.filed_by = $1
       ORDER BY c.created_at DESC`,
      [citizenId],
    );
    return rows;
  },

  async findById(id: string): Promise<Complaint | null> {
    const { rows } = await pool.query<Complaint>(
      `WITH numbered_complaints AS (
         SELECT c.*,
                'C' || LPAD(
                  ROW_NUMBER() OVER (ORDER BY c.created_at ASC, c.id ASC)::text,
                  3,
                  '0'
                ) AS display_id
         FROM complaints c
       )
       SELECT c.*, p.code AS project_code
       FROM numbered_complaints c
       LEFT JOIN projects p ON p.id = c.project_id
       WHERE c.id = $1
       LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  },

  async updateStatus(
    id: string,
    status: ComplaintStatus,
    resolutionNotes: string | undefined,
  ): Promise<Complaint | null> {
    const { rows } = await pool.query<{ id: string }>(
      `UPDATE complaints
       SET status = $1::"ComplaintStatus",
           resolution_notes = $2,
           resolved_at = CASE
             WHEN $1::"ComplaintStatus" IN ('Resolved', 'Closed') THEN NOW()
             ELSE NULL
           END,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, resolutionNotes, id],
    );
    return rows[0] ? this.findById(rows[0].id) : null;
  },
};
