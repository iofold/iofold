/**
 * LLM Streaming Module
 *
 * Provides a unified interface to stream responses from all providers
 * via Cloudflare AI Gateway /compat endpoint using OpenAI SDK.
 *
 * Also provides LangChain model integration for deepagents compatibility.
 */

import OpenAI from 'openai';
import { ChatOpenAI } from '@langchain/openai';
import { createGatewayClient, DEFAULT_MODEL, MODELS, type GatewayEnv, type AIProvider } from '../../ai/gateway';
import { getLangChainEnvVars, isLangSmithEnabled } from '../../ai/langsmith-tracer';
import type { ModelProvider } from '../types';

/**
 * Environment interface with AI Gateway configuration
 */
export interface StreamingEnv extends GatewayEnv {
  [key: string]: unknown;
}

/**
 * Configuration for creating an LLM streaming client
 */
export interface StreamingModelConfig {
  /** Provider-prefixed model ID (e.g., 'anthropic/claude-sonnet-4-5-20250929') */
  modelId: string;

  /** Environment with gateway configuration */
  env: StreamingEnv;

  /** Maximum output tokens to generate */
  maxOutputTokens?: number;

  /** Temperature (0-1) for response randomness */
  temperature?: number;
}

/**
 * Streaming completion result
 */
export interface StreamingCompletion {
  client: OpenAI;
  model: string;
  maxTokens: number;
  temperature: number;
}

/**
 * Creates a streaming-capable OpenAI client configured for the AI Gateway
 *
 * @param config - Model configuration
 * @returns Configured client and settings
 * @throws Error if gateway not configured
 */
export function getStreamingClient(config: StreamingModelConfig): StreamingCompletion {
  const { modelId, env, maxOutputTokens = 4096, temperature = 0.7 } = config;

  // Validate model exists
  if (!MODELS[modelId]) {
    throw new Error(
      `Unknown model: ${modelId}. Available models: ${Object.keys(MODELS).join(', ')}`
    );
  }

  const client = createGatewayClient(env);

  return {
    client,
    model: modelId,
    maxTokens: maxOutputTokens,
    temperature,
  };
}

/**
 * Stream a chat completion
 *
 * @param completion - Streaming completion config
 * @param messages - Chat messages
 * @returns AsyncIterable of content chunks
 */
export async function* streamCompletion(
  completion: StreamingCompletion,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
): AsyncGenerator<string, void, unknown> {
  const stream = await completion.client.chat.completions.create({
    model: completion.model,
    messages,
    max_tokens: completion.maxTokens,
    temperature: completion.temperature,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}

/**
 * Default models for each provider (provider-prefixed)
 */
export const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'anthropic/claude-sonnet-4-5',
  openai: 'openai/gpt-5-nano',
  google: 'google-vertex-ai/google/gemini-2.5-flash',
  'workers-ai': 'workers-ai/@cf/meta/llama-3.1-8b-instruct',
};

/**
 * Gets the default model ID for a provider
 */
export function getDefaultModel(provider: AIProvider): string {
  return DEFAULT_MODELS[provider];
}

/**
 * Check if gateway is properly configured
 */
export function isGatewayConfigured(env: Partial<StreamingEnv>): boolean {
  return !!(env.CF_ACCOUNT_ID && env.CF_AI_GATEWAY_ID);
}

/**
 * Gets a list of available providers (all providers available via gateway)
 */
export function getAvailableProviders(): AIProvider[] {
  return ['anthropic', 'openai', 'google', 'workers-ai'];
}

// ============================================================================
// LangChain Model Integration for deepagents (via Cloudflare AI Gateway)
// ============================================================================

/**
 * Environment interface for LangChain models
 * Uses Cloudflare AI Gateway - no direct provider API keys needed
 */
export interface Env extends GatewayEnv {
  [key: string]: unknown;
}

/**
 * Configuration for creating a LangChain chat model
 */
export interface ChatModelConfig {
  provider: ModelProvider;
  modelId: string;
  env: Env;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Check if gateway is configured for a provider
 * All providers are available via the gateway
 */
export function hasApiKey(provider: ModelProvider, env: Env): boolean {
  // All providers are available through the gateway
  return !!(env.CF_ACCOUNT_ID && env.CF_AI_GATEWAY_ID);
}

/**
 * Create a LangChain chat model for use with deepagents
 *
 * Routes all requests through Cloudflare AI Gateway using ChatOpenAI
 * with custom baseURL. The gateway handles routing to the correct provider
 * based on the model prefix (anthropic/, openai/, google/).
 *
 * Automatically enables LangSmith tracing if LANGSMITH_TRACING_V2=true
 * and LANGSMITH_API_KEY is set in the environment.
 */
export function getChatModel(config: ChatModelConfig) {
  const { provider, modelId, env, temperature = 0.7, maxTokens = 4096 } = config;

  // Validate gateway is configured
  if (!env.CF_ACCOUNT_ID || !env.CF_AI_GATEWAY_ID) {
    throw new Error('Cloudflare AI Gateway not configured (CF_ACCOUNT_ID and CF_AI_GATEWAY_ID required)');
  }

  // Build gateway URL
  const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.CF_AI_GATEWAY_ID}`;

  // Construct provider-prefixed model name if not already prefixed
  let fullModelId = modelId;
  if (!modelId.includes('/')) {
    fullModelId = `${provider}/${modelId}`;
  }

  // Validate gateway token is configured
  if (!env.CF_AI_GATEWAY_TOKEN) {
    throw new Error('Cloudflare AI Gateway token required (CF_AI_GATEWAY_TOKEN)');
  }

  // Prepare LangSmith environment variables for LangChain
  // LangChain will automatically enable tracing when these are set
  const langsmithEnv = getLangChainEnvVars(env);

  if (isLangSmithEnabled(env)) {
    console.log(`[LangSmith] LangChain tracing enabled for project: ${env.LANGSMITH_PROJECT || 'iofold-development'}`);

    // Set environment variables for LangChain to pick up
    // Note: In a Workers environment, these might need to be passed differently
    if (typeof process !== 'undefined' && process.env) {
      Object.assign(process.env, langsmithEnv);
    }
  }

  // Use ChatOpenAI for all providers - the gateway routes based on model prefix
  // The gateway's /compat endpoint accepts OpenAI-compatible requests and routes
  // to the correct provider based on the model name prefix
  return new ChatOpenAI({
    model: fullModelId,
    openAIApiKey: env.CF_AI_GATEWAY_TOKEN,
    temperature,
    maxTokens,
    configuration: {
      baseURL: `${gatewayUrl}/compat`,
    },
  });
}
