/**
 * Cloudflare Queue message type definitions for background job processing
 */

import type { JobType } from './api';
import type { ErrorCategory } from '../errors/classifier';

/**
 * Queue message structure for job processing
 */
export interface QueueMessage {
  /** Unique job identifier */
  job_id: string;
  /** Job type determines which handler processes the message */
  type: JobType | 'monitor' | 'auto_refine' | 'agent_discovery' | 'prompt_improvement' | 'prompt_evaluation' | 'template_drift' | 'eval_revalidation' | 'rollout_task' | 'gepa_optimization';
  /** Workspace this job belongs to */
  workspace_id: string;
  /** Job-specific payload data */
  payload: JobPayload;
  /** Current attempt number (starts at 1) */
  attempt: number;
  /** ISO timestamp when message was created */
  created_at: string;

  // Retry metadata
  /** Last error category for retry decisions */
  error_category?: ErrorCategory;
  /** ISO timestamp of last error */
  last_error_at?: string;
  /** Retry history for debugging */
  retry_history?: RetryAttempt[];
}

/**
 * Retry attempt record for tracking retry history
 */
export interface RetryAttempt {
  attempt: number;
  error: string;
  error_category: ErrorCategory;
  delay_ms: number;
  timestamp: string;
}

/**
 * Union type for all job payloads
 */
export type JobPayload =
  | ImportJobPayload
  | GenerateJobPayload
  | ExecuteJobPayload
  | MonitorJobPayload
  | AutoRefineJobPayload
  | AgentDiscoveryJobPayload
  | PromptImprovementJobPayload
  | PromptEvaluationJobPayload
  | RolloutTaskPayload
  | GEPAOptimizationJobPayload;

/**
 * Payload for trace import jobs
 */
export interface ImportJobPayload {
  type: 'import';
  integration_id: string;
  filters?: {
    limit?: number;
    from_date?: string;
    to_date?: string;
  };
}

/**
 * Payload for eval generation jobs
 */
export interface GenerateJobPayload {
  type: 'generate';
  agent_id: string;
  name: string;
  description?: string;
  model?: string;
  custom_instructions?: string;
  /** Parent eval ID for refinement jobs */
  parent_eval_id?: string;
  /** Include contradicting cases in generation */
  include_contradictions?: boolean;
}

/**
 * Payload for eval execution jobs
 */
export interface ExecuteJobPayload {
  type: 'execute';
  eval_id: string;
  /** Specific trace IDs to execute on, or all if not specified */
  trace_ids?: string[];
}

/**
 * Payload for monitoring jobs (triggered by cron)
 */
export interface MonitorJobPayload {
  type: 'monitor';
  /** Specific eval IDs to monitor, or all active if not specified */
  eval_ids?: string[];
  /** Time window for metrics calculation in days */
  window_days?: number;
}

/**
 * Payload for auto-refinement jobs
 */
export interface AutoRefineJobPayload {
  type: 'auto_refine';
  eval_id: string;
  /** Alert that triggered this refinement */
  alert_id: string;
  /** Metrics that triggered the refinement */
  trigger_metrics: {
    accuracy?: number;
    contradiction_rate?: number;
    error_rate?: number;
  };
}

/**
 * Payload for agent discovery jobs
 */
export interface AgentDiscoveryJobPayload {
  type: 'agent_discovery';
  /** Similarity threshold for clustering (default: 0.85) */
  similarity_threshold?: number;
  /** Minimum cluster size to create an agent (default: 5) */
  min_cluster_size?: number;
  /** Maximum traces to process in one job (default: 100) */
  max_traces?: number;
}

/**
 * Payload for prompt improvement jobs
 */
export interface PromptImprovementJobPayload {
  type: 'prompt_improvement';
  /** Agent ID to improve */
  agent_id: string;
  /** Maximum contradictions to analyze (default: 20) */
  max_contradictions?: number;
}

/**
 * Payload for prompt evaluation jobs
 */
export interface PromptEvaluationJobPayload {
  type: 'prompt_evaluation';
  /** Agent version ID (candidate) to evaluate */
  agent_version_id: string;
  /** Maximum traces to evaluate (default: 50) */
  max_traces?: number;
}

/**
 * Payload for rollout task execution (GEPA integration)
 */
export interface RolloutTaskPayload {
  type: 'rollout_task';
  /** Batch ID this task belongs to */
  batch_id: string;
  /** Unique task identifier within the batch */
  task_id: string;
  /** Agent ID to execute */
  agent_id: string;
  /** Optional agent version to use */
  agent_version_id?: string;
  /** Candidate system prompt to test */
  system_prompt: string;
  /** User message to send to agent */
  user_message: string;
  /** Optional context for the task */
  context?: Record<string, any>;
  /** Task execution configuration */
  config?: {
    parallelism?: number;
    timeout_per_task_ms?: number;
    model_id?: string;
  };
}

/**
 * Payload for GEPA optimization job
 */
export interface GEPAOptimizationJobPayload {
  type: 'gepa_optimization';
  /** GEPA run ID in gepa_runs table */
  run_id: string;
  /** Agent ID to optimize */
  agent_id: string;
  /** Eval ID to use for scoring */
  eval_id?: string;
  /** Eval code (if not using eval_id) */
  eval_code?: string;
  /** Seed prompt to optimize from */
  seed_prompt: string;
  /** Test cases for optimization (passed directly, not stored in DB) */
  test_cases: Array<{
    user_message: string;
    expected_output?: string;
  }>;
  /** Train/val split ratio (default: 0.7) */
  train_split?: number;
  /** Maximum metric calls (default: 50) */
  max_metric_calls?: number;
  /** Parallelism for rollouts (default: 5) */
  parallelism?: number;
  /** Timeout for polling rollouts in seconds (default: 600) */
  poll_timeout_seconds?: number;
  /** Stop early if best >= threshold (default: no threshold) */
  score_threshold?: number;
  /** API base URL for internal calls */
  api_base_url: string;
  /** Session token for authentication */
  session_token: string;
}

/**
 * Dead letter queue message with error context
 */
export interface DeadLetterMessage {
  /** Original queue message */
  original_message: QueueMessage;
  /** Error that caused the failure */
  error: string;
  /** Error category for analysis */
  error_category: ErrorCategory;
  /** Final attempt number */
  final_attempt: number;
  /** ISO timestamp when moved to DLQ */
  failed_at: string;
  /** Full retry history */
  retry_history: RetryAttempt[];
  /** Whether this job requires user action */
  requires_user_action: boolean;
  /** Suggested action for resolution */
  suggested_action?: string;
}

/**
 * Result returned after enqueueing a job
 */
export interface EnqueueResult {
  success: boolean;
  job_id: string;
  message_id?: string;
  error?: string;
}

/**
 * Queue consumer batch result
 */
export interface ConsumerBatchResult {
  processed: number;
  succeeded: number;
  failed: number;
  retried: number;
}
