import { prisma } from '@/config/prisma.js';
import { Prisma } from '@prisma/client';
import { tamperLogRepository } from '@/repositories/tamper-log.repository.js';

export interface TenderQueryFilters {
  query?: string | undefined;
  department?: string | undefined;
  state?: string | undefined;
  district?: string | undefined;
  status?: string | undefined;

  minAmount?: number | undefined;
  maxAmount?: number | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

/*
 * Checks whether the current tender amount is different
 * from the amount stored in the latest official version.
 *
 * Official version creation:
 *   latest version amount == current amount
 *   -> NOT TAMPERED
 *
 * Unauthorized frontend/backend/database modification:
 *   latest version amount != current amount
 *   -> TAMPERED
 */
async function checkTenderAmountIntegrity(tender: any) {
  const latestVersion = tender.versions?.[0];

  if (!latestVersion) {
    return tender;
  }

  const versionData =
    latestVersion.data as Record<string, unknown>;

  const trustedAmount = Number(
    versionData['estimatedValue'],
  );

  const currentAmount = Number(
    tender.estimatedValue,
  );

  /*
   * Cannot compare invalid values.
   */
  if (
    !Number.isFinite(trustedAmount) ||
    !Number.isFinite(currentAmount)
  ) {
    return tender;
  }

  /*
   * No mismatch.
   *
   * This is the normal case after an official
   * Version 5, Version 6, etc. is created.
   */
  if (trustedAmount === currentAmount) {
    return tender;
  }

  /*
   * MISMATCH DETECTED
   *
   * Example:
   *
   * Version 5 trusted amount = 24030487
   * Current database amount  = 24034578
   *
   * Therefore the live tender was changed without
   * creating a new trusted version.
   */

  console.log(
    `[INTEGRITY] Tender ${tender.tenderId} amount mismatch detected`,
  );

  console.log(
    `[INTEGRITY] Trusted amount: ${trustedAmount}`,
  );

  console.log(
    `[INTEGRITY] Current amount: ${currentAmount}`,
  );

  /*
   * Only create the tamper log when the tender is
   * not already marked as Tampered.
   *
   * This prevents the same request from continuously
   * inserting duplicate tamper logs.
   */
  if (tender.blockchainStatus !== 'Tampered') {
    /*
     * INSERT INTO tamper_logs
     */
    await tamperLogRepository.create({
      recordId: tender.id,

      bidId: null,

      tenderId: tender.tenderId,

      vendorName: null,

      vendorId: null,

      userId: null,

      userName: 'Blockchain Integrity Monitor',

      userRole: 'SYSTEM',

      fieldName: 'estimatedValue',

      oldValue: String(trustedAmount),

      newValue: String(currentAmount),

      trustedHash: latestVersion.newHash,

      currentHash: null,

      originalAmount: String(trustedAmount),

      currentAmount: String(currentAmount),

      changeType: 'BLOCKCHAIN_MISMATCH',

      status: 'TAMPERED',
    });

    /*
     * Mark tender as Tampered.
     */
    await prisma.tender.update({
      where: {
        id: tender.id,
      },

      data: {
        blockchainStatus: 'Tampered',

        blockchainVerified: false,
      },
    });

    /*
     * Update the object that will be returned
     * by the current API request.
     */
    tender.blockchainStatus = 'Tampered';

    tender.blockchainVerified = false;

    console.log(
      `[INTEGRITY] Tender ${tender.tenderId} marked as TAMPERED`,
    );
  } else {
    /*
     * It was already detected previously.
     */
    tender.blockchainStatus = 'Tampered';

    tender.blockchainVerified = false;
  }

  return tender;
}

export const tenderRepository = {
  /*
   * ----------------------------------------------------
   * GET ONE TENDER
   * ----------------------------------------------------
   */
  async findById(id: string) {
    const tender = await prisma.tender.findFirst({
      where: {
        OR: [
          { id },
          { tenderId: id },
        ],
      },

      include: {
        snapshot: true,

        versions: {
          orderBy: {
            versionNumber: 'desc',
          },

          include: {
            snapshot: {
              select: {
                id: true,
                sourceName: true,
                sourceUrl: true,
                sha256: true,
              },
            },
          },
        },

        bids: {
          orderBy: {
            bidAmount: 'asc',
          },

          include: {
            vendor: true,

            versions: {
              orderBy: {
                versionNumber: 'desc',
              },
            },
          },
        },

        auditEvents: {
          orderBy: {
            createdAt: 'desc',
          },
        },

        blockchainTransactions: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!tender) {
      return null;
    }

    /*
     * Check the current amount against the latest
     * official version.
     */
    await checkTenderAmountIntegrity(tender);

    return tender;
  },

  /*
   * ----------------------------------------------------
   * GET TENDERS
   * ----------------------------------------------------
   */
  async findManyWithFilters(
    filters: TenderQueryFilters,
  ) {
    const where: Prisma.TenderWhereInput = {};

    /*
     * SEARCH
     */
    if (filters.query) {
      where.OR = [
        {
          tenderId: {
            contains: filters.query,
            mode: 'insensitive',
          },
        },

        {
          referenceNumber: {
            contains: filters.query,
            mode: 'insensitive',
          },
        },

        {
          title: {
            contains: filters.query,
            mode: 'insensitive',
          },
        },

        {
          department: {
            contains: filters.query,
            mode: 'insensitive',
          },
        },

        {
          district: {
            contains: filters.query,
            mode: 'insensitive',
          },
        },
      ];
    }

    /*
     * DEPARTMENT
     */
    if (filters.department) {
      where.department = {
        contains: filters.department,
        mode: 'insensitive',
      };
    }

    /*
     * STATE
     */
    if (filters.state) {
      where.state = {
        equals: filters.state,
        mode: 'insensitive',
      };
    }

    /*
     * DISTRICT
     */
    if (filters.district) {
      where.district = {
        equals: filters.district,
        mode: 'insensitive',
      };
    }

    /*
     * STATUS
     */
    if (filters.status) {
      where.status = {
        equals: filters.status,
        mode: 'insensitive',
      };
    }

    /*
     * AMOUNT FILTER
     */
    if (
      filters.minAmount !== undefined ||
      filters.maxAmount !== undefined
    ) {
      where.estimatedValue = {};

      if (filters.minAmount !== undefined) {
        where.estimatedValue.gte =
          new Prisma.Decimal(
            filters.minAmount,
          );
      }

      if (filters.maxAmount !== undefined) {
        where.estimatedValue.lte =
          new Prisma.Decimal(
            filters.maxAmount,
          );
      }
    }

    /*
     * FETCH DATA
     */
    const [total, tenders] =
      await Promise.all([
        prisma.tender.count({
          where,
        }),

        prisma.tender.findMany({
          where,

          take: filters.limit || 20,

          skip: filters.offset || 0,

          orderBy: {
            createdAt: 'desc',
          },

          include: {
            _count: {
              select: {
                bids: true,
                versions: true,
                auditEvents: true,
              },
            },

            bids: {
              select: {
                vendorName: true,
                bidAmount: true,
                status: true,
              },
            },

            /*
             * Only the latest version is required
             * for the amount integrity check.
             */
            versions: {
              orderBy: {
                versionNumber: 'desc',
              },

              take: 1,

              select: {
                versionNumber: true,
                data: true,
                newHash: true,
              },
            },
          },
        }),
      ]);

    /*
     * Check every tender returned by this request.
     */
    for (const tender of tenders) {
      await checkTenderAmountIntegrity(tender);
    }

    /*
     * Remove the internal versions property before
     * returning the normal tender list.
     */
    const cleanedTenders = tenders.map(
      ({ versions, ...tender }) => tender,
    );

    return {
      total,

      tenders: cleanedTenders,
    };
  },

  /*
   * ----------------------------------------------------
   * UPDATE BLOCKCHAIN STATUS
   * ----------------------------------------------------
   */
  async updateBlockchainStatus(
    tenderId: string,

    data: {
      blockchainStatus: string;

      blockchainTxId?: string;

      blockchainVerified?: boolean;
    },
  ) {
    return prisma.tender.update({
      where: {
        id: tenderId,
      },

      data,
    });
  },
};