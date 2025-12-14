/**
 * ART-E Dataset Loader
 *
 * Downloads and caches the Enron email Q&A benchmark dataset from HuggingFace.
 * Dataset: corbt/enron_emails_sample_questions
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ArtETask } from './art-e-types';

const CACHE_DIR = path.join(process.cwd(), '.tmp', 'art-e-cache');
const HUGGINGFACE_BASE = 'https://huggingface.co/datasets/corbt/enron_emails_sample_questions/resolve/refs%2Fconvert%2Fparquet/default';

/**
 * Ensure cache directory exists
 */
function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Download a file from HuggingFace if not cached
 */
async function downloadIfNeeded(split: 'train' | 'test'): Promise<string> {
  ensureCacheDir();

  const filename = `${split}.parquet`;
  const cachePath = path.join(CACHE_DIR, filename);

  // Return cached version if exists
  if (fs.existsSync(cachePath)) {
    console.log(`Using cached dataset: ${cachePath}`);
    return cachePath;
  }

  // Download from HuggingFace
  // The parquet files are stored as /split/0000.parquet in the convert/parquet branch
  const url = `${HUGGINGFACE_BASE}/${split}/0000.parquet`;
  console.log(`Downloading dataset from: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download dataset: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(cachePath, Buffer.from(buffer));

  console.log(`Downloaded and cached: ${cachePath} (${buffer.byteLength} bytes)`);
  return cachePath;
}

/**
 * Parse parquet file using parquetjs
 *
 * Note: This requires the 'parquetjs' npm package to be installed.
 * If not installed, run: npm install parquetjs
 */
async function parseParquet(filePath: string): Promise<ArtETask[]> {
  try {
    // Dynamic import to avoid breaking if parquetjs isn't installed
    const parquetModule = await import('parquetjs');
    // @ts-ignore - parquetjs types may not be perfect
    const parquet = parquetModule.default || parquetModule;

    const reader = await parquet.ParquetReader.openFile(filePath);
    const cursor = reader.getCursor();

    const tasks: ArtETask[] = [];
    let record = null;

    while (record = await cursor.next()) {
      tasks.push({
        id: record.id as number,
        question: record.question as string,
        answer: record.answer as string,
        message_ids: record.message_ids as string[],
        inbox_address: record.inbox_address as string,
        query_date: record.query_date as string,
        how_realistic: record.how_realistic as number,
        split: record.split as string,
      });
    }

    await reader.close();
    return tasks;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cannot find module')) {
      throw new Error(
        'parquetjs not installed. Please run: pnpm add -D parquetjs\n' +
        'Or use the alternative JSON-based loader (see art-e-loader.ts comments)'
      );
    }
    throw error;
  }
}

/**
 * Alternative: Download and parse using HuggingFace datasets API
 * This uses the JSON export instead of parquet (simpler but larger files)
 */
async function downloadJsonDataset(split: 'train' | 'test'): Promise<ArtETask[]> {
  ensureCacheDir();

  const filename = `${split}.json`;
  const cachePath = path.join(CACHE_DIR, filename);

  // Return cached version if exists
  if (fs.existsSync(cachePath)) {
    console.log(`Using cached JSON dataset: ${cachePath}`);
    const data = fs.readFileSync(cachePath, 'utf-8');
    return JSON.parse(data);
  }

  // Download JSON version from HuggingFace API
  // Note: This endpoint returns the first 100 rows by default
  // For full dataset, you need to use the parquet files
  const apiUrl = `https://datasets-server.huggingface.co/rows?dataset=corbt/enron_emails_sample_questions&config=default&split=${split}&offset=0&length=100`;

  console.log(`Downloading JSON dataset from HuggingFace API...`);
  console.warn('WARNING: JSON API only returns first 100 rows. Use parquet for full dataset.');

  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`Failed to download dataset: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { rows?: Array<{ row: Record<string, unknown> }> };
  const rows = data.rows || [];

  const tasks: ArtETask[] = rows.map((row: any) => ({
    id: row.row.id,
    question: row.row.question,
    answer: row.row.answer,
    message_ids: row.row.message_ids,
    inbox_address: row.row.inbox_address,
    query_date: row.row.query_date,
    how_realistic: row.row.how_realistic,
    split: row.row.split,
  }));

  // Cache for next time
  fs.writeFileSync(cachePath, JSON.stringify(tasks, null, 2));
  console.log(`Downloaded and cached: ${cachePath} (${tasks.length} tasks)`);

  return tasks;
}

/**
 * Load the ART-E dataset from HuggingFace
 *
 * @param split - Which split to load ('train' or 'test')
 * @param limit - Maximum number of tasks to return (undefined = all)
 * @param useJson - Use JSON API instead of parquet (default: false, only returns 100 rows)
 * @returns Array of benchmark tasks
 */
export async function loadArtEDataset(
  split: 'train' | 'test',
  limit?: number,
  useJson: boolean = false
): Promise<ArtETask[]> {
  console.log(`Loading ART-E dataset: split=${split}, limit=${limit || 'all'}, format=${useJson ? 'json' : 'parquet'}`);

  let tasks: ArtETask[];

  if (useJson) {
    // Use JSON API (limited to 100 rows, but no dependencies needed)
    tasks = await downloadJsonDataset(split);
  } else {
    // Use parquet files (full dataset, requires parquetjs)
    const filePath = await downloadIfNeeded(split);
    tasks = await parseParquet(filePath);
  }

  console.log(`Loaded ${tasks.length} tasks from ${split} split`);

  // Apply limit if specified
  if (limit !== undefined && limit < tasks.length) {
    console.log(`Limiting to first ${limit} tasks`);
    tasks = tasks.slice(0, limit);
  }

  return tasks;
}

/**
 * Get dataset statistics
 */
export async function getDatasetStats(split: 'train' | 'test', useJson: boolean = false): Promise<{
  totalTasks: number;
  avgRealisticScore: number;
  uniqueInboxes: number;
  avgMessageIdsPerTask: number;
}> {
  const tasks = await loadArtEDataset(split, undefined, useJson);

  const uniqueInboxes = new Set(tasks.map(t => t.inbox_address)).size;
  const avgRealisticScore = tasks.reduce((sum, t) => sum + t.how_realistic, 0) / tasks.length;
  const avgMessageIdsPerTask = tasks.reduce((sum, t) => sum + t.message_ids.length, 0) / tasks.length;

  return {
    totalTasks: tasks.length,
    avgRealisticScore,
    uniqueInboxes,
    avgMessageIdsPerTask,
  };
}
