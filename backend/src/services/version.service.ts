import { prisma } from '@/config/prisma.js';
import { Prisma } from '@prisma/client';
import {
  canonicalHash,
  computeVersionChainHash,
  sha256Hash,
} from '@/hashing/canonical-hash.js';
import { RawTenderRecord } from '@/adapters/government-source.adapter.js';
import { fabricGateway } from './fabric.gateway.js';
import { tamperLogRepository } from '@/repositories/tamper-log.repository.js';
import { AppError } from '@/utils/app-error.js';

export interface ImportTenderOptions {
  importedById?: string | undefined;
  sourceName?: string | undefined;
  sourceUrl?: string | undefined;
}

export interface ModifyTenderFieldOptions {
  tenderId: string;
  changedBy: string;
  actorRole: string;
  changeReason: string;
  fields: {
    title?: string;
    estimatedValue?: number;
    department?: string;
    status?: string;
    closingDate?: string;
    location?: string;
    pincode?: string;
    invitingAuthority?: string;
  };
}

export interface ModifyBidOptions {
  bidId: string;
  tenderId: string;
  changedBy: string;
  actorRole: string;
  changeReason: string;
  newBidAmount: number;
  newStatus?: string;
}

export const versionService = {
  /**
   * Imports a raw government tender record, creating:
   * 1. SourceSnapshot
   * 2. Tender
   * 3. TenderVersion V1
   * 4. Vendors & VendorVersions
   * 5. Bids & BidVersions
   * 6. TenderAuditEvent
   * 7. Hyperledger Fabric anchor
   */
  async importTender(
    rawRecord: RawTenderRecord,
    options: ImportTenderOptions = {},
  ) {
    const existing = await prisma.tender.findUnique({
      where: { tenderId: rawRecord.tenderId },
    });

    if (existing) {
      throw new AppError(
        `Tender with ID '${rawRecord.tenderId}' is already imported.`,
        409,
      );
    }

    // 1. Create immutable raw source snapshot
    const rawPayloadString = JSON.stringify(rawRecord);
    const snapshotSha256 = sha256Hash(rawPayloadString);

    const snapshot = await prisma.sourceSnapshot.create({
      data: {
        sourceName:
          options.sourceName ||
          rawRecord.sourceName ||
          'Government Procurement Portal',

        sourceUrl:
          options.sourceUrl ||
          rawRecord.sourceUrl ||
          'https://eprocure.gov.in',

        resourceId:
          rawRecord.sourceDatasetId ||
          rawRecord.tenderId,

        rawData:
          rawRecord as unknown as Prisma.InputJsonValue,

        sha256: snapshotSha256,

        recordCount: 1,

        status: 'VALID',

        importedById:
          options.importedById || null,

        metadata: {
          importedAt:
            new Date().toISOString(),

          invitingAuthority:
            rawRecord.invitingAuthority || null,

          hasBids:
            !!(
              rawRecord.bids &&
              rawRecord.bids.length > 0
            ),

          hasAward:
            !!rawRecord.awardDetails,
        } as Prisma.InputJsonValue,
      },
    });

    // 2. Prepare canonical V1 data snapshot
    const initialTenderData = {
      tenderId:
        rawRecord.tenderId,

      referenceNumber:
        rawRecord.tenderReferenceNumber,

      title:
        rawRecord.tenderTitle,

      department:
        rawRecord.department,

      organisationChain:
        rawRecord.organisationChain || null,

      tenderType:
        rawRecord.tenderType || 'Open Tender',

      tenderCategory:
        rawRecord.tenderCategory || 'Works',

      formOfContract:
        rawRecord.formOfContract || null,

      productCategory:
        rawRecord.productCategory || null,

      state:
        rawRecord.state,

      district:
        rawRecord.district,

      panchayat:
        rawRecord.panchayat || null,

      location:
        rawRecord.location || null,

      pincode:
        rawRecord.pincode || null,

      estimatedValue:
        rawRecord.estimatedValue,

      currency:
        rawRecord.currency || 'INR',

      status:
        rawRecord.status,

      publishedDate:
        rawRecord.publishedDate || null,

      closingDate:
        rawRecord.bidSubmissionClosingDate || null,

      openingDate:
        rawRecord.bidOpeningDate || null,

      invitingAuthority:
        rawRecord.invitingAuthority || null,

      periodOfWorkDays:
        rawRecord.periodOfWorkDays || null,

      bidsCount:
        rawRecord.bids?.length || 0,

      sourceSnapshotSha256:
        snapshotSha256,
    };

    const v1Hash =
      computeVersionChainHash(
        initialTenderData,
        null,
      );

    return prisma.$transaction(
      async (tx) => {
        // ========================================================
        // CREATE CORE TENDER
        // ========================================================

        const tender =
          await tx.tender.create({
            data: {
              tenderId:
                rawRecord.tenderId,

              referenceNumber:
                rawRecord.tenderReferenceNumber,

              title:
                rawRecord.tenderTitle,

              department:
                rawRecord.department,

              organisationChain:
                rawRecord.organisationChain ||
                null,

              tenderType:
                rawRecord.tenderType ||
                null,

              tenderCategory:
                rawRecord.tenderCategory ||
                null,

              formOfContract:
                rawRecord.formOfContract ||
                null,

              productCategory:
                rawRecord.productCategory ||
                null,

              state:
                rawRecord.state,

              district:
                rawRecord.district,

              panchayat:
                rawRecord.panchayat ||
                null,

              location:
                rawRecord.location ||
                null,

              pincode:
                rawRecord.pincode ||
                null,

              estimatedValue:
                new Prisma.Decimal(
                  rawRecord.estimatedValue,
                ),

              currency:
                rawRecord.currency ||
                'INR',

              status:
                rawRecord.status,

              publishedDate:
                rawRecord.publishedDate
                  ? new Date(
                      rawRecord.publishedDate,
                    )
                  : null,

              closingDate:
                rawRecord.bidSubmissionClosingDate
                  ? new Date(
                      rawRecord.bidSubmissionClosingDate,
                    )
                  : null,

              openingDate:
                rawRecord.bidOpeningDate
                  ? new Date(
                      rawRecord.bidOpeningDate,
                    )
                  : null,

              invitingAuthority:
                rawRecord.invitingAuthority ||
                null,

              periodOfWorkDays:
                rawRecord.periodOfWorkDays ||
                null,

              currentVersionNumber:
                1,

              currentHash:
                v1Hash,

              sourceSnapshotId:
                snapshot.id,
            },
          });

        // ========================================================
        // CREATE TENDER VERSION V1
        // ========================================================

        const tenderVersion =
          await tx.tenderVersion.create({
            data: {
              tenderId:
                tender.id,

              versionNumber:
                1,

              sourceSnapshotId:
                snapshot.id,

              data:
                initialTenderData as Prisma.InputJsonValue,

              changedBy:
                'SYSTEM/GOVERNMENT_SOURCE',

              changeReason:
                'Original government import',

              previousHash:
                null,

              newHash:
                v1Hash,
            },
          });

        // ========================================================
        // PROCESS BIDS
        // ========================================================

        if (
          rawRecord.bids &&
          Array.isArray(rawRecord.bids)
        ) {
          for (
            const bidItem of rawRecord.bids
          ) {
            let vendor = null;

            if (bidItem.vendorName) {
              vendor =
                await tx.vendor.findFirst({
                  where: {
                    OR: [
                      ...(bidItem.vendorGstin
                        ? [
                            {
                              gstin:
                                bidItem.vendorGstin,
                            },
                          ]
                        : []),

                      {
                        name:
                          bidItem.vendorName,
                      },
                    ],
                  },
                });

              if (!vendor) {
                const vendorV1Hash =
                  canonicalHash({
                    name:
                      bidItem.vendorName,

                    gstin:
                      bidItem.vendorGstin ||
                      null,

                    state:
                      bidItem.vendorState ||
                      rawRecord.state,
                  });

                vendor =
                  await tx.vendor.create({
                    data: {
                      name:
                        bidItem.vendorName,

                      gstin:
                        bidItem.vendorGstin ||
                        null,

                      state:
                        bidItem.vendorState ||
                        rawRecord.state,

                      currentVersionNumber:
                        1,
                    },
                  });

                await tx.vendorVersion.create({
                  data: {
                    vendorId:
                      vendor.id,

                    versionNumber:
                      1,

                    data: {
                      name:
                        bidItem.vendorName,

                      gstin:
                        bidItem.vendorGstin ||
                        null,

                      state:
                        bidItem.vendorState ||
                        null,
                    } as Prisma.InputJsonValue,

                    changedBy:
                      'SYSTEM/GOVERNMENT_SOURCE',

                    changeReason:
                      'Original government import',

                    previousHash:
                      null,

                    newHash:
                      vendorV1Hash,
                  },
                });
              }
            }

            const bidV1Data = {
              tenderId:
                tender.id,

              vendorName:
                bidItem.vendorName,

              vendorGstin:
                bidItem.vendorGstin ||
                null,

              bidAmount:
                bidItem.bidAmount,

              submissionDate:
                bidItem.submissionDate ||
                null,

              technicalScore:
                bidItem.technicalScore ||
                null,

              financialRank:
                bidItem.financialRank ||
                null,

              status:
                bidItem.status,
            };

            const bidV1Hash =
              computeVersionChainHash(
                bidV1Data,
                null,
              );

            const bid =
              await tx.bid.create({
                data: {
                  tenderId:
                    tender.id,

                  vendorId:
                    vendor
                      ? vendor.id
                      : null,

                  vendorName:
                    bidItem.vendorName,

                  vendorGstin:
                    bidItem.vendorGstin ||
                    null,

                  bidAmount:
                    new Prisma.Decimal(
                      bidItem.bidAmount,
                    ),

                  submissionDate:
                    bidItem.submissionDate
                      ? new Date(
                          bidItem.submissionDate,
                        )
                      : null,

                  technicalScore:
                    bidItem.technicalScore ||
                    null,

                  financialRank:
                    bidItem.financialRank ||
                    null,

                  status:
                    bidItem.status,

                  currentVersionNumber:
                    1,

                  currentHash:
                    bidV1Hash,
                },
              });

            await tx.bidVersion.create({
              data: {
                bidId:
                  bid.id,

                versionNumber:
                  1,

                data:
                  bidV1Data as Prisma.InputJsonValue,

                bidAmount:
                  new Prisma.Decimal(
                    bidItem.bidAmount,
                  ),

                status:
                  bidItem.status,

                changedBy:
                  'SYSTEM/GOVERNMENT_SOURCE',

                changeReason:
                  'Original government import',

                previousHash:
                  null,

                newHash:
                  bidV1Hash,
              },
            });
          }
        }

        // ========================================================
        // AUDIT EVENT
        // ========================================================

        const auditEvent =
          await tx.tenderAuditEvent.create({
            data: {
              tenderId:
                tender.id,

              eventType:
                'TENDER_IMPORTED',

              actor:
                'SYSTEM/GOVERNMENT_SOURCE',

              actorRole:
                'SYSTEM',

              versionNumber:
                1,

              details: {
                action:
                  'IMPORT_GOVERNMENT_TENDER',

                sourceName:
                  snapshot.sourceName,

                sourceUrl:
                  snapshot.sourceUrl,

                snapshotSha256,

                tenderId:
                  tender.tenderId,

                estimatedValue:
                  Number(
                    tender.estimatedValue,
                  ),

                bidsImported:
                  rawRecord.bids?.length ||
                  0,

                hasAward:
                  !!rawRecord.awardDetails,
              } as Prisma.InputJsonValue,

              hash:
                v1Hash,
            },
          });

        // ========================================================
        // FABRIC ANCHOR
        // ========================================================

        let fabricResult = {
          txId:
            `PENDING-${tender.tenderId}-V1`,

          status:
            'NOT_ANCHORED',
        };

        try {
          fabricResult =
            await fabricGateway.anchorProcurementEvent(
              {
                tenderId:
                  tender.tenderId,

                eventType:
                  'TENDER_IMPORTED',

                recordId:
                  tender.id,

                version:
                  1,

                hash:
                  v1Hash,

                actor:
                  'SYSTEM/GOVERNMENT_SOURCE',

                timestamp:
                  new Date().toISOString(),

                metadata: {
                  referenceNumber:
                    tender.referenceNumber,

                  estimatedValue:
                    Number(
                      tender.estimatedValue,
                    ),

                  snapshotSha256,
                },
              },
            );
        } catch (err) {
          console.warn(
            'Fabric anchoring notice (proceeding with local DB proof):',
            err,
          );
        }

        if (
          fabricResult.status ===
          'COMMITTED'
        ) {
          await tx.blockchainTransaction.create(
            {
              data: {
                tenderId:
                  tender.id,

                tenderVersionId:
                  tenderVersion.id,

                auditEventId:
                  auditEvent.id,

                txId:
                  fabricResult.txId,

                eventType:
                  'TENDER_IMPORTED',

                recordId:
                  tender.id,

                version:
                  1,

                hash:
                  v1Hash,

                actor:
                  'SYSTEM/GOVERNMENT_SOURCE',

                status:
                  'COMMITTED',

                payload: {
                  tenderId:
                    tender.tenderId,

                  version:
                    1,

                  hash:
                    v1Hash,
                } as Prisma.InputJsonValue,
              },
            },
          );

          await tx.tender.update({
            where: {
              id:
                tender.id,
            },

            data: {
              blockchainStatus:
                'Recorded',

              blockchainTxId:
                fabricResult.txId,

              blockchainVerified:
                true,
            },
          });
        }

        return {
          tender,
          tenderVersion,
          snapshot,
          auditEvent,
          fabricTxId:
            fabricResult.txId,
        };
      },
    );
  },

  // ============================================================
  // CREATE NEW TENDER VERSION
  // ============================================================

  async createTenderVersion(
    options: ModifyTenderFieldOptions,
  ) {
    if (
      !options.changeReason ||
      options.changeReason.trim().length < 5
    ) {
      throw new AppError(
        'A valid administrative reason (minimum 5 characters) is mandatory for official modifications.',
        400,
      );
    }

    const tender =
      await prisma.tender.findFirst({
        where: {
          OR: [
            {
              id:
                options.tenderId,
            },
            {
              tenderId:
                options.tenderId,
            },
          ],
        },

        include: {
          versions: {
            orderBy: {
              versionNumber:
                'desc',
            },

            take: 1,
          },
        },
      });

    if (!tender) {
      throw new AppError(
        'Tender not found.',
        404,
      );
    }

    const latestVersion =
      tender.versions[0];

    const newVersionNumber =
      (latestVersion
        ? latestVersion.versionNumber
        : tender.currentVersionNumber) + 1;

    const previousHash =
      latestVersion
        ? latestVersion.newHash
        : tender.currentHash;

    const previousData =
      (latestVersion?.data as Record<
        string,
        unknown
      >) || {};

    // ==========================================================
    // DETECT WHETHER ESTIMATED VALUE WAS CHANGED
    // ==========================================================

    const oldAmount =
      Number(tender.estimatedValue);

    const newAmount =
      options.fields.estimatedValue !==
      undefined
        ? Number(
            options.fields.estimatedValue,
          )
        : oldAmount;

    const amountChanged =
      newAmount !== oldAmount;

    // ==========================================================
    // BUILD NEW VERSION DATA
    // ==========================================================

    const updatedData = {
      ...previousData,

      title:
        options.fields.title !==
        undefined
          ? options.fields.title
          : tender.title,

      estimatedValue:
        options.fields.estimatedValue !==
        undefined
          ? options.fields
              .estimatedValue
          : oldAmount,

      department:
        options.fields.department !==
        undefined
          ? options.fields.department
          : tender.department,

      status:
        options.fields.status !==
        undefined
          ? options.fields.status
          : tender.status,

      closingDate:
        options.fields.closingDate !==
        undefined
          ? options.fields.closingDate
          : tender.closingDate
              ?.toISOString() ||
            null,

      location:
        options.fields.location !==
        undefined
          ? options.fields.location
          : tender.location,

      pincode:
        options.fields.pincode !==
        undefined
          ? options.fields.pincode
          : tender.pincode,

      invitingAuthority:
        options.fields
          .invitingAuthority !==
        undefined
          ? options.fields
              .invitingAuthority
          : tender.invitingAuthority,

      _versionMetadata: {
        versionNumber:
          newVersionNumber,

        modifiedAt:
          new Date().toISOString(),

        modifiedBy:
          options.changedBy,

        changeReason:
          options.changeReason,
      },
    };

    const newHash =
      computeVersionChainHash(
        updatedData,
        previousHash,
      );

    return prisma.$transaction(
      async (tx) => {
        // ======================================================
        // 1. CREATE NEW VERSION
        // ======================================================

        const newVersion =
          await tx.tenderVersion.create({
            data: {
              tenderId:
                tender.id,

              versionNumber:
                newVersionNumber,

              previousVersionId:
                latestVersion
                  ? latestVersion.id
                  : null,

              data:
                updatedData as Prisma.InputJsonValue,

              changedBy:
                options.changedBy,

              changeReason:
                options.changeReason,

              previousHash,

              newHash,
            },
          });

        // ======================================================
        // 2. UPDATE LIVE TENDER
        // ======================================================

        const updatePayload:
          Prisma.TenderUpdateInput = {
          currentVersionNumber:
            newVersionNumber,

          currentHash:
            newHash,
        };

        if (
          options.fields.title !==
          undefined
        ) {
          updatePayload.title =
            options.fields.title;
        }

        if (
          options.fields
            .estimatedValue !==
          undefined
        ) {
          updatePayload.estimatedValue =
            new Prisma.Decimal(
              options.fields
                .estimatedValue,
            );
        }

        if (
          options.fields.department !==
          undefined
        ) {
          updatePayload.department =
            options.fields.department;
        }

        if (
          options.fields.status !==
          undefined
        ) {
          updatePayload.status =
            options.fields.status;
        }

        if (
          options.fields.closingDate !==
          undefined
        ) {
          updatePayload.closingDate =
            options.fields
              .closingDate
              ? new Date(
                  options.fields
                    .closingDate,
                )
              : null;
        }

        if (
          options.fields.location !==
          undefined
        ) {
          updatePayload.location =
            options.fields.location;
        }

        if (
          options.fields.pincode !==
          undefined
        ) {
          updatePayload.pincode =
            options.fields.pincode;
        }

        if (
          options.fields
            .invitingAuthority !==
          undefined
        ) {
          updatePayload.invitingAuthority =
            options.fields
              .invitingAuthority;
        }

        // ======================================================
        // IMPORTANT:
        // Amount modification makes this tender TAMPERED.
        // ======================================================

        if (amountChanged) {
          updatePayload.blockchainStatus =
            'Tampered';

          updatePayload.blockchainVerified =
            false;
        }

        const updatedTender =
          await tx.tender.update({
            where: {
              id:
                tender.id,
            },

            data:
              updatePayload,
          });

        // ======================================================
        // 3. NORMAL VERSION AUDIT
        // ======================================================

        const auditEvent =
          await tx.tenderAuditEvent.create({
            data: {
              tenderId:
                tender.id,

              eventType:
                'OFFICIAL_CORRECTION',

              actor:
                options.changedBy,

              actorRole:
                options.actorRole,

              versionNumber:
                newVersionNumber,

              details: {
                action:
                  'OFFICIAL_TENDER_MODIFICATION',

                versionNumber:
                  newVersionNumber,

                reason:
                  options.changeReason,

                previousHash,

                newHash,

                changedFields:
                  Object.keys(
                    options.fields,
                  ),

                previousValues: {
                  title:
                    tender.title,

                  estimatedValue:
                    oldAmount,

                  department:
                    tender.department,

                  status:
                    tender.status,
                },

                newValues:
                  options.fields,
              } as Prisma.InputJsonValue,

              hash:
                newHash,
            },
          });

        // ======================================================
        // 4. FABRIC / LOCAL BLOCKCHAIN ANCHOR
        // ======================================================

        let fabricResult = {
          txId:
            `LOCAL-${tender.tenderId}-V${newVersionNumber}`,

          status:
            'LOCAL_PROOF',
        };

        try {
          fabricResult =
            await fabricGateway.anchorProcurementEvent(
              {
                tenderId:
                  tender.tenderId,

                eventType:
                  'OFFICIAL_CORRECTION',

                recordId:
                  newVersion.id,

                version:
                  newVersionNumber,

                hash:
                  newHash,

                actor:
                  options.changedBy,

                timestamp:
                  new Date().toISOString(),

                metadata: {
                  reason:
                    options.changeReason,

                  changedFields:
                    Object.keys(
                      options.fields,
                    ),

                  estimatedValue:
                    newAmount,
                },
              },
            );
        } catch (err) {
          console.warn(
            'Fabric anchoring notice:',
            err,
          );
        }

        if (
          fabricResult.status ===
          'COMMITTED'
        ) {
          await tx.blockchainTransaction.create(
            {
              data: {
                tenderId:
                  tender.id,

                tenderVersionId:
                  newVersion.id,

                auditEventId:
                  auditEvent.id,

                txId:
                  fabricResult.txId,

                eventType:
                  'OFFICIAL_CORRECTION',

                recordId:
                  newVersion.id,

                version:
                  newVersionNumber,

                hash:
                  newHash,

                actor:
                  options.changedBy,

                status:
                  'COMMITTED',

                payload: {
                  version:
                    newVersionNumber,

                  hash:
                    newHash,

                  reason:
                    options.changeReason,

                  estimatedValue:
                    newAmount,
                } as Prisma.InputJsonValue,
              },
            },
          );
        }

        // ======================================================
        // 5. AMOUNT CHANGE = TAMPERING INCIDENT
        // ======================================================

        if (amountChanged) {
          // Find ORIGINAL trusted version
          const firstVersion =
            await tx.tenderVersion.findFirst(
              {
                where: {
                  tenderId:
                    tender.id,
                },

                orderBy: {
                  versionNumber:
                    'asc',
                },
              },
            );

          const originalAmount =
            firstVersion
              ? Number(
                  (
                    firstVersion.data as Record<
                      string,
                      unknown
                    >
                  ).estimatedValue ??
                    oldAmount,
                )
              : oldAmount;

          const originalHash =
            firstVersion
              ? firstVersion.newHash
              : tender.currentHash;

          // -----------------------------------------------
          // Tamper Log
          // -----------------------------------------------

          try {
            await tamperLogRepository.create({
              recordId:
                tender.id,

              bidId:
                null,

              tenderId:
                tender.tenderId,

              vendorName:
                'Tender Amount',

              vendorId:
                null,

              userId:
                null,

              userName:
                options.changedBy,

              userRole:
                options.actorRole,

              fieldName:
                'estimatedValue',

              oldValue:
                String(
                  originalAmount,
                ),

              newValue:
                String(
                  newAmount,
                ),

              trustedHash:
                originalHash,

              currentHash:
                newHash,

              originalAmount:
                String(
                  originalAmount,
                ),

              currentAmount:
                String(
                  newAmount,
                ),

              changeType:
                'HASH_MISMATCH',

              status:
                'TAMPERED',
            });
          } catch (tamperErr) {
            console.warn(
              'Tender amount tamper log creation notice:',
              tamperErr,
            );
          }

          // -----------------------------------------------
          // Tampering Audit Event
          // -----------------------------------------------

          await tx.tenderAuditEvent.create({
            data: {
              tenderId:
                tender.id,

              eventType:
                'TAMPERING_DETECTED',

              actor:
                options.changedBy,

              actorRole:
                options.actorRole,

              versionNumber:
                newVersionNumber,

              details: {
                tenderId:
                  tender.tenderId,

                field:
                  'estimatedValue',

                originalAmount,

                previousAmount:
                  oldAmount,

                newAmount,

                trustedHash:
                  originalHash,

                currentHash:
                  newHash,

                versionNumber:
                  newVersionNumber,

                reason:
                  `Tender estimated amount changed from ₹${oldAmount.toLocaleString(
                    'en-IN',
                  )} to ₹${newAmount.toLocaleString(
                    'en-IN',
                  )}: ${
                    options.changeReason
                  }`,
              } as Prisma.InputJsonValue,

              hash:
                newHash,
            },
          });
        }

        return {
          tender:
            updatedTender,

          newVersion,

          auditEvent,
        };
      },
    );
  },

  // ============================================================
  // CREATE BID VERSION
  // ============================================================

  async createBidVersion(
    options: ModifyBidOptions,
  ) {
    if (
      !options.changeReason ||
      options.changeReason.trim().length < 5
    ) {
      throw new AppError(
        'A valid administrative reason is mandatory for bid modifications.',
        400,
      );
    }

    const bid =
      await prisma.bid.findUnique({
        where: {
          id:
            options.bidId,
        },

        include: {
          versions: {
            orderBy: {
              versionNumber:
                'desc',
            },

            take: 1,
          },

          tender: true,
        },
      });

    if (!bid) {
      throw new AppError(
        'Bid not found.',
        404,
      );
    }

    const latestVersion =
      bid.versions[0];

    const newVersionNumber =
      (latestVersion
        ? latestVersion.versionNumber
        : bid.currentVersionNumber) + 1;

    const previousHash =
      latestVersion
        ? latestVersion.newHash
        : bid.currentHash;

    const previousData =
      (latestVersion?.data as Record<
        string,
        unknown
      >) || {};

    const updatedData = {
      ...previousData,

      bidAmount:
        options.newBidAmount,

      status:
        options.newStatus ||
        bid.status,

      _versionMetadata: {
        versionNumber:
          newVersionNumber,

        modifiedAt:
          new Date().toISOString(),

        modifiedBy:
          options.changedBy,

        changeReason:
          options.changeReason,
      },
    };

    const newHash =
      computeVersionChainHash(
        updatedData,
        previousHash,
      );

    return prisma.$transaction(
      async (tx) => {
        // ======================================================
        // CREATE BID VERSION
        // ======================================================

        const newBidVersion =
          await tx.bidVersion.create({
            data: {
              bidId:
                bid.id,

              versionNumber:
                newVersionNumber,

              previousVersionId:
                latestVersion
                  ? latestVersion.id
                  : null,

              data:
                updatedData as Prisma.InputJsonValue,

              bidAmount:
                new Prisma.Decimal(
                  options.newBidAmount,
                ),

              status:
                options.newStatus ||
                bid.status,

              changedBy:
                options.changedBy,

              changeReason:
                options.changeReason,

              previousHash,

              newHash,
            },
          });

        // ======================================================
        // UPDATE BID
        // ======================================================

        const updatedBid =
          await tx.bid.update({
            where: {
              id:
                bid.id,
            },

            data: {
              currentVersionNumber:
                newVersionNumber,

              currentHash:
                newHash,

              bidAmount:
                new Prisma.Decimal(
                  options.newBidAmount,
                ),

              status:
                options.newStatus ||
                bid.status,
            },
          });

        // ======================================================
        // AUDIT
        // ======================================================

        const auditEvent =
          await tx.tenderAuditEvent.create({
            data: {
              tenderId:
                bid.tenderId,

              eventType:
                'BID_MODIFIED',

              actor:
                options.changedBy,

              actorRole:
                options.actorRole,

              versionNumber:
                newVersionNumber,

              details: {
                action:
                  'BID_AMOUNT_CORRECTION',

                bidId:
                  bid.id,

                vendorName:
                  bid.vendorName,

                oldAmount:
                  Number(
                    bid.bidAmount,
                  ),

                newAmount:
                  options.newBidAmount,

                reason:
                  options.changeReason,

                previousHash,

                newHash,

                versionNumber:
                  newVersionNumber,
              } as Prisma.InputJsonValue,

              hash:
                newHash,
            },
          });

        // ======================================================
        // FABRIC BID ANCHOR
        // ======================================================

        try {
          await fabricGateway.anchorProcurementEvent(
            {
              tenderId:
                bid.tender.tenderId,

              eventType:
                'BID_MODIFIED',

              recordId:
                bid.id,

              version:
                newVersionNumber,

              hash:
                newHash,

              actor:
                options.changedBy,

              timestamp:
                new Date().toISOString(),

              metadata: {
                bidId:
                  bid.id,

                oldAmount:
                  Number(
                    bid.bidAmount,
                  ),

                newAmount:
                  options.newBidAmount,

                reason:
                  options.changeReason,
              },
            },
          );
        } catch (err) {
          console.warn(
            'Fabric bid anchor notice:',
            err,
          );
        }

        // ======================================================
        // BID AMOUNT TAMPER DETECTION
        // ======================================================

        const isAmountAltered =
          Number(
            options.newBidAmount,
          ) !==
          Number(
            bid.bidAmount,
          );

        if (isAmountAltered) {
          await tx.tender.update({
            where: {
              id:
                bid.tenderId,
            },

            data: {
              blockchainStatus:
                'Tampered',

              blockchainVerified:
                false,
            },
          });

          const firstVersion =
            await tx.bidVersion.findFirst({
              where: {
                bidId:
                  bid.id,
              },

              orderBy: {
                versionNumber:
                  'asc',
              },
            });

          const originalAmount =
            firstVersion
              ? Number(
                  firstVersion.bidAmount,
                )
              : Number(
                  bid.bidAmount,
                );

          const originalHash =
            firstVersion
              ? firstVersion.newHash
              : bid.currentHash;

          try {
            await tamperLogRepository.create({
              recordId:
                bid.id,

              bidId:
                bid.id,

              tenderId:
                bid.tender.tenderId,

              vendorName:
                bid.vendorName,

              vendorId:
                bid.vendorId ??
                null,

              userId:
                null,

              userName:
                options.changedBy,

              userRole:
                options.actorRole,

              fieldName:
                'bid_amount',

              oldValue:
                String(
                  originalAmount,
                ),

              newValue:
                String(
                  options.newBidAmount,
                ),

              trustedHash:
                originalHash,

              currentHash:
                newHash,

              originalAmount:
                String(
                  originalAmount,
                ),

              currentAmount:
                String(
                  options.newBidAmount,
                ),

              changeType:
                'HASH_MISMATCH',

              status:
                'TAMPERED',
            });
          } catch (tamperErr) {
            console.warn(
              'Tamper log creation notice:',
              tamperErr,
            );
          }

          await tx.tenderAuditEvent.create({
            data: {
              tenderId:
                bid.tenderId,

              eventType:
                'TAMPERING_DETECTED',

              actor:
                options.changedBy,

              actorRole:
                options.actorRole,

              versionNumber:
                newVersionNumber,

              details: {
                bidId:
                  bid.id,

                vendorName:
                  bid.vendorName,

                originalAmount,

                newAmount:
                  options.newBidAmount,

                reason:
                  `Bid amount altered from ₹${originalAmount.toLocaleString(
                    'en-IN',
                  )} to ₹${options.newBidAmount.toLocaleString(
                    'en-IN',
                  )}: ${
                    options.changeReason
                  }`,
              } as Prisma.InputJsonValue,

              hash:
                newHash,
            },
          });
        }

        return {
          bid:
            updatedBid,

          newVersion:
            newBidVersion,

          auditEvent,
        };
      },
    );
  },
};