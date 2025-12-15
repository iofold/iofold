/**
 * EvalContextImpl - Sandboxed context for eval function execution
 * Provides controlled access to LLM calls with cost tracking
 *
 * Uses OpenAI SDK format for all providers via Cloudflare AI Gateway.
 */

import OpenAI from 'openai';
import type {
  EvalContext,
  LLMCallOptions,
  EvalContextConfig
} from '../../types/eval-context';
import { createGatewayClient, getModelConfig, DEFAULT_MODEL, type GatewayEnv } from '../../ai/gateway';

/**
 * Safe imports allowed in eval execution
 * These are the Python standard library modules that can be safely imported
 */
export const SAFE_EVAL_IMPORTS = ['json', 're', 'typing', 'math', 'datetime', 'difflib'];

// Model pricing is now managed in src/ai/gateway.ts via MODELS registry

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: EvalContextConfig = {
  max_budget_usd: 0.05,
  timeout_ms: 30000,
  additional_imports: []
};

/**
 * Statistics for eval execution
 */
export interface EvalContextStats {
  llm_calls: number;
  total_cost_usd: number;
}

/**
 * Implementation of EvalContext interface
 * Provides sandboxed execution environment with LLM access and cost tracking
 */
export class EvalContextImpl implements EvalContext {
  private client: OpenAI;
  private config: EvalContextConfig;
  private costSoFar: number = 0;
  private stats: EvalContextStats = {
    llm_calls: 0,
    total_cost_usd: 0
  };

  /**
   * Create a new eval context
   * @param gatewayConfig - AI Gateway configuration (required)
   * @param config - Optional configuration overrides
   */
  constructor(
    gatewayConfig: GatewayEnv,
    config?: Partial<EvalContextConfig>
  ) {
    this.client = createGatewayClient(gatewayConfig);
    this.config = {
      ...DEFAULT_CONFIG,
      ...config
    };
  }

  /**
   * Call an LLM for semantic evaluation
   * @param options - LLM call options (prompt, model, temperature, etc.)
   * @returns The LLM response text
   * @throws Error if budget is exceeded or call fails
   */
  async call_llm(options: LLMCallOptions): Promise<string> {
    // Default options - models are already provider-prefixed
    const model = options.model || DEFAULT_MODEL;
    const temperature = options.temperature !== undefined ? options.temperature : 0.0;
    const max_tokens = options.max_tokens || 500;

    // Check if we support this model
    const modelConfig = getModelConfig(model);
    if (!modelConfig) {
      throw new Error(`Unsupported model: ${model}. Use provider-prefixed model names like 'anthropic/claude-sonnet-4-5-20250929'.`);
    }

    try {
      // Make LLM call using OpenAI SDK format (AI Gateway translates to provider format)
      const response = await this.client.chat.completions.create({
        model,
        max_tokens,
        temperature,
        messages: [{
          role: 'user',
          content: options.prompt
        }]
      });

      // Extract text from response (OpenAI format)
      const choice = response.choices[0];
      if (!choice?.message?.content) {
        throw new Error('No content in LLM response');
      }
      const responseText = choice.message.content;

      const inputTokens = response.usage?.prompt_tokens || 0;
      const outputTokens = response.usage?.completion_tokens || 0;

      // Calculate cost using model config from gateway
      const inputCost = (inputTokens / 1_000_000) * modelConfig.inputCostPer1M;
      const outputCost = (outputTokens / 1_000_000) * modelConfig.outputCostPer1M;
      const callCost = inputCost + outputCost;

      // Check budget
      if (this.costSoFar + callCost > this.config.max_budget_usd) {
        throw new Error(
          `Budget exceeded: would cost $${(this.costSoFar + callCost).toFixed(6)} ` +
          `(budget: $${this.config.max_budget_usd.toFixed(6)})`
        );
      }

      // Update cost tracking
      this.costSoFar += callCost;
      this.stats.llm_calls++;
      this.stats.total_cost_usd = this.costSoFar;

      return responseText;
    } catch (error: any) {
      // Re-throw budget errors as-is
      if (error.message?.includes('Budget exceeded')) {
        throw error;
      }

      // Wrap other errors
      throw new Error(`LLM call failed: ${error.message || String(error)}`);
    }
  }

  /**
   * Get execution statistics
   * @returns Statistics object with call counts and costs
   */
  getStats(): EvalContextStats {
    return { ...this.stats };
  }

  /**
   * Get allowed imports for eval execution
   * @returns Array of allowed Python module names
   */
  getAllowedImports(): string[] {
    return [...SAFE_EVAL_IMPORTS, ...(this.config.additional_imports || [])];
  }
}

/**
 * Serialize EvalContext for Python eval execution
 * Creates a Python-compatible representation of the context
 *
 * Note: This is a helper for future Python integration.
 * Python evals will receive a serialized context object with access to:
 * - call_llm function (async)
 *
 * @param ctx - EvalContext instance
 * @returns Serializable object for Python
 */
export function serializeEvalContextForPython(ctx: EvalContext): Record<string, any> {
  return {
    // These would be exposed as Python functions in the sandbox
    methods: {
      call_llm: 'async function'
    }
  };
}
