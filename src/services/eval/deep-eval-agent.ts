/**
 * Deep Eval Agent
 *
 * An iterative, tool-using agent that generates eval functions.
 * Reuses the DeepAgents pattern from playground with eval-specific tools.
 */

import { createAgentNoCache } from '../../playground/create-agent-no-cache';
import { D1Backend } from '../../playground/backend/d1-backend';
import { getChatModel, type Env } from '../../playground/llm/streaming';
import { DEFAULT_MODEL } from '../../ai/gateway';
import { createEvalTools, type ToolContext } from './eval-tools';
import { createPlaygroundTools } from '../../playground/tools/definitions';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';

const RECURSION_LIMIT = 25;  // Reduced to avoid context overflow
const WRAP_UP_THRESHOLD = 20;  // Start wrapping up before limit

export interface DeepEvalAgentConfig {
  agentId: string;
  evalName: string;
  db: D1Database;
  env: Env;
  sandbox?: DurableObjectNamespace<Sandbox>;
  onLog?: (level: 'info' | 'warn' | 'error', message: string, data?: Record<string, any>) => void;
}

export interface DeepEvalResult {
  code: string;
  accuracy: number;
  iterations: number;
  testResults: {
    correct: number;
    incorrect: number;
    errors: number;
    total: number;
  };
}

/**
 * Build the system prompt for the eval agent
 */
function buildSystemPrompt(evalName: string): string {
  return `You are an eval function generator. Write a Python function that classifies agent trace quality.

## CRITICAL: Train/Test Split
- You ONLY see TRAIN SET traces (70%). Test set (30%) is held out.
- fetch_traces, get_trace_details, write_traces_to_file: TRAIN SET only
- test_eval_code: Tests on HELD-OUT TEST SET to measure generalization
- Low test accuracy = overfitting. Write generalizable patterns, not memorized rules.

## CRITICAL: Context Management
- NEVER call get_trace_details more than 2 times
- Use write_traces_to_file for bulk analysis
- Keep responses SHORT

## Process
1. fetch_traces - get train set summaries
2. write_traces_to_file - dump train traces to file
3. read_file/execute_python_analysis - analyze patterns
4. Write eval function using SEMANTIC patterns
5. test_eval_code - test on held-out test set (aim >= 80%)

## Eval Function Spec
\`\`\`python
def eval_${evalName}(trace: dict, ctx=None) -> tuple[float, str]:
    steps = trace.get("steps", [])
    # Score >= 0.5 = positive, < 0.5 = negative
    return (score, "reason")
\`\`\`
Allowed imports: json, re, typing, math, datetime, difflib

## IMPORTANT: Writing Robust Evals
DO NOT write fragile evals that:
- Search for exact phrases (e.g., "successfully completed")
- Check for specific tool names that won't generalize
- Look for hardcoded keywords from training examples

DO write semantic evals that check:
- Structural patterns (did the trace have X type of step?)
- Outcome indicators (was the task completed? was there an error?)
- Quality signals (appropriate tool usage, response completeness)
- Behavioral patterns (retry logic, error handling, appropriate flow)

## Example: WRONG (fragile)
\`\`\`python
def eval_bad(trace, ctx=None):
    # FRAGILE: memorizes training examples
    outputs = [s.get("output", "") for s in trace.get("steps", [])]
    if any("email sent successfully" in str(o).lower() for o in outputs):
        return (1.0, "Found success phrase")
    return (0.0, "No success phrase")
\`\`\`

## Example: RIGHT (semantic)
\`\`\`python
def eval_${evalName}(trace: dict, ctx=None) -> tuple[float, str]:
    steps = trace.get("steps", [])
    if not steps:
        return (0.0, "Empty trace")

    # Check for structural patterns
    tool_calls = [tc for s in steps for tc in s.get("tool_calls", [])]
    has_action_tools = any(
        tc.get("name", "").lower() in ["send_email", "create_task", "update_record"]
        for tc in tool_calls
    )

    # Check final output for completion signals
    last_output = str(steps[-1].get("output", ""))
    has_error = any(word in last_output.lower() for word in ["error", "failed", "exception"])
    has_completion = len(last_output) > 50 and not has_error

    if has_action_tools and has_completion:
        return (1.0, "Action taken with completion")
    elif has_error:
        return (0.0, "Error in output")
    else:
        return (0.3, "Unclear outcome")
\`\`\`

## Stop when test set accuracy >= 80% or after 3 test attempts.`;
}

export class DeepEvalAgent {
  private config: DeepEvalAgentConfig;
  private systemPrompt: string;

  constructor(config: DeepEvalAgentConfig) {
    this.config = config;
    this.systemPrompt = buildSystemPrompt(config.evalName);
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  private log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, any>) {
    if (this.config.onLog) {
      this.config.onLog(level, message, data);
    }
  }

  async generate(): Promise<DeepEvalResult> {
    const sessionId = `eval-agent-${this.config.agentId}-${Date.now()}`;

    this.log('info', 'Initializing deep eval agent', {
      agentId: this.config.agentId,
      evalName: this.config.evalName,
      sessionId,
    });

    // Create D1Backend for filesystem operations
    const backend = new D1Backend(this.config.db, sessionId);

    // Get the LangChain model using default model from central definitions
    const model = getChatModel({
      provider: 'anthropic',
      modelId: DEFAULT_MODEL,
      env: this.config.env,
    });

    // Build eval-specific tools (with sessionId for file-based tools)
    const evalToolContext: ToolContext = {
      db: this.config.db,
      agentId: this.config.agentId,
      sandbox: this.config.sandbox,
      sessionId,  // Enable write_traces_to_file and execute_python_analysis
    };
    const evalTools = createEvalTools(evalToolContext);

    // Build filesystem tools (exclude execute_python - agent should use test_eval_code for testing)
    const fsTools = createPlaygroundTools(
      { DB: this.config.db, SANDBOX: this.config.sandbox },
      sessionId
    ).filter(t => t.name !== 'execute_python');

    // Combine all tools
    const allTools = [...evalTools, ...fsTools];

    this.log('info', 'Agent tools loaded', {
      evalTools: evalTools.map(t => t.name),
      fsTools: fsTools.map(t => t.name),
    });

    // Create the agent
    const agent = createAgentNoCache({
      model,
      backend: () => backend,
      systemPrompt: this.systemPrompt,
      tools: allTools,
    });

    // Initial message to start the agent
    const messages = [
      {
        role: 'user' as const,
        content: `Generate an eval function named "eval_${this.config.evalName}" for this agent. Start by fetching some labeled traces to understand the patterns.`,
      },
    ];

    let iterations = 0;
    let bestCode = '';
    let bestAccuracy = 0;
    let bestTestResults = { correct: 0, incorrect: 0, errors: 0, total: 0 };
    let accumulatedText = ''; // Accumulate all agent output

    try {
      // Stream agent events
      const eventStream = agent.streamEvents(
        { messages },
        { version: 'v2', recursionLimit: RECURSION_LIMIT }
      );

      for await (const { event, data, name: nodeName } of eventStream) {
        // Debug: log all tool start events to understand the structure
        if (event === 'on_tool_start') {
          this.log('info', `Tool start: ${nodeName}`, {
            hasInput: !!data.input,
            inputKeys: data.input ? Object.keys(data.input) : [],
            dataKeys: Object.keys(data),
          });
        }

        // Capture code from test_eval_code tool input (before execution)
        // LangChain v2 structure: data.input.input can be a JSON string or object
        // Tool schema: {code: string, trace_ids?: string[]}
        if (event === 'on_tool_start' && nodeName === 'test_eval_code') {
          const nestedInput = (data.input as any)?.input;

          // Extract code from tool input - handle multiple formats
          let code: string | undefined;

          if (typeof nestedInput === 'string') {
            // Could be JSON string like '{"code":"...", "trace_ids":[...]}'
            // or raw Python code string
            try {
              const parsed = JSON.parse(nestedInput);
              if (parsed && typeof parsed.code === 'string') {
                code = parsed.code;
              }
            } catch {
              // Not JSON, check if it's raw Python code
              if (nestedInput.includes('def eval_')) {
                code = nestedInput;
              }
            }
          } else if (nestedInput && typeof nestedInput.code === 'string') {
            // Direct object with code property
            code = nestedInput.code;
          }

          if (code && code.includes('def eval_')) {
            bestCode = code;
            this.log('info', 'Captured eval code from test_eval_code', {
              codeLength: bestCode.length,
            });
          }
        }

        // Log tool results and track test iterations
        if (event === 'on_tool_end') {
          // Use nodeName which is reliable for identifying the tool
          const toolName = nodeName || 'unknown';

          this.log('info', `Tool: ${toolName}`);

          // Only parse accuracy from test_eval_code tool output (not other tools)
          if (nodeName === 'test_eval_code') {
            const output = data.output?.content || data.output;
            const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

            if (outputStr.includes('"accuracy"')) {
              try {
                const result = JSON.parse(outputStr);
                if (result.accuracy !== undefined) {
                  iterations++;
                  this.log('info', `Test iteration ${iterations}`, {
                    accuracy: `${(result.accuracy * 100).toFixed(1)}%`,
                    correct: result.correct,
                    incorrect: result.incorrect,
                    errors: result.errors,
                  });

                  if (result.accuracy > bestAccuracy) {
                    bestAccuracy = result.accuracy;
                    bestTestResults = {
                      correct: result.correct || 0,
                      incorrect: result.incorrect || 0,
                      errors: result.errors || 0,
                      total: result.total || (result.correct || 0) + (result.incorrect || 0) + (result.errors || 0),
                    };
                  }

                  if (result.accuracy >= 0.8) {
                    this.log('info', 'Success! Accuracy >= 80%');
                  }
                }
              } catch {
                // Not a test result, ignore
              }
            }
          }
        }

        // Accumulate agent text output
        if (event === 'on_chat_model_stream') {
          const chunk = data.chunk;
          if (chunk?.content && typeof chunk.content === 'string') {
            accumulatedText += chunk.content;
          }
        }
      }
    } catch (error: any) {
      // Handle recursion limit error gracefully
      if (error.name === 'GraphRecursionError' || error.message?.includes('recursion')) {
        this.log('warn', 'Hit recursion limit, extracting best result from accumulated output');
      } else {
        throw error;
      }
    }

    // If we captured code from test_eval_code input, use that (most reliable)
    // Otherwise, fall back to extracting from accumulated text
    if (!bestCode) {
      // Try to extract code from accumulated text (handles code in chat output)
      const codeMatches = accumulatedText.matchAll(/```python\s*([\s\S]*?)```/g);
      for (const match of codeMatches) {
        if (match[1].includes('def eval_')) {
          bestCode = match[1].trim();
          // Keep the last valid eval function found
        }
      }
    }

    // If we still don't have code, there's a problem
    if (!bestCode) {
      this.log('error', 'No eval function found in agent output', {
        accumulatedTextLength: accumulatedText.length,
        preview: accumulatedText.substring(0, 500),
        hint: 'Agent may have written code to files but never tested it with test_eval_code',
      });
      throw new Error('Agent did not produce an eval function');
    } else {
      this.log('info', 'Final eval code extracted', {
        codeLength: bestCode.length,
        source: bestCode ? 'test_eval_code input' : 'text output',
      });
    }

    this.log('info', 'Eval generation complete', {
      iterations,
      accuracy: `${(bestAccuracy * 100).toFixed(1)}%`,
      codeLength: bestCode.length,
    });

    return {
      code: bestCode,
      accuracy: bestAccuracy,
      iterations,
      testResults: bestTestResults,
    };
  }
}
