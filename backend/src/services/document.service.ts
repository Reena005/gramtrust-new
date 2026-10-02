import { documentFabricGateway } from '@/services/document-fabric.gateway.js';
import { pool } from '@/config/db';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { AppError } from '@/utils/app-error';
import { tamperLogService } from '@/services/tamper-log.service';

type DocumentRow = {
  id: string;
  document_name: string;
  document_type: string;
  file_path: string | null;
  sha256_hash: string | null;
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

/**
 * Calculate SHA-256 of the actual document file.
 */
function calculateFileHash(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);

  return crypto
    .createHash('sha256')
    .update(fileBuffer)
    .digest('hex');
}

/**
 * Create the trusted integrity hash.
 *
 * The integrity hash protects:
 *
 * - document ID
 * - document name
 * - document type
 * - file path
 * - actual PDF SHA-256
 * - source dataset
 * - amount
 *
 * The result is stored in blockchain_hash.
 */
function calculateDocumentIntegrityHash(
  document: DocumentRow,
  pdfHash: string,
): string {
  const payload = [
    document.id,
    document.document_name,
    document.document_type,
    document.file_path ?? '',
    pdfHash,
    document.source_dataset ?? '',
    document.amount ?? '',
  ]
    .map((value) => String(value))
    .join('|');

  return crypto
    .createHash('sha256')
    .update(payload)
    .digest('hex');
}

const documentSelect = `
  id,
  document_name,
  document_type,
  file_path,
  sha256_hash,
  source_dataset,
  verification_status,
  is_tampered,
  uploaded_by,
  created_at,
  verified_at,
  amount,
  blockchain_hash,
  blockchain_tx_id,
  blockchain_status
`;

/**
 * Check the integrity of ONE anchored document.
 *
 * This is request-triggered.
 *
 * It is called when:
 *
 *     GET /api/documents
 *     GET /api/documents/:id
 *
 * Therefore there is NO background monitor
 * and NO setInterval().
 *
 * Returns true when tampering is detected.
 */
async function checkDocumentIntegrity(
  document: DocumentRow,
): Promise<boolean> {
  /**
   * Only anchored documents have a trusted
   * blockchain_hash to compare against.
   */
  if (!document.blockchain_hash) {
    return false;
  }

  /**
   * A missing file path means the document
   * cannot match the trusted record.
   */
  if (!document.file_path) {
    const wasAlreadyTampered =
      document.blockchain_status === 'TAMPERED';

    await pool.query(
      `
      UPDATE document_records
      SET verification_status = 'MISSING',
          is_tampered = true,
          blockchain_status = 'MISSING',
          verified_at = NOW()
      WHERE id = $1
      `,
      [document.id],
    );

    /**
     * Create a tamper log only the first time
     * the problem is detected.
     */
    if (!wasAlreadyTampered) {
      await tamperLogService.logDocumentMismatch(
        document.id,
        document.blockchain_hash,
        'MISSING_FILE_PATH',
      );
    }

    return true;
  }

  /**
   * Resolve the actual document file.
   *
   * Backend runs from:
   *
   *     backend/
   *
   * Example:
   *
   *     documents/DOC106.pdf
   *
   * becomes:
   *
   *     backend/documents/DOC106.pdf
   */
  const filePath = path.resolve(
    process.cwd(),
    document.file_path,
  );

  /**
   * Check whether the actual PDF exists.
   */
  if (!fs.existsSync(filePath)) {
    const wasAlreadyTampered =
      document.blockchain_status === 'TAMPERED' ||
      document.blockchain_status === 'MISSING';

    await pool.query(
      `
      UPDATE document_records
      SET verification_status = 'MISSING',
          is_tampered = true,
          blockchain_status = 'MISSING',
          verified_at = NOW()
      WHERE id = $1
      `,
      [document.id],
    );

    /**
     * Avoid duplicate logs on every page refresh.
     */
    if (!wasAlreadyTampered) {
      await tamperLogService.logDocumentMismatch(
        document.id,
        document.blockchain_hash,
        'MISSING_FILE',
      );
    }

    return true;
  }

  /**
   * Calculate SHA-256 of the CURRENT PDF.
   */
  const currentPdfHash = calculateFileHash(filePath);

  /**
   * Calculate the CURRENT complete integrity hash.
   *
   * This includes both:
   *
   *     PDF contents
   *
   * and
   *
   *     database metadata
   *
   * Therefore changing document_name,
   * document_type, file_path, source_dataset,
   * amount, or the PDF itself will produce
   * a different hash.
   */
  const currentIntegrityHash =
    calculateDocumentIntegrityHash(
      document,
      currentPdfHash,
    );

  const trustedHash =
    document.blockchain_hash.toLowerCase();

  const currentHash =
    currentIntegrityHash.toLowerCase();

  /**
   * Everything is unchanged.
   */
  if (currentHash === trustedHash) {
    return false;
  }

  /**
   * TAMPERING DETECTED.
   */
  const wasAlreadyTampered =
    document.blockchain_status === 'TAMPERED';

  await pool.query(
    `
    UPDATE document_records
    SET verification_status = 'TAMPERED',
        is_tampered = true,
        blockchain_status = 'TAMPERED',
        verified_at = NOW()
    WHERE id = $1
    `,
    [document.id],
  );

  /**
   * Create only ONE tamper log for the transition
   * into the TAMPERED state.
   *
   * This prevents duplicate logs every time
   * the Documents page is refreshed.
   */
  if (!wasAlreadyTampered) {
    await tamperLogService.logDocumentMismatch(
      document.id,
      trustedHash,
      currentIntegrityHash,
    );
  }

  return true;
}

export const documentService = {
  /**
   * Get all documents.
   *
   * IMPORTANT:
   * Integrity is checked here automatically.
   *
   * No background polling is required.
   */
  async getAll() {
    const result = await pool.query(`
      SELECT ${documentSelect}
      FROM document_records
      ORDER BY created_at DESC
    `);

    const documents =
      result.rows as DocumentRow[];

    /**
     * Check every anchored document whenever
     * the Documents API is requested.
     */
    for (const document of documents) {
      await checkDocumentIntegrity(document);
    }

    /**
     * Re-read the documents after integrity checks
     * so the frontend receives the UPDATED status.
     *
     * For example:
     *
     * VERIFIED → TAMPERED
     */
    const updatedResult = await pool.query(`
      SELECT ${documentSelect}
      FROM document_records
      ORDER BY created_at DESC
    `);

    return updatedResult.rows;
  },

  /**
   * Get one document.
   *
   * Integrity is also checked automatically here.
   */
  async getById(id: string) {
    const result = await pool.query(
      `
      SELECT ${documentSelect}
      FROM document_records
      WHERE id = $1
      `,
      [id],
    );

    if (result.rows.length === 0) {
      throw new AppError(
        `Document ${id} not found`,
        404,
      );
    }

    const document =
      result.rows[0] as DocumentRow;

    /**
     * Automatically check integrity when
     * a specific document is requested.
     */
    await checkDocumentIntegrity(document);

    /**
     * Re-read the document so the caller receives
     * the updated TAMPERED/MISSING state.
     */
    const updatedResult = await pool.query(
      `
      SELECT ${documentSelect}
      FROM document_records
      WHERE id = $1
      `,
      [id],
    );

    return updatedResult.rows[0];
  },

  /**
   * Manually verify one document.
   *
   * This still works when the user explicitly
   * presses Verify.
   */
  async verify(id: string) {
    /**
     * Read the document directly instead of using
     * getById() so the manual verification logic
     * remains explicit.
     */
    const result = await pool.query(
      `
      SELECT ${documentSelect}
      FROM document_records
      WHERE id = $1
      `,
      [id],
    );

    if (result.rows.length === 0) {
      throw new AppError(
        `Document ${id} not found`,
        404,
      );
    }

    const document =
      result.rows[0] as DocumentRow;

    if (!document.file_path) {
      throw new AppError(
        `File path missing for ${id}`,
        404,
      );
    }

    /**
     * Resolve actual PDF.
     */
    const filePath = path.resolve(
      process.cwd(),
      document.file_path,
    );

    /**
     * File does not exist.
     */
    if (!fs.existsSync(filePath)) {
      await pool.query(
        `
        UPDATE document_records
        SET verification_status = 'MISSING',
            is_tampered = true,
            blockchain_status = 'MISSING',
            verified_at = NOW()
        WHERE id = $1
        `,
        [id],
      );

      return {
        id,
        status: 'MISSING',
        isTampered: true,
      };
    }

    /**
     * Calculate SHA-256 of CURRENT PDF.
     */
    const currentPdfHash =
      calculateFileHash(filePath);

    /**
     * Anchored document:
     *
     * compare complete integrity hash.
     */
    if (document.blockchain_hash) {
      const currentIntegrityHash =
        calculateDocumentIntegrityHash(
          document,
          currentPdfHash,
        );

      const trustedHash =
        document.blockchain_hash.toLowerCase();

      const verified =
        currentIntegrityHash.toLowerCase() ===
        trustedHash;

      await pool.query(
        `
        UPDATE document_records
        SET verification_status = $1,
            is_tampered = $2,
            blockchain_status = $3,
            verified_at = NOW()
        WHERE id = $4
        `,
        [
          verified
            ? 'VERIFIED'
            : 'TAMPERED',

          !verified,

          verified
            ? 'VERIFIED'
            : 'TAMPERED',

          id,
        ],
      );

      /**
       * Create tamper log only when entering
       * the TAMPERED state.
       */
      if (
        !verified &&
        document.blockchain_status !== 'TAMPERED'
      ) {
        await tamperLogService.logDocumentMismatch(
          id,
          trustedHash,
          currentIntegrityHash,
        );
      }

      return {
        id,
        storedHash: trustedHash,
        currentHash: currentIntegrityHash,
        pdfHash: currentPdfHash,
        status: verified
          ? 'VERIFIED'
          : 'TAMPERED',
        isTampered: !verified,
      };
    }

    /**
     * Unanchored document.
     *
     * Compare the current PDF against
     * the imported sha256_hash if available.
     */
    const storedPdfHash =
      document.sha256_hash?.toLowerCase() ?? '';

    /**
     * No stored PDF hash.
     *
     * The document remains PENDING.
     */
    if (!storedPdfHash) {
      return {
        id,
        currentHash: currentPdfHash,
        status: 'PENDING',
        isTampered: false,
      };
    }

    const verified =
      currentPdfHash.toLowerCase() ===
      storedPdfHash;

    await pool.query(
      `
      UPDATE document_records
      SET verification_status = $1,
          is_tampered = $2,
          verified_at = NOW()
      WHERE id = $3
      `,
      [
        verified
          ? 'VERIFIED'
          : 'TAMPERED',

        !verified,

        id,
      ],
    );

    return {
      id,
      storedHash: storedPdfHash,
      currentHash: currentPdfHash,
      status: verified
        ? 'VERIFIED'
        : 'TAMPERED',
      isTampered: !verified,
    };
  },

  /**
   * Anchor a document.
   *
   * IMPORTANT:
   * The hash is calculated from the ACTUAL PDF
   * and the current document metadata.
   *
   * The combined integrity hash is stored in
   * blockchain_hash.
   */
  async anchor(id: string) {
    const result = await pool.query(
      `
      SELECT ${documentSelect}
      FROM document_records
      WHERE id = $1
      `,
      [id],
    );

    if (result.rows.length === 0) {
      throw new AppError(`Document ${id} not found`, 404);
    }

    const document = result.rows[0] as DocumentRow;

    if (!document.file_path) {
      throw new AppError(`File path missing for ${id}`, 404);
    }

    const filePath = path.resolve(
      process.cwd(),
      document.file_path,
    );

    if (!fs.existsSync(filePath)) {
      throw new AppError(
        `Document file not found: ${document.file_path}`,
        404,
      );
    }

    const pdfHash = calculateFileHash(filePath);

    const integrityHash =
      calculateDocumentIntegrityHash(
        document,
        pdfHash,
      );

    let txId =
      `LOCAL-DOC-${id}-${integrityHash.slice(0, 16)}`;

    if (documentFabricGateway.enabled) {
      const fabricResult =
        await documentFabricGateway.anchorDocument({
          documentId: document.id,
          sha256Hash: integrityHash,
          timestamp: new Date().toISOString(),
          metadata: {
            documentName: document.document_name,
            documentType: document.document_type,
            filePath: document.file_path,
            sourceDataset: document.source_dataset,
            amount: document.amount,
            pdfHash,
          },
        });

      txId = fabricResult.txId ?? txId;
    }

    const updatedResult =
      await pool.query(
        `
        UPDATE document_records
        SET sha256_hash = $1,
            blockchain_hash = $2,
            blockchain_tx_id = $3,
            blockchain_status = 'VERIFIED',
            verification_status = 'VERIFIED',
            is_tampered = false,
            verified_at = NOW()
        WHERE id = $4
        RETURNING ${documentSelect}
        `,
        [
          pdfHash,
          integrityHash,
          txId,
          id,
        ],
      );

    return updatedResult.rows[0];
  },
};




