export interface CostMetrics {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUSD: number;
  model: string;
}

export class CostTracker {
  // Claude pricing (as of Nov 2024)
  private static CLAUDE_PRICING = {
    'claude-3-5-sonnet-20241022': {
      input: 3.00 / 1_000_000,  // $3 per million input tokens
      output: 15.00 / 1_000_000  // $15 per million output tokens
    },
    'claude-3-opus-20240229': {
      input: 15.00 / 1_000_000,
      output: 75.00 / 1_000_000
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
