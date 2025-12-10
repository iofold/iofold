export interface CostMetrics {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUSD: number;
  model: string;
}

export class CostTracker {
  // Claude pricing (Dec 2025) - Using gateway model names (no date suffix)
  private static CLAUDE_PRICING = {
    // Claude 4.5 series (gateway format)
    'anthropic/claude-sonnet-4-5': {
      input: 3.00 / 1_000_000,
      output: 15.00 / 1_000_000
    },
    'anthropic/claude-haiku-4-5': {
      input: 1.00 / 1_000_000,
      output: 5.00 / 1_000_000
    },
    // Claude Opus 4.5
    'anthropic/claude-opus-4-5': {
      input: 15.00 / 1_000_000,
      output: 75.00 / 1_000_000
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
