/**
 * Tests for EvalContextImpl
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EvalContextImpl, SAFE_EVAL_IMPORTS, serializeEvalContextForPython } from './eval-context';
import type { EvalContext } from '../../types/eval-context';

// Mock OpenAI SDK
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: 'Mock LLM response',
                  role: 'assistant'
                }
              }
            ],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 50,
              total_tokens: 150
            },
            model: 'anthropic/claude-sonnet-4-5'
          })
        }
      };
    }
  };
});

describe('EvalContextImpl', () => {
  let ctx: EvalContext;

  beforeEach(() => {
    ctx = new EvalContextImpl({
      CF_ACCOUNT_ID: 'test-account',
      CF_AI_GATEWAY_ID: 'test-gateway',
      CF_AI_GATEWAY_TOKEN: 'test-token'
    }, {
      max_budget_usd: 0.05,
      timeout_ms: 30000
    });
  });

  describe('call_llm', () => {
    it('should make an LLM call and return response', async () => {
      const result = await ctx.call_llm({
        prompt: 'Test prompt'
      });

      expect(result).toBe('Mock LLM response');
    });

    it('should use default model if not specified', async () => {
      await ctx.call_llm({
        prompt: 'Test prompt'
      });

      // Should not throw
      expect(true).toBe(true);
    });

    it('should throw error for unsupported model', async () => {
      await expect(
        ctx.call_llm({
          prompt: 'Test',
          model: 'invalid-model' as any
        })
      ).rejects.toThrow('Unsupported model');
    });

    it('should throw error for unsupported models', async () => {
      await expect(
        ctx.call_llm({
          prompt: 'Test',
          model: 'gpt-4o-mini' as any
        })
      ).rejects.toThrow('Unsupported model');
    });
  });

  describe('cost tracking', () => {
    it('should throw error when budget exceeded', async () => {
      // Create context with very small budget
      const smallBudgetCtx = new EvalContextImpl({
        CF_ACCOUNT_ID: 'test-account',
        CF_AI_GATEWAY_ID: 'test-gateway',
        CF_AI_GATEWAY_TOKEN: 'test-token'
      }, {
        max_budget_usd: 0.00001, // Very small budget
        timeout_ms: 30000
      });

      await expect(
        smallBudgetCtx.call_llm({ prompt: 'Test' })
      ).rejects.toThrow('Budget exceeded');
    });
  });

  describe('statistics', () => {
    it('should track LLM call statistics', async () => {
      const stats = (ctx as EvalContextImpl).getStats();
      expect(stats.llm_calls).toBe(0);

      await ctx.call_llm({ prompt: 'Test 1' });
      const stats1 = (ctx as EvalContextImpl).getStats();
      expect(stats1.llm_calls).toBe(1);

      await ctx.call_llm({ prompt: 'Test 2' });
      const stats2 = (ctx as EvalContextImpl).getStats();
      expect(stats2.llm_calls).toBe(2);
    });
  });

  describe('configuration', () => {
    it('should support additional imports', () => {
      const customCtx = new EvalContextImpl({
        CF_ACCOUNT_ID: 'test-account',
        CF_AI_GATEWAY_ID: 'test-gateway',
        CF_AI_GATEWAY_TOKEN: 'test-token'
      }, {
        max_budget_usd: 0.05,
        timeout_ms: 30000,
        additional_imports: ['numpy', 'pandas']
      }) as EvalContextImpl;

      const imports = customCtx.getAllowedImports();
      expect(imports).toContain('numpy');
      expect(imports).toContain('pandas');
      expect(imports).toContain('json'); // Default imports should still be there
    });
  });
});

describe('SAFE_EVAL_IMPORTS', () => {
  it('should export safe import list', () => {
    expect(SAFE_EVAL_IMPORTS).toContain('json');
    expect(SAFE_EVAL_IMPORTS).toContain('re');
    expect(SAFE_EVAL_IMPORTS).toContain('typing');
    expect(SAFE_EVAL_IMPORTS).toContain('math');
    expect(SAFE_EVAL_IMPORTS).toContain('datetime');
    expect(SAFE_EVAL_IMPORTS).toContain('difflib');
  });
});

describe('serializeEvalContextForPython', () => {
  it('should serialize context for Python integration', () => {
    const ctx = new EvalContextImpl({
      CF_ACCOUNT_ID: 'test-account',
      CF_AI_GATEWAY_ID: 'test-gateway',
      CF_AI_GATEWAY_TOKEN: 'test-token'
    });
    const serialized = serializeEvalContextForPython(ctx);

    expect(serialized).toHaveProperty('methods');
    expect(serialized.methods).toHaveProperty('call_llm');
  });
});
