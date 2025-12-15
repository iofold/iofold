/**
 * LangSmith Tracing Utilities
 *
 * Provides utilities to enable LangSmith tracing for LLM calls across iofold.
 * Reads configuration from environment variables (LANGSMITH_API_KEY, LANGSMITH_PROJECT, LANGSMITH_TRACING_V2).
 *
 * @see https://docs.smith.langchain.com/tracing
 */

import { Client as LangSmithClient } from 'langsmith';
import { wrapOpenAI } from 'langsmith/wrappers';
import type OpenAI from 'openai';

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
