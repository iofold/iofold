/**
 * EvalContext - Sandboxed context for eval function execution
 * Provides controlled access to LLM and utilities
 */
export interface EvalContext {
  /** Call an LLM for semantic evaluation */
  call_llm(options: LLMCallOptions): Promise<string>;

  /** Get total cost incurred so far in this eval execution */
  get_cost_so_far(): number;

  /** Get remaining budget for this eval execution */
  get_remaining_budget(): number;

  /** Check if a cache key exists */
  has_cache(key: string): boolean;

  /** Get cached value */
  get_cache(key: string): string | null;

  /** Set cached value (per-execution cache) */
  set_cache(key: string, value: string): void;
}

/**
 * Options for calling an LLM through EvalContext
 */
export interface LLMCallOptions {
  /** The prompt to send */
  prompt: string;

  /** Model to use (default: anthropic/claude-sonnet-4-5) */
  model?: "anthropic/claude-sonnet-4-5" | "anthropic/claude-haiku-4-5";

  /** Temperature (default: 0.0 for determinism) */
  temperature?: number;

  /** Max tokens in response (default: 500) */
  max_tokens?: number;

  /** Optional cache key - if provided, will cache result */
  cache_key?: string;
}

/**
 * Result from eval function execution
 */
export interface EvalResult {
  /** Score from 0 to 1 */
  score: number;  // μ

  /** Feedback string explaining the score */
  feedback: string;  // μ_f

  /** Execution metadata */
  execution: {
    /** Duration of eval execution in milliseconds */
    duration_ms: number;

    /** Number of LLM calls made during execution */
    llm_calls: number;

    /** Total LLM cost in USD */
    llm_cost_usd: number;

    /** Number of cache hits */
    cache_hits: number;
  };
}

/**
 * Configuration for EvalContext
 */
export interface EvalContextConfig {
  /** Maximum budget in USD (default: 0.05) */
  max_budget_usd: number;

  /** Timeout in milliseconds (default: 30000) */
  timeout_ms: number;

  /** Allowed imports beyond safe defaults */
  additional_imports?: string[];
}
