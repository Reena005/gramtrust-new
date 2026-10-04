import { z } from 'zod';

export const createComplaintSchema = z
  .object({
    projectId: z.string().trim().min(1),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1),
    priority: z.enum(['Low', 'Medium', 'High', 'Critical']),
  })
  .strict();

export const complaintIdSchema = z.object({
  id: z.string().trim().min(1),
});

export const updateComplaintStatusSchema = z
  .object({
    status: z.enum([
      'Open',
      'UnderInvestigation',
      'Resolved',
      'Closed',
      'Rejected',
    ]),
    resolutionNotes: z.string().trim().optional(),
  })
  .strict();
