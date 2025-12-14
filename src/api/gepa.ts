/**
 * GEPA API Endpoints
 *
 * Handles GEPA (Generative Evolution of Prompts via Algorithms) optimization:
 * - Starting GEPA optimization runs
 * - Checking run status and progress
 * - Retrieving optimization results
 */

/// <reference types="@cloudflare/workers-types" />

import {
  createErrorResponse,
  createSuccessResponse,
  getWorkspaceId,
  validateWorkspaceAccess,
  parseJsonBody,
} from './utils';
import { createDb, type Database } from '../db/client';
import { eq, and, desc, sql } from 'drizzle-orm';
import { agents } from '../db/schema/agents';
import { tasksets, tasksetTasks } from '../db/schema/tasksets';
import { evals } from '../db/schema/evals';
import { gepaRuns, gepaRunTasks } from '../db/schema/gepa';
import { traces } from '../db/schema/traces';
import { agentVersions } from '../db/schema/agents';
import { feedback } from '../db/schema/feedback';

export interface Env {
  DB: D1Database;
  JOB_QUEUE?: {
    send(message: any): Promise<void>;
  };
}

/**
 * Generate ID with prefix
 */
function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

// ============================================================================
// Request/Response Types
// ============================================================================

interface StartGEPARequest {
  taskset_id?: string;           // PREFERRED: Use tasks from this taskset
  eval_id?: string;              // DEPRECATED: Use tasks from this eval's traces
  tasks?: Array<{                // OR provide tasks directly (ad-hoc)
    user_message: string;
    expected_output?: string;
  }>;
  seed_prompt?: string;          // Optional, defaults to agent's current prompt
  train_split?: number;          // Default: 0.7
  random_seed?: number;          // For reproducible splits
  max_metric_calls?: number;     // Default: 50
  parallelism?: number;          // Default: 5
}

interface StartGEPAResponse {
  run_id: string;
  status: 'pending';
  message: string;
}

interface GEPARunStatus {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: {
    metric_calls: number;
    max_metric_calls: number;
    best_score?: number;
    total_candidates: number;
  };
  result?: {
    best_prompt: string;
    best_score: number;
  };
  error?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

// ============================================================================
// POST /api/agents/:agentId/gepa/start
// ============================================================================

/**
 * POST /api/agents/:agentId/gepa/start
 *
 * Start a GEPA optimization run for an agent.
 *
 * @param request - HTTP request with StartGEPARequest body
 * @param env - Cloudflare environment with D1 database and queue
 * @param agentId - Agent ID from URL
 * @returns 201 Created with run details
 */
export async function startGEPAOptimization(
  request: Request,
  env: Env,
  agentId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // After validation, workspaceId is guaranteed to be non-null
    if (!workspaceId) {
      throw new Error('Missing X-Workspace-Id header');
    }

    const drizzle = createDb(env.DB);
    const body = await parseJsonBody<StartGEPARequest>(request);

    // 1. Validate agent exists and user has access
    const agentResult = await drizzle
      .select({
        id: agents.id,
        workspace_id: agents.workspaceId,
        active_version_id: agents.activeVersionId,
      })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
      .limit(1);

    if (agentResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    const agent = agentResult[0];

    // 2. Validate that taskset_id, eval_id, or tasks are provided
    if (!body.taskset_id && !body.eval_id && (!body.tasks || body.tasks.length === 0)) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Either taskset_id, eval_id, or tasks (non-empty) must be provided',
        400
      );
    }

    // 3. Extract test cases based on source
    let testCases: Array<{ id?: string; user_message: string; expected_output?: string }> = [];
    let tasksetId: string | null = null;
    let evalRecord: any = null;

    // Priority: taskset_id > eval_id > inline tasks
    if (body.taskset_id) {
      // Load tasks from taskset
      const tasksetResult = await drizzle
        .select({
          id: tasksets.id,
          agent_id: tasksets.agentId,
          task_count: tasksets.taskCount,
        })
        .from(tasksets)
        .where(and(eq(tasksets.id, body.taskset_id), eq(tasksets.agentId, agentId)))
        .limit(1);

      if (tasksetResult.length === 0) {
        return createErrorResponse('NOT_FOUND', 'Taskset not found', 404);
      }

      tasksetId = body.taskset_id;

      const tasksResult = await drizzle
        .select({
          id: tasksetTasks.id,
          user_message: tasksetTasks.userMessage,
          expected_output: tasksetTasks.expectedOutput,
        })
        .from(tasksetTasks)
        .where(eq(tasksetTasks.tasksetId, body.taskset_id))
        .orderBy(tasksetTasks.createdAt);

      if (tasksResult.length === 0) {
        return createErrorResponse(
          'VALIDATION_ERROR',
          'Taskset has no tasks. Add tasks before starting GEPA.',
          400
        );
      }

      testCases = tasksResult.map((t) => ({
        id: t.id,
        user_message: t.user_message,
        expected_output: t.expected_output || undefined,
      }));

    } else if (body.eval_id) {
      // DEPRECATED: Extract tasks from traces (legacy behavior)
      const evalRecordResult = await drizzle
        .select({
          id: evals.id,
          agent_id: evals.agentId,
          code: evals.code,
        })
        .from(evals)
        .where(and(eq(evals.id, body.eval_id), eq(evals.agentId, agentId)))
        .limit(1);

      if (evalRecordResult.length === 0) {
        return createErrorResponse('NOT_FOUND', 'Eval not found', 404);
      }

      evalRecord = evalRecordResult[0];

      // Extract tasks from traces associated with this eval
      const tracesResult = await drizzle
        .select({
          id: traces.id,
          steps: traces.steps,
          rating: feedback.rating,
        })
        .from(traces)
        .innerJoin(feedback, eq(traces.id, feedback.traceId))
        .innerJoin(agentVersions, eq(traces.agentVersionId, agentVersions.id))
        .where(and(
          eq(agentVersions.agentId, agentId),
          sql`${feedback.rating} IS NOT NULL`
        ))
        .orderBy(desc(traces.importedAt))
        .limit(100);

      if (tracesResult.length === 0) {
        return createErrorResponse(
          'VALIDATION_ERROR',
          'No labeled traces found for this agent. Please add feedback to traces first.',
          400
        );
      }

      // Extract user messages from trace steps
      for (const row of tracesResult) {
        const steps = (row.steps || []) as Array<{ messages_added?: Array<{ role?: string; content?: string }> }>;

        for (const step of steps) {
          const messages = step.messages_added || [];
          for (const msg of messages) {
            if (msg.role === 'user' && msg.content) {
              testCases.push({
                user_message: msg.content,
                expected_output: row.rating === 'positive' ? 'success' : 'failure',
              });
              break;
            }
          }
          if (testCases.length > 0 && testCases[testCases.length - 1].user_message) {
            break;
          }
        }
      }

      if (testCases.length === 0) {
        return createErrorResponse(
          'VALIDATION_ERROR',
          'Could not extract user messages from labeled traces',
          400
        );
      }
    } else if (body.tasks) {
      testCases = body.tasks;
    }

    // 5. Get seed prompt (from agent's active version or provided)
    let seedPrompt = body.seed_prompt;
    if (!seedPrompt) {
      if (agent.active_version_id) {
        const activeVersionResult = await drizzle
          .select({ prompt_template: agentVersions.promptTemplate })
          .from(agentVersions)
          .where(eq(agentVersions.id, agent.active_version_id))
          .limit(1);

        seedPrompt = activeVersionResult.length > 0
          ? activeVersionResult[0].prompt_template
          : 'You are a helpful assistant.';
      } else {
        seedPrompt = 'You are a helpful assistant.';
      }
    }

    // 6. Create gepa_runs record
    const runId = generateId('gepa');
    const now = new Date().toISOString();
    const maxMetricCalls = body.max_metric_calls || 50;
    const parallelism = body.parallelism || 5;
    const trainSplit = body.train_split || 0.7;
    const randomSeed = body.random_seed || Math.floor(Math.random() * 2147483647);

    await drizzle.insert(gepaRuns).values({
      id: runId,
      workspaceId: workspaceId,
      agentId: agentId,
      evalId: body.eval_id || null,
      tasksetId: tasksetId,
      seedPrompt: seedPrompt,
      testCaseCount: testCases.length,
      maxMetricCalls: maxMetricCalls,
      parallelism: parallelism,
      trainSplit: trainSplit,
      valSplit: 1 - trainSplit,
      randomSeed: randomSeed,
      status: 'pending',
      progressMetricCalls: 0,
      createdAt: now,
    });

    // 6a. If using taskset, create gepa_run_tasks entries with split assignments
    if (tasksetId && testCases.length > 0) {
      // Shuffle tasks using seeded random
      const shuffled = [...testCases];
      const seededRandom = (seed: number) => {
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
      };
      let currentSeed = randomSeed;
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom(currentSeed++) * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      // Assign splits
      const trainCount = Math.floor(shuffled.length * trainSplit);
      const insertValues = shuffled.map((task, idx) => {
        const split = idx < trainCount ? 'train' as const : 'val' as const;
        const taskEntryId = generateId('grt');
        return {
          id: taskEntryId,
          runId: runId,
          taskId: task.id!,
          split: split,
        };
      });

      // Insert in batches if needed
      for (const value of insertValues) {
        await drizzle.insert(gepaRunTasks).values(value);
      }
    }

    // 7. Queue GEPA optimization job
    if (!env.JOB_QUEUE) {
      return createErrorResponse(
        'INTERNAL_ERROR',
        'Job queue not configured',
        500
      );
    }

    // Get API base URL and session token for the GEPA job
    const url = new URL(request.url);
    const apiBaseUrl = `${url.protocol}//${url.host}`;
    const sessionToken = request.headers.get('Authorization')?.replace('Bearer ', '') || '';

    await env.JOB_QUEUE.send({
      type: 'gepa_optimization',
      run_id: runId,
      agent_id: agentId,
      eval_id: body.eval_id || null,
      taskset_id: tasksetId,
      seed_prompt: seedPrompt,
      test_cases: testCases,  // Still include for backward compat
      train_split: trainSplit,
      random_seed: randomSeed,
      max_metric_calls: maxMetricCalls,
      parallelism: parallelism,
      api_base_url: apiBaseUrl,
      session_token: sessionToken,
      workspace_id: workspaceId,
    });

    // 8. Return run ID for polling
    const response: StartGEPAResponse = {
      run_id: runId,
      status: 'pending',
      message: 'GEPA optimization started',
    };

    return createSuccessResponse(response, 201);

  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    if (error.message === 'Invalid JSON in request body') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

// ============================================================================
// GET /api/agents/:agentId/gepa/runs
// ============================================================================

/**
 * GET /api/agents/:agentId/gepa/runs
 *
 * List all GEPA optimization runs for an agent.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment with D1 database
 * @param agentId - Agent ID from URL
 * @returns 200 OK with list of runs
 */
export async function listGEPARuns(
  request: Request,
  env: Env,
  agentId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // After validation, workspaceId is guaranteed to be non-null
    if (!workspaceId) {
      throw new Error('Missing X-Workspace-Id header');
    }

    const drizzle = createDb(env.DB);

    // 1. Validate agent exists and user has access
    const agentResult = await drizzle
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
      .limit(1);

    if (agentResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // 2. Get all runs for this agent
    const runsResult = await drizzle
      .select({
        id: gepaRuns.id,
        status: gepaRuns.status,
        progress_metric_calls: gepaRuns.progressMetricCalls,
        max_metric_calls: gepaRuns.maxMetricCalls,
        test_case_count: gepaRuns.testCaseCount,
        best_score: gepaRuns.bestScore,
        total_candidates: gepaRuns.totalCandidates,
        error: gepaRuns.error,
        created_at: gepaRuns.createdAt,
        started_at: gepaRuns.startedAt,
        completed_at: gepaRuns.completedAt,
      })
      .from(gepaRuns)
      .where(and(eq(gepaRuns.agentId, agentId), eq(gepaRuns.workspaceId, workspaceId)))
      .orderBy(desc(gepaRuns.createdAt))
      .limit(50);

    const runs = runsResult.map((run) => ({
      id: run.id,
      status: run.status,
      progress: {
        metric_calls: run.progress_metric_calls || 0,
        max_metric_calls: run.max_metric_calls!,
        best_score: run.best_score || null,
        total_candidates: run.total_candidates || 0,
      },
      test_case_count: run.test_case_count,
      error: run.error || null,
      created_at: run.created_at,
      started_at: run.started_at || null,
      completed_at: run.completed_at || null,
    }));

    return createSuccessResponse({ runs });

  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

// ============================================================================
// GET /api/agents/:agentId/gepa/runs/:runId
// ============================================================================

/**
 * GET /api/agents/:agentId/gepa/runs/:runId
 *
 * Get status and progress of a GEPA optimization run.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment with D1 database
 * @param agentId - Agent ID from URL
 * @param runId - Run ID from URL
 * @returns 200 OK with run status
 */
export async function getGEPARunStatus(
  request: Request,
  env: Env,
  agentId: string,
  runId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // After validation, workspaceId is guaranteed to be non-null
    if (!workspaceId) {
      throw new Error('Missing X-Workspace-Id header');
    }

    const drizzle = createDb(env.DB);

    // 1. Validate agent exists and user has access
    const agentResult = await drizzle
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
      .limit(1);

    if (agentResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // 2. Get run record
    const runResult = await drizzle
      .select({
        id: gepaRuns.id,
        status: gepaRuns.status,
        progress_metric_calls: gepaRuns.progressMetricCalls,
        max_metric_calls: gepaRuns.maxMetricCalls,
        best_prompt: gepaRuns.bestPrompt,
        best_score: gepaRuns.bestScore,
        total_candidates: gepaRuns.totalCandidates,
        error: gepaRuns.error,
        created_at: gepaRuns.createdAt,
        started_at: gepaRuns.startedAt,
        completed_at: gepaRuns.completedAt,
      })
      .from(gepaRuns)
      .where(and(
        eq(gepaRuns.id, runId),
        eq(gepaRuns.agentId, agentId),
        eq(gepaRuns.workspaceId, workspaceId)
      ))
      .limit(1);

    if (runResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'GEPA run not found', 404);
    }

    const run = runResult[0];

    // 3. Build response
    const response: GEPARunStatus = {
      id: run.id,
      status: run.status as any,
      progress: {
        metric_calls: run.progress_metric_calls || 0,
        max_metric_calls: run.max_metric_calls!,
        best_score: run.best_score || undefined,
        total_candidates: run.total_candidates || 0,
      },
      created_at: run.created_at,
    };

    // Add started_at if present (when status is 'running', 'completed', or 'failed')
    if (run.started_at) {
      response.started_at = run.started_at;
    }

    // Add result if completed
    if (run.status === 'completed' && run.best_prompt) {
      response.result = {
        best_prompt: run.best_prompt,
        best_score: run.best_score!,
      };
      response.completed_at = run.completed_at!;
    }

    // Add error if failed
    if (run.status === 'failed' && run.error) {
      response.error = run.error;
      response.completed_at = run.completed_at!;
    }

    return createSuccessResponse(response);

  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

// ============================================================================
// GET /api/agents/:agentId/gepa/runs/:runId/stream
// ============================================================================

/**
 * GET /api/agents/:agentId/gepa/runs/:runId/stream
 *
 * Stream real-time progress updates for a GEPA optimization run via Server-Sent Events.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment with D1 database
 * @param agentId - Agent ID from URL
 * @param runId - Run ID from URL
 * @returns SSE stream with progress updates
 */
export async function streamGEPAProgress(
  request: Request,
  env: Env,
  agentId: string,
  runId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // After validation, workspaceId is guaranteed to be non-null
    if (!workspaceId) {
      throw new Error('Missing X-Workspace-Id header');
    }

    const drizzle = createDb(env.DB);

    // 1. Validate agent exists and user has access
    const agentResult = await drizzle
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
      .limit(1);

    if (agentResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // 2. Validate run exists
    const runResult = await drizzle
      .select({
        id: gepaRuns.id,
        status: gepaRuns.status,
      })
      .from(gepaRuns)
      .where(and(
        eq(gepaRuns.id, runId),
        eq(gepaRuns.agentId, agentId),
        eq(gepaRuns.workspaceId, workspaceId)
      ))
      .limit(1);

    if (runResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'GEPA run not found', 404);
    }

    const run = runResult[0];

    // 3. Create SSE stream
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Helper to send SSE event
    const sendEvent = async (event: string, data: any) => {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      await writer.write(encoder.encode(message));
    };

    // Helper to send keepalive comment
    const sendKeepalive = async () => {
      await writer.write(encoder.encode(': keepalive\n\n'));
    };

    // Start polling in background
    (async () => {
      try {
        let lastStatus = run.status as string;
        let pollCount = 0;
        const maxPolls = 400; // 10 minutes at 1.5s interval = 400 polls

        // Poll until completed, failed, or timeout
        while (pollCount < maxPolls) {
          // Get latest run state
          const currentRunResult = await drizzle
            .select({
              status: gepaRuns.status,
              progress_metric_calls: gepaRuns.progressMetricCalls,
              max_metric_calls: gepaRuns.maxMetricCalls,
              best_score: gepaRuns.bestScore,
              total_candidates: gepaRuns.totalCandidates,
              best_prompt: gepaRuns.bestPrompt,
              error: gepaRuns.error,
            })
            .from(gepaRuns)
            .where(eq(gepaRuns.id, runId))
            .limit(1);

          if (currentRunResult.length === 0) {
            await sendEvent('error', { error: 'Run not found' });
            break;
          }

          const currentRun = currentRunResult[0];
          const status = currentRun.status;

          // Send progress event
          if (status === 'pending' || status === 'running') {
            await sendEvent('progress', {
              metric_calls: currentRun.progress_metric_calls || 0,
              max_metric_calls: currentRun.max_metric_calls,
              best_score: currentRun.best_score || null,
              total_candidates: currentRun.total_candidates || 0,
            });
          }

          // Send completion event
          if (status === 'completed') {
            await sendEvent('complete', {
              best_prompt: currentRun.best_prompt,
              best_score: currentRun.best_score,
              total_candidates: currentRun.total_candidates || 0,
            });
            break;
          }

          // Send error event
          if (status === 'failed') {
            await sendEvent('error', {
              error: currentRun.error || 'Optimization failed',
            });
            break;
          }

          // Wait 1.5 seconds before next poll
          await new Promise(resolve => setTimeout(resolve, 1500));
          pollCount++;

          // Send keepalive every few polls to prevent timeout
          if (pollCount % 10 === 0) {
            await sendKeepalive();
          }
        }

        // Timeout reached
        if (pollCount >= maxPolls) {
          await sendEvent('error', { error: 'Stream timeout reached' });
        }

      } catch (error: any) {
        // Send error event on exception
        await sendEvent('error', {
          error: error.message || 'Internal error during streaming',
        });
      } finally {
        // Close the stream
        await writer.close();
      }
    })();

    // 4. Return SSE response
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
