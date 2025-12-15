/**
 * Eval-specific tools for the Deep Eval Agent
 *
 * Tools:
 * - fetch_traces: Get labeled trace summaries for an agent
 * - get_trace_details: Get full trace data for deep analysis
 * - test_eval_code: Test eval function against labeled traces
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { EvalTester, type TestCase } from '../../eval-generator/tester';
import type { Trace } from '../../types/trace';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';

export interface ToolContext {
  db: D1Database;
  agentId: string;
  sandbox?: DurableObjectNamespace<Sandbox>;
}

/**
 * Create fetch_traces tool
 * Returns trace summaries to avoid context overflow
 */
export function createFetchTracesTool(context: ToolContext) {
  return tool(
    async ({ rating, limit = 20, offset = 0 }): Promise<string> => {
      try {
        // Build query with optional rating filter
        let query = `
          SELECT t.id, t.trace_id, t.steps, f.rating
          FROM traces t
          INNER JOIN feedback f ON f.trace_id = t.id
          WHERE f.agent_id = ?
        `;
        const params: (string | number)[] = [context.agentId];

        if (rating && rating !== 'all') {
          query += ` AND f.rating = '${rating}'`;
        }

        query += ` ORDER BY t.imported_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const result = await context.db.prepare(query).bind(...params).all();
        const rows = result.results || [];

        // Get total count
        let countQuery = `
          SELECT COUNT(*) as total
          FROM traces t
          INNER JOIN feedback f ON f.trace_id = t.id
          WHERE f.agent_id = ?
        `;
        if (rating && rating !== 'all') {
          countQuery += ` AND f.rating = '${rating}'`;
        }
        const countResult = await context.db.prepare(countQuery).bind(context.agentId).first();
        const total = (countResult as any)?.total || 0;

        // Transform to summaries
        const traces = rows.map((row: any) => {
          let steps = [];
          try {
            steps = typeof row.steps === 'string' ? JSON.parse(row.steps) : (row.steps || []);
          } catch {
            steps = [];
          }

          // Extract summary from last step's output
          const lastStep = steps[steps.length - 1];
          const output = lastStep?.output || '';
          const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
          const summary = outputStr.substring(0, 200);

          // Check for tool calls
          const hasToolCalls = steps.some((s: any) => s.tool_calls && s.tool_calls.length > 0);

          return {
            id: row.id,
            trace_id: row.trace_id,
            rating: row.rating,
            summary,
            step_count: steps.length,
            has_tool_calls: hasToolCalls,
          };
        });

        return JSON.stringify({ traces, total }, null, 2);
      } catch (error: any) {
        return JSON.stringify({ error: error.message });
      }
    },
    {
      name: 'fetch_traces',
      description:
        'Fetch labeled traces for the agent. Returns summaries (first 200 chars of output) to avoid context overflow. ' +
        'Use get_trace_details to see full trace data for specific traces.',
      schema: z.object({
        rating: z.enum(['positive', 'negative', 'all']).optional().describe('Filter by label: positive, negative, or all'),
        limit: z.number().optional().describe('Max traces to return (default 20)'),
        offset: z.number().optional().describe('Offset for pagination'),
      }),
    }
  );
}

/**
 * Create get_trace_details tool
 * Returns full trace data for deep analysis
 */
export function createGetTraceDetailsTool(context: ToolContext) {
  return tool(
    async ({ trace_id }): Promise<string> => {
      try {
        const result = await context.db
          .prepare('SELECT id, trace_id, steps, raw_data FROM traces WHERE id = ? OR trace_id = ?')
          .bind(trace_id, trace_id)
          .first();

        if (!result) {
          return JSON.stringify({ error: `Trace not found: ${trace_id}` });
        }

        const row = result as any;
        let steps = [];
        let rawData = null;

        try {
          steps = typeof row.steps === 'string' ? JSON.parse(row.steps) : (row.steps || []);
        } catch {
          steps = [];
        }

        try {
          rawData = row.raw_data
            ? (typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : row.raw_data)
            : null;
        } catch {
          rawData = null;
        }

        return JSON.stringify({
          id: row.id,
          trace_id: row.trace_id,
          steps,
          raw_data: rawData,
        }, null, 2);
      } catch (error: any) {
        return JSON.stringify({ error: error.message });
      }
    },
    {
      name: 'get_trace_details',
      description:
        'Get full details of a specific trace for deep analysis. ' +
        'Use this to inspect traces that look interesting from fetch_traces summaries.',
      schema: z.object({
        trace_id: z.string().describe('Trace ID (internal id or external trace_id)'),
      }),
    }
  );
}

/**
 * Create test_eval_code tool
 * Tests eval function against labeled traces
 */
export function createTestEvalCodeTool(context: ToolContext) {
  return tool(
    async ({ code, trace_ids }): Promise<string> => {
      try {
        // Fetch traces to test against
        let query = `
          SELECT t.id, t.trace_id, t.steps, t.source, t.raw_data, f.rating
          FROM traces t
          INNER JOIN feedback f ON f.trace_id = t.id
          WHERE f.agent_id = ?
        `;
        const params: (string | number)[] = [context.agentId];

        if (trace_ids && trace_ids.length > 0) {
          const placeholders = trace_ids.map(() => '?').join(',');
          query += ` AND (t.id IN (${placeholders}) OR t.trace_id IN (${placeholders}))`;
          params.push(...trace_ids, ...trace_ids);
        }

        const result = await context.db.prepare(query).bind(...params).all();
        const rows = result.results || [];

        if (rows.length === 0) {
          return JSON.stringify({ error: 'No traces found to test against' });
        }

        // Build test cases
        const testCases: TestCase[] = rows.map((row: any) => {
          let steps = [];
          let rawData = null;

          try {
            steps = typeof row.steps === 'string' ? JSON.parse(row.steps) : (row.steps || []);
          } catch {
            steps = [];
          }

          try {
            rawData = row.raw_data
              ? (typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : row.raw_data)
              : null;
          } catch {
            rawData = null;
          }

          const trace: Trace = {
            id: row.id,
            trace_id: row.trace_id,
            steps,
            source: row.source || 'langfuse',
            raw_data: rawData,
          };

          // Convert rating to expected score
          const expectedScore = row.rating === 'positive' ? 1.0 : 0.0;

          return { trace, expectedScore };
        });

        // Run tests
        const tester = new EvalTester({ sandboxBinding: context.sandbox });
        const testResult = await tester.test(code, testCases);

        // Build mismatch details
        const mismatches = testResult.details
          .filter(d => !d.match || d.error)
          .map(d => ({
            trace_id: d.traceId,
            expected: d.expectedScore >= 0.5 ? 'positive' : 'negative',
            predicted: d.predictedScore >= 0.5 ? 'positive' : 'negative',
            score: d.predictedScore,
            feedback: d.feedback,
            error: d.error,
          }));

        return JSON.stringify({
          accuracy: testResult.accuracy,
          total: testResult.total,
          correct: testResult.correct,
          incorrect: testResult.incorrect,
          errors: testResult.errors,
          mismatches,
        }, null, 2);
      } catch (error: any) {
        return JSON.stringify({ error: error.message });
      }
    },
    {
      name: 'test_eval_code',
      description:
        'Test an eval function against labeled traces. Returns accuracy and details of mismatches. ' +
        'If accuracy >= 80%, you have succeeded. Otherwise, analyze mismatches and refine.',
      schema: z.object({
        code: z.string().describe('Python eval function code to test'),
        trace_ids: z.array(z.string()).optional().describe('Specific trace IDs to test (if omitted, tests all labeled traces)'),
      }),
    }
  );
}

/**
 * Create all eval tools
 */
export function createEvalTools(context: ToolContext) {
  return [
    createFetchTracesTool(context),
    createGetTraceDetailsTool(context),
    createTestEvalCodeTool(context),
  ];
}
