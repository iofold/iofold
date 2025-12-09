/**
 * EvalRunner - Service for executing eval functions with GEPA interface
 * Bridges TypeScript EvalContext to Python eval execution
 */

import { EvalContextImpl, SAFE_EVAL_IMPORTS } from './eval-context';
import type { Task, TaskMetadata } from '../../types/datainst';
import type { EvalResult, EvalContextConfig } from '../../types/eval-context';
import { PythonRunner, type PythonRunnerConfig } from '../../sandbox/python-runner';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';

/**
 * Configuration for EvalRunner
 */
export interface EvalRunnerConfig {
  /** Anthropic API key for LLM calls */
  anthropicApiKey: string;

  /** Maximum budget in USD (default: 0.05) */
  maxBudgetUsd?: number;

  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number;

  /** Cloudflare Sandbox binding for Python execution */
  sandboxBinding?: DurableObjectNamespace<Sandbox>;

  /** Dev Python executor service URL */
  devExecutorUrl?: string;
}

/**
 * Bridge message types for Python <-> TypeScript communication
 * These messages flow between the Python eval and TypeScript EvalContext
 */
interface BridgeRequest {
  type: 'call_llm' | 'get_cost' | 'get_budget' | 'has_cache' | 'get_cache' | 'set_cache';
  id: string;
  payload: any;
}

interface BridgeResponse {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
}

/**
 * EvalRunner - Executes eval functions with GEPA interface
 *
 * The runner creates an EvalContext and bridges Python eval execution to TypeScript.
 * Python evals can call ctx.call_llm() and other methods which are handled by
 * TypeScript EvalContextImpl.
 */
export class EvalRunner {
  private config: EvalRunnerConfig;
  private pythonRunner: PythonRunner;

  constructor(config: EvalRunnerConfig) {
    this.config = {
      maxBudgetUsd: config.maxBudgetUsd || 0.05,
      timeoutMs: config.timeoutMs || 30000,
      anthropicApiKey: config.anthropicApiKey,
      sandboxBinding: config.sandboxBinding,
      devExecutorUrl: config.devExecutorUrl
    };

    this.pythonRunner = new PythonRunner({
      timeout: this.config.timeoutMs,
      sandboxBinding: this.config.sandboxBinding,
      devExecutorUrl: this.config.devExecutorUrl
    });
  }

  /**
   * Run an eval function with the GEPA interface
   *
   * @param evalCode - Python eval function code
   * @param task - The task to evaluate
   * @param taskMetadata - Metadata for evaluation
   * @param trace - The trace execution to evaluate
   * @param options - Optional overrides for budget and timeout
   * @returns EvalResult with score, feedback, and execution stats
   */
  async runEval(
    evalCode: string,
    task: Task,
    taskMetadata: TaskMetadata,
    trace: Record<string, unknown>,
    options?: {
      maxBudgetUsd?: number;
      timeoutMs?: number;
    }
  ): Promise<EvalResult> {
    const startTime = Date.now();

    // Create eval context for this execution
    const evalContextConfig: EvalContextConfig = {
      max_budget_usd: options?.maxBudgetUsd || this.config.maxBudgetUsd || 0.05,
      timeout_ms: options?.timeoutMs || this.config.timeoutMs || 30000,
      additional_imports: []
    };

    const ctx = new EvalContextImpl(this.config.anthropicApiKey, evalContextConfig);

    try {
      // Build Python wrapper that exposes EvalContext methods
      const wrappedCode = this.buildPythonWrapper(evalCode, task, taskMetadata, trace);

      // Execute the eval function
      const execution = await this.pythonRunner.execute(wrappedCode);

      const durationMs = Date.now() - startTime;

      if (!execution.success) {
        throw new Error(`Eval execution failed: ${execution.error}`);
      }

      // Parse result from Python output
      const result = this.parseEvalOutput(execution.output || '');

      // Get stats from context
      const stats = ctx.getStats();

      return {
        score: result.score,
        feedback: result.feedback,
        execution: {
          duration_ms: durationMs,
          llm_calls: stats.llm_calls,
          llm_cost_usd: stats.total_cost_usd,
          cache_hits: stats.cache_hits
        }
      };
    } catch (error: any) {
      // Return error as a failed eval
      const durationMs = Date.now() - startTime;
      const stats = ctx.getStats();

      return {
        score: 0,
        feedback: `Eval execution error: ${error.message || String(error)}`,
        execution: {
          duration_ms: durationMs,
          llm_calls: stats.llm_calls,
          llm_cost_usd: stats.total_cost_usd,
          cache_hits: stats.cache_hits
        }
      };
    }
  }

  /**
   * Build Python wrapper code that exposes EvalContext methods
   *
   * This creates a Python environment where:
   * - task, task_metadata, trace are available as JSON objects
   * - ctx.call_llm() is available (stubbed - will be enhanced in Phase 1C-3)
   * - ctx.get_cost_so_far(), get_remaining_budget(), etc. are available
   * - eval_function(task, task_metadata, trace, ctx) is called
   * - Result is serialized as JSON: {"score": float, "feedback": str}
   *
   * @param evalCode - User's eval function code
   * @param task - Task object
   * @param taskMetadata - Task metadata object
   * @param trace - Trace execution object
   * @returns Complete Python script ready for execution
   */
  private buildPythonWrapper(
    evalCode: string,
    task: Task,
    taskMetadata: TaskMetadata,
    trace: Record<string, unknown>
  ): string {
    // Escape JSON for embedding in Python string
    const taskJson = JSON.stringify(task)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    const taskMetadataJson = JSON.stringify(taskMetadata)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    const traceJson = JSON.stringify(trace)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');

    return `import json
import re
from typing import Any, Dict, Optional, Tuple

# EvalContext stub for Python
# In Phase 1C-3, this will be enhanced with proper bridge to TypeScript
class EvalContext:
    """
    Sandboxed context for eval function execution.
    Provides controlled access to LLM and utilities.
    """

    def __init__(self):
        self._cost = 0.0
        self._budget = 0.05
        self._cache: Dict[str, str] = {}

    def call_llm(
        self,
        prompt: str,
        model: str = "claude-sonnet-4-5-20250929",
        temperature: float = 0.0,
        max_tokens: int = 500,
        cache_key: Optional[str] = None
    ) -> str:
        """
        Call an LLM for semantic evaluation.

        NOTE: This is a stub implementation for Phase 1C-2.
        In Phase 1C-3, this will bridge to TypeScript EvalContextImpl.

        For now, it raises NotImplementedError to signal that LLM calls
        are not yet supported in this phase.
        """
        raise NotImplementedError(
            "ctx.call_llm() is not yet implemented in Phase 1C-2. "
            "This will be added in Phase 1C-3 with proper Python<->TypeScript bridging."
        )

    def get_cost_so_far(self) -> float:
        """Get total cost incurred so far in USD"""
        return self._cost

    def get_remaining_budget(self) -> float:
        """Get remaining budget in USD"""
        return max(0.0, self._budget - self._cost)

    def has_cache(self, key: str) -> bool:
        """Check if a cache key exists"""
        return key in self._cache

    def get_cache(self, key: str) -> Optional[str]:
        """Get cached value"""
        return self._cache.get(key)

    def set_cache(self, key: str, value: str) -> None:
        """Set cached value (per-execution cache)"""
        self._cache[key] = value

# User's eval function
${evalCode}

# Load inputs
task = json.loads("${taskJson}")
task_metadata = json.loads("${taskMetadataJson}")
trace = json.loads("${traceJson}")

# Create context
ctx = EvalContext()

# Execute eval function
try:
    result = eval_function(task, task_metadata, trace, ctx)

    # Extract score and feedback
    if isinstance(result, tuple) and len(result) == 2:
        score, feedback = result
    else:
        raise ValueError(f"eval_function must return tuple[float, str], got {type(result)}")

    # Validate score is between 0 and 1
    if not isinstance(score, (int, float)):
        raise ValueError(f"Score must be a number, got {type(score)}")
    if score < 0 or score > 1:
        raise ValueError(f"Score must be between 0 and 1, got {score}")

    # Validate feedback is a string
    if not isinstance(feedback, str):
        raise ValueError(f"Feedback must be a string, got {type(feedback)}")

    # Output result as JSON
    output = {
        "score": float(score),
        "feedback": feedback
    }
    print(json.dumps(output))

except Exception as e:
    # Output error result
    error_output = {
        "score": 0.0,
        "feedback": f"Eval function error: {str(e)}"
    }
    print(json.dumps(error_output))
`;
  }

  /**
   * Parse eval function output from Python
   *
   * Expected format: {"score": 0.8, "feedback": "Good response"}
   *
   * @param output - Raw stdout from Python execution
   * @returns Parsed score and feedback
   */
  private parseEvalOutput(output: string): { score: number; feedback: string } {
    try {
      // Find JSON in output (might have other print statements)
      // Use [\s\S]* instead of .* with /s flag for broader compatibility
      const jsonMatch = output.match(/\{[\s\S]*"score"[\s\S]*"feedback"[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error(`Could not find JSON output in: ${output.substring(0, 200)}`);
      }

      const result = JSON.parse(jsonMatch[0]);

      if (typeof result.score !== 'number') {
        throw new Error(`Invalid score type: ${typeof result.score}`);
      }

      if (typeof result.feedback !== 'string') {
        throw new Error(`Invalid feedback type: ${typeof result.feedback}`);
      }

      return {
        score: result.score,
        feedback: result.feedback
      };
    } catch (error: any) {
      throw new Error(`Failed to parse eval output: ${error.message}. Output: ${output}`);
    }
  }
}
