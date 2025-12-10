#!/usr/bin/env bun
/**
 * CLI script to run ART-E benchmark against an agent
 *
 * Usage:
 *   bun scripts/run-art-e-benchmark.ts --agent <agent_id> [options]
 *
 * Options:
 *   --agent, -a        Agent ID (required)
 *   --split, -s        Dataset split: train or test (default: test)
 *   --limit, -l        Max tasks to run (default: 10, use 0 for all)
 *   --workspace, -w    Workspace ID (default: from env WORKSPACE_ID)
 *   --api-url          API base URL (default: from env API_URL or http://localhost:8787)
 *   --model-provider   Model provider: anthropic, openai, google (default: anthropic)
 *   --model-id         Model ID (default: anthropic/claude-sonnet-4-5)
 *   --output, -o       Output file for results (JSON)
 *   --use-json         Use JSON API instead of parquet (limited to 100 rows)
 *   --stats            Show dataset statistics and exit
 *   --help, -h         Show help
 *
 * Examples:
 *   # Run 10 test tasks
 *   bun scripts/run-art-e-benchmark.ts -a agent_test_1
 *
 *   # Run 100 train tasks with custom model
 *   bun scripts/run-art-e-benchmark.ts -a agent_test_1 -s train -l 100 --model-provider openai --model-id openai/gpt-5.1
 *
 *   # Run all test tasks and save results
 *   bun scripts/run-art-e-benchmark.ts -a agent_test_1 -l 0 -o results.json
 *
 *   # Show dataset stats
 *   bun scripts/run-art-e-benchmark.ts --stats -s test
 */

import * as fs from 'fs';
import { loadArtEDataset, getDatasetStats } from '../src/benchmark/art-e-loader';
import { runArtEBenchmarkWithProgress } from '../src/benchmark/art-e-runner';
import type { BenchmarkConfig } from '../src/benchmark/art-e-types';

const API_BASE = process.env.API_URL || 'http://localhost:8787';
const WORKSPACE_ID = process.env.WORKSPACE_ID || 'ws_test_1';

function printHelp(): void {
  console.log(`
ART-E Benchmark Runner - Test agents against Enron email Q&A tasks

Usage:
  bun scripts/run-art-e-benchmark.ts [options]

Options:
  --agent, -a <id>       Agent ID to test (required unless --stats)
  --split, -s <split>    Dataset split: train or test (default: test)
  --limit, -l <num>      Max tasks to run (default: 10, 0 = all)
  --workspace, -w <id>   Workspace ID (default: from WORKSPACE_ID env)
  --api-url <url>        API base URL (default: from API_URL env or http://localhost:8787)
  --model-provider <p>   Model provider: anthropic, openai, google (default: anthropic)
  --model-id <id>        Model ID (default: anthropic/claude-sonnet-4-5)
  --output, -o <file>    Save results to JSON file
  --use-json             Use JSON API (limited to 100 rows, no parquetjs needed)
  --stats                Show dataset statistics and exit
  --help, -h             Show this help

Examples:
  # Run 10 test tasks
  bun scripts/run-art-e-benchmark.ts -a agent_test_1

  # Run 100 train tasks
  bun scripts/run-art-e-benchmark.ts -a agent_test_1 -s train -l 100

  # Run all test tasks and save results
  bun scripts/run-art-e-benchmark.ts -a agent_test_1 -l 0 -o results.json

  # Show dataset statistics
  bun scripts/run-art-e-benchmark.ts --stats -s test

Environment:
  API_URL         API base URL (default: http://localhost:8787)
  WORKSPACE_ID    Workspace ID (default: ws_test_1)
`);
}

async function showStats(split: 'train' | 'test', useJson: boolean = false): Promise<void> {
  console.log(`\nFetching ART-E dataset statistics for ${split} split...\n`);

  const stats = await getDatasetStats(split, useJson);

  console.log('═'.repeat(60));
  console.log(`ART-E Dataset Statistics (${split} split)`);
  console.log('═'.repeat(60));
  console.log(`Total tasks:              ${stats.totalTasks.toLocaleString()}`);
  console.log(`Unique inboxes:           ${stats.uniqueInboxes}`);
  console.log(`Avg realistic score:      ${stats.avgRealisticScore.toFixed(3)}`);
  console.log(`Avg message IDs per task: ${stats.avgMessageIdsPerTask.toFixed(1)}`);
  console.log('═'.repeat(60) + '\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let agentId: string | null = null;
  let split: 'train' | 'test' = 'test';
  let limit: number = 10;
  let workspaceId = WORKSPACE_ID;
  let apiBaseUrl = API_BASE;
  let modelProvider: 'anthropic' | 'openai' | 'google' = 'anthropic';
  let modelId = 'anthropic/claude-sonnet-4-5';
  let outputFile: string | null = null;
  let useJson = false;
  let showStatsOnly = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--agent':
      case '-a':
        agentId = args[++i];
        break;
      case '--split':
      case '-s':
        const splitArg = args[++i];
        if (splitArg !== 'train' && splitArg !== 'test') {
          console.error(`Error: Invalid split '${splitArg}'. Must be 'train' or 'test'`);
          process.exit(1);
        }
        split = splitArg;
        break;
      case '--limit':
      case '-l':
        limit = parseInt(args[++i], 10);
        if (isNaN(limit) || limit < 0) {
          console.error('Error: --limit must be a non-negative number');
          process.exit(1);
        }
        break;
      case '--workspace':
      case '-w':
        workspaceId = args[++i];
        break;
      case '--api-url':
        apiBaseUrl = args[++i];
        break;
      case '--model-provider':
        const provider = args[++i] as 'anthropic' | 'openai' | 'google';
        if (!['anthropic', 'openai', 'google'].includes(provider)) {
          console.error(`Error: Invalid model provider '${provider}'`);
          process.exit(1);
        }
        modelProvider = provider;
        break;
      case '--model-id':
        modelId = args[++i];
        break;
      case '--output':
      case '-o':
        outputFile = args[++i];
        break;
      case '--use-json':
        useJson = true;
        break;
      case '--stats':
        showStatsOnly = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  try {
    // Show stats and exit if requested
    if (showStatsOnly) {
      await showStats(split, useJson);
      return;
    }

    // Validate required args
    if (!agentId) {
      console.error('Error: --agent is required');
      printHelp();
      process.exit(1);
    }

    // Load dataset
    console.log(`\nLoading ART-E dataset: split=${split}, limit=${limit || 'all'}, format=${useJson ? 'json' : 'parquet'}`);

    const tasks = await loadArtEDataset(
      split,
      limit === 0 ? undefined : limit,
      useJson
    );

    if (tasks.length === 0) {
      console.error('Error: No tasks loaded from dataset');
      process.exit(1);
    }

    console.log(`Loaded ${tasks.length} tasks`);

    // Configure benchmark
    const config: BenchmarkConfig = {
      agentId,
      split,
      limit: limit === 0 ? undefined : limit,
      workspaceId,
      apiBaseUrl,
      modelProvider,
      modelId,
      taskTimeoutMs: 60000,
      includeSemanticScoring: true,
    };

    console.log(`\nConfiguration:`);
    console.log(`  Agent ID:        ${config.agentId}`);
    console.log(`  Workspace ID:    ${config.workspaceId}`);
    console.log(`  API URL:         ${config.apiBaseUrl}`);
    console.log(`  Model:           ${config.modelProvider}/${config.modelId}`);
    console.log(`  Tasks:           ${tasks.length}`);
    console.log(`  Split:           ${split}`);

    // Run benchmark with progress
    const result = await runArtEBenchmarkWithProgress(
      tasks,
      config,
      (completed, total, taskResult) => {
        const progress = Math.floor((completed / total) * 100);
        const statusIcon = taskResult.error ? '✗' : taskResult.exactMatch ? '✓✓' : '✓';
        const scoreStr = taskResult.error
          ? 'ERROR'
          : `${taskResult.semanticScore.toFixed(2)}`;

        console.log(
          `[${progress}%] Task ${completed}/${total} ${statusIcon} ` +
          `Score: ${scoreStr} Time: ${taskResult.executionTimeMs}ms`
        );
      }
    );

    // Save results if requested
    if (outputFile) {
      fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
      console.log(`\nResults saved to: ${outputFile}`);
    }

    // Print summary
    console.log('\n' + '═'.repeat(80));
    console.log('BENCHMARK COMPLETE');
    console.log('═'.repeat(80));
    console.log(`Agent:              ${result.agentId}`);
    console.log(`Total tasks:        ${result.totalTasks}`);
    console.log(`Completed:          ${result.completedTasks}`);
    console.log(`Failed:             ${result.failedTasks}`);
    console.log(`Exact match acc:    ${(result.exactMatchAccuracy * 100).toFixed(1)}%`);
    console.log(`Avg semantic score: ${result.avgSemanticScore.toFixed(3)}`);
    console.log(`Avg execution time: ${result.avgExecutionTimeMs.toFixed(0)}ms`);
    console.log(`Total time:         ${(result.totalTimeMs / 1000).toFixed(1)}s`);
    console.log('═'.repeat(80) + '\n');

    // Exit with error code if too many failures
    const failureRate = result.failedTasks / result.totalTasks;
    if (failureRate > 0.5) {
      console.error(`Warning: High failure rate (${(failureRate * 100).toFixed(1)}%)`);
      process.exit(1);
    }
  } catch (error) {
    console.error('\nError:', error instanceof Error ? error.message : error);
    console.error('\nStack trace:', error instanceof Error ? error.stack : '');
    process.exit(1);
  }
}

main();
