# Deep Eval Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace single-shot eval generation with an iterative, tool-using agent that achieves 80% accuracy.

**Architecture:** Reuse DeepAgents pattern from playground. Add eval-specific tools (fetch_traces, test_eval_code, get_trace_details). Agent iterates naturally until 80% accuracy or wrap-up threshold.

**Tech Stack:** LangGraph, LangChain tools, Zod schemas, Python sandbox, D1 database

---

## Task 1: Create Eval Tools Module

**Files:**
- Create: `src/services/eval/eval-tools.ts`
- Test: `src/services/eval/eval-tools.test.ts`

**Step 1: Write the failing test for fetch_traces**

```typescript
// src/services/eval/eval-tools.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFetchTracesTool, createGetTraceDetailsTool, createTestEvalCodeTool } from './eval-tools';
import type { ToolContext } from './eval-tools';

describe('eval-tools', () => {
  const mockDb = {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    all: vi.fn(),
    first: vi.fn(),
  };

  const mockContext: ToolContext = {
    db: mockDb as any,
    agentId: 'agent_123',
    sandbox: undefined,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetch_traces', () => {
    it('returns trace summaries with correct structure', async () => {
      mockDb.all.mockResolvedValue({
        results: [
          {
            id: 'trace_1',
            trace_id: 'ext_trace_1',
            steps: JSON.stringify([{ output: 'This is a test output that is longer than 200 characters to test truncation. '.repeat(5) }]),
            rating: 'positive',
          },
        ],
      });

      const tool = createFetchTracesTool(mockContext);
      const result = await tool.invoke({ rating: 'positive', limit: 10 });
      const parsed = JSON.parse(result);

      expect(parsed.traces).toHaveLength(1);
      expect(parsed.traces[0].id).toBe('trace_1');
      expect(parsed.traces[0].summary.length).toBeLessThanOrEqual(200);
      expect(parsed.traces[0].rating).toBe('positive');
    });

    it('filters by rating when provided', async () => {
      mockDb.all.mockResolvedValue({ results: [] });

      const tool = createFetchTracesTool(mockContext);
      await tool.invoke({ rating: 'negative', limit: 5 });

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("rating = 'negative'")
      );
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/services/eval/eval-tools.test.ts`
Expected: FAIL with "Cannot find module './eval-tools'"

**Step 3: Write the eval-tools implementation**

```typescript
// src/services/eval/eval-tools.ts
/**
 * Eval-specific tools for the Deep Eval Agent
 *
 * Tools:
 * - fetch_traces: Get labeled trace summaries for an agent
 * - get_trace_details: Get full trace data for deep analysis
 * - test_eval_code: Test eval function against labeled traces
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { EvalTester, type TestCase } from '../../eval-generator/tester';
import type { Trace } from '../../types/trace';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';

export interface ToolContext {
  db: D1Database;
  agentId: string;
  sandbox?: DurableObjectNamespace<Sandbox>;
}

/**
 * Create fetch_traces tool
 * Returns trace summaries to avoid context overflow
 */
export function createFetchTracesTool(context: ToolContext) {
  return tool(
    async ({ rating, limit = 20, offset = 0 }): Promise<string> => {
      try {
        // Build query with optional rating filter
        let query = `
          SELECT t.id, t.trace_id, t.steps, f.rating
          FROM traces t
          INNER JOIN feedback f ON f.trace_id = t.id
          WHERE f.agent_id = ?
        `;
        const params: (string | number)[] = [context.agentId];

        if (rating && rating !== 'all') {
          query += ` AND f.rating = '${rating}'`;
        }

        query += ` ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const result = await context.db.prepare(query).bind(...params).all();
        const rows = result.results || [];

        // Get total count
        let countQuery = `
          SELECT COUNT(*) as total
          FROM traces t
          INNER JOIN feedback f ON f.trace_id = t.id
          WHERE f.agent_id = ?
        `;
        if (rating && rating !== 'all') {
          countQuery += ` AND f.rating = '${rating}'`;
        }
        const countResult = await context.db.prepare(countQuery).bind(context.agentId).first();
        const total = (countResult as any)?.total || 0;

        // Transform to summaries
        const traces = rows.map((row: any) => {
          let steps = [];
          try {
            steps = typeof row.steps === 'string' ? JSON.parse(row.steps) : (row.steps || []);
          } catch {
            steps = [];
          }

          // Extract summary from last step's output
          const lastStep = steps[steps.length - 1];
          const output = lastStep?.output || '';
          const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
          const summary = outputStr.substring(0, 200);

          // Check for tool calls
          const hasToolCalls = steps.some((s: any) => s.tool_calls && s.tool_calls.length > 0);

          return {
            id: row.id,
            trace_id: row.trace_id,
            rating: row.rating,
            summary,
            step_count: steps.length,
            has_tool_calls: hasToolCalls,
          };
        });

        return JSON.stringify({ traces, total }, null, 2);
      } catch (error: any) {
        return JSON.stringify({ error: error.message });
      }
    },
    {
      name: 'fetch_traces',
      description:
        'Fetch labeled traces for the agent. Returns summaries (first 200 chars of output) to avoid context overflow. ' +
        'Use get_trace_details to see full trace data for specific traces.',
      schema: z.object({
        rating: z.enum(['positive', 'negative', 'all']).optional().describe('Filter by label: positive, negative, or all'),
        limit: z.number().optional().describe('Max traces to return (default 20)'),
        offset: z.number().optional().describe('Offset for pagination'),
      }),
    }
  );
}

/**
 * Create get_trace_details tool
 * Returns full trace data for deep analysis
 */
export function createGetTraceDetailsTool(context: ToolContext) {
  return tool(
    async ({ trace_id }): Promise<string> => {
      try {
        const result = await context.db
          .prepare('SELECT id, trace_id, steps, raw_data FROM traces WHERE id = ? OR trace_id = ?')
          .bind(trace_id, trace_id)
          .first();

        if (!result) {
          return JSON.stringify({ error: `Trace not found: ${trace_id}` });
        }

        const row = result as any;
        let steps = [];
        let rawData = null;

        try {
          steps = typeof row.steps === 'string' ? JSON.parse(row.steps) : (row.steps || []);
        } catch {
          steps = [];
        }

        try {
          rawData = row.raw_data
            ? (typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : row.raw_data)
            : null;
        } catch {
          rawData = null;
        }

        return JSON.stringify({
          id: row.id,
          trace_id: row.trace_id,
          steps,
          raw_data: rawData,
        }, null, 2);
      } catch (error: any) {
        return JSON.stringify({ error: error.message });
      }
    },
    {
      name: 'get_trace_details',
      description:
        'Get full details of a specific trace for deep analysis. ' +
        'Use this to inspect traces that look interesting from fetch_traces summaries.',
      schema: z.object({
        trace_id: z.string().describe('Trace ID (internal id or external trace_id)'),
      }),
    }
  );
}

/**
 * Create test_eval_code tool
 * Tests eval function against labeled traces
 */
export function createTestEvalCodeTool(context: ToolContext) {
  return tool(
    async ({ code, trace_ids }): Promise<string> => {
      try {
        // Fetch traces to test against
        let query = `
          SELECT t.id, t.trace_id, t.steps, t.source, t.raw_data, f.rating
          FROM traces t
          INNER JOIN feedback f ON f.trace_id = t.id
          WHERE f.agent_id = ?
        `;
        const params: (string | number)[] = [context.agentId];

        if (trace_ids && trace_ids.length > 0) {
          const placeholders = trace_ids.map(() => '?').join(',');
          query += ` AND (t.id IN (${placeholders}) OR t.trace_id IN (${placeholders}))`;
          params.push(...trace_ids, ...trace_ids);
        }

        const result = await context.db.prepare(query).bind(...params).all();
        const rows = result.results || [];

        if (rows.length === 0) {
          return JSON.stringify({ error: 'No traces found to test against' });
        }

        // Build test cases
        const testCases: TestCase[] = rows.map((row: any) => {
          let steps = [];
          let rawData = null;

          try {
            steps = typeof row.steps === 'string' ? JSON.parse(row.steps) : (row.steps || []);
          } catch {
            steps = [];
          }

          try {
            rawData = row.raw_data
              ? (typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : row.raw_data)
              : null;
          } catch {
            rawData = null;
          }

          const trace: Trace = {
            id: row.id,
            trace_id: row.trace_id,
            steps,
            source: row.source || 'langfuse',
            raw_data: rawData,
          };

          // Convert rating to expected score
          const expectedScore = row.rating === 'positive' ? 1.0 : 0.0;

          return { trace, expectedScore };
        });

        // Run tests
        const tester = new EvalTester({ sandboxBinding: context.sandbox });
        const testResult = await tester.test(code, testCases);

        // Build mismatch details
        const mismatches = testResult.details
          .filter(d => !d.match || d.error)
          .map(d => ({
            trace_id: d.traceId,
            expected: d.expectedScore >= 0.5 ? 'positive' : 'negative',
            predicted: d.predictedScore >= 0.5 ? 'positive' : 'negative',
            score: d.predictedScore,
            feedback: d.feedback,
            error: d.error,
          }));

        return JSON.stringify({
          accuracy: testResult.accuracy,
          total: testResult.total,
          correct: testResult.correct,
          incorrect: testResult.incorrect,
          errors: testResult.errors,
          mismatches,
        }, null, 2);
      } catch (error: any) {
        return JSON.stringify({ error: error.message });
      }
    },
    {
      name: 'test_eval_code',
      description:
        'Test an eval function against labeled traces. Returns accuracy and details of mismatches. ' +
        'If accuracy >= 80%, you have succeeded. Otherwise, analyze mismatches and refine.',
      schema: z.object({
        code: z.string().describe('Python eval function code to test'),
        trace_ids: z.array(z.string()).optional().describe('Specific trace IDs to test (if omitted, tests all labeled traces)'),
      }),
    }
  );
}

/**
 * Create all eval tools
 */
export function createEvalTools(context: ToolContext) {
  return [
    createFetchTracesTool(context),
    createGetTraceDetailsTool(context),
    createTestEvalCodeTool(context),
  ];
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test src/services/eval/eval-tools.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/eval/eval-tools.ts src/services/eval/eval-tools.test.ts
git commit -m "feat: add eval-specific tools for deep agent

Tools: fetch_traces, get_trace_details, test_eval_code
- fetch_traces returns summaries to avoid context overflow
- get_trace_details for deep analysis of specific traces
- test_eval_code runs eval in sandbox and returns accuracy"
```

---

## Task 2: Create Deep Eval Agent Service

**Files:**
- Create: `src/services/eval/deep-eval-agent.ts`
- Test: `src/services/eval/deep-eval-agent.test.ts`

**Step 1: Write the failing test**

```typescript
// src/services/eval/deep-eval-agent.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeepEvalAgent, type DeepEvalAgentConfig } from './deep-eval-agent';

describe('DeepEvalAgent', () => {
  const mockDb = {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    all: vi.fn(),
    first: vi.fn(),
  };

  const mockConfig: DeepEvalAgentConfig = {
    agentId: 'agent_123',
    evalName: 'test_quality',
    db: mockDb as any,
    env: {
      CF_ACCOUNT_ID: 'test',
      CF_GATEWAY_ID: 'test',
    } as any,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructs with required config', () => {
    const agent = new DeepEvalAgent(mockConfig);
    expect(agent).toBeDefined();
  });

  it('has correct system prompt with eval name', () => {
    const agent = new DeepEvalAgent(mockConfig);
    const systemPrompt = agent.getSystemPrompt();
    expect(systemPrompt).toContain('eval_test_quality');
    expect(systemPrompt).toContain('80%');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/services/eval/deep-eval-agent.test.ts`
Expected: FAIL with "Cannot find module './deep-eval-agent'"

**Step 3: Write the deep-eval-agent implementation**

```typescript
// src/services/eval/deep-eval-agent.ts
/**
 * Deep Eval Agent
 *
 * An iterative, tool-using agent that generates eval functions.
 * Reuses the DeepAgents pattern from playground with eval-specific tools.
 */

import { createAgentNoCache } from '../../playground/create-agent-no-cache';
import { D1Backend } from '../../playground/backend/d1-backend';
import { getChatModel, type Env } from '../../playground/llm/streaming';
import { createEvalTools, type ToolContext } from './eval-tools';
import { createPlaygroundTools } from '../../playground/tools/definitions';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';

const RECURSION_LIMIT = 50;
const WRAP_UP_THRESHOLD = 45;

export interface DeepEvalAgentConfig {
  agentId: string;
  evalName: string;
  db: D1Database;
  env: Env;
  sandbox?: DurableObjectNamespace<Sandbox>;
  onLog?: (level: 'info' | 'warn' | 'error', message: string, data?: Record<string, any>) => void;
}

export interface DeepEvalResult {
  code: string;
  accuracy: number;
  iterations: number;
}

/**
 * Build the system prompt for the eval agent
 */
function buildSystemPrompt(evalName: string): string {
  return `You are an eval function generator. Your job is to write a Python function that accurately classifies agent trace quality based on labeled examples.

## Your Process

1. **Fetch samples** - Use fetch_traces to get positive and negative examples
2. **Analyze patterns** - Study what distinguishes good from bad traces
3. **Write eval** - Create a Python function: def eval_${evalName}(trace, ctx=None) -> tuple[float, str]
4. **Test** - Use test_eval_code to measure accuracy
5. **Refine** - If accuracy < 80%, analyze mismatches and improve

## Eval Function Requirements

- Signature: def eval_${evalName}(trace: dict, ctx=None) -> tuple[float, str]
- Return: (score 0.0-1.0, "explanation string")
- Score >= 0.5 means "positive/good quality"
- Score < 0.5 means "negative/bad quality"
- Allowed imports: json, re, typing, math, datetime, difflib

## Tips

- Use get_trace_details to inspect specific traces deeply
- If context gets large, write notes to files using write_file
- Focus on patterns that generalize, not trace-specific hacks
- Look at tool_calls, input/output structure, and error fields

## Success Criteria

Stop when accuracy >= 80%. You have up to 5 test attempts.

When you achieve >= 80% accuracy or have exhausted your attempts, output your final eval function clearly marked.`;
}

export class DeepEvalAgent {
  private config: DeepEvalAgentConfig;
  private systemPrompt: string;

  constructor(config: DeepEvalAgentConfig) {
    this.config = config;
    this.systemPrompt = buildSystemPrompt(config.evalName);
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  private log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, any>) {
    if (this.config.onLog) {
      this.config.onLog(level, message, data);
    }
  }

  async generate(): Promise<DeepEvalResult> {
    const sessionId = `eval-agent-${this.config.agentId}-${Date.now()}`;

    this.log('info', 'Initializing deep eval agent', {
      agentId: this.config.agentId,
      evalName: this.config.evalName,
      sessionId,
    });

    // Create D1Backend for filesystem operations
    const backend = new D1Backend(this.config.db, sessionId);

    // Get the LangChain model
    const model = getChatModel({
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-5-20250514',
      env: this.config.env,
      temperature: 0.7,
    });

    // Build eval-specific tools
    const evalToolContext: ToolContext = {
      db: this.config.db,
      agentId: this.config.agentId,
      sandbox: this.config.sandbox,
    };
    const evalTools = createEvalTools(evalToolContext);

    // Build filesystem tools
    const fsTools = createPlaygroundTools(
      { DB: this.config.db, SANDBOX: this.config.sandbox },
      sessionId
    );

    // Combine all tools
    const allTools = [...evalTools, ...fsTools];

    this.log('info', 'Agent tools loaded', {
      evalTools: evalTools.map(t => t.name),
      fsTools: fsTools.map(t => t.name),
    });

    // Create the agent
    const agent = createAgentNoCache({
      model,
      backend: () => backend,
      systemPrompt: this.systemPrompt,
      tools: allTools,
    });

    // Initial message to start the agent
    const messages = [
      {
        role: 'user' as const,
        content: `Generate an eval function named "eval_${this.config.evalName}" for this agent. Start by fetching some labeled traces to understand the patterns.`,
      },
    ];

    let iterations = 0;
    let bestCode = '';
    let bestAccuracy = 0;
    let stepCount = 0;

    try {
      // Stream agent events
      const eventStream = agent.streamEvents(
        { messages },
        { version: 'v2', recursionLimit: RECURSION_LIMIT }
      );

      for await (const { event, data } of eventStream) {
        stepCount++;

        // Log tool calls
        if (event === 'on_tool_start') {
          const toolName = data.input?.tool || 'unknown';
          this.log('info', `Tool: ${toolName}`, { input: data.input });
        }

        // Log tool results
        if (event === 'on_tool_end') {
          const output = data.output?.content || data.output;
          const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

          // Check for test results
          if (outputStr.includes('"accuracy"')) {
            try {
              const result = JSON.parse(outputStr);
              if (result.accuracy !== undefined) {
                iterations++;
                this.log('info', `Test iteration ${iterations}`, {
                  accuracy: `${(result.accuracy * 100).toFixed(1)}%`,
                  correct: result.correct,
                  incorrect: result.incorrect,
                  errors: result.errors,
                });

                if (result.accuracy > bestAccuracy) {
                  bestAccuracy = result.accuracy;
                }

                if (result.accuracy >= 0.8) {
                  this.log('info', 'Success! Accuracy >= 80%');
                }
              }
            } catch {
              // Not a test result, ignore
            }
          }
        }

        // Log agent text output
        if (event === 'on_chat_model_stream') {
          const chunk = data.chunk;
          if (chunk?.content && typeof chunk.content === 'string') {
            // Look for eval function code in the output
            const codeMatch = chunk.content.match(/```python\s*([\s\S]*?)```/);
            if (codeMatch && codeMatch[1].includes('def eval_')) {
              bestCode = codeMatch[1].trim();
            }
          }
        }

        // Check if we're approaching recursion limit
        if (stepCount >= WRAP_UP_THRESHOLD && !bestCode) {
          this.log('warn', 'Approaching recursion limit, will request final answer');
        }
      }
    } catch (error: any) {
      // Handle recursion limit error gracefully
      if (error.name === 'GraphRecursionError' || error.message?.includes('recursion')) {
        this.log('warn', 'Hit recursion limit, extracting best result');
      } else {
        throw error;
      }
    }

    // If we still don't have code, there's a problem
    if (!bestCode) {
      throw new Error('Agent did not produce an eval function');
    }

    this.log('info', 'Eval generation complete', {
      iterations,
      accuracy: `${(bestAccuracy * 100).toFixed(1)}%`,
      codeLength: bestCode.length,
    });

    return {
      code: bestCode,
      accuracy: bestAccuracy,
      iterations,
    };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test src/services/eval/deep-eval-agent.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/eval/deep-eval-agent.ts src/services/eval/deep-eval-agent.test.ts
git commit -m "feat: add DeepEvalAgent service

Iterative agent that generates eval functions using tools.
Uses LangGraph with eval-specific + filesystem tools.
Targets 80% accuracy with max 5 test iterations."
```

---

## Task 3: Update EvalGenerationJob to Use Deep Agent

**Files:**
- Modify: `src/jobs/eval-generation-job.ts`

**Step 1: Read and understand current implementation**

The current implementation uses `EvalGenerator` for single-shot generation. We'll replace the core logic with `DeepEvalAgent` while keeping the job structure.

**Step 2: Update the job to use DeepEvalAgent**

```typescript
// In src/jobs/eval-generation-job.ts
// Replace the existing execute() method internals

// Add import at top:
import { DeepEvalAgent } from '../services/eval/deep-eval-agent';

// Replace execute() method body (keep signature):
async execute(stream?: SSEStream): Promise<GenerateEvalJobResult> {
  this.stream = stream;

  try {
    // Update job to running
    await this.jobManager.updateJobStatus(this.config.jobId, 'running', 0);
    await this.log('info', 'Starting deep eval agent', {
      jobId: this.config.jobId,
      agentId: this.config.agentId,
      evalName: this.config.name,
    });
    this.emitProgress('initializing', 0);

    // Create deep eval agent
    const agent = new DeepEvalAgent({
      agentId: this.config.agentId,
      evalName: this.config.name,
      db: this.deps.db,
      env: {
        CF_ACCOUNT_ID: this.deps.cfAccountId,
        CF_GATEWAY_ID: this.deps.cfGatewayId,
        CF_GATEWAY_TOKEN: this.deps.cfGatewayToken,
      } as any,
      sandbox: this.deps.sandboxBinding,
      onLog: (level, message, data) => this.log(level, message, data),
    });

    this.emitProgress('running_agent', 10);

    // Run the agent
    const agentResult = await agent.generate();

    await this.log('info', 'Agent completed', {
      accuracy: `${(agentResult.accuracy * 100).toFixed(1)}%`,
      iterations: agentResult.iterations,
    });

    this.emitProgress('saving_eval', 90);

    // Save eval to database
    const evalId = `eval_${crypto.randomUUID()}`;
    const versionResult = await this.drizzle
      .select({
        nextVersion: sql<number>`COALESCE(MAX(${evals.version}), 0) + 1`,
      })
      .from(evals)
      .where(eq(evals.agentId, this.config.agentId))
      .limit(1);
    const version = versionResult[0]?.nextVersion || 1;

    const now = new Date().toISOString();
    await this.drizzle.insert(evals).values({
      id: evalId,
      agentId: this.config.agentId,
      version,
      name: this.config.name,
      description: this.config.description || null,
      code: agentResult.code,
      modelUsed: 'anthropic/claude-sonnet-4-5',
      accuracy: agentResult.accuracy,
      testResults: { iterations: agentResult.iterations } as Record<string, unknown>,
      executionCount: 0,
      contradictionCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    const result: GenerateEvalJobResult = {
      eval_id: evalId,
      accuracy: agentResult.accuracy,
      test_results: {
        correct: 0,
        incorrect: 0,
        errors: 0,
        total: 0,
        details: [],
      },
    };

    await this.log('info', 'Eval saved', { evalId, version, accuracy: agentResult.accuracy });
    await this.jobManager.completeJob(this.config.jobId, result);
    this.emitProgress('completed', 100);

    return result;
  } catch (error: any) {
    console.error('Eval generation job failed:', error);
    await this.log('error', 'Eval generation failed', {
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
    });
    await this.jobManager.failJob(this.config.jobId, error.message);

    if (this.stream) {
      this.stream.sendFailed(error.message, error.stack);
    }

    throw error;
  }
}
```

**Step 3: Remove unused imports and old generator code**

Remove these imports if no longer used:
- `EvalGenerator` from '../eval-generator/generator'
- `EvalTester` from '../eval-generator/tester' (now used in eval-tools)

**Step 4: Test manually with Docker**

Run: `docker logs -f iofold-backend`
Then trigger an eval generation from the UI and observe logs.

**Step 5: Commit**

```bash
git add src/jobs/eval-generation-job.ts
git commit -m "feat: replace single-shot eval generation with deep agent

EvalGenerationJob now uses DeepEvalAgent for iterative,
tool-based eval generation. Agent targets 80% accuracy
with fetch_traces, test_eval_code, and filesystem tools."
```

---

## Task 4: Simplify EvalContext (Remove Cache)

**Files:**
- Modify: `src/services/eval/eval-context.ts`
- Modify: `src/types/eval-context.ts`

**Step 1: Update the EvalContext interface**

```typescript
// src/types/eval-context.ts
// Remove cache-related methods, keep only call_llm

export interface LLMCallOptions {
  prompt: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  // Remove: cache_key
}

export interface EvalContext {
  call_llm(options: LLMCallOptions): Promise<string>;
  // Remove: get_cost_so_far, get_remaining_budget, has_cache, get_cache, set_cache
}

export interface EvalContextConfig {
  max_budget_usd: number;
  timeout_ms: number;
  additional_imports?: string[];
}
```

**Step 2: Update EvalContextImpl**

```typescript
// src/services/eval/eval-context.ts
// Remove cache-related code from EvalContextImpl

// Remove these fields:
// - private cache: Map<string, string>
// - stats.cache_hits, stats.cache_misses

// Remove these methods:
// - has_cache()
// - get_cache()
// - set_cache()

// Simplify call_llm to not check cache:
async call_llm(options: LLMCallOptions): Promise<string> {
  const model = options.model || DEFAULT_MODEL;
  const temperature = options.temperature !== undefined ? options.temperature : 0.0;
  const max_tokens = options.max_tokens || 500;

  const modelConfig = getModelConfig(model);
  if (!modelConfig) {
    throw new Error(`Unsupported model: ${model}`);
  }

  const response = await this.client.chat.completions.create({
    model,
    max_tokens,
    temperature,
    messages: [{ role: 'user', content: options.prompt }],
  });

  const choice = response.choices[0];
  if (!choice?.message?.content) {
    throw new Error('No content in LLM response');
  }

  return choice.message.content;
}
```

**Step 3: Update prompts.ts to reflect simpler EvalContext**

```typescript
// In src/eval-generator/prompts.ts
// Update the EvalContext documentation in the prompt to remove cache methods

// Change from:
// - ctx.call_llm(prompt, model, temperature, max_tokens, cache_key)
// - ctx.get_cost_so_far()
// - ctx.get_remaining_budget()
// - ctx.set_cache() / get_cache() / has_cache()

// To:
// - ctx.call_llm(prompt, model, temperature, max_tokens)
```

**Step 4: Run tests**

Run: `pnpm test`
Expected: All tests pass (some may need updates if they test cache methods)

**Step 5: Commit**

```bash
git add src/services/eval/eval-context.ts src/types/eval-context.ts src/eval-generator/prompts.ts
git commit -m "refactor: simplify EvalContext by removing cache

Remove cache_key parameter and cache methods from EvalContext.
Gateway handles caching if needed. Simpler API for eval functions."
```

---

## Task 5: Integration Test with Playwright

**Files:**
- Test: `frontend/e2e/eval-generation.spec.ts` (if exists, otherwise manual test)

**Step 1: Ensure backend is running**

```bash
docker compose up -d
docker logs -f iofold-backend
```

**Step 2: Ensure frontend is running**

```bash
docker logs -f iofold-frontend
```

**Step 3: Manual E2E test**

1. Navigate to an agent with labeled traces
2. Click "Generate Eval"
3. Fill in name: "test_quality"
4. Submit
5. Observe LiveJobMonitor shows agent activity:
   - "Fetching traces..."
   - "Testing eval code..."
   - Accuracy updates
6. Verify eval is saved with >= some accuracy

**Step 4: Document any issues found**

If issues are found, create follow-up tasks.

**Step 5: Commit any test files**

```bash
git add frontend/e2e/
git commit -m "test: add E2E test for deep eval agent generation"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create eval tools module | `src/services/eval/eval-tools.ts` |
| 2 | Create DeepEvalAgent service | `src/services/eval/deep-eval-agent.ts` |
| 3 | Update EvalGenerationJob | `src/jobs/eval-generation-job.ts` |
| 4 | Simplify EvalContext | `src/services/eval/eval-context.ts` |
| 5 | Integration test | Manual + E2E |

Total estimated commits: 5
