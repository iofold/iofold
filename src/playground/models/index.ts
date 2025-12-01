/**
 * Model configuration for Agents Playground
 * Provides unified interface for different LLM providers
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export type ModelProvider = 'anthropic' | 'openai' | 'google';

export interface ModelOption {
  provider: ModelProvider;
  modelId: string;
  label: string;
}

/**
 * Available model options for the playground
 * These use platform-managed API keys
 */
export const MODEL_OPTIONS: readonly ModelOption[] = [
  {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-5-20250929',
    label: 'Claude Sonnet 4.5'
  },
  {
    provider: 'openai',
    modelId: 'gpt-4o',
    label: 'GPT-4o'
  },
  {
    provider: 'google',
    modelId: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro'
  }
] as const;

export interface Env {
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
}

/**
 * Create a chat model instance based on provider and model ID
 * @param provider - The model provider (anthropic, openai, google)
 * @param modelId - The specific model identifier
 * @param env - Environment variables containing API keys
 * @returns Configured BaseChatModel instance
 * @throws Error if API key is missing for the provider
 */
export async function getModel(
  provider: ModelProvider,
  modelId: string,
  env: Env
): Promise<BaseChatModel> {
  switch (provider) {
    case 'anthropic': {
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not configured');
      }
      // Dynamic import to avoid loading all providers
      const { ChatAnthropic } = await import('@langchain/anthropic');
      return new ChatAnthropic({
        apiKey: env.ANTHROPIC_API_KEY,
        model: modelId
      });
    }

    case 'openai': {
      if (!env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY not configured');
      }
      const { ChatOpenAI } = await import('@langchain/openai');
      return new ChatOpenAI({
        apiKey: env.OPENAI_API_KEY,
        model: modelId
      });
    }

    case 'google': {
      if (!env.GOOGLE_API_KEY) {
        throw new Error('GOOGLE_API_KEY not configured');
      }
      const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
      return new ChatGoogleGenerativeAI({
        apiKey: env.GOOGLE_API_KEY,
        model: modelId
      });
    }

    default:
      throw new Error(`Unsupported model provider: ${provider}`);
  }
}

/**
 * Validate if a model option exists in the available options
 */
export function isValidModelOption(provider: ModelProvider, modelId: string): boolean {
  return MODEL_OPTIONS.some(
    option => option.provider === provider && option.modelId === modelId
  );
}
