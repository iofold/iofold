import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isValidModelOption, MODEL_OPTIONS, type ModelProvider } from './index';

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
    it('should have all three providers with multiple models', () => {
      expect(MODEL_OPTIONS).toHaveLength(6);

      const providers = MODEL_OPTIONS.map(opt => opt.provider);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
      expect(providers).toContain('google');
    });

    it('should have Claude Sonnet 4.5 and Haiku 4.5', () => {
      const claudeModels = MODEL_OPTIONS.filter(opt => opt.provider === 'anthropic');
      expect(claudeModels).toHaveLength(2);

      const sonnet = claudeModels.find(m => m.modelId === 'claude-sonnet-4-5-20250929');
      expect(sonnet).toBeDefined();
      expect(sonnet?.label).toBe('Claude Sonnet 4.5');

      const haiku = claudeModels.find(m => m.modelId === 'claude-haiku-4-5-20250929');
      expect(haiku).toBeDefined();
      expect(haiku?.label).toBe('Claude Haiku 4.5');
    });

    it('should have GPT-5.1 Mini and Nano', () => {
      const gptModels = MODEL_OPTIONS.filter(opt => opt.provider === 'openai');
      expect(gptModels).toHaveLength(2);

      const mini = gptModels.find(m => m.modelId === 'gpt-5.1-mini');
      expect(mini).toBeDefined();
      expect(mini?.label).toBe('GPT-5.1 Mini');
    });

    it('should have Gemini 2.5 Flash and Pro', () => {
      const geminiModels = MODEL_OPTIONS.filter(opt => opt.provider === 'google');
      expect(geminiModels).toHaveLength(2);

      const flash = geminiModels.find(m => m.modelId === 'gemini-2.5-flash');
      expect(flash).toBeDefined();
      expect(flash?.label).toBe('Gemini 2.5 Flash');
    });
  });

  describe('isValidModelOption', () => {
    it('should return true for valid model options', () => {
      expect(isValidModelOption('anthropic/claude-sonnet-4-5')).toBe(true);
      expect(isValidModelOption('openai/gpt-5.1-mini')).toBe(true);
      expect(isValidModelOption('google-vertex-ai/google/gemini-2.5-flash')).toBe(true);
    });

    it('should return false for invalid model options', () => {
      expect(isValidModelOption('anthropic/gpt-4')).toBe(false);
      expect(isValidModelOption('openai/claude-3')).toBe(false);
      expect(isValidModelOption('google/gpt-4o')).toBe(false);
    });

    it('should return false for unknown providers', () => {
      expect(isValidModelOption('unknown/some-model')).toBe(false);
    });
  });

});
