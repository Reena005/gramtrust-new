import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { KaggleProcurementAdapter } from '@/adapters/kaggle-procurement.adapter.js';
import { versionService } from '@/services/version.service.js';
import { prisma } from '@/config/prisma.js';
import { AppError } from '@/utils/app-error.js';

async function main() {
  const csvPath = join(process.cwd(), '../datasets/procurement_tenders.csv');

  console.log('==============================================');
  console.log('GramTrust Procurement Dataset Import');
  console.log('==============================================');
  console.log(`CSV: ${csvPath}`);
  console.log('');

  const csvContent = await readFile(csvPath, 'utf8');

  const adapter = new KaggleProcurementAdapter();
  const records = await adapter.importDataset(csvContent, 'csv');

  console.log(`CSV converted into ${records.length} tender records.`);
  console.log('');

  if (records.length === 0) {
    throw new Error('No procurement tender records were found in the CSV.');
  }

  // Optional testing limit.
  // Example:
  // $env:IMPORT_LIMIT="1"
  // npx tsx scripts\import-procurement.ts
  //
  // If IMPORT_LIMIT is not set, the complete dataset is imported.
  const limitValue = process.env.IMPORT_LIMIT;
  const limit = limitValue ? Number(limitValue) : records.length;

  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('IMPORT_LIMIT must be a positive integer.');
  }

  const recordsToImport = records.slice(0, limit);

  console.log(`Importing ${recordsToImport.length} tender(s)...`);
  console.log('');

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const [index, record] of recordsToImport.entries()) {
    console.log(
      `[${index + 1}/${recordsToImport.length}] ` +
        `${record.tenderId} - ${record.tenderTitle} ` +
        `(${record.bids?.length ?? 0} bids)`,
    );

    try {
      const result = await versionService.importTender(record, {
        sourceName: record.sourceName,
        sourceUrl: record.sourceUrl,
      });

      imported += 1;

      console.log(
        `  ✓ Imported | Tender DB ID: ${result.tender.id} | ` +
          `Bids: ${record.bids?.length ?? 0} | ` +
          `Fabric: ${result.fabricTxId}`,
      );
    } catch (error) {
      // A tender that was already imported should not stop
      // the entire dataset import.
      if (
        error instanceof AppError &&
        error.statusCode === 409 &&
        error.message.includes('already imported')
      ) {
        skipped += 1;

        console.log(
          `  ↷ Skipped: ${record.tenderId} (already imported)`,
        );

        continue;
      }

      failed += 1;

      console.error(`  ✗ Failed: ${record.tenderId}`);

      if (error instanceof Error) {
        console.error(`    ${error.message}`);
      } else {
        console.error(error);
      }

      // Stop on unexpected errors so we don't silently
      // create a partially imported dataset.
      throw error;
    }
  }

  console.log('');
  console.log('==============================================');
  console.log('IMPORT COMPLETE');
  console.log('==============================================');
  console.log(`Requested:           ${recordsToImport.length}`);
  console.log(`Successfully added:  ${imported}`);
  console.log(`Already existed:     ${skipped}`);
  console.log(`Failed:              ${failed}`);
  console.log('');

  const counts = await prisma.$queryRaw<
    Array<{
      tenders: bigint;
      vendors: bigint;
      bids: bigint;
      tender_versions: bigint;
      bid_versions: bigint;
      tender_audit_events: bigint;
      source_snapshots: bigint;
    }>
  >`
    SELECT
      (SELECT COUNT(*) FROM tenders) AS tenders,
      (SELECT COUNT(*) FROM vendors) AS vendors,
      (SELECT COUNT(*) FROM bids) AS bids,
      (SELECT COUNT(*) FROM tender_versions) AS tender_versions,
      (SELECT COUNT(*) FROM bid_versions) AS bid_versions,
      (SELECT COUNT(*) FROM tender_audit_events) AS tender_audit_events,
      (SELECT COUNT(*) FROM source_snapshots) AS source_snapshots
  `;

  const count = counts[0];

  console.log('Database totals:');
  console.log(`  Tenders:             ${count.tenders}`);
  console.log(`  Vendors:             ${count.vendors}`);
  console.log(`  Bids:                ${count.bids}`);
  console.log(`  Tender versions:     ${count.tender_versions}`);
  console.log(`  Bid versions:        ${count.bid_versions}`);
  console.log(`  Tender audit events: ${count.tender_audit_events}`);
  console.log(`  Source snapshots:    ${count.source_snapshots}`);
  console.log('');
}

main()
  .catch((error) => {
    console.error('');
    console.error('PROCUREMENT IMPORT FAILED');

    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });