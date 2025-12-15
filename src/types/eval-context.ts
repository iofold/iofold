/**
 * EvalContext - Sandboxed context for eval function execution
 * Provides controlled access to LLM and utilities
 */
export interface EvalContext {
  /** Call an LLM for semantic evaluation */
  call_llm(options: LLMCallOptions): Promise<string>;
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
