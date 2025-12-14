#!/usr/bin/env npx tsx
/**
 * Database Seed Script using Drizzle ORM
 *
 * Seeds the local D1 database with realistic test data:
 * - Users and workspaces
 * - Integrations
 * - Agents with multiple versions
 * - Traces with realistic conversation data
 * - Feedback linked to traces
 * - Evals with execution results
 * - Jobs with various statuses
 *
 * Usage:
 *   npx tsx scripts/seed-database.ts [--db-path=.wrangler/state/v3/d1/...]
 *
 * Or with API mode (requires running backend):
 *   npx tsx scripts/seed-database.ts --api-url=http://localhost:8787 --traces=100
 */

import * as crypto from 'crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema';

// Parse arguments
const args = process.argv.slice(2);
const getArg = (name: string) => args.find(a => a.startsWith(`--${name}=`))?.split('=')[1];

const DB_PATH = getArg('db-path') || '.tmp/seed.db';
const TRACE_COUNT = parseInt(getArg('traces') || '50');
const WORKSPACE_ID = 'workspace_default';

// ============================================================================
// Sample Data Templates
// ============================================================================

const AGENT_TEMPLATES = [
  {
    name: 'Customer Support Agent',
    description: 'AI assistant for handling customer inquiries, returns, and support tickets',
    promptTemplate: 'You are a helpful customer support agent for {{company_name}}.\n\nYour role is to:\n- Answer customer questions about products and services\n- Help resolve issues with orders and shipping\n- Maintain a friendly, professional tone\n\nCompany policies:\n- Refunds within {{refund_days}} days\n- Free shipping over ${{free_shipping_threshold}}\n\nAlways be helpful and aim to resolve issues in one interaction.',
    variables: ['company_name', 'refund_days', 'free_shipping_threshold'],
    variations: [
      { company_name: 'TechCorp', refund_days: '30', free_shipping_threshold: '50' },
      { company_name: 'ShopMart', refund_days: '14', free_shipping_threshold: '75' },
    ],
    userMessages: [
      'I need to return my order from last week',
      'When will my package arrive?',
      'Can I get a refund for a damaged item?',
      'How do I track my shipment?',
      'What is your return policy?',
    ],
  },
  {
    name: 'Code Review Assistant',
    description: 'Senior software engineer providing code reviews with focus on quality and security',
    promptTemplate: 'You are a senior software engineer conducting code reviews.\n\nFocus areas:\n- Code quality and best practices\n- Security vulnerabilities\n- Performance issues\n- {{language}} specific patterns\n\nProgramming language: {{language}}\nReview style: {{review_style}}\n\nProvide constructive feedback with specific suggestions for improvement.',
    variables: ['language', 'review_style'],
    variations: [
      { language: 'TypeScript', review_style: 'thorough' },
      { language: 'Python', review_style: 'security-focused' },
    ],
    userMessages: [
      'Please review this function for any issues',
      'Is there a more efficient way to write this?',
      'Are there any security concerns in this code?',
      'How can I improve the error handling?',
    ],
  },
  {
    name: 'Writing Assistant',
    description: 'Professional writing assistant for various content types',
    promptTemplate: 'You are a professional writing assistant specializing in {{writing_type}}.\n\nYour capabilities:\n- Improve clarity and readability\n- Fix grammar and spelling errors\n- Adjust tone to match target audience\n\nWriting style: {{tone}}\n\nHelp users create compelling, well-structured content.',
    variables: ['writing_type', 'tone'],
    variations: [
      { writing_type: 'blog posts', tone: 'conversational' },
      { writing_type: 'technical documentation', tone: 'formal' },
    ],
    userMessages: [
      'Help me improve this paragraph',
      'Make this email more professional',
      'Can you make this shorter and clearer?',
      'Check this for grammar errors',
    ],
  },
];

const GOOD_RESPONSES = [
  'I understand your concern and would be happy to help you with that. Let me provide a detailed solution.',
  'Great question! Based on the information you provided, here is my recommendation:',
  'Thank you for reaching out. I have analyzed your request and here are the key findings:',
  'I can definitely assist you with this. Here is a step-by-step approach:',
];

const BAD_RESPONSES = [
  'I cannot help with that request.',
  'Error processing your request. Please try again.',
  'I do not understand what you are asking.',
  'That is outside my current capabilities.',
];

// ============================================================================
// Helper Functions
// ============================================================================

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(daysAgo: number): string {
  const now = new Date();
  const msAgo = randomInt(0, daysAgo * 24 * 60 * 60 * 1000);
  return new Date(now.getTime() - msAgo).toISOString();
}

function fillTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);
}

// ============================================================================
// Database Seeding Functions
// ============================================================================

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

async function seedUsers(db: DrizzleDb): Promise<string> {
  console.log('  Creating user...');
  const userId = 'user_seed123';

  await db.insert(schema.users).values({
    id: userId,
    email: 'seed@iofold.com',
  }).onConflictDoNothing();

  console.log(`    Created user: ${userId}`);
  return userId;
}

async function seedWorkspace(db: DrizzleDb, userId: string): Promise<string> {
  console.log('  Creating workspace...');

  await db.insert(schema.workspaces).values({
    id: WORKSPACE_ID,
    userId,
    name: 'Seed Workspace',
  }).onConflictDoNothing();

  console.log(`    Created workspace: ${WORKSPACE_ID}`);
  return WORKSPACE_ID;
}

async function seedIntegration(db: DrizzleDb, workspaceId: string): Promise<string> {
  console.log('  Creating integration...');
  const integrationId = generateId('int');

  await db.insert(schema.integrations).values({
    id: integrationId,
    workspaceId,
    platform: 'langfuse',
    name: 'Langfuse Integration',
    apiKeyEncrypted: 'encrypted_' + crypto.randomUUID(),
    status: 'active',
    lastSyncedAt: new Date().toISOString(),
  }).onConflictDoNothing();

  console.log(`    Created integration: ${integrationId}`);
  return integrationId;
}

async function seedAgents(
  db: DrizzleDb,
  workspaceId: string
): Promise<Array<{ id: string; template: typeof AGENT_TEMPLATES[0] }>> {
  console.log('  Creating agents...');
  const agents: Array<{ id: string; template: typeof AGENT_TEMPLATES[0] }> = [];

  for (const template of AGENT_TEMPLATES) {
    const agentId = generateId('agent');

    await db.insert(schema.agents).values({
      id: agentId,
      workspaceId,
      name: template.name,
      description: template.description,
      status: 'confirmed',
      activeVersionId: null,
    });

    // Create versions for this agent
    let activeVersionId: string | null = null;
    for (let i = 0; i < template.variations.length; i++) {
      const variation = template.variations[i];
      const versionId = generateId('ver');
      const filledPrompt = fillTemplate(template.promptTemplate, variation);

      await db.insert(schema.agentVersions).values({
        id: versionId,
        agentId,
        version: i + 1,
        promptTemplate: filledPrompt,
        variables: JSON.stringify(template.variables),
        source: i === 0 ? 'discovered' : 'manual',
        status: i === template.variations.length - 1 ? 'active' : 'candidate',
        accuracy: 0.85 + Math.random() * 0.1,
      });

      if (i === template.variations.length - 1) {
        activeVersionId = versionId;
      }
    }

    // Update agent with active version
    if (activeVersionId) {
      await db.update(schema.agents)
        .set({ activeVersionId })
        .where(eq(schema.agents.id, agentId));
    }

    agents.push({ id: agentId, template });
    console.log(`    Created agent: ${template.name} (${agentId})`);
  }

  return agents;
}

async function seedTraces(
  db: DrizzleDb,
  workspaceId: string,
  integrationId: string,
  agents: Array<{ id: string; template: typeof AGENT_TEMPLATES[0] }>
): Promise<Array<{ id: string; agentId: string; isGood: boolean }>> {
  console.log('  Creating traces...');
  const traces: Array<{ id: string; agentId: string; isGood: boolean }> = [];
  const tracesPerAgent = Math.floor(TRACE_COUNT / agents.length);

  for (const agent of agents) {
    for (let i = 0; i < tracesPerAgent; i++) {
      const traceId = generateId('trace');
      const isGood = Math.random() > 0.25; // 75% good
      const variation = randomChoice(agent.template.variations);
      const systemPrompt = fillTemplate(agent.template.promptTemplate, variation);
      const userMessage = randomChoice(agent.template.userMessages);
      const response = isGood ? randomChoice(GOOD_RESPONSES) : randomChoice(BAD_RESPONSES);

      const steps = JSON.stringify([{
        step_id: generateId('step'),
        step_type: 'llm',
        timestamp: new Date().toISOString(),
        messages_added: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
          { role: 'assistant', content: response },
        ],
        tool_calls: [],
        input: { user_message: userMessage },
        output: { response },
        metadata: {
          model: randomChoice(['gpt-4', 'claude-3-sonnet']),
          latency_ms: randomInt(200, 2000),
        },
      }]);

      await db.insert(schema.traces).values({
        id: traceId,
        workspaceId,
        integrationId,
        traceId: `langfuse_${traceId}`,
        source: 'langfuse',
        timestamp: randomDate(30),
        steps,
        inputPreview: userMessage.slice(0, 200),
        outputPreview: response.slice(0, 200),
        stepCount: 1,
        hasErrors: !isGood && Math.random() > 0.7,
        assignmentStatus: 'assigned',
      });

      traces.push({ id: traceId, agentId: agent.id, isGood });
    }
    console.log(`    Created ${tracesPerAgent} traces for ${agent.template.name}`);
  }

  return traces;
}

async function seedFeedback(
  db: DrizzleDb,
  traces: Array<{ id: string; agentId: string; isGood: boolean }>
): Promise<void> {
  console.log('  Creating feedback...');
  // Create feedback for 60% of traces
  const tracesWithFeedback = traces
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.floor(traces.length * 0.6));

  let positive = 0, negative = 0, neutral = 0;

  for (const trace of tracesWithFeedback) {
    let rating: 'positive' | 'negative' | 'neutral';
    if (trace.isGood) {
      rating = Math.random() > 0.15 ? 'positive' : 'neutral';
    } else {
      rating = Math.random() > 0.2 ? 'negative' : 'neutral';
    }

    if (rating === 'positive') positive++;
    else if (rating === 'negative') negative++;
    else neutral++;

    await db.insert(schema.feedback).values({
      id: generateId('fb'),
      agentId: trace.agentId,
      traceId: trace.id,
      rating,
      ratingDetail: `Sample ${rating} feedback`,
    }).onConflictDoNothing();
  }

  console.log(`    Created feedback: ${positive} positive, ${negative} negative, ${neutral} neutral`);
}

async function seedEvals(
  db: DrizzleDb,
  agents: Array<{ id: string; template: typeof AGENT_TEMPLATES[0] }>,
  traces: Array<{ id: string; agentId: string; isGood: boolean }>
): Promise<void> {
  console.log('  Creating evals...');

  for (const agent of agents) {
    const agentTraces = traces.filter(t => t.agentId === agent.id).slice(0, 10);
    const evalId = generateId('eval');

    const code = `def eval_${agent.template.name.toLowerCase().replace(/\s+/g, '_')}(trace: dict) -> tuple[bool, str]:
    """Evaluate ${agent.template.name} responses."""
    output = trace.get('output', {}).get('response', '')

    quality_indicators = ['understand', 'help', 'solution', 'recommend']
    has_quality = any(ind in output.lower() for ind in quality_indicators)

    negative_patterns = ['cannot', 'error', 'unable', 'sorry']
    has_negative = any(neg in output.lower() for neg in negative_patterns)

    if has_quality and not has_negative:
        return True, 'Response demonstrates quality indicators'
    elif has_negative:
        return False, 'Response contains negative patterns'
    else:
        return len(output) > 100, 'Based on response length'
`;

    await db.insert(schema.evals).values({
      id: evalId,
      agentId: agent.id,
      version: 1,
      name: `${agent.template.name} Quality Check`,
      description: `Evaluates response quality for ${agent.template.name}`,
      code,
      modelUsed: 'gpt-4',
      accuracy: 0.75 + Math.random() * 0.2,
      trainingTraceIds: JSON.stringify(agentTraces.map(t => t.id)),
      status: 'active',
    });

    // Create eval executions for these traces
    for (const trace of agentTraces) {
      const predictedResult = trace.isGood;
      await db.insert(schema.evalExecutions).values({
        id: generateId('exec'),
        evalId,
        traceId: trace.id,
        predictedResult: predictedResult ? 1 : 0,
        predictedReason: predictedResult ? 'Response meets quality criteria' : 'Response did not meet criteria',
        executionTimeMs: randomInt(50, 300),
      });
    }

    console.log(`    Created eval for ${agent.template.name}`);
  }
}

async function seedJobs(db: DrizzleDb, workspaceId: string): Promise<void> {
  console.log('  Creating jobs...');

  const jobConfigs = [
    { type: 'import' as const, status: 'completed' as const },
    { type: 'generate' as const, status: 'completed' as const },
    { type: 'execute' as const, status: 'running' as const },
    { type: 'agent_discovery' as const, status: 'queued' as const },
    { type: 'prompt_improvement' as const, status: 'failed' as const },
  ];

  for (const config of jobConfigs) {
    const progress = config.status === 'completed' ? 100
      : config.status === 'failed' ? randomInt(10, 80)
      : config.status === 'running' ? randomInt(20, 90)
      : 0;

    await db.insert(schema.jobs).values({
      id: generateId('job'),
      workspaceId,
      type: config.type,
      status: config.status,
      progress,
      metadata: JSON.stringify({ batch_size: randomInt(10, 100) }),
      result: config.status === 'completed' ? JSON.stringify({ processed: randomInt(50, 200), success: true }) : null,
      error: config.status === 'failed' ? 'Simulated error for testing' : null,
      startedAt: config.status !== 'queued' ? randomDate(7) : null,
      completedAt: config.status === 'completed' || config.status === 'failed' ? randomDate(3) : null,
    });
  }

  console.log(`    Created ${jobConfigs.length} jobs`);
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('  iofold Database Seeder (Drizzle ORM)');
  console.log('='.repeat(60));
  console.log(`Database: ${DB_PATH}`);
  console.log(`Traces: ${TRACE_COUNT}`);
  console.log('');

  // Create database connection
  const sqlite = new Database(DB_PATH);
  const db = drizzle(sqlite, { schema });

  try {
    console.log('[1/7] Creating user...');
    const userId = await seedUsers(db);

    console.log('\n[2/7] Creating workspace...');
    const workspaceId = await seedWorkspace(db, userId);

    console.log('\n[3/7] Creating integration...');
    const integrationId = await seedIntegration(db, workspaceId);

    console.log('\n[4/7] Creating agents...');
    const agents = await seedAgents(db, workspaceId);

    console.log('\n[5/7] Creating traces...');
    const traces = await seedTraces(db, workspaceId, integrationId, agents);

    console.log('\n[6/7] Creating feedback...');
    await seedFeedback(db, traces);

    console.log('\n[7/7] Creating evals and jobs...');
    await seedEvals(db, agents, traces);
    await seedJobs(db, workspaceId);

    console.log('\n' + '='.repeat(60));
    console.log('  Seeding Complete!');
    console.log('='.repeat(60));
    console.log(`\n  Summary:`);
    console.log(`  - Users: 1`);
    console.log(`  - Workspaces: 1`);
    console.log(`  - Integrations: 1`);
    console.log(`  - Agents: ${agents.length}`);
    console.log(`  - Traces: ${traces.length}`);
    console.log(`  - Feedback: ${Math.floor(traces.length * 0.6)}`);
    console.log(`  - Evals: ${agents.length}`);
    console.log(`  - Jobs: 5`);

  } finally {
    sqlite.close();
  }
}

main().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
