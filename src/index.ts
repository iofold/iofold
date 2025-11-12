/// <reference types="@cloudflare/workers-types" />

import { LangfuseAdapter } from './adapters/langfuse';

export interface Env {
  DB: D1Database;
  LANGFUSE_PUBLIC_KEY: string;
  LANGFUSE_SECRET_KEY: string;
  LANGFUSE_BASE_URL?: string;
  ANTHROPIC_API_KEY: string;
}

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
        const { limit = 10 } = await request.json();

        const adapter = new LangfuseAdapter({
          publicKey: env.LANGFUSE_PUBLIC_KEY,
          secretKey: env.LANGFUSE_SECRET_KEY,
          baseUrl: env.LANGFUSE_BASE_URL
        });

        await adapter.authenticate();
        const traces = await adapter.fetchTraces({ limit });

        // Store traces in D1
        for (const trace of traces) {
          await env.DB.prepare(
            'INSERT OR REPLACE INTO traces (id, trace_id, source, raw_data, normalized_data) VALUES (?, ?, ?, ?, ?)'
          )
            .bind(
              trace.id,
              trace.trace_id,
              trace.source,
              JSON.stringify(trace.raw_data),
              JSON.stringify(trace.steps)
            )
            .run();
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

    return new Response('Not Found', { status: 404 });
  }
};
