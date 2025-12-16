/**
 * Trace Import Adapter Types
 *
 * Defines interfaces for importing traces from multiple sources into OpenInference format.
 */

import type { OpenInferenceSpan } from '../../types/openinference';

/**
 * Supported trace sources
 */
export type TraceSource =
  | 'langfuse'
  | 'langsmith'
  | 'openai'
  | 'phoenix'
  | 'playground'
  | 'taskset';

/**
 * Summary information extracted from a trace
 */
export interface TraceSummary {
  /** Preview of the trace input (first user message or similar) */
  inputPreview: string;
  /** Preview of the trace output (final assistant message or similar) */
  outputPreview: string;
  /** Total number of spans in the trace */
  spanCount: number;
  /** Total tokens consumed across all LLM spans */
  totalTokens: number;
  /** Total duration of the trace in milliseconds */
  totalDurationMs: number;
  /** Whether any span has an error status */
  hasErrors: boolean;
}

/**
 * Adapter interface for transforming source-specific trace data to OpenInference format
 */
export interface TraceImportAdapter {
  /** Source system this adapter handles */
  source: TraceSource;

  /**
   * Transform raw trace data from source to OpenInference spans
   *
   * @param rawData - Source-specific trace data (e.g., Langfuse observations, LangSmith runs)
   * @returns Array of OpenInference-compliant spans
   * @throws Error if transformation fails
   */
  transform(rawData: unknown): OpenInferenceSpan[];

  /**
   * Extract summary information from spans for preview/filtering
   *
   * @param spans - Array of OpenInference spans
   * @returns Summary information about the trace
   */
  extractSummary(spans: OpenInferenceSpan[]): TraceSummary;
}
