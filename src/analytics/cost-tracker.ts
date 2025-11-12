export interface CostMetrics {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUSD: number;
  model: string;
}

export class CostTracker {
  // Claude pricing (as of Nov 2025)
  private static CLAUDE_PRICING = {
    // Claude 4.5 series (latest)
    'claude-sonnet-4-5': {
      input: 3.00 / 1_000_000,
      output: 15.00 / 1_000_000
    },
    'claude-haiku-4-5': {
      input: 1.00 / 1_000_000,
      output: 5.00 / 1_000_000
    },
    // Claude 4 series
    'claude-opus-4-1-20250805': {
      input: 15.00 / 1_000_000,
      output: 75.00 / 1_000_000
    },
    'claude-sonnet-4': {
      input: 3.00 / 1_000_000,
      output: 15.00 / 1_000_000
    },
    'claude-opus-4': {
      input: 15.00 / 1_000_000,
      output: 75.00 / 1_000_000
    },
    // Claude 3.5 series (legacy)
    'claude-3-5-sonnet-20241022': {
      input: 3.00 / 1_000_000,
      output: 15.00 / 1_000_000
    },
    'claude-3-5-haiku-20241022': {
      input: 1.00 / 1_000_000,
      output: 5.00 / 1_000_000
    },
    // Claude 3 series (legacy)
    'claude-3-opus-20240229': {
      input: 15.00 / 1_000_000,
      output: 75.00 / 1_000_000
    },
    'claude-3-sonnet-20240229': {
      input: 3.00 / 1_000_000,
      output: 15.00 / 1_000_000
    },
    'claude-3-haiku-20240307': {
      input: 0.25 / 1_000_000,
      output: 1.25 / 1_000_000
    }
  };

  static calculateCost(metrics: {
    model: string;
    promptTokens: number;
    completionTokens: number;
  }): CostMetrics {
    const pricing = this.CLAUDE_PRICING[metrics.model as keyof typeof this.CLAUDE_PRICING];

    if (!pricing) {
      throw new Error(`Unknown model: ${metrics.model}`);
    }

    const inputCost = metrics.promptTokens * pricing.input;
    const outputCost = metrics.completionTokens * pricing.output;

    return {
      totalTokens: metrics.promptTokens + metrics.completionTokens,
      promptTokens: metrics.promptTokens,
      completionTokens: metrics.completionTokens,
      estimatedCostUSD: inputCost + outputCost,
      model: metrics.model
    };
  }

  static projectCostAtScale(costPerEval: number, evalsPerMonth: number): {
    monthly: number;
    annual: number;
  } {
    return {
      monthly: costPerEval * evalsPerMonth,
      annual: costPerEval * evalsPerMonth * 12
    };
  }
}
