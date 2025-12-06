// API Types following the specification in docs/plans/2025-11-12-api-specification.md

export interface APIError {
  error: {
    code: string;
    message: string;
    details?: any;
    request_id: string;
  };
}

// Job Types
export type JobType = 'import' | 'generate' | 'execute' | 'monitor' | 'auto_refine' | 'agent_discovery' | 'prompt_improvement' | 'template_drift' | 'eval_revalidation' | 'prompt_evaluation';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  workspace_id: string;
  type: JobType;
  status: JobStatus;
  progress: number; // 0-100
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  result?: any;
  error?: string;
}

export interface JobMetadata {
  evalId?: string;
  traceIds?: string[];
  workspaceId: string;
  // Agent management fields
  agentId?: string;
  agentVersionId?: string;
  triggerEvent?: string;
  triggerThreshold?: string;
}

// Eval Generation Types
export interface GenerateEvalRequest {
  name: string;
  description?: string;
  model?: string;
  custom_instructions?: string;
}

export interface GenerateEvalJobResult {
  eval_id: string;
  accuracy: number;
  test_results: TestResults;
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

// Eval Execution Types
export interface ExecuteEvalRequest {
  trace_ids?: string[];
  force?: boolean;
}

export interface ExecuteEvalJobResult {
  completed: number;
  failed: number;
  errors: Array<{
    trace_id: string;
    error: string;
  }>;
}

// Eval Types
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

export interface EvalSummary {
  id: string;
  name: string;
  description: string | null;
  agent_id: string;
  accuracy: number;
  execution_count: number;
  contradiction_count: number;
  created_at: string;
  updated_at: string;
}

export interface UpdateEvalRequest {
  name?: string;
  description?: string;
  code?: string;
}

// SSE Event Types
export type SSEEvent =
  | { type: 'progress'; data: JobProgressData }
  | { type: 'completed'; data: JobCompletedData }
  | { type: 'failed'; data: JobFailedData }
  | { type: 'heartbeat' };

export interface JobProgressData {
  status: string;
  progress: number;
  [key: string]: any; // Additional progress-specific fields
}

export interface JobCompletedData {
  status: 'completed';
  result: any;
}

export interface JobFailedData {
  status: 'failed';
  error: string;
  details?: string;
}
