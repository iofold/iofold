/**
 * Internal Rollout APIs for GEPA Integration
 *
 * These APIs are used by the GEPA Python sandbox to request batch agent
 * executions with candidate prompts and retrieve results.
 */

/// <reference types="@cloudflare/workers-types" />

import {
  createErrorResponse,
  createSuccessResponse,
  getWorkspaceId,
  validateWorkspaceAccess,
  parseJsonBody,
} from '../utils';

import type {
  BatchRolloutRequest,
  BatchRolloutResponse,
  BatchStatusResponse,
  RolloutTaskMessage,
} from '../../types/api';

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

/**
 * POST /api/internal/rollouts/batch
 *
 * Request rollout generation for a batch of tasks.
 * Creates a batch record and queues each task for execution.
 *
 * @param request - HTTP request with BatchRolloutRequest body
 * @param env - Cloudflare environment with D1 database and queue
 * @returns 201 Created with batch details
 */
export async function createBatchRollout(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const body = await parseJsonBody<BatchRolloutRequest>(request);

    // Validate required fields
    if (!body.agent_id || !body.system_prompt || !body.tasks || body.tasks.length === 0) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'agent_id, system_prompt, and tasks (non-empty) are required',
        400
      );
    }

    // 1. Validate agent exists and user has access
    const agent = await env.DB.prepare(
      `SELECT id, workspace_id FROM agents WHERE id = ? AND workspace_id = ?`
    ).bind(body.agent_id, workspaceId).first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // 2. Validate queue exists before creating any records
    if (!env.JOB_QUEUE) {
      return createErrorResponse(
        'INTERNAL_ERROR',
        'Queue not configured',
        500
      );
    }

    // 3. Create batch record
    const batchId = generateId('rb');
    const now = new Date().toISOString();
    const config = JSON.stringify(body.config || {});

    await env.DB.prepare(`
      INSERT INTO rollout_batches (id, workspace_id, agent_id, system_prompt, task_count, status, config, created_at)
      VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)
    `).bind(
      batchId,
      workspaceId,
      body.agent_id,
      body.system_prompt,
      body.tasks.length,
      config,
      now
    ).run();

    // 4. Queue each task

    const parallelism = body.config?.parallelism || 5;
    const timeoutPerTask = body.config?.timeout_per_task_ms || 30000;
    const modelId = body.config?.model_id;

    for (const task of body.tasks) {
      const message: RolloutTaskMessage = {
        type: 'rollout_task',
        batch_id: batchId,
        task_id: task.task_id,
        agent_id: body.agent_id,
        agent_version_id: body.agent_version_id,
        system_prompt: body.system_prompt,
        user_message: task.user_message,
        context: task.context,
        config: {
          parallelism,
          timeout_per_task_ms: timeoutPerTask,
          model_id: modelId,
        },
      };

      await env.JOB_QUEUE.send(message);
    }

    const response: BatchRolloutResponse = {
      batch_id: batchId,
      task_count: body.tasks.length,
      status: 'queued',
      created_at: now,
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

/**
 * GET /api/internal/rollouts/batch/:batchId
 *
 * Poll for batch completion status and results.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment with D1 database
 * @param batchId - Batch ID from URL
 * @returns 200 OK with batch status and results
 */
export async function getBatchStatus(
  request: Request,
  env: Env,
  batchId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // 1. Get batch record
    const batch = await env.DB.prepare(`
      SELECT id, workspace_id, agent_id, system_prompt, task_count, status, config, created_at, completed_at
      FROM rollout_batches
      WHERE id = ? AND workspace_id = ?
    `).bind(batchId, workspaceId).first();

    if (!batch) {
      return createErrorResponse('NOT_FOUND', 'Batch not found', 404);
    }

    // 2. Get all results for this batch
    const resultsQuery = await env.DB.prepare(`
      SELECT id, batch_id, task_id, status, trace, error, execution_time_ms, created_at
      FROM rollout_results
      WHERE batch_id = ?
      ORDER BY created_at ASC
    `).bind(batchId).all();

    const results = resultsQuery.results || [];
    const completed = results.filter((r: any) => r.status === 'completed').length;
    const failed = results.filter((r: any) => r.status === 'failed' || r.status === 'timeout').length;
    const taskCount = batch.task_count as number;
    const pending = taskCount - completed - failed;

    // 3. Determine overall status
    let status: BatchStatusResponse['status'] = 'running';
    if (pending === 0) {
      status = failed > 0 ? 'partial' : 'completed';
    } else if (completed === 0 && failed === 0) {
      status = 'queued';
    }

    // 4. Update batch status in database if completed
    const currentDbStatus = batch.status as string;
    if (pending === 0 && currentDbStatus !== status) {
      const completedAt = new Date().toISOString();
      await env.DB.prepare(`
        UPDATE rollout_batches
        SET status = ?, completed_at = ?
        WHERE id = ?
      `).bind(status, completedAt, batchId).run();

      // Update the batch object for response
      (batch as any).status = status;
      (batch as any).completed_at = completedAt;
    }

    // 5. Build response with results
    const response: BatchStatusResponse = {
      batch_id: batchId,
      status,
      progress: {
        total: taskCount,
        completed,
        failed,
        pending,
      },
      results: results.map((r: any) => ({
        task_id: r.task_id,
        status: r.status,
        trace: r.trace ? JSON.parse(r.trace) : undefined,
        execution_time_ms: r.execution_time_ms,
        error: r.error || undefined,
      })),
      created_at: batch.created_at as string,
      completed_at: pending === 0 ? (batch.completed_at as string | undefined || new Date().toISOString()) : undefined,
    };

    return createSuccessResponse(response);
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
