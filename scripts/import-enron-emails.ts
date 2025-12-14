#!/usr/bin/env bun
/**
 * Enron Email Dataset Import Script (Parquet)
 *
 * Downloads and imports the Enron email dataset from HuggingFace into BENCHMARKS_DB.
 * Uses the corbt/enron-emails dataset (517k emails in parquet format).
 *
 * Dataset: https://huggingface.co/datasets/corbt/enron-emails
 *
 * Usage:
 *   bun scripts/import-enron-emails.ts [options]
 *
 * Options:
 *   --limit, -l          Limit number of emails to import (default: 1000)
 *   --output, -o         Output SQL file instead of direct import
 *   --local              Use local D1 database (default: false)
 *   --database-id, -d    D1 Database ID for remote (default: from wrangler.toml)
 *   --batch-size, -b     Batch size for SQL inserts (default: 100)
 *   --parquet-path, -p   Path to local parquet file (default: download from HF)
 *   --help, -h           Show help
 *
 * Examples:
 *   # Import 1000 emails to local database
 *   bun scripts/import-enron-emails.ts --local --limit 1000
 *
 *   # Generate SQL file with 10k emails
 *   bun scripts/import-enron-emails.ts --limit 10000 --output .tmp/enron-import.sql
 *
 *   # Import from local parquet file
 *   bun scripts/import-enron-emails.ts --local --parquet-path ./train.parquet
 *
 * Database Schema:
 *   CREATE TABLE emails (
 *     message_id TEXT PRIMARY KEY,
 *     inbox TEXT NOT NULL,
 *     subject TEXT,
 *     sender TEXT,
 *     recipients TEXT,  -- JSON array
 *     date TEXT,
 *     body TEXT
 *   );
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ============================================================================
// Configuration
// ============================================================================

interface Config {
  limit: number;
  outputFile?: string;
  local: boolean;
  databaseId?: string;
  batchSize: number;
  parquetPath?: string;
}

// HuggingFace parquet API endpoint for corbt/enron-emails dataset
// Dataset: https://huggingface.co/datasets/corbt/enron-emails (~517k emails)
// Schema: message_id, subject, from, to[], cc[], bcc[], date, body, file_name
const HUGGINGFACE_PARQUET_FILES = [
  'https://huggingface.co/api/datasets/corbt/enron-emails/parquet/default/train/0.parquet',
  'https://huggingface.co/api/datasets/corbt/enron-emails/parquet/default/train/1.parquet',
  'https://huggingface.co/api/datasets/corbt/enron-emails/parquet/default/train/2.parquet',
];
const HUGGINGFACE_URL = HUGGINGFACE_PARQUET_FILES[0]; // Default to first shard
const TEMP_DIR = path.join(process.cwd(), '.tmp');
const DEFAULT_PARQUET_PATH = path.join(TEMP_DIR, 'enron-emails.parquet');

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function parseArgs(): Config {
  const args = process.argv.slice(2);
  const config: Config = {
    limit: 1000,
    local: false,
    batchSize: 100,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--limit' || arg === '-l') {
      config.limit = parseInt(args[++i], 10);
      if (isNaN(config.limit) || config.limit < 0) {
        console.error('Error: --limit must be a non-negative number');
        process.exit(1);
      }
    } else if (arg === '--output' || arg === '-o') {
      config.outputFile = args[++i];
    } else if (arg === '--local') {
      config.local = true;
    } else if (arg === '--database-id' || arg === '-d') {
      config.databaseId = args[++i];
    } else if (arg === '--batch-size' || arg === '-b') {
      config.batchSize = parseInt(args[++i], 10);
      if (isNaN(config.batchSize) || config.batchSize < 1) {
        console.error('Error: --batch-size must be a positive number');
        process.exit(1);
      }
    } else if (arg === '--parquet-path' || arg === '-p') {
      config.parquetPath = args[++i];
    }
  }

  return config;
}

function printHelp(): void {
  console.log(`
Enron Email Dataset Import Script (Parquet)

Downloads and imports emails from HuggingFace corbt/enron-emails dataset.

Usage:
  bun scripts/import-enron-emails.ts [options]

Options:
  --limit, -l <num>        Max emails to import (default: 1000, 0 = all)
  --output, -o <file>      Output SQL file instead of direct import
  --local                  Use local D1 database (default: false)
  --database-id, -d <id>   D1 Database ID for remote
  --batch-size, -b <num>   Batch size for SQL inserts (default: 100)
  --parquet-path, -p <path> Path to local parquet file
  --help, -h               Show this help

Examples:
  # Import 1000 emails to local database
  bun scripts/import-enron-emails.ts --local --limit 1000

  # Generate SQL file with 10k emails
  bun scripts/import-enron-emails.ts --limit 10000 --output .tmp/enron-import.sql

  # Import from local parquet file
  bun scripts/import-enron-emails.ts --local --parquet-path ./train.parquet
`);
}

// ============================================================================
// Parquet Download
// ============================================================================

async function downloadParquet(url: string, outputPath: string): Promise<void> {
  console.log(`\nDownloading Enron emails parquet file...`);
  console.log(`URL: ${url}`);
  console.log(`Output: ${outputPath}`);

  // Ensure .tmp directory exists
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('Response body is null');
  }

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(buffer));

  const sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(2);
  console.log(`Downloaded ${sizeMB} MB`);
}

// ============================================================================
// Parquet Parsing
// ============================================================================

interface EmailRecord {
  message_id: string;
  subject: string | null;
  from: string | null;
  to: string[] | null;
  cc: string[] | null;
  bcc: string[] | null;
  body: string | null;
  file_name: string;
  date: string | null;
}

interface EmailRow {
  message_id: string;
  inbox: string;
  subject: string | null;
  sender: string | null;
  recipients: string | null; // JSON array string
  date: string | null;
  body: string | null;
}

/**
 * Parse parquet file using parquetjs
 *
 * Note: Requires parquetjs package. Install with: pnpm add -D parquetjs
 */
async function parseParquet(filePath: string, limit: number): Promise<EmailRow[]> {
  console.log(`\nParsing parquet file: ${filePath}`);
  console.log(`Limit: ${limit === 0 ? 'unlimited' : limit}`);

  try {
    // parquetjs uses CommonJS, so require it properly
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const parquet = require('parquetjs');

    const reader = await parquet.ParquetReader.openFile(filePath);
    const cursor = reader.getCursor();

    const emails: EmailRow[] = [];
    let count = 0;

    while (true) {
      const record = await cursor.next();
      if (!record) break;

      const emailRecord = record as EmailRecord;

      // Extract inbox from file_name (e.g., "sent_mail/phillip.allen@enron.com/123")
      // or from the 'from' field
      const inbox = extractInbox(emailRecord);

      // Combine to, cc, bcc into recipients
      const recipients = combineRecipients(emailRecord);

      emails.push({
        message_id: emailRecord.message_id,
        inbox,
        subject: emailRecord.subject,
        sender: emailRecord.from,
        recipients: recipients ? JSON.stringify(recipients) : null,
        date: emailRecord.date,
        body: emailRecord.body,
      });

      count++;
      if (limit > 0 && count >= limit) {
        console.log(`Reached limit of ${limit} emails`);
        break;
      }

      // Progress indicator
      if (count % 10000 === 0) {
        process.stdout.write(`\rParsed ${count.toLocaleString()} emails...`);
      }
    }

    await reader.close();

    console.log(`\nParsed ${emails.length.toLocaleString()} emails total`);
    return emails;
  } catch (error: any) {
    if (error.message?.includes('Cannot find module') || error.code === 'MODULE_NOT_FOUND') {
      console.error('\nError: parquetjs is not installed.');
      console.error('Install it with: pnpm add -D parquetjs');
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Extract inbox email address from record
 */
function extractInbox(record: EmailRecord): string {
  // Try to extract from file_name (e.g., "allen-p/sent_items/1" -> "allen-p")
  if (record.file_name) {
    const parts = record.file_name.split('/');
    if (parts.length > 0) {
      const username = parts[0];
      // If it looks like a username (not an email), append @enron.com
      if (username && !username.includes('@')) {
        return `${username}@enron.com`;
      }
    }
  }

  // Fall back to 'from' field
  if (record.from) {
    return record.from;
  }

  // Default fallback
  return 'unknown@enron.com';
}

/**
 * Combine to, cc, bcc into single recipients array
 */
function combineRecipients(record: EmailRecord): string[] | null {
  const recipients: string[] = [];

  if (record.to && Array.isArray(record.to)) {
    recipients.push(...record.to);
  }
  if (record.cc && Array.isArray(record.cc)) {
    recipients.push(...record.cc);
  }
  if (record.bcc && Array.isArray(record.bcc)) {
    recipients.push(...record.bcc);
  }

  return recipients.length > 0 ? recipients : null;
}

// ============================================================================
// SQL Generation
// ============================================================================

/**
 * Escape SQL string (handle quotes)
 */
function escapeSQLString(str: string): string {
  return `'${str.replace(/'/g, "''")}'`;
}

/**
 * Build batch insert SQL
 */
function buildBatchInsertSQL(emails: EmailRow[]): string {
  const values = emails
    .map((email) => {
      const messageId = escapeSQLString(email.message_id);
      const inbox = escapeSQLString(email.inbox);
      const subject = email.subject ? escapeSQLString(email.subject) : 'NULL';
      const sender = email.sender ? escapeSQLString(email.sender) : 'NULL';
      const recipients = email.recipients ? escapeSQLString(email.recipients) : 'NULL';
      const date = email.date ? escapeSQLString(email.date) : 'NULL';
      const body = email.body ? escapeSQLString(email.body) : 'NULL';

      return `(${messageId}, ${inbox}, ${subject}, ${sender}, ${recipients}, ${date}, ${body})`;
    })
    .join(',\n  ');

  return `
INSERT OR IGNORE INTO emails (message_id, inbox, subject, sender, recipients, date, body)
VALUES
  ${values};
`;
}

/**
 * Generate SQL file
 */
function generateSQLFile(emails: EmailRow[], outputFile: string, batchSize: number): void {
  console.log(`\nGenerating SQL file: ${outputFile}`);
  console.log(`Batch size: ${batchSize}`);

  // Ensure output directory exists
  const outputDir = path.dirname(outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write SQL in batches
  let sql = '-- Enron Email Import SQL\n';
  sql += `-- Generated: ${new Date().toISOString()}\n`;
  sql += `-- Total emails: ${emails.length}\n\n`;

  const batches = Math.ceil(emails.length / batchSize);
  for (let i = 0; i < batches; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, emails.length);
    const batch = emails.slice(start, end);

    sql += `-- Batch ${i + 1}/${batches} (${start + 1}-${end})\n`;
    sql += buildBatchInsertSQL(batch);
    sql += '\n';

    // Progress indicator
    if ((i + 1) % 10 === 0) {
      process.stdout.write(`\rGenerating SQL: ${i + 1}/${batches} batches...`);
    }
  }

  fs.writeFileSync(outputFile, sql);

  const sizeMB = (Buffer.byteLength(sql) / 1024 / 1024).toFixed(2);
  console.log(`\nGenerated SQL file: ${sizeMB} MB`);
}

// ============================================================================
// Database Import
// ============================================================================

/**
 * Execute SQL via wrangler d1
 */
function executeSQL(config: Config, sql: string): void {
  const tempSqlFile = path.join(TEMP_DIR, `import-${Date.now()}.sql`);
  fs.writeFileSync(tempSqlFile, sql);

  try {
    const args = [
      'npx',
      'wrangler',
      'd1',
      'execute',
      config.local ? 'iofold-benchmarks' : config.databaseId!,
      '--file',
      tempSqlFile,
    ];

    if (config.local) {
      args.push('--local');
    }

    const command = args.join(' ');
    execSync(command, { stdio: 'inherit' });

    // Clean up
    fs.unlinkSync(tempSqlFile);
  } catch (error: any) {
    // Clean up on error
    if (fs.existsSync(tempSqlFile)) {
      fs.unlinkSync(tempSqlFile);
    }
    throw error;
  }
}

/**
 * Import emails to database
 */
function importToDatabase(emails: EmailRow[], config: Config): void {
  console.log(`\nImporting to database...`);
  console.log(`Database: ${config.local ? 'local' : config.databaseId}`);
  console.log(`Batch size: ${config.batchSize}`);

  const batches = Math.ceil(emails.length / config.batchSize);
  let imported = 0;

  for (let i = 0; i < batches; i++) {
    const start = i * config.batchSize;
    const end = Math.min(start + config.batchSize, emails.length);
    const batch = emails.slice(start, end);

    process.stdout.write(`\rImporting batch ${i + 1}/${batches}...`);

    const sql = buildBatchInsertSQL(batch);
    executeSQL(config, sql);

    imported += batch.length;
  }

  console.log(`\n\nSuccessfully imported ${imported.toLocaleString()} emails!`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('='.repeat(70));
  console.log('Enron Email Dataset Import (Parquet)');
  console.log('='.repeat(70));

  const config = parseArgs();

  try {
    // Step 1: Get parquet file
    let parquetPath: string;
    if (config.parquetPath) {
      parquetPath = config.parquetPath;
      if (!fs.existsSync(parquetPath)) {
        throw new Error(`Parquet file not found: ${parquetPath}`);
      }
      console.log(`\nUsing local parquet file: ${parquetPath}`);
    } else {
      parquetPath = DEFAULT_PARQUET_PATH;
      if (!fs.existsSync(parquetPath)) {
        await downloadParquet(HUGGINGFACE_URL, parquetPath);
      } else {
        console.log(`\nUsing cached parquet file: ${parquetPath}`);
      }
    }

    // Step 2: Parse parquet
    const emails = await parseParquet(parquetPath, config.limit);

    if (emails.length === 0) {
      console.error('\nError: No emails parsed from parquet file');
      process.exit(1);
    }

    // Step 3: Generate SQL or import
    if (config.outputFile) {
      generateSQLFile(emails, config.outputFile, config.batchSize);
      console.log(`\n${'='.repeat(70)}`);
      console.log('SQL file generated successfully!');
      console.log(`${'='.repeat(70)}`);
      console.log(`\nTo import, run:`);
      if (config.local) {
        console.log(`  npx wrangler d1 execute iofold-benchmarks --local --file ${config.outputFile}`);
      } else {
        console.log(`  npx wrangler d1 execute <database-id> --file ${config.outputFile}`);
      }
    } else {
      if (!config.local && !config.databaseId) {
        console.error('\nError: --database-id is required for remote import (or use --local)');
        process.exit(1);
      }
      importToDatabase(emails, config);
      console.log(`\n${'='.repeat(70)}`);
      console.log('Import complete!');
      console.log(`${'='.repeat(70)}`);
      console.log(`\nVerify import:`);
      if (config.local) {
        console.log(`  npx wrangler d1 execute iofold-benchmarks --local --command "SELECT COUNT(*) FROM emails"`);
      } else {
        console.log(`  npx wrangler d1 execute ${config.databaseId} --command "SELECT COUNT(*) FROM emails"`);
      }
    }
  } catch (error: any) {
    console.error('\n' + '='.repeat(70));
    console.error('ERROR:', error.message);
    console.error('='.repeat(70));
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
