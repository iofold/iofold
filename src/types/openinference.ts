/**
 * OpenInference Span and Trace Type Definitions
 *
 * Based on OpenInference semantic conventions for LLM observability.
 * Supports importing traces from multiple sources (Langfuse, LangSmith, OpenAI, Phoenix Arize, Playground).
 */

/**
 * OpenInference span kind types
 */
export type OpenInferenceSpanKind =
  | 'LLM'
  | 'TOOL'
  | 'AGENT'
  | 'CHAIN'
  | 'RETRIEVER'
  | 'EMBEDDING'
  | 'RERANKER';

/**
 * Span execution status
 */
export type OpenInferenceSpanStatus = 'OK' | 'ERROR' | 'UNSET';

/**
 * Message role types
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Tool call request structure (LLM requesting to call a tool)
 */
export interface ToolCallRequest {
  /** Unique identifier for this tool call */
  id: string;
  /** Function to be called */
  function: {
    /** Name of the function/tool */
    name: string;
    /** Arguments as JSON string per OpenAI spec */
    arguments: string;
  };
}

/**
 * Message in a conversation
 */
export interface OpenInferenceMessage {
  /** Role of the message sender */
  role: MessageRole;
  /** Message content */
  content: string;
  /** Tool calls requested by LLM (only for assistant messages) */
  tool_calls?: ToolCallRequest[];
  /** Reference to tool call ID (only for tool result messages) */
  tool_call_id?: string;
}

/**
 * LLM-specific span attributes (when span_kind = 'LLM')
 */
export interface OpenInferenceLLM {
  /** Model identifier (e.g., 'gpt-4', 'claude-3-opus') */
  model_name?: string;
  /** Provider name (e.g., 'openai', 'anthropic') */
  provider?: string;
  /** Input messages to the LLM */
  input_messages: OpenInferenceMessage[];
  /** Output messages from the LLM (includes tool_calls if LLM requested them) */
  output_messages: OpenInferenceMessage[];
  /** Number of tokens in the prompt */
  token_count_prompt?: number;
  /** Number of tokens in the completion */
  token_count_completion?: number;
  /** Total tokens used (prompt + completion) */
  token_count_total?: number;
}

/**
 * Tool-specific span attributes (when span_kind = 'TOOL')
 */
export interface OpenInferenceTool {
  /** Name of the tool */
  name: string;
  /** Tool description */
  description?: string;
  /** Input parameters/arguments */
  parameters?: Record<string, unknown>;
  /** Tool execution result */
  output?: unknown;
}

/**
 * OpenInference-compliant span structure
 */
export interface OpenInferenceSpan {
  // Core identifiers
  /** Unique span identifier */
  span_id: string;
  /** Trace identifier (groups related spans) */
  trace_id: string;
  /** Parent span identifier (if this is a child span) */
  parent_span_id?: string;

  // OpenInference span kind (required)
  /** Type of span operation */
  span_kind: OpenInferenceSpanKind;

  // Timing and status
  /** Human-readable span name */
  name: string;
  /** ISO 8601 timestamp when span started */
  start_time: string;
  /** ISO 8601 timestamp when span ended */
  end_time?: string;
  /** Execution status */
  status: OpenInferenceSpanStatus;
  /** Optional status message (e.g., error details) */
  status_message?: string;

  // LLM-specific attributes (when span_kind = 'LLM')
  /** LLM interaction details */
  llm?: OpenInferenceLLM;

  // Tool-specific attributes (when span_kind = 'TOOL')
  /** Tool execution details */
  tool?: OpenInferenceTool;

  // Generic input/output for other span kinds
  /** Generic input data (for non-LLM/TOOL spans) */
  input?: unknown;
  /** Generic output data (for non-LLM/TOOL spans) */
  output?: unknown;

  // Catch-all for source-specific attributes
  /** Additional source-specific attributes */
  attributes?: Record<string, unknown>;

  // Original source span ID for debugging
  /** Original span ID from source system (for traceability) */
  source_span_id?: string;
}

/**
 * OpenInference trace containing multiple spans
 */
export interface OpenInferenceTrace {
  /** Unique trace record ID */
  id: string;
  /** Workspace identifier */
  workspace_id: string;
  /** Trace identifier (groups related spans) */
  trace_id: string;
  /** Source system (e.g., 'langfuse', 'langsmith', 'playground') */
  source: string;
  /** ISO 8601 timestamp when trace was created/imported */
  timestamp: string;

  // Trace data
  /** Array of OpenInference spans */
  spans: OpenInferenceSpan[];
  /** Original raw trace data for debugging/unmapped attributes */
  raw_data?: unknown;

  // Summary fields
  /** Total number of spans in this trace */
  span_count?: number;
  /** Total tokens consumed across all LLM spans */
  total_tokens?: number;
  /** Total duration in milliseconds */
  total_duration_ms?: number;
}
