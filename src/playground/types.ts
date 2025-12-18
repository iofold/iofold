// src/playground/types.ts
// Type definitions for Agents Playground feature

import { Message } from '../types/trace';

/**
 * Model provider for LLM API calls
 */
export type ModelProvider = 'anthropic' | 'openai' | 'google';

/**
 * Step type for playground execution tracing
 */
export type PlaygroundStepType = 'llm_call' | 'tool_call' | 'tool_result';

/**
 * Playground session - persists agent conversation state across page refreshes
 *
 * Contains:
 * - Conversation history (messages)
 * - Template variable values
 * - Virtual filesystem state
 * - Model configuration
 */
export interface PlaygroundSession {
  id: string;
  workspaceId: string;
  agentId: string;
  agentVersionId: string;

  /** Conversation history in LangGraph Message format */
  messages: Message[];

  /** Template variable values for prompt rendering */
  variables: Record<string, string>;

  /** Virtual filesystem state (path -> content) */
  files: Record<string, string>;

  /** LLM provider (anthropic, openai, google) */
  modelProvider: ModelProvider;

  /** Specific model ID (e.g., 'claude-sonnet-4-5-20250929') */
  modelId: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * Playground execution step - granular trace of each LLM call or tool invocation
 *
 * Used for:
 * - Debugging agent behavior
 * - Generating evals from playground sessions
 * - Performance monitoring
 */
export interface PlaygroundStep {
  id: string;
  sessionId: string;
  traceId: string;

  /** Sequential step number within session */
  stepIndex: number;

  /** Type of step (llm_call, tool_call, tool_result) */
  stepType: PlaygroundStepType;

  /** Input to the step (prompt for LLM, args for tool) */
  input?: unknown;

  /** Output from the step (LLM response, tool result) */
  output?: unknown;

  /** Tool name (for tool_call and tool_result steps) */
  toolName?: string;

  /** Tool arguments (for tool_call steps) */
  toolArgs?: Record<string, unknown>;

  /** Tool execution result (for tool_result steps) */
  toolResult?: unknown;

  /** Tool execution error (for tool_result steps) */
  toolError?: string;

  /** Step execution time in milliseconds */
  latencyMs?: number;

  /** Input tokens (for llm_call steps) */
  tokensInput?: number;

  /** Output tokens (for llm_call steps) */
  tokensOutput?: number;

  timestamp: string;
}

/**
 * Trace event for modular trace collection
 *
 * Mirrors Langfuse/LangSmith callback patterns for easy adapter swapping
 */
export interface TraceEvent {
  type: 'span_start' | 'span_end' | 'generation' | 'tool_call' | 'tool_result';
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  timestamp: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  latencyMs?: number;
  error?: string;
}

/**
 * Trace metadata for playground sessions
 */
export interface TraceMetadata {
  source: 'playground';
  sessionId: string;
  agentId: string;
  agentVersionId: string;
  modelProvider: ModelProvider;
  modelId: string;
  [key: string]: unknown;
}

/**
 * Span start event
 */
export interface SpanStartEvent {
  name: string;
  parentSpanId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Generation event (LLM call)
 */
export interface GenerationEvent {
  spanId: string;
  name: string;
  input: unknown;
  output: unknown;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Tool call event
 */
export interface ToolCallEvent {
  spanId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Abstract trace collector interface
 *
 * Implementations:
 * - D1CallbackHandler: LangChain callback handler for tracing to D1
 * - LangfuseCollector: Exports to Langfuse (future)
 * - ConsoleCollector: Debug logging (dev only)
 */
export interface TraceCollector {
  /**
   * Start a new trace with metadata
   */
  startTrace(traceId: string, metadata: TraceMetadata): void;

  /**
   * End the current trace
   */
  endTrace(traceId: string, output?: unknown): Promise<void>;

  /**
   * Start a new span within the trace
   * @returns spanId
   */
  startSpan(event: SpanStartEvent): string;

  /**
   * End a span with output or error
   */
  endSpan(spanId: string, output?: unknown, error?: string): void;

  /**
   * Log an LLM generation
   */
  logGeneration(event: GenerationEvent): void;

  /**
   * Log a tool call
   */
  logToolCall(event: ToolCallEvent): void;

  /**
   * Log a tool result
   */
  logToolResult(spanId: string, result: unknown, error?: string): void;

  /**
   * Flush all buffered events to storage
   */
  flush(): Promise<void>;
}

/**
 * Database row types (matches SQL schema exactly)
 */
export interface PlaygroundSessionRow {
  id: string;
  workspace_id: string;
  agent_id: string;
  agent_version_id: string;
  messages: string; // JSON
  variables: string; // JSON
  files: string; // JSON
  model_provider: string;
  model_id: string;
  created_at: string;
  updated_at: string;
}

export interface PlaygroundStepRow {
  id: string;
  session_id: string;
  trace_id: string;
  step_index: number;
  step_type: string;
  input: string | null; // JSON
  output: string | null; // JSON
  tool_name: string | null;
  tool_args: string | null; // JSON
  tool_result: string | null; // JSON
  tool_error: string | null;
  latency_ms: number | null;
  tokens_input: number | null;
  tokens_output: number | null;
  timestamp: string;
}
