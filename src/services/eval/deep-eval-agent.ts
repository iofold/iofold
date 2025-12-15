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
import { ToolMessage } from '@langchain/core/messages';
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

## Tips

- Use get_trace_details to inspect specific traces deeply
- If context gets large, write notes to files using write_file
- Focus on patterns that generalize, not trace-specific hacks
- Look at tool_calls, input/output structure, and error fields

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

    // Build filesystem tools
    const fsTools = createPlaygroundTools(
      { DB: this.config.db, SANDBOX: this.config.sandbox },
      sessionId
    );

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
        // Log tool results and track test iterations
        if (event === 'on_tool_end') {
          // Extract tool name from ToolMessage or fall back to node name
          const toolName = (data.output instanceof ToolMessage && data.output.name)
            ? data.output.name
            : nodeName || 'unknown';

          this.log('info', `Tool: ${toolName}`);

          const output = data.output?.content || data.output;
          const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

          // Check for test results from test_eval_code tool
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

    // Extract code from accumulated text (handles code spanning multiple chunks)
    const codeMatches = accumulatedText.matchAll(/```python\s*([\s\S]*?)```/g);
    for (const match of codeMatches) {
      if (match[1].includes('def eval_')) {
        bestCode = match[1].trim();
        // Keep the last valid eval function found
      }
    }

    // If we still don't have code, there's a problem
    if (!bestCode) {
      this.log('error', 'No eval function found in agent output', {
        accumulatedTextLength: accumulatedText.length,
        preview: accumulatedText.substring(0, 500),
      });
      throw new Error('Agent did not produce an eval function');
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
