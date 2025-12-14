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
