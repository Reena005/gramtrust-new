import { Contract } from 'fabric-contract-api';
import type { Context } from 'fabric-contract-api';

export interface LedgerChaincodeTransaction {
  projectCode: string;
  action: string;
  amount: number;
  hash: string;
  timestamp: string;
  txId: string;
  createdBy: string;
}

export interface ProcurementBlockchainEvent {
  tenderId: string;
  eventType:
    | 'TENDER_IMPORTED'
    | 'TENDER_CREATED'
    | 'TENDER_PUBLISHED'
    | 'BID_IMPORTED'
    | 'BID_SUBMITTED'
    | 'BID_MODIFIED'
    | 'TENDER_EVALUATED'
    | 'TENDER_AWARDED'
    | 'CONTRACT_CREATED'
    | 'PAYMENT_RECORDED'
    | 'OFFICIAL_CORRECTION';
  recordId: string;
  version: number;
  hash: string;
  actor: string;
  timestamp: string;
  txId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Document Integrity Blockchain Record
 */
export interface DocumentBlockchainRecord {
  documentId: string;
  documentName: string;
  documentType: string;
  hash: string;
  timestamp: string;
  txId: string;
  createdBy: string;
}

export class LedgerContract extends Contract {
  /**
   * Existing Project Fund Ledger Record
   */
  async CreateRecord(
    ctx: Context,
    projectCode: string,
    action: LedgerChaincodeTransaction['action'],
    amount: string,
    hash: string,
    timestamp: string,
  ): Promise<string> {
    if (!projectCode || !action || !amount || !hash || !timestamp) {
      throw new Error(
        'projectCode, action, amount, hash, and timestamp are required',
      );
    }

    const txId = ctx.stub.getTxID();

    const record: LedgerChaincodeTransaction = {
      projectCode,
      action,
      amount: Number(amount),
      hash,
      timestamp,
      txId,
      createdBy: ctx.clientIdentity.getID(),
    };

    const key = ctx.stub.createCompositeKey('record', [
      projectCode,
      txId,
    ]);

    await ctx.stub.putState(
      key,
      Buffer.from(JSON.stringify(record)),
    );

    return JSON.stringify(record);
  }

  async ReadRecord(
    ctx: Context,
    projectCode: string,
    txId: string,
  ): Promise<string> {
    const key = ctx.stub.createCompositeKey('record', [
      projectCode,
      txId,
    ]);

    const data = await ctx.stub.getState(key);

    if (!data || data.length === 0) {
      throw new Error(
        `Record ${projectCode}/${txId} does not exist`,
      );
    }

    return data.toString();
  }

  async GetProjectHistory(
    ctx: Context,
    projectCode: string,
  ): Promise<string> {
    const iterator =
      await ctx.stub.getStateByPartialCompositeKey(
        'record',
        [projectCode],
      );

    const records: LedgerChaincodeTransaction[] = [];

    try {
      let result = await iterator.next();

      while (!result.done) {
        if (result.value?.value) {
          records.push(
            JSON.parse(
              result.value.value.toString(),
            ) as LedgerChaincodeTransaction,
          );
        }

        result = await iterator.next();
      }
    } finally {
      await iterator.close();
    }

    return JSON.stringify(records);
  }

  /**
   * Procurement & Tender Blockchain Anchoring
   */
  async AnchorProcurementEvent(
    ctx: Context,
    tenderId: string,
    eventType: string,
    recordId: string,
    version: string,
    hash: string,
    actor: string,
    timestamp: string,
    metadataJson?: string,
  ): Promise<string> {
    if (!tenderId || !eventType || !hash || !timestamp) {
      throw new Error(
        'tenderId, eventType, hash, and timestamp are required for procurement anchoring',
      );
    }

    const txId = ctx.stub.getTxID();

    const event: ProcurementBlockchainEvent = {
      tenderId,
      eventType:
        eventType as ProcurementBlockchainEvent['eventType'],
      recordId: recordId || tenderId,
      version: parseInt(version, 10) || 1,
      hash,
      actor: actor || ctx.clientIdentity.getID(),
      timestamp,
      txId,
      metadata: metadataJson
        ? JSON.parse(metadataJson)
        : {},
    };

    const key = ctx.stub.createCompositeKey(
      'tender_event',
      [
        tenderId,
        String(event.version),
        txId,
      ],
    );

    await ctx.stub.putState(
      key,
      Buffer.from(JSON.stringify(event)),
    );

    return JSON.stringify(event);
  }

  async GetTenderHistory(
    ctx: Context,
    tenderId: string,
  ): Promise<string> {
    const iterator =
      await ctx.stub.getStateByPartialCompositeKey(
        'tender_event',
        [tenderId],
      );

    const events: ProcurementBlockchainEvent[] = [];

    try {
      let result = await iterator.next();

      while (!result.done) {
        if (result.value?.value) {
          events.push(
            JSON.parse(
              result.value.value.toString(),
            ) as ProcurementBlockchainEvent,
          );
        }

        result = await iterator.next();
      }
    } finally {
      await iterator.close();
    }

    return JSON.stringify(events);
  }

  /**
   * ============================================================
   * Document Integrity Blockchain
   * ============================================================
   */

  /**
   * Store a document's SHA-256 hash on Hyperledger Fabric.
   *
   * The actual PDF remains in the backend/documents folder.
   * Only the document identity and hash are stored on-chain.
   */
  async AnchorDocument(
    ctx: Context,
    documentId: string,
    documentName: string,
    documentType: string,
    hash: string,
    timestamp: string,
  ): Promise<string> {
    if (!documentId || !hash || !timestamp) {
      throw new Error(
        'documentId, hash, and timestamp are required for document anchoring',
      );
    }

    const txId = ctx.stub.getTxID();

    const document: DocumentBlockchainRecord = {
      documentId,
      documentName: documentName || documentId,
      documentType: documentType || 'UNKNOWN',
      hash,
      timestamp,
      txId,
      createdBy: ctx.clientIdentity.getID(),
    };

    const key = ctx.stub.createCompositeKey(
      'document',
      [
        documentId,
        txId,
      ],
    );

    await ctx.stub.putState(
      key,
      Buffer.from(JSON.stringify(document)),
    );

    return JSON.stringify(document);
  }

  /**
   * Get all blockchain records for a document.
   *
   * This allows the backend to compare the current
   * document hash with the hash previously anchored
   * on the blockchain.
   */
  async GetDocumentHistory(
    ctx: Context,
    documentId: string,
  ): Promise<string> {
    const iterator =
      await ctx.stub.getStateByPartialCompositeKey(
        'document',
        [documentId],
      );

    const documents: DocumentBlockchainRecord[] = [];

    try {
      let result = await iterator.next();

      while (!result.done) {
        if (result.value?.value) {
          documents.push(
            JSON.parse(
              result.value.value.toString(),
            ) as DocumentBlockchainRecord,
          );
        }

        result = await iterator.next();
      }
    } finally {
      await iterator.close();
    }

    return JSON.stringify(documents);
  }
}

export function buildLedgerTransaction(
  transaction: LedgerChaincodeTransaction,
) {
  return {
    ...transaction,
    immutable: true,
  };
}

export const contracts = [LedgerContract];