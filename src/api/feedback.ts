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
import { createDb } from '../db/client';
import { eq, and, gt, SQL } from 'drizzle-orm';
import { feedback, traces, agents } from '../db/schema';

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

    // Ensure workspaceId is not null for TypeScript
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing X-Workspace-Id header', 400);
    }

    const body = await parseJsonBody<{
      trace_id: string;
      agent_id?: string;  // Now optional
      rating: 'positive' | 'negative' | 'neutral';
      notes?: string;
    }>(request);

    // Validate required fields (only trace_id and rating are required)
    if (!body.trace_id || !body.rating) {
      return createErrorResponse(
        'MISSING_REQUIRED_FIELD',
        'trace_id and rating are required',
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

    const db = createDb(env.DB);

    // Verify trace exists and belongs to workspace
    const traceResult = await db
      .select({ id: traces.id })
      .from(traces)
      .where(and(eq(traces.id, body.trace_id), eq(traces.workspaceId, workspaceId)))
      .limit(1);

    if (!traceResult[0]) {
      return createErrorResponse('NOT_FOUND', 'Trace not found', 404);
    }

    // Verify agent exists and belongs to workspace (only if agent_id provided)
    if (body.agent_id) {
      const agentResult = await db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.id, body.agent_id), eq(agents.workspaceId, workspaceId)))
        .limit(1);

      if (!agentResult[0]) {
        return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
      }
    }

    // Check for existing feedback - use upsert pattern (feedback is 1:1 with trace)
    const existingResult = await db
      .select({ id: feedback.id, createdAt: feedback.createdAt })
      .from(feedback)
      .where(eq(feedback.traceId, body.trace_id))
      .limit(1);

    const now = new Date().toISOString();

    if (existingResult[0]) {
      // Update existing feedback (upsert)
      await db
        .update(feedback)
        .set({
          rating: body.rating,
          ratingDetail: body.notes || null,
          agentId: body.agent_id || null,
        })
        .where(eq(feedback.id, existingResult[0].id));

      return createSuccessResponse(
        {
          id: existingResult[0].id,
          trace_id: body.trace_id,
          agent_id: body.agent_id || null,
          rating: body.rating,
          notes: body.notes || null,
          created_at: existingResult[0].createdAt,
          updated: true,
        },
        200
      );
    }

    // Create new feedback
    const feedbackId = `fb_${crypto.randomUUID()}`;

    await db.insert(feedback).values({
      id: feedbackId,
      traceId: body.trace_id,
      agentId: body.agent_id || null,
      rating: body.rating,
      ratingDetail: body.notes || null,
      createdAt: now,
    });

    return createSuccessResponse(
      {
        id: feedbackId,
        trace_id: body.trace_id,
        agent_id: body.agent_id || null,
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

    // Ensure workspaceId is not null for TypeScript
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing X-Workspace-Id header', 400);
    }

    const body = await parseJsonBody<{
      rating?: 'positive' | 'negative' | 'neutral';
      notes?: string;
    }>(request);

    const db = createDb(env.DB);

    // Verify feedback exists and belongs to workspace
    const feedbackResult = await db
      .select({
        id: feedback.id,
        traceId: feedback.traceId,
        agentId: feedback.agentId,
      })
      .from(feedback)
      .leftJoin(agents, eq(feedback.agentId, agents.id))
      .where(and(eq(feedback.id, feedbackId), eq(agents.workspaceId, workspaceId)))
      .limit(1);

    if (!feedbackResult[0]) {
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

    // Build update object
    const updateData: Partial<{
      rating: 'positive' | 'negative' | 'neutral';
      ratingDetail: string | null;
    }> = {};

    if (body.rating !== undefined) {
      updateData.rating = body.rating;
    }

    if (body.notes !== undefined) {
      updateData.ratingDetail = body.notes || null;
    }

    if (Object.keys(updateData).length === 0) {
      // No updates, return current state
      const currentResult = await db
        .select()
        .from(feedback)
        .where(eq(feedback.id, feedbackId))
        .limit(1);

      const current = currentResult[0];
      return createSuccessResponse({
        id: current.id,
        trace_id: current.traceId,
        agent_id: current.agentId,
        rating: current.rating,
        notes: current.ratingDetail,
        created_at: current.createdAt,
      });
    }

    // Execute update
    await db
      .update(feedback)
      .set(updateData)
      .where(eq(feedback.id, feedbackId));

    // Return updated feedback
    const updatedResult = await db
      .select()
      .from(feedback)
      .where(eq(feedback.id, feedbackId))
      .limit(1);

    const updated = updatedResult[0];
    return createSuccessResponse({
      id: updated.id,
      trace_id: updated.traceId,
      agent_id: updated.agentId,
      rating: updated.rating,
      notes: updated.ratingDetail,
      created_at: updated.createdAt,
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

    // Ensure workspaceId is not null for TypeScript
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing X-Workspace-Id header', 400);
    }

    const db = createDb(env.DB);

    // Verify feedback exists and belongs to workspace
    const feedbackResult = await db
      .select({ id: feedback.id })
      .from(feedback)
      .leftJoin(agents, eq(feedback.agentId, agents.id))
      .where(and(eq(feedback.id, feedbackId), eq(agents.workspaceId, workspaceId)))
      .limit(1);

    if (!feedbackResult[0]) {
      return createErrorResponse('NOT_FOUND', 'Feedback not found', 404);
    }

    // Delete feedback
    await db.delete(feedback).where(eq(feedback.id, feedbackId));

    return new Response(null, { status: 204 });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * GET /api/feedback
 *
 * List feedback with filtering and cursor-based pagination.
 *
 * @param request - HTTP request with optional query params: trace_id, agent_id, rating, cursor, limit
 * @param env - Cloudflare environment with D1 database
 * @returns 200 OK with paginated feedback list
 */
export async function listFeedback(request: Request, env: Env): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Ensure workspaceId is not null for TypeScript
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing X-Workspace-Id header', 400);
    }

    const url = new URL(request.url);
    const trace_id = url.searchParams.get('trace_id');
    const agent_id = url.searchParams.get('agent_id');
    const rating = url.searchParams.get('rating');
    const cursor = url.searchParams.get('cursor');
    const limitParam = url.searchParams.get('limit');

    // Parse and validate limit
    let limit = 50; // default
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return createErrorResponse('VALIDATION_ERROR', 'limit must be a positive integer', 400);
      }
      limit = Math.min(parsedLimit, 200); // max 200
    }

    // Validate rating if provided
    if (rating && !['positive', 'negative', 'neutral'].includes(rating)) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'rating must be positive, negative, or neutral',
        400
      );
    }

    const db = createDb(env.DB);

    // Build dynamic query conditions
    const conditions: SQL[] = [eq(agents.workspaceId, workspaceId)];

    if (trace_id) {
      conditions.push(eq(feedback.traceId, trace_id));
    }

    if (agent_id) {
      conditions.push(eq(feedback.agentId, agent_id));
    }

    if (rating) {
      conditions.push(eq(feedback.rating, rating as 'positive' | 'negative' | 'neutral'));
    }

    if (cursor) {
      conditions.push(gt(feedback.id, cursor));
    }

    // Fetch limit + 1 to determine has_more
    const results = await db
      .select({
        id: feedback.id,
        agentId: feedback.agentId,
        traceId: feedback.traceId,
        rating: feedback.rating,
        ratingDetail: feedback.ratingDetail,
        createdAt: feedback.createdAt,
      })
      .from(feedback)
      .leftJoin(agents, eq(feedback.agentId, agents.id))
      .where(and(...conditions))
      .orderBy(feedback.id)
      .limit(limit + 1);

    const has_more = results.length > limit;
    const feedbackList = results.slice(0, limit);

    // Format response
    const formattedFeedback = feedbackList.map((row) => ({
      id: row.id,
      trace_id: row.traceId,
      agent_id: row.agentId,
      rating: row.rating,
      notes: row.ratingDetail,
      created_at: row.createdAt,
    }));

    const next_cursor = has_more && feedbackList.length > 0
      ? feedbackList[feedbackList.length - 1].id
      : null;

    return createSuccessResponse({
      feedback: formattedFeedback,
      next_cursor,
      has_more,
    });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
