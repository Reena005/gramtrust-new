import { z } from 'zod';

const statusValues = [
  'Pending',
  'In Progress',
  'Completed',
  'Under Review',
] as const;

export const projectCodeSchema = z.object({
  id: z.string().trim().min(2).max(64),
});

export const projectCreateSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(64),

  name: z.string().trim().min(3).max(200),

  district: z.string().trim().min(2).max(120),

  state: z.string().trim().min(2).max(120),

  financialYear: z.string().trim().min(4).max(12),

  amount: z.coerce.number().positive(),

  status: z.enum(statusValues),
});

export const projectUpdateSchema = projectCreateSchema.partial();