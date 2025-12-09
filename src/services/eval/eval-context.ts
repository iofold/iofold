/**
 * EvalContextImpl - Sandboxed context for eval function execution
 * Provides controlled access to LLM calls with cost tracking and caching
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  EvalContext,
  LLMCallOptions,
  EvalContextConfig
} from '../../types/eval-context';

/**
 * Safe imports allowed in eval execution
 * These are the Python standard library modules that can be safely imported
 */
export const SAFE_EVAL_IMPORTS = ['json', 're', 'typing', 'math', 'datetime', 'difflib'];

/**
 * Model pricing per million tokens (USD)
 */
const MODEL_PRICING = {
  'claude-sonnet-4-5-20250929': {
    input: 3.00,
    output: 15.00
  },
  'claude-haiku-4-5-20250514': {
    input: 0.25,
    output: 1.25
  },
  'gpt-4o-mini': {
    input: 0.15,
    output: 0.60
  }
} as const;

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
  cache_hits: number;
  cache_misses: number;
}

/**
 * Implementation of EvalContext interface
 * Provides sandboxed execution environment with LLM access, cost tracking, and caching
 */
export class EvalContextImpl implements EvalContext {
  private anthropicClient: Anthropic;
  private config: EvalContextConfig;
  private costSoFar: number = 0;
  private cache: Map<string, string> = new Map();
  private stats: EvalContextStats = {
    llm_calls: 0,
    total_cost_usd: 0,
    cache_hits: 0,
    cache_misses: 0
  };

  /**
   * Create a new eval context
   * @param anthropicApiKey - Anthropic API key for LLM calls
   * @param config - Optional configuration overrides
   */
  constructor(anthropicApiKey: string, config?: Partial<EvalContextConfig>) {
    this.anthropicClient = new Anthropic({
      apiKey: anthropicApiKey
    });
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
    // Check cache if cache_key provided
    if (options.cache_key && this.has_cache(options.cache_key)) {
      this.stats.cache_hits++;
      return this.get_cache(options.cache_key)!;
    }

    this.stats.cache_misses++;

    // Default options
    const model = options.model || 'claude-sonnet-4-5-20250929';
    const temperature = options.temperature !== undefined ? options.temperature : 0.0;
    const max_tokens = options.max_tokens || 500;

    // Check if we support this model
    if (!MODEL_PRICING[model]) {
      throw new Error(`Unsupported model: ${model}. Supported models: ${Object.keys(MODEL_PRICING).join(', ')}`);
    }

    try {
      // Make LLM call based on model provider
      let responseText: string;
      let inputTokens: number;
      let outputTokens: number;

      if (model.startsWith('claude-')) {
        // Anthropic models
        const response = await this.anthropicClient.messages.create({
          model,
          max_tokens,
          temperature,
          messages: [{
            role: 'user',
            content: options.prompt
          }]
        });

        // Extract text from response
        const textContent = response.content.find(block => block.type === 'text');
        if (!textContent || textContent.type !== 'text') {
          throw new Error('No text content in Anthropic response');
        }
        responseText = textContent.text;

        inputTokens = response.usage.input_tokens;
        outputTokens = response.usage.output_tokens;
      } else if (model.startsWith('gpt-')) {
        // OpenAI models - would need OpenAI SDK
        // For now, throw error as we don't have OpenAI SDK initialized
        throw new Error('OpenAI models not yet supported in EvalContext. Please use Claude models.');
      } else {
        throw new Error(`Unsupported model: ${model}`);
      }

      // Calculate cost
      const pricing = MODEL_PRICING[model];
      const inputCost = (inputTokens / 1_000_000) * pricing.input;
      const outputCost = (outputTokens / 1_000_000) * pricing.output;
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

      // Cache if cache_key provided
      if (options.cache_key) {
        this.set_cache(options.cache_key, responseText);
      }

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
   * Get total cost incurred so far in this eval execution
   * @returns Cost in USD
   */
  get_cost_so_far(): number {
    return this.costSoFar;
  }

  /**
   * Get remaining budget for this eval execution
   * @returns Remaining budget in USD
   */
  get_remaining_budget(): number {
    return Math.max(0, this.config.max_budget_usd - this.costSoFar);
  }

  /**
   * Check if a cache key exists
   * @param key - Cache key to check
   * @returns True if key exists in cache
   */
  has_cache(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Get cached value
   * @param key - Cache key
   * @returns Cached value or null if not found
   */
  get_cache(key: string): string | null {
    return this.cache.get(key) || null;
  }

  /**
   * Set cached value (per-execution cache)
   * @param key - Cache key
   * @param value - Value to cache
   */
  set_cache(key: string, value: string): void {
    this.cache.set(key, value);
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
 * - get_cost_so_far, get_remaining_budget functions
 * - has_cache, get_cache, set_cache functions
 *
 * @param ctx - EvalContext instance
 * @returns Serializable object for Python
 */
export function serializeEvalContextForPython(ctx: EvalContext): Record<string, any> {
  return {
    // These would be exposed as Python functions in the sandbox
    methods: {
      call_llm: 'async function',
      get_cost_so_far: 'function',
      get_remaining_budget: 'function',
      has_cache: 'function',
      get_cache: 'function',
      set_cache: 'function'
    },
    // Current state (read-only in Python)
    state: {
      cost_so_far: ctx.get_cost_so_far(),
      remaining_budget: ctx.get_remaining_budget()
    }
  };
}
