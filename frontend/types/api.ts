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
  raw_data?: {
    observations?: any[];
    [key: string]: any;
  };
  summary?: {
    input_preview?: string;
    output_preview?: string;
    has_errors?: boolean;
  };
}

export interface TraceSummary {
  id: string;
  trace_id: string;
  source: string;
  timestamp: string;
  step_count: number;
  agent_id?: string | null;
  agent_version_id?: string | null;
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
  description: string | null;
  agent_id: string;
  accuracy: number;
  cohen_kappa?: number | null;  // Agreement accounting for chance (0-1)
  f1_score?: number | null;     // Harmonic mean of precision and recall (0-1)
  precision?: number | null;    // True positives / (TP + FP) (0-1)
  recall?: number | null;       // True positives / (TP + FN) (0-1)
  execution_count: number;
  contradiction_count: number;
  created_at: string;
  updated_at: string;
}

export interface Feedback {
  id: string;
  trace_id: string;
  agent_id?: string;  // Now optional - feedback is 1:1 with trace
  rating: 'positive' | 'negative' | 'neutral';
  notes: string | null;
  created_at: string;
  user_id?: string;
  agent_name?: string;
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
  cohen_kappa?: number | null;  // Agreement accounting for chance (0-1)
  f1_score?: number | null;     // Harmonic mean of precision and recall (0-1)
  precision?: number | null;    // True positives / (TP + FP) (0-1)
  recall?: number | null;       // True positives / (TP + FN) (0-1)
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
  type: 'import' | 'generate' | 'execute' | 'taskset_run' | 'agent_discovery' | 'gepa_optimization' | 'rollout_task';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0-100
  metadata?: Record<string, unknown>;
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
  agent_id?: string;  // Now optional - feedback is 1:1 with trace
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

// ============================================================================
// Playground
// ============================================================================

export interface PlaygroundRunRequest {
  code: string;
  trace_ids: string[];
}

export interface PlaygroundResult {
  trace_id: string;
  human_feedback: 'positive' | 'negative' | 'neutral' | null;
  score: number;
  feedback: string;
  is_match: boolean | null;
  is_contradiction: boolean;
  execution_time_ms: number;
  error: string | null;
  stdout: string | null;
}

export interface PlaygroundRunResponse {
  results: PlaygroundResult[];
  summary: {
    total: number;
    matches: number;
    contradictions: number;
    avg_time_ms: number;
  };
}
