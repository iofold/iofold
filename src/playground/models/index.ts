/**
 * Model configuration for Agents Playground
 * All models route through Cloudflare AI Gateway /compat endpoint
 */

import OpenAI from 'openai';
import { createGatewayClient, MODELS, getAvailableModels, type GatewayEnv, type ModelConfig } from '../../ai/gateway';

export type ModelProvider = 'anthropic' | 'openai' | 'google' | 'workers-ai';

export interface ModelOption {
  provider: ModelProvider;
  modelId: string;  // Provider-prefixed model ID
  label: string;
}

/**
 * Available model options for the playground
 * All models use provider-prefixed IDs for gateway routing
 */
export const MODEL_OPTIONS: readonly ModelOption[] = getAvailableModels().map(m => ({
  provider: m.provider,
  modelId: m.id,
  label: m.label,
}));

export interface PlaygroundEnv {
  /** Cloudflare Account ID for AI Gateway (required) */
  CF_ACCOUNT_ID: string;
  /** Cloudflare AI Gateway ID (required) */
  CF_AI_GATEWAY_ID: string;
  /** Optional AI Gateway authentication token */
  CF_AI_GATEWAY_TOKEN?: string;
}

/**
 * Create a gateway client for playground use
 * @param env - Environment with gateway configuration
 * @returns Configured OpenAI client pointing to AI Gateway
 */
export function createPlaygroundClient(env: PlaygroundEnv): OpenAI {
  return createGatewayClient({
    CF_ACCOUNT_ID: env.CF_ACCOUNT_ID,
    CF_AI_GATEWAY_ID: env.CF_AI_GATEWAY_ID,
    CF_AI_GATEWAY_TOKEN: env.CF_AI_GATEWAY_TOKEN,
  });
}

/**
 * Validate if a model ID exists in the available options
 */
export function isValidModelOption(modelId: string): boolean {
  return !!MODELS[modelId];
}

/**
 * Get model configuration by ID
 */
export function getModelOption(modelId: string): ModelConfig | undefined {
  return MODELS[modelId];
}

/**
 * Get models for a specific provider
 */
export function getModelsForProvider(provider: ModelProvider): ModelOption[] {
  return MODEL_OPTIONS.filter(m => m.provider === provider);
}
