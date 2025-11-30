/// <reference types="@cloudflare/workers-types" />

import { z } from 'zod';

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

    // Decode cursor if provided
    let cursorCondition = '';
    let cursorParams: any[] = [];
    if (params.cursor) {
      const decoded = decodeCursor(params.cursor);
      if (decoded) {
        cursorCondition = 'AND (f.created_at, t.id) > (?, ?)';
        cursorParams = [decoded.timestamp, decoded.id];
      }
    }

    // Build filter conditions
    const conditions: string[] = ['f.agent_id = ?'];
    const filterParams: any[] = [agentId];

    if (params.rating) {
      conditions.push('f.rating = ?');
      filterParams.push(params.rating);
    }

    if (params.date_from) {
      conditions.push('t.created_at >= ?');
      filterParams.push(params.date_from);
    }

    if (params.date_to) {
      conditions.push('t.created_at <= ?');
      filterParams.push(params.date_to);
    }

    // Main query: Fetch traces with feedback and all eval executions
    // Uses LEFT JOIN to include traces even if not all evals have run
    const query = `
      SELECT
        t.id as trace_id,
        t.trace_id as external_trace_id,
        t.integration_id,
        t.timestamp,
        t.steps,
        f.rating as human_rating,
        f.notes as human_notes,
        f.created_at as feedback_created_at
      FROM feedback f
      INNER JOIN traces t ON f.trace_id = t.id
      WHERE ${conditions.join(' AND ')}
      ${cursorCondition}
      ORDER BY f.created_at ASC, t.id ASC
      LIMIT ?
    `;

    const result = await db.prepare(query).bind(
      ...filterParams,
      ...cursorParams,
      params.limit + 1 // Fetch one extra to determine has_more
    ).all();

    const hasMore = result.results.length > params.limit;
    const traces = result.results.slice(0, params.limit);

    if (traces.length === 0) {
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

    const traceIds = traces.map(t => t.trace_id as string);

    // Fetch all eval executions for these traces
    // Optimized: Single query with IN clause
    const placeholders = evalIds.map(() => '?').join(',');
    const tracePlaceholders = traceIds.map(() => '?').join(',');

    const executionsQuery = `
      SELECT
        ee.trace_id,
        ee.eval_id,
        ee.predicted_result as result,
        ee.predicted_reason as reason,
        ee.execution_time_ms,
        ee.error,
        ee.executed_at,
        e.name as eval_name
      FROM eval_executions ee
      INNER JOIN evals e ON ee.eval_id = e.id
      WHERE ee.eval_id IN (${placeholders})
        AND ee.trace_id IN (${tracePlaceholders})
      ORDER BY ee.executed_at DESC
    `;

    const executions = await db.prepare(executionsQuery).bind(
      ...evalIds,
      ...traceIds
    ).all();

    // Build execution map: trace_id -> eval_id -> execution
    const executionMap: Record<string, Record<string, any>> = {};
    const evalNamesMap: Record<string, string> = {};

    for (const exec of executions.results) {
      const traceId = exec.trace_id as string;
      const evalId = exec.eval_id as string;

      if (!executionMap[traceId]) {
        executionMap[traceId] = {};
      }

      // Keep only the most recent execution per trace-eval pair (due to ORDER BY DESC)
      if (!executionMap[traceId][evalId]) {
        executionMap[traceId][evalId] = exec;
        evalNamesMap[evalId] = exec.eval_name as string;
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

    for (const trace of traces) {
      const traceId = trace.trace_id as string;
      const humanRating = trace.human_rating as string | null;

      const { input_preview, output_preview } = extractTraceSummary(
        trace.trace_data as string
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
          execution_time_ms: execution.execution_time_ms as number || 0,
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
        if (execution.execution_time_ms) {
          statsMap[evalId].execution_times.push(execution.execution_time_ms as number);
        }

        // Calculate correctness for accuracy
        if (humanRating && humanRating !== 'neutral') {
          const expectedPass = humanRating === 'positive';
          if (predicted === expectedPass) {
            statsMap[evalId].correct++;
          }
        }
      }

      // Get source from integration (simplified - would need JOIN in real implementation)
      const source = 'langfuse'; // TODO: Derive from integration_id

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
          notes: trace.human_notes as string || null
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
    if (hasMore && traces.length > 0) {
      const lastTrace = traces[traces.length - 1];
      nextCursor = encodeCursor(
        lastTrace.feedback_created_at as string,
        lastTrace.trace_id as string
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
    const query = `
      SELECT
        ee.trace_id,
        ee.eval_id,
        ee.predicted_result as result,
        ee.predicted_reason as reason,
        ee.execution_time_ms,
        ee.error,
        ee.executed_at,
        f.rating as human_rating,
        f.notes as human_notes
      FROM eval_executions ee
      LEFT JOIN feedback f ON ee.trace_id = f.trace_id
      WHERE ee.trace_id = ? AND ee.eval_id = ?
      ORDER BY ee.executed_at DESC
      LIMIT 1
    `;

    const result = await db.prepare(query).bind(traceId, evalId).first();

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
    const humanRating = result.human_rating as string | null;
    const contradiction = isContradiction(humanRating, predicted);

    const response: EvalExecutionDetail = {
      trace_id: traceId,
      eval_id: evalId,
      result: predicted,
      reason: result.reason as string || '',
      execution_time_ms: result.execution_time_ms as number || 0,
      error: result.error as string || null,
      stdout: '', // Not stored in current schema
      stderr: '', // Not stored in current schema
      executed_at: result.executed_at as string,
      human_feedback: humanRating ? {
        rating: humanRating as 'positive' | 'negative' | 'neutral',
        notes: result.human_notes as string || null
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
    const query = `
      SELECT
        ee.eval_id,
        e.name as eval_name,
        ee.predicted_result as result,
        ee.predicted_reason as reason,
        ee.execution_time_ms,
        ee.error,
        ee.executed_at
      FROM eval_executions ee
      INNER JOIN evals e ON ee.eval_id = e.id
      WHERE ee.trace_id = ?
      ORDER BY ee.executed_at DESC
    `;

    const result = await db.prepare(query).bind(traceId).all();

    const executions: TraceExecution[] = result.results.map(row => ({
      eval_id: row.eval_id as string,
      eval_name: row.eval_name as string,
      result: Boolean(row.result),
      reason: row.reason as string || '',
      execution_time_ms: row.execution_time_ms as number || 0,
      error: row.error as string || null,
      executed_at: row.executed_at as string
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

    // Decode cursor if provided
    let cursorCondition = '';
    let cursorParams: any[] = [];
    if (params.cursor) {
      const decoded = decodeCursor(params.cursor);
      if (decoded) {
        cursorCondition = 'AND (ee.created_at, ee.trace_id) > (?, ?)';
        cursorParams = [decoded.timestamp, decoded.id];
      }
    }

    // Build filter conditions
    const conditions: string[] = ['ee.eval_id = ?'];
    const filterParams: any[] = [evalId];

    if (params.result !== undefined) {
      const resultValue = params.result === 'true' ? 1 : 0;
      conditions.push('ee.predicted_result = ?');
      filterParams.push(resultValue);
    }

    if (params.has_error === 'true') {
      conditions.push('ee.error IS NOT NULL');
    }

    const query = `
      SELECT
        ee.id,
        ee.trace_id,
        ee.predicted_result as result,
        ee.predicted_reason as reason,
        ee.execution_time_ms,
        ee.error,
        ee.executed_at,
        t.imported_at as trace_timestamp,
        t.trace_data
      FROM eval_executions ee
      INNER JOIN traces t ON ee.trace_id = t.id
      WHERE ${conditions.join(' AND ')}
      ${cursorCondition}
      ORDER BY ee.executed_at ASC, ee.trace_id ASC
      LIMIT ?
    `;

    const result = await db.prepare(query).bind(
      ...filterParams,
      ...cursorParams,
      params.limit + 1
    ).all();

    const hasMore = result.results.length > params.limit;
    const executions = result.results.slice(0, params.limit);

    // Build response
    const executionsList: EvalExecution[] = executions.map(row => {
      const { input_preview, output_preview } = extractTraceSummary(
        row.trace_data as string
      );

      return {
        id: row.id as string,
        trace_id: row.trace_id as string,
        result: Boolean(row.result),
        reason: row.reason as string || '',
        execution_time_ms: row.execution_time_ms as number || 0,
        error: row.error as string || null,
        executed_at: row.executed_at as string,
        trace_summary: {
          timestamp: row.trace_timestamp as string,
          input_preview,
          output_preview,
          source: 'langfuse' // TODO: Derive from integration
        }
      };
    });

    // Generate next cursor
    let nextCursor: string | null = null;
    if (hasMore && executions.length > 0) {
      const lastExec = executions[executions.length - 1];
      nextCursor = encodeCursor(
        lastExec.executed_at as string,
        lastExec.trace_id as string
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
