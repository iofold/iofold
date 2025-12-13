#!/usr/bin/env bun
/**
 * Add ART-E benchmark tasks to agent via API
 *
 * Usage:
 *   bun scripts/add-arte-tasks-to-agent.ts --agent <agent_id> [options]
 *
 * Options:
 *   --agent, -a <id>     Agent ID (required)
 *   --count, -c <num>    Number of tasks to add (default: 50)
 *   --split <split>      Dataset split: train or test (default: test)
 *   --workspace <id>     Workspace ID (default: from WORKSPACE_ID env)
 *   --api-url <url>      API base URL (default: from API_URL env or http://localhost:8787)
 *   --use-json           Use JSON API (limited to 100 rows, no parquetjs needed)
 *   --help, -h           Show help
 *
 * Examples:
 *   # Add 50 test tasks to agent
 *   bun scripts/add-arte-tasks-to-agent.ts --agent agent_email_assistant
 *
 *   # Add 100 train tasks
 *   bun scripts/add-arte-tasks-to-agent.ts --agent agent_email_assistant --count 100 --split train
 *
 *   # Use JSON API for quick testing
 *   bun scripts/add-arte-tasks-to-agent.ts --agent agent_email_assistant --count 20 --use-json
 */

import { loadArtEDataset } from '../src/benchmark/art-e-loader';

const API_BASE = process.env.API_URL || 'http://localhost:8787';
const WORKSPACE_ID = process.env.WORKSPACE_ID || 'workspace_default';

interface TasksetResponse {
  id: string;
  name: string;
  task_count: number;
}

interface AddTasksResponse {
  inserted: number;
  skipped: number;
  total: number;
}

/**
 * Create a taskset for the agent
 */
async function createTaskset(
  agentId: string,
  name: string,
  description: string,
  workspaceId: string,
  apiBase: string
): Promise<TasksetResponse> {
  const response = await fetch(`${apiBase}/api/agents/${agentId}/tasksets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Workspace-Id': workspaceId,
    },
    body: JSON.stringify({ name, description }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create taskset: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Add tasks to a taskset
 */
async function addTasks(
  agentId: string,
  tasksetId: string,
  tasks: any[],
  workspaceId: string,
  apiBase: string
): Promise<AddTasksResponse> {
  const response = await fetch(
    `${apiBase}/api/agents/${agentId}/tasksets/${tasksetId}/tasks`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Id': workspaceId,
      },
      body: JSON.stringify({ tasks }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to add tasks: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse CLI arguments
  let agentId: string | null = null;
  let count = 50;
  let split: 'train' | 'test' = 'test';
  let workspaceId = WORKSPACE_ID;
  let apiBaseUrl = API_BASE;
  let useJson = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--agent':
      case '-a':
        agentId = args[++i];
        break;
      case '--count':
      case '-c':
        count = parseInt(args[++i], 10);
        if (isNaN(count) || count < 1) {
          console.error('Error: --count must be a positive number');
          process.exit(1);
        }
        break;
      case '--split':
        const splitArg = args[++i];
        if (splitArg !== 'train' && splitArg !== 'test') {
          console.error(`Error: Invalid split '${splitArg}'. Must be 'train' or 'test'`);
          process.exit(1);
        }
        split = splitArg;
        break;
      case '--workspace':
        workspaceId = args[++i];
        break;
      case '--api-url':
        apiBaseUrl = args[++i];
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
    console.error('Error: --agent is required');
    printHelp();
    process.exit(1);
  }

  try {
    console.log('\n' + '═'.repeat(80));
    console.log('Add ART-E Tasks to Agent via API');
    console.log('═'.repeat(80));
    console.log(`Agent ID:    ${agentId}`);
    console.log(`Workspace:   ${workspaceId}`);
    console.log(`API URL:     ${apiBaseUrl}`);
    console.log(`Split:       ${split}`);
    console.log(`Task count:  ${count}`);
    console.log(`Format:      ${useJson ? 'json' : 'parquet'}`);
    console.log('─'.repeat(80));

    // Load ART-E tasks
    console.log(`\nStep 1/3: Loading ${count} ART-E tasks from ${split} split...`);
    const tasks = await loadArtEDataset(split, count, useJson);

    if (tasks.length === 0) {
      console.error('Error: No tasks loaded');
      process.exit(1);
    }

    console.log(`✓ Loaded ${tasks.length} tasks`);

    // Create taskset
    console.log(`\nStep 2/3: Creating taskset for agent ${agentId}...`);
    const taskset = await createTaskset(
      agentId,
      `ART-E ${split.charAt(0).toUpperCase() + split.slice(1)} Tasks`,
      `Tasks from ART-E benchmark ${split} split (${tasks.length} tasks)`,
      workspaceId,
      apiBaseUrl
    );

    console.log(`✓ Created taskset: ${taskset.id}`);

    // Add tasks in batches
    console.log(`\nStep 3/3: Adding tasks to taskset...`);
    const batchSize = 10;
    let totalInserted = 0;
    let totalSkipped = 0;

    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);

      const tasksPayload = batch.map((task) => ({
        user_message: task.question,
        expected_output: task.answer,
        source: 'imported' as const,
        metadata: {
          dataset: 'art-e',
          split,
          task_id: task.id,
          query_date: task.query_date,
          inbox_address: task.inbox_address,
          message_ids: task.message_ids,
          realistic_score: task.realistic_score,
        },
      }));

      const result = await addTasks(
        agentId,
        taskset.id,
        tasksPayload,
        workspaceId,
        apiBaseUrl
      );

      totalInserted += result.inserted;
      totalSkipped += result.skipped;

      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(tasks.length / batchSize);
      process.stdout.write(
        `\r  Batch ${batchNum}/${totalBatches}: ${result.inserted} inserted, ${result.skipped} skipped`
      );
    }

    console.log('\n');

    // Print summary
    console.log('─'.repeat(80));
    console.log('✅ Successfully added ART-E tasks to agent');
    console.log('─'.repeat(80));
    console.log(`Agent ID:        ${agentId}`);
    console.log(`Taskset ID:      ${taskset.id}`);
    console.log(`Total tasks:     ${tasks.length}`);
    console.log(`Inserted:        ${totalInserted}`);
    console.log(`Skipped:         ${totalSkipped} (duplicates)`);
    console.log('═'.repeat(80));

    console.log('\n📝 Next Steps:');
    console.log('  1. Run benchmark against these tasks:');
    console.log(`     bun scripts/run-art-e-benchmark.ts --agent ${agentId} --limit ${count}`);
    console.log('\n  2. View taskset in UI:');
    console.log(`     http://localhost:3000/agents/${agentId}/tasksets`);
    console.log('\n  3. Run GEPA optimization using this taskset:');
    console.log(`     # Use taskset ID: ${taskset.id}`);
    console.log('');
  } catch (error) {
    console.error('\nError:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
Add ART-E Tasks to Agent via API

Usage:
  bun scripts/add-arte-tasks-to-agent.ts [options]

Options:
  --agent, -a <id>     Agent ID (required)
  --count, -c <num>    Number of tasks to add (default: 50)
  --split <split>      Dataset split: train or test (default: test)
  --workspace <id>     Workspace ID (default: from WORKSPACE_ID env)
  --api-url <url>      API base URL (default: from API_URL env or http://localhost:8787)
  --use-json           Use JSON API (limited to 100 rows)
  --help, -h           Show this help

Examples:
  # Add 50 test tasks to agent
  bun scripts/add-arte-tasks-to-agent.ts --agent agent_email_assistant

  # Add 100 train tasks
  bun scripts/add-arte-tasks-to-agent.ts --agent agent_email_assistant --count 100 --split train

  # Use JSON API for quick testing (no parquetjs needed)
  bun scripts/add-arte-tasks-to-agent.ts --agent agent_email_assistant --count 20 --use-json

Environment:
  API_URL         API base URL (default: http://localhost:8787)
  WORKSPACE_ID    Workspace ID (default: workspace_default)
`);
}

main();
