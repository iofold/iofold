/**
 * ART-E Benchmark Types
 *
 * Types for the Enron email Q&A benchmark dataset from HuggingFace.
 * Dataset: corbt/enron_emails_sample_questions
 */

/**
 * A single task from the ART-E benchmark dataset
 */
export interface ArtETask {
  /** Unique task ID */
  id: number;

  /** Question about the emails */
  question: string;

  /** Ground truth answer */
  answer: string;

  /** List of email message IDs relevant to this task */
  message_ids: string[];

  /** Email inbox address (which inbox this task is about) */
  inbox_address: string;

  /** Temporal cutoff date for the question */
  query_date: string;

  /** How realistic the question is (0.3-1.0) */
  how_realistic: number;

  /** Dataset split (train or test) */
  split: string;
}

/**
 * Result from running a single benchmark task
 */
export interface TaskResult {
  /** Task ID */
  taskId: number;

  /** Question asked */
  question: string;

  /** Ground truth answer */
  groundTruth: string;

  /** Agent's answer */
  agentAnswer: string;

  /** Whether the agent's answer exactly matches ground truth */
  exactMatch: boolean;

  /** Semantic similarity score (0-1) */
  semanticScore: number;

  /** Execution time in milliseconds */
  executionTimeMs: number;

  /** Trace ID for this execution */
  traceId?: string;

  /** Any errors that occurred */
  error?: string;
}

/**
 * Aggregate results from a benchmark run
 */
export interface BenchmarkResult {
  /** Agent ID that was tested */
  agentId: string;

  /** Total number of tasks run */
  totalTasks: number;

  /** Number of tasks completed successfully */
  completedTasks: number;

  /** Number of tasks that failed */
  failedTasks: number;

  /** Exact match accuracy (0-1) */
  exactMatchAccuracy: number;

  /** Average semantic similarity score (0-1) */
  avgSemanticScore: number;

  /** Average execution time per task in milliseconds */
  avgExecutionTimeMs: number;

  /** Total benchmark run time in milliseconds */
  totalTimeMs: number;

  /** Individual task results */
  taskResults: TaskResult[];

  /** Timestamp when benchmark started */
  startedAt: string;

  /** Timestamp when benchmark completed */
  completedAt: string;
}

/**
 * Configuration options for running the benchmark
 */
export interface BenchmarkConfig {
  /** Agent ID to test */
  agentId: string;

  /** Dataset split to use (train or test) */
  split: 'train' | 'test';

  /** Maximum number of tasks to run (undefined = all) */
  limit?: number;

  /** Workspace ID for authentication */
  workspaceId: string;

  /** API base URL */
  apiBaseUrl: string;

  /** Model provider to use */
  modelProvider?: 'anthropic' | 'openai' | 'google';

  /** Model ID to use */
  modelId?: string;

  /** Timeout per task in milliseconds (default: 60000) */
  taskTimeoutMs?: number;

  /** Whether to include semantic similarity scoring (default: true) */
  includeSemanticScoring?: boolean;
}
