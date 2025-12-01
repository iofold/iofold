// src/types/playground.ts
// Type definitions for playground sessions and interactions

export type ModelProvider = 'anthropic' | 'openai' | 'google';

export interface PlaygroundSession {
  id: string;
  workspace_id: string;
  agent_id: string;
  agent_version_id: string;
  messages: Message[];
  variables: Record<string, string>;
  files: Record<string, string>;
  model_provider: ModelProvider;
  model_id: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface PlaygroundStep {
  id: string;
  session_id: string;
  trace_id: string;
  step_index: number;
  step_type: 'llm_call' | 'tool_call' | 'tool_result';
  input?: unknown;
  output?: unknown;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  tool_result?: unknown;
  tool_error?: string;
  latency_ms?: number;
  tokens_input?: number;
  tokens_output?: number;
  timestamp: string;
}

// AI SDK SSE Event Types
export type SSEEvent =
  | { type: 'start'; messageId: string }
  | { type: 'text-delta'; id: string; delta: string }
  | { type: 'tool-input-start'; toolCallId: string; toolName: string }
  | { type: 'tool-input-available'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-output-available'; toolCallId: string; output: unknown }
  | { type: 'text-end'; id: string }
  | { type: 'finish'; sessionId: string; traceId: string }
  | { type: 'error'; errorText: string };

// API Request/Response types
export interface PlaygroundChatRequest {
  messages: Message[];
  sessionId?: string;
  variables?: Record<string, string>;
  modelProvider?: ModelProvider;
  modelId?: string;
}

export interface PlaygroundSessionResponse {
  id: string;
  workspaceId: string;
  agentId: string;
  agentVersionId: string;
  messages: Message[];
  variables: Record<string, string>;
  files: Record<string, string>;
  modelProvider: ModelProvider;
  modelId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListSessionsResponse {
  sessions: {
    id: string;
    agentVersionId: string;
    modelProvider: ModelProvider;
    modelId: string;
    createdAt: string;
    updatedAt: string;
  }[];
}
