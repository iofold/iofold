/// <reference types="@cloudflare/workers-types" />

import { z } from 'zod';
import { LangfuseAdapter } from './adapters/langfuse';
import { EvalGenerator } from './eval-generator/generator';
import { EvalTester } from './eval-generator/tester';
import { PythonRunner } from './sandbox/python-runner';
import { EvalsAPI } from './api/evals';
import { JobsAPI } from './api/jobs';
import { handleError } from './utils/errors';
import { handleApiRequest } from './api';
import { QueueConsumer, type MessageBatch } from './queue/consumer';
import { QueueProducer, type Queue } from './queue/producer';
import type { QueueMessage } from './types/queue';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';

// Re-export Sandbox Durable Object class for wrangler
// This is required for the SANDBOX binding to work
// Export as PythonSandbox (new SQLite-backed DO for Containers)
import type { Sandbox as SandboxType } from '@cloudflare/sandbox';
export { Sandbox } from '@cloudflare/sandbox';
export { Sandbox as PythonSandbox } from '@cloudflare/sandbox';

export interface Env {
  DB: D1Database;
  LANGFUSE_PUBLIC_KEY: string;
  LANGFUSE_SECRET_KEY: string;
  LANGFUSE_BASE_URL?: string;
  SANDBOX?: DurableObjectNamespace<SandboxType>;
  /** Cloudflare Queue binding for job processing */
  JOB_QUEUE?: Queue;
  /** Dead letter queue for failed jobs */
  DEAD_LETTER_QUEUE?: Queue;
  /** Encryption key for sensitive data */
  ENCRYPTION_KEY?: string;
  /** Cloudflare Account ID for AI Gateway (required for LLM calls) */
  CF_ACCOUNT_ID: string;
  /** Cloudflare AI Gateway ID (required for LLM calls) */
  CF_AI_GATEWAY_ID: string;
  /** Optional AI Gateway authentication token */
  CF_AI_GATEWAY_TOKEN?: string;
}

const FetchTracesRequestSchema = z.object({
  limit: z.number().int().positive().min(1).max(100).optional().default(10)
});

const GenerateEvalRequestSchema = z.object({
  name: z.string().min(1),
  positiveTraceIds: z.array(z.string()).min(1),
  negativeTraceIds: z.array(z.string()).min(1)
});

const TestEvalRequestSchema = z.object({
  traceIds: z.array(z.object({
    traceId: z.string(),
    expectedScore: z.number().min(0).max(1) // 0.0 = low quality, 1.0 = high quality
  })).min(1)
});

// CORS headers
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Workspace-Id',
    'Access-Control-Max-Age': '86400',
  };
}

// Add CORS headers to response
function addCorsHeaders(response: Response): Response {
  const newResponse = new Response(response.body, response);
  Object.entries(corsHeaders()).forEach(([key, value]) => {
    newResponse.headers.set(key, value);
  });
  return newResponse;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Polyfill process.env for LangChain SDK compatibility in Cloudflare Workers
    // The @langchain/openai package checks process.env.OPENAI_API_KEY internally
    // even when apiKey is passed in the constructor
    if (typeof globalThis.process === 'undefined') {
      (globalThis as unknown as { process: { env: Record<string, string> } }).process = { env: {} };
    }
    // Set the gateway token as OPENAI_API_KEY for ChatOpenAI compatibility
    if (env.CF_AI_GATEWAY_TOKEN) {
      globalThis.process.env.OPENAI_API_KEY = env.CF_AI_GATEWAY_TOKEN;
    }
    // Set LangSmith env vars for LangChain tracing
    // LangChain reads these from process.env to enable automatic tracing
    if (env.LANGSMITH_API_KEY) {
      globalThis.process.env.LANGSMITH_API_KEY = env.LANGSMITH_API_KEY;
      globalThis.process.env.LANGSMITH_TRACING_V2 = env.LANGSMITH_TRACING_V2 || 'true';
      globalThis.process.env.LANGSMITH_PROJECT = env.LANGSMITH_PROJECT || 'iofold-development';
      console.log(`[LangSmith] process.env polyfill set - project: ${globalThis.process.env.LANGSMITH_PROJECT}, tracing: ${globalThis.process.env.LANGSMITH_TRACING_V2}`);
    }

    const url = new URL(request.url);

    // Handle OPTIONS requests (CORS preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // Strip /v1 prefix if present and create new request with modified URL
    let pathname = url.pathname;
    let modifiedRequest = request;

    if (pathname.startsWith('/v1')) {
      pathname = pathname.substring(3);
      const newUrl = new URL(url);
      newUrl.pathname = pathname;
      modifiedRequest = new Request(newUrl, request);
    }

    // For simplicity, we'll use a default workspace ID
    // In production, this would come from authentication
    const workspaceId = 'workspace_default';

    // Initialize API classes
    const evalsAPI = new EvalsAPI(
      env.DB,
      {
        cfAccountId: env.CF_ACCOUNT_ID,
        cfGatewayId: env.CF_AI_GATEWAY_ID,
        cfGatewayToken: env.CF_AI_GATEWAY_TOKEN,
      },
      env.SANDBOX
    );
    const jobsAPI = new JobsAPI(env.DB);

    // Health check
    if (pathname === '/health') {
      return addCorsHeaders(new Response('OK', { status: 200 }));
    }

    // Try the main API router first (handles /api/integrations, /api/traces, etc.)
    if (pathname.startsWith('/api/')) {
      const response = await handleApiRequest(modifiedRequest, env, ctx);
      return addCorsHeaders(response);
    }

    // ============================================================================
    // JOBS API
    // ============================================================================

    // GET /api/jobs/:id - Get job status
    if (url.pathname.match(/^\/api\/jobs\/[^\/]+$/) && request.method === 'GET') {
      const jobId = url.pathname.split('/')[3];
      return jobsAPI.getJob(jobId);
    }

    // GET /api/jobs/:id/stream - Stream job progress
    if (url.pathname.match(/^\/api\/jobs\/[^\/]+\/stream$/) && request.method === 'GET') {
      const jobId = url.pathname.split('/')[3];
      return jobsAPI.streamJob(jobId);
    }

    // POST /api/jobs/:id/cancel - Cancel job
    if (url.pathname.match(/^\/api\/jobs\/[^\/]+\/cancel$/) && request.method === 'POST') {
      const jobId = url.pathname.split('/')[3];
      return jobsAPI.cancelJob(jobId);
    }

    // GET /api/jobs - List recent jobs
    if (url.pathname === '/api/jobs' && request.method === 'GET') {
      return jobsAPI.listJobs(workspaceId, url.searchParams);
    }

    // ============================================================================
    // EVALS API
    // ============================================================================

    // POST /api/agents/:id/generate-eval - Generate eval (legacy pattern matcher)
    if (url.pathname.match(/^\/api\/agents\/[^\/]+\/generate-eval$/) && request.method === 'POST') {
      const agentId = url.pathname.split('/')[3];
      const body = await request.json();
      return evalsAPI.generateEval(agentId, workspaceId, body);
    }

    // POST /api/evals - Create eval directly
    if (url.pathname === '/api/evals' && request.method === 'POST') {
      const body = await request.json();
      return evalsAPI.createEval(body);
    }

    // GET /api/evals - List evals
    if (url.pathname === '/api/evals' && request.method === 'GET') {
      return evalsAPI.listEvals(url.searchParams);
    }

    // GET /api/evals/:id - Get eval details
    if (url.pathname.match(/^\/api\/evals\/[^\/]+$/) && request.method === 'GET') {
      const evalId = url.pathname.split('/')[3];
      return evalsAPI.getEval(evalId);
    }

    // PATCH /api/evals/:id - Update eval
    if (url.pathname.match(/^\/api\/evals\/[^\/]+$/) && request.method === 'PATCH') {
      const evalId = url.pathname.split('/')[3];
      const body = await request.json();
      return evalsAPI.updateEval(evalId, body);
    }

    // POST /api/evals/:id/execute - Execute eval
    if (url.pathname.match(/^\/api\/evals\/[^\/]+\/execute$/) && request.method === 'POST') {
      const evalId = url.pathname.split('/')[3];
      const body = await request.json();
      return evalsAPI.executeEval(evalId, workspaceId, body);
    }

    // DELETE /api/evals/:id - Delete eval
    if (url.pathname.match(/^\/api\/evals\/[^\/]+$/) && request.method === 'DELETE') {
      const evalId = url.pathname.split('/')[3];
      return evalsAPI.deleteEval(evalId);
    }

    // ============================================================================
    // LEGACY ENDPOINTS (kept for backward compatibility)
    // ============================================================================

    // Fetch traces from Langfuse
    if (url.pathname === '/api/traces/fetch' && request.method === 'POST') {
      try {
        const body = await request.json();
        const validatedBody = FetchTracesRequestSchema.parse(body);
        const { limit } = validatedBody;

        const adapter = new LangfuseAdapter({
          publicKey: env.LANGFUSE_PUBLIC_KEY,
          secretKey: env.LANGFUSE_SECRET_KEY,
          baseUrl: env.LANGFUSE_BASE_URL
        });

        const traces = await adapter.fetchTraces({ limit });

        // Store traces in D1 using batch API
        const statements = traces.map(trace =>
          env.DB.prepare(
            'INSERT OR REPLACE INTO traces (id, trace_id, source, raw_data, normalized_data) VALUES (?, ?, ?, ?, ?)'
          ).bind(
            trace.id,
            trace.trace_id,
            trace.source,
            JSON.stringify(trace.raw_data),
            JSON.stringify(trace.steps)
          )
        );

        if (statements.length > 0) {
          await env.DB.batch(statements);
        }

        return new Response(JSON.stringify({
          success: true,
          count: traces.length,
          traces: traces.map(t => ({
            id: t.id,
            trace_id: t.trace_id,
            steps_count: t.steps.length,
            source: t.source
          }))
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error: any) {
        return handleError(error);
      }
    }

    // Generate eval function (legacy endpoint - now prefer /api/agents/:id/generate-eval)
    if (url.pathname === '/api/evals/generate' && request.method === 'POST') {
      try {
        // Validate environment variables
        if (!env.CF_ACCOUNT_ID || !env.CF_AI_GATEWAY_ID) {
          return new Response(JSON.stringify({
            success: false,
            error: 'CF_ACCOUNT_ID and CF_AI_GATEWAY_ID environment variables are required'
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const body = await request.json();
        const validatedBody = GenerateEvalRequestSchema.parse(body);
        const { name, positiveTraceIds, negativeTraceIds } = validatedBody;

        // Fetch traces from database
        const fetchTrace = async (id: string) => {
          const result = await env.DB.prepare(
            'SELECT * FROM traces WHERE id = ?'
          ).bind(id).first();

          if (!result) {
            throw new Error(`Trace ${id} not found`);
          }

          return {
            id: result.id as string,
            trace_id: result.trace_id as string,
            source: result.source as 'langfuse' | 'langsmith' | 'openai',
            steps: JSON.parse(result.normalized_data as string),
            raw_data: JSON.parse(result.raw_data as string)
          };
        };

        const positiveTraces = await Promise.all(
          positiveTraceIds.map(fetchTrace)
        );
        const negativeTraces = await Promise.all(
          negativeTraceIds.map(fetchTrace)
        );

        // Generate eval
        const generator = new EvalGenerator({
          cfAccountId: env.CF_ACCOUNT_ID,
          cfGatewayId: env.CF_AI_GATEWAY_ID,
          cfGatewayToken: env.CF_AI_GATEWAY_TOKEN,
        });

        const result = await generator.generate({
          name,
          positiveExamples: positiveTraces,
          negativeExamples: negativeTraces
        });

        // Validate generated code
        const runner = new PythonRunner();
        const validation = runner.validateCode(result.code);
        if (validation) {
          return new Response(JSON.stringify({
            success: false,
            error: `Generated code validation failed: ${validation}`
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Store eval in database (with dummy agent_id for legacy support)
        const evalId = crypto.randomUUID();
        await env.DB.prepare(
          'INSERT INTO evals (id, agent_id, name, code, model_used, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
          .bind(
            evalId,
            'legacy',
            name,
            result.code,
            result.metadata.model,
            new Date().toISOString(),
            new Date().toISOString()
          )
          .run();

        return new Response(JSON.stringify({
          success: true,
          evalId,
          code: result.code,
          metadata: result.metadata
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error: any) {
        return handleError(error);
      }
    }

    // Test eval on training set (legacy endpoint)
    if (url.pathname.startsWith('/api/evals/') && url.pathname.endsWith('/test') && request.method === 'POST') {
      try {
        const evalId = url.pathname.split('/')[3];

        // Fetch eval
        const evalRecord = await env.DB.prepare(
          'SELECT * FROM evals WHERE id = ?'
        ).bind(evalId).first();

        if (!evalRecord) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Eval not found'
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Fetch test cases from request
        const body = await request.json();
        const validatedBody = TestEvalRequestSchema.parse(body);
        const { traceIds } = validatedBody;

        const testCases = await Promise.all(
          traceIds.map(async (item: { traceId: string; expectedScore: number }) => {
            const traceRecord = await env.DB.prepare(
              'SELECT * FROM traces WHERE id = ?'
            ).bind(item.traceId).first();

            if (!traceRecord) {
              throw new Error(`Trace ${item.traceId} not found`);
            }

            return {
              trace: {
                id: traceRecord.id as string,
                trace_id: traceRecord.trace_id as string,
                source: traceRecord.source as 'langfuse' | 'langsmith' | 'openai' | 'playground',
                steps: JSON.parse(traceRecord.normalized_data as string),
                raw_data: JSON.parse(traceRecord.raw_data as string)
              },
              expectedScore: item.expectedScore
            };
          })
        );

        // Test eval
        const tester = new EvalTester({ sandboxBinding: env.SANDBOX });
        const result = await tester.test(evalRecord.code as string, testCases);

        // Update eval with accuracy
        await env.DB.prepare(
          'UPDATE evals SET accuracy = ?, test_results = ? WHERE id = ?'
        ).bind(result.accuracy, JSON.stringify(result), evalId).run();

        // Store execution results
        for (const detail of result.details) {
          const executionId = crypto.randomUUID();
          await env.DB.prepare(
            'INSERT INTO eval_executions (id, eval_id, trace_id, result, reason, execution_time_ms, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          )
            .bind(
              executionId,
              evalId,
              detail.traceId,
              detail.predictedScore,
              detail.feedback,
              detail.executionTimeMs,
              detail.error || null,
              new Date().toISOString()
            )
            .run();
        }

        return new Response(JSON.stringify({
          success: true,
          result: {
            accuracy: result.accuracy,
            correct: result.correct,
            incorrect: result.incorrect,
            errors: result.errors,
            total: result.total,
            lowConfidence: result.accuracy < 0.8
          }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error: any) {
        return handleError(error);
      }
    }

    return new Response('Not Found', { status: 404 });
  },

  /**
   * Queue handler for processing background jobs
   * Called by Cloudflare when messages arrive in the queue
   */
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    const consumer = new QueueConsumer({
      db: env.DB,
      benchmarksDb: env.BENCHMARKS_DB,
      sandboxBinding: env.SANDBOX,
      encryptionKey: env.ENCRYPTION_KEY || 'default-dev-key',
      deadLetterQueue: env.DEAD_LETTER_QUEUE,
      cfAccountId: env.CF_ACCOUNT_ID,
      cfGatewayId: env.CF_AI_GATEWAY_ID,
      cfGatewayToken: env.CF_AI_GATEWAY_TOKEN,
      queue: env.JOB_QUEUE,
    });

    await consumer.processBatch(batch);
  },

  /**
   * Scheduled handler for cron-triggered monitoring jobs
   * Runs every 6 hours to check eval performance and trigger auto-refinement
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[Scheduled] Cron triggered at ${new Date(event.scheduledTime).toISOString()}`);

    // Only run monitoring if queue is available
    if (!env.JOB_QUEUE) {
      console.warn('[Scheduled] JOB_QUEUE not configured, skipping monitoring');
      return;
    }

    const producer = new QueueProducer({
      queue: env.JOB_QUEUE,
      db: env.DB
    });

    // Enqueue monitoring job for all workspaces
    // In production, you might want to enumerate workspaces and create separate jobs
    const result = await producer.enqueueMonitorJob(
      'workspace_default', // Default workspace
      undefined, // Monitor all evals
      7 // 7-day window
    );

    if (result.success) {
      console.log(`[Scheduled] Monitoring job enqueued: ${result.job_id}`);
    } else {
      console.error(`[Scheduled] Failed to enqueue monitoring job: ${result.error}`);
    }
  }
};
