/**
 * LLM Streaming Module
 *
 * Provides a unified interface to stream responses from Claude, GPT-4o, and Gemini
 * using LangChain providers. Handles provider-specific model initialization.
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ModelProvider } from '../types';

/**
 * Environment interface with API keys for different providers
 */
export interface Env {
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  GEMINI_API_KEY?: string; // Alternative name for Google API key
  [key: string]: unknown;
}

/**
 * Configuration for creating an LLM model
 */
export interface ModelConfig {
  /** Model provider (anthropic, openai, google) */
  provider: ModelProvider;

  /** Specific model ID (e.g., 'claude-sonnet-4-5-20250929', 'gpt-5.1-mini', 'gemini-2.5-flash') */
  modelId: string;

  /** Environment with API keys */
  env: Env;

  /** Maximum output tokens to generate */
  maxOutputTokens?: number;

  /** Temperature (0-1) for response randomness */
  temperature?: number;
}

/**
 * Gets the appropriate LangChain chat model based on provider
 *
 * @param config - Model configuration
 * @returns LangChain chat model instance
 * @throws Error if API key is missing
 */
export function getChatModel(config: ModelConfig): BaseChatModel {
  const { provider, modelId, env, maxOutputTokens, temperature } = config;

  switch (provider) {
    case 'anthropic': {
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error(
          'ANTHROPIC_API_KEY is not configured. Please add your Anthropic API key to your environment variables.'
        );
      }
      return new ChatAnthropic({
        apiKey: env.ANTHROPIC_API_KEY,
        model: modelId,
        maxTokens: maxOutputTokens,
        temperature,
      });
    }

    case 'openai': {
      if (!env.OPENAI_API_KEY) {
        throw new Error(
          'OPENAI_API_KEY is not configured. Please add your OpenAI API key to your environment variables.'
        );
      }
      return new ChatOpenAI({
        apiKey: env.OPENAI_API_KEY,
        model: modelId,
        maxTokens: maxOutputTokens,
        temperature,
      });
    }

    case 'google': {
      const googleApiKey = env.GOOGLE_API_KEY || env.GEMINI_API_KEY;
      if (!googleApiKey) {
        throw new Error(
          'GOOGLE_API_KEY or GEMINI_API_KEY is not configured. Please add your Google API key to your environment variables.'
        );
      }
      return new ChatGoogleGenerativeAI({
        apiKey: googleApiKey,
        model: modelId,
        maxOutputTokens,
        temperature,
      });
    }

    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = provider;
      throw new Error(`Unsupported provider: ${provider}`);
    }
  }
}

/**
 * Default model IDs for each provider (verified available models)
 * Note: Gemini 2.5 models have streaming issues with current SDK, using 1.5 for now
 */
export const DEFAULT_MODELS: Record<ModelProvider, string> = {
  anthropic: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-5.1',
  google: 'gemini-1.5-pro',
};

/**
 * Gets the default model ID for a provider
 */
export function getDefaultModel(provider: ModelProvider): string {
  return DEFAULT_MODELS[provider];
}

/**
 * Validates that the required API key is present for a provider
 *
 * @param provider - Model provider
 * @param env - Environment with API keys
 * @returns true if API key is present
 */
export function hasApiKey(provider: ModelProvider, env: Env): boolean {
  switch (provider) {
    case 'anthropic':
      return !!env.ANTHROPIC_API_KEY;
    case 'openai':
      return !!env.OPENAI_API_KEY;
    case 'google':
      return !!(env.GOOGLE_API_KEY || env.GEMINI_API_KEY);
    default:
      return false;
  }
}

/**
 * Gets a list of available providers based on configured API keys
 *
 * @param env - Environment with API keys
 * @returns Array of available provider names
 */
export function getAvailableProviders(env: Env): ModelProvider[] {
  const providers: ModelProvider[] = [];

  if (env.ANTHROPIC_API_KEY) providers.push('anthropic');
  if (env.OPENAI_API_KEY) providers.push('openai');
  if (env.GOOGLE_API_KEY || env.GEMINI_API_KEY) providers.push('google');

  return providers;
}
