#!/usr/bin/env bun
/**
 * Import Enron emails using Cloudflare D1 REST API directly
 *
 * Much faster than wrangler CLI - uses direct HTTP API calls with batched SQL.
 *
 * Usage:
 *   bun scripts/import-enron-drizzle.ts                    # Staging
 *   bun scripts/import-enron-drizzle.ts --limit 1000       # Limit rows
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ============================================================================
// Configuration
// ============================================================================

const ACCOUNT_ID = 'b26e4af8b7631a2c8d99476fd7bce974';
const BENCHMARKS_DB_ID = 'e5357be6-fc4e-43ad-9b14-3a05189ed9f9';

// Try to read wrangler OAuth token if env var not set
function getApiToken(): string {
  if (process.env.CLOUDFLARE_D1_TOKEN) return process.env.CLOUDFLARE_D1_TOKEN;
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;

  // Try wrangler OAuth token
  const fs = require('fs');
  const path = require('path');
  const homedir = require('os').homedir();

  const configPaths = [
    path.join(homedir, '.config/.wrangler/config/default.toml'),
    path.join(homedir, '.wrangler/config/default.toml'),
  ];

  for (const configPath of configPaths) {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const match = content.match(/oauth_token\s*=\s*"([^"]+)"/);
      if (match) {
        console.log('Using wrangler OAuth token');
        return match[1];
      }
    } catch {}
  }

  return '';
}

const API_TOKEN = getApiToken();

const PARQUET_URL = 'https://huggingface.co/api/datasets/corbt/enron-emails/parquet/default/train/0.parquet';
const TEMP_DIR = path.join(process.cwd(), '.tmp');
const DEFAULT_PARQUET = path.join(TEMP_DIR, 'corbt-enron-0.parquet');

const MAX_BODY_SIZE = 50000; // 50KB max

// ============================================================================
// D1 REST API Client
// ============================================================================

interface D1Response {
  result: Array<{
    results: any[];
    success: boolean;
    meta: { changes: number; duration: number };
  }>;
  success: boolean;
  errors: any[];
}

async function executeD1Query(sql: string, params: any[] = []): Promise<D1Response> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${BENCHMARKS_DB_ID}/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`D1 API error ${response.status}: ${text}`);
  }

  return response.json();
}

// Build a multi-value INSERT statement
// SQLite limits params to 100, with 7 columns we can do ~14 rows per query
function buildBatchInsert(records: Array<{
  messageId: string;
  inbox: string;
  subject: string | null;
  sender: string | null;
  recipients: string | null;
  date: string | null;
  body: string | null;
}>): { sql: string; params: any[] } {
  const placeholders = records.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
  const params: any[] = [];

  for (const r of records) {
    params.push(r.messageId, r.inbox, r.subject, r.sender, r.recipients, r.date, r.body);
  }

  return {
    sql: `INSERT OR IGNORE INTO emails (message_id, inbox, subject, sender, recipients, date, body) VALUES ${placeholders}`,
    params,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function truncateBody(body: string | null | undefined): string | null {
  if (!body) return null;
  if (body.length <= MAX_BODY_SIZE) return body;
  return body.substring(0, MAX_BODY_SIZE) + '\n\n[... truncated ...]';
}

function extractInbox(row: any): string {
  const fileName = row.file_name;
  if (!fileName) return 'unknown';
  const parts = fileName.split('/');
  if (parts.length >= 2) {
    return parts[0] + '@enron.com';
  }
  return 'unknown@enron.com';
}

async function downloadParquet(url: string, dest: string): Promise<void> {
  if (fs.existsSync(dest)) {
    console.log(`Parquet file exists: ${dest}`);
    return;
  }

  console.log(`Downloading parquet from ${url}...`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buffer));
  console.log(`Downloaded ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB`);
}

async function readParquetWithPython(parquetPath: string, limit: number): Promise<any[]> {
  const outputPath = path.join(TEMP_DIR, 'emails.json');

  // Use cached JSON if it exists (faster than re-parsing parquet)
  if (fs.existsSync(outputPath)) {
    console.log(`Using cached JSON: ${outputPath}`);
    const data = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    console.log(`Loaded ${data.length} email records from cache`);
    if (limit > 0 && data.length > limit) {
      return data.slice(0, limit);
    }
    return data;
  }

  const scriptPath = path.join(TEMP_DIR, 'convert_parquet.py');

  // Use relative paths for Docker container
  const dockerParquetPath = '.tmp/' + path.basename(parquetPath);
  const dockerOutputPath = '.tmp/emails.json';

  const pythonScript = `
import pyarrow.parquet as pq
import json
from datetime import datetime

def serialize(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj

table = pq.read_table("${dockerParquetPath}")
limit = ${limit}
rows = min(table.num_rows, limit) if limit > 0 else table.num_rows

data = []
for i in range(rows):
    row = {col: serialize(table.column(col)[i].as_py()) for col in table.column_names}
    data.append(row)

with open("${dockerOutputPath}", "w") as f:
    json.dump(data, f)
print(f"Exported {len(data)} records")
`;

  fs.writeFileSync(scriptPath, pythonScript);

  console.log(`Reading parquet with Python: ${parquetPath}`);
  execSync(
    `docker run --rm -v ${process.cwd()}:/app -w /app python:3.11-slim bash -c "pip install pyarrow pandas -q 2>/dev/null && python3 .tmp/convert_parquet.py"`,
    { stdio: 'inherit' }
  );

  const data = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
  console.log(`Loaded ${data.length} email records`);
  return data;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  let limit = 0;
  let batchSize = 100;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' || args[i] === '-l') {
      limit = parseInt(args[++i], 10);
    } else if (args[i] === '--batch-size' || args[i] === '-b') {
      batchSize = parseInt(args[++i], 10);
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Import Enron emails using D1 REST API

Usage:
  bun scripts/import-enron-drizzle.ts [options]

Options:
  --limit, -l       Max emails to import (default: all)
  --batch-size, -b  Insert batch size (default: 100)
  --help, -h        Show this help

Environment:
  CLOUDFLARE_API_TOKEN  Required for D1 API access
`);
      process.exit(0);
    }
  }

  if (!API_TOKEN) {
    console.error('Error: CLOUDFLARE_API_TOKEN required');
    process.exit(1);
  }

  console.log('======================================================================');
  console.log('Enron Email Import (D1 REST API)');
  console.log('======================================================================');
  console.log(`Target:     STAGING (remote via REST API)`);
  console.log(`Limit:      ${limit || 'unlimited'}`);
  console.log(`Batch size: ${batchSize}`);
  console.log('----------------------------------------------------------------------');

  // Download parquet if needed
  await downloadParquet(PARQUET_URL, DEFAULT_PARQUET);

  // Read parquet data
  const emailData = await readParquetWithPython(DEFAULT_PARQUET, limit);

  // Get current count
  const countResult = await executeD1Query('SELECT COUNT(*) as count FROM emails');
  const startCount = countResult.result[0].results[0].count;
  console.log(`\nStarting count: ${startCount} emails`);

  // SQLite limits params to 100, with 7 columns we can do 14 rows per query
  const maxRowsPerQuery = 14;
  const effectiveBatchSize = Math.min(batchSize, maxRowsPerQuery);

  console.log(`\nImporting ${emailData.length} emails in batches of ${effectiveBatchSize} (limited by SQLite param limit)...`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;
  const startTime = Date.now();

  for (let i = 0; i < emailData.length; i += effectiveBatchSize) {
    const batch = emailData.slice(i, i + effectiveBatchSize);

    // Transform raw data to records
    const records = batch.map((row) => {
      const recipients: string[] = [];
      for (const field of ['to', 'cc', 'bcc']) {
        const val = row[field];
        if (Array.isArray(val)) {
          recipients.push(...val.filter((x: any) => x));
        }
      }

      return {
        messageId: row.message_id,
        inbox: extractInbox(row),
        subject: row.subject || null,
        sender: row.from || null,
        recipients: recipients.length > 0 ? JSON.stringify(recipients) : null,
        date: row.date || null,
        body: truncateBody(row.body),
      };
    });

    try {
      const { sql, params } = buildBatchInsert(records);
      const result = await executeD1Query(sql, params);

      if (result.success && result.result[0]) {
        const changes = result.result[0].meta.changes;
        imported += changes;
        skipped += batch.length - changes;
      } else {
        errors += batch.length;
        console.error(`\n  Batch error: ${JSON.stringify(result.errors)}`);
      }
    } catch (e: any) {
      errors += batch.length;
      if (!e.message.includes('UNIQUE constraint')) {
        console.error(`\n  Batch error: ${e.message}`);
      }
    }

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = (imported + skipped) / elapsed;
    const progress = i + batch.length;
    process.stdout.write(`\r  Progress: ${progress}/${emailData.length} (${imported} new, ${skipped} exist, ${errors} err, ${rate.toFixed(0)}/sec)   `);
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\n\nDone in ${elapsed.toFixed(1)}s`);
  console.log(`  Imported: ${imported}`);
  console.log(`  Skipped:  ${skipped} (already exist)`);
  console.log(`  Errors:   ${errors}`);

  // Final count
  const finalResult = await executeD1Query('SELECT COUNT(*) as count FROM emails');
  const endCount = finalResult.result[0].results[0].count;
  console.log(`  Final count: ${endCount} emails`);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
