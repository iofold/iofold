import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getModel, isValidModelOption, MODEL_OPTIONS, type ModelProvider } from './index';

// Mock the LangChain providers
vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: class ChatAnthropic {
    constructor(public config: { apiKey: string; model: string }) {}
  }
}));

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class ChatOpenAI {
    constructor(public config: { apiKey: string; model: string }) {}
  }
}));

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class ChatGoogleGenerativeAI {
    constructor(public config: { apiKey: string; model: string }) {}
  }
}));

describe('Model Configuration', () => {
  describe('MODEL_OPTIONS', () => {
    it('should have all three providers', () => {
      expect(MODEL_OPTIONS).toHaveLength(3);

      const providers = MODEL_OPTIONS.map(opt => opt.provider);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
      expect(providers).toContain('google');
    });

    it('should have Claude Sonnet 4.5', () => {
      const claude = MODEL_OPTIONS.find(opt => opt.provider === 'anthropic');
      expect(claude).toBeDefined();
      expect(claude?.modelId).toBe('claude-sonnet-4-5-20250929');
      expect(claude?.label).toBe('Claude Sonnet 4.5');
    });

    it('should have GPT-4o', () => {
      const gpt = MODEL_OPTIONS.find(opt => opt.provider === 'openai');
      expect(gpt).toBeDefined();
      expect(gpt?.modelId).toBe('gpt-4o');
      expect(gpt?.label).toBe('GPT-4o');
    });

    it('should have Gemini 2.5 Pro', () => {
      const gemini = MODEL_OPTIONS.find(opt => opt.provider === 'google');
      expect(gemini).toBeDefined();
      expect(gemini?.modelId).toBe('gemini-2.5-pro');
      expect(gemini?.label).toBe('Gemini 2.5 Pro');
    });
  });

  describe('isValidModelOption', () => {
    it('should return true for valid model options', () => {
      expect(isValidModelOption('anthropic', 'claude-sonnet-4-5-20250929')).toBe(true);
      expect(isValidModelOption('openai', 'gpt-4o')).toBe(true);
      expect(isValidModelOption('google', 'gemini-2.5-pro')).toBe(true);
    });

    it('should return false for invalid model options', () => {
      expect(isValidModelOption('anthropic', 'gpt-4')).toBe(false);
      expect(isValidModelOption('openai', 'claude-3')).toBe(false);
      expect(isValidModelOption('google', 'gpt-4o')).toBe(false);
    });

    it('should return false for unknown providers', () => {
      expect(isValidModelOption('unknown' as ModelProvider, 'some-model')).toBe(false);
    });
  });

  describe('getModel', () => {
    describe('Anthropic', () => {
      it('should create ChatAnthropic model with valid API key', async () => {
        const env = { ANTHROPIC_API_KEY: 'test-key-anthropic' };
        const model = await getModel('anthropic', 'claude-sonnet-4-5-20250929', env);

        expect(model).toBeDefined();
        expect((model as any).config.apiKey).toBe('test-key-anthropic');
        expect((model as any).config.model).toBe('claude-sonnet-4-5-20250929');
      });

      it('should throw error when API key is missing', async () => {
        const env = {};
        await expect(
          getModel('anthropic', 'claude-sonnet-4-5-20250929', env)
        ).rejects.toThrow('ANTHROPIC_API_KEY not configured');
      });
    });

    describe('OpenAI', () => {
      it('should create ChatOpenAI model with valid API key', async () => {
        const env = { OPENAI_API_KEY: 'test-key-openai' };
        const model = await getModel('openai', 'gpt-4o', env);

        expect(model).toBeDefined();
        expect((model as any).config.apiKey).toBe('test-key-openai');
        expect((model as any).config.model).toBe('gpt-4o');
      });

      it('should throw error when API key is missing', async () => {
        const env = {};
        await expect(
          getModel('openai', 'gpt-4o', env)
        ).rejects.toThrow('OPENAI_API_KEY not configured');
      });
    });

    describe('Google', () => {
      it('should create ChatGoogleGenerativeAI model with valid API key', async () => {
        const env = { GOOGLE_API_KEY: 'test-key-google' };
        const model = await getModel('google', 'gemini-2.5-pro', env);

        expect(model).toBeDefined();
        expect((model as any).config.apiKey).toBe('test-key-google');
        expect((model as any).config.model).toBe('gemini-2.5-pro');
      });

      it('should throw error when API key is missing', async () => {
        const env = {};
        await expect(
          getModel('google', 'gemini-2.5-pro', env)
        ).rejects.toThrow('GOOGLE_API_KEY not configured');
      });
    });

    describe('Error handling', () => {
      it('should throw error for unsupported provider', async () => {
        const env = { ANTHROPIC_API_KEY: 'test-key' };
        await expect(
          getModel('unsupported' as ModelProvider, 'some-model', env)
        ).rejects.toThrow('Unsupported model provider: unsupported');
      });
    });

    describe('Custom model IDs', () => {
      it('should support custom model IDs for any provider', async () => {
        const env = { ANTHROPIC_API_KEY: 'test-key' };
        const model = await getModel('anthropic', 'claude-opus-4', env);

        expect(model).toBeDefined();
        expect((model as any).config.model).toBe('claude-opus-4');
      });
    });
  });
});
