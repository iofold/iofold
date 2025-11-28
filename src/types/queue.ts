/**
 * Cloudflare Queue message type definitions for background job processing
 */

import type { JobType } from './api';

/**
 * Queue message structure for job processing
 */
export interface QueueMessage {
  /** Unique job identifier */
  job_id: string;
  /** Job type determines which handler processes the message */
  type: JobType | 'monitor' | 'auto_refine';
  /** Workspace this job belongs to */
  workspace_id: string;
  /** Job-specific payload data */
  payload: JobPayload;
  /** Current attempt number (starts at 1) */
  attempt: number;
  /** ISO timestamp when message was created */
  created_at: string;
}

/**
 * Union type for all job payloads
 */
export type JobPayload =
  | ImportJobPayload
  | GenerateJobPayload
  | ExecuteJobPayload
  | MonitorJobPayload
  | AutoRefineJobPayload;

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
  eval_set_id: string;
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
 * Dead letter queue message with error context
 */
export interface DeadLetterMessage {
  /** Original queue message */
  original_message: QueueMessage;
  /** Error that caused the failure */
  error: string;
  /** Final attempt number */
  final_attempt: number;
  /** ISO timestamp when moved to DLQ */
  failed_at: string;
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
