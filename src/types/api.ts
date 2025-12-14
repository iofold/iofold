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
  // Eval generation fields
  name?: string;
  description?: string;
  model?: string;
  custom_instructions?: string;
  // Import job fields
  integration_id?: string;
  filters?: Record<string, any>;
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
  expected: number; // 0.0 = low quality, 1.0 = high quality
  predicted: number;
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
  | { type: 'log'; data: JobLogData }
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

export interface JobLogData {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  [key: string]: any; // Additional metadata fields
}

// Rollout Types for GEPA Integration
export interface BatchRolloutRequest {
  agent_id: string;
  agent_version_id?: string;      // Optional, defaults to active version
  system_prompt: string;          // Candidate prompt to test (overrides agent default)
  tasks: Array<{
    task_id: string;
    user_message: string;
    context?: Record<string, any>;
  }>;
  config?: {
    parallelism?: number;         // Max concurrent executions (default: 5)
    timeout_per_task_ms?: number; // Per-task timeout (default: 30000)
    model_id?: string;            // Override model
  };
}

export interface BatchRolloutResponse {
  batch_id: string;
  task_count: number;
  status: 'queued';
  created_at: string;
}

export interface BatchStatusResponse {
  batch_id: string;
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed';
  progress: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
  };
  results: Array<{
    task_id: string;
    status: 'completed' | 'failed' | 'timeout';
    trace?: any[]; // LangGraphExecutionStep[]
    execution_time_ms?: number;
    error?: string;
  }>;
  created_at: string;
  completed_at?: string;
}

export interface RolloutTaskMessage {
  type: 'rollout_task';
  batch_id: string;
  task_id: string;
  agent_id: string;
  agent_version_id?: string;
  system_prompt: string;
  user_message: string;
  context?: Record<string, any>;
  config?: {
    parallelism?: number;
    timeout_per_task_ms?: number;
    model_id?: string;
  };
}
