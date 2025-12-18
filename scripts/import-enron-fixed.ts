#!/usr/bin/env bun
/**
 * Import Enron emails to BENCHMARKS_DB with CORRECT inbox addresses
 *
 * FIX: Use actual email addresses (from `from` field for sent mail) instead of
 * folder-derived addresses (allen-p → allen.p@enron.com was WRONG)
 *
 * The inbox should be the actual email address like `phillip.allen@enron.com`
 * not the folder-derived `allen.p@enron.com`
 *
 * Usage:
 *   bun scripts/import-enron-fixed.ts --limit 200000
 *   bun scripts/import-enron-fixed.ts --limit 200000 --remote  # For staging
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

const MAX_BODY_SIZE = 50000; // 50KB max to avoid SQLITE_TOOBIG

function escapeSql(s: string | null | undefined): string {
  if (s == null) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function truncateBody(body: string | null | undefined): string | null {
  if (!body) return null;
  if (body.length <= MAX_BODY_SIZE) return body;
  return body.substring(0, MAX_BODY_SIZE) + '\n\n[... truncated ...]';
}

/**
 * Build mapping from folder prefix to actual email address
 *
 * Strategy:
 * 1. For _sent_mail folders, the `from` field is the inbox owner
 * 2. Build a map: folder_prefix -> actual_email
 * 3. Use this map to determine inbox for all emails
 */
function buildInboxMapping(emails: any[]): Map<string, string> {
  const mapping = new Map<string, string>();
  const counts = new Map<string, Map<string, number>>();

  for (const row of emails) {
    const fileName = row.file_name;
    if (!fileName) continue;

    const parts = String(fileName).split('/');
    const folderPrefix = parts[0]; // e.g., "allen-p"

    if (!folderPrefix) continue;

    // For sent mail, the `from` field is the inbox owner
    const isSentMail = fileName.includes('_sent_mail') || fileName.includes('sent_items');
    const fromAddr = row.from?.toLowerCase();

    if (isSentMail && fromAddr && fromAddr.includes('@enron.com')) {
      // This is reliable - sent mail's from = inbox owner
      if (!mapping.has(folderPrefix)) {
        mapping.set(folderPrefix, fromAddr);
      }
    }

    // Also count all `from` addresses per folder for fallback
    if (fromAddr) {
      if (!counts.has(folderPrefix)) {
        counts.set(folderPrefix, new Map());
      }
      const folderCounts = counts.get(folderPrefix)!;
      folderCounts.set(fromAddr, (folderCounts.get(fromAddr) || 0) + 1);
    }
  }

  // For folders without sent_mail, use most common `from` address
  for (const [prefix, addrCounts] of counts) {
    if (!mapping.has(prefix)) {
      let maxAddr = '';
      let maxCount = 0;
      for (const [addr, count] of addrCounts) {
        if (count > maxCount && addr.includes('@enron.com')) {
          maxCount = count;
          maxAddr = addr;
        }
      }
      if (maxAddr) {
        mapping.set(prefix, maxAddr);
      }
    }
  }

  return mapping;
}

/**
 * Extract inbox using the mapping
 */
function extractInbox(row: any, inboxMapping: Map<string, string>): string {
  const fileName = row.file_name;
  if (fileName) {
    const parts = String(fileName).split('/');
    const folderPrefix = parts[0];

    // Use mapping if available
    if (folderPrefix && inboxMapping.has(folderPrefix)) {
      return inboxMapping.get(folderPrefix)!;
    }

    // Fallback: for sent mail, use from field directly
    const isSentMail = fileName.includes('_sent_mail') || fileName.includes('sent_items');
    if (isSentMail && row.from) {
      return row.from.toLowerCase();
    }
  }

  // Last resort: use from field
  return row.from?.toLowerCase() || 'unknown@enron.com';
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

function executeWrangler(sql: string, remote: boolean, maxRetries = 3): void {
  let cmd: string;
  const sqlFile = path.join(TEMP_DIR, 'batch.sql');
  fs.writeFileSync(sqlFile, sql);

  if (remote) {
    cmd = `npx wrangler d1 execute iofold-benchmarks --remote --env staging --file "${sqlFile}"`;
  } else {
    cmd = `docker exec iofold-backend npx wrangler d1 execute BENCHMARKS_DB --local --file=/app/.tmp/batch.sql`;
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      execSync(cmd, { stdio: 'pipe', timeout: 90000 });
      return;
    } catch (e: any) {
      const stderr = e.stderr?.toString() || '';
      if (stderr.includes('UNIQUE constraint')) {
        return; // Duplicate - OK
      }
      if (attempt < maxRetries && (stderr.includes('File contents did not upload') || stderr.includes('ECONNRESET') || stderr.includes('timeout'))) {
        const waitMs = attempt * 1000;
        execSync(`sleep ${waitMs / 1000}`);
        continue;
      }
      throw new Error(`Wrangler execute failed: ${stderr || e.message}`);
    }
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const config: Config = {
    parquetPath: DEFAULT_PARQUET,
    limit: 0,
    batchSize: 20,
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
Import Enron emails to BENCHMARKS_DB (FIXED inbox addresses)

Usage:
  bun scripts/import-enron-fixed.ts [options]

Options:
  --parquet, -p   Path to parquet file (default: auto-download)
  --limit, -l     Max emails to import (default: unlimited)
  --batch-size    SQL batch size (default: 20)
  --remote        Use remote D1 (staging)
  --help, -h      Show help
`);
        process.exit(0);
    }
  }

  console.log('='.repeat(70));
  console.log('Enron Email Import (FIXED inbox addresses)');
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

  // Build inbox mapping from folder prefixes to actual email addresses
  console.log('\nBuilding inbox mapping from sent mail...');
  const inboxMapping = buildInboxMapping(emails);
  console.log(`  Found ${inboxMapping.size} folder -> email mappings`);

  // Show some mappings
  let shown = 0;
  for (const [prefix, email] of inboxMapping) {
    if (shown++ < 5) {
      console.log(`    ${prefix} -> ${email}`);
    }
  }
  if (inboxMapping.size > 5) {
    console.log(`    ... and ${inboxMapping.size - 5} more`);
  }

  // Clear existing data
  console.log('\nClearing existing emails...');
  try {
    executeWrangler('DELETE FROM emails;', config.remote);
    console.log('  Cleared existing data');
  } catch (e) {
    console.log('  No existing data to clear');
  }

  // Import in batches
  console.log(`\nImporting ${emails.length} emails in batches of ${config.batchSize}...`);

  let imported = 0;
  let errors = 0;
  const startTime = Date.now();

  for (let i = 0; i < emails.length; i += config.batchSize) {
    const batch = emails.slice(i, i + config.batchSize);

    const inserts = batch.map((row) => {
      const messageId = escapeSql(row.message_id);
      const inbox = escapeSql(extractInbox(row, inboxMapping));
      const subject = escapeSql(row.subject);
      const sender = escapeSql(row.from);

      const recipients: string[] = [];
      for (const field of ['to', 'cc', 'bcc']) {
        const val = row[field];
        if (Array.isArray(val)) {
          recipients.push(...val.filter((x: any) => x));
        }
      }
      const recipientsJson = recipients.length > 0 ? escapeSql(JSON.stringify(recipients)) : 'NULL';

      const date = row.date ? escapeSql(row.date) : 'NULL';
      const body = escapeSql(truncateBody(row.body));

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

  // Rebuild FTS index
  console.log('\n\nRebuilding FTS index...');
  try {
    executeWrangler("INSERT INTO emails_fts(emails_fts) VALUES('rebuild');", config.remote);
    console.log('  FTS index rebuilt');
  } catch (e) {
    console.log('  FTS rebuild skipped (may not exist)');
  }

  console.log('\n');
  console.log('='.repeat(70));
  console.log('Import complete!');
  console.log(`  Imported: ${imported}`);
  console.log(`  Errors:   ${errors}`);
  console.log(`  Time:     ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  console.log('='.repeat(70));

  // Show sample inboxes
  console.log('\nSample inboxes in database:');
  try {
    const result = execSync(
      config.remote
        ? `npx wrangler d1 execute iofold-benchmarks --remote --env staging --command "SELECT DISTINCT inbox FROM emails ORDER BY inbox LIMIT 10" --json`
        : `docker exec iofold-backend npx wrangler d1 execute BENCHMARKS_DB --local --command "SELECT DISTINCT inbox FROM emails ORDER BY inbox LIMIT 10" --json`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const rows = JSON.parse(result)[0]?.results || [];
    for (const row of rows) {
      console.log(`  ${row.inbox}`);
    }
  } catch (e) {
    console.log('  (Could not fetch sample)');
  }
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
