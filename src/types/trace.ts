export interface LangGraphExecutionStep {
  step_id: string;
  trace_id: string;
  timestamp: string; // ISO 8601
  messages_added: Message[];
  tool_calls: ToolCall[];
  input: any;
  output: any;
  metadata: Record<string, any>;
  error?: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ToolCall {
  tool_name: string;
  arguments: Record<string, any>;
  result?: any;
  error?: string;
}

export interface Trace {
  id: string;
  trace_id: string;
  steps: LangGraphExecutionStep[];
  source: 'langfuse' | 'langsmith' | 'openai' | 'playground';
  raw_data: any;
}
