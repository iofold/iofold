import { describe, it, expect } from 'vitest';
import { CostTracker } from './cost-tracker';

describe('CostTracker', () => {
  describe('calculateCost', () => {
    it('should calculate cost for Claude 3.5 Sonnet correctly', () => {
      const result = CostTracker.calculateCost({
        model: 'claude-3-5-sonnet-20241022',
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
      expect(result.model).toBe('claude-3-5-sonnet-20241022');
    });

    it('should calculate cost for Claude 3 Opus correctly', () => {
      const result = CostTracker.calculateCost({
        model: 'claude-3-opus-20240229',
        promptTokens: 1000,
        completionTokens: 500
      });

      // Input: 1000 tokens * $15/million = $0.015
      // Output: 500 tokens * $75/million = $0.0375
      // Total: $0.0525
      expect(result.estimatedCostUSD).toBeCloseTo(0.0525, 4);
    });

    it('should calculate cost for Claude 3 Haiku correctly', () => {
      const result = CostTracker.calculateCost({
        model: 'claude-3-haiku-20240307',
        promptTokens: 1000,
        completionTokens: 500
      });

      // Input: 1000 tokens * $0.25/million = $0.00025
      // Output: 500 tokens * $1.25/million = $0.000625
      // Total: $0.000875
      expect(result.estimatedCostUSD).toBeCloseTo(0.000875, 6);
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
