#!/usr/bin/env bun
/**
 * Import ART-E benchmark results as feedback entries
 *
 * Reads ART-E result files and converts them to feedback via the API.
 * Maps semantic scores to feedback ratings:
 * - exactMatch=true OR semanticScore >= threshold_positive → positive
 * - semanticScore >= threshold_negative and < threshold_positive → neutral
 * - semanticScore < threshold_negative OR error → negative
 *
 * Usage:
 *   bun scripts/import-arte-feedback.ts --results <file> [options]
 *
 * Options:
 *   --results, -r <file>           Path to ART-E results JSON file (required, supports glob)
 *   --workspace, -w <id>           Workspace ID (default: from WORKSPACE_ID env)
 *   --api-url <url>                API base URL (default: from API_URL env or http://localhost:8787)
 *   --threshold-positive <num>     Semantic score threshold for positive (default: 0.7)
 *   --threshold-negative <num>     Semantic score threshold for negative (default: 0.3)
 *   --dry-run, -d                  Preview mapping without submitting
 *   --verbose, -v                  Show detailed progress
 *   --help, -h                     Show help
 *
 * Examples:
 *   # Import single file
 *   bun scripts/import-arte-feedback.ts -r .tmp/arte-results-1765430390846.json
 *
 *   # Import with custom thresholds
 *   bun scripts/import-arte-feedback.ts -r results.json --threshold-positive 0.8 --threshold-negative 0.4
 *
 *   # Dry run to preview
 *   bun scripts/import-arte-feedback.ts -r results.json --dry-run -v
 *
 *   # Import multiple files with glob
 *   bun scripts/import-arte-feedback.ts -r ".tmp/arte-results-*.json"
 */

import * as fs from 'fs';
import * as path from 'path';
import type { TaskResult } from '../src/benchmark/art-e-types';

const API_BASE = process.env.API_URL || 'http://localhost:8787';
const WORKSPACE_ID = process.env.WORKSPACE_ID || 'ws_test_1';

interface FeedbackStats {
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  skipped: number;
  errors: number;
}

interface FeedbackRequest {
  trace_id: string;
  rating: 'positive' | 'negative' | 'neutral';
  notes?: string;
}

function printHelp(): void {
  console.log(`
ART-E Feedback Importer - Convert benchmark results to feedback

Usage:
  bun scripts/import-arte-feedback.ts [options]

Options:
  --results, -r <file>           Path to results JSON file (required, supports glob)
  --workspace, -w <id>           Workspace ID (default: from WORKSPACE_ID env)
  --api-url <url>                API base URL (default: from API_URL env or http://localhost:8787)
  --threshold-positive <num>     Semantic score threshold for positive (default: 0.7)
  --threshold-negative <num>     Semantic score threshold for negative (default: 0.3)
  --dry-run, -d                  Preview mapping without submitting
  --verbose, -v                  Show detailed progress
  --help, -h                     Show this help

Score Mapping:
  - exactMatch=true OR semanticScore >= threshold_positive → positive
  - semanticScore >= threshold_negative and < threshold_positive → neutral
  - semanticScore < threshold_negative OR error → negative

Examples:
  # Import single file
  bun scripts/import-arte-feedback.ts -r .tmp/arte-results-1765430390846.json

  # Import with custom thresholds
  bun scripts/import-arte-feedback.ts -r results.json --threshold-positive 0.8 --threshold-negative 0.4

  # Dry run to preview
  bun scripts/import-arte-feedback.ts -r results.json --dry-run -v

  # Import multiple files with glob pattern
  bun scripts/import-arte-feedback.ts -r ".tmp/arte-results-*.json"

Environment:
  API_URL         API base URL (default: http://localhost:8787)
  WORKSPACE_ID    Workspace ID (default: ws_test_1)
`);
}

/**
 * Map task result to feedback rating based on semantic score thresholds
 */
function mapResultToRating(
  result: TaskResult,
  thresholdPositive: number,
  thresholdNegative: number
): 'positive' | 'negative' | 'neutral' {
  // If there's an error, always negative
  if (result.error) {
    return 'negative';
  }

  // Exact match is always positive
  if (result.exactMatch) {
    return 'positive';
  }

  // If semantic score is available, use thresholds
  if (result.semanticScore !== undefined && result.semanticScore !== null) {
    if (result.semanticScore >= thresholdPositive) {
      return 'positive';
    } else if (result.semanticScore >= thresholdNegative) {
      return 'neutral';
    } else {
      return 'negative';
    }
  }

  // If no semantic score and no exact match info, default to neutral
  // (this handles cases where scoring wasn't performed)
  return 'neutral';
}

/**
 * Generate feedback notes from task result
 */
function generateNotes(result: TaskResult, rating: string): string {
  const parts: string[] = [];

  if (result.error) {
    parts.push(`Error: ${result.error.slice(0, 100)}${result.error.length > 100 ? '...' : ''}`);
  }

  if (result.exactMatch) {
    parts.push('Exact match with ground truth');
  } else if (result.semanticScore !== undefined && result.semanticScore !== null) {
    parts.push(`Semantic score: ${result.semanticScore.toFixed(3)}`);
  } else {
    parts.push('No scoring data available');
  }

  parts.push(`Task ID: ${result.taskId}`);
  parts.push(`Execution time: ${result.executionTimeMs}ms`);

  return `ART-E Benchmark - ${rating}\n${parts.join(' | ')}`;
}

/**
 * Submit feedback via API
 */
async function submitFeedback(
  feedback: FeedbackRequest,
  workspaceId: string,
  apiBase: string
): Promise<void> {
  const response = await fetch(`${apiBase}/api/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Workspace-Id': workspaceId,
    },
    body: JSON.stringify(feedback),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error: ${response.status} - ${errorText}`);
  }
}

/**
 * Load and parse results file
 */
function loadResultsFile(filePath: string): TaskResult[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);

  // Handle both single BenchmarkResult (with taskResults) and array of TaskResult
  if (Array.isArray(data)) {
    return data as TaskResult[];
  } else if (data.taskResults && Array.isArray(data.taskResults)) {
    return data.taskResults as TaskResult[];
  } else {
    throw new Error('Invalid results file format. Expected array of TaskResult or BenchmarkResult with taskResults');
  }
}

/**
 * Process results file and import feedback
 */
async function processFile(
  filePath: string,
  options: {
    workspaceId: string;
    apiBase: string;
    thresholdPositive: number;
    thresholdNegative: number;
    dryRun: boolean;
    verbose: boolean;
  }
): Promise<FeedbackStats> {
  const stats: FeedbackStats = {
    total: 0,
    positive: 0,
    neutral: 0,
    negative: 0,
    skipped: 0,
    errors: 0,
  };

  console.log(`\nProcessing: ${filePath}`);
  console.log('─'.repeat(80));

  const results = loadResultsFile(filePath);
  stats.total = results.length;

  for (const result of results) {
    // Skip results without trace ID
    if (!result.traceId) {
      if (options.verbose) {
        console.log(`⊘ Task ${result.taskId}: Skipped (no trace ID)`);
      }
      stats.skipped++;
      continue;
    }

    const rating = mapResultToRating(
      result,
      options.thresholdPositive,
      options.thresholdNegative
    );
    const notes = generateNotes(result, rating);

    stats[rating]++;

    const feedbackRequest: FeedbackRequest = {
      trace_id: result.traceId,
      rating,
      notes,
    };

    if (options.verbose) {
      const icon = rating === 'positive' ? '✓' : rating === 'neutral' ? '○' : '✗';
      const scoreStr = result.error
        ? 'ERROR'
        : result.semanticScore !== undefined && result.semanticScore !== null
        ? result.semanticScore.toFixed(3)
        : 'N/A';
      console.log(
        `${icon} Task ${result.taskId}: ${rating.toUpperCase()} ` +
        `(score: ${scoreStr}, trace: ${result.traceId.slice(0, 20)}...)`
      );
    }

    if (!options.dryRun) {
      try {
        await submitFeedback(feedbackRequest, options.workspaceId, options.apiBase);
      } catch (error) {
        console.error(
          `✗ Failed to submit feedback for task ${result.taskId} (${result.traceId}): ` +
          (error instanceof Error ? error.message : String(error))
        );
        stats.errors++;
        // Don't decrement the rating count since we already incremented it
      }
    }
  }

  return stats;
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let resultsPattern: string | null = null;
  let workspaceId = WORKSPACE_ID;
  let apiBase = API_BASE;
  let thresholdPositive = 0.7;
  let thresholdNegative = 0.3;
  let dryRun = false;
  let verbose = false;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--results':
      case '-r':
        resultsPattern = args[++i];
        break;
      case '--workspace':
      case '-w':
        workspaceId = args[++i];
        break;
      case '--api-url':
        apiBase = args[++i];
        break;
      case '--threshold-positive':
        thresholdPositive = parseFloat(args[++i]);
        if (isNaN(thresholdPositive) || thresholdPositive < 0 || thresholdPositive > 1) {
          console.error('Error: --threshold-positive must be a number between 0 and 1');
          process.exit(1);
        }
        break;
      case '--threshold-negative':
        thresholdNegative = parseFloat(args[++i]);
        if (isNaN(thresholdNegative) || thresholdNegative < 0 || thresholdNegative > 1) {
          console.error('Error: --threshold-negative must be a number between 0 and 1');
          process.exit(1);
        }
        break;
      case '--dry-run':
      case '-d':
        dryRun = true;
        break;
      case '--verbose':
      case '-v':
        verbose = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  // Validate arguments
  if (!resultsPattern) {
    console.error('Error: --results is required');
    printHelp();
    process.exit(1);
  }

  if (thresholdNegative >= thresholdPositive) {
    console.error('Error: --threshold-negative must be less than --threshold-positive');
    process.exit(1);
  }

  try {
    // Resolve glob pattern using Bun's Glob
    const files: string[] = [];

    if (resultsPattern.includes('*')) {
      // Handle glob pattern - Bun.Glob expects pattern relative to scan directory
      // Extract directory and pattern
      const patternPath = path.resolve(resultsPattern);
      const dir = path.dirname(patternPath);
      const pattern = path.basename(patternPath);

      const globInstance = new Bun.Glob(pattern);
      for await (const file of globInstance.scan(dir)) {
        files.push(path.join(dir, file));
      }
    } else {
      // Single file
      files.push(path.resolve(resultsPattern));
    }

    if (files.length === 0) {
      console.error(`Error: No files found matching pattern: ${resultsPattern}`);
      process.exit(1);
    }

    console.log('\n═'.repeat(80));
    console.log('ART-E FEEDBACK IMPORT');
    console.log('═'.repeat(80));
    console.log(`Files found:           ${files.length}`);
    console.log(`API:                   ${apiBase}`);
    console.log(`Workspace:             ${workspaceId}`);
    console.log(`Threshold (positive):  ≥ ${thresholdPositive}`);
    console.log(`Threshold (neutral):   ${thresholdNegative} - ${thresholdPositive}`);
    console.log(`Threshold (negative):  < ${thresholdNegative} or error`);
    console.log(`Mode:                  ${dryRun ? 'DRY RUN (preview only)' : 'LIVE'}`);
    console.log('═'.repeat(80));

    // Process all files
    const totalStats: FeedbackStats = {
      total: 0,
      positive: 0,
      neutral: 0,
      negative: 0,
      skipped: 0,
      errors: 0,
    };

    for (const file of files) {
      const stats = await processFile(file, {
        workspaceId,
        apiBase,
        thresholdPositive,
        thresholdNegative,
        dryRun,
        verbose,
      });

      // Aggregate stats
      totalStats.total += stats.total;
      totalStats.positive += stats.positive;
      totalStats.neutral += stats.neutral;
      totalStats.negative += stats.negative;
      totalStats.skipped += stats.skipped;
      totalStats.errors += stats.errors;
    }

    // Print summary
    console.log('\n' + '═'.repeat(80));
    console.log('IMPORT SUMMARY');
    console.log('═'.repeat(80));
    console.log(`Total results:         ${totalStats.total}`);
    console.log(`✓ Positive feedback:   ${totalStats.positive} (${((totalStats.positive / totalStats.total) * 100).toFixed(1)}%)`);
    console.log(`○ Neutral feedback:    ${totalStats.neutral} (${((totalStats.neutral / totalStats.total) * 100).toFixed(1)}%)`);
    console.log(`✗ Negative feedback:   ${totalStats.negative} (${((totalStats.negative / totalStats.total) * 100).toFixed(1)}%)`);
    console.log(`⊘ Skipped (no trace):  ${totalStats.skipped}`);
    if (totalStats.errors > 0) {
      console.log(`✗ Submission errors:   ${totalStats.errors}`);
    }
    console.log('═'.repeat(80));

    if (dryRun) {
      console.log('\n⚠️  This was a dry run. No feedback was submitted.');
      console.log('   Remove --dry-run to import feedback to the API.\n');
    } else if (totalStats.errors > 0) {
      console.log(`\n⚠️  ${totalStats.errors} submissions failed. Check errors above.\n`);
      process.exit(1);
    } else {
      console.log('\n✓ Import completed successfully!\n');
    }
  } catch (error) {
    console.error('\nError:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

main();
