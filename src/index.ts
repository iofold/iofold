/// <reference types="@cloudflare/workers-types" />

import { z } from 'zod';
import { LangfuseAdapter } from './adapters/langfuse';
import { EvalGenerator } from './eval-generator/generator';
import { PythonRunner } from './sandbox/python-runner';

export interface Env {
  DB: D1Database;
  LANGFUSE_PUBLIC_KEY: string;
  LANGFUSE_SECRET_KEY: string;
  LANGFUSE_BASE_URL?: string;
  ANTHROPIC_API_KEY: string;
}

const FetchTracesRequestSchema = z.object({
  limit: z.number().int().positive().min(1).max(100).optional().default(10)
});

const GenerateEvalRequestSchema = z.object({
  name: z.string().min(1),
  positiveTraceIds: z.array(z.string()).min(1),
  negativeTraceIds: z.array(z.string()).min(1)
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

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
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Generate eval function
    if (url.pathname === '/api/evals/generate' && request.method === 'POST') {
      try {
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
          anthropicApiKey: env.ANTHROPIC_API_KEY
        });

        const result = await generator.generate({
          name,
          positiveExamples: positiveTraces,
          negativeExamples: negativeTraces
        });

        // Validate generated code
        const runner = new PythonRunner();
        const validation = runner['validateCode'](result.code);
        if (validation) {
          return new Response(JSON.stringify({
            success: false,
            error: `Generated code validation failed: ${validation}`
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Store eval in database
        const evalId = crypto.randomUUID();
        await env.DB.prepare(
          'INSERT INTO evals (id, name, code, training_count, created_at) VALUES (?, ?, ?, ?, ?)'
        )
          .bind(
            evalId,
            name,
            result.code,
            positiveTraces.length + negativeTraces.length,
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
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  }
};
