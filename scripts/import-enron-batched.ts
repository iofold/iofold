#!/usr/bin/env bun
/**
 * Import Enron emails to BENCHMARKS_DB using wrangler d1 execute
 *
 * Uses batched SQL inserts to avoid wrangler crashes on large files.
 *
 * Usage:
 *   bun scripts/import-enron-batched.ts --limit 10000
 *   bun scripts/import-enron-batched.ts --limit 10000 --remote  # For staging
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Configuration
// ============================================================================

interface Config {
  parquetPath: string;
  limit: number;
  batchSize: number;
  remote: boolean;
}

const PARQUET_URL =
  'https://huggingface.co/api/datasets/corbt/enron-emails/parquet/default/train/0.parquet';
const TEMP_DIR = path.join(process.cwd(), '.tmp');
const DEFAULT_PARQUET = path.join(TEMP_DIR, 'corbt-enron-0.parquet');

// ============================================================================
// Helpers
// ============================================================================

function escapeSql(s: string | null | undefined): string {
  if (s == null) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function extractInbox(row: any): string {
  const fileName = row.file_name;
  if (fileName) {
    const parts = String(fileName).split('/');
    if (parts[0]) {
      const username = parts[0].replace(/-/g, '.');
      if (!username.includes('@')) {
        return `${username}@enron.com`;
      }
    }
  }
  return row.from || 'unknown@enron.com';
}

async function downloadParquet(url: string, dest: string): Promise<void> {
  console.log(`Downloading: ${url}`);
  console.log(`To: ${dest}`);

  fs.mkdirSync(path.dirname(dest), { recursive: true });

  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buffer));
  console.log(`Downloaded ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB`);
}

async function readParquetWithPython(parquetPath: string, limit: number): Promise<any[]> {
  console.log(`\nReading parquet with Python: ${parquetPath}`);

  const outputPath = path.join(TEMP_DIR, 'enron-emails.json');

  // Use relative paths for Docker
  const relParquet = path.relative(process.cwd(), parquetPath);
  const relOutput = path.relative(process.cwd(), outputPath);

  // Write Python script to file to avoid escaping issues
  const pythonScript = `
import pyarrow.parquet as pq
import json
import sys

table = pq.read_table('${relParquet}')
limit = ${limit}
rows = min(table.num_rows, limit) if limit > 0 else table.num_rows

df = table.slice(0, rows).to_pandas()
records = df.to_dict(orient='records')

# Convert timestamps to strings and numpy arrays to lists
for r in records:
    if r.get('date') is not None:
        r['date'] = str(r['date'])[:19]
    for field in ['to', 'cc', 'bcc']:
        if r.get(field) is not None:
            r[field] = list(r[field])

with open('${relOutput}', 'w') as f:
    json.dump(records, f)

print(f'Exported {len(records)} records', file=sys.stderr)
`;

  // Write script to temp file
  const scriptPath = path.join(TEMP_DIR, 'convert_parquet.py');
  fs.writeFileSync(scriptPath, pythonScript);

  // Run Python in Docker
  const cmd = `docker run --rm -v ${process.cwd()}:/app -w /app python:3.11-slim bash -c "pip install pyarrow pandas -q 2>/dev/null && python3 .tmp/convert_parquet.py"`;

  try {
    execSync(cmd, { stdio: ['pipe', 'pipe', 'inherit'] });
  } catch (e: any) {
    throw new Error(`Python parquet conversion failed: ${e.message}`);
  }

  const data = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
  console.log(`Loaded ${data.length} email records`);
  return data;
}

function executeWrangler(sql: string, remote: boolean): void {
  const remoteFlag = remote ? '--remote --env staging' : '--local';

  // Write SQL to temp file
  const sqlFile = path.join(TEMP_DIR, 'batch.sql');
  fs.writeFileSync(sqlFile, sql);

  const cmd = remote
    ? `npx wrangler d1 execute BENCHMARKS_DB ${remoteFlag} --file=${sqlFile}`
    : `docker exec iofold-backend npx wrangler d1 execute BENCHMARKS_DB --local --file=/app/.tmp/batch.sql`;

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 60000 });
  } catch (e: any) {
    const stderr = e.stderr?.toString() || '';
    if (stderr.includes('UNIQUE constraint')) {
      // Ignore duplicate key errors
      return;
    }
    throw new Error(`Wrangler execute failed: ${stderr || e.message}`);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const config: Config = {
    parquetPath: DEFAULT_PARQUET,
    limit: 10000,
    batchSize: 50, // Small batches to avoid wrangler crashes
    remote: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--parquet':
      case '-p':
        config.parquetPath = args[++i];
        break;
      case '--limit':
      case '-l':
        config.limit = parseInt(args[++i], 10);
        break;
      case '--batch-size':
      case '-b':
        config.batchSize = parseInt(args[++i], 10);
        break;
      case '--remote':
        config.remote = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Import Enron emails to BENCHMARKS_DB

Usage:
  bun scripts/import-enron-batched.ts [options]

Options:
  --parquet, -p   Path to parquet file (default: auto-download)
  --limit, -l     Max emails to import (default: 10000)
  --batch-size    SQL batch size (default: 50)
  --remote        Use remote D1 (staging)
  --help, -h      Show help
`);
        process.exit(0);
    }
  }

  console.log('='.repeat(70));
  console.log('Enron Email Import (Batched)');
  console.log('='.repeat(70));
  console.log(`Parquet:    ${config.parquetPath}`);
  console.log(`Limit:      ${config.limit}`);
  console.log(`Batch size: ${config.batchSize}`);
  console.log(`Target:     ${config.remote ? 'REMOTE (staging)' : 'LOCAL'}`);
  console.log('-'.repeat(70));

  // Download parquet if needed
  if (!fs.existsSync(config.parquetPath)) {
    await downloadParquet(PARQUET_URL, config.parquetPath);
  }

  // Read parquet data
  const emails = await readParquetWithPython(config.parquetPath, config.limit);

  // Import in batches
  console.log(`\nImporting ${emails.length} emails in batches of ${config.batchSize}...`);

  let imported = 0;
  let errors = 0;
  const startTime = Date.now();

  for (let i = 0; i < emails.length; i += config.batchSize) {
    const batch = emails.slice(i, i + config.batchSize);

    // Build SQL for this batch
    const inserts = batch.map((row) => {
      const messageId = escapeSql(row.message_id);
      const inbox = escapeSql(extractInbox(row));
      const subject = escapeSql(row.subject);
      const sender = escapeSql(row.from);

      // Combine recipients
      const recipients: string[] = [];
      for (const field of ['to', 'cc', 'bcc']) {
        const val = row[field];
        if (Array.isArray(val)) {
          recipients.push(...val.filter((x: any) => x));
        }
      }
      const recipientsJson = recipients.length > 0 ? escapeSql(JSON.stringify(recipients)) : 'NULL';

      const date = row.date ? escapeSql(row.date) : 'NULL';
      const body = escapeSql(row.body);

      return `INSERT OR IGNORE INTO emails (message_id, inbox, subject, sender, recipients, date, body) VALUES (${messageId}, ${inbox}, ${subject}, ${sender}, ${recipientsJson}, ${date}, ${body});`;
    });

    const sql = inserts.join('\n');

    try {
      executeWrangler(sql, config.remote);
      imported += batch.length;
    } catch (e: any) {
      errors += batch.length;
      console.error(`  Batch error: ${e.message}`);
    }

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = imported / elapsed;
    process.stdout.write(
      `\r  Progress: ${i + batch.length}/${emails.length} (${imported} imported, ${errors} errors, ${rate.toFixed(0)}/sec)   `
    );
  }

  console.log('\n');
  console.log('='.repeat(70));
  console.log('Import complete!');
  console.log(`  Imported: ${imported}`);
  console.log(`  Errors:   ${errors}`);
  console.log(`  Time:     ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  console.log('='.repeat(70));
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
