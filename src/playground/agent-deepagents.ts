/**
 * Playground Agent using DeepAgents
 *
 * Creates and configures agents for the playground using the deepagents library.
 * Supports streaming with provider switching (Anthropic, OpenAI, Google).
 *
 * This replaces the custom LangGraph implementation with the standard
 * deepagents createDeepAgent pattern for cleaner, more maintainable code.
 */

/// <reference types="@cloudflare/workers-types" />

import { createAgentNoCache } from './create-agent-no-cache';
import { GraphRecursionError } from '@langchain/langgraph';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { D1Backend } from './backend/d1-backend';
import { getChatModel, type Env } from './llm/streaming';
import { createCloudflareExecuteTool, createDirectExecuteTool } from './tools/cloudflare-execute';
import { buildToolsForAgent, buildToolsByIds, type ToolContext } from './tools/loader';
import type { ModelProvider } from './types';

/**
 * Default recursion limit for agent execution.
 * Each tool call + LLM response = 2 supersteps, so 50 allows ~25 tool calls.
 */
const DEFAULT_RECURSION_LIMIT = 50;

export interface DeepAgentConfig {
  db: D1Database;
  sandbox?: unknown; // DurableObjectNamespace<Sandbox> - using unknown for moduleResolution compatibility
  sessionId: string;
  systemPrompt: string;
  modelProvider: ModelProvider;
  modelId: string;
  env: Env;
  availableTools?: string[]; // Tool IDs to load from registry (if omitted, uses default tools)
  agentId?: string; // Agent ID for loading tools from agent_tools table
}

/**
 * Stream event types for AI SDK compatibility
 */
export type StreamEventType =
  | 'message-start'
  | 'text-delta'
  | 'tool-call-start'
  | 'tool-call-args'
  | 'tool-call-end'
  | 'tool-result'
  | 'message-end'
  | 'error'
  | 'recoverable-error'; // Error that allows the conversation to continue

/**
 * Error codes for recoverable errors
 */
export type RecoverableErrorCode =
  | 'recursion_limit' // Agent hit max iterations
  | 'tool_timeout'    // Tool execution timed out
  | 'tool_error'      // Tool execution failed
  | 'rate_limit'      // API rate limit hit
  | 'context_overflow' // Context window exceeded
  | 'provider_parsing_error'; // Provider SDK streaming/parsing error

export interface StreamEvent {
  type: StreamEventType;
  messageId?: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  args?: string;
  result?: string;
  error?: string;
  errorCode?: RecoverableErrorCode; // For recoverable-error events
  recoverable?: boolean;            // Indicates if conversation can continue
}

/**
 * Classify an error and determine if it's recoverable
 * Returns structured error information for the frontend
 */
function classifyError(error: unknown): {
  code: RecoverableErrorCode | undefined;
  message: string;
  recoverable: boolean;
} {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorName = error instanceof Error ? error.name : '';

  // Check for GraphRecursionError (recursion limit exceeded)
  if (error instanceof GraphRecursionError || errorName === 'GraphRecursionError') {
    return {
      code: 'recursion_limit',
      message: `Agent stopped: Maximum iterations (${DEFAULT_RECURSION_LIMIT / 2} tool calls) reached. The task may be too complex or the agent may be stuck in a loop. You can continue the conversation to provide more guidance.`,
      recoverable: true,
    };
  }

  // Check for rate limit errors (common across providers)
  if (
    errorMessage.includes('rate_limit') ||
    errorMessage.includes('rate limit') ||
    errorMessage.includes('429') ||
    errorMessage.includes('Too Many Requests')
  ) {
    return {
      code: 'rate_limit',
      message: 'Rate limit reached. Please wait a moment before sending another message.',
      recoverable: true,
    };
  }

  // Check for context overflow / token limit errors
  if (
    errorMessage.includes('context_length') ||
    errorMessage.includes('context length') ||
    errorMessage.includes('maximum context') ||
    errorMessage.includes('token limit') ||
    errorMessage.includes('too long')
  ) {
    return {
      code: 'context_overflow',
      message: 'The conversation is too long. Try starting a new session or summarizing the previous context.',
      recoverable: true,
    };
  }

  // Check for timeout errors
  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('Timeout') ||
    errorMessage.includes('ETIMEDOUT') ||
    errorMessage.includes('timed out')
  ) {
    return {
      code: 'tool_timeout',
      message: 'A tool execution timed out. The operation took too long to complete. You can try again with a simpler request.',
      recoverable: true,
    };
  }

  // Check for tool execution errors (these are usually recoverable)
  if (
    errorMessage.includes('Tool') ||
    errorMessage.includes('tool') ||
    errorName.includes('Tool')
  ) {
    return {
      code: 'tool_error',
      message: `Tool execution failed: ${errorMessage}. You can continue the conversation.`,
      recoverable: true,
    };
  }

  // Check for provider SDK parsing errors (Gemini 'parts' error, etc.)
  // These happen when the LangChain provider can't parse streaming responses
  if (
    errorMessage.includes("reading 'parts'") ||
    errorMessage.includes('Cannot read properties of undefined') ||
    errorMessage.includes('response parsing') ||
    errorMessage.includes('GoogleGenerativeAI')
  ) {
    return {
      code: 'provider_parsing_error',
      message: 'This model provider is experiencing streaming compatibility issues. Please try a different model (e.g., Claude Sonnet 4.5 or GPT-5.1).',
      recoverable: true,
    };
  }

  // Default: non-recoverable error
  return {
    code: undefined,
    message: errorMessage,
    recoverable: false,
  };
}

/**
 * Add default tools to customTools array (for backward compatibility)
 * Used when no tools are configured via registry
 */
function addDefaultTools(customTools: any[], config: DeepAgentConfig) {
  // Add execute tool if sandbox is available
  if (config.sandbox) {
    // Cast sandbox to expected type - the actual type is DurableObjectNamespace<Sandbox>
    // but we use unknown for moduleResolution compatibility
    const sandboxBinding = config.sandbox as Parameters<typeof createCloudflareExecuteTool>[0]['sandboxBinding'];
    customTools.push(
      createCloudflareExecuteTool({
        sandboxBinding,
        timeout: 5000,
        sandboxId: `playground-${config.sessionId}`,
      })
    );
    customTools.push(
      createDirectExecuteTool({
        sandboxBinding,
        timeout: 5000,
        sandboxId: `playground-${config.sessionId}`,
      })
    );
  }
}

/**
 * Create a playground agent using DeepAgents
 *
 * This uses the deepagents library which provides:
 * - Built-in filesystem tools via BackendProtocol (ls, read_file, write_file, edit_file, glob, grep)
 * - Todo list management
 * - Subagent delegation support
 * - Automatic tool call handling
 *
 * Tool Loading Strategy:
 * 1. If availableTools is provided: Load those specific tools from registry
 * 2. If agentId is provided: Load tools from agent_tools table
 * 3. Otherwise: Use default tools (execute_python for backward compatibility)
 */
export async function createPlaygroundDeepAgent(config: DeepAgentConfig) {
  // Create D1Backend for filesystem operations
  const backend = new D1Backend(config.db, config.sessionId);

  // Get the LangChain model
  const model = getChatModel({
    provider: config.modelProvider,
    modelId: config.modelId,
    env: config.env,
    temperature: 0.7,
  });

  // Build custom tools array (only non-filesystem tools)
  const customTools: any[] = [];

  // Prepare tool context for registry-based tools
  const toolContext: ToolContext = {
    db: config.db,
    sessionId: config.sessionId,
    sandbox: config.sandbox as any,
    env: config.env as any, // Env type is compatible but not strictly Record<string, string>
  };

  // Load tools from registry if configured
  if (config.availableTools && config.availableTools.length > 0) {
    // Explicit list of tool IDs provided
    try {
      const registryTools = await buildToolsByIds(config.db, config.availableTools, toolContext);
      customTools.push(...registryTools);
      console.log(`Loaded ${registryTools.length} tools from registry:`, config.availableTools);
    } catch (error) {
      console.error('Failed to load tools from registry:', error);
    }
  } else if (config.agentId) {
    // Load tools configured for this agent
    try {
      const agentTools = await buildToolsForAgent(config.db, config.agentId, toolContext);
      if (agentTools.length > 0) {
        customTools.push(...agentTools);
        console.log(`Loaded ${agentTools.length} tools for agent ${config.agentId}`);
      } else {
        // No tools configured for agent, fall back to defaults
        console.log(`No tools configured for agent ${config.agentId}, using defaults`);
        addDefaultTools(customTools, config);
      }
    } catch (error) {
      console.error('Failed to load agent tools:', error);
      addDefaultTools(customTools, config);
    }
  } else {
    // No tool configuration, use defaults for backward compatibility
    addDefaultTools(customTools, config);
  }

  // Create the agent with D1Backend using our custom wrapper
  // This excludes anthropicPromptCachingMiddleware which requires OPENAI_API_KEY
  const agent = createAgentNoCache({
    model,
    backend: () => backend, // Factory returns our D1Backend
    systemPrompt: config.systemPrompt,
    tools: customTools,
  });

  return {
    sessionId: config.sessionId,
    systemPrompt: config.systemPrompt,
    modelProvider: config.modelProvider,
    modelId: config.modelId,
    agent,
    backend,

    /**
     * Stream a response to messages, yielding AI SDK-compatible events
     *
     * Uses LangGraph's streamEvents for fine-grained streaming control.
     * The ReactAgent from deepagents supports this via LangGraph.
     */
    async *stream(messages: Array<{ role: string; content: string }>): AsyncGenerator<StreamEvent> {
      const messageId = `msg_${Date.now()}`;
      const DEBUG = false; // Set to true for detailed logging

      try {
        if (DEBUG) console.log('[STREAM] Starting stream, messageId:', messageId);
        yield { type: 'message-start', messageId };

        // Format messages for the agent
        const agentMessages = messages.map((msg) => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
        }));

        // Use streamEvents for granular control over streaming
        // ReactAgent (from createDeepAgent) supports this via LangGraph
        // Set recursion limit to prevent infinite tool loops
        const eventStream = agent.streamEvents(
          { messages: agentMessages },
          { version: 'v2', recursionLimit: DEFAULT_RECURSION_LIMIT }
        );

        // Track tool calls for proper event emission
        const seenToolCalls = new Set<string>();
        const toolArgsAccumulator: Record<string, string> = {};
        // Track pending tool calls that haven't received results yet
        const pendingToolCalls = new Set<string>();
        let currentToolCallId: string | undefined = undefined;
        // Map ToolNode execution IDs to original tool call IDs
        const toolExecutionIdMap: Record<string, string> = {};
        // Track which tool calls have had their args emitted
        const argsEmitted = new Set<string>();
        // Map tool name to pending tool call IDs (for matching on_tool_end by name)
        // Uses array since same tool might be called multiple times
        const pendingToolCallsByName: Record<string, string[]> = {};
        // Map toolCallId to tool name for reverse lookup
        const toolCallIdToName: Record<string, string> = {};

        for await (const { event, data, name: nodeName, run_id } of eventStream) {
          if (DEBUG && !event.includes('stream')) {
            console.log('[STREAM] Event:', event, 'node:', nodeName, 'data keys:', Object.keys(data || {}));
          }

          // Handle streaming text from the chat model
          if (event === 'on_chat_model_stream') {
            const chunk = data.chunk;
            // Extract text content from the chunk
            if (chunk && chunk.content) {
              const content = chunk.content;
              if (typeof content === 'string' && content.length > 0) {
                yield { type: 'text-delta', messageId, text: content };
              } else if (Array.isArray(content)) {
                // Handle array content (e.g., Anthropic format)
                for (const part of content) {
                  if (part.type === 'text' && part.text) {
                    yield { type: 'text-delta', messageId, text: part.text };
                  }
                }
              }
            }

            // Handle tool call chunks from LLM
            if (chunk && chunk.tool_call_chunks && chunk.tool_call_chunks.length > 0) {
              for (const toolChunk of chunk.tool_call_chunks) {
                const toolId = toolChunk.id || `tool_${Date.now()}`;
                if (DEBUG) console.log('[STREAM] Tool chunk:', { id: toolId, name: toolChunk.name, hasArgs: !!toolChunk.args });

                if (toolChunk.name && !seenToolCalls.has(toolId)) {
                  // New tool call starting
                  if (currentToolCallId && currentToolCallId !== toolId && !argsEmitted.has(currentToolCallId)) {
                    // Emit end for previous tool call, emit accumulated args
                    if (toolArgsAccumulator[currentToolCallId]) {
                      if (DEBUG) console.log('[STREAM] Emitting args for previous tool:', currentToolCallId);
                      yield {
                        type: 'tool-call-args',
                        toolCallId: currentToolCallId,
                        args: toolArgsAccumulator[currentToolCallId],
                      };
                      argsEmitted.add(currentToolCallId);
                    }
                    yield { type: 'tool-call-end', toolCallId: currentToolCallId };
                  }
                  currentToolCallId = toolId;
                  seenToolCalls.add(toolId);
                  pendingToolCalls.add(toolId);
                  toolArgsAccumulator[toolId] = '';
                  // Track tool name to ID mapping for matching on_tool_end
                  const toolName = toolChunk.name;
                  if (!pendingToolCallsByName[toolName]) {
                    pendingToolCallsByName[toolName] = [];
                  }
                  pendingToolCallsByName[toolName].push(toolId);
                  toolCallIdToName[toolId] = toolName;
                  if (DEBUG) console.log('[STREAM] Emitting tool-call-start:', toolId, toolName, 'pendingByName:', pendingToolCallsByName);
                  yield {
                    type: 'tool-call-start',
                    toolCallId: currentToolCallId,
                    toolName,
                  };
                }
                // Accumulate tool arguments
                if (toolChunk.args) {
                  toolArgsAccumulator[currentToolCallId || toolId] =
                    (toolArgsAccumulator[currentToolCallId || toolId] || '') + toolChunk.args;
                }
              }
            }
          }

          // When chat model ends, emit final tool call args if any
          if (event === 'on_chat_model_end') {
            if (DEBUG) console.log('[STREAM] on_chat_model_end, currentToolCallId:', currentToolCallId, 'argsEmitted:', Array.from(argsEmitted));
            if (currentToolCallId && !argsEmitted.has(currentToolCallId)) {
              if (toolArgsAccumulator[currentToolCallId]) {
                if (DEBUG) console.log('[STREAM] Emitting tool-call-args:', currentToolCallId);
                yield {
                  type: 'tool-call-args',
                  toolCallId: currentToolCallId,
                  args: toolArgsAccumulator[currentToolCallId],
                };
                argsEmitted.add(currentToolCallId);
              }
              if (DEBUG) console.log('[STREAM] Emitting tool-call-end:', currentToolCallId);
              yield { type: 'tool-call-end', toolCallId: currentToolCallId };
            }
            // Reset for next LLM turn (after tool results come back)
            currentToolCallId = undefined;
          }

          // Handle tool start from ToolNode
          if (event === 'on_tool_start') {
            const toolCallId = data.input?.tool_call_id || run_id || currentToolCallId;
            if (DEBUG) console.log('[STREAM] on_tool_start, run_id:', run_id, 'toolCallId:', toolCallId);
            if (run_id && toolCallId) {
              toolExecutionIdMap[run_id] = toolCallId;
            }
          }

          // Handle tool execution results from ToolNode
          if (event === 'on_tool_end') {
            // Try to get tool call ID from our map, or fall back to looking up by tool name
            let toolCallId = toolExecutionIdMap[run_id] || run_id;

            // If we don't have a valid toolCallId, try to match by tool name (nodeName)
            if (!toolCallId && nodeName && pendingToolCallsByName[nodeName]?.length > 0) {
              // Get the first pending tool call for this tool name (FIFO order)
              const matchedId = pendingToolCallsByName[nodeName].shift();
              if (matchedId) {
                toolCallId = matchedId;
              }
              if (DEBUG) console.log('[STREAM] Matched tool result by name:', nodeName, '-> toolCallId:', toolCallId);
            }

            if (DEBUG) console.log('[STREAM] on_tool_end, run_id:', run_id, 'nodeName:', nodeName, 'resolved toolCallId:', toolCallId);

            // Get the output - ToolNode returns a ToolMessage
            let result: string;
            if (data.output instanceof ToolMessage) {
              result = typeof data.output.content === 'string'
                ? data.output.content
                : JSON.stringify(data.output.content);
            } else if (typeof data.output === 'string') {
              result = data.output;
            } else {
              result = JSON.stringify(data.output);
            }

            if (DEBUG) console.log('[STREAM] Emitting tool-result for:', toolCallId, 'toolName:', nodeName);
            yield {
              type: 'tool-result',
              toolCallId,
              toolName: nodeName, // Include tool name for frontend fallback
              result,
            };

            // Mark this tool call as completed
            if (toolCallId) {
              pendingToolCalls.delete(toolCallId);
              // Also remove from toolCallIdToName
              delete toolCallIdToName[toolCallId];
            }
            if (DEBUG) console.log('[STREAM] Remaining pending tool calls:', Array.from(pendingToolCalls));
          }
        }

        if (DEBUG) console.log('[STREAM] Stream ended, emitting message-end');
        yield { type: 'message-end', messageId };
      } catch (error) {
        // Classify the error and determine if it's recoverable
        const errorInfo = classifyError(error);
        console.error('[STREAM] Error:', errorInfo.code, errorInfo.message);

        if (errorInfo.recoverable) {
          // Emit recoverable error - frontend can continue the conversation
          yield {
            type: 'recoverable-error',
            messageId,
            error: errorInfo.message,
            errorCode: errorInfo.code,
            recoverable: true,
          };
          // Still emit message-end so frontend knows the stream is done
          yield { type: 'message-end', messageId };
        } else {
          // Fatal error - emit standard error event
          yield {
            type: 'error',
            messageId,
            error: errorInfo.message,
            recoverable: false,
          };
        }
      }
    },

    /**
     * Non-streaming invoke for simple use cases
     */
    async invoke(messages: Array<{ role: string; content: string }>): Promise<string> {
      const agentMessages = messages.map((msg) => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      }));

      const result = await agent.invoke({ messages: agentMessages });

      // Extract the last assistant message content
      if (result.messages && result.messages.length > 0) {
        const lastMessage = result.messages[result.messages.length - 1];
        if (typeof lastMessage.content === 'string') {
          return lastMessage.content;
        }
        return JSON.stringify(lastMessage.content);
      }

      return '';
    },
  };
}

export type PlaygroundDeepAgent = ReturnType<typeof createPlaygroundDeepAgent>;
