/**
 * LangSmith Tracing Utilities
 *
 * Provides utilities to enable LangSmith tracing for LLM calls across iofold.
 * Reads configuration from environment variables (LANGSMITH_API_KEY, LANGSMITH_PROJECT, LANGSMITH_TRACING_V2).
 *
 * Includes fetch interception to capture traces locally before sending to LangSmith.
 *
 * @see https://docs.smith.langchain.com/tracing
 */

import { Client as LangSmithClient } from 'langsmith';
import { wrapOpenAI } from 'langsmith/wrappers';
import type OpenAI from 'openai';

/**
 * LangSmith batch payload structure
 * @see https://api.smith.langchain.com/redoc#tag/runs/operation/batch_ingest_runs_v1_runs_batch_post
 */
export interface LangSmithRun {
  id: string;
  name: string;
  run_type: string;
  start_time: string;
  end_time?: string;
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  error?: string;
  extra?: Record<string, any>;
  parent_run_id?: string;
  trace_id?: string;
  dotted_order?: string;
  session_id?: string;
  session_name?: string;
  tags?: string[];
  [key: string]: any;
}

export interface LangSmithBatchPayload {
  post?: LangSmithRun[];
  patch?: LangSmithRun[];
}

/**
 * Callback function type for intercepted batch payloads
 */
export type LangSmithInterceptorCallback = (
  payload: LangSmithBatchPayload,
  projectName: string
) => void | Promise<void>;

// Global interceptor callback - set via installLangSmithInterceptor
let globalInterceptorCallback: LangSmithInterceptorCallback | null = null;

/**
 * Environment configuration for LangSmith tracing
 */
export interface LangSmithEnv {
  /** LangSmith API key (required for tracing) */
  LANGSMITH_API_KEY?: string;
  /** LangSmith project name */
  LANGSMITH_PROJECT?: string;
  /** Enable LangSmith tracing v2 (set to "true" to enable) */
  LANGSMITH_TRACING_V2?: string;
  /** LangSmith workspace ID (required for org-scoped API keys) */
  LANGSMITH_WORKSPACE_ID?: string;
}

/**
 * Check if LangSmith tracing is enabled in the environment
 *
 * @param env - Environment with LangSmith configuration
 * @returns true if tracing is enabled (LANGSMITH_TRACING_V2=true and LANGSMITH_API_KEY is set)
 */
export function isLangSmithEnabled(env: LangSmithEnv): boolean {
  return env.LANGSMITH_TRACING_V2 === 'true' && !!env.LANGSMITH_API_KEY;
}

/**
 * Create a LangSmith client if tracing is enabled
 *
 * @param env - Environment with LangSmith configuration
 * @returns LangSmithClient instance or undefined if tracing is not enabled
 */
export function createLangSmithClient(env: LangSmithEnv): LangSmithClient | undefined {
  if (!isLangSmithEnabled(env)) {
    return undefined;
  }

  // Include workspace ID for org-scoped API keys
  const clientConfig: { apiKey?: string; webUrl?: string } = {
    apiKey: env.LANGSMITH_API_KEY,
  };

  // For org-scoped API keys, we need to set LANGSMITH_WORKSPACE_ID in process.env
  // since the LangSmith client reads it from there
  if (env.LANGSMITH_WORKSPACE_ID && typeof globalThis !== 'undefined') {
    const g = globalThis as any;
    if (g.process?.env) {
      g.process.env.LANGSMITH_WORKSPACE_ID = env.LANGSMITH_WORKSPACE_ID;
    }
  }

  return new LangSmithClient(clientConfig);
}

// Track if we've already logged the tracing status to avoid log spam
let langsmithStatusLogged = false;

/**
 * Wrap an OpenAI client with LangSmith tracing
 *
 * If LangSmith is not enabled, returns the original client unchanged.
 * If enabled, wraps the client with LangSmith's wrapOpenAI for automatic tracing.
 *
 * @param client - OpenAI client to wrap
 * @param env - Environment with LangSmith configuration
 * @returns Wrapped client (or original if tracing disabled)
 *
 * @example
 * ```ts
 * const client = createGatewayClient(env);
 * const tracedClient = wrapOpenAIWithLangSmith(client, env);
 * // All calls to tracedClient.chat.completions.create() will be traced to LangSmith
 * ```
 */
export function wrapOpenAIWithLangSmith(
  client: OpenAI,
  env: LangSmithEnv
): OpenAI {
  if (!isLangSmithEnabled(env)) {
    // Only log once per worker lifecycle
    if (!langsmithStatusLogged) {
      console.log(`[LangSmith] Tracing disabled - TRACING_V2: ${env.LANGSMITH_TRACING_V2}, API_KEY: ${env.LANGSMITH_API_KEY ? 'set' : 'not set'}`);
      langsmithStatusLogged = true;
    }
    return client;
  }

  // Only log once per worker lifecycle
  if (!langsmithStatusLogged) {
    console.log(`[LangSmith] Tracing enabled for project: ${env.LANGSMITH_PROJECT || 'iofold-development'}`);
    langsmithStatusLogged = true;
  }

  // Wrap the OpenAI client with LangSmith's wrapper
  // This automatically traces all chat.completions.create() calls
  // project_name is used in RunTreeConfig (not projectName)
  return wrapOpenAI(client, {
    project_name: env.LANGSMITH_PROJECT || 'iofold-development',
    client: createLangSmithClient(env),
  });
}

/**
 * Get LangSmith tracing context for LangChain models
 *
 * Returns callbacks configuration that can be passed to LangChain models
 * to enable LangSmith tracing.
 *
 * @param env - Environment with LangSmith configuration
 * @returns Callbacks array or undefined if tracing is disabled
 *
 * @example
 * ```ts
 * import { ChatOpenAI } from '@langchain/openai';
 * const model = new ChatOpenAI({
 *   model: 'gpt-4',
 *   callbacks: getLangChainCallbacks(env),
 * });
 * ```
 */
export function getLangChainCallbacks(env: LangSmithEnv): any[] | undefined {
  if (!isLangSmithEnabled(env)) {
    return undefined;
  }

  // LangChain automatically picks up LangSmith configuration from environment variables
  // when LANGSMITH_TRACING_V2 is set to "true"
  // We don't need to return explicit callbacks - just ensure env vars are available
  return undefined;
}

/**
 * Get environment variables for LangChain to enable LangSmith tracing
 *
 * LangChain reads LANGSMITH_* env vars directly. This function returns
 * the necessary env vars for passing to Workers/subprocesses.
 *
 * @param env - Environment with LangSmith configuration
 * @returns Object with LANGSMITH_* env vars
 */
export function getLangChainEnvVars(env: LangSmithEnv): Record<string, string> {
  if (!isLangSmithEnabled(env)) {
    return {};
  }

  const vars: Record<string, string> = {
    LANGSMITH_API_KEY: env.LANGSMITH_API_KEY!,
    LANGSMITH_PROJECT: env.LANGSMITH_PROJECT || 'iofold-development',
    LANGSMITH_TRACING_V2: 'true',
  };

  // Add workspace ID if provided (required for org-scoped API keys)
  if (env.LANGSMITH_WORKSPACE_ID) {
    vars.LANGSMITH_WORKSPACE_ID = env.LANGSMITH_WORKSPACE_ID;
  }

  return vars;
}

/**
 * Install a global interceptor for LangSmith batch payloads
 *
 * The callback receives all batch payloads (post/patch arrays of runs)
 * before they are sent to LangSmith, allowing local capture.
 *
 * @param callback - Function called with each batch payload
 * @returns Cleanup function to uninstall the interceptor
 *
 * @example
 * ```ts
 * const uninstall = installLangSmithInterceptor(async (payload, projectName) => {
 *   // Store runs locally
 *   for (const run of [...(payload.post || []), ...(payload.patch || [])]) {
 *     await db.insert(traces).values({
 *       id: run.id,
 *       name: run.name,
 *       // ...
 *     });
 *   }
 * });
 *
 * // Later, to stop intercepting:
 * uninstall();
 * ```
 */
export function installLangSmithInterceptor(
  callback: LangSmithInterceptorCallback
): () => void {
  globalInterceptorCallback = callback;
  console.log('[LangSmith] Interceptor installed');
  return () => {
    globalInterceptorCallback = null;
    console.log('[LangSmith] Interceptor uninstalled');
  };
}

/**
 * Create an intercepting fetch implementation for LangSmith
 *
 * Intercepts POST requests to /runs/batch and calls the global interceptor
 * callback before forwarding to the actual LangSmith endpoint.
 *
 * @param projectName - Project name for logging/context
 * @returns Custom fetch implementation
 */
export function createInterceptingFetch(projectName: string): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Intercept batch requests to LangSmith
    if (
      globalInterceptorCallback &&
      url.includes('/runs/batch') &&
      init?.method?.toUpperCase() === 'POST' &&
      init?.body
    ) {
      try {
        // Parse the batch payload
        const bodyStr = typeof init.body === 'string' ? init.body : await new Response(init.body).text();
        const payload = JSON.parse(bodyStr) as LangSmithBatchPayload;

        // Call the interceptor (fire and forget - don't block the request)
        const runCount = (payload.post?.length || 0) + (payload.patch?.length || 0);
        console.log(`[LangSmith] Intercepted batch: ${runCount} runs for project "${projectName}"`);

        // Execute callback async to not slow down LangSmith upload
        Promise.resolve(globalInterceptorCallback(payload, projectName)).catch((err) => {
          console.error('[LangSmith] Interceptor callback error:', err);
        });
      } catch (err) {
        console.error('[LangSmith] Failed to parse batch payload:', err);
      }
    }

    // Forward to actual fetch
    return fetch(input, init);
  };
}

/**
 * Create a LangSmith client with fetch interception enabled
 *
 * @param env - Environment with LangSmith configuration
 * @returns LangSmithClient instance with intercepting fetch, or undefined if tracing is not enabled
 */
export function createInterceptingLangSmithClient(env: LangSmithEnv): LangSmithClient | undefined {
  if (!isLangSmithEnabled(env)) {
    return undefined;
  }

  const projectName = env.LANGSMITH_PROJECT || 'iofold-development';

  // For org-scoped API keys, we need to set LANGSMITH_WORKSPACE_ID in process.env
  if (env.LANGSMITH_WORKSPACE_ID && typeof globalThis !== 'undefined') {
    const g = globalThis as any;
    if (g.process?.env) {
      g.process.env.LANGSMITH_WORKSPACE_ID = env.LANGSMITH_WORKSPACE_ID;
    }
  }

  return new LangSmithClient({
    apiKey: env.LANGSMITH_API_KEY,
    fetchImplementation: createInterceptingFetch(projectName),
  });
}

/**
 * Wrap an OpenAI client with LangSmith tracing AND local interception
 *
 * If LangSmith is not enabled, returns the original client unchanged.
 * If enabled, wraps the client with LangSmith's wrapOpenAI for automatic tracing,
 * using an intercepting fetch that captures traces locally.
 *
 * @param client - OpenAI client to wrap
 * @param env - Environment with LangSmith configuration
 * @returns Wrapped client (or original if tracing disabled)
 *
 * @example
 * ```ts
 * // First install the interceptor
 * installLangSmithInterceptor(async (payload, project) => {
 *   console.log('Captured traces:', payload.post?.length);
 * });
 *
 * // Then wrap your client
 * const client = createGatewayClient(env);
 * const tracedClient = wrapOpenAIWithInterception(client, env);
 * ```
 */
export function wrapOpenAIWithInterception(
  client: OpenAI,
  env: LangSmithEnv
): OpenAI {
  if (!isLangSmithEnabled(env)) {
    if (!langsmithStatusLogged) {
      console.log(`[LangSmith] Tracing disabled - TRACING_V2: ${env.LANGSMITH_TRACING_V2}, API_KEY: ${env.LANGSMITH_API_KEY ? 'set' : 'not set'}`);
      langsmithStatusLogged = true;
    }
    return client;
  }

  const projectName = env.LANGSMITH_PROJECT || 'iofold-development';

  if (!langsmithStatusLogged) {
    console.log(`[LangSmith] Tracing enabled with interception for project: ${projectName}`);
    langsmithStatusLogged = true;
  }

  // Create client with intercepting fetch
  const interceptingClient = createInterceptingLangSmithClient(env);

  return wrapOpenAI(client, {
    project_name: projectName,
    client: interceptingClient,
  });
}
