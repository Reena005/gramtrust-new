import { Context, Contract, Info, Returns, Transaction } from 'fabric-contract-api';

export interface DocumentRecord {
  documentId: string;
  sha256Hash: string;
  timestamp: string;
  metadata: string;
}

@Info({
  title: 'GramTrust Document Integrity',
  description: 'Blockchain storage and verification of document SHA-256 hashes',
  version: '1.0.0',
})
export class DocumentContract extends Contract {

  @Transaction()
  public async AnchorDocument(
    ctx: Context,
    documentId: string,
    sha256Hash: string,
    timestamp: string,
    metadata: string
  ): Promise<DocumentRecord> {

    const exists = await this.DocumentExists(ctx, documentId);

    if (exists) {
      throw new Error(`Document ${documentId} is already anchored`);
    }

    const record: DocumentRecord = {
      documentId,
      sha256Hash,
      timestamp,
      metadata,
    };

    await ctx.stub.putState(
      documentId,
      Buffer.from(JSON.stringify(record))
    );

    return record;
  }

  @Transaction(false)
  @Returns('boolean')
  public async DocumentExists(
    ctx: Context,
    documentId: string
  ): Promise<boolean> {

    const data = await ctx.stub.getState(documentId);

    return data && data.length > 0;
  }

  @Transaction(false)
  public async GetDocument(
    ctx: Context,
    documentId: string
  ): Promise<DocumentRecord> {

    const data = await ctx.stub.getState(documentId);

    if (!data || data.length === 0) {
      throw new Error(`Document ${documentId} does not exist`);
    }

    return JSON.parse(data.toString()) as DocumentRecord;
  }
}