#!/usr/bin/env bun
/**
 * Add ART-E benchmark tasks to agent via API
 *
 * This script:
 * 1. Creates the Email Assistant agent if it doesn't exist (or updates its prompt if empty)
 * 2. Creates a taskset for the agent
 * 3. Adds ART-E tasks to the taskset
 *
 * Usage:
 *   bun scripts/add-arte-tasks-to-agent.ts [options]
 *
 * Options:
 *   --agent, -a <id>     Agent ID (default: agent_email_assistant)
 *   --count, -c <num>    Number of tasks to add (default: 50)
 *   --split <split>      Dataset split: train or test (default: test)
 *   --workspace <id>     Workspace ID (default: from WORKSPACE_ID env)
 *   --api-url <url>      API base URL (default: from API_URL env or http://localhost:8787)
 *   --use-json           Use JSON API (limited to 100 rows, no parquetjs needed)
 *   --help, -h           Show help
 *
 * Examples:
 *   # Add 50 test tasks (creates Email Assistant if needed)
 *   bun scripts/add-arte-tasks-to-agent.ts
 *
 *   # Add 100 train tasks
 *   bun scripts/add-arte-tasks-to-agent.ts --count 100 --split train
 *
 *   # Use JSON API for quick testing
 *   bun scripts/add-arte-tasks-to-agent.ts --count 20 --use-json
 */

import { loadArtEDataset } from '../src/benchmark/art-e-loader';

// =============================================================================
// Email Assistant Configuration
// =============================================================================

const EMAIL_ASSISTANT_ID = 'agent_email_assistant';

const EMAIL_ASSISTANT_CONFIG = {
  name: 'Email Assistant',
  description: 'AI assistant for searching and answering questions about emails. Uses the Enron email dataset for ART-E benchmark tasks.',
  promptTemplate: `You are an email assistant helping users find and understand their emails.

**Current Context:**
- Today's date: {{query_date}}
- User's inbox: {{inbox_address}}

**Your Capabilities:**
You have access to email search and retrieval tools:
- \`email_search\`: Search emails by keywords. Provide a query string to find relevant emails.
- \`email_get\`: Retrieve full email content by message_id.

**Instructions:**
1. When asked about emails, use the email_search tool to find relevant messages
2. Search the user's inbox ({{inbox_address}}) for relevant emails
3. Use email_get to read the full content of specific emails when needed
4. Provide clear, accurate answers based on the email content
5. If no relevant emails are found, say so clearly

**Important:**
- Always search the correct inbox ({{inbox_address}})
- Consider the query date ({{query_date}}) when interpreting time-relative questions
- Quote relevant parts of emails in your answers when helpful
- If asked about attachments, note that attachment content is not available

Answer the user's question based on the emails you find.`,
};

const API_BASE = process.env.API_URL || 'http://localhost:8787';
const WORKSPACE_ID = process.env.WORKSPACE_ID || 'workspace_default';

interface AgentResponse {
  id: string;
  name: string;
  description: string;
  active_version_id: string | null;
}

interface AgentVersionResponse {
  id: string;
  agent_id: string;
  version: number;
  prompt_template: string;
  status: string;
}

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
 * Get agent by ID, returns null if not found
 */
async function getAgent(
  agentId: string,
  workspaceId: string,
  apiBase: string
): Promise<AgentResponse | null> {
  const response = await fetch(`${apiBase}/api/agents/${agentId}`, {
    method: 'GET',
    headers: {
      'X-Workspace-Id': workspaceId,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get agent: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Create a new agent
 */
async function createAgent(
  agentId: string,
  name: string,
  description: string,
  workspaceId: string,
  apiBase: string
): Promise<AgentResponse> {
  const response = await fetch(`${apiBase}/api/agents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Workspace-Id': workspaceId,
    },
    body: JSON.stringify({ id: agentId, name, description }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create agent: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Get the active version for an agent
 */
async function getActiveVersion(
  agentId: string,
  workspaceId: string,
  apiBase: string
): Promise<AgentVersionResponse | null> {
  const response = await fetch(`${apiBase}/api/agents/${agentId}/versions`, {
    method: 'GET',
    headers: {
      'X-Workspace-Id': workspaceId,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get versions: ${response.status} - ${errorText}`);
  }

  const versions: AgentVersionResponse[] = await response.json();
  // Find active version
  return versions.find(v => v.status === 'active') || versions[0] || null;
}

/**
 * Create a new agent version with a prompt template
 */
async function createAgentVersion(
  agentId: string,
  promptTemplate: string,
  workspaceId: string,
  apiBase: string
): Promise<AgentVersionResponse> {
  const response = await fetch(`${apiBase}/api/agents/${agentId}/versions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Workspace-Id': workspaceId,
    },
    body: JSON.stringify({
      prompt_template: promptTemplate,
      source: 'manual',
      status: 'active',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create version: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Update an agent version's prompt template
 */
async function updateAgentVersion(
  agentId: string,
  versionId: string,
  promptTemplate: string,
  workspaceId: string,
  apiBase: string
): Promise<AgentVersionResponse> {
  const response = await fetch(`${apiBase}/api/agents/${agentId}/versions/${versionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Workspace-Id': workspaceId,
    },
    body: JSON.stringify({
      prompt_template: promptTemplate,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to update version: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Ensure Email Assistant agent exists with proper prompt template
 */
async function ensureEmailAssistant(
  agentId: string,
  workspaceId: string,
  apiBase: string
): Promise<{ agent: AgentResponse; version: AgentVersionResponse; created: boolean; updated: boolean }> {
  let created = false;
  let updated = false;

  // Check if agent exists
  let agent = await getAgent(agentId, workspaceId, apiBase);

  if (!agent) {
    // Create the agent
    console.log(`  Creating Email Assistant agent (${agentId})...`);
    agent = await createAgent(
      agentId,
      EMAIL_ASSISTANT_CONFIG.name,
      EMAIL_ASSISTANT_CONFIG.description,
      workspaceId,
      apiBase
    );
    created = true;
  }

  // Check if agent has a version with a proper prompt
  let version = await getActiveVersion(agentId, workspaceId, apiBase);

  if (!version) {
    // Create a new version with the prompt
    console.log(`  Creating agent version with Email Assistant prompt...`);
    version = await createAgentVersion(
      agentId,
      EMAIL_ASSISTANT_CONFIG.promptTemplate,
      workspaceId,
      apiBase
    );
    updated = true;
  } else if (!version.prompt_template || version.prompt_template.trim() === '') {
    // Update existing version with proper prompt
    console.log(`  Updating agent version with Email Assistant prompt...`);
    version = await updateAgentVersion(
      agentId,
      version.id,
      EMAIL_ASSISTANT_CONFIG.promptTemplate,
      workspaceId,
      apiBase
    );
    updated = true;
  } else if (!version.prompt_template.includes('{{inbox_address}}')) {
    // Prompt exists but doesn't have the required variables - update it
    console.log(`  Updating agent prompt to include required variables...`);
    version = await updateAgentVersion(
      agentId,
      version.id,
      EMAIL_ASSISTANT_CONFIG.promptTemplate,
      workspaceId,
      apiBase
    );
    updated = true;
  }

  return { agent, version, created, updated };
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
  let agentId: string = EMAIL_ASSISTANT_ID; // Default to Email Assistant
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

    // Step 0: Ensure Email Assistant agent exists with proper prompt
    console.log(`\nStep 0/4: Ensuring Email Assistant agent exists...`);
    const { agent, version, created, updated } = await ensureEmailAssistant(
      agentId,
      workspaceId,
      apiBaseUrl
    );

    if (created) {
      console.log(`✓ Created new agent: ${agent.name} (${agent.id})`);
    } else if (updated) {
      console.log(`✓ Updated agent prompt template`);
    } else {
      console.log(`✓ Agent exists with proper prompt`);
    }
    console.log(`  Active version: ${version.id}`);

    // Load ART-E tasks
    console.log(`\nStep 1/4: Loading ${count} ART-E tasks from ${split} split...`);
    const tasks = await loadArtEDataset(split, count, useJson);

    if (tasks.length === 0) {
      console.error('Error: No tasks loaded');
      process.exit(1);
    }

    console.log(`✓ Loaded ${tasks.length} tasks`);

    // Create taskset
    console.log(`\nStep 2/4: Creating taskset for agent ${agentId}...`);
    const taskset = await createTaskset(
      agentId,
      `ART-E ${split.charAt(0).toUpperCase() + split.slice(1)} Tasks`,
      `Tasks from ART-E benchmark ${split} split (${tasks.length} tasks)`,
      workspaceId,
      apiBaseUrl
    );

    console.log(`✓ Created taskset: ${taskset.id}`);

    // Add tasks in batches
    console.log(`\nStep 3/4: Adding tasks to taskset...`);
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
    console.log('  1. View taskset in UI:');
    console.log(`     http://localhost:3000/agents/${agentId}/tasksets`);
    console.log('\n  2. Run taskset via API:');
    console.log(`     curl -X POST ${apiBaseUrl}/api/agents/${agentId}/tasksets/${taskset.id}/runs \\`);
    console.log(`       -H "X-Workspace-Id: ${workspaceId}" -H "Content-Type: application/json"`);
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

This script:
1. Creates the Email Assistant agent if it doesn't exist (with proper prompt template)
2. Updates the agent's prompt if it's empty or missing required variables
3. Creates a taskset for the agent
4. Adds ART-E benchmark tasks to the taskset

The Email Assistant prompt includes:
- {{inbox_address}} - The user's email inbox (from task metadata)
- {{query_date}} - The context date for the query (from task metadata)

Usage:
  bun scripts/add-arte-tasks-to-agent.ts [options]

Options:
  --agent, -a <id>     Agent ID (default: agent_email_assistant)
  --count, -c <num>    Number of tasks to add (default: 50)
  --split <split>      Dataset split: train or test (default: test)
  --workspace <id>     Workspace ID (default: from WORKSPACE_ID env)
  --api-url <url>      API base URL (default: from API_URL env or http://localhost:8787)
  --use-json           Use JSON API (limited to 100 rows)
  --help, -h           Show this help

Examples:
  # Add 50 test tasks (auto-creates Email Assistant agent)
  bun scripts/add-arte-tasks-to-agent.ts

  # Add 100 train tasks
  bun scripts/add-arte-tasks-to-agent.ts --count 100 --split train

  # Use JSON API for quick testing (no parquetjs needed)
  bun scripts/add-arte-tasks-to-agent.ts --count 20 --use-json

Environment:
  API_URL         API base URL (default: http://localhost:8787)
  WORKSPACE_ID    Workspace ID (default: workspace_default)
`);
}

main();
