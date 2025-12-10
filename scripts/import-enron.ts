#!/usr/bin/env npx tsx
/**
 * Enron Email Dataset Import Script
 *
 * Downloads and imports the Enron email dataset into the BENCHMARKS_DB D1 database.
 * Uses the preprocessed Enron dataset from Kaggle/HuggingFace.
 *
 * Dataset source: https://www.cs.cmu.edu/~enron/ (original)
 * Preprocessed: https://www.kaggle.com/datasets/wcukierski/enron-email-dataset
 *
 * Usage:
 *   npx tsx scripts/import-enron.ts [options]
 *
 * Options:
 *   --database-id, -d    D1 Database ID for iofold-benchmarks (required)
 *   --limit, -l          Limit number of emails to import (default: unlimited)
 *   --batch-size, -b     Batch size for inserts (default: 100)
 *   --local              Use local D1 database (default: false)
 *   --csv-path, -c       Path to CSV file (default: download from HuggingFace)
 *   --help, -h           Show help
 *
 * Examples:
 *   # Import to local dev database
 *   npx tsx scripts/import-enron.ts --local --limit 1000
 *
 *   # Import full dataset to remote database
 *   npx tsx scripts/import-enron.ts -d abc123 --batch-size 500
 *
 *   # Import from local CSV file
 *   npx tsx scripts/import-enron.ts --local --csv-path ./enron-emails.csv
 *
 * CSV Format Expected:
 *   message_id,inbox,subject,sender,recipients,date,body
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { pipeline } from 'stream/promises';
import { createWriteStream, createReadStream } from 'fs';
import * as crypto from 'crypto';

// ============================================================================
// Configuration
// ============================================================================

interface Config {
  databaseId?: string;
  limit?: number;
  batchSize: number;
  local: boolean;
  csvPath?: string;
}

const DEFAULT_CSV_URL = 'https://huggingface.co/datasets/corbt/enron_emails_sample/resolve/main/emails.csv';
const TEMP_DIR = path.join(__dirname, '../.tmp');
const DEFAULT_CSV_PATH = path.join(TEMP_DIR, 'enron-emails.csv');

// ============================================================================
// Parse CLI Arguments
// ============================================================================

function parseArgs(): Config {
  const args = process.argv.slice(2);
  const config: Config = {
    batchSize: 100,
    local: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--database-id' || arg === '-d') {
      config.databaseId = args[++i];
    } else if (arg === '--limit' || arg === '-l') {
      config.limit = parseInt(args[++i], 10);
    } else if (arg === '--batch-size' || arg === '-b') {
      config.batchSize = parseInt(args[++i], 10);
    } else if (arg === '--local') {
      config.local = true;
    } else if (arg === '--csv-path' || arg === '-c') {
      config.csvPath = args[++i];
    }
  }

  // Validate config
  if (!config.local && !config.databaseId) {
    console.error('Error: --database-id is required for remote import');
    console.error('Use --local flag for local development database');
    process.exit(1);
  }

  return config;
}

function printHelp(): void {
  console.log(`
Enron Email Dataset Import Script

Usage:
  npx tsx scripts/import-enron.ts [options]

Options:
  --database-id, -d    D1 Database ID for iofold-benchmarks (required for remote)
  --limit, -l          Limit number of emails to import (default: unlimited)
  --batch-size, -b     Batch size for inserts (default: 100)
  --local              Use local D1 database (default: false)
  --csv-path, -c       Path to CSV file (default: download from HuggingFace)
  --help, -h           Show help

Examples:
  # Import to local dev database (first 1000 emails)
  npx tsx scripts/import-enron.ts --local --limit 1000

  # Import full dataset to remote database
  npx tsx scripts/import-enron.ts -d abc123 --batch-size 500

  # Import from local CSV file
  npx tsx scripts/import-enron.ts --local --csv-path ./enron-emails.csv
`);
}

// ============================================================================
// Email Data Types
// ============================================================================

interface EmailRow {
  message_id: string;
  inbox: string;
  subject: string | null;
  sender: string | null;
  recipients: string | null;  // JSON array string
  date: string | null;
  body: string | null;
}

// ============================================================================
// CSV Download
// ============================================================================

async function downloadCSV(url: string, outputPath: string): Promise<void> {
  console.log(`\nDownloading Enron dataset from ${url}...`);

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

  // Stream to file
  const fileStream = createWriteStream(outputPath);
  await pipeline(response.body as any, fileStream);

  console.log(`Downloaded to ${outputPath}`);
}

// ============================================================================
// CSV Parsing
// ============================================================================

/**
 * Parse CSV line handling quoted fields with commas and newlines
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      // Handle escaped quotes
      if (inQuotes && line[i + 1] === '"') {
        currentField += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(currentField);
      currentField = '';
    } else {
      currentField += char;
    }
  }

  // Add last field
  fields.push(currentField);

  return fields;
}

/**
 * Stream and parse CSV file
 */
async function* parseCSVStream(filePath: string, limit?: number): AsyncGenerator<EmailRow> {
  const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineBuffer = '';
  let inQuotedField = false;
  let headerFields: string[] | null = null;
  let rowCount = 0;

  for await (const line of rl) {
    // Handle multi-line quoted fields
    lineBuffer += line;

    // Count unescaped quotes to determine if we're in a quoted field
    const quoteCount = (lineBuffer.match(/(?<!\\)"/g) || []).length;
    inQuotedField = quoteCount % 2 !== 0;

    if (inQuotedField) {
      lineBuffer += '\n'; // Preserve newline in quoted field
      continue;
    }

    // We have a complete line
    const fields = parseCSVLine(lineBuffer);
    lineBuffer = '';

    // Parse header
    if (!headerFields) {
      headerFields = fields;
      continue;
    }

    // Map fields to object
    const row: any = {};
    for (let i = 0; i < headerFields.length && i < fields.length; i++) {
      const value = fields[i].trim();
      row[headerFields[i]] = value === '' || value === 'null' ? null : value;
    }

    // Validate required fields
    if (!row.message_id || !row.inbox) {
      console.warn(`Skipping row with missing required fields: ${JSON.stringify(row)}`);
      continue;
    }

    yield row as EmailRow;

    rowCount++;
    if (limit && rowCount >= limit) {
      break;
    }
  }
}

// ============================================================================
// Database Import
// ============================================================================

/**
 * Execute wrangler d1 command
 */
async function executeWranglerD1(
  config: Config,
  sql: string
): Promise<{ success: boolean; error?: string }> {
  const { execSync } = await import('child_process');

  // Write SQL to temp file
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
      tempSqlFile
    ];

    if (config.local) {
      args.push('--local');
    }

    const command = args.join(' ');
    execSync(command, { stdio: 'inherit' });

    // Clean up temp file
    fs.unlinkSync(tempSqlFile);

    return { success: true };
  } catch (error: any) {
    // Clean up temp file
    fs.unlinkSync(tempSqlFile);

    return {
      success: false,
      error: error.message
    };
  }
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
 * Escape SQL string (handle quotes)
 */
function escapeSQLString(str: string): string {
  return `'${str.replace(/'/g, "''")}'`;
}

/**
 * Import emails in batches
 */
async function importEmails(config: Config, csvPath: string): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('Starting Enron Email Import');
  console.log('='.repeat(60));
  console.log(`CSV file: ${csvPath}`);
  console.log(`Batch size: ${config.batchSize}`);
  console.log(`Limit: ${config.limit || 'unlimited'}`);
  console.log(`Database: ${config.local ? 'local' : config.databaseId}`);
  console.log('');

  let batch: EmailRow[] = [];
  let totalImported = 0;
  let batchNumber = 0;
  const startTime = Date.now();

  for await (const email of parseCSVStream(csvPath, config.limit)) {
    batch.push(email);

    if (batch.length >= config.batchSize) {
      batchNumber++;
      const sql = buildBatchInsertSQL(batch);

      process.stdout.write(`Importing batch ${batchNumber} (${batch.length} emails)...`);

      const result = await executeWranglerD1(config, sql);

      if (!result.success) {
        console.error(`\n❌ Batch ${batchNumber} failed: ${result.error}`);
        throw new Error(`Import failed at batch ${batchNumber}`);
      }

      totalImported += batch.length;
      console.log(` ✓ (${totalImported} total)`);

      batch = [];
    }
  }

  // Import remaining batch
  if (batch.length > 0) {
    batchNumber++;
    const sql = buildBatchInsertSQL(batch);

    process.stdout.write(`Importing final batch ${batchNumber} (${batch.length} emails)...`);

    const result = await executeWranglerD1(config, sql);

    if (!result.success) {
      console.error(`\n❌ Final batch failed: ${result.error}`);
      throw new Error('Import failed at final batch');
    }

    totalImported += batch.length;
    console.log(` ✓ (${totalImported} total)`);
  }

  const elapsedMs = Date.now() - startTime;
  const elapsedSec = (elapsedMs / 1000).toFixed(2);
  const emailsPerSec = (totalImported / (elapsedMs / 1000)).toFixed(0);

  console.log('\n' + '='.repeat(60));
  console.log('✅ Import Complete!');
  console.log('='.repeat(60));
  console.log(`Total emails imported: ${totalImported.toLocaleString()}`);
  console.log(`Time elapsed: ${elapsedSec}s`);
  console.log(`Rate: ${emailsPerSec} emails/sec`);
  console.log('');
}

// ============================================================================
// Main Execution
// ============================================================================

async function main(): Promise<void> {
  try {
    const config = parseArgs();

    // Determine CSV path
    let csvPath: string;
    if (config.csvPath) {
      csvPath = config.csvPath;
      if (!fs.existsSync(csvPath)) {
        throw new Error(`CSV file not found: ${csvPath}`);
      }
    } else {
      csvPath = DEFAULT_CSV_PATH;

      // Download if not exists
      if (!fs.existsSync(csvPath)) {
        await downloadCSV(DEFAULT_CSV_URL, csvPath);
      } else {
        console.log(`Using cached CSV: ${csvPath}`);
      }
    }

    // Import emails
    await importEmails(config, csvPath);

    console.log('Next steps:');
    console.log('  1. Verify import:');
    if (config.local) {
      console.log('     npx wrangler d1 execute iofold-benchmarks --local --command "SELECT COUNT(*) FROM emails"');
    } else {
      console.log(`     npx wrangler d1 execute ${config.databaseId} --command "SELECT COUNT(*) FROM emails"`);
    }
    console.log('\n  2. Test search:');
    if (config.local) {
      console.log('     npx wrangler d1 execute iofold-benchmarks --local --command "SELECT * FROM emails_fts WHERE emails_fts MATCH \'meeting\' LIMIT 5"');
    } else {
      console.log(`     npx wrangler d1 execute ${config.databaseId} --command "SELECT * FROM emails_fts WHERE emails_fts MATCH 'meeting' LIMIT 5"`);
    }
    console.log('');

  } catch (error: any) {
    console.error('\n❌ Import failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
