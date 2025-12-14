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
import { createDb, type Database } from '../db/client';
import { eq, and, or, lt, gte, lte, desc, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  traces,
  integrations,
  agentVersions,
  feedback,
  jobs,
} from '../db/schema';

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

    const drizzle = createDb(env.DB);

    // Verify integration exists and belongs to workspace
    const integration = await drizzle
      .select({
        id: integrations.id,
        platform: integrations.platform,
        status: integrations.status,
      })
      .from(integrations)
      .where(
        and(
          eq(integrations.id, body.integration_id),
          eq(integrations.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (integration.length === 0) {
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
        queue: env.JOB_QUEUE!,
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
    const now = new Date().toISOString();

    await drizzle.insert(jobs).values({
      id: jobId,
      workspaceId: workspaceId,
      type: 'import',
      status: 'running', // Start as running since we'll execute immediately
      metadata: {
        integration_id: body.integration_id,
        filters: body.filters || {},
        workspaceId
      },
      createdAt: now,
    });

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
      await drizzle
        .update(jobs)
        .set({
          status: 'failed',
          error: execError.message || 'Unknown error',
          completedAt: new Date().toISOString(),
        })
        .where(eq(jobs.id, jobId));

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

    // Ensure workspaceId is not null after validation
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing X-Workspace-Id header', 400);
    }

    const url = new URL(request.url);
    const { cursor, limit } = parsePaginationParams(url, 50, 200);

    // Parse filters
    const agentId = url.searchParams.get('agent_id');
    const source = url.searchParams.get('source');
    const ratingFilter = url.searchParams.get('rating');
    const hasFeedback = url.searchParams.get('has_feedback');
    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');

    const drizzle = createDb(env.DB);

    // Build conditions array
    const conditions: any[] = [eq(traces.workspaceId, workspaceId)];

    // Apply filters - agent_id can match either trace's agent (via agent_version) or feedback's agent
    if (agentId) {
      conditions.push(
        or(
          eq(agentVersions.agentId, agentId),
          eq(feedback.agentId, agentId)
        )
      );
    }

    if (source) {
      conditions.push(eq(traces.source, source as any));  // Filter by traces.source, not integrations.platform
    }

    if (ratingFilter) {
      const ratings = ratingFilter.split(',');
      conditions.push(inArray(feedback.rating, ratings as any[]));
    }

    if (hasFeedback !== null) {
      if (hasFeedback === 'true') {
        conditions.push(isNotNull(feedback.id));
      } else if (hasFeedback === 'false') {
        conditions.push(isNull(feedback.id));
      }
    }

    if (dateFrom) {
      conditions.push(gte(traces.importedAt, dateFrom));
    }

    if (dateTo) {
      conditions.push(lte(traces.importedAt, dateTo));
    }

    // Apply cursor pagination
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (!decoded) {
        return createErrorResponse('VALIDATION_ERROR', 'Invalid cursor', 400);
      }
      conditions.push(
        or(
          lt(traces.importedAt, decoded.timestamp),
          and(
            eq(traces.importedAt, decoded.timestamp),
            lt(traces.id, decoded.id)
          )
        )
      );
    }

    const result = await drizzle
      .select({
        id: traces.id,
        traceId: traces.traceId,
        source: traces.source,  // Use traces.source directly (works for taskset/playground)
        timestamp: traces.timestamp,
        importedAt: traces.importedAt,
        inputPreview: traces.inputPreview,
        outputPreview: traces.outputPreview,
        stepCount: traces.stepCount,
        hasErrors: traces.hasErrors,
        agentVersionId: traces.agentVersionId,
        traceAgentId: agentVersions.agentId,
        feedbackId: feedback.id,
        rating: feedback.rating,
        notes: feedback.ratingDetail,
        feedbackAgentId: feedback.agentId,
      })
      .from(traces)
      .leftJoin(integrations, eq(traces.integrationId, integrations.id))
      .leftJoin(agentVersions, eq(traces.agentVersionId, agentVersions.id))
      .leftJoin(feedback, eq(traces.id, feedback.traceId))
      .where(and(...conditions))
      .orderBy(desc(traces.importedAt), desc(traces.id))
      .limit(limit + 1);

    // Transform results - use pre-computed columns from database
    const tracesList = result.map((row: any) => {
      const trace: any = {
        id: row.id,
        trace_id: row.traceId,
        source: row.source,
        timestamp: row.timestamp,
        imported_at: row.importedAt,
        step_count: row.stepCount,
        // Include agent_id from agent_version (trace's assigned agent)
        agent_id: row.traceAgentId || null,
        agent_version_id: row.agentVersionId || null,
        summary: {
          input_preview: row.inputPreview || 'No input',
          output_preview: row.outputPreview || 'No output',
          has_errors: Boolean(row.hasErrors),
        },
      };

      // Add feedback if exists
      if (row.feedbackId) {
        trace.feedback = {
          rating: row.rating,
          notes: row.notes,
          agent_id: row.feedbackAgentId,
        };
      }

      return trace;
    });

    // Get total count with same filters (cached, expensive query)
    // TODO: Implement caching layer
    // Build count conditions (same as main query but without cursor)
    // workspaceId is guaranteed to be non-null at this point
    const countConditions: any[] = [eq(traces.workspaceId, workspaceId!)];

    if (agentId) {
      countConditions.push(
        or(
          eq(agentVersions.agentId, agentId),
          eq(feedback.agentId, agentId)
        )
      );
    }
    if (source) {
      countConditions.push(eq(traces.source, source as any));  // Filter by traces.source
    }
    if (ratingFilter) {
      const ratings = ratingFilter.split(',');
      countConditions.push(inArray(feedback.rating, ratings as any[]));
    }
    if (hasFeedback !== null) {
      if (hasFeedback === 'true') {
        countConditions.push(isNotNull(feedback.id));
      } else if (hasFeedback === 'false') {
        countConditions.push(isNull(feedback.id));
      }
    }
    if (dateFrom) {
      countConditions.push(gte(traces.importedAt, dateFrom));
    }
    if (dateTo) {
      countConditions.push(lte(traces.importedAt, dateTo));
    }

    const countResult = await drizzle
      .select({ count: sql<number>`COUNT(*)` })
      .from(traces)
      .leftJoin(integrations, eq(traces.integrationId, integrations.id))
      .leftJoin(agentVersions, eq(traces.agentVersionId, agentVersions.id))
      .leftJoin(feedback, eq(traces.id, feedback.traceId))
      .where(and(...countConditions));

    const totalCount = countResult[0]?.count || 0;

    return createSuccessResponse(
      buildPaginatedResponse(
        tracesList,
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

    // Ensure workspaceId is not null after validation
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing X-Workspace-Id header', 400);
    }

    const drizzle = createDb(env.DB);

    const result = await drizzle
      .select({
        id: traces.id,
        traceId: traces.traceId,
        source: traces.source,  // Use traces.source directly (works for taskset/playground)
        timestamp: traces.timestamp,
        steps: traces.steps,
        rawData: traces.rawData,
        metadata: traces.metadata,  // Include metadata for taskset info
        feedbackId: feedback.id,
        rating: feedback.rating,
        notes: feedback.ratingDetail,
        agentId: feedback.agentId,
        feedbackCreatedAt: feedback.createdAt,
      })
      .from(traces)
      .leftJoin(integrations, eq(traces.integrationId, integrations.id))
      .leftJoin(feedback, eq(traces.id, feedback.traceId))
      .where(
        and(
          eq(traces.id, traceId),
          eq(traces.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (result.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Trace not found', 404);
    }

    const row = result[0];

    // Parse the steps JSON column
    const steps = row.steps || [];

    // Parse raw_data if it exists (typed as any to access its properties)
    const rawData = row.rawData as any || null;

    // Get observations from raw_data or convert steps to observations
    const observations = rawData?.observations || stepsToObservations(steps as any[]);

    const response: any = {
      id: row.id,
      trace_id: row.traceId,
      source: row.source,
      timestamp: row.timestamp,
      steps: steps,
      observations: observations,
      raw_data: rawData,
      metadata: row.metadata || {},  // Include metadata (taskset info, scores, etc.)
    };

    // Add feedback if exists
    if (row.feedbackId) {
      response.feedback = {
        id: row.feedbackId,
        rating: row.rating,
        notes: row.notes,
        agent_id: row.agentId,
        created_at: row.feedbackCreatedAt,
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

    const drizzle = createDb(env.DB);

    // Verify integration exists and belongs to workspace, get platform for source field
    const integration = await drizzle
      .select({
        id: integrations.id,
        platform: integrations.platform,
      })
      .from(integrations)
      .where(
        and(
          eq(integrations.id, body.integration_id),
          eq(integrations.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (integration.length === 0) {
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
    const source = integration[0].platform; // Use the integration's platform as the source

    await drizzle.insert(traces).values({
      id: traceId,
      workspaceId: workspaceId,
      integrationId: body.integration_id,
      traceId: externalTraceId,
      source: source as any,
      timestamp,
      steps: steps as any,
      inputPreview,
      outputPreview,
      stepCount: steps.length,
      hasErrors,
      importedAt: new Date().toISOString(),
    });

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

    // Ensure workspaceId is not null after validation
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing X-Workspace-Id header', 400);
    }

    const drizzle = createDb(env.DB);

    // Verify trace exists and belongs to workspace
    const trace = await drizzle
      .select({ id: traces.id })
      .from(traces)
      .where(
        and(
          eq(traces.id, traceId),
          eq(traces.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (trace.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Trace not found', 404);
    }

    // Delete trace (cascading deletes will handle feedback and executions)
    await drizzle
      .delete(traces)
      .where(eq(traces.id, traceId));

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

    // Ensure workspaceId is not null after validation
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing X-Workspace-Id header', 400);
    }

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

    const drizzle = createDb(env.DB);

    // First, count the traces that match before deleting
    const tracesToDelete = await drizzle
      .select({ id: traces.id })
      .from(traces)
      .where(
        and(
          inArray(traces.id, body.trace_ids),
          eq(traces.workspaceId, workspaceId)
        )
      );

    // Delete only traces belonging to this workspace
    await drizzle
      .delete(traces)
      .where(
        and(
          inArray(traces.id, body.trace_ids),
          eq(traces.workspaceId, workspaceId)
        )
      );

    return createSuccessResponse({
      deleted_count: tracesToDelete.length
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
