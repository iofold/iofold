/**
 * Eval Sets API Endpoints
 *
 * Handles creating, listing, updating, and deleting eval sets (collections of traces for training).
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
 * POST /api/eval-sets
 *
 * Create a new eval set for organizing feedback.
 *
 * @param request - HTTP request with name, description, and minimum_examples
 * @param env - Cloudflare environment with D1 database
 * @returns 201 Created with eval set details
 */
export async function createEvalSet(request: Request, env: Env): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const body = await parseJsonBody<{
      name: string;
      description?: string;
      minimum_examples?: number;
    }>(request);

    if (!body.name || body.name.trim().length === 0) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'name is required',
        400
      );
    }

    const minimumExamples = body.minimum_examples || 5;

    // Check for duplicate name in workspace
    const existing = await env.DB.prepare(
      'SELECT id FROM eval_sets WHERE workspace_id = ? AND name = ?'
    )
      .bind(workspaceId, body.name.trim())
      .first();

    if (existing) {
      return createErrorResponse(
        'ALREADY_EXISTS',
        'Eval set with same name already exists',
        409
      );
    }

    // Create eval set
    const evalSetId = `set_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO eval_sets (id, workspace_id, name, description, target_count, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        evalSetId,
        workspaceId,
        body.name.trim(),
        body.description || null,
        minimumExamples,
        'collecting',
        now,
        now
      )
      .run();

    return createSuccessResponse(
      {
        id: evalSetId,
        name: body.name.trim(),
        description: body.description || null,
        minimum_examples: minimumExamples,
        stats: {
          positive_count: 0,
          negative_count: 0,
          neutral_count: 0,
          total_count: 0,
        },
        created_at: now,
      },
      201
    );
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
 * GET /api/eval-sets
 *
 * List all eval sets for the workspace.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment with D1 database
 * @returns 200 OK with list of eval sets
 */
export async function listEvalSets(request: Request, env: Env): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Get eval sets with aggregated stats
    const result = await env.DB.prepare(
      `SELECT
        es.id,
        es.name,
        es.description,
        es.target_count,
        es.created_at,
        COALESCE(es.updated_at, es.created_at) as last_updated,
        COALESCE(SUM(CASE WHEN f.rating = 'positive' THEN 1 ELSE 0 END), 0) as positive_count,
        COALESCE(SUM(CASE WHEN f.rating = 'negative' THEN 1 ELSE 0 END), 0) as negative_count,
        COALESCE(SUM(CASE WHEN f.rating = 'neutral' THEN 1 ELSE 0 END), 0) as neutral_count,
        COALESCE(COUNT(f.id), 0) as total_count,
        COALESCE(COUNT(DISTINCT e.id), 0) as eval_count
      FROM eval_sets es
      LEFT JOIN feedback f ON es.id = f.eval_set_id
      LEFT JOIN evals e ON es.id = e.eval_set_id
      WHERE es.workspace_id = ?
      GROUP BY es.id
      ORDER BY es.created_at DESC`
    )
      .bind(workspaceId)
      .all();

    const evalSets = result.results.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      stats: {
        positive_count: row.positive_count,
        negative_count: row.negative_count,
        neutral_count: row.neutral_count,
        total_count: row.total_count,
      },
      eval_count: row.eval_count,
      last_updated: row.last_updated,
      created_at: row.created_at,
    }));

    return createSuccessResponse({ eval_sets: evalSets });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * GET /api/eval-sets/:id
 *
 * Get detailed information about an eval set including associated evals.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param evalSetId - Eval set ID from URL
 * @returns 200 OK with eval set details
 */
export async function getEvalSetById(request: Request, env: Env, evalSetId: string): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Get eval set
    const evalSet = await env.DB.prepare(
      'SELECT * FROM eval_sets WHERE id = ? AND workspace_id = ?'
    )
      .bind(evalSetId, workspaceId)
      .first();

    if (!evalSet) {
      return createErrorResponse('NOT_FOUND', 'Eval set not found', 404);
    }

    // Get stats
    const statsResult = await env.DB.prepare(
      `SELECT
        SUM(CASE WHEN rating = 'positive' THEN 1 ELSE 0 END) as positive_count,
        SUM(CASE WHEN rating = 'negative' THEN 1 ELSE 0 END) as negative_count,
        SUM(CASE WHEN rating = 'neutral' THEN 1 ELSE 0 END) as neutral_count,
        COUNT(*) as total_count
      FROM feedback
      WHERE eval_set_id = ?`
    )
      .bind(evalSetId)
      .first();

    // Get associated evals
    const evalsResult = await env.DB.prepare(
      `SELECT id, name, accuracy, created_at
       FROM evals
       WHERE eval_set_id = ?
       ORDER BY created_at DESC`
    )
      .bind(evalSetId)
      .all();

    const response = {
      id: evalSet.id,
      name: evalSet.name,
      description: evalSet.description,
      minimum_examples: evalSet.target_count,
      stats: {
        positive_count: statsResult?.positive_count || 0,
        negative_count: statsResult?.negative_count || 0,
        neutral_count: statsResult?.neutral_count || 0,
        total_count: statsResult?.total_count || 0,
      },
      evals: evalsResult.results.map((row: any) => ({
        id: row.id,
        name: row.name,
        accuracy: row.accuracy,
        created_at: row.created_at,
      })),
      created_at: evalSet.created_at,
      updated_at: evalSet.updated_at || evalSet.created_at,
    };

    return createSuccessResponse(response);
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * PATCH /api/eval-sets/:id
 *
 * Update eval set properties.
 *
 * @param request - HTTP request with fields to update
 * @param env - Cloudflare environment
 * @param evalSetId - Eval set ID from URL
 * @returns 200 OK with updated eval set
 */
export async function updateEvalSet(request: Request, env: Env, evalSetId: string): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const body = await parseJsonBody<{
      name?: string;
      description?: string;
      minimum_examples?: number;
    }>(request);

    // Verify eval set exists
    const evalSet = await env.DB.prepare(
      'SELECT id FROM eval_sets WHERE id = ? AND workspace_id = ?'
    )
      .bind(evalSetId, workspaceId)
      .first();

    if (!evalSet) {
      return createErrorResponse('NOT_FOUND', 'Eval set not found', 404);
    }

    // Build update query dynamically
    const updates: string[] = [];
    const params: any[] = [];

    if (body.name !== undefined) {
      if (body.name.trim().length === 0) {
        return createErrorResponse('VALIDATION_ERROR', 'name cannot be empty', 400);
      }

      // Check for duplicate name
      const duplicate = await env.DB.prepare(
        'SELECT id FROM eval_sets WHERE workspace_id = ? AND name = ? AND id != ?'
      )
        .bind(workspaceId, body.name.trim(), evalSetId)
        .first();

      if (duplicate) {
        return createErrorResponse('ALREADY_EXISTS', 'Eval set with same name already exists', 409);
      }

      updates.push('name = ?');
      params.push(body.name.trim());
    }

    if (body.description !== undefined) {
      updates.push('description = ?');
      params.push(body.description || null);
    }

    if (body.minimum_examples !== undefined) {
      updates.push('target_count = ?');
      params.push(body.minimum_examples);
    }

    if (updates.length === 0) {
      // No updates, just return current state
      return getEvalSetById(request, env, evalSetId);
    }

    // Add updated_at to all updates
    updates.push('updated_at = CURRENT_TIMESTAMP');

    // Execute update
    params.push(evalSetId);
    await env.DB.prepare(
      `UPDATE eval_sets SET ${updates.join(', ')} WHERE id = ?`
    )
      .bind(...params)
      .run();

    // Return updated eval set
    return getEvalSetById(request, env, evalSetId);
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
 * DELETE /api/eval-sets/:id
 *
 * Delete an eval set and associated feedback (evals are preserved).
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param evalSetId - Eval set ID from URL
 * @returns 204 No Content
 */
export async function deleteEvalSet(request: Request, env: Env, evalSetId: string): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Verify eval set exists
    const evalSet = await env.DB.prepare(
      'SELECT id FROM eval_sets WHERE id = ? AND workspace_id = ?'
    )
      .bind(evalSetId, workspaceId)
      .first();

    if (!evalSet) {
      return createErrorResponse('NOT_FOUND', 'Eval set not found', 404);
    }

    // Delete associated feedback first (due to foreign key constraint)
    await env.DB.prepare('DELETE FROM feedback WHERE eval_set_id = ?')
      .bind(evalSetId)
      .run();

    // Delete eval set
    await env.DB.prepare('DELETE FROM eval_sets WHERE id = ?')
      .bind(evalSetId)
      .run();

    return new Response(null, { status: 204 });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
