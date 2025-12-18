/// <reference types="@cloudflare/workers-types" />

import { z } from 'zod';
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
import { createDb } from './db/client';
import { eq } from 'drizzle-orm';
import { traces, evals, evalExecutions } from './db/schema';
import { installLangSmithInterceptor, type LangSmithBatchPayload } from './ai/langsmith-tracer';

// Re-export Sandbox Durable Object class for wrangler
// This is required for the SANDBOX binding to work
// Export as PythonSandbox (new SQLite-backed DO for Containers)
import type { Sandbox as SandboxType } from '@cloudflare/sandbox';
export { Sandbox } from '@cloudflare/sandbox';
export { Sandbox as PythonSandbox } from '@cloudflare/sandbox';

export interface Env {
  DB: D1Database;
  SANDBOX?: DurableObjectNamespace<SandboxType>;
  /** URL for dev Python executor service (used when sandbox binding isn't available) */
  PYTHON_EXECUTOR_URL?: string;
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
  /** LangSmith API key for tracing (optional) */
  LANGSMITH_API_KEY?: string;
  /** LangSmith tracing flag (optional) */
  LANGSMITH_TRACING_V2?: string;
  /** LangSmith project name (optional) */
  LANGSMITH_PROJECT?: string;
  /** LangSmith workspace ID (required for org-scoped API keys) */
  LANGSMITH_WORKSPACE_ID?: string;
  /** Benchmarks database for ART-E and other benchmarks (optional) */
  BENCHMARKS_DB?: D1Database;
}

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

// Track if we've already logged the polyfill setup (to avoid log spam on every request)
let polyfillLogged = false;
// Track if we've already installed the LangSmith interceptor
let langsmithInterceptorInstalled = false;

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
    // Make PYTHON_EXECUTOR_URL available to PythonRunner via process.env (used as a default).
    if (env.PYTHON_EXECUTOR_URL) {
      globalThis.process.env.PYTHON_EXECUTOR_URL = env.PYTHON_EXECUTOR_URL;
    }
    // Set LangSmith env vars for LangChain tracing
    // LangChain reads these from process.env to enable automatic tracing
    if (env.LANGSMITH_API_KEY) {
      globalThis.process.env.LANGSMITH_API_KEY = env.LANGSMITH_API_KEY;
      globalThis.process.env.LANGSMITH_TRACING_V2 = env.LANGSMITH_TRACING_V2 || 'true';
      globalThis.process.env.LANGSMITH_PROJECT = env.LANGSMITH_PROJECT || 'iofold-development';
      // Workspace ID required for org-scoped API keys
      if (env.LANGSMITH_WORKSPACE_ID) {
        globalThis.process.env.LANGSMITH_WORKSPACE_ID = env.LANGSMITH_WORKSPACE_ID;
      }
      // Only log once per worker lifecycle
      if (!polyfillLogged) {
        console.log(`[LangSmith] Tracing configured - project: ${globalThis.process.env.LANGSMITH_PROJECT}`);
        polyfillLogged = true;
      }

      // Install LangSmith interceptor to capture traces locally (once per worker lifecycle)
      if (!langsmithInterceptorInstalled) {
        installLangSmithInterceptor(async (payload: LangSmithBatchPayload, projectName: string) => {
          // Log captured traces for now - can be extended to store in D1
          const postCount = payload.post?.length || 0;
          const patchCount = payload.patch?.length || 0;
          console.log(`[LangSmith Interceptor] Captured ${postCount} new runs, ${patchCount} updated runs for project "${projectName}"`);

          // TODO: Store in D1 traces table for local viewing/analysis
          // This would enable showing traces in the Quick Review UI without
          // fetching from LangSmith API
        });
        langsmithInterceptorInstalled = true;
      }
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
        langsmithApiKey: env.LANGSMITH_API_KEY,
        langsmithTracingV2: env.LANGSMITH_TRACING_V2,
        langsmithProject: env.LANGSMITH_PROJECT,
        langsmithWorkspaceId: env.LANGSMITH_WORKSPACE_ID,
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

    // Fetch traces from Langfuse - DEPRECATED
    // Use POST /api/traces/import instead (handled by handleApiRequest above)
    if (url.pathname === '/api/traces/fetch' && request.method === 'POST') {
      return new Response(JSON.stringify({
        error: 'DEPRECATED',
        message: 'This endpoint is deprecated. Use POST /api/traces/import instead.',
        migration: {
          old_endpoint: 'POST /api/traces/fetch',
          new_endpoint: 'POST /api/traces/import',
          new_payload: {
            integration_id: 'your_integration_id',
            filters: {
              limit: 10
            }
          }
        }
      }), {
        status: 410, // Gone
        headers: { 'Content-Type': 'application/json' }
      });
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
        const drizzle = createDb(env.DB);
        const fetchTrace = async (id: string) => {
          const result = await drizzle
            .select()
            .from(traces)
            .where(eq(traces.id, id))
            .limit(1);

          if (result.length === 0) {
            throw new Error(`Trace ${id} not found`);
          }

          const trace = result[0];
          return {
            id: trace.id,
            trace_id: trace.traceId,
            source: trace.source as 'langfuse' | 'langsmith' | 'openai',
            steps: trace.steps as any,
            raw_data: trace.rawData
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
        await drizzle
          .insert(evals)
          .values({
            id: evalId,
            agentId: 'legacy',
            version: 1,
            name: name,
            code: result.code,
            modelUsed: result.metadata.model
          });

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
        const drizzle = createDb(env.DB);

        // Fetch eval
        const evalResults = await drizzle
          .select()
          .from(evals)
          .where(eq(evals.id, evalId))
          .limit(1);

        if (evalResults.length === 0) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Eval not found'
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const evalRecord = evalResults[0];

        // Fetch test cases from request
        const body = await request.json();
        const validatedBody = TestEvalRequestSchema.parse(body);
        const { traceIds } = validatedBody;

        const testCases = await Promise.all(
          traceIds.map(async (item: { traceId: string; expectedScore: number }) => {
            const traceResults = await drizzle
              .select()
              .from(traces)
              .where(eq(traces.id, item.traceId))
              .limit(1);

            if (traceResults.length === 0) {
              throw new Error(`Trace ${item.traceId} not found`);
            }

            const traceRecord = traceResults[0];
            return {
              trace: {
                id: traceRecord.id,
                trace_id: traceRecord.traceId,
                source: traceRecord.source as 'langfuse' | 'langsmith' | 'openai' | 'playground',
                steps: traceRecord.steps as any,
                raw_data: traceRecord.rawData
              },
              expectedScore: item.expectedScore
            };
          })
        );

        // Test eval
        const tester = new EvalTester({ sandboxBinding: env.SANDBOX });
        const result = await tester.test(evalRecord.code, testCases);

        // Update eval with accuracy
        await drizzle
          .update(evals)
          .set({
            accuracy: result.accuracy,
            testResults: result as any
          })
          .where(eq(evals.id, evalId));

        // Store execution results
        for (const detail of result.details) {
          const executionId = crypto.randomUUID();
          await drizzle
            .insert(evalExecutions)
            .values({
              id: executionId,
              evalId: evalId,
              traceId: detail.traceId,
              predictedResult: detail.predictedScore > 0.5,
              predictedReason: detail.feedback,
              executionTimeMs: detail.executionTimeMs,
              error: detail.error || null
            });
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

};
