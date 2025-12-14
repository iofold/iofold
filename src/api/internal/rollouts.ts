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

import { createDb, type Database } from '../../db/client';
import { eq, and, desc, sql, type SQL } from 'drizzle-orm';
import { agents, rolloutBatches, rolloutResults } from '../../db/schema';

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

    // Null check after validation to satisfy TypeScript
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing X-Workspace-Id header', 400);
    }

    const body = await parseJsonBody<BatchRolloutRequest>(request);

    // Validate required fields
    if (!body.agent_id || !body.system_prompt || !body.tasks || body.tasks.length === 0) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'agent_id, system_prompt, and tasks (non-empty) are required',
        400
      );
    }

    const drizzle = createDb(env.DB);

    // 1. Validate agent exists and user has access
    const agentResult = await drizzle
      .select()
      .from(agents)
      .where(and(eq(agents.id, body.agent_id), eq(agents.workspaceId, workspaceId)))
      .limit(1);

    if (agentResult.length === 0) {
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

    await drizzle.insert(rolloutBatches).values({
      id: batchId,
      workspaceId: workspaceId,
      agentId: body.agent_id,
      systemPrompt: body.system_prompt,
      taskCount: body.tasks.length,
      status: 'queued',
      config: body.config || {},
      createdAt: now
    });

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
 * GET /api/internal/rollouts/batches
 *
 * List all rollout batches for the workspace.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment with D1 database
 * @returns 200 OK with list of batches
 */
export async function listRolloutBatches(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Null check after validation to satisfy TypeScript
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing X-Workspace-Id header', 400);
    }

    const drizzle = createDb(env.DB);

    const url = new URL(request.url);
    const agentId = url.searchParams.get('agent_id');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);

    // Build query based on filters
    const conditions: SQL[] = [eq(rolloutBatches.workspaceId, workspaceId)];

    if (agentId) {
      conditions.push(eq(rolloutBatches.agentId, agentId));
    }

    const batchesResult = await drizzle
      .select({
        id: rolloutBatches.id,
        agentId: rolloutBatches.agentId,
        systemPrompt: rolloutBatches.systemPrompt,
        taskCount: rolloutBatches.taskCount,
        status: rolloutBatches.status,
        config: rolloutBatches.config,
        createdAt: rolloutBatches.createdAt,
        completedAt: rolloutBatches.completedAt,
        agentName: agents.name
      })
      .from(rolloutBatches)
      .leftJoin(agents, eq(rolloutBatches.agentId, agents.id))
      .where(and(...conditions))
      .orderBy(desc(rolloutBatches.createdAt))
      .limit(limit);

    // For each batch, get summary of results
    const batches = await Promise.all(batchesResult.map(async (batch) => {
      // Get completion stats
      const statsResult = await drizzle
        .select({
          total: sql<number>`COUNT(*)`,
          completed: sql<number>`SUM(CASE WHEN ${rolloutResults.status} = 'completed' THEN 1 ELSE 0 END)`,
          failed: sql<number>`SUM(CASE WHEN ${rolloutResults.status} = 'failed' OR ${rolloutResults.status} = 'timeout' THEN 1 ELSE 0 END)`
        })
        .from(rolloutResults)
        .where(eq(rolloutResults.batchId, batch.id))
        .limit(1);

      const stats = statsResult[0];

      return {
        id: batch.id,
        agent_id: batch.agentId,
        agent_name: batch.agentName || null,
        system_prompt: batch.systemPrompt?.substring(0, 100) + (batch.systemPrompt?.length > 100 ? '...' : ''),
        task_count: batch.taskCount,
        status: batch.status,
        progress: {
          total: batch.taskCount,
          completed: (stats?.completed as number) || 0,
          failed: (stats?.failed as number) || 0,
        },
        created_at: batch.createdAt,
        completed_at: batch.completedAt || null,
      };
    }));

    return createSuccessResponse({ batches });

  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
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

    // Null check after validation to satisfy TypeScript
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing X-Workspace-Id header', 400);
    }

    const drizzle = createDb(env.DB);

    // 1. Get batch record
    const batchResult = await drizzle
      .select()
      .from(rolloutBatches)
      .where(and(eq(rolloutBatches.id, batchId), eq(rolloutBatches.workspaceId, workspaceId)))
      .limit(1);

    if (batchResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Batch not found', 404);
    }

    const batch = batchResult[0];

    // 2. Get all results for this batch
    const results = await drizzle
      .select()
      .from(rolloutResults)
      .where(eq(rolloutResults.batchId, batchId))
      .orderBy(rolloutResults.createdAt);

    const completed = results.filter((r) => r.status === 'completed').length;
    const failed = results.filter((r) => r.status === 'failed' || r.status === 'timeout').length;
    const taskCount = batch.taskCount;
    const pending = taskCount - completed - failed;

    // 3. Determine overall status
    let status: BatchStatusResponse['status'] = 'running';
    if (pending === 0) {
      status = failed > 0 ? 'partial' : 'completed';
    } else if (completed === 0 && failed === 0) {
      status = 'queued';
    }

    // 4. Update batch status in database if completed
    const currentDbStatus = batch.status;
    if (pending === 0 && currentDbStatus !== status) {
      const completedAt = new Date().toISOString();
      await drizzle
        .update(rolloutBatches)
        .set({ status, completedAt })
        .where(eq(rolloutBatches.id, batchId));

      // Update the batch object for response
      batch.status = status;
      batch.completedAt = completedAt;
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
      results: results.map((r) => ({
        task_id: r.taskId,
        status: r.status,
        trace: r.trace || undefined,
        execution_time_ms: r.executionTimeMs || undefined,
        error: r.error || undefined,
      })),
      created_at: batch.createdAt,
      completed_at: pending === 0 ? (batch.completedAt || new Date().toISOString()) : undefined,
    };

    return createSuccessResponse(response);
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
