/**
 * Eval-specific tools for the Deep Eval Agent
 *
 * Tools:
 * - fetch_traces: Get labeled trace summaries for an agent (TRAIN SET ONLY)
 * - get_trace_details: Get full trace data for deep analysis (TRAIN SET ONLY)
 * - test_eval_code: Test eval function against held-out test set
 * - write_traces_to_file: Dump traces to file (TRAIN SET ONLY)
 * - execute_python_analysis: Run Python with data science libs
 *
 * Train/Test Split:
 * - Uses deterministic hash of trace_id to split 70% train / 30% test
 * - Agent only sees train set during generation
 * - test_eval_code tests on held-out test set to measure generalization
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { EvalTester, type TestCase } from '../../eval-generator/tester';
import type { Trace } from '../../types/trace';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';
import { D1Backend } from '../../playground/backend/d1-backend';
import { PythonRunner, DATASCIENCE_ALLOWED_IMPORTS } from '../../sandbox/python-runner';

export interface ToolContext {
  db: D1Database;
  agentId: string;
  sandbox?: DurableObjectNamespace<Sandbox>;
  sessionId?: string;  // For filesystem operations
}

/**
 * Deterministic train/test split based on trace ID hash.
 * Returns true if trace should be in train set (70%), false for test set (30%).
 */
function isTrainSet(traceId: string): boolean {
  // Simple hash: sum of char codes modulo 100
  let hash = 0;
  for (let i = 0; i < traceId.length; i++) {
    hash = (hash + traceId.charCodeAt(i)) % 100;
  }
  return hash < 70; // 70% train, 30% test
}

/**
 * Filter rows to train or test set
 */
function filterBySet(rows: any[], trainSet: boolean): any[] {
  return rows.filter(row => {
    const id = row.trace_id || row.id;
    return isTrainSet(id) === trainSet;
  });
}

/**
 * Create fetch_traces tool
 * Returns trace summaries from TRAIN SET ONLY to avoid data leakage
 */
export function createFetchTracesTool(context: ToolContext) {
  return tool(
    async ({ rating, limit = 20, offset = 0 }): Promise<string> => {
      try {
        // Fetch more than needed to account for train/test filtering
        const fetchLimit = Math.ceil(limit * 2);

        // Build query with optional rating filter
        let query = `
          SELECT t.id, t.trace_id, t.steps, f.rating
          FROM traces t
          INNER JOIN feedback f ON f.trace_id = t.id
          WHERE f.agent_id = ?
        `;
        const params: (string | number)[] = [context.agentId];

        if (rating && rating !== 'all') {
          query += ` AND f.rating = ?`;
          params.push(rating);
        }

        query += ` ORDER BY t.imported_at DESC LIMIT ? OFFSET ?`;
        params.push(fetchLimit, offset);

        const result = await context.db.prepare(query).bind(...params).all();
        const allRows = result.results || [];

        // Filter to TRAIN SET ONLY (agent should never see test set)
        const trainRows = filterBySet(allRows, true).slice(0, limit);

        // Get total count (train set only)
        let countQuery = `
          SELECT t.id, t.trace_id
          FROM traces t
          INNER JOIN feedback f ON f.trace_id = t.id
          WHERE f.agent_id = ?
        `;
        const countParams: (string | number)[] = [context.agentId];
        if (rating && rating !== 'all') {
          countQuery += ` AND f.rating = ?`;
          countParams.push(rating);
        }
        const countResult = await context.db.prepare(countQuery).bind(...countParams).all();
        const trainTotal = filterBySet(countResult.results || [], true).length;

        // Transform to summaries
        const traces = trainRows.map((row: any) => {
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

        return JSON.stringify({ traces, total: trainTotal, split: 'train' }, null, 2);
      } catch (error: any) {
        return JSON.stringify({ error: error.message });
      }
    },
    {
      name: 'fetch_traces',
      description:
        'Fetch labeled traces from TRAIN SET (70% of data). Returns summaries (first 200 chars). ' +
        'Test set (30%) is held out for unbiased testing via test_eval_code.',
      schema: z.object({
        rating: z.enum(['positive', 'negative', 'all']).optional().describe('Filter by label: positive, negative, or all'),
        limit: z.number().optional().describe('Max traces to return (default 20)'),
        offset: z.number().optional().describe('Offset for pagination'),
      }),
    }
  );
}

/**
 * Truncate long strings in trace data to avoid context overflow
 */
function truncateTraceContent(obj: any, maxLen: number = 500): any {
  if (typeof obj === 'string') {
    return obj.length > maxLen ? obj.substring(0, maxLen) + '... [truncated]' : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => truncateTraceContent(item, maxLen));
  }
  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = truncateTraceContent(value, maxLen);
    }
    return result;
  }
  return obj;
}

/**
 * Create get_trace_details tool
 * Returns trace steps for analysis (TRAIN SET ONLY, truncated)
 */
export function createGetTraceDetailsTool(context: ToolContext) {
  return tool(
    async ({ trace_id }): Promise<string> => {
      try {
        // Note: Excludes raw_data and truncates content to avoid context overflow
        // Use write_traces_to_file for bulk analysis with full data
        const result = await context.db
          .prepare('SELECT id, trace_id, steps, spans FROM traces WHERE id = ? OR trace_id = ?')
          .bind(trace_id, trace_id)
          .first();

        if (!result) {
          return JSON.stringify({ error: `Trace not found: ${trace_id}` });
        }

        const row = result as any;
        const actualTraceId = row.trace_id || row.id;

        // Check if trace is in train set (prevent data leakage)
        if (!isTrainSet(actualTraceId)) {
          return JSON.stringify({
            error: `Trace ${trace_id} is in TEST SET and cannot be viewed during generation. ` +
                   `Use test_eval_code to evaluate on test set.`
          });
        }

        let steps = [];
        let spans = [];

        try {
          steps = typeof row.steps === 'string' ? JSON.parse(row.steps) : (row.steps || []);
        } catch {
          steps = [];
        }

        try {
          spans = typeof row.spans === 'string' ? JSON.parse(row.spans) : (row.spans || []);
        } catch {
          spans = [];
        }

        // Truncate long content to avoid context overflow
        const truncatedSteps = truncateTraceContent(steps, 500);
        const truncatedSpans = truncateTraceContent(spans, 500);

        return JSON.stringify({
          id: row.id,
          trace_id: row.trace_id,
          steps: truncatedSteps,
          spans: truncatedSpans,
          _note: 'Content truncated. Use write_traces_to_file for full data.',
        }, null, 2);
      } catch (error: any) {
        return JSON.stringify({ error: error.message });
      }
    },
    {
      name: 'get_trace_details',
      description:
        'Get trace steps/spans from TRAIN SET for quick inspection (content truncated to 500 chars). ' +
        'Test set traces are blocked to prevent data leakage. ' +
        'Use write_traces_to_file + read_file for full trace data analysis.',
      schema: z.object({
        trace_id: z.string().describe('Trace ID (internal id or external trace_id)'),
      }),
    }
  );
}

/**
 * Create test_eval_code tool
 * Tests eval function against held-out TEST SET (30%) to measure generalization
 */
export function createTestEvalCodeTool(context: ToolContext) {
  return tool(
    async ({ code }): Promise<string> => {
      try {
        // Fetch ALL labeled traces (we'll filter to test set)
        const query = `
          SELECT t.id, t.trace_id, t.steps, t.source, t.raw_data, f.rating
          FROM traces t
          INNER JOIN feedback f ON f.trace_id = t.id
          WHERE f.agent_id = ?
        `;
        const params: (string | number)[] = [context.agentId];

        const result = await context.db.prepare(query).bind(...params).all();
        const allRows = result.results || [];

        // Filter to TEST SET ONLY (held-out 30%)
        const testRows = filterBySet(allRows, false);
        const trainCount = filterBySet(allRows, true).length;

        if (testRows.length === 0) {
          return JSON.stringify({
            error: 'No test set traces available. Need labeled traces with diverse trace IDs.',
            total_traces: allRows.length,
            train_count: trainCount,
          });
        }

        // Build test cases from test set
        const testCases: TestCase[] = testRows.map((row: any) => {
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

        // Run tests on held-out test set
        const tester = new EvalTester({ sandboxBinding: context.sandbox });
        const testResult = await tester.test(code, testCases);

        // Build mismatch details (show what the eval got wrong)
        const mismatches = testResult.details
          .filter(d => !d.match || d.error)
          .slice(0, 5) // Limit to 5 mismatches to avoid context overflow
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
          split: 'test',
          train_count: trainCount,
          test_count: testRows.length,
          mismatches,
          _note: 'Testing on held-out test set (30%). Train set was used for pattern discovery.',
        }, null, 2);
      } catch (error: any) {
        return JSON.stringify({ error: error.message });
      }
    },
    {
      name: 'test_eval_code',
      description:
        'Test eval function on HELD-OUT TEST SET (30% of data you have NOT seen). ' +
        'This measures how well your eval generalizes beyond training examples. ' +
        'Accuracy >= 80% on test set = success. Lower accuracy means overfitting to train patterns.',
      schema: z.object({
        code: z.string().describe('Python eval function code to test'),
      }),
    }
  );
}

/**
 * Create write_traces_to_file tool
 * Writes TRAIN SET traces as JSON to virtual filesystem for agent to explore
 */
export function createWriteTracesToFileTool(context: ToolContext) {
  return tool(
    async ({ rating, limit = 50, filename }): Promise<string> => {
      try {
        if (!context.sessionId) {
          return JSON.stringify({ error: 'Session ID not configured for filesystem operations' });
        }

        const backend = new D1Backend(context.db, context.sessionId);

        // Fetch more than needed to account for train/test filtering
        const fetchLimit = Math.ceil(limit * 2);

        // Build query with optional rating filter
        let query = `
          SELECT t.id, t.trace_id, t.steps, t.spans, t.raw_data, f.rating, f.feedback_text
          FROM traces t
          INNER JOIN feedback f ON f.trace_id = t.id
          WHERE f.agent_id = ?
        `;
        const params: (string | number)[] = [context.agentId];

        if (rating && rating !== 'all') {
          query += ` AND f.rating = ?`;
          params.push(rating);
        }

        query += ` ORDER BY t.imported_at DESC LIMIT ?`;
        params.push(fetchLimit);

        const result = await context.db.prepare(query).bind(...params).all();
        const allRows = result.results || [];

        // Filter to TRAIN SET ONLY (agent should never see test set)
        const trainRows = filterBySet(allRows, true).slice(0, limit);

        // Transform to trace objects
        const traces = trainRows.map((row: any) => {
          let steps = [];
          let spans = [];
          let rawData = null;

          try {
            steps = typeof row.steps === 'string' ? JSON.parse(row.steps) : (row.steps || []);
          } catch { steps = []; }

          try {
            spans = typeof row.spans === 'string' ? JSON.parse(row.spans) : (row.spans || []);
          } catch { spans = []; }

          try {
            rawData = row.raw_data
              ? (typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : row.raw_data)
              : null;
          } catch { rawData = null; }

          return {
            id: row.id,
            trace_id: row.trace_id,
            rating: row.rating,
            feedback: row.feedback_text,
            steps,
            spans,
            raw_data: rawData,
          };
        });

        // Write to file
        const filePath = filename || `/traces/labeled_traces.json`;
        const content = JSON.stringify(traces, null, 2);
        await backend.write(filePath, content);

        return JSON.stringify({
          success: true,
          file_path: filePath,
          trace_count: traces.length,
          split: 'train',
          message: `Wrote ${traces.length} TRAIN SET traces to ${filePath}. Test set is held out for evaluation.`,
        });
      } catch (error: any) {
        return JSON.stringify({ error: error.message });
      }
    },
    {
      name: 'write_traces_to_file',
      description:
        'Write TRAIN SET traces to a JSON file for analysis. ' +
        'Test set (30%) is held out and never written to prevent data leakage. ' +
        'Use read_file, grep, or execute_python_analysis to explore the file. ' +
        'Each trace includes: id, trace_id, rating, feedback, steps, spans, and raw_data.',
      schema: z.object({
        rating: z.enum(['positive', 'negative', 'all']).optional().describe('Filter by label: positive, negative, or all'),
        limit: z.number().optional().describe('Max traces to write (default 50)'),
        filename: z.string().optional().describe('Output file path (default: /traces/labeled_traces.json)'),
      }),
    }
  );
}

/**
 * Create execute_python_analysis tool
 * Executes Python code with data science libraries for trace analysis
 */
export function createExecutePythonAnalysisTool(context: ToolContext) {
  return tool(
    async ({ code }): Promise<string> => {
      if (!code || typeof code !== 'string' || !code.trim()) {
        return 'Error: Empty code provided';
      }

      try {
        const runner = new PythonRunner({
          sandboxBinding: context.sandbox,
          timeout: 30000, // 30 seconds for analysis tasks
          sandboxId: `eval-analysis-${context.agentId}-${Date.now()}`,
          allowedImports: DATASCIENCE_ALLOWED_IMPORTS,
        });

        const result = await runner.execute(code);

        if (result.success) {
          return result.output || '(execution completed with no output)';
        } else {
          return `Error: ${result.error || 'Unknown execution error'}`;
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `Error: ${errorMessage}`;
      }
    },
    {
      name: 'execute_python_analysis',
      description:
        'Execute Python code for trace analysis with data science libraries. ' +
        'Allowed imports: json, re, typing, math, datetime, difflib, collections, itertools, functools, ' +
        'numpy, pandas, scipy, sklearn (scikit-learn), statistics, string, textwrap. ' +
        'Use this to analyze traces loaded from files, compute statistics, cluster similar traces, etc. ' +
        '30-second timeout. No network or filesystem access beyond what you read/write via other tools.',
      schema: z.object({
        code: z.string().describe('Python code to execute. Can use numpy, pandas, sklearn for analysis.')
      })
    }
  );
}

/**
 * Create all eval tools
 */
export function createEvalTools(context: ToolContext) {
  // Use explicit any[] type to allow different tool schemas
  const tools: any[] = [
    createFetchTracesTool(context),
    createGetTraceDetailsTool(context),
    createTestEvalCodeTool(context),
  ];

  // Add file-based tools if sessionId is configured
  if (context.sessionId) {
    tools.push(createWriteTracesToFileTool(context));
    tools.push(createExecutePythonAnalysisTool(context));
  }

  return tools;
}
