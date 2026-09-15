import { tamperLogRepository, type TamperLogFilters } from '@/repositories/tamper-log.repository';
import type { JwtPayload } from '@/services/auth.service';

export const tamperLogService = {
  /**
   * Called when an authenticated, authorized user changes a financial field.
   */
  async logAuthorizedChange(
    user: JwtPayload,
    recordId: string,
    fieldName: string,
    oldValue: string | number | null,
    newValue: string | number | null,
  ) {
    return tamperLogRepository.create({
      recordId,
      userId: user.sub,
      userName: user.name,
      userRole: user.role,
      fieldName,
      oldValue: oldValue !== null ? String(oldValue) : null,
      newValue: newValue !== null ? String(newValue) : null,
      changeType: 'UPDATE',
      status: 'AUTHORIZED',
    });
  },

  /**
   * Called when an unauthorized user attempts to modify a financial record.
   * The modification is rejected BEFORE this is called. No record is changed.
   */
  async logUnauthorizedAttempt(
    user: JwtPayload,
    recordId: string,
    fieldName: string,
    attemptedValue: string | number | null,
  ) {
    return tamperLogRepository.create({
      recordId,
      userId: user.sub,
      userName: user.name,
      userRole: user.role,
      fieldName,
      oldValue: null,
      newValue: attemptedValue !== null ? String(attemptedValue) : null,
      changeType: 'UNAUTHORIZED_UPDATE',
      status: 'BLOCKED',
    });
  },

  /**
   * Called by the background blockchain monitor when PostgreSQL != blockchain
   * but no application user performed the change (direct DB access detected).
   */
  async logDirectDbChange(
    recordId: string,
    fieldName: string,
    dbValue: number,
    blockchainValue: number,
  ) {
    return tamperLogRepository.create({
      recordId,
      userId: null,
      userName: 'Unknown / Direct Database Access',
      userRole: 'UNKNOWN',
      fieldName,
      oldValue: String(blockchainValue),
      newValue: String(dbValue),
      changeType: 'DIRECT_DATABASE_CHANGE',
      status: 'DETECTED',
    });
  },

  /**
   * Called when blockchain verification explicitly detects a mismatch.
   */
  async logBlockchainMismatch(
    recordId: string,
    dbAmount: number,
    blockchainAmount: number,
  ) {
    return tamperLogRepository.create({
      recordId,
      userId: null,
      userName: 'Blockchain Integrity Monitor',
      userRole: 'SYSTEM',
      fieldName: 'amount',
      oldValue: String(blockchainAmount),
      newValue: String(dbAmount),
      changeType: 'BLOCKCHAIN_MISMATCH',
      status: 'DETECTED',
    });
  },
  /**
   * Called when document integrity verification detects a hash mismatch.
   */
  async logDocumentMismatch(
    recordId: string,
    expectedHash: string,
    currentHash: string,
  ) {
    return tamperLogRepository.create({
      recordId,
      userId: null,
      userName: 'Blockchain Integrity Monitor',
      userRole: 'SYSTEM',
      fieldName: 'document_integrity',
      oldValue: expectedHash,
      newValue: currentHash,
      changeType: 'BLOCKCHAIN_MISMATCH',
      status: 'DETECTED',
    });
  },
  async getLogs(filters: TamperLogFilters) {
    return tamperLogRepository.findAll(filters);
  },

  async getCount() {
    return tamperLogRepository.count();
  },
};
