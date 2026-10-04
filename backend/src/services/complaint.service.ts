import type { JwtPayload } from '@/services/auth.service.js';
import {
  complaintRepository,
  type Complaint,
  type ComplaintPriority,
  type ComplaintStatus,
} from '@/repositories/complaint.repository.js';
import { notificationService } from '@/services/notification.service.js';
import { AppError } from '@/utils/app-error.js';
import type { CreateNotificationInput } from '@/validators/notification.validators.js';

export interface CreateComplaintInput {
  projectId: string;
  title: string;
  description: string;
  priority: ComplaintPriority;
}

function ensureComplaintReadRole(user: JwtPayload) {
  if (!['CITIZEN', 'OFFICIAL', 'ADMIN', 'AUDITOR'].includes(user.role)) {
    throw new AppError('Access denied.', 403);
  }
}

async function createComplaintNotification(
  complaint: Complaint,
  input: CreateNotificationInput,
): Promise<void> {
  try {
    await notificationService.create(input);
  } catch (error) {
    console.error(
      `Failed to create ${input.type} notification for complaint ${complaint.id}:`,
      error,
    );
  }
}

function getStatusNotification(status: ComplaintStatus, displayId: string) {
  switch (status) {
    case 'Resolved':
      return {
        type: 'COMPLAINT_RESOLVED' as const,
        title: 'Complaint Resolved',
        message: `Your complaint ${displayId} has been resolved.`,
      };
    case 'Closed':
      return {
        type: 'COMPLAINT_CLOSED' as const,
        title: 'Complaint Closed',
        message: `Your complaint ${displayId} has been closed.`,
      };
    case 'Rejected':
      return {
        type: 'COMPLAINT_REJECTED' as const,
        title: 'Complaint Rejected',
        message: `Your complaint ${displayId} has been rejected.`,
      };
    case 'UnderInvestigation':
      return {
        type: 'COMPLAINT_STATUS_UPDATED' as const,
        title: 'Complaint Status Updated',
        message: `Your complaint ${displayId} is now Under Investigation.`,
      };
    case 'Open':
      return {
        type: 'COMPLAINT_STATUS_UPDATED' as const,
        title: 'Complaint Status Updated',
        message: `Your complaint ${displayId} is now Open.`,
      };
  }
}

export const complaintService = {
  async create(user: JwtPayload, input: CreateComplaintInput): Promise<Complaint> {
    if (user.role !== 'CITIZEN') {
      throw new AppError('Only citizens can file complaints.', 403);
    }
    if (!(await complaintRepository.projectExists(input.projectId))) {
      throw new AppError('Project not found.', 404);
    }
    const complaint = await complaintRepository.create({
      ...input,
      filedBy: user.sub,
    });
    await createComplaintNotification(complaint, {
      recipientUserId: user.sub,
      type: 'COMPLAINT_SUBMITTED',
      title: 'Complaint Submitted',
      message: `Your complaint ${complaint.display_id} has been submitted successfully.`,
    });
    return complaint;
  },

  async list(user: JwtPayload): Promise<Complaint[]> {
    ensureComplaintReadRole(user);
    if (user.role === 'CITIZEN') {
      return complaintRepository.findByCitizen(user.sub);
    }
    return complaintRepository.findAll();
  },

  async getById(user: JwtPayload, id: string): Promise<Complaint> {
    ensureComplaintReadRole(user);
    const complaint = await complaintRepository.findById(id);
    if (!complaint) {
      throw new AppError('Complaint not found.', 404);
    }
    if (user.role === 'CITIZEN' && complaint.filed_by !== user.sub) {
      throw new AppError('You are not allowed to access this complaint.', 403);
    }
    return complaint;
  },

  async updateStatus(
    user: JwtPayload,
    id: string,
    status: ComplaintStatus,
    resolutionNotes: string | undefined,
  ): Promise<Complaint> {
    if (!['OFFICIAL', 'ADMIN'].includes(user.role)) {
      throw new AppError('You are not allowed to update complaint status.', 403);
    }
    const existing = await complaintRepository.findById(id);
    if (!existing) {
      throw new AppError('Complaint not found.', 404);
    }
    const updated = await complaintRepository.updateStatus(
      id,
      status,
      resolutionNotes,
    );
    if (!updated) {
      throw new AppError('Complaint not found.', 404);
    }
    if (existing.status !== updated.status) {
      if (updated.filed_by) {
        await createComplaintNotification(updated, {
          recipientUserId: updated.filed_by,
          ...getStatusNotification(updated.status, updated.display_id),
        });
      } else {
        console.warn(
          `Skipped status notification for complaint ${updated.id}: no filing citizen is recorded.`,
        );
      }
    }
    return updated;
  },
};
