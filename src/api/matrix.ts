/// <reference types="@cloudflare/workers-types" />

import { z } from 'zod';
import { eq, and, or, gte, lte, inArray, desc, asc, sql, SQL } from 'drizzle-orm';
import { createDb, type Database } from '../db/client';
import {
  feedback,
  traces,
  integrations,
  evalCandidateExecutions,
  evalCandidates
} from '../db/schema';

/**
 * API Response Types based on API specification
 */

interface TraceSummary {
  timestamp: string;
  input_preview: string;
  output_preview: string;
  source: string;
}

interface HumanFeedback {
  rating: 'positive' | 'negative' | 'neutral';
  notes: string | null;
}

interface PredictionResult {
  result: boolean;
  reason: string;
  execution_time_ms: number;
  error: string | null;
  is_contradiction: boolean;
}

interface MatrixRow {
  trace_id: string;
  trace_summary: TraceSummary;
  human_feedback: HumanFeedback | null;
  predictions: Record<string, PredictionResult | null>;
}

interface EvalStats {
  eval_name: string;
  accuracy: number | null;
  contradiction_count: number;
  error_count: number;
  avg_execution_time_ms: number | null;
}

interface MatrixStats {
  total_traces: number;
  traces_with_feedback: number;
  per_eval: Record<string, EvalStats>;
}

interface MatrixResponse {
  rows: MatrixRow[];
  stats: MatrixStats;
  next_cursor: string | null;
  has_more: boolean;
}

interface EvalExecutionDetail {
  trace_id: string;
  eval_id: string;
  result: boolean;
  reason: string;
  execution_time_ms: number;
  error: string | null;
  stdout: string;
  stderr: string;
  executed_at: string;
  human_feedback: HumanFeedback | null;
  is_contradiction: boolean;
}

interface TraceExecution {
  eval_id: string;
  eval_name: string;
  result: boolean;
  reason: string;
  execution_time_ms: number;
  error: string | null;
  executed_at: string;
}

interface EvalExecution {
  id: string;
  trace_id: string;
  result: boolean;
  reason: string;
  execution_time_ms: number;
  error: string | null;
  executed_at: string;
  trace_summary: TraceSummary;
}

/**
 * Request validation schemas
 */

const MatrixQuerySchema = z.object({
  eval_ids: z.string().min(1), // comma-separated
  filter: z.enum(['all', 'contradictions_only', 'errors_only']).optional().default('all'),
  rating: z.enum(['positive', 'negative', 'neutral']).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50)
});

const EvalExecutionsQuerySchema = z.object({
  result: z.enum(['true', 'false']).optional(),
  has_error: z.enum(['true', 'false']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50)
});

/**
 * Utility functions
 */

/**
 * Encodes pagination cursor from timestamp and id
 */
function encodeCursor(timestamp: string, id: string): string {
  return Buffer.from(`${timestamp}|${id}`).toString('base64');
}

/**
 * Decodes pagination cursor to timestamp and id
 */
function decodeCursor(cursor: string): { timestamp: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    const [timestamp, id] = decoded.split('|');
    return timestamp && id ? { timestamp, id } : null;
  } catch {
    return null;
  }
}

/**
 * Determines if a prediction contradicts human feedback
 * Contradiction = (human positive AND predicted false) OR (human negative AND predicted true)
 * Neutral ratings are NOT considered contradictions
 */
function isContradiction(humanRating: string | null, predicted: boolean): boolean {
  if (!humanRating || humanRating === 'neutral') {
    return false;
  }

  if (humanRating === 'positive' && !predicted) {
    return true;
  }

  if (humanRating === 'negative' && predicted) {
    return true;
  }

  return false;
}

/**
 * Extracts input/output previews from trace data
 */
function extractTraceSummary(traceData: string): { input_preview: string; output_preview: string } {
  try {
    const steps = JSON.parse(traceData);
    if (!Array.isArray(steps) || steps.length === 0) {
      return { input_preview: '', output_preview: '' };
    }

    const firstStep = steps[0];
    const lastStep = steps[steps.length - 1];

    // Extract input preview (first 200 chars)
    let inputPreview = '';
    if (firstStep.input) {
      inputPreview = JSON.stringify(firstStep.input).substring(0, 200);
    } else if (firstStep.messages_added && firstStep.messages_added.length > 0) {
      inputPreview = firstStep.messages_added[0].content?.substring(0, 200) || '';
    }

    // Extract output preview (first 200 chars)
    let outputPreview = '';
    if (lastStep.output) {
      outputPreview = JSON.stringify(lastStep.output).substring(0, 200);
    } else if (lastStep.messages_added && lastStep.messages_added.length > 0) {
      const lastMsg = lastStep.messages_added[lastStep.messages_added.length - 1];
      outputPreview = lastMsg.content?.substring(0, 200) || '';
    }

    return { input_preview: inputPreview, output_preview: outputPreview };
  } catch {
    return { input_preview: '', output_preview: '' };
  }
}

/**
 * GET /api/agents/:id/matrix
 *
 * Returns paginated comparison matrix showing eval predictions vs human feedback.
 *
 * Query params:
 * - eval_ids (required): Comma-separated eval IDs
 * - filter: 'all' | 'contradictions_only' | 'errors_only'
 * - rating: 'positive' | 'negative' | 'neutral'
 * - date_from, date_to: ISO 8601 timestamps
 * - cursor: Pagination cursor
 * - limit: Results per page (1-200, default 50)
 *
 * Performance optimizations:
 * - Single query with JOINs to minimize database round trips
 * - Cursor-based pagination for consistent performance
 * - Index usage on (agent_id, created_at, trace_id)
 * - Stats computed only for filtered subset
 */
export async function getComparisonMatrix(
  db: D1Database,
  agentId: string,
  queryParams: URLSearchParams
): Promise<Response> {
  try {
    // Validate query parameters
    const params = MatrixQuerySchema.parse(Object.fromEntries(queryParams));
    const evalIds = params.eval_ids.split(',').map(id => id.trim()).filter(Boolean);

    if (evalIds.length === 0) {
      return new Response(JSON.stringify({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'At least one eval_id is required'
        }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Build filter conditions
    const drizzle = createDb(db);
    const conditions: SQL[] = [eq(feedback.agentId, agentId)];

    if (params.rating) {
      conditions.push(eq(feedback.rating, params.rating));
    }

    if (params.date_from) {
      conditions.push(gte(traces.timestamp, params.date_from));
    }

    if (params.date_to) {
      conditions.push(lte(traces.timestamp, params.date_to));
    }

    // Add cursor condition if provided
    if (params.cursor) {
      const decoded = decodeCursor(params.cursor);
      if (decoded) {
        conditions.push(
          or(
            sql`${feedback.createdAt} > ${decoded.timestamp}`,
            and(
              eq(feedback.createdAt, decoded.timestamp),
              sql`${traces.id} > ${decoded.id}`
            )
          )!
        );
      }
    }

    // Main query: Fetch traces with feedback and all eval executions
    // Uses LEFT JOIN to include traces even if not all evals have run
    const result = await drizzle
      .select({
        traceId: traces.id,
        externalTraceId: traces.traceId,
        integrationId: traces.integrationId,
        timestamp: traces.timestamp,
        steps: traces.steps,
        humanRating: feedback.rating,
        humanNotes: feedback.ratingDetail,
        feedbackCreatedAt: feedback.createdAt,
        source: integrations.platform
      })
      .from(feedback)
      .innerJoin(traces, eq(feedback.traceId, traces.id))
      .leftJoin(integrations, eq(traces.integrationId, integrations.id))
      .where(and(...conditions))
      .orderBy(asc(feedback.createdAt), asc(traces.id))
      .limit(params.limit + 1) // Fetch one extra to determine has_more
      .all();

    const hasMore = result.length > params.limit;
    const traceResults = result.slice(0, params.limit);

    if (traceResults.length === 0) {
      return new Response(JSON.stringify({
        rows: [],
        stats: {
          total_traces: 0,
          traces_with_feedback: 0,
          per_eval: {}
        },
        next_cursor: null,
        has_more: false
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const traceIds = traceResults.map(t => t.traceId as string);

    // Fetch all eval executions for these traces
    // Optimized: Single query with IN clause
    const executions = await drizzle
      .select({
        traceId: evalCandidateExecutions.traceId,
        evalId: evalCandidateExecutions.evalCandidateId,
        result: evalCandidateExecutions.success,
        reason: evalCandidateExecutions.feedback,
        executionTimeMs: evalCandidateExecutions.durationMs,
        error: evalCandidateExecutions.error,
        executedAt: evalCandidateExecutions.createdAt,
        evalName: evalCandidates.code
      })
      .from(evalCandidateExecutions)
      .innerJoin(evalCandidates, eq(evalCandidateExecutions.evalCandidateId, evalCandidates.id))
      .where(
        and(
          inArray(evalCandidateExecutions.evalCandidateId, evalIds),
          inArray(evalCandidateExecutions.traceId, traceIds)
        )
      )
      .orderBy(desc(evalCandidateExecutions.createdAt))
      .all();

    // Build execution map: trace_id -> eval_id -> execution
    const executionMap: Record<string, Record<string, any>> = {};
    const evalNamesMap: Record<string, string> = {};

    for (const exec of executions) {
      const traceId = exec.traceId as string;
      const evalId = exec.evalId as string;

      if (!executionMap[traceId]) {
        executionMap[traceId] = {};
      }

      // Keep only the most recent execution per trace-eval pair (due to ORDER BY DESC)
      if (!executionMap[traceId][evalId]) {
        executionMap[traceId][evalId] = exec;
        evalNamesMap[evalId] = exec.evalName as string;
      }
    }

    // Build matrix rows
    const rows: MatrixRow[] = [];
    const statsMap: Record<string, {
      correct: number;
      total: number;
      contradictions: number;
      errors: number;
      execution_times: number[];
    }> = {};

    // Initialize stats for all requested evals
    for (const evalId of evalIds) {
      statsMap[evalId] = {
        correct: 0,
        total: 0,
        contradictions: 0,
        errors: 0,
        execution_times: []
      };
    }

    for (const trace of traceResults) {
      const traceId = trace.traceId as string;
      const humanRating = trace.humanRating as string | null;

      const { input_preview, output_preview } = extractTraceSummary(
        JSON.stringify(trace.steps)
      );

      const predictions: Record<string, PredictionResult | null> = {};

      // Build predictions for each eval
      for (const evalId of evalIds) {
        const execution = executionMap[traceId]?.[evalId];

        if (!execution) {
          predictions[evalId] = null;
          continue;
        }

        const predicted = Boolean(execution.result);
        const contradiction = isContradiction(humanRating, predicted);
        const hasError = Boolean(execution.error);

        predictions[evalId] = {
          result: predicted,
          reason: execution.reason as string || '',
          execution_time_ms: execution.executionTimeMs as number || 0,
          error: execution.error as string || null,
          is_contradiction: contradiction
        };

        // Update stats
        statsMap[evalId].total++;
        if (contradiction) {
          statsMap[evalId].contradictions++;
        }
        if (hasError) {
          statsMap[evalId].errors++;
        }
        if (execution.executionTimeMs) {
          statsMap[evalId].execution_times.push(execution.executionTimeMs as number);
        }

        // Calculate correctness for accuracy
        if (humanRating && humanRating !== 'neutral') {
          const expectedPass = humanRating === 'positive';
          if (predicted === expectedPass) {
            statsMap[evalId].correct++;
          }
        }
      }

      // Get source from integration (fetched via JOIN)
      const source = (trace.source as string) || 'unknown';

      const row: MatrixRow = {
        trace_id: traceId,
        trace_summary: {
          timestamp: trace.timestamp as string,
          input_preview,
          output_preview,
          source
        },
        human_feedback: humanRating ? {
          rating: humanRating as 'positive' | 'negative' | 'neutral',
          notes: trace.humanNotes as string || null
        } : null,
        predictions
      };

      // Apply filters
      if (params.filter === 'contradictions_only') {
        const hasContradiction = Object.values(predictions).some(
          p => p && p.is_contradiction
        );
        if (!hasContradiction) continue;
      }

      if (params.filter === 'errors_only') {
        const hasError = Object.values(predictions).some(
          p => p && p.error
        );
        if (!hasError) continue;
      }

      rows.push(row);
    }

    // Build stats response
    const perEvalStats: Record<string, EvalStats> = {};
    for (const evalId of evalIds) {
      const stats = statsMap[evalId];
      const totalWithFeedback = stats.correct + (stats.total - stats.correct);
      const accuracy = totalWithFeedback > 0
        ? stats.correct / totalWithFeedback
        : null;

      const avgTime = stats.execution_times.length > 0
        ? stats.execution_times.reduce((a, b) => a + b, 0) / stats.execution_times.length
        : null;

      perEvalStats[evalId] = {
        eval_name: evalNamesMap[evalId] || 'Unknown',
        accuracy,
        contradiction_count: stats.contradictions,
        error_count: stats.errors,
        avg_execution_time_ms: avgTime
      };
    }

    // Generate next cursor
    let nextCursor: string | null = null;
    if (hasMore && traceResults.length > 0) {
      const lastTrace = traceResults[traceResults.length - 1];
      nextCursor = encodeCursor(
        lastTrace.feedbackCreatedAt as string,
        lastTrace.traceId as string
      );
    }

    const response: MatrixResponse = {
      rows,
      stats: {
        total_traces: rows.length,
        traces_with_feedback: rows.filter(r => r.human_feedback !== null).length,
        per_eval: perEvalStats
      },
      next_cursor: nextCursor,
      has_more: hasMore
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    if (error.name === 'ZodError') {
      return new Response(JSON.stringify({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: error.errors
        }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Internal server error'
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * GET /api/eval-executions/:trace_id/:eval_id
 *
 * Returns detailed execution result for a specific eval on a specific trace.
 * Includes human feedback for comparison and contradiction flag.
 *
 * Performance: Single query with JOIN, indexed on (trace_id, eval_id)
 */
export async function getEvalExecutionDetail(
  db: D1Database,
  traceId: string,
  evalId: string
): Promise<Response> {
  try {
    // Query execution with human feedback
    const drizzle = createDb(db);
    const result = await drizzle
      .select({
        traceId: evalCandidateExecutions.traceId,
        evalId: evalCandidateExecutions.evalCandidateId,
        result: evalCandidateExecutions.success,
        reason: evalCandidateExecutions.feedback,
        executionTimeMs: evalCandidateExecutions.durationMs,
        error: evalCandidateExecutions.error,
        executedAt: evalCandidateExecutions.createdAt,
        humanRating: feedback.rating,
        humanNotes: feedback.ratingDetail
      })
      .from(evalCandidateExecutions)
      .leftJoin(feedback, eq(evalCandidateExecutions.traceId, feedback.traceId))
      .where(
        and(
          eq(evalCandidateExecutions.traceId, traceId),
          eq(evalCandidateExecutions.evalCandidateId, evalId)
        )
      )
      .orderBy(desc(evalCandidateExecutions.createdAt))
      .limit(1)
      .get();

    if (!result) {
      return new Response(JSON.stringify({
        error: {
          code: 'NOT_FOUND',
          message: 'Execution result not found'
        }
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const predicted = Boolean(result.result);
    const humanRating = result.humanRating as string | null;
    const contradiction = isContradiction(humanRating, predicted);

    const response: EvalExecutionDetail = {
      trace_id: traceId,
      eval_id: evalId,
      result: predicted,
      reason: result.reason as string || '',
      execution_time_ms: result.executionTimeMs as number || 0,
      error: result.error as string || null,
      stdout: '', // Not stored in current schema
      stderr: '', // Not stored in current schema
      executed_at: result.executedAt as string,
      human_feedback: humanRating ? {
        rating: humanRating as 'positive' | 'negative' | 'neutral',
        notes: result.humanNotes as string || null
      } : null,
      is_contradiction: contradiction
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Internal server error'
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * GET /api/traces/:trace_id/executions
 *
 * Returns all eval execution results for a specific trace.
 * Used in trace detail view to show all eval predictions.
 *
 * Performance: Single query with JOIN, indexed on trace_id
 */
export async function getTraceExecutions(
  db: D1Database,
  traceId: string
): Promise<Response> {
  try {
    const drizzle = createDb(db);
    const result = await drizzle
      .select({
        evalId: evalCandidateExecutions.evalCandidateId,
        evalName: evalCandidates.code,
        result: evalCandidateExecutions.success,
        reason: evalCandidateExecutions.feedback,
        executionTimeMs: evalCandidateExecutions.durationMs,
        error: evalCandidateExecutions.error,
        executedAt: evalCandidateExecutions.createdAt
      })
      .from(evalCandidateExecutions)
      .innerJoin(evalCandidates, eq(evalCandidateExecutions.evalCandidateId, evalCandidates.id))
      .where(eq(evalCandidateExecutions.traceId, traceId))
      .orderBy(desc(evalCandidateExecutions.createdAt))
      .all();

    const executions: TraceExecution[] = result.map(row => ({
      eval_id: row.evalId as string,
      eval_name: row.evalName as string,
      result: Boolean(row.result),
      reason: row.reason as string || '',
      execution_time_ms: row.executionTimeMs as number || 0,
      error: row.error as string || null,
      executed_at: row.executedAt as string
    }));

    return new Response(JSON.stringify({ executions }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Internal server error'
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * GET /api/evals/:eval_id/executions
 *
 * Returns all traces evaluated by a specific eval, with pagination.
 * Supports filtering by result (pass/fail) and errors.
 *
 * Performance:
 * - Cursor-based pagination
 * - Single query with JOIN to fetch trace summaries
 * - Indexed on (eval_id, created_at, trace_id)
 */
export async function getEvalExecutions(
  db: D1Database,
  evalId: string,
  queryParams: URLSearchParams
): Promise<Response> {
  try {
    // Validate query parameters
    const params = EvalExecutionsQuerySchema.parse(Object.fromEntries(queryParams));

    // Build filter conditions
    const drizzle = createDb(db);
    const conditions: SQL[] = [eq(evalCandidateExecutions.evalCandidateId, evalId)];

    if (params.result !== undefined) {
      const resultValue = params.result === 'true';
      conditions.push(eq(evalCandidateExecutions.success, resultValue));
    }

    if (params.has_error === 'true') {
      conditions.push(sql`${evalCandidateExecutions.error} IS NOT NULL`);
    }

    // Add cursor condition if provided
    if (params.cursor) {
      const decoded = decodeCursor(params.cursor);
      if (decoded) {
        conditions.push(
          or(
            sql`${evalCandidateExecutions.createdAt} > ${decoded.timestamp}`,
            and(
              eq(evalCandidateExecutions.createdAt, decoded.timestamp),
              sql`${evalCandidateExecutions.traceId} > ${decoded.id}`
            )
          )!
        );
      }
    }

    const result = await drizzle
      .select({
        id: evalCandidateExecutions.id,
        traceId: evalCandidateExecutions.traceId,
        result: evalCandidateExecutions.success,
        reason: evalCandidateExecutions.feedback,
        executionTimeMs: evalCandidateExecutions.durationMs,
        error: evalCandidateExecutions.error,
        executedAt: evalCandidateExecutions.createdAt,
        traceTimestamp: traces.importedAt,
        steps: traces.steps,
        source: integrations.platform
      })
      .from(evalCandidateExecutions)
      .innerJoin(traces, eq(evalCandidateExecutions.traceId, traces.id))
      .leftJoin(integrations, eq(traces.integrationId, integrations.id))
      .where(and(...conditions))
      .orderBy(asc(evalCandidateExecutions.createdAt), asc(evalCandidateExecutions.traceId))
      .limit(params.limit + 1)
      .all();

    const hasMore = result.length > params.limit;
    const executions = result.slice(0, params.limit);

    // Build response
    const executionsList: EvalExecution[] = executions.map(row => {
      const { input_preview, output_preview } = extractTraceSummary(
        JSON.stringify(row.steps)
      );

      return {
        id: row.id as string,
        trace_id: row.traceId as string,
        result: Boolean(row.result),
        reason: row.reason as string || '',
        execution_time_ms: row.executionTimeMs as number || 0,
        error: row.error as string || null,
        executed_at: row.executedAt as string,
        trace_summary: {
          timestamp: row.traceTimestamp as string,
          input_preview,
          output_preview,
          source: (row.source as string) || 'unknown'
        }
      };
    });

    // Generate next cursor
    let nextCursor: string | null = null;
    if (hasMore && executions.length > 0) {
      const lastExec = executions[executions.length - 1];
      nextCursor = encodeCursor(
        lastExec.executedAt as string,
        lastExec.traceId as string
      );
    }

    return new Response(JSON.stringify({
      executions: executionsList,
      next_cursor: nextCursor,
      has_more: hasMore
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    if (error.name === 'ZodError') {
      return new Response(JSON.stringify({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: error.errors
        }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Internal server error'
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
