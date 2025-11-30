// ============================================================================
// Core Entities
// ============================================================================

export interface Trace {
  id: string;
  trace_id: string;
  source: 'langfuse' | 'langsmith' | 'openai';
  timestamp: string; // ISO 8601
  metadata: Record<string, any>;
  steps: ExecutionStep[];
  feedback?: Feedback;
}

export interface TraceSummary {
  id: string;
  trace_id: string;
  source: string;
  timestamp: string;
  step_count: number;
  feedback?: Feedback;
  summary: {
    input_preview: string;
    output_preview: string;
    has_errors: boolean;
  };
}

export interface ExecutionStep {
  step_id: string;
  timestamp: string;
  messages_added: Message[];
  tool_calls: ToolCall[];
  input: any;
  output: any;
  error?: string;
  metadata: Record<string, any>;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, any>;
}

export interface ToolCall {
  tool_name: string;
  arguments: Record<string, any>;
  result?: any;
  error?: string;
}

// ============================================================================
// Feedback
// ============================================================================

export interface EvalSummary {
  id: string;
  name: string;
  accuracy: number;
  created_at: string;
}

export interface Feedback {
  id: string;
  trace_id: string;
  agent_id: string;
  rating: 'positive' | 'negative' | 'neutral';
  notes: string | null;
  created_at: string;
}

// ============================================================================
// Evals
// ============================================================================

export interface Eval {
  id: string;
  name: string;
  description: string | null;
  agent_id: string;
  code: string;
  model_used: string;
  accuracy: number;
  test_results: TestResults;
  execution_count: number;
  contradiction_count: number;
  created_at: string;
  updated_at: string;
}

export interface TestResults {
  correct: number;
  incorrect: number;
  errors: number;
  total: number;
  details: TestCaseResult[];
}

export interface TestCaseResult {
  trace_id: string;
  expected: boolean;
  predicted: boolean;
  match: boolean;
  reason: string;
  execution_time_ms: number;
  error?: string;
}

// ============================================================================
// Eval Execution & Matrix
// ============================================================================

export interface EvalExecution {
  id: string;
  trace_id: string;
  eval_id: string;
  predicted_result: boolean;
  predicted_reason: string;
  execution_time_ms: number;
  error?: string;
  stdout?: string;
  stderr?: string;
  executed_at: string;
}

export interface EvalExecutionWithContext extends EvalExecution {
  human_feedback?: {
    rating: 'positive' | 'negative' | 'neutral';
    notes: string | null;
  };
  is_contradiction: boolean;
  trace_summary?: {
    trace_id: string;
    input_preview: string;
    output_preview: string;
    source: string;
  };
}

export interface MatrixRow {
  trace_id: string;
  trace_summary: {
    timestamp: string;
    input_preview: string;
    output_preview: string;
    source: string;
  };
  human_feedback: {
    rating: 'positive' | 'negative' | 'neutral';
    notes: string | null;
  } | null;
  predictions: {
    [eval_id: string]: {
      result: boolean;
      reason: string;
      execution_time_ms: number;
      error?: string;
      is_contradiction: boolean;
    } | null;
  };
}

export interface MatrixStats {
  total_traces: number;
  traces_with_feedback: number;
  per_eval: {
    [eval_id: string]: {
      eval_name: string;
      accuracy: number | null;
      contradiction_count: number;
      error_count: number;
      avg_execution_time_ms: number | null;
    };
  };
}

// ============================================================================
// Jobs
// ============================================================================

export interface Job {
  id: string;
  type: 'import' | 'generate' | 'execute';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0-100
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  result?: any;
  error?: string;
}

// ============================================================================
// Integrations
// ============================================================================

export interface Integration {
  id: string;
  platform: 'langfuse' | 'langsmith' | 'openai';
  name: string;
  status: 'active' | 'error';
  error_message?: string;
  last_synced_at: string | null;
  created_at: string;
}

// ============================================================================
// Pagination
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface PaginatedResponseWithCount<T> extends PaginatedResponse<T> {
  total_count: number;
}

// ============================================================================
// Errors
// ============================================================================

export interface APIError {
  error: {
    code: string;
    message: string;
    details?: any;
    request_id: string;
  };
}

// ============================================================================
// SSE Events
// ============================================================================

export type SSEEvent =
  | { type: 'job_progress'; job_id: string; status: string; progress: number }
  | { type: 'job_completed'; job_id: string; result: any }
  | { type: 'job_failed'; job_id: string; error: string }
  | { type: 'feedback_added'; trace_id: string; rating: string; stats: any }
  | { type: 'threshold_reached'; ready_to_generate: boolean }
  | { type: 'eval_generated'; eval_id: string; accuracy: number }
  | { type: 'execution_completed'; eval_id: string; trace_id: string };

// ============================================================================
// Request Types
// ============================================================================

export interface CreateIntegrationRequest {
  platform: 'langfuse' | 'langsmith' | 'openai';
  api_key: string;
  base_url?: string;
  name?: string;
}

export interface ImportTracesRequest {
  integration_id: string;
  filters?: {
    date_from?: string;
    date_to?: string;
    tags?: string[];
    user_ids?: string[];
    limit?: number;
  };
}

export interface SubmitFeedbackRequest {
  trace_id: string;
  agent_id: string;
  rating: 'positive' | 'negative' | 'neutral';
  notes?: string;
}

export interface UpdateFeedbackRequest {
  rating?: 'positive' | 'negative' | 'neutral';
  notes?: string;
}

export interface GenerateEvalRequest {
  name: string;
  description?: string;
  model?: string;
  custom_instructions?: string;
}

export interface UpdateEvalRequest {
  name?: string;
  description?: string;
  code?: string;
}

export interface ExecuteEvalRequest {
  trace_ids?: string[];
  force?: boolean;
}

// ============================================================================
// Response Types
// ============================================================================

export interface ListTracesResponse extends PaginatedResponseWithCount<TraceSummary> {
  traces: TraceSummary[];
}

export interface ListEvalsResponse extends PaginatedResponse<Eval> {
  evals: Eval[];
}

export interface MatrixResponse extends PaginatedResponse<MatrixRow> {
  rows: MatrixRow[];
  stats: MatrixStats;
}

export interface ListIntegrationsResponse {
  integrations: Integration[];
}

export interface JobResponse {
  job_id: string;
  status: string;
  estimated_count?: number;
}

export interface ListEvalExecutionsResponse extends PaginatedResponse<EvalExecutionWithContext> {
  executions: EvalExecutionWithContext[];
}
