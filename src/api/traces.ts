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
import { QueueProducer, type Queue } from '../queue/producer';

export interface Env {
  DB: D1Database;
  /** Cloudflare Queue binding for job processing */
  JOB_QUEUE?: Queue;
  /** Environment name (development, staging, production) */
  ENVIRONMENT?: string;
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
    const workspaceId = getWorkspaceId(request) || 'workspace_default';
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

    // Use queue when available (works in local dev with Miniflare)
    const useQueue = !!env.JOB_QUEUE;

    if (useQueue) {
      // Create job via queue producer (handles both DB insert and queue message)
      const producer = new QueueProducer({
        queue: env.JOB_QUEUE,
        db: env.DB
      });

      const result = await producer.enqueueImportJob(
        workspaceId,
        body.integration_id,
        body.filters ? {
          limit: body.filters.limit,
          from_date: body.filters.date_from,
          to_date: body.filters.date_to
        } : undefined
      );

      if (!result.success) {
        return createErrorResponse(
          'INTERNAL_ERROR',
          result.error || 'Failed to enqueue import job',
          500
        );
      }

      return createSuccessResponse(
        {
          job_id: result.job_id,
          status: 'queued',
          estimated_count: body.filters?.limit || 100,
          queue_enabled: true
        },
        202
      );
    }

    // Fallback: Create job and execute synchronously (no queue in local dev)
    const jobId = `job_${crypto.randomUUID()}`;
    await env.DB.prepare(
      `INSERT INTO jobs (id, workspace_id, type, status, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(
        jobId,
        workspaceId,
        'import',
        'running', // Start as running since we'll execute immediately
        JSON.stringify({
          integration_id: body.integration_id,
          filters: body.filters || {},
          workspaceId
        }),
        new Date().toISOString()
      )
      .run();

    // Import TraceImportJob and execute synchronously
    const { TraceImportJob } = await import('../jobs/trace-import-job');

    try {
      const job = new TraceImportJob(
        {
          jobId,
          integrationId: body.integration_id,
          workspaceId,
          filters: body.filters ? {
            limit: body.filters.limit,
            date_from: body.filters.date_from,
            date_to: body.filters.date_to
          } : undefined
        },
        {
          db: env.DB,
          encryptionKey: 'default-dev-key' // Default for local dev
        }
      );

      // Execute synchronously
      await job.execute();

      return createSuccessResponse(
        {
          job_id: jobId,
          status: 'completed',
          estimated_count: body.filters?.limit || 100,
          queue_enabled: false
        },
        202
      );
    } catch (execError: any) {
      // Mark job as failed
      await env.DB.prepare(
        `UPDATE jobs SET status = ?, error = ?, completed_at = ? WHERE id = ?`
      )
        .bind(
          'failed',
          execError.message || 'Unknown error',
          new Date().toISOString(),
          jobId
        )
        .run();

      return createSuccessResponse(
        {
          job_id: jobId,
          status: 'failed',
          error: execError.message || 'Unknown error',
          queue_enabled: false
        },
        202
      );
    }
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
    const agentId = url.searchParams.get('agent_id');
    const source = url.searchParams.get('source');
    const ratingFilter = url.searchParams.get('rating');
    const hasFeedback = url.searchParams.get('has_feedback');
    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');

    // Build query - include agent_id from agent_versions
    let query = `
      SELECT
        t.id,
        t.trace_id,
        i.platform as source,
        t.timestamp,
        t.imported_at,
        t.input_preview,
        t.output_preview,
        t.step_count,
        t.has_errors,
        t.agent_version_id,
        av.agent_id as trace_agent_id,
        f.id as feedback_id,
        f.rating,
        f.rating_detail as notes,
        f.agent_id as feedback_agent_id
      FROM traces t
      LEFT JOIN integrations i ON t.integration_id = i.id
      LEFT JOIN agent_versions av ON t.agent_version_id = av.id
      LEFT JOIN feedback f ON t.id = f.trace_id
      WHERE t.workspace_id = ?
    `;

    const params: any[] = [workspaceId];

    // Apply filters - agent_id can match either trace's agent (via agent_version) or feedback's agent
    if (agentId) {
      query += ' AND (av.agent_id = ? OR f.agent_id = ?)';
      params.push(agentId, agentId);
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
      const decoded = decodeCursor(cursor);
      if (!decoded) {
        return createErrorResponse('VALIDATION_ERROR', 'Invalid cursor', 400);
      }
      query += ' AND (t.imported_at < ? OR (t.imported_at = ? AND t.id < ?))';
      params.push(decoded.timestamp, decoded.timestamp, decoded.id);
    }

    // Order and limit
    query += ' ORDER BY t.imported_at DESC, t.id DESC LIMIT ?';
    params.push(limit + 1); // Fetch one extra to determine has_more

    const result = await env.DB.prepare(query).bind(...params).all();

    // Transform results - use pre-computed columns from database
    const traces = result.results.map((row: any) => {
      const trace: any = {
        id: row.id,
        trace_id: row.trace_id,
        source: row.source,
        timestamp: row.timestamp,
        imported_at: row.imported_at,
        step_count: row.step_count,
        // Include agent_id from agent_version (trace's assigned agent)
        agent_id: row.trace_agent_id || null,
        agent_version_id: row.agent_version_id || null,
        summary: {
          input_preview: row.input_preview || 'No input',
          output_preview: row.output_preview || 'No output',
          has_errors: Boolean(row.has_errors),
        },
      };

      // Add feedback if exists
      if (row.feedback_id) {
        trace.feedback = {
          rating: row.rating,
          notes: row.notes,
          agent_id: row.feedback_agent_id,
        };
      }

      return trace;
    });

    // Get total count with same filters (cached, expensive query)
    // TODO: Implement caching layer
    let countQuery = `
      SELECT COUNT(*) as count
      FROM traces t
      LEFT JOIN integrations i ON t.integration_id = i.id
      LEFT JOIN agent_versions av ON t.agent_version_id = av.id
      LEFT JOIN feedback f ON t.id = f.trace_id
      WHERE t.workspace_id = ?
    `;
    const countParams: any[] = [workspaceId];

    if (agentId) {
      countQuery += ' AND (av.agent_id = ? OR f.agent_id = ?)';
      countParams.push(agentId, agentId);
    }
    if (source) {
      countQuery += ' AND i.platform = ?';
      countParams.push(source);
    }
    if (ratingFilter) {
      const ratings = ratingFilter.split(',');
      countQuery += ` AND f.rating IN (${ratings.map(() => '?').join(',')})`;
      countParams.push(...ratings);
    }
    if (hasFeedback !== null) {
      if (hasFeedback === 'true') {
        countQuery += ' AND f.id IS NOT NULL';
      } else if (hasFeedback === 'false') {
        countQuery += ' AND f.id IS NULL';
      }
    }
    if (dateFrom) {
      countQuery += ' AND t.imported_at >= ?';
      countParams.push(dateFrom);
    }
    if (dateTo) {
      countQuery += ' AND t.imported_at <= ?';
      countParams.push(dateTo);
    }

    const countResult = await env.DB.prepare(countQuery).bind(...countParams).first();
    const totalCount = (countResult?.count as number) || 0;

    return createSuccessResponse(
      buildPaginatedResponse(
        traces,
        limit,
        (t: any) => t.imported_at,
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
 * Convert steps to observations format for traces without raw_data
 */
function stepsToObservations(steps: any[]): any[] {
  return steps.map((step, index) => ({
    id: step.step_id || `obs_${index}`,
    type: step.tool_calls?.length > 0 ? 'SPAN' : 'GENERATION',
    name: step.tool_calls?.[0]?.tool_name || 'LLM Call',
    parentObservationId: null, // Flat structure for now
    startTime: step.timestamp,
    endTime: step.timestamp, // We don't have end time
    input: step.input,
    output: step.output,
    metadata: step.metadata,
    model: step.metadata?.model,
    usage: step.metadata?.usage ? {
      promptTokens: step.metadata.tokens_input,
      completionTokens: step.metadata.tokens_output,
      totalTokens: (step.metadata.tokens_input || 0) + (step.metadata.tokens_output || 0)
    } : undefined,
    level: step.error ? 'ERROR' : 'DEFAULT',
    statusMessage: step.error,
  }));
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
        t.trace_id,
        i.platform as source,
        t.timestamp,
        t.steps,
        t.raw_data,
        f.id as feedback_id,
        f.rating,
        f.rating_detail as notes,
        f.agent_id,
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

    // Parse the steps JSON column
    const steps = result.steps ? JSON.parse(result.steps as string) : [];

    // Parse raw_data if it exists
    const rawData = result.raw_data ? JSON.parse(result.raw_data as string) : null;

    // Get observations from raw_data or convert steps to observations
    const observations = rawData?.observations || stepsToObservations(steps);

    const response: any = {
      id: result.id,
      trace_id: result.trace_id,
      source: result.source,
      timestamp: result.timestamp,
      steps: steps,
      observations: observations,
      raw_data: rawData,
    };

    // Add feedback if exists
    if (result.feedback_id) {
      response.feedback = {
        id: result.feedback_id,
        rating: result.rating,
        notes: result.notes,
        agent_id: result.agent_id,
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
 * POST /api/traces
 *
 * Create a trace directly (primarily for testing purposes).
 * This allows tests to create traces without needing external API credentials.
 *
 * @param request - HTTP request with trace data
 * @param env - Cloudflare environment with D1 database
 * @returns 201 Created with trace details
 */
export async function createTrace(request: Request, env: Env): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request) || 'workspace_default';
    validateWorkspaceAccess(workspaceId);

    const body = await parseJsonBody<{
      trace_id?: string;
      integration_id: string;
      timestamp?: string;
      steps?: any[];
      input_preview?: string;
      output_preview?: string;
      has_errors?: boolean;
    }>(request);

    if (!body.integration_id) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'integration_id is required',
        400
      );
    }

    // Verify integration exists and belongs to workspace, get platform for source field
    const integration = await env.DB.prepare(
      'SELECT id, platform FROM integrations WHERE id = ? AND workspace_id = ?'
    )
      .bind(body.integration_id, workspaceId)
      .first<{ id: string; platform: string }>();

    if (!integration) {
      return createErrorResponse(
        'NOT_FOUND',
        'Integration not found',
        404
      );
    }

    const traceId = `trace_${crypto.randomUUID()}`;
    const externalTraceId = body.trace_id || `ext_${crypto.randomUUID()}`;
    const timestamp = body.timestamp || new Date().toISOString();
    const steps = body.steps || [];
    const inputPreview = body.input_preview || 'Test input';
    const outputPreview = body.output_preview || 'Test output';
    const hasErrors = body.has_errors || false;
    const source = integration.platform; // Use the integration's platform as the source

    await env.DB.prepare(
      `INSERT INTO traces (
        id, workspace_id, integration_id, trace_id, source, timestamp,
        steps, input_preview, output_preview, step_count, has_errors, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        traceId,
        workspaceId,
        body.integration_id,
        externalTraceId,
        source,
        timestamp,
        JSON.stringify(steps),
        inputPreview,
        outputPreview,
        steps.length,
        hasErrors ? 1 : 0,
        new Date().toISOString()
      )
      .run();

    return createSuccessResponse(
      {
        id: traceId,
        trace_id: externalTraceId,
        integration_id: body.integration_id,
        timestamp,
        steps,
        step_count: steps.length,
        input_preview: inputPreview,
        output_preview: outputPreview,
        has_errors: hasErrors,
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

/**
 * DELETE /api/traces
 *
 * Bulk delete multiple traces by IDs.
 *
 * @param request - HTTP request with trace_ids array
 * @param env - Cloudflare environment
 * @returns 200 OK with deleted count
 */
export async function deleteTraces(request: Request, env: Env): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const body = await parseJsonBody<{ trace_ids: string[] }>(request);

    if (!body.trace_ids || !Array.isArray(body.trace_ids) || body.trace_ids.length === 0) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'trace_ids array is required and must not be empty',
        400
      );
    }

    // Limit bulk operations to prevent abuse
    if (body.trace_ids.length > 100) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Cannot delete more than 100 traces at once',
        400
      );
    }

    // Build placeholders for IN clause
    const placeholders = body.trace_ids.map(() => '?').join(',');

    // Delete only traces belonging to this workspace
    const result = await env.DB.prepare(
      `DELETE FROM traces WHERE id IN (${placeholders}) AND workspace_id = ?`
    )
      .bind(...body.trace_ids, workspaceId)
      .run();

    return createSuccessResponse({
      deleted_count: result.meta.changes || 0
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
