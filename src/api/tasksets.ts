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

export interface Env {
  DB: D1Database;
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
    const agent = await env.DB.prepare(
      'SELECT id FROM agents WHERE id = ? AND workspace_id = ?'
    ).bind(agentId, workspaceId).first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    const tasksetId = generateId('tsk');
    const now = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO tasksets (id, workspace_id, agent_id, name, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      tasksetId,
      workspaceId,
      agentId,
      body.name.trim(),
      body.description || null,
      now,
      now
    ).run();

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
    const agent = await env.DB.prepare(
      'SELECT id FROM agents WHERE id = ? AND workspace_id = ?'
    ).bind(agentId, workspaceId).first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Build query based on rating filter
    const ratingFilter = body.filter?.rating || 'any';
    const limit = Math.min(body.filter?.limit || 100, 500);

    let ratingCondition = '';
    if (ratingFilter === 'positive') {
      ratingCondition = "AND f.rating = 'positive'";
    } else if (ratingFilter === 'negative') {
      ratingCondition = "AND f.rating = 'negative'";
    }

    const tracesResult = await env.DB.prepare(`
      SELECT DISTINCT
        t.id as trace_id,
        t.steps,
        f.rating
      FROM traces t
      JOIN feedback f ON t.id = f.trace_id
      JOIN agent_versions av ON t.agent_version_id = av.id
      WHERE av.agent_id = ?
        AND f.rating IS NOT NULL
        ${ratingCondition}
      ORDER BY t.imported_at DESC
      LIMIT ?
    `).bind(agentId, limit).all();

    if (!tracesResult.results || tracesResult.results.length === 0) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'No labeled traces found for this agent',
        400
      );
    }

    // Create taskset
    const tasksetId = generateId('tsk');
    const now = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO tasksets (id, workspace_id, agent_id, name, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      tasksetId,
      workspaceId,
      agentId,
      body.name.trim(),
      body.description || null,
      now,
      now
    ).run();

    // Extract tasks from traces
    let insertedCount = 0;
    let skippedCount = 0;

    for (const row of tracesResult.results) {
      const steps = row.steps ? JSON.parse(row.steps as string) : [];

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
        await env.DB.prepare(
          `INSERT INTO taskset_tasks (id, taskset_id, user_message, source, source_trace_id, content_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          taskId,
          tasksetId,
          userMessage,
          'trace',
          row.trace_id as string,
          contentHash,
          now
        ).run();
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
    await env.DB.prepare(
      'UPDATE tasksets SET task_count = ? WHERE id = ?'
    ).bind(insertedCount, tasksetId).run();

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

    const url = new URL(request.url);
    const includeArchived = url.searchParams.get('include_archived') === 'true';

    let statusCondition = "AND status = 'active'";
    if (includeArchived) {
      statusCondition = '';
    }

    const result = await env.DB.prepare(`
      SELECT id, workspace_id, agent_id, name, description, task_count, status, created_at, updated_at
      FROM tasksets
      WHERE agent_id = ? AND workspace_id = ?
      ${statusCondition}
      ORDER BY created_at DESC
    `).bind(agentId, workspaceId).all();

    return createSuccessResponse({
      tasksets: result.results || [],
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

    // Get taskset
    const taskset = await env.DB.prepare(
      `SELECT id, workspace_id, agent_id, name, description, task_count, status, created_at, updated_at
       FROM tasksets
       WHERE id = ? AND agent_id = ? AND workspace_id = ?`
    ).bind(tasksetId, agentId, workspaceId).first();

    if (!taskset) {
      return createErrorResponse('NOT_FOUND', 'Taskset not found', 404);
    }

    // Get tasks
    const tasksResult = await env.DB.prepare(
      `SELECT id, user_message, expected_output, source, source_trace_id, created_at
       FROM taskset_tasks
       WHERE taskset_id = ?
       ORDER BY created_at ASC`
    ).bind(tasksetId).all();

    const response: TasksetWithTasks = {
      ...(taskset as unknown as TasksetResponse),
      tasks: (tasksResult.results || []).map((t: any) => ({
        id: t.id,
        user_message: t.user_message,
        expected_output: t.expected_output,
        source: t.source,
        source_trace_id: t.source_trace_id,
        created_at: t.created_at,
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

    // Validate taskset exists
    const taskset = await env.DB.prepare(
      `SELECT id, status FROM tasksets WHERE id = ? AND agent_id = ? AND workspace_id = ?`
    ).bind(tasksetId, agentId, workspaceId).first();

    if (!taskset) {
      return createErrorResponse('NOT_FOUND', 'Taskset not found', 404);
    }

    if (taskset.status === 'archived') {
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
        await env.DB.prepare(
          `INSERT INTO taskset_tasks (id, taskset_id, user_message, expected_output, source, content_hash, metadata, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          taskId,
          tasksetId,
          task.user_message.trim(),
          task.expected_output || null,
          source,
          contentHash,
          task.metadata ? JSON.stringify(task.metadata) : null,
          now
        ).run();
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
    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM taskset_tasks WHERE taskset_id = ?'
    ).bind(tasksetId).first();

    await env.DB.prepare(
      'UPDATE tasksets SET task_count = ?, updated_at = ? WHERE id = ?'
    ).bind(countResult?.count || 0, now, tasksetId).run();

    return createSuccessResponse({
      inserted: insertedCount,
      skipped_duplicates: skippedCount,
      total_tasks: countResult?.count || 0,
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

    const result = await env.DB.prepare(
      `UPDATE tasksets SET status = 'archived', updated_at = ?
       WHERE id = ? AND agent_id = ? AND workspace_id = ?`
    ).bind(new Date().toISOString(), tasksetId, agentId, workspaceId).run();

    if (result.meta.changes === 0) {
      return createErrorResponse('NOT_FOUND', 'Taskset not found', 404);
    }

    return createSuccessResponse({ message: 'Taskset archived' });
  } catch (error: any) {
    console.error('Error archiving taskset:', error);
    return createErrorResponse('INTERNAL_ERROR', error.message, 500);
  }
}
