import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pool } from '../src/config/db';

async function registerDocuments() {
  const documentsDir = path.resolve(process.cwd(), 'documents');

  if (!fs.existsSync(documentsDir)) {
    throw new Error(`Documents folder not found: ${documentsDir}`);
  }

  const files = fs
    .readdirSync(documentsDir)
    .filter((file) => /^DOC\d+\.pdf$/i.test(file))
    .sort((a, b) => {
      const aNum = parseInt(a.match(/\d+/)?.[0] || '0', 10);
      const bNum = parseInt(b.match(/\d+/)?.[0] || '0', 10);
      return aNum - bNum;
    });

  console.log(`Found ${files.length} PDF documents.`);

  let inserted = 0;
  let skipped = 0;

  for (const file of files) {
    const id = path.basename(file, '.pdf').toUpperCase();
    const filePath = `documents/${file}`;

    const absolutePath = path.join(documentsDir, file);
    const buffer = fs.readFileSync(absolutePath);

    const sha256Hash = crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex');

    const result = await pool.query(
      `
      INSERT INTO document_records (
        id,
        document_name,
        document_type,
        file_path,
        sha256_hash,
        source_dataset,
        verification_status,
        is_tampered
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        id,
        file,
        'PDF',
        filePath,
        sha256Hash,
        'MGNREGA',
        'PENDING',
        false,
      ],
    );

    if (result.rowCount === 1) {
      inserted++;
      console.log(`Registered ${id}`);
    } else {
      skipped++;
      console.log(`Skipped ${id} (already exists)`);
    }
  }

  console.log('');
  console.log('Registration complete.');
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Total:    ${files.length}`);

  await pool.end();
}

registerDocuments().catch(async (error) => {
  console.error('Document registration failed:', error);
  await pool.end();
  process.exit(1);
});