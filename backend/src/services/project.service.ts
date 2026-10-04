import { AppError } from '@/utils/app-error';
import { createLedgerHash } from '@/utils/ledger-hash';
import { auditRepository } from '@/repositories/audit.repository';
import { blockchainRepository } from '@/repositories/blockchain.repository';
import { projectRepository } from '@/repositories/project.repository';
import type { ProjectInput, ProjectRecord } from '@/types/ledger';
import { fabricGateway } from '@/services/fabric.gateway';
import { tamperLogService } from '@/services/tamper-log.service';
import type { JwtPayload } from '@/services/auth.service';


// Maps backend ProjectRecord → frontend LedgerProject shape
export function toClientProject(
  project: ProjectRecord,
  blockchainAmount?: number,
): Record<string, unknown> {
  const bcAmount = blockchainAmount ?? 0;
  return {
    id: project.code,          // frontend uses code as primary key for routes
    databaseId: project.id,
    code: project.code,
    name: project.name,
    district: project.district,
    state: project.state,
    financialYear: project.financialYear,
    amount: project.amount,
    blockchainAmount: bcAmount,
    status: project.status,
    blockchainStatus: project.blockchainStatus,
    integrityStatus: project.integrityStatus,
    blockchainHash: project.blockchainHash ?? '',
    remarks: '',
    lastUpdatedAt: project.updatedAt instanceof Date
      ? project.updatedAt.toISOString()
      : String(project.updatedAt),
  };
}

function buildLedgerHash(project: ProjectRecord, action: string) {
  return createLedgerHash(`${project.code}|${project.amount}|${project.status}|${action}`);
}

export const projectService = {
  async list() {
    const projects = await projectRepository.findAll();
    // Fetch latest blockchain amount for all in one pass
    const enriched = await Promise.all(
      projects.map(async (p) => {
        const rec = await blockchainRepository.findLatestByProjectId(p.id);
        return toClientProject(p, rec?.amount);
      }),
    );
    return enriched;
  },

  async getByCode(code: string) {
    const project = await projectRepository.findByCode(code);
    if (!project) throw new AppError(`Project ${code} not found`, 404);
    const rec = await blockchainRepository.findLatestByProjectId(project.id);
    return toClientProject(project, rec?.amount);
  },

  async create(input: ProjectInput) {
    const project = await projectRepository.create(input);
    const hash = createLedgerHash(
      `${buildLedgerHash(project, 'CREATE')}|${Date.now()}|${Math.random().toString(16).slice(2, 10)}`,
    );
    await blockchainRepository.create({
      projectId: project.id,
      action: 'CREATE',
      amount: project.amount,
      payload: { ...project, hash },
      txHash: hash,
    });
    if (fabricGateway.enabled) {
      await fabricGateway.store({
        projectCode: project.code,
        action: 'CREATE',
        amount: Number(project.amount),
        hash,
        timestamp: new Date().toISOString(),
      });
    }
    await auditRepository.create({
      projectId: project.id,
      databaseAmount: project.amount,
      blockchainAmount: project.amount,
      difference: 0,
      status: 'Verified',
      notes: { action: 'CREATE' },
    });
    return toClientProject(project, project.amount);
  },

  async update(
    code: string,
    input: Partial<ProjectInput>,
    actingUser?: JwtPayload,
  ) {
    const existing = await projectRepository.findByCode(code);
    if (!existing) throw new AppError(`Project ${code} not found`, 404);

    const updated = await projectRepository.update(code, input);
    const hash = createLedgerHash(
      `${buildLedgerHash(updated, 'UPDATE')}|${Date.now()}|${Math.random().toString(16).slice(2, 10)}`,
    );
    await blockchainRepository.create({
      projectId: updated.id,
      action: 'UPDATE',
      amount: updated.amount,
      payload: { ...updated, hash },
      txHash: hash,
    });
    if (fabricGateway.enabled) {
      await fabricGateway.store({
        projectCode: updated.code,
        action: 'UPDATE',
        amount: Number(updated.amount),
        hash,
        timestamp: new Date().toISOString(),
      });
    }

    // ── Tamper log: one entry per changed field ──────────────────────────────
    if (actingUser) {
      const trackable: Array<{ field: string; old: unknown; next: unknown }> = [
        { field: 'amount',        old: existing.amount,        next: input.amount },
        { field: 'name',          old: existing.name,          next: input.name },
        { field: 'status',        old: existing.status,        next: input.status },
        { field: 'district',      old: existing.district,      next: input.district },
        { field: 'state',         old: existing.state,         next: input.state },
        { field: 'financialYear', old: existing.financialYear, next: input.financialYear },
      ];
      for (const t of trackable) {
        if (t.next !== undefined && String(t.next) !== String(t.old)) {
          await tamperLogService.logAuthorizedChange(
            actingUser,
            code,
            t.field,
            t.old as string | number,
            t.next as string | number,
          );
        }
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    const rec = await blockchainRepository.findLatestByProjectId(existing.id);
    return toClientProject(updated, rec?.amount);
  },

  async remove(code: string) {
    const existing = await projectRepository.findByCode(code);
    if (!existing) throw new AppError(`Project ${code} not found`, 404);
    await projectRepository.delete(code);
    await auditRepository.create({
      projectId: null,
      databaseAmount: existing.amount,
      blockchainAmount: existing.amount,
      difference: 0,
      status: 'Verified',
      notes: { action: 'DELETE', code },
    });
  },

  async verify(code: string) {
    const project = await projectRepository.findByCode(code);
    if (!project) throw new AppError(`Project ${code} not found`, 404);
    const latestRecord = await blockchainRepository.findLatestByProjectId(project.id);
    let blockchainAmount = latestRecord ? latestRecord.amount : 0;
    
    if (fabricGateway.enabled) {
      const fabricRecords = await fabricGateway.history(project.code);
      const latestFabricRecord = fabricRecords.at(-1);
      if (latestFabricRecord) {
        blockchainAmount = Number(latestFabricRecord.amount);
      }
    }

    const difference = project.amount - blockchainAmount;
    const integrityStatus = difference === 0 ? 'Verified' : 'Mismatch';
    
    // Persist integrity status back to the projects table
    await projectRepository.updateBlockchainFields(project.code, {
      integrityStatus,
    });

    // Log blockchain mismatch to tamper_logs
    if (integrityStatus === 'Mismatch') {
      await tamperLogService.logBlockchainMismatch(code, project.amount, blockchainAmount);
    }

    await auditRepository.create({
      projectId: project.id,
      databaseAmount: project.amount,
      blockchainAmount,
      difference,
      status: integrityStatus,
      notes: { action: 'VERIFY' },
    });
    return {
      ...toClientProject({ ...project, integrityStatus }, blockchainAmount),
      difference,
      integrityStatus,
    };
  },
};
