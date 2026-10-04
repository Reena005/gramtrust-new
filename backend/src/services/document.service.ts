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
 * Find a renamed PDF for a document.
 *
 * Example:
 *
 * Expected:
 *     documents/DOC621.pdf
 *
 * Actual:
 *     documents/DOC621_test.pdf
 *
 * We only consider PDF files whose filename starts
 * with the document ID.
 *
 * This prevents an unrelated PDF from being treated
 * as the renamed version of this document.
 */
function findRenamedDocumentFile(
  filePath: string,
  documentId: string,
): string | null {
  const directory = path.dirname(filePath);
  const expectedFileName = path.basename(filePath);

  if (!fs.existsSync(directory)) {
    return null;
  }

  const files = fs.readdirSync(directory);

  const candidate = files.find((fileName) => {
    /**
     * Ignore the expected filename.
     */
    if (
      fileName.toLowerCase() ===
      expectedFileName.toLowerCase()
    ) {
      return false;
    }

    /**
     * Only consider PDF files.
     */
    if (
      path.extname(fileName).toLowerCase() !== '.pdf'
    ) {
      return false;
    }

    /**
     * Remove extension.
     */
    const baseName = path.basename(
      fileName,
      path.extname(fileName),
    );

    /**
     * Example accepted names:
     *
     * DOC621_test
     * DOC621_modified
     * DOC621_new
     *
     * Example rejected names:
     *
     * DOC620_test
     * RANDOM.pdf
     */
    return baseName
      .toLowerCase()
      .startsWith(documentId.toLowerCase());
  });

  if (!candidate) {
    return null;
  }

  return path.join(directory, candidate);
}

/**
 * Mark a document as tampered and create a tamper log.
 */
async function markDocumentTampered(
  document: DocumentRow,
  currentHash?: string,
): Promise<void> {
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
   * Create only one log when the document enters
   * the TAMPERED state.
   *
   * This prevents duplicate logs every time
   * GET /api/documents is called.
   */
  if (!wasAlreadyTampered) {
    await tamperLogService.logDocumentMismatch(
      document.id,
      document.blockchain_hash ?? '',
      currentHash ?? '',
    );
  }
}

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
        document.blockchain_hash ?? '',
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
   *     documents/DOC621.pdf
   *
   * becomes:
   *
   *     backend/documents/DOC621.pdf
   */
  const filePath = path.resolve(
    process.cwd(),
    document.file_path,
  );

  /**
   * Check whether the expected PDF exists.
   */
  if (!fs.existsSync(filePath)) {
    /**
     * IMPORTANT:
     *
     * The expected file is missing.
     *
     * Before calling it MISSING, check whether
     * another PDF appears to be the renamed version.
     */
    const renamedFilePath =
      findRenamedDocumentFile(
        filePath,
        document.id,
      );

    /**
     * A PDF with the same document ID was found
     * under another filename.
     *
     * Example:
     *
     * DOC621.pdf
     *      ↓
     * DOC621_test.pdf
     *
     * This is treated as TAMPERING.
     */
    if (renamedFilePath) {
      /**
       * The renamed PDF can still be hashed.
       *
       * We use its current PDF hash only as
       * supporting information for the tamper log.
       */
      const renamedPdfHash =
        calculateFileHash(renamedFilePath);

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
       * Create only one tamper log.
       */
      if (!wasAlreadyTampered) {
        await tamperLogService.logDocumentMismatch(
          document.id,
          document.blockchain_hash ?? '',
          renamedPdfHash,
        );
      }

      return true;
    }

    /**
     * No renamed PDF was found.
     *
     * Therefore this is a genuinely missing file.
     */
    const wasAlreadyMissing =
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
     * Log the missing file only once.
     */
    if (!wasAlreadyMissing) {
      await tamperLogService.logDocumentMismatch(
        document.id,
        document.blockchain_hash ?? '',
        'MISSING_FILE',
      );
    }

    return true;
  }

  /**
   * Calculate SHA-256 of the CURRENT PDF.
   */
  const currentPdfHash =
    calculateFileHash(filePath);

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
   * Therefore changing:
   *
   * - document_name
   * - document_type
   * - file_path
   * - source_dataset
   * - amount
   * - PDF contents
   *
   * will produce a different integrity hash.
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
  await markDocumentTampered(
    document,
    currentIntegrityHash,
  );

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
      /**
       * Check whether the file was renamed.
       */
      const renamedFilePath =
        findRenamedDocumentFile(
          filePath,
          document.id,
        );

      /**
       * RENAMED FILE
       */
      if (renamedFilePath) {
        const originalFileName =
          path.basename(filePath);

        const currentFileName =
          path.basename(renamedFilePath);

        const renamedPdfHash =
          calculateFileHash(renamedFilePath);

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
          [id],
        );

        /**
         * Log filename tampering only once.
         */
        if (!wasAlreadyTampered) {
          await tamperLogService.logDocumentMismatch(
            id,
            document.blockchain_hash ?? '',
            renamedPdfHash,
          );
        }

        return {
          id,
          status: 'TAMPERED',
          isTampered: true,
          reason: 'DOCUMENT_FILENAME_CHANGED',
          originalFileName,
          currentFileName,
        };
      }

      /**
       * No renamed PDF was found.
       *
       * Genuine missing file.
       */
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

    /**
     * Log PDF hash tampering for unanchored
     * documents as well.
     */
    if (
      !verified &&
      document.verification_status !== 'TAMPERED'
    ) {
      await tamperLogService.logDocumentMismatch(
        id,
        storedPdfHash,
        currentPdfHash,
      );
    }

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

    const pdfHash =
      calculateFileHash(filePath);

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

      txId =
        fabricResult.txId ?? txId;
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