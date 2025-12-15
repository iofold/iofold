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

const RECURSION_LIMIT = 50;
const WRAP_UP_THRESHOLD = 45;

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
}

/**
 * Build the system prompt for the eval agent
 */
function buildSystemPrompt(evalName: string): string {
  return `You are an eval function generator. Your job is to write a Python function that accurately classifies agent trace quality based on labeled examples.

## Your Process

1. **Fetch samples** - Use fetch_traces to get positive and negative examples
2. **Analyze patterns** - Study what distinguishes good from bad traces
3. **Write eval** - Create a Python function: def eval_${evalName}(trace, ctx=None) -> tuple[float, str]
4. **Test** - Use test_eval_code to measure accuracy
5. **Refine** - If accuracy < 80%, analyze mismatches and improve

## Eval Function Requirements

- Signature: def eval_${evalName}(trace: dict, ctx=None) -> tuple[float, str]
- Return: (score 0.0-1.0, "explanation string")
- Score >= 0.5 means "positive/good quality"
- Score < 0.5 means "negative/bad quality"
- Allowed imports: json, re, typing, math, datetime, difflib

## Trace Structure

The trace dict has this structure:
\`\`\`python
{
  "trace_id": "abc123",
  "steps": [
    {
      "input": {"messages": [...]},  # User input
      "output": {"content": "..."},  # Agent response
      "tool_calls": [                # Tools called by agent
        {"name": "search", "args": {...}, "result": {...}}
      ],
      "error": null  # Or error message if failed
    }
  ]
}
\`\`\`

## Example Eval Functions

### Example 1: Check if agent used required tools
\`\`\`python
def eval_${evalName}(trace: dict, ctx=None) -> tuple[float, str]:
    """Check if agent used the required tools to answer."""
    steps = trace.get("steps", [])
    if not steps:
        return (0.0, "No steps in trace")

    # Extract all tool calls across steps
    tool_names = []
    for step in steps:
        for tc in step.get("tool_calls", []):
            tool_names.append(tc.get("name", ""))

    # Check for required tools
    has_search = any("search" in name.lower() for name in tool_names)
    has_answer = any("answer" in name.lower() or "final" in name.lower() for name in tool_names)

    if has_search and has_answer:
        return (1.0, f"Agent used search and provided answer. Tools: {tool_names}")
    elif has_answer:
        return (0.5, f"Agent answered but didn't search. Tools: {tool_names}")
    else:
        return (0.0, f"Agent didn't complete task. Tools: {tool_names}")
\`\`\`

### Example 2: Use LLM to judge response quality
\`\`\`python
def eval_${evalName}(trace: dict, ctx=None) -> tuple[float, str]:
    """Use LLM to evaluate if the agent's response is correct."""
    steps = trace.get("steps", [])
    if not steps:
        return (0.0, "No steps in trace")

    # Get the final output
    final_output = steps[-1].get("output", {}).get("content", "")
    user_query = steps[0].get("input", {}).get("messages", [{}])[-1].get("content", "")

    if not final_output or not user_query:
        return (0.0, "Missing query or response")

    # Use LLM to judge (ctx.call_llm available)
    if ctx:
        judgment = ctx.call_llm(
            prompt=f\"\"\"Judge if this agent response correctly answers the user's question.

User question: {user_query}

Agent response: {final_output}

Respond with only "CORRECT" or "INCORRECT" followed by a brief reason.\"\"\",
            model="anthropic/claude-sonnet-4-5",
            temperature=0.0,
            max_tokens=100
        )

        is_correct = "CORRECT" in judgment.upper() and "INCORRECT" not in judgment.upper()
        return (1.0 if is_correct else 0.0, judgment.strip())

    # Fallback: basic heuristics
    has_content = len(final_output) > 50
    return (0.7 if has_content else 0.3, f"Response length: {len(final_output)}")
\`\`\`

### Example 3: Check for errors and completeness
\`\`\`python
def eval_${evalName}(trace: dict, ctx=None) -> tuple[float, str]:
    """Check if agent completed without errors."""
    steps = trace.get("steps", [])
    if not steps:
        return (0.0, "No steps in trace")

    # Check for errors
    errors = [s.get("error") for s in steps if s.get("error")]
    if errors:
        return (0.0, f"Errors found: {errors[0]}")

    # Check for tool call failures
    for step in steps:
        for tc in step.get("tool_calls", []):
            result = tc.get("result", {})
            if isinstance(result, dict) and result.get("error"):
                return (0.3, f"Tool {tc.get('name')} failed: {result.get('error')}")

    # Check final output exists
    final = steps[-1].get("output", {}).get("content", "")
    if not final or len(final) < 10:
        return (0.2, "No meaningful final output")

    return (1.0, "Completed successfully without errors")
\`\`\`

## Tips

- Use get_trace_details to inspect specific traces deeply
- Focus on patterns that generalize, not trace-specific hacks
- The ctx parameter provides call_llm() for semantic evaluation
- Always handle missing/empty data gracefully

## Success Criteria

Stop when accuracy >= 80%. You have up to 5 test attempts.

When you achieve >= 80% accuracy or have exhausted your attempts, output your final eval function clearly marked.`;
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
      temperature: 0.7,
    });

    // Build eval-specific tools
    const evalToolContext: ToolContext = {
      db: this.config.db,
      agentId: this.config.agentId,
      sandbox: this.config.sandbox,
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
    };
  }
}
