/**
 * Cloudflare AI Gateway Client
 *
 * Single unified client for all LLM calls through Cloudflare AI Gateway's /compat endpoint.
 * All provider API keys are configured in the Cloudflare dashboard, not in code.
 *
 * Models use provider-prefixed names (e.g., "anthropic/claude-sonnet-4-5-20250929")
 * which the gateway uses to route to the appropriate provider.
 *
 * @see https://developers.cloudflare.com/ai-gateway/
 */

import OpenAI from 'openai';
import { wrapOpenAIWithLangSmith, type LangSmithEnv } from './langsmith-tracer';

/**
 * Supported AI providers through Cloudflare AI Gateway
 */
export type AIProvider = 'anthropic' | 'openai' | 'google' | 'workers-ai';

/**
 * Model configuration with pricing info
 */
export interface ModelConfig {
  /** Provider-prefixed model ID (e.g., "anthropic/claude-sonnet-4-5-20250929") */
  id: string;
  /** Provider for this model */
  provider: AIProvider;
  /** Display label */
  label: string;
  /** Cost per 1M input tokens (USD) */
  inputCostPer1M: number;
  /** Cost per 1M output tokens (USD) */
  outputCostPer1M: number;
}

/**
 * Available models - all with provider-prefixed IDs for gateway routing
 * Note: Cloudflare AI Gateway uses short model names without date suffixes
 */
export const MODELS: Record<string, ModelConfig> = {
  // Anthropic Claude 4.5 series (gateway format: no date suffix)
  'anthropic/claude-sonnet-4-5': {
    id: 'anthropic/claude-sonnet-4-5',
    provider: 'anthropic',
    label: 'Claude Sonnet 4.5',
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00,
  },
  'anthropic/claude-haiku-4-5': {
    id: 'anthropic/claude-haiku-4-5',
    provider: 'anthropic',
    label: 'Claude Haiku 4.5',
    inputCostPer1M: 1.00,
    outputCostPer1M: 5.00,
  },
  'anthropic/claude-opus-4-5': {
    id: 'anthropic/claude-opus-4-5',
    provider: 'anthropic',
    label: 'Claude Opus 4.5',
    inputCostPer1M: 15.00,
    outputCostPer1M: 75.00,
  },
  // OpenAI GPT-5 series
  'openai/gpt-5-mini': {
    id: 'openai/gpt-5-mini',
    provider: 'openai',
    label: 'GPT-5 Mini',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
  },
  'openai/gpt-5-nano': {
    id: 'openai/gpt-5-nano',
    provider: 'openai',
    label: 'GPT-5 Nano',
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.30,
  },
  // Google Vertex AI Gemini 2.5 series (format: google-vertex-ai/google/model)
  'google-vertex-ai/google/gemini-2.5-flash': {
    id: 'google-vertex-ai/google/gemini-2.5-flash',
    provider: 'google',
    label: 'Gemini 2.5 Flash',
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.30,
  },
  'google-vertex-ai/google/gemini-2.5-pro': {
    id: 'google-vertex-ai/google/gemini-2.5-pro',
    provider: 'google',
    label: 'Gemini 2.5 Pro',
    inputCostPer1M: 1.25,
    outputCostPer1M: 5.00,
  },
  // Workers AI (Cloudflare's native models)
  'workers-ai/@cf/meta/llama-3.1-8b-instruct': {
    id: 'workers-ai/@cf/meta/llama-3.1-8b-instruct',
    provider: 'workers-ai',
    label: 'Llama 3.1 8B',
    inputCostPer1M: 0.0,  // Included in Workers AI pricing
    outputCostPer1M: 0.0,
  },
};

/**
 * Default model for general use
 */
export const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-5';

/**
 * Gateway environment configuration
 * Only Cloudflare gateway config needed - no provider API keys
 */
export interface GatewayEnv extends LangSmithEnv {
  /** Cloudflare Account ID */
  CF_ACCOUNT_ID: string;
  /** Cloudflare AI Gateway ID */
  CF_AI_GATEWAY_ID: string;
  /** Optional gateway authentication token */
  CF_AI_GATEWAY_TOKEN?: string;
}

/**
 * Build the AI Gateway /compat URL
 * This endpoint accepts OpenAI SDK format and routes to any provider
 */
export function getGatewayUrl(accountId: string, gatewayId: string): string {
  return `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/compat`;
}

/**
 * Create an OpenAI-compatible client for the AI Gateway /compat endpoint
 *
 * Automatically wraps the client with LangSmith tracing if LANGSMITH_TRACING_V2=true
 * and LANGSMITH_API_KEY is set in the environment.
 *
 * @param env - Environment with gateway configuration
 * @returns Configured OpenAI client pointing to AI Gateway (with LangSmith tracing if enabled)
 * @throws Error if gateway configuration is missing
 */
export function createGatewayClient(env: GatewayEnv): OpenAI {
  if (!env.CF_ACCOUNT_ID || !env.CF_AI_GATEWAY_ID) {
    throw new Error(
      'AI Gateway configuration required: CF_ACCOUNT_ID and CF_AI_GATEWAY_ID must be set'
    );
  }

  const baseURL = getGatewayUrl(env.CF_ACCOUNT_ID, env.CF_AI_GATEWAY_ID);
  console.log(`[AI Gateway] Using compat endpoint: ${baseURL}`);

  // Use CF_AI_GATEWAY_TOKEN as the apiKey per Cloudflare's documentation
  // The token authenticates with the gateway, which then uses provider keys
  // configured in the Cloudflare dashboard
  if (!env.CF_AI_GATEWAY_TOKEN) {
    throw new Error(
      'AI Gateway token required: CF_AI_GATEWAY_TOKEN must be set'
    );
  }

  const client = new OpenAI({
    apiKey: env.CF_AI_GATEWAY_TOKEN,
    baseURL,
  });

  // Wrap with LangSmith tracing if enabled
  return wrapOpenAIWithLangSmith(client, env);
}

/**
 * Check if AI Gateway is configured
 */
export function isGatewayConfigured(env: Partial<GatewayEnv>): boolean {
  return !!(env.CF_ACCOUNT_ID && env.CF_AI_GATEWAY_ID);
}

/**
 * Get model configuration by ID
 * @param modelId - Provider-prefixed model ID or bare model name
 * @returns Model configuration or undefined if not found
 */
export function getModelConfig(modelId: string): ModelConfig | undefined {
  // Try direct lookup first
  if (MODELS[modelId]) {
    return MODELS[modelId];
  }

  // Try to find by bare model name (for backwards compatibility)
  const entry = Object.entries(MODELS).find(([_, config]) => {
    const bareName = config.id.split('/').slice(1).join('/');
    return bareName === modelId;
  });

  return entry?.[1];
}

/**
 * Get all available models as an array
 */
export function getAvailableModels(): ModelConfig[] {
  return Object.values(MODELS);
}

/**
 * Get models for a specific provider
 */
export function getModelsForProvider(provider: AIProvider): ModelConfig[] {
  return Object.values(MODELS).filter(m => m.provider === provider);
}

/**
 * Calculate cost for a completion
 */
export function calculateCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number
): { inputCost: number; outputCost: number; totalCost: number } {
  const config = getModelConfig(modelId);
  if (!config) {
    return { inputCost: 0, outputCost: 0, totalCost: 0 };
  }

  const inputCost = (promptTokens / 1_000_000) * config.inputCostPer1M;
  const outputCost = (completionTokens / 1_000_000) * config.outputCostPer1M;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

/**
 * Chat completion options
 */
export interface ChatOptions {
  /** Provider-prefixed model ID */
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Chat completion response
 */
export interface ChatResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost: {
    inputCost: number;
    outputCost: number;
    totalCost: number;
  };
}

/**
 * Simple chat completion helper
 * Uses provider-prefixed model names for gateway routing
 */
export async function chatCompletion(
  client: OpenAI,
  options: ChatOptions
): Promise<ChatResponse> {
  const response = await client.chat.completions.create({
    model: options.model,
    messages: options.messages,
    temperature: options.temperature ?? 0,
    max_tokens: options.maxTokens ?? 1024,
  });

  const choice = response.choices[0];
  const promptTokens = response.usage?.prompt_tokens || 0;
  const completionTokens = response.usage?.completion_tokens || 0;

  return {
    content: choice.message?.content || '',
    model: response.model,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    cost: calculateCost(options.model, promptTokens, completionTokens),
  };
}
