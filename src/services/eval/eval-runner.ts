/**
 * EvalRunner - Service for executing eval functions with GEPA interface
 * Bridges TypeScript EvalContext to Python eval execution with LLM support
 */

import { EvalContextImpl, SAFE_EVAL_IMPORTS } from './eval-context';
import type { Task, TaskMetadata } from '../../types/datainst';
import type { EvalResult, EvalContextConfig, LLMCallOptions } from '../../types/eval-context';
import { PythonRunner, type PythonRunnerConfig } from '../../sandbox/python-runner';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';
import { getSandbox } from '@cloudflare/sandbox';

/**
 * Configuration for EvalRunner
 */
export interface EvalRunnerConfig {
  /** Cloudflare Account ID for AI Gateway */
  cfAccountId: string;

  /** Cloudflare AI Gateway ID */
  cfGatewayId: string;

  /** Optional AI Gateway authentication token */
  cfGatewayToken?: string;

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
  type: 'call_llm';
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
      cfAccountId: config.cfAccountId,
      cfGatewayId: config.cfGatewayId,
      cfGatewayToken: config.cfGatewayToken,
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

    const ctx = new EvalContextImpl(
      {
        CF_ACCOUNT_ID: this.config.cfAccountId,
        CF_AI_GATEWAY_ID: this.config.cfGatewayId,
        CF_AI_GATEWAY_TOKEN: this.config.cfGatewayToken
      },
      evalContextConfig
    );

    try {
      // Execute with LLM bridge support (iterative execution pattern)
      const result = await this.executeWithLLMBridge(evalCode, task, taskMetadata, trace, ctx);
      const durationMs = Date.now() - startTime;

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
   * Execute eval with LLM bridge support using iterative execution pattern.
   *
   * The pattern works as follows:
   * 1. Python runs until it needs an LLM call, then halts with a special marker
   * 2. TypeScript processes the LLM request via AI Gateway
   * 3. Python re-runs with the LLM response pre-cached
   * 4. Repeat until eval completes or max iterations reached
   *
   * @param evalCode - User's eval function code
   * @param task - Task object
   * @param taskMetadata - Task metadata object
   * @param trace - Trace execution object
   * @param ctx - EvalContext for LLM calls
   * @returns Parsed score and feedback
   */
  private async executeWithLLMBridge(
    evalCode: string,
    task: Task,
    taskMetadata: TaskMetadata,
    trace: Record<string, unknown>,
    ctx: EvalContextImpl
  ): Promise<{ score: number; feedback: string }> {
    const MAX_LLM_ITERATIONS = 10; // Prevent infinite loops
    const llmResponses: Record<string, string> = {};
    let iteration = 0;

    while (iteration < MAX_LLM_ITERATIONS) {
      iteration++;

      // Build Python wrapper with cached LLM responses
      const wrappedCode = this.buildPythonWrapper(evalCode, task, taskMetadata, trace, llmResponses);

      // Execute the eval function
      const execution = await this.pythonRunner.execute(wrappedCode);

      if (!execution.success) {
        throw new Error(`Eval execution failed: ${execution.error}`);
      }

      const output = execution.output || '';

      // Check if Python needs an LLM call (special marker in output)
      const llmRequestMatch = output.match(/\[LLM_REQUEST\](.*?)\[\/LLM_REQUEST\]/s);

      if (llmRequestMatch) {
        // Parse LLM request from Python
        const requestJson = llmRequestMatch[1];
        const request = JSON.parse(requestJson) as {
          id: string;
          prompt: string;
          model?: string;
          temperature?: number;
          max_tokens?: number;
        };

        console.log(`[EvalRunner] Processing LLM request ${request.id} (iteration ${iteration})`);

        // Execute LLM call via AI Gateway using EvalContext
        try {
          const response = await ctx.call_llm({
            prompt: request.prompt,
            model: (request.model as LLMCallOptions['model']) || 'anthropic/claude-sonnet-4-5',
            temperature: request.temperature ?? 0.0,
            max_tokens: request.max_tokens || 500
          });

          // Store response for next iteration
          llmResponses[request.id] = response;
        } catch (error: any) {
          // LLM call failed - return error as eval result
          console.error(`[EvalRunner] LLM call failed:`, error.message);
          return {
            score: 0,
            feedback: `LLM call failed: ${error.message}`
          };
        }

        // Continue to next iteration
        continue;
      }

      // No LLM request - parse final result
      return this.parseEvalOutput(output);
    }

    throw new Error(`Eval exceeded maximum LLM iterations (${MAX_LLM_ITERATIONS})`);
  }

  /**
   * Build Python wrapper code that exposes EvalContext methods with LLM bridge support.
   *
   * This creates a Python environment where:
   * - task, task_metadata, trace are available as JSON objects
   * - ctx.call_llm() is available and bridges to TypeScript via special markers
   * - eval_function(task, task_metadata, trace, ctx) is called
   * - Result is serialized as JSON: {"score": float, "feedback": str}
   *
   * @param evalCode - User's eval function code
   * @param task - Task object
   * @param taskMetadata - Task metadata object
   * @param trace - Trace execution object
   * @param llmResponses - Pre-cached LLM responses from previous iterations
   * @returns Complete Python script ready for execution
   */
  private buildPythonWrapper(
    evalCode: string,
    task: Task,
    taskMetadata: TaskMetadata,
    trace: Record<string, unknown>,
    llmResponses: Record<string, string> = {}
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
    const llmResponsesJson = JSON.stringify(llmResponses)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');

    return `import json
import re
from typing import Any, Dict, Optional, Tuple

# LLM Request Exception - used to signal TypeScript to process LLM call
class LLMRequestNeeded(Exception):
    def __init__(self, request_id: str, prompt: str, model: str, temperature: float, max_tokens: int):
        self.request_id = request_id
        self.prompt = prompt
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        super().__init__(f"LLM call needed: {request_id}")

# Pre-loaded LLM responses from previous iterations
_llm_responses: Dict[str, str] = json.loads("${llmResponsesJson}")
_llm_call_counter = 0

class EvalContext:
    """
    Sandboxed context for eval function execution.
    Provides controlled access to LLM via TypeScript bridge.
    """

    def call_llm(
        self,
        prompt: str,
        model: str = "anthropic/claude-sonnet-4-5",
        temperature: float = 0.0,
        max_tokens: int = 500
    ) -> str:
        """
        Call an LLM for semantic evaluation.

        This method bridges to TypeScript EvalContextImpl via AI Gateway.
        If the result is already cached (from previous iteration), returns immediately.
        Otherwise, halts execution with a special marker for TypeScript to process.
        """
        global _llm_call_counter
        _llm_call_counter += 1

        # Generate request ID
        request_id = f"llm_call_{_llm_call_counter}"

        # Check if response is already available from previous iteration
        if request_id in _llm_responses:
            return _llm_responses[request_id]

        # Signal TypeScript to process this LLM call
        # Raise exception with request details encoded as special marker
        request = {
            "id": request_id,
            "prompt": prompt,
            "model": model,
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        print(f"[LLM_REQUEST]{json.dumps(request)}[/LLM_REQUEST]")
        raise SystemExit(0)  # Clean exit - TypeScript will rerun with response

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
