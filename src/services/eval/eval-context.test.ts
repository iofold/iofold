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
      expect(ctx.get_cost_so_far()).toBeGreaterThan(0);
    });

    it('should use default model if not specified', async () => {
      await ctx.call_llm({
        prompt: 'Test prompt'
      });

      expect(ctx.get_cost_so_far()).toBeGreaterThan(0);
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
    it('should track cost accumulation', async () => {
      const initialCost = ctx.get_cost_so_far();
      expect(initialCost).toBe(0);

      await ctx.call_llm({ prompt: 'First call' });
      const afterFirstCall = ctx.get_cost_so_far();
      expect(afterFirstCall).toBeGreaterThan(0);

      await ctx.call_llm({ prompt: 'Second call' });
      const afterSecondCall = ctx.get_cost_so_far();
      expect(afterSecondCall).toBeGreaterThan(afterFirstCall);
    });

    it('should calculate remaining budget correctly', async () => {
      const maxBudget = 0.05;
      const remaining = ctx.get_remaining_budget();
      expect(remaining).toBe(maxBudget);

      await ctx.call_llm({ prompt: 'Test' });
      const remainingAfter = ctx.get_remaining_budget();
      expect(remainingAfter).toBeLessThan(maxBudget);
      expect(remainingAfter).toBeGreaterThanOrEqual(0);
    });

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

  describe('caching', () => {
    it('should cache LLM responses when cache_key provided', async () => {
      const cacheKey = 'test-cache-key';

      expect(ctx.has_cache(cacheKey)).toBe(false);
      expect(ctx.get_cache(cacheKey)).toBeNull();

      const result1 = await ctx.call_llm({
        prompt: 'Test prompt',
        cache_key: cacheKey
      });

      expect(ctx.has_cache(cacheKey)).toBe(true);
      expect(ctx.get_cache(cacheKey)).toBe(result1);
    });

    it('should return cached response on second call', async () => {
      const cacheKey = 'test-cache-key';

      // First call
      const result1 = await ctx.call_llm({
        prompt: 'Test prompt',
        cache_key: cacheKey
      });

      const costAfterFirst = ctx.get_cost_so_far();

      // Second call with same cache_key should use cache
      const result2 = await ctx.call_llm({
        prompt: 'Test prompt',
        cache_key: cacheKey
      });

      expect(result2).toBe(result1);
      expect(ctx.get_cost_so_far()).toBe(costAfterFirst); // No additional cost
    });

    it('should allow manual cache operations', () => {
      ctx.set_cache('key1', 'value1');
      expect(ctx.has_cache('key1')).toBe(true);
      expect(ctx.get_cache('key1')).toBe('value1');

      ctx.set_cache('key2', 'value2');
      expect(ctx.has_cache('key2')).toBe(true);
      expect(ctx.get_cache('key2')).toBe('value2');
    });
  });

  describe('statistics', () => {
    it('should track LLM call statistics', async () => {
      const stats = (ctx as EvalContextImpl).getStats();
      expect(stats.llm_calls).toBe(0);
      expect(stats.cache_hits).toBe(0);
      expect(stats.cache_misses).toBe(0);

      await ctx.call_llm({ prompt: 'Test 1' });
      const stats1 = (ctx as EvalContextImpl).getStats();
      expect(stats1.llm_calls).toBe(1);
      expect(stats1.cache_misses).toBe(1);

      await ctx.call_llm({ prompt: 'Test 2', cache_key: 'key1' });
      const stats2 = (ctx as EvalContextImpl).getStats();
      expect(stats2.llm_calls).toBe(2);
      expect(stats2.cache_misses).toBe(2);

      // Use cache
      await ctx.call_llm({ prompt: 'Test 2', cache_key: 'key1' });
      const stats3 = (ctx as EvalContextImpl).getStats();
      expect(stats3.llm_calls).toBe(2); // Should not increment
      expect(stats3.cache_hits).toBe(1);
    });
  });

  describe('configuration', () => {
    it('should use default config when not provided', () => {
      const defaultCtx = new EvalContextImpl({
        CF_ACCOUNT_ID: 'test-account',
        CF_AI_GATEWAY_ID: 'test-gateway',
        CF_AI_GATEWAY_TOKEN: 'test-token'
      });
      expect(defaultCtx.get_remaining_budget()).toBe(0.05); // Default budget
    });

    it('should allow custom config', () => {
      const customCtx = new EvalContextImpl({
        CF_ACCOUNT_ID: 'test-account',
        CF_AI_GATEWAY_ID: 'test-gateway',
        CF_AI_GATEWAY_TOKEN: 'test-token'
      }, {
        max_budget_usd: 0.10,
        timeout_ms: 60000
      });
      expect(customCtx.get_remaining_budget()).toBe(0.10);
    });

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
    expect(serialized).toHaveProperty('state');
    expect(serialized.methods).toHaveProperty('call_llm');
    expect(serialized.methods).toHaveProperty('get_cost_so_far');
    expect(serialized.state).toHaveProperty('cost_so_far');
    expect(serialized.state).toHaveProperty('remaining_budget');
  });
});
