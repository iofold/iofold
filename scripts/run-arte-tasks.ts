#!/usr/bin/env bun
/**
 * Run Art-E benchmark tasks through the playground agent with parallel execution
 *
 * Usage:
 *   bun scripts/run-arte-tasks.ts --agent-id <id> [options]
 *
 * Options:
 *   --agent-id <id>      Agent ID (required)
 *   --count <num>        Number of tasks to run (default: 100)
 *   --parallel <num>     Concurrent tasks (default: 5)
 *   --output <file>      Output file for results (default: .tmp/arte-results.json)
 *   --workspace <id>     Workspace ID (default: from WORKSPACE_ID env)
 *   --api-url <url>      API base URL (default: from API_URL env or http://localhost:8787)
 *   --split <split>      Dataset split: train or test (default: test)
 *   --use-json           Use JSON API (limited to 100 rows, no parquetjs needed)
 *   --help, -h           Show help
 *
 * Examples:
 *   # Run 100 tasks with 5 parallel workers
 *   bun scripts/run-arte-tasks.ts --agent-id agent_test_1
 *
 *   # Run 50 tasks with 10 parallel workers
 *   bun scripts/run-arte-tasks.ts --agent-id agent_test_1 --count 50 --parallel 10
 *
 *   # Use JSON API for quick testing (max 100 tasks)
 *   bun scripts/run-arte-tasks.ts --agent-id agent_test_1 --count 20 --use-json
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadArtEDataset } from '../src/benchmark/art-e-loader';
import type { ArtETask } from '../src/benchmark/art-e-types';

const API_BASE = process.env.API_URL || 'http://localhost:8787';
const WORKSPACE_ID = process.env.WORKSPACE_ID || 'ws_test_1';

interface TaskResult {
  taskId: number;
  question: string;
  groundTruth: string;
  agentAnswer: string;
  traceId?: string;
  executionTimeMs: number;
  error?: string;
}

interface BenchmarkSummary {
  agentId: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgExecutionTimeMs: number;
  totalTimeMs: number;
  startedAt: string;
  completedAt: string;
  results: TaskResult[];
}

/**
 * Run a single task through the playground API
 */
async function runTask(
  task: ArtETask,
  agentId: string,
  workspaceId: string,
  apiBaseUrl: string
): Promise<TaskResult> {
  const startTime = Date.now();

  try {
    // Call playground chat API
    const response = await fetch(
      `${apiBaseUrl}/api/agents/${agentId}/playground/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workspace-Id': workspaceId,
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: task.question,
            },
          ],
          variables: {
            query_date: task.query_date,
            inbox_address: task.inbox_address,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    // Parse SSE response
    let agentAnswer = '';
    let traceId: string | undefined;

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const dataStr = line.slice(6);
        if (dataStr === '[DONE]') break;

        try {
          const event = JSON.parse(dataStr);

          if (event.type === 'text-delta' && event.text) {
            agentAnswer += event.text;
          } else if (event.type === 'session-info' && event.traceId) {
            traceId = event.traceId;
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      }
    }

    const executionTimeMs = Date.now() - startTime;

    return {
      taskId: task.id,
      question: task.question,
      groundTruth: task.answer,
      agentAnswer,
      traceId,
      executionTimeMs,
    };
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    return {
      taskId: task.id,
      question: task.question,
      groundTruth: task.answer,
      agentAnswer: '',
      executionTimeMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run tasks with configurable parallelism
 */
async function runTasksParallel(
  tasks: ArtETask[],
  agentId: string,
  workspaceId: string,
  apiBaseUrl: string,
  parallelism: number
): Promise<TaskResult[]> {
  const results: TaskResult[] = [];
  let completed = 0;
  let inProgress = 0;
  let taskIndex = 0;

  // Progress bar
  const progressBar = (current: number, total: number) => {
    const percent = Math.floor((current / total) * 100);
    const filled = Math.floor(percent / 2);
    const bar = '█'.repeat(filled) + '░'.repeat(50 - filled);
    return `[${bar}] ${percent}% (${current}/${total})`;
  };

  // Create a pool of workers
  const workers = new Set<Promise<void>>();

  // Process tasks
  while (taskIndex < tasks.length || inProgress > 0) {
    // Start new tasks if we have capacity
    while (inProgress < parallelism && taskIndex < tasks.length) {
      const task = tasks[taskIndex++];
      inProgress++;

      const worker = (async () => {
        const result = await runTask(task, agentId, workspaceId, apiBaseUrl);
        results.push(result);
        completed++;
        inProgress--;

        // Update progress
        process.stdout.write('\r' + progressBar(completed, tasks.length));
        if (result.error) {
          process.stdout.write(` [Task ${result.taskId}: ERROR]`);
        }
      })();

      workers.add(worker);
      worker.finally(() => workers.delete(worker));
    }

    // Wait for at least one worker to finish
    if (workers.size > 0) {
      await Promise.race(workers);
    }
  }

  // Wait for all remaining workers
  await Promise.all(workers);

  console.log(''); // New line after progress bar
  return results;
}

/**
 * Generate summary report
 */
function generateSummary(
  agentId: string,
  results: TaskResult[],
  startTime: number
): BenchmarkSummary {
  const endTime = Date.now();
  const completedTasks = results.filter((r) => !r.error).length;
  const failedTasks = results.filter((r) => !!r.error).length;
  const totalExecutionTime = results
    .filter((r) => !r.error)
    .reduce((sum, r) => sum + r.executionTimeMs, 0);
  const avgExecutionTimeMs =
    completedTasks > 0 ? totalExecutionTime / completedTasks : 0;

  return {
    agentId,
    totalTasks: results.length,
    completedTasks,
    failedTasks,
    avgExecutionTimeMs,
    totalTimeMs: endTime - startTime,
    startedAt: new Date(startTime).toISOString(),
    completedAt: new Date(endTime).toISOString(),
    results,
  };
}

/**
 * Print summary to console
 */
function printSummary(summary: BenchmarkSummary): void {
  console.log('\n' + '═'.repeat(80));
  console.log('ART-E BENCHMARK RESULTS');
  console.log('═'.repeat(80));
  console.log(`Agent ID:           ${summary.agentId}`);
  console.log(`Total tasks:        ${summary.totalTasks}`);
  console.log(`Completed:          ${summary.completedTasks}`);
  console.log(`Failed:             ${summary.failedTasks}`);
  console.log(
    `Success rate:       ${((summary.completedTasks / summary.totalTasks) * 100).toFixed(1)}%`
  );
  console.log(`Avg execution time: ${summary.avgExecutionTimeMs.toFixed(0)}ms`);
  console.log(`Total time:         ${(summary.totalTimeMs / 1000).toFixed(1)}s`);
  console.log(`Started:            ${summary.startedAt}`);
  console.log(`Completed:          ${summary.completedAt}`);
  console.log('═'.repeat(80));

  // Show sample of results
  console.log('\nSample Results (first 3):');
  console.log('─'.repeat(80));
  summary.results.slice(0, 3).forEach((result, idx) => {
    console.log(`\n${idx + 1}. Task ${result.taskId}`);
    console.log(`   Q: ${result.question.slice(0, 70)}...`);
    console.log(`   A: ${result.agentAnswer.slice(0, 70)}...`);
    console.log(`   Time: ${result.executionTimeMs}ms`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });
  console.log('─'.repeat(80) + '\n');
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
Art-E Task Runner - Run benchmark tasks with parallel execution

Usage:
  bun scripts/run-arte-tasks.ts --agent-id <id> [options]

Options:
  --agent-id <id>      Agent ID (required)
  --count <num>        Number of tasks to run (default: 100)
  --parallel <num>     Concurrent tasks (default: 5)
  --output <file>      Output file for results (default: .tmp/arte-results.json)
  --workspace <id>     Workspace ID (default: from WORKSPACE_ID env)
  --api-url <url>      API base URL (default: from API_URL env or http://localhost:8787)
  --split <split>      Dataset split: train or test (default: test)
  --use-json           Use JSON API (limited to 100 rows)
  --help, -h           Show this help

Examples:
  # Run 100 tasks with 5 parallel workers
  bun scripts/run-arte-tasks.ts --agent-id agent_test_1

  # Run 50 tasks with 10 parallel workers
  bun scripts/run-arte-tasks.ts --agent-id agent_test_1 --count 50 --parallel 10

  # Use JSON API for quick testing
  bun scripts/run-arte-tasks.ts --agent-id agent_test_1 --count 20 --use-json

Environment:
  API_URL         API base URL (default: http://localhost:8787)
  WORKSPACE_ID    Workspace ID (default: ws_test_1)
`);
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse CLI arguments
  let agentId: string | null = null;
  let count = 100;
  let parallel = 5;
  let outputFile = '.tmp/arte-results.json';
  let workspaceId = WORKSPACE_ID;
  let apiBaseUrl = API_BASE;
  let split: 'train' | 'test' = 'test';
  let useJson = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--agent-id':
        agentId = args[++i];
        break;
      case '--count':
        count = parseInt(args[++i], 10);
        if (isNaN(count) || count < 1) {
          console.error('Error: --count must be a positive number');
          process.exit(1);
        }
        break;
      case '--parallel':
        parallel = parseInt(args[++i], 10);
        if (isNaN(parallel) || parallel < 1) {
          console.error('Error: --parallel must be a positive number');
          process.exit(1);
        }
        break;
      case '--output':
        outputFile = args[++i];
        break;
      case '--workspace':
        workspaceId = args[++i];
        break;
      case '--api-url':
        apiBaseUrl = args[++i];
        break;
      case '--split':
        const splitArg = args[++i];
        if (splitArg !== 'train' && splitArg !== 'test') {
          console.error(`Error: Invalid split '${splitArg}'. Must be 'train' or 'test'`);
          process.exit(1);
        }
        split = splitArg;
        break;
      case '--use-json':
        useJson = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        if (arg.startsWith('--')) {
          console.error(`Error: Unknown option '${arg}'`);
          printHelp();
          process.exit(1);
        }
    }
  }

  // Validate required arguments
  if (!agentId) {
    console.error('Error: --agent-id is required');
    printHelp();
    process.exit(1);
  }

  try {
    // Load dataset
    console.log(`\nLoading Art-E dataset...`);
    console.log(`  Split: ${split}`);
    console.log(`  Count: ${count}`);
    console.log(`  Format: ${useJson ? 'json' : 'parquet'}`);

    const tasks = await loadArtEDataset(split, count, useJson);

    if (tasks.length === 0) {
      console.error('Error: No tasks loaded');
      process.exit(1);
    }

    console.log(`\nLoaded ${tasks.length} tasks`);
    console.log(`\nConfiguration:`);
    console.log(`  Agent ID:    ${agentId}`);
    console.log(`  Workspace:   ${workspaceId}`);
    console.log(`  API URL:     ${apiBaseUrl}`);
    console.log(`  Parallelism: ${parallel}`);
    console.log(`  Output:      ${outputFile}`);

    // Run tasks
    console.log(`\nRunning tasks...`);
    const startTime = Date.now();

    const results = await runTasksParallel(
      tasks,
      agentId,
      workspaceId,
      apiBaseUrl,
      parallel
    );

    // Generate summary
    const summary = generateSummary(agentId, results, startTime);

    // Print summary
    printSummary(summary);

    // Save results
    const outputPath = path.resolve(outputFile);
    const outputDir = path.dirname(outputPath);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
    console.log(`\nResults saved to: ${outputPath}`);

    // Exit with error code if high failure rate
    const failureRate = summary.failedTasks / summary.totalTasks;
    if (failureRate > 0.5) {
      console.error(
        `\nWarning: High failure rate (${(failureRate * 100).toFixed(1)}%)`
      );
      process.exit(1);
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
