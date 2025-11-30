/**
 * Feedback API Endpoints
 *
 * Handles submitting, updating, and deleting user feedback on traces.
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
 * POST /api/feedback
 *
 * Submit feedback (rating) for a trace. Optimistic UI pattern on frontend.
 *
 * @param request - HTTP request with trace_id, agent_id, rating, and optional notes
 * @param env - Cloudflare environment with D1 database
 * @returns 201 Created with feedback details
 */
export async function submitFeedback(request: Request, env: Env): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const body = await parseJsonBody<{
      trace_id: string;
      agent_id: string;
      rating: 'positive' | 'negative' | 'neutral';
      notes?: string;
    }>(request);

    // Validate required fields
    if (!body.trace_id || !body.agent_id || !body.rating) {
      return createErrorResponse(
        'MISSING_REQUIRED_FIELD',
        'trace_id, agent_id, and rating are required',
        400
      );
    }

    // Validate rating value
    if (!['positive', 'negative', 'neutral'].includes(body.rating)) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'rating must be positive, negative, or neutral',
        400
      );
    }

    // Verify trace exists and belongs to workspace
    const trace = await env.DB.prepare(
      'SELECT id FROM traces WHERE id = ? AND workspace_id = ?'
    )
      .bind(body.trace_id, workspaceId)
      .first();

    if (!trace) {
      return createErrorResponse('NOT_FOUND', 'Trace not found', 404);
    }

    // Verify agent exists and belongs to workspace
    const agent = await env.DB.prepare(
      'SELECT id FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(body.agent_id, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Check for existing feedback - use upsert pattern
    const existing = await env.DB.prepare(
      'SELECT id, created_at FROM feedback WHERE trace_id = ? AND agent_id = ?'
    )
      .bind(body.trace_id, body.agent_id)
      .first();

    const now = new Date().toISOString();

    if (existing) {
      // Update existing feedback (upsert)
      await env.DB.prepare(
        `UPDATE feedback SET rating = ?, rating_detail = ? WHERE id = ?`
      )
        .bind(body.rating, body.notes || null, existing.id)
        .run();

      return createSuccessResponse(
        {
          id: existing.id,
          trace_id: body.trace_id,
          agent_id: body.agent_id,
          rating: body.rating,
          notes: body.notes || null,
          created_at: existing.created_at,
          updated: true,
        },
        200
      );
    }

    // Create new feedback
    const feedbackId = `fb_${crypto.randomUUID()}`;

    await env.DB.prepare(
      `INSERT INTO feedback (id, agent_id, trace_id, rating, rating_detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(
        feedbackId,
        body.agent_id,
        body.trace_id,
        body.rating,
        body.notes || null,
        now
      )
      .run();

    return createSuccessResponse(
      {
        id: feedbackId,
        trace_id: body.trace_id,
        agent_id: body.agent_id,
        rating: body.rating,
        notes: body.notes || null,
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
 * PATCH /api/feedback/:id
 *
 * Update existing feedback rating or notes.
 *
 * @param request - HTTP request with fields to update
 * @param env - Cloudflare environment
 * @param feedbackId - Feedback ID from URL
 * @returns 200 OK with updated feedback
 */
export async function updateFeedback(request: Request, env: Env, feedbackId: string): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const body = await parseJsonBody<{
      rating?: 'positive' | 'negative' | 'neutral';
      notes?: string;
    }>(request);

    // Verify feedback exists and belongs to workspace
    const feedback = await env.DB.prepare(
      `SELECT f.id, f.trace_id, f.agent_id
       FROM feedback f
       JOIN agents a ON f.agent_id = a.id
       WHERE f.id = ? AND a.workspace_id = ?`
    )
      .bind(feedbackId, workspaceId)
      .first();

    if (!feedback) {
      return createErrorResponse('NOT_FOUND', 'Feedback not found', 404);
    }

    // Validate rating if provided
    if (body.rating && !['positive', 'negative', 'neutral'].includes(body.rating)) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'rating must be positive, negative, or neutral',
        400
      );
    }

    // Build update query
    const updates: string[] = [];
    const params: any[] = [];

    if (body.rating !== undefined) {
      updates.push('rating = ?');
      params.push(body.rating);
    }

    if (body.notes !== undefined) {
      updates.push('rating_detail = ?');
      params.push(body.notes || null);
    }

    if (updates.length === 0) {
      // No updates, return current state
      const current = await env.DB.prepare(
        'SELECT * FROM feedback WHERE id = ?'
      )
        .bind(feedbackId)
        .first();

      return createSuccessResponse({
        id: current!.id,
        trace_id: current!.trace_id,
        agent_id: current!.agent_id,
        rating: current!.rating,
        notes: current!.rating_detail,
        created_at: current!.created_at,
      });
    }

    // Execute update
    params.push(feedbackId);
    await env.DB.prepare(
      `UPDATE feedback SET ${updates.join(', ')} WHERE id = ?`
    )
      .bind(...params)
      .run();

    // Return updated feedback
    const updated = await env.DB.prepare(
      'SELECT * FROM feedback WHERE id = ?'
    )
      .bind(feedbackId)
      .first();

    return createSuccessResponse({
      id: updated!.id,
      trace_id: updated!.trace_id,
      agent_id: updated!.agent_id,
      rating: updated!.rating,
      notes: updated!.rating_detail,
      created_at: updated!.created_at,
    });
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
 * DELETE /api/feedback/:id
 *
 * Remove feedback annotation.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param feedbackId - Feedback ID from URL
 * @returns 204 No Content
 */
export async function deleteFeedback(request: Request, env: Env, feedbackId: string): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Verify feedback exists and belongs to workspace
    const feedback = await env.DB.prepare(
      `SELECT f.id
       FROM feedback f
       JOIN agents a ON f.agent_id = a.id
       WHERE f.id = ? AND a.workspace_id = ?`
    )
      .bind(feedbackId, workspaceId)
      .first();

    if (!feedback) {
      return createErrorResponse('NOT_FOUND', 'Feedback not found', 404);
    }

    // Delete feedback
    await env.DB.prepare('DELETE FROM feedback WHERE id = ?')
      .bind(feedbackId)
      .run();

    return new Response(null, { status: 204 });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
