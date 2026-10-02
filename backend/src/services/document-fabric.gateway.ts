import { readFile } from 'node:fs/promises';
import { createPrivateKey } from 'node:crypto';
import {
  connect,
  signers,
  type Contract,
  type Gateway,
} from '@hyperledger/fabric-gateway';
import * as grpc from '@grpc/grpc-js';
import { env } from '@/config/env.js';

export interface DocumentBlockchainRecord {
  documentId: string;
  sha256Hash: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

class DocumentFabricGateway {
  private gateway: Gateway | undefined;
  private client: grpc.Client | undefined;
  private contract: Contract | undefined;

  get enabled(): boolean {
    return Boolean(
      env.FABRIC_ENABLED &&
      process.env.FABRIC_DOCUMENT_CHAINCODE
    );
  }

  private async getContract(): Promise<Contract> {
    if (this.contract) {
      return this.contract;
    }

    const tlsPath = env.FABRIC_TLS_CERT_PATH;
    const certificatePath = env.FABRIC_CERT_PATH;
    const keyPath = env.FABRIC_KEY_PATH;

    if (!tlsPath || !certificatePath || !keyPath) {
      throw new Error(
        'Fabric certificate configuration is missing'
      );
    }

    const [
      tlsCertificate,
      certificate,
      privateKey,
    ] = await Promise.all([
      readFile(tlsPath),
      readFile(certificatePath),
      readFile(keyPath),
    ]);

    const client = new grpc.Client(
      env.FABRIC_PEER_ENDPOINT,
      grpc.credentials.createSsl(tlsCertificate),
      {
        'grpc.ssl_target_name_override':
          env.FABRIC_PEER_HOST_ALIAS,
      }
    );

    const identity = {
      mspId: env.FABRIC_MSP_ID,
      credentials: certificate,
    };

    const signer = signers.newPrivateKeySigner(
      createPrivateKey(privateKey)
    );

    this.client = client;

    this.gateway = connect({
      identity,
      signer,
      client,
    });

    this.contract = this.gateway
      .getNetwork(env.FABRIC_CHANNEL)
      .getContract(
        process.env.FABRIC_DOCUMENT_CHAINCODE || ''
      );

    return this.contract;
  }

  async anchorDocument(
    record: DocumentBlockchainRecord
  ): Promise<{
    txId?: string;
    status: string;
    record: DocumentBlockchainRecord;
  }> {
    if (!this.enabled) {
      return {
        status: 'UNAVAILABLE_OFFLINE',
        record,
      };
    }

    const contract = await this.getContract();

    const commit = await contract.submitAsync(
      'AnchorDocument',
      {
        arguments: [
          record.documentId,
          record.sha256Hash,
          record.timestamp,
          JSON.stringify(record.metadata),
        ],
      }
    );

    const result =
      JSON.parse(
        new TextDecoder().decode(
          commit.getResult()
        )
      );

    const status = await commit.getStatus();

    if (!status.successful) {
      throw new Error(
        `Fabric transaction ${status.transactionId} failed with status ${status.code}`
      );
    }

    return {
      txId: commit.getTransactionId(),
      status: 'COMMITTED',
      record: {
        ...record,
        metadata: result.metadata
          ? JSON.parse(result.metadata)
          : record.metadata,
      },
    };
  }

  async getDocument(
    documentId: string
  ): Promise<DocumentBlockchainRecord | null> {
    if (!this.enabled) {
      return null;
    }

    const contract = await this.getContract();

    try {
      const result =
        await contract.evaluateTransaction(
          'GetDocument',
          documentId
        );

      return JSON.parse(
        new TextDecoder().decode(result)
      );
    } catch {
      return null;
    }
  }

  close(): void {
    this.gateway?.close();
    this.client?.close();

    this.gateway = undefined;
    this.client = undefined;
    this.contract = undefined;
  }
}

export const documentFabricGateway =
  new DocumentFabricGateway();
