/**
 * Tasksets API Endpoints
 *
 * Manages GEPA tasksets - collections of tasks for reproducible prompt optimization.
 */

/// <reference types="@cloudflare/workers-types" />

import {
  createErrorResponse,
  createSuccessResponse,
  getWorkspaceId,
  validateWorkspaceAccess,
  parseJsonBody,
} from './utils';

import { QueueProducer, type Queue } from '../queue/producer';
import { createDb } from '../db/client';
import { eq, and, desc, sql, count, inArray } from 'drizzle-orm';
import { tasksets, tasksetTasks, tasksetRuns, tasksetRunResults } from '../db/schema/tasksets';
import { agents } from '../db/schema/agents';
import { workspaces } from '../db/schema/users';
import { traces } from '../db/schema/traces';
import { feedback } from '../db/schema/feedback';
import { agentVersions } from '../db/schema/agents';

export interface Env {
  DB: D1Database;
  JOB_QUEUE?: Queue;
}

/**
 * Generate ID with prefix
 */
function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/**
 * Compute SHA256 hash for content deduplication
 */
async function computeContentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// Request/Response Types
// ============================================================================

interface CreateTasksetRequest {
  name: string;
  description?: string;
}

interface CreateTasksetFromTracesRequest {
  name: string;
  description?: string;
  filter?: {
    rating?: 'positive' | 'negative' | 'any';
    limit?: number;
  };
}

interface AddTasksRequest {
  tasks: Array<{
    user_message: string;
    expected_output?: string;
    source?: 'manual' | 'imported';
    metadata?: Record<string, unknown>;
  }>;
}

interface TasksetResponse {
  id: string;
  workspace_id: string;
  agent_id: string;
  name: string;
  description: string | null;
  task_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface TasksetWithTasks extends TasksetResponse {
  tasks: Array<{
    id: string;
    user_message: string;
    expected_output: string | null;
    source: string;
    source_trace_id: string | null;
    created_at: string;
  }>;
}

// ============================================================================
// POST /api/agents/:agentId/tasksets
// ============================================================================

/**
 * Create a new empty taskset for an agent.
 */
export async function createTaskset(
  request: Request,
  env: Env,
  agentId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'X-Workspace-Id header is required', 400);
    }
    validateWorkspaceAccess(workspaceId);

    const body = await parseJsonBody<CreateTasksetRequest>(request);

    if (!body.name || body.name.trim().length === 0) {
      return createErrorResponse('VALIDATION_ERROR', 'Name is required', 400);
    }

    // Validate agent exists
    const db = createDb(env.DB);
    const agent = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
      .limit(1);

    if (!agent[0]) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    const tasksetId = generateId('tsk');
    const now = new Date().toISOString();

    await db.insert(tasksets).values({
      id: tasksetId,
      workspaceId,
      agentId,
      name: body.name.trim(),
      description: body.description || null,
      createdAt: now,
      updatedAt: now,
    });

    const taskset: TasksetResponse = {
      id: tasksetId,
      workspace_id: workspaceId,
      agent_id: agentId,
      name: body.name.trim(),
      description: body.description || null,
      task_count: 0,
      status: 'active',
      created_at: now,
      updated_at: now,
    };

    return createSuccessResponse(taskset, 201);
  } catch (error: any) {
    console.error('Error creating taskset:', error);
    return createErrorResponse('INTERNAL_ERROR', error.message, 500);
  }
}

// ============================================================================
// POST /api/agents/:agentId/tasksets/from-traces
// ============================================================================

/**
 * Create a taskset by extracting tasks from labeled traces.
 */
export async function createTasksetFromTraces(
  request: Request,
  env: Env,
  agentId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'X-Workspace-Id header is required', 400);
    }
    validateWorkspaceAccess(workspaceId);

    const body = await parseJsonBody<CreateTasksetFromTracesRequest>(request);

    if (!body.name || body.name.trim().length === 0) {
      return createErrorResponse('VALIDATION_ERROR', 'Name is required', 400);
    }

    // Validate agent exists
    const db = createDb(env.DB);
    const agent = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
      .limit(1);

    if (!agent[0]) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Build query based on rating filter
    const ratingFilter = body.filter?.rating || 'any';
    const limit = Math.min(body.filter?.limit || 100, 500);

    // Build dynamic where conditions
    const conditions = [
      eq(agentVersions.agentId, agentId),
      sql`${feedback.rating} IS NOT NULL`
    ];

    if (ratingFilter === 'positive') {
      conditions.push(eq(feedback.rating, 'positive'));
    } else if (ratingFilter === 'negative') {
      conditions.push(eq(feedback.rating, 'negative'));
    }

    const tracesResult = await db
      .selectDistinct({
        traceId: traces.id,
        steps: traces.steps,
        rating: feedback.rating,
      })
      .from(traces)
      .innerJoin(feedback, eq(traces.id, feedback.traceId))
      .innerJoin(agentVersions, eq(traces.agentVersionId, agentVersions.id))
      .where(and(...conditions))
      .orderBy(desc(traces.importedAt))
      .limit(limit);

    if (!tracesResult || tracesResult.length === 0) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'No labeled traces found for this agent',
        400
      );
    }

    // Create taskset
    const tasksetId = generateId('tsk');
    const now = new Date().toISOString();

    await db.insert(tasksets).values({
      id: tasksetId,
      workspaceId,
      agentId,
      name: body.name.trim(),
      description: body.description || null,
      createdAt: now,
      updatedAt: now,
    });

    // Extract tasks from traces
    let insertedCount = 0;
    let skippedCount = 0;

    for (const row of tracesResult) {
      const steps = row.steps as any[] || [];

      // Find first user message
      let userMessage: string | null = null;
      for (const step of steps) {
        const messages = step.messages_added || [];
        for (const msg of messages) {
          if (msg.role === 'user' && msg.content) {
            userMessage = msg.content;
            break;
          }
        }
        if (userMessage) break;
      }

      if (!userMessage) continue;

      // Compute content hash for deduplication
      const contentHash = await computeContentHash(userMessage);
      const taskId = generateId('task');

      try {
        await db.insert(tasksetTasks).values({
          id: taskId,
          tasksetId,
          userMessage,
          source: 'trace',
          sourceTraceId: row.traceId,
          contentHash,
          createdAt: now,
        });
        insertedCount++;
      } catch (error: any) {
        // Skip duplicates (UNIQUE constraint violation)
        if (error.message?.includes('UNIQUE constraint failed')) {
          skippedCount++;
        } else {
          throw error;
        }
      }
    }

    // Update task count
    await db
      .update(tasksets)
      .set({ taskCount: insertedCount })
      .where(eq(tasksets.id, tasksetId));

    return createSuccessResponse({
      id: tasksetId,
      name: body.name.trim(),
      task_count: insertedCount,
      skipped_duplicates: skippedCount,
      message: `Created taskset with ${insertedCount} tasks (${skippedCount} duplicates skipped)`,
    }, 201);
  } catch (error: any) {
    console.error('Error creating taskset from traces:', error);
    return createErrorResponse('INTERNAL_ERROR', error.message, 500);
  }
}

// ============================================================================
// GET /api/agents/:agentId/tasksets
// ============================================================================

/**
 * List all tasksets for an agent.
 */
export async function listTasksets(
  request: Request,
  env: Env,
  agentId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'X-Workspace-Id header is required', 400);
    }
    validateWorkspaceAccess(workspaceId);

    const db = createDb(env.DB);
    const url = new URL(request.url);
    const includeArchived = url.searchParams.get('include_archived') === 'true';

    // Build dynamic where conditions
    const conditions = [
      eq(tasksets.agentId, agentId),
      eq(tasksets.workspaceId, workspaceId)
    ];

    if (!includeArchived) {
      conditions.push(eq(tasksets.status, 'active'));
    }

    const result = await db
      .select()
      .from(tasksets)
      .where(and(...conditions))
      .orderBy(desc(tasksets.createdAt));

    return createSuccessResponse({
      tasksets: result,
    });
  } catch (error: any) {
    console.error('Error listing tasksets:', error);
    return createErrorResponse('INTERNAL_ERROR', error.message, 500);
  }
}

// ============================================================================
// GET /api/agents/:agentId/tasksets/:tasksetId
// ============================================================================

/**
 * Get a taskset with all its tasks.
 */
export async function getTaskset(
  request: Request,
  env: Env,
  agentId: string,
  tasksetId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'X-Workspace-Id header is required', 400);
    }
    validateWorkspaceAccess(workspaceId);

    const db = createDb(env.DB);

    // Get taskset
    const taskset = await db
      .select()
      .from(tasksets)
      .where(
        and(
          eq(tasksets.id, tasksetId),
          eq(tasksets.agentId, agentId),
          eq(tasksets.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (!taskset[0]) {
      return createErrorResponse('NOT_FOUND', 'Taskset not found', 404);
    }

    // Get tasks
    const tasksResult = await db
      .select()
      .from(tasksetTasks)
      .where(eq(tasksetTasks.tasksetId, tasksetId))
      .orderBy(tasksetTasks.createdAt);

    const response: TasksetWithTasks = {
      id: taskset[0].id,
      workspace_id: taskset[0].workspaceId,
      agent_id: taskset[0].agentId,
      name: taskset[0].name,
      description: taskset[0].description,
      task_count: taskset[0].taskCount || 0,
      status: taskset[0].status,
      created_at: taskset[0].createdAt,
      updated_at: taskset[0].updatedAt,
      tasks: tasksResult.map((t) => ({
        id: t.id,
        user_message: t.userMessage,
        expected_output: t.expectedOutput,
        source: t.source,
        source_trace_id: t.sourceTraceId,
        metadata: t.metadata as Record<string, unknown> | null,
        created_at: t.createdAt,
      })),
    };

    return createSuccessResponse(response);
  } catch (error: any) {
    console.error('Error getting taskset:', error);
    return createErrorResponse('INTERNAL_ERROR', error.message, 500);
  }
}

// ============================================================================
// POST /api/agents/:agentId/tasksets/:tasksetId/tasks
// ============================================================================

/**
 * Add tasks to an existing taskset.
 */
export async function addTasksToTaskset(
  request: Request,
  env: Env,
  agentId: string,
  tasksetId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'X-Workspace-Id header is required', 400);
    }
    validateWorkspaceAccess(workspaceId);

    const body = await parseJsonBody<AddTasksRequest>(request);

    if (!body.tasks || body.tasks.length === 0) {
      return createErrorResponse('VALIDATION_ERROR', 'Tasks array is required', 400);
    }

    const db = createDb(env.DB);

    // Validate taskset exists
    const taskset = await db
      .select({ id: tasksets.id, status: tasksets.status })
      .from(tasksets)
      .where(
        and(
          eq(tasksets.id, tasksetId),
          eq(tasksets.agentId, agentId),
          eq(tasksets.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (!taskset[0]) {
      return createErrorResponse('NOT_FOUND', 'Taskset not found', 404);
    }

    if (taskset[0].status === 'archived') {
      return createErrorResponse('VALIDATION_ERROR', 'Cannot add tasks to archived taskset', 400);
    }

    const now = new Date().toISOString();
    let insertedCount = 0;
    let skippedCount = 0;

    for (const task of body.tasks) {
      if (!task.user_message || task.user_message.trim().length === 0) {
        continue;
      }

      const contentHash = await computeContentHash(task.user_message);
      const taskId = generateId('task');
      const source = task.source || 'manual';

      try {
        await db.insert(tasksetTasks).values({
          id: taskId,
          tasksetId,
          userMessage: task.user_message.trim(),
          expectedOutput: task.expected_output || null,
          source,
          contentHash,
          metadata: task.metadata || null,
          createdAt: now,
        });
        insertedCount++;
      } catch (error: any) {
        if (error.message?.includes('UNIQUE constraint failed')) {
          skippedCount++;
        } else {
          throw error;
        }
      }
    }

    // Update task count
    const countResult = await db
      .select({ count: count() })
      .from(tasksetTasks)
      .where(eq(tasksetTasks.tasksetId, tasksetId));

    const totalTasks = countResult[0]?.count || 0;

    await db
      .update(tasksets)
      .set({ taskCount: totalTasks, updatedAt: now })
      .where(eq(tasksets.id, tasksetId));

    return createSuccessResponse({
      inserted: insertedCount,
      skipped_duplicates: skippedCount,
      total_tasks: totalTasks,
    });
  } catch (error: any) {
    console.error('Error adding tasks to taskset:', error);
    return createErrorResponse('INTERNAL_ERROR', error.message, 500);
  }
}

// ============================================================================
// DELETE /api/agents/:agentId/tasksets/:tasksetId
// ============================================================================

/**
 * Archive a taskset (soft delete).
 */
export async function archiveTaskset(
  request: Request,
  env: Env,
  agentId: string,
  tasksetId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'X-Workspace-Id header is required', 400);
    }
    validateWorkspaceAccess(workspaceId);

    const db = createDb(env.DB);
    const result = await db
      .update(tasksets)
      .set({ status: 'archived', updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(tasksets.id, tasksetId),
          eq(tasksets.agentId, agentId),
          eq(tasksets.workspaceId, workspaceId)
        )
      );

    // Note: Drizzle doesn't return rowsAffected directly, so we need to check by querying
    const updated = await db
      .select({ id: tasksets.id })
      .from(tasksets)
      .where(
        and(
          eq(tasksets.id, tasksetId),
          eq(tasksets.status, 'archived')
        )
      )
      .limit(1);

    if (!updated[0]) {
      return createErrorResponse('NOT_FOUND', 'Taskset not found', 404);
    }

    return createSuccessResponse({ message: 'Taskset archived' });
  } catch (error: any) {
    console.error('Error archiving taskset:', error);
    return createErrorResponse('INTERNAL_ERROR', error.message, 500);
  }
}

// ============================================================================
// POST /api/agents/:agentId/tasksets/:tasksetId/run
// ============================================================================

interface RunTasksetRequest {
  model_provider?: string;
  model_id?: string;
  config?: {
    parallelism?: number;
    timeout_per_task_ms?: number;
  };
}

/**
 * Start a taskset run - executes all tasks in the taskset via background job.
 */
export async function runTaskset(
  request: Request,
  env: Env,
  agentId: string,
  tasksetId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'X-Workspace-Id header is required', 400);
    }
    validateWorkspaceAccess(workspaceId);

    // Parse optional request body
    let body: RunTasksetRequest = {};
    try {
      body = await parseJsonBody<RunTasksetRequest>(request);
    } catch {
      // Empty body is fine, use defaults
    }

    const db = createDb(env.DB);

    // Validate workspace exists
    const workspace = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace[0]) {
      return createErrorResponse('NOT_FOUND', 'Workspace not found', 404);
    }

    // Validate agent exists
    const agent = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
      .limit(1);

    if (!agent[0]) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Validate taskset exists and get task count
    const taskset = await db
      .select({
        id: tasksets.id,
        taskCount: tasksets.taskCount,
        status: tasksets.status,
      })
      .from(tasksets)
      .where(
        and(
          eq(tasksets.id, tasksetId),
          eq(tasksets.agentId, agentId),
          eq(tasksets.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (!taskset[0]) {
      return createErrorResponse('NOT_FOUND', 'Taskset not found', 404);
    }

    if (taskset[0].status === 'archived') {
      return createErrorResponse('VALIDATION_ERROR', 'Cannot run archived taskset', 400);
    }

    const taskCount = taskset[0].taskCount || 0;
    if (taskCount === 0) {
      return createErrorResponse('VALIDATION_ERROR', 'Taskset has no tasks', 400);
    }

    // Create taskset run record
    const runId = generateId('tsr');
    const now = new Date().toISOString();
    const modelProvider = body.model_provider || 'anthropic';
    const modelId = body.model_id || 'anthropic/claude-sonnet-4-5';

    await db.insert(tasksetRuns).values({
      id: runId,
      workspaceId,
      agentId,
      tasksetId,
      status: 'queued',
      taskCount,
      completedCount: 0,
      failedCount: 0,
      modelProvider,
      modelId,
      config: body.config || {},
      createdAt: now,
    });

    // Enqueue job
    if (!env.JOB_QUEUE) {
      return createErrorResponse('INTERNAL_ERROR', 'Job queue not configured', 500);
    }

    const producer = new QueueProducer({
      queue: env.JOB_QUEUE,
      db: env.DB
    });

    const result = await producer.enqueueTasksetRunJob(
      runId,
      workspaceId,
      agentId,
      tasksetId,
      {
        modelProvider,
        modelId,
        config: body.config
      }
    );

    if (!result.success) {
      // Update run status to failed
      await db
        .update(tasksetRuns)
        .set({
          status: 'failed',
          error: result.error || 'Failed to enqueue job',
        })
        .where(eq(tasksetRuns.id, runId));

      return createErrorResponse(
        'INTERNAL_ERROR',
        result.error || 'Failed to enqueue taskset run job',
        500
      );
    }

    return createSuccessResponse({
      run_id: runId,
      status: 'queued',
      task_count: taskCount,
      model_provider: modelProvider,
      model_id: modelId,
    }, 201);
  } catch (error: any) {
    console.error('Error starting taskset run:', error);
    return createErrorResponse('INTERNAL_ERROR', error.message, 500);
  }
}

// ============================================================================
// GET /api/agents/:agentId/tasksets/:tasksetId/runs
// ============================================================================

/**
 * List all runs for a taskset.
 */
export async function listTasksetRuns(
  request: Request,
  env: Env,
  agentId: string,
  tasksetId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'X-Workspace-Id header is required', 400);
    }
    validateWorkspaceAccess(workspaceId);

    const db = createDb(env.DB);

    // Validate taskset exists
    const taskset = await db
      .select({ id: tasksets.id })
      .from(tasksets)
      .where(
        and(
          eq(tasksets.id, tasksetId),
          eq(tasksets.agentId, agentId),
          eq(tasksets.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (!taskset[0]) {
      return createErrorResponse('NOT_FOUND', 'Taskset not found', 404);
    }

    // Get all runs for this taskset
    const result = await db
      .select()
      .from(tasksetRuns)
      .where(
        and(
          eq(tasksetRuns.tasksetId, tasksetId),
          eq(tasksetRuns.workspaceId, workspaceId)
        )
      )
      .orderBy(desc(tasksetRuns.createdAt));

    return createSuccessResponse({
      runs: result.map((row) => ({
        id: row.id,
        workspace_id: row.workspaceId,
        agent_id: row.agentId,
        taskset_id: row.tasksetId,
        status: row.status,
        task_count: row.taskCount,
        completed_count: row.completedCount,
        failed_count: row.failedCount,
        model_provider: row.modelProvider,
        model_id: row.modelId,
        config: row.config as Record<string, unknown>,
        created_at: row.createdAt,
        started_at: row.startedAt,
        completed_at: row.completedAt,
        error: row.error,
      })),
    });
  } catch (error: any) {
    console.error('Error listing taskset runs:', error);
    return createErrorResponse('INTERNAL_ERROR', error.message, 500);
  }
}

// ============================================================================
// GET /api/agents/:agentId/tasksets/:tasksetId/runs/:runId
// ============================================================================

/**
 * Get specific run status with results.
 */
export async function getTasksetRun(
  request: Request,
  env: Env,
  agentId: string,
  tasksetId: string,
  runId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'X-Workspace-Id header is required', 400);
    }
    validateWorkspaceAccess(workspaceId);

    const db = createDb(env.DB);

    // Get run
    const run = await db
      .select()
      .from(tasksetRuns)
      .where(
        and(
          eq(tasksetRuns.id, runId),
          eq(tasksetRuns.tasksetId, tasksetId),
          eq(tasksetRuns.agentId, agentId),
          eq(tasksetRuns.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (!run[0]) {
      return createErrorResponse('NOT_FOUND', 'Run not found', 404);
    }

    // Get results for this run
    const resultsData = await db
      .select()
      .from(tasksetRunResults)
      .where(eq(tasksetRunResults.runId, runId))
      .orderBy(tasksetRunResults.createdAt);

    const response = {
      id: run[0].id,
      workspace_id: run[0].workspaceId,
      agent_id: run[0].agentId,
      taskset_id: run[0].tasksetId,
      status: run[0].status,
      task_count: run[0].taskCount,
      completed_count: run[0].completedCount,
      failed_count: run[0].failedCount,
      model_provider: run[0].modelProvider,
      model_id: run[0].modelId,
      config: run[0].config as Record<string, unknown>,
      created_at: run[0].createdAt,
      started_at: run[0].startedAt,
      completed_at: run[0].completedAt,
      error: run[0].error,
      results: resultsData.map((r) => ({
        id: r.id,
        run_id: r.runId,
        task_id: r.taskId,
        status: r.status,
        response: r.response,
        expected_output: r.expectedOutput,
        score: r.score,
        score_reason: r.scoreReason,
        trace_id: r.traceId,
        execution_time_ms: r.executionTimeMs,
        error: r.error,
        created_at: r.createdAt,
      })),
    };

    return createSuccessResponse(response);
  } catch (error: any) {
    console.error('Error getting taskset run:', error);
    return createErrorResponse('INTERNAL_ERROR', error.message, 500);
  }
}
