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
import { tasksets, tasksetTasks } from '../db/schema/tasksets';
import { jobs } from '../db/schema/jobs';
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

    const modelProvider = body.model_provider || 'anthropic';
    const modelId = body.model_id || 'anthropic/claude-sonnet-4-5';

    // Enqueue job - jobs table tracks all status/progress
    if (!env.JOB_QUEUE) {
      return createErrorResponse('INTERNAL_ERROR', 'Job queue not configured', 500);
    }

    const producer = new QueueProducer({
      queue: env.JOB_QUEUE,
      db: env.DB
    });

    const result = await producer.enqueueTasksetRunJob(
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
      return createErrorResponse(
        'INTERNAL_ERROR',
        result.error || 'Failed to enqueue taskset run job',
        500
      );
    }

    return createSuccessResponse({
      job_id: result.job_id,
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
 * List all runs for a taskset (from jobs table).
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

    // Get all taskset_run jobs for this taskset from jobs table
    const result = await db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.workspaceId, workspaceId),
          eq(jobs.type, 'taskset_run'),
          sql`json_extract(${jobs.metadata}, '$.taskset_id') = ${tasksetId}`
        )
      )
      .orderBy(desc(jobs.createdAt));

    return createSuccessResponse({
      runs: result.map((row) => {
        const metadata = (row.metadata || {}) as Record<string, unknown>;
        const jobResult = (row.result || {}) as Record<string, unknown>;
        return {
          id: row.id,
          workspace_id: row.workspaceId,
          agent_id: metadata.agent_id as string,
          taskset_id: metadata.taskset_id as string,
          status: row.status,
          progress: row.progress,
          // Include counts from job result for backwards compatibility
          task_count: jobResult.task_count as number ?? 0,
          completed_count: jobResult.completed_count as number ?? 0,
          failed_count: jobResult.failed_count as number ?? 0,
          model_provider: metadata.model_provider as string,
          model_id: metadata.model_id as string,
          config: metadata.config as Record<string, unknown>,
          created_at: row.createdAt,
          started_at: row.startedAt,
          completed_at: row.completedAt,
          error: row.error,
        };
      }),
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
 * Get specific run status with results (from jobs table).
 * Note: runId is now actually a jobId since we use the jobs table.
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

    // Get job (runId is actually the jobId now)
    const jobResult = await db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.id, runId),
          eq(jobs.workspaceId, workspaceId),
          eq(jobs.type, 'taskset_run')
        )
      )
      .limit(1);

    if (!jobResult[0]) {
      return createErrorResponse('NOT_FOUND', 'Run not found', 404);
    }

    const job = jobResult[0];
    const jobMetadata = (job.metadata || {}) as Record<string, unknown>;

    // Validate taskset matches
    if (jobMetadata.taskset_id !== tasksetId) {
      return createErrorResponse('NOT_FOUND', 'Run not found for this taskset', 404);
    }

    // Get results from traces with source='taskset' and matching jobId in metadata
    // Traces store taskset execution results with metadata containing score, task info, etc.
    const tracesData = await db
      .select()
      .from(traces)
      .where(
        and(
          eq(traces.source, 'taskset'),
          eq(traces.workspaceId, workspaceId),
          sql`json_extract(${traces.metadata}, '$.jobId') = ${runId}`
        )
      )
      .orderBy(traces.importedAt);

    // Extract results from trace metadata
    const results = tracesData.map((t) => {
      const meta = (t.metadata || {}) as Record<string, unknown>;
      const steps = (t.steps || []) as Array<{ type: string; content?: string; execution_time_ms?: number }>;

      // Extract response from agent_response step
      const agentStep = steps.find(s => s.type === 'agent_response');
      const response = agentStep?.content || '';
      const executionTimeMs = agentStep?.execution_time_ms || null;

      return {
        id: t.id,
        job_id: meta.jobId as string,
        task_id: meta.taskId as string,
        status: t.hasErrors ? 'failed' : 'completed',
        response,
        expected_output: meta.expectedOutput as string | null,
        score: meta.score as number,
        score_reason: meta.scoreReason as string,
        trace_id: t.id, // The trace IS the result now
        execution_time_ms: executionTimeMs,
        error: meta.error as string | undefined,
        created_at: t.importedAt,
      };
    });

    // Get task counts from job result if available
    const jobResultData = job.result as Record<string, unknown> | null;
    const completedCount = (jobResultData?.completed_count as number) ?? results.filter(r => r.status === 'completed').length;
    const failedCount = (jobResultData?.failed_count as number) ?? results.filter(r => r.status === 'failed').length;

    const response = {
      id: job.id,
      workspace_id: job.workspaceId,
      agent_id: jobMetadata.agent_id as string,
      taskset_id: jobMetadata.taskset_id as string,
      status: job.status,
      progress: job.progress,
      task_count: jobResultData?.task_count as number ?? results.length,
      completed_count: completedCount,
      failed_count: failedCount,
      model_provider: jobMetadata.model_provider as string,
      model_id: jobMetadata.model_id as string,
      config: jobMetadata.config as Record<string, unknown>,
      created_at: job.createdAt,
      started_at: job.startedAt,
      completed_at: job.completedAt,
      error: job.error,
      results,
    };

    return createSuccessResponse(response);
  } catch (error: any) {
    console.error('Error getting taskset run:', error);
    return createErrorResponse('INTERNAL_ERROR', error.message, 500);
  }
}
