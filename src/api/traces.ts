/**
 * Trace Management API Endpoints
 *
 * Handles importing, listing, retrieving, and deleting traces from external platforms.
 */

/// <reference types="@cloudflare/workers-types" />

import {
  createErrorResponse,
  createSuccessResponse,
  parsePaginationParams,
  getWorkspaceId,
  validateWorkspaceAccess,
  parseJsonBody,
  buildPaginatedResponse,
  decodeCursor,
} from './utils';

export interface Env {
  DB: D1Database;
}

/**
 * POST /api/traces/import
 *
 * Start a background job to import traces from a connected integration.
 * Returns a job ID that can be monitored via SSE.
 *
 * @param request - HTTP request with integration_id and filters
 * @param env - Cloudflare environment with D1 database
 * @returns 202 Accepted with job details
 */
export async function importTraces(request: Request, env: Env): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const body = await parseJsonBody<{
      integration_id: string;
      filters?: {
        date_from?: string;
        date_to?: string;
        tags?: string[];
        user_ids?: string[];
        limit?: number;
      };
    }>(request);

    if (!body.integration_id) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'integration_id is required',
        400
      );
    }

    // Verify integration exists and belongs to workspace
    const integration = await env.DB.prepare(
      'SELECT id, platform, status FROM integrations WHERE id = ? AND workspace_id = ?'
    )
      .bind(body.integration_id, workspaceId)
      .first();

    if (!integration) {
      return createErrorResponse(
        'NOT_FOUND',
        'Integration not found',
        404
      );
    }

    // Validate filter parameters
    if (body.filters?.limit && (body.filters.limit < 1 || body.filters.limit > 1000)) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'limit must be between 1 and 1000',
        422
      );
    }

    // Create a job record
    const jobId = `job_${crypto.randomUUID()}`;
    await env.DB.prepare(
      `INSERT INTO jobs (id, workspace_id, type, status, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(
        jobId,
        workspaceId,
        'import',
        'queued',
        JSON.stringify({
          integration_id: body.integration_id,
          filters: body.filters || {},
        }),
        new Date().toISOString()
      )
      .run();

    // TODO: Trigger actual background import job via Queue
    // For now, return the job ID immediately

    return createSuccessResponse(
      {
        job_id: jobId,
        status: 'queued',
        estimated_count: body.filters?.limit || 100,
      },
      202
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
 * GET /api/traces
 *
 * List traces with optional filters and pagination.
 * Returns lightweight trace summaries for annotation UI.
 *
 * @param request - HTTP request with query parameters
 * @param env - Cloudflare environment with D1 database
 * @returns 200 OK with paginated trace list
 */
export async function listTraces(request: Request, env: Env): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const url = new URL(request.url);
    const { cursor, limit } = parsePaginationParams(url, 50, 200);

    // Parse filters
    const evalSetId = url.searchParams.get('eval_set_id');
    const source = url.searchParams.get('source');
    const ratingFilter = url.searchParams.get('rating');
    const hasFeedback = url.searchParams.get('has_feedback');
    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');

    // Build query
    let query = `
      SELECT
        t.id,
        t.external_id as trace_id,
        i.platform as source,
        t.imported_at as timestamp,
        t.trace_data,
        f.id as feedback_id,
        f.rating,
        f.rating_detail as notes,
        f.eval_set_id
      FROM traces t
      LEFT JOIN integrations i ON t.integration_id = i.id
      LEFT JOIN feedback f ON t.id = f.trace_id
      WHERE t.workspace_id = ?
    `;

    const params: any[] = [workspaceId];

    // Apply filters
    if (evalSetId) {
      query += ' AND f.eval_set_id = ?';
      params.push(evalSetId);
    }

    if (source) {
      query += ' AND i.platform = ?';
      params.push(source);
    }

    if (ratingFilter) {
      const ratings = ratingFilter.split(',');
      query += ` AND f.rating IN (${ratings.map(() => '?').join(',')})`;
      params.push(...ratings);
    }

    if (hasFeedback !== null) {
      if (hasFeedback === 'true') {
        query += ' AND f.id IS NOT NULL';
      } else if (hasFeedback === 'false') {
        query += ' AND f.id IS NULL';
      }
    }

    if (dateFrom) {
      query += ' AND t.imported_at >= ?';
      params.push(dateFrom);
    }

    if (dateTo) {
      query += ' AND t.imported_at <= ?';
      params.push(dateTo);
    }

    // Apply cursor pagination
    if (cursor) {
      try {
        const { timestamp, id } = decodeCursor(cursor);
        query += ' AND (t.imported_at < ? OR (t.imported_at = ? AND t.id < ?))';
        params.push(timestamp, timestamp, id);
      } catch (error) {
        return createErrorResponse('VALIDATION_ERROR', 'Invalid cursor', 400);
      }
    }

    // Order and limit
    query += ' ORDER BY t.imported_at DESC, t.id DESC LIMIT ?';
    params.push(limit + 1); // Fetch one extra to determine has_more

    const result = await env.DB.prepare(query).bind(...params).all();

    // Transform results
    const traces = result.results.map((row: any) => {
      const traceData = JSON.parse(row.trace_data);
      const steps = traceData.steps || traceData;

      // Extract summaries
      let inputPreview = 'No input';
      let outputPreview = 'No output';
      let hasErrors = false;

      if (Array.isArray(steps) && steps.length > 0) {
        const firstStep = steps[0];
        const lastStep = steps[steps.length - 1];

        // Input preview from first step
        if (firstStep.input) {
          const inputStr = JSON.stringify(firstStep.input);
          inputPreview = inputStr.substring(0, 200);
        } else if (firstStep.messages_added && firstStep.messages_added.length > 0) {
          const firstMsg = firstStep.messages_added[0];
          inputPreview = (firstMsg.content || '').substring(0, 200);
        }

        // Output preview from last step
        if (lastStep.output) {
          const outputStr = JSON.stringify(lastStep.output);
          outputPreview = outputStr.substring(0, 200);
        } else if (lastStep.messages_added && lastStep.messages_added.length > 0) {
          const lastMsg = lastStep.messages_added[lastStep.messages_added.length - 1];
          outputPreview = (lastMsg.content || '').substring(0, 200);
        }

        // Check for errors
        hasErrors = steps.some((step: any) => step.error);
      }

      const trace: any = {
        id: row.id,
        trace_id: row.trace_id,
        source: row.source,
        timestamp: row.timestamp,
        step_count: Array.isArray(steps) ? steps.length : 0,
        summary: {
          input_preview: inputPreview,
          output_preview: outputPreview,
          has_errors: hasErrors,
        },
      };

      // Add feedback if exists
      if (row.feedback_id) {
        trace.feedback = {
          rating: row.rating,
          notes: row.notes,
          eval_set_id: row.eval_set_id,
        };
      }

      return trace;
    });

    // Get total count (cached, expensive query)
    // TODO: Implement caching layer
    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM traces WHERE workspace_id = ?'
    )
      .bind(workspaceId)
      .first();

    const totalCount = (countResult?.count as number) || 0;

    return createSuccessResponse(
      buildPaginatedResponse(
        traces,
        limit,
        (t: any) => t.timestamp,
        (t: any) => t.id,
        'traces',
        totalCount
      )
    );
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * GET /api/traces/:id
 *
 * Get complete trace details with all steps, messages, and tool calls.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param traceId - Trace ID from URL
 * @returns 200 OK with full trace data
 */
export async function getTraceById(request: Request, env: Env, traceId: string): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const result = await env.DB.prepare(
      `SELECT
        t.id,
        t.external_id as trace_id,
        i.platform as source,
        t.imported_at as timestamp,
        t.trace_data,
        f.id as feedback_id,
        f.rating,
        f.rating_detail as notes,
        f.eval_set_id,
        f.created_at as feedback_created_at
      FROM traces t
      LEFT JOIN integrations i ON t.integration_id = i.id
      LEFT JOIN feedback f ON t.id = f.trace_id
      WHERE t.id = ? AND t.workspace_id = ?`
    )
      .bind(traceId, workspaceId)
      .first();

    if (!result) {
      return createErrorResponse('NOT_FOUND', 'Trace not found', 404);
    }

    const traceData = JSON.parse(result.trace_data as string);

    const response: any = {
      id: result.id,
      trace_id: result.trace_id,
      source: result.source,
      timestamp: result.timestamp,
      metadata: traceData.metadata || {},
      steps: traceData.steps || [],
    };

    // Add feedback if exists
    if (result.feedback_id) {
      response.feedback = {
        id: result.feedback_id,
        rating: result.rating,
        notes: result.notes,
        eval_set_id: result.eval_set_id,
        created_at: result.feedback_created_at,
      };
    }

    return createSuccessResponse(response);
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * DELETE /api/traces/:id
 *
 * Delete a trace from the database.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param traceId - Trace ID from URL
 * @returns 204 No Content
 */
export async function deleteTrace(request: Request, env: Env, traceId: string): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Verify trace exists and belongs to workspace
    const trace = await env.DB.prepare(
      'SELECT id FROM traces WHERE id = ? AND workspace_id = ?'
    )
      .bind(traceId, workspaceId)
      .first();

    if (!trace) {
      return createErrorResponse('NOT_FOUND', 'Trace not found', 404);
    }

    // Delete trace (cascading deletes will handle feedback and executions)
    await env.DB.prepare('DELETE FROM traces WHERE id = ?')
      .bind(traceId)
      .run();

    return new Response(null, { status: 204 });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
