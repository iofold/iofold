/**
 * TraceCollector - Modular tracing interface for Agents Playground
 *
 * Mirrors Langfuse/LangSmith callback patterns for familiarity.
 * Buffers events in memory and converts to LangGraphExecutionStep format on flush.
 */

/**
 * Base trace event interface
 */
export interface TraceEvent {
  type: 'span_start' | 'span_end' | 'generation' | 'tool_call' | 'tool_result';
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  timestamp: string; // ISO 8601
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
 * Metadata for trace initialization
 */
export interface TraceMetadata {
  sessionId: string;
  agentId: string;
  agentVersionId: string;
  workspaceId: string;
  modelProvider: string;
  modelId: string;
  /** Optional integration ID for trace storage */
  integrationId?: string;
  /** Optional source override (default: 'playground') */
  source?: 'playground' | 'taskset' | 'langfuse' | 'langsmith' | 'openai';
  /** Custom metadata to store with the trace */
  customMetadata?: Record<string, unknown>;
}

/**
 * Span start event
 */
export interface SpanStartEvent {
  traceId: string;
  parentSpanId?: string;
  name: string;
  input?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Generation event (LLM call)
 */
export interface GenerationEvent {
  traceId: string;
  spanId: string;
  name: string;
  input: unknown;
  output?: unknown;
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
  traceId: string;
  spanId: string;
  toolName: string;
  input: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Abstract TraceCollector interface
 *
 * Implementations must:
 * 1. Buffer events in memory
 * 2. Convert to LangGraphExecutionStep format on flush
 * 3. Persist to storage backend
 */
export interface TraceCollector {
  /**
   * Initialize a new trace
   */
  startTrace(traceId: string, metadata: TraceMetadata): void;

  /**
   * Finalize a trace and trigger flush
   */
  endTrace(traceId: string, output?: unknown): Promise<void>;

  /**
   * Start a new span (LLM call, tool execution, etc.)
   * Returns the generated span ID
   */
  startSpan(event: SpanStartEvent): string;

  /**
   * End a span with optional output or error
   */
  endSpan(spanId: string, output?: unknown, error?: string): void;

  /**
   * Log an LLM generation event
   */
  logGeneration(event: GenerationEvent): void;

  /**
   * Log a tool call event
   */
  logToolCall(event: ToolCallEvent): void;

  /**
   * Log a tool result
   */
  logToolResult(spanId: string, result: unknown, error?: string): void;

  /**
   * Flush buffered events to storage
   */
  flush(): Promise<void>;

  /**
   * Get the current trace ID
   */
  getCurrentTraceId(): string | undefined;

  /**
   * Clear buffered events (for testing)
   */
  clear(): void;
}
