#!/usr/bin/env bun
/**
 * Complete Enron Email Import
 *
 * Downloads all 3 parquet shards (~500k emails) and imports to D1.
 * - Truncates large email bodies to avoid SQLITE_TOOBIG
 * - Uses single inserts for reliability
 * - Skips duplicates with INSERT OR IGNORE
 *
 * Usage:
 *   bun scripts/import-enron-complete.ts --local           # Local DB
 *   bun scripts/import-enron-complete.ts --remote          # Staging DB
 *   bun scripts/import-enron-complete.ts --local --limit 1000
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const TEMP_DIR = path.join(process.cwd(), '.tmp');
const MAX_BODY_SIZE = 50000; // 50KB max body size to avoid SQLITE_TOOBIG

// All parquet shards from HuggingFace
const PARQUET_URLS = [
  'https://huggingface.co/api/datasets/corbt/enron-emails/parquet/default/train/0.parquet',
  'https://huggingface.co/api/datasets/corbt/enron-emails/parquet/default/train/1.parquet',
  'https://huggingface.co/api/datasets/corbt/enron-emails/parquet/default/train/2.parquet',
];

interface Config {
  remote: boolean;
  limit: number;
  startShard: number;
  endShard: number;
}

function escapeSql(s: string | null | undefined): string {
  if (s == null) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function truncateBody(body: string | null | undefined): string | null {
  if (!body) return null;
  if (body.length <= MAX_BODY_SIZE) return body;
  return body.substring(0, MAX_BODY_SIZE) + '\n\n[... truncated ...]';
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
  if (fs.existsSync(dest)) {
    console.log(`  Already have: ${path.basename(dest)}`);
    return;
  }

  console.log(`  Downloading: ${path.basename(dest)}...`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buffer));
  console.log(`    Downloaded ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB`);
}

async function readParquetWithPython(parquetPath: string, limit: number): Promise<any[]> {
  const outputPath = path.join(TEMP_DIR, 'emails-batch.json');
  const relParquet = path.relative(process.cwd(), parquetPath);
  const relOutput = path.relative(process.cwd(), outputPath);

  const pythonScript = `
import pyarrow.parquet as pq
import json
import sys

table = pq.read_table('${relParquet}')
limit = ${limit}
rows = min(table.num_rows, limit) if limit > 0 else table.num_rows

df = table.slice(0, rows).to_pandas()
records = df.to_dict(orient='records')

for r in records:
    if r.get('date') is not None:
        r['date'] = str(r['date'])[:19]
    for field in ['to', 'cc', 'bcc']:
        if r.get(field) is not None:
            r[field] = list(r[field])

with open('${relOutput}', 'w') as f:
    json.dump(records, f)

print(f'{len(records)}', file=sys.stderr)
`;

  const scriptPath = path.join(TEMP_DIR, 'read_parquet.py');
  fs.writeFileSync(scriptPath, pythonScript);

  const cmd = `docker run --rm -v ${process.cwd()}:/app -w /app python:3.11-slim bash -c "pip install pyarrow pandas -q 2>/dev/null && python3 .tmp/read_parquet.py"`;

  try {
    execSync(cmd, { stdio: ['pipe', 'pipe', 'inherit'] });
  } catch (e: any) {
    throw new Error(`Python parquet conversion failed: ${e.message}`);
  }

  return JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
}

function executeWrangler(sql: string, remote: boolean): boolean {
  const sqlFile = path.join(TEMP_DIR, 'insert.sql');
  fs.writeFileSync(sqlFile, sql);

  const cmd = remote
    ? `npx wrangler d1 execute iofold-benchmarks --remote --env staging --file=${sqlFile}`
    : `docker exec iofold-backend npx wrangler d1 execute iofold-benchmarks --local --file=/app/.tmp/insert.sql`;

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 30000 });
    return true;
  } catch (e: any) {
    const stderr = e.stderr?.toString() || '';
    if (stderr.includes('UNIQUE constraint')) {
      return true; // Duplicate - that's OK
    }
    return false;
  }
}

async function importShard(
  shardIndex: number,
  config: Config,
  startTime: number,
  stats: { imported: number; skipped: number; errors: number }
): Promise<void> {
  const url = PARQUET_URLS[shardIndex];
  const parquetPath = path.join(TEMP_DIR, `enron-shard-${shardIndex}.parquet`);

  console.log(`\n[Shard ${shardIndex}] Loading...`);
  await downloadParquet(url, parquetPath);

  const emails = await readParquetWithPython(parquetPath, config.limit);
  console.log(`  Read ${emails.length} emails`);

  for (let i = 0; i < emails.length; i++) {
    const row = emails[i];

    const messageId = escapeSql(row.message_id);
    const inbox = escapeSql(extractInbox(row));
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

    const sql = `INSERT OR IGNORE INTO emails (message_id, inbox, subject, sender, recipients, date, body) VALUES (${messageId}, ${inbox}, ${subject}, ${sender}, ${recipientsJson}, ${date}, ${body});`;

    const success = executeWrangler(sql, config.remote);
    if (success) {
      stats.imported++;
    } else {
      stats.errors++;
    }

    if ((i + 1) % 100 === 0 || i === emails.length - 1) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = stats.imported / elapsed;
      const total = stats.imported + stats.skipped + stats.errors;
      process.stdout.write(
        `\r  Shard ${shardIndex}: ${i + 1}/${emails.length} | Total: ${total} (${stats.imported} new, ${stats.errors} err) @ ${rate.toFixed(0)}/sec   `
      );
    }
  }
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  const config: Config = {
    remote: false,
    limit: 0, // 0 = unlimited
    startShard: 0,
    endShard: 2,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--remote':
        config.remote = true;
        break;
      case '--local':
        config.remote = false;
        break;
      case '--limit':
      case '-l':
        config.limit = parseInt(args[++i], 10);
        break;
      case '--shard':
        const shard = parseInt(args[++i], 10);
        config.startShard = shard;
        config.endShard = shard;
        break;
      case '--help':
      case '-h':
        console.log(`
Complete Enron Email Import

Usage:
  bun scripts/import-enron-complete.ts [options]

Options:
  --local       Import to local D1 (default)
  --remote      Import to staging D1
  --limit, -l   Limit emails per shard (default: unlimited)
  --shard <n>   Import only shard n (0, 1, or 2)
  --help, -h    Show help

Examples:
  bun scripts/import-enron-complete.ts --local
  bun scripts/import-enron-complete.ts --remote --limit 10000
  bun scripts/import-enron-complete.ts --local --shard 1
`);
        process.exit(0);
    }
  }

  console.log('='.repeat(70));
  console.log('Enron Complete Email Import');
  console.log('='.repeat(70));
  console.log(`Target:      ${config.remote ? 'STAGING (remote)' : 'LOCAL (Docker)'}`);
  console.log(`Shards:      ${config.startShard} to ${config.endShard}`);
  console.log(`Limit:       ${config.limit || 'unlimited'} per shard`);
  console.log(`Max body:    ${MAX_BODY_SIZE} chars`);
  console.log('-'.repeat(70));

  const stats = { imported: 0, skipped: 0, errors: 0 };
  const startTime = Date.now();

  for (let shard = config.startShard; shard <= config.endShard; shard++) {
    await importShard(shard, config, startTime, stats);
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log('\n' + '='.repeat(70));
  console.log('Import complete!');
  console.log(`  Imported: ${stats.imported}`);
  console.log(`  Errors:   ${stats.errors}`);
  console.log(`  Time:     ${elapsed.toFixed(1)}s`);
  console.log('='.repeat(70));
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
