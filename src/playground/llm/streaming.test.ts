import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getChatModel, DEFAULT_MODELS, getDefaultModel, type ChatModelConfig } from './streaming';
import type { AIProvider } from '../../ai/gateway';

// Mock ChatOpenAI to capture constructor arguments
const mockChatOpenAI = vi.fn();
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class ChatOpenAI {
    constructor(config: any) {
      mockChatOpenAI(config);
      Object.assign(this, config);
    }
  }
}));

// Mock gateway module
vi.mock('../../ai/gateway', async () => {
  const actual = await vi.importActual('../../ai/gateway');
  return {
    ...actual,
    MODELS: {
      'anthropic/claude-sonnet-4-5': { id: 'anthropic/claude-sonnet-4-5', provider: 'anthropic', label: 'Claude Sonnet 4.5' },
      'openai/gpt-5-mini': { id: 'openai/gpt-5-mini', provider: 'openai', label: 'GPT-5 Mini' },
      'openai/gpt-5-nano': { id: 'openai/gpt-5-nano', provider: 'openai', label: 'GPT-5 Nano' },
      'google-vertex-ai/google/gemini-2.5-flash': { id: 'google-vertex-ai/google/gemini-2.5-flash', provider: 'google', label: 'Gemini 2.5 Flash' },
    },
  };
});

// Mock langsmith tracer
vi.mock('../../ai/langsmith-tracer', () => ({
  getLangChainEnvVars: () => ({}),
  isLangSmithEnabled: () => false,
}));

describe('Streaming Module', () => {
  const mockEnv = {
    CF_ACCOUNT_ID: 'test-account',
    CF_AI_GATEWAY_ID: 'test-gateway',
    CF_AI_GATEWAY_TOKEN: 'test-token',
  };

  beforeEach(() => {
    mockChatOpenAI.mockClear();
  });

  describe('DEFAULT_MODELS', () => {
    it('should have Gemini 2.5 Flash as default for Google provider', () => {
      expect(DEFAULT_MODELS.google).toBe('google-vertex-ai/google/gemini-2.5-flash');
    });

    it('should have Claude Sonnet 4.5 as default for Anthropic provider', () => {
      expect(DEFAULT_MODELS.anthropic).toBe('anthropic/claude-sonnet-4-5');
    });

    it('should have GPT-5 Nano as default for OpenAI provider', () => {
      expect(DEFAULT_MODELS.openai).toBe('openai/gpt-5-nano');
    });

    it('should have all four providers configured', () => {
      expect(DEFAULT_MODELS).toHaveProperty('anthropic');
      expect(DEFAULT_MODELS).toHaveProperty('openai');
      expect(DEFAULT_MODELS).toHaveProperty('google');
      expect(DEFAULT_MODELS).toHaveProperty('workers-ai');
    });
  });

  describe('getDefaultModel', () => {
    it('should return correct default for each provider', () => {
      expect(getDefaultModel('anthropic')).toBe('anthropic/claude-sonnet-4-5');
      expect(getDefaultModel('openai')).toBe('openai/gpt-5-nano');
      expect(getDefaultModel('google')).toBe('google-vertex-ai/google/gemini-2.5-flash');
    });
  });

  describe('getChatModel - Temperature', () => {
    it('should hardcode temperature to 1 for all models', () => {
      getChatModel({
        provider: 'anthropic',
        modelId: 'anthropic/claude-sonnet-4-5',
        env: mockEnv,
      });

      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 1,
        })
      );
    });

    it('should hardcode temperature to 1 for OpenAI reasoning models', () => {
      getChatModel({
        provider: 'openai',
        modelId: 'openai/gpt-5-mini',
        env: mockEnv,
      });

      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 1,
        })
      );
    });

    it('should hardcode temperature to 1 for Google models', () => {
      getChatModel({
        provider: 'google',
        modelId: 'google-vertex-ai/google/gemini-2.5-flash',
        env: mockEnv,
      });

      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 1,
        })
      );
    });
  });

  describe('getChatModel - OpenAI Reasoning Models Token Handling', () => {
    it('should use maxTokens=-1 and modelKwargs.max_completion_tokens for gpt-5 models', () => {
      getChatModel({
        provider: 'openai',
        modelId: 'openai/gpt-5-mini',
        env: mockEnv,
        maxTokens: 4096,
      });

      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTokens: -1,
          modelKwargs: {
            max_completion_tokens: 4096,
          },
        })
      );
    });

    it('should use maxTokens=-1 and modelKwargs.max_completion_tokens for gpt-5-nano', () => {
      getChatModel({
        provider: 'openai',
        modelId: 'openai/gpt-5-nano',
        env: mockEnv,
        maxTokens: 2048,
      });

      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTokens: -1,
          modelKwargs: {
            max_completion_tokens: 2048,
          },
        })
      );
    });

  });

  describe('getChatModel - Non-Reasoning Models Token Handling', () => {
    it('should use standard maxTokens for Anthropic models', () => {
      getChatModel({
        provider: 'anthropic',
        modelId: 'anthropic/claude-sonnet-4-5',
        env: mockEnv,
        maxTokens: 4096,
      });

      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTokens: 4096,
        })
      );
      // Should NOT have modelKwargs with max_completion_tokens
      expect(mockChatOpenAI).not.toHaveBeenCalledWith(
        expect.objectContaining({
          modelKwargs: expect.anything(),
        })
      );
    });

    it('should use standard maxTokens for Google models', () => {
      getChatModel({
        provider: 'google',
        modelId: 'google-vertex-ai/google/gemini-2.5-flash',
        env: mockEnv,
        maxTokens: 4096,
      });

      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTokens: 4096,
        })
      );
    });
  });

  describe('getChatModel - Gateway Configuration', () => {
    it('should configure baseURL to use /compat endpoint', () => {
      getChatModel({
        provider: 'anthropic',
        modelId: 'anthropic/claude-sonnet-4-5',
        env: mockEnv,
      });

      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: {
            baseURL: 'https://gateway.ai.cloudflare.com/v1/test-account/test-gateway/compat',
          },
        })
      );
    });

    it('should use CF_AI_GATEWAY_TOKEN as apiKey', () => {
      getChatModel({
        provider: 'anthropic',
        modelId: 'anthropic/claude-sonnet-4-5',
        env: mockEnv,
      });

      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          openAIApiKey: 'test-token',
        })
      );
    });

    it('should throw error if CF_ACCOUNT_ID is missing', () => {
      expect(() => {
        getChatModel({
          provider: 'anthropic',
          modelId: 'anthropic/claude-sonnet-4-5',
          env: {
            CF_AI_GATEWAY_ID: 'test-gateway',
            CF_AI_GATEWAY_TOKEN: 'test-token',
          },
        });
      }).toThrow('Cloudflare AI Gateway not configured');
    });

    it('should throw error if CF_AI_GATEWAY_TOKEN is missing', () => {
      expect(() => {
        getChatModel({
          provider: 'anthropic',
          modelId: 'anthropic/claude-sonnet-4-5',
          env: {
            CF_ACCOUNT_ID: 'test-account',
            CF_AI_GATEWAY_ID: 'test-gateway',
          },
        });
      }).toThrow('Cloudflare AI Gateway token required');
    });
  });

  describe('getChatModel - Model ID Prefix Handling', () => {
    it('should add provider prefix if not already present', () => {
      getChatModel({
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-5',
        env: mockEnv,
      });

      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'anthropic/claude-sonnet-4-5',
        })
      );
    });

    it('should preserve full model ID if already prefixed', () => {
      getChatModel({
        provider: 'google',
        modelId: 'google-vertex-ai/google/gemini-2.5-flash',
        env: mockEnv,
      });

      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'google-vertex-ai/google/gemini-2.5-flash',
        })
      );
    });
  });

  describe('getChatModel - Default maxTokens', () => {
    it('should default to 4096 maxTokens if not specified', () => {
      getChatModel({
        provider: 'anthropic',
        modelId: 'anthropic/claude-sonnet-4-5',
        env: mockEnv,
      });

      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTokens: 4096,
        })
      );
    });

    it('should default to 4096 for reasoning models via modelKwargs', () => {
      getChatModel({
        provider: 'openai',
        modelId: 'openai/gpt-5-mini',
        env: mockEnv,
      });

      expect(mockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          modelKwargs: {
            max_completion_tokens: 4096,
          },
        })
      );
    });
  });
});

describe('isOpenAIReasoningModel detection', () => {
  // We can't directly test the private function, but we can verify behavior
  // through getChatModel's parameter choices

  const mockEnv = {
    CF_ACCOUNT_ID: 'test-account',
    CF_AI_GATEWAY_ID: 'test-gateway',
    CF_AI_GATEWAY_TOKEN: 'test-token',
  };

  beforeEach(() => {
    mockChatOpenAI.mockClear();
  });

  describe('should detect reasoning models with provider prefix', () => {
    const reasoningModels = [
      'openai/gpt-5-mini',
      'openai/gpt-5-nano',
      'openai/gpt-5-turbo',
    ];

    reasoningModels.forEach((modelId) => {
      it(`should detect ${modelId} as reasoning model`, () => {
        getChatModel({
          provider: 'openai',
          modelId,
          env: mockEnv,
        });

        expect(mockChatOpenAI).toHaveBeenCalledWith(
          expect.objectContaining({
            maxTokens: -1,
            modelKwargs: expect.objectContaining({
              max_completion_tokens: expect.any(Number),
            }),
          })
        );
      });
    });
  });

  describe('should NOT detect non-reasoning models', () => {
    const nonReasoningModels = [
      { provider: 'anthropic' as const, modelId: 'anthropic/claude-sonnet-4-5' },
      { provider: 'anthropic' as const, modelId: 'anthropic/claude-haiku-4-5' },
      { provider: 'google' as const, modelId: 'google-vertex-ai/google/gemini-2.5-flash' },
      { provider: 'google' as const, modelId: 'google-vertex-ai/google/gemini-2.5-pro' },
    ];

    nonReasoningModels.forEach(({ provider, modelId }) => {
      it(`should NOT detect ${modelId} as reasoning model`, () => {
        getChatModel({
          provider,
          modelId,
          env: mockEnv,
        });

        // Non-reasoning models use standard maxTokens, not modelKwargs
        expect(mockChatOpenAI).toHaveBeenCalledWith(
          expect.objectContaining({
            maxTokens: 4096,
          })
        );
        expect(mockChatOpenAI).not.toHaveBeenCalledWith(
          expect.objectContaining({
            maxTokens: -1,
          })
        );
      });
    });
  });
});
