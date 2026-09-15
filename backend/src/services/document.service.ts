import { pool } from '@/config/db.js';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { AppError } from '@/utils/app-error.js';
import { createLedgerHash } from '@/utils/ledger-hash.js';
import { fabricGateway } from '@/services/fabric.gateway.js';
import { tamperLogService } from '@/services/tamper-log.service.js';

type DocumentRow = {
  id: string;
  document_name: string;
  document_type: string;
  file_path: string | null;
  sha256_hash: string;
  source_dataset: string | null;
  verification_status: string | null;
  is_tampered: boolean | null;
  uploaded_by: string | null;
  created_at: Date | null;
  verified_at: Date | null;
  amount: number | null;
  blockchain_hash: string | null;
  blockchain_tx_id: string | null;
  blockchain_status: string | null;
};

function canonicalDocument(row: DocumentRow) {
  return [
    row.id,
    row.document_name,
    row.document_type,
    row.file_path ?? '',
    row.sha256_hash,
    row.source_dataset ?? '',
    row.amount ?? '',
  ].map((value) => String(value)).join('|');
}

function documentHash(row: DocumentRow) {
  return createLedgerHash(canonicalDocument(row));
}

const documentSelect = `
  id, document_name, document_type, file_path, sha256_hash,
  source_dataset, verification_status, is_tampered, uploaded_by,
  created_at, verified_at, amount, blockchain_hash, blockchain_tx_id,
  blockchain_status
`;

export const documentService = {
  async getAll() {
    const result = await pool.query(`
      SELECT ${documentSelect} FROM document_records
      ORDER BY created_at DESC
    `);

    return result.rows;
  },

  async getById(id: string) {
    const result = await pool.query(
      `
      SELECT ${documentSelect} FROM document_records
      WHERE id = $1
      `,
      [id],
    );

    if (result.rows.length === 0) {
      throw new AppError(`Document ${id} not found`, 404);
    }

    return result.rows[0];
  },

  async verify(id: string) {
    const document = await this.getById(id);

    if (document.blockchain_hash) {
      const currentHash = documentHash(document as DocumentRow);
      const verified = currentHash === document.blockchain_hash;

      await pool.query(
        `UPDATE document_records
         SET verification_status=$1, is_tampered=$2, blockchain_status=$3, verified_at=NOW()
         WHERE id=$4`,
        [verified ? 'VERIFIED' : 'TAMPERED', !verified, verified ? 'VERIFIED' : 'TAMPERED', id],
      );

      if (!verified && document.blockchain_status !== 'TAMPERED') {
        await tamperLogService.logDocumentMismatch(id, document.blockchain_hash, currentHash);
      }

      return {
        id,
        storedHash: document.blockchain_hash,
        currentHash,
        status: verified ? 'VERIFIED' : 'TAMPERED',
        isTampered: !verified,
      };
    }

    if (!document.file_path) {
      throw new AppError(`File path missing for ${id}`, 404);
    }

    // PDFs are stored in:
    // backend/documents/DOC001.pdf
    // backend/documents/DOC002.pdf
    // etc.
    //
    // process.cwd() = backend
    // Therefore we must NOT use '..' here.
    const filePath = path.resolve(
      process.cwd(),
      document.file_path,
    );

    if (!fs.existsSync(filePath)) {
      await pool.query(
        `
        UPDATE document_records
        SET verification_status = $1,
            is_tampered = $2,
            verified_at = NOW()
        WHERE id = $3
        `,
        ['MISSING', true, id],
      );

      return {
        id,
        status: 'MISSING',
        isTampered: true,
      };
    }

    const fileBuffer = fs.readFileSync(filePath);

    const currentHash = crypto
      .createHash('sha256')
      .update(fileBuffer)
      .digest('hex');

    const storedHash = document.sha256_hash?.toLowerCase();
    const verified = currentHash === storedHash;

    await pool.query(
      `
      UPDATE document_records
      SET verification_status = $1,
          is_tampered = $2,
          verified_at = NOW()
      WHERE id = $3
      `,
      [verified ? 'VERIFIED' : 'TAMPERED', !verified, id],
    );

    return {
      id,
      storedHash,
      currentHash,
      status: verified ? 'VERIFIED' : 'TAMPERED',
      isTampered: !verified,
    };
  },

  async anchor(id: string) {
    const document = await this.getById(id) as DocumentRow;
    const hash = documentHash(document);
    let txId = `local-document-${id}-${hash.slice(0, 16)}`;

    if (fabricGateway.enabled) {
      const result = await fabricGateway.store({
        projectCode: id,
        action: 'STORE',
        amount: Number(document.amount ?? 0),
        hash,
        timestamp: new Date().toISOString(),
      });
      txId = result.txId;
    }

    const result = await pool.query(
      `UPDATE document_records
       SET blockchain_hash=$1, blockchain_tx_id=$2, blockchain_status='RECORDED',
           verification_status='RECORDED', is_tampered=false
       WHERE id=$3
       RETURNING ${documentSelect}`,
      [hash, txId, id],
    );

    return result.rows[0];
  },

  async monitorIntegrity() {
    const result = await pool.query(`SELECT ${documentSelect} FROM document_records WHERE blockchain_hash IS NOT NULL`);
    const tampered: Array<{ code: string; name: string; dbHash: string; blockchainHash: string }> = [];

    for (const row of result.rows as DocumentRow[]) {
      const currentHash = documentHash(row);
      if (currentHash === row.blockchain_hash) {
        continue;
      }

      tampered.push({ code: row.id, name: row.document_name, dbHash: currentHash, blockchainHash: row.blockchain_hash! });
      await pool.query(
        `UPDATE document_records SET verification_status='TAMPERED', is_tampered=true, blockchain_status='TAMPERED', verified_at=NOW() WHERE id=$1`,
        [row.id],
      );
      if (row.blockchain_status !== 'TAMPERED') {
        await tamperLogService.logDocumentMismatch(row.id, row.blockchain_hash!, currentHash);
      }
    }

    return tampered;
  },
};