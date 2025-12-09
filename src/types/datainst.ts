/**
 * DataInst - The core data structure for GEPA integration
 * Represents a task that an agent should perform
 */
export interface DataInst {
  /** The task visible to the agent */
  task: Task;

  /** Metadata for evaluation (hidden from agent, visible to eval) */
  task_metadata: TaskMetadata;
}

/**
 * Task interface representing the user's request
 */
export interface Task {
  /** The user's message/request (first user message after system prompt) */
  user_message: string;
}

/**
 * TaskMetadata - Evaluation metadata hidden from agent
 * Contains ground truth, success criteria, and reference traces
 */
export interface TaskMetadata {
  /** Ground truth - expected correct output (if available) */
  expected_output?: string;

  /** Expected action the agent should take */
  expected_action?: string;

  /** List of criteria for success */
  success_criteria?: string[];

  /** Similar high-rated traces for reference */
  similar_high_rated_traces?: TraceSummary[];

  /** Traces with specific human feedback */
  traces_with_specific_feedback?: TraceFeedbackPair[];

  /** Task categorization */
  task_type?: string;  // "code_generation", "qa", "classification", "extraction"

  /** Estimated difficulty */
  difficulty?: "easy" | "medium" | "hard";

  /** Domain area */
  domain?: string;  // "math", "coding", "support", "creative"

  /** Agent-specific custom fields */
  custom?: Record<string, unknown>;
}

/**
 * TraceSummary - Summary of a high-rated trace execution
 */
export interface TraceSummary {
  /** Unique trace identifier */
  trace_id: string;

  /** LLM-generated execution summary */
  summary: string;

  /** Human score (0-1) */
  human_score: number;

  /** What made this good/bad */
  key_behaviors: string[];
}

/**
 * TraceFeedbackPair - Trace with associated human feedback
 */
export interface TraceFeedbackPair {
  /** Unique trace identifier */
  trace_id: string;

  /** Textual feedback from human */
  human_feedback: string;

  /** Human score (0-1) */
  human_score: number;
}

/**
 * Validation result for task extraction
 */
export interface TaskValidationResult {
  /** Whether the task is valid */
  valid: boolean;

  /** List of validation errors */
  errors: string[];

  /** List of validation warnings */
  warnings: string[];
}
