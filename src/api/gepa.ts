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
  eval_id?: string;              // Use tasks from this eval's traces
  tasks?: Array<{                // OR provide tasks directly
    user_message: string;
    expected_output?: string;
  }>;
  seed_prompt?: string;          // Optional, defaults to agent's current prompt
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

    const body = await parseJsonBody<StartGEPARequest>(request);

    // 1. Validate agent exists and user has access
    const agent = await env.DB.prepare(
      `SELECT id, workspace_id, active_version_id FROM agents WHERE id = ? AND workspace_id = ?`
    ).bind(agentId, workspaceId).first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // 2. Validate that either eval_id or tasks are provided
    if (!body.eval_id && (!body.tasks || body.tasks.length === 0)) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Either eval_id or tasks (non-empty) must be provided',
        400
      );
    }

    // 3. If eval_id provided, validate it exists
    let evalRecord: any = null;
    if (body.eval_id) {
      evalRecord = await env.DB.prepare(
        `SELECT id, agent_id, code FROM evals WHERE id = ? AND agent_id = ?`
      ).bind(body.eval_id, agentId).first();

      if (!evalRecord) {
        return createErrorResponse('NOT_FOUND', 'Eval not found', 404);
      }
    }

    // 4. Extract test cases (tasks)
    let testCases: Array<{ user_message: string; expected_output?: string }> = [];

    if (body.eval_id && evalRecord) {
      // Extract tasks from traces associated with this eval
      // Get traces that have feedback (labeled data)
      const tracesResult = await env.DB.prepare(`
        SELECT DISTINCT
          t.id,
          t.steps,
          f.rating
        FROM traces t
        JOIN feedback f ON t.id = f.trace_id
        JOIN agent_versions av ON t.agent_version_id = av.id
        WHERE av.agent_id = ?
          AND f.rating IS NOT NULL
        ORDER BY t.imported_at DESC
        LIMIT 100
      `).bind(agentId).all();

      if (!tracesResult.results || tracesResult.results.length === 0) {
        return createErrorResponse(
          'VALIDATION_ERROR',
          'No labeled traces found for this agent. Please add feedback to traces first.',
          400
        );
      }

      // Extract user messages from trace steps
      for (const row of tracesResult.results) {
        const steps = row.steps ? JSON.parse(row.steps as string) : [];

        // Find first user message in steps
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
            break; // Found user message for this trace, move to next
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
        const activeVersion = await env.DB.prepare(
          `SELECT prompt_template FROM agent_versions WHERE id = ?`
        ).bind(agent.active_version_id).first();

        seedPrompt = activeVersion?.prompt_template as string || 'You are a helpful assistant.';
      } else {
        seedPrompt = 'You are a helpful assistant.';
      }
    }

    // 6. Create gepa_runs record
    const runId = generateId('gepa');
    const now = new Date().toISOString();
    const maxMetricCalls = body.max_metric_calls || 50;
    const parallelism = body.parallelism || 5;

    await env.DB.prepare(`
      INSERT INTO gepa_runs (
        id, workspace_id, agent_id, eval_id,
        seed_prompt, test_case_count, max_metric_calls, parallelism,
        status, progress_metric_calls,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)
    `).bind(
      runId,
      workspaceId,
      agentId,
      body.eval_id || null,
      seedPrompt,
      testCases.length,
      maxMetricCalls,
      parallelism,
      now
    ).run();

    // 7. Queue GEPA optimization job
    if (!env.JOB_QUEUE) {
      return createErrorResponse(
        'INTERNAL_ERROR',
        'Job queue not configured',
        500
      );
    }

    await env.JOB_QUEUE.send({
      type: 'gepa_optimization',
      run_id: runId,
      agent_id: agentId,
      eval_id: body.eval_id || null,
      seed_prompt: seedPrompt,
      test_cases: testCases,
      max_metric_calls: maxMetricCalls,
      parallelism: parallelism,
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

    // 1. Validate agent exists and user has access
    const agent = await env.DB.prepare(
      `SELECT id FROM agents WHERE id = ? AND workspace_id = ?`
    ).bind(agentId, workspaceId).first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // 2. Get run record
    const run = await env.DB.prepare(`
      SELECT
        id,
        status,
        progress_metric_calls,
        max_metric_calls,
        best_prompt,
        best_score,
        total_candidates,
        error,
        created_at,
        started_at,
        completed_at
      FROM gepa_runs
      WHERE id = ? AND agent_id = ? AND workspace_id = ?
    `).bind(runId, agentId, workspaceId).first();

    if (!run) {
      return createErrorResponse('NOT_FOUND', 'GEPA run not found', 404);
    }

    // 3. Build response
    const response: GEPARunStatus = {
      id: run.id as string,
      status: run.status as any,
      progress: {
        metric_calls: (run.progress_metric_calls as number) || 0,
        max_metric_calls: run.max_metric_calls as number,
        best_score: run.best_score as number | undefined,
        total_candidates: (run.total_candidates as number) || 0,
      },
      created_at: run.created_at as string,
    };

    // Add result if completed
    if (run.status === 'completed' && run.best_prompt) {
      response.result = {
        best_prompt: run.best_prompt as string,
        best_score: run.best_score as number,
      };
      response.completed_at = run.completed_at as string;
    }

    // Add error if failed
    if (run.status === 'failed' && run.error) {
      response.error = run.error as string;
      response.completed_at = run.completed_at as string;
    }

    return createSuccessResponse(response);

  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
