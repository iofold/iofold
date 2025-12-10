import { describe, it, expect } from 'vitest';
import { CostTracker } from './cost-tracker';

describe('CostTracker', () => {
  describe('calculateCost', () => {
    it('should calculate cost for Claude Sonnet 4.5 correctly', () => {
      const result = CostTracker.calculateCost({
        model: 'claude-sonnet-4-5-20250929',
        promptTokens: 1000,
        completionTokens: 500
      });

      // Input: 1000 tokens * $3/million = $0.003
      // Output: 500 tokens * $15/million = $0.0075
      // Total: $0.0105
      expect(result.totalTokens).toBe(1500);
      expect(result.promptTokens).toBe(1000);
      expect(result.completionTokens).toBe(500);
      expect(result.estimatedCostUSD).toBeCloseTo(0.0105, 4);
      expect(result.model).toBe('claude-sonnet-4-5-20250929');
    });

    it('should calculate cost for Claude Opus 4.5 correctly', () => {
      const result = CostTracker.calculateCost({
        model: 'claude-opus-4-5-20251101',
        promptTokens: 1000,
        completionTokens: 500
      });

      // Input: 1000 tokens * $15/million = $0.015
      // Output: 500 tokens * $75/million = $0.0375
      // Total: $0.0525
      expect(result.estimatedCostUSD).toBeCloseTo(0.0525, 4);
    });

    it('should calculate cost for Claude Haiku 4.5 correctly', () => {
      const result = CostTracker.calculateCost({
        model: 'claude-haiku-4-5-20250929',
        promptTokens: 1000,
        completionTokens: 500
      });

      // Input: 1000 tokens * $1/million = $0.001
      // Output: 500 tokens * $5/million = $0.0025
      // Total: $0.0035
      expect(result.estimatedCostUSD).toBeCloseTo(0.0035, 4);
    });

    it('should throw error for unknown model', () => {
      expect(() => {
        CostTracker.calculateCost({
          model: 'unknown-model',
          promptTokens: 1000,
          completionTokens: 500
        });
      }).toThrow('Unknown model: unknown-model');
    });
  });

  describe('projectCostAtScale', () => {
    it('should project monthly and annual costs correctly', () => {
      const costPerEval = 0.01; // $0.01 per eval
      const evalsPerMonth = 100;

      const result = CostTracker.projectCostAtScale(costPerEval, evalsPerMonth);

      expect(result.monthly).toBe(1.0); // $1 per month
      expect(result.annual).toBe(12.0); // $12 per year
    });

    it('should handle small team scenario', () => {
      const costPerEval = 0.0105; // Typical cost from test above
      const result = CostTracker.projectCostAtScale(costPerEval, 10);

      expect(result.monthly).toBeCloseTo(0.105, 4);
      expect(result.annual).toBeCloseTo(1.26, 4);
    });

    it('should handle large team scenario', () => {
      const costPerEval = 0.0105;
      const result = CostTracker.projectCostAtScale(costPerEval, 200);

      expect(result.monthly).toBeCloseTo(2.1, 4);
      expect(result.annual).toBeCloseTo(25.2, 4);
    });
  });
});
