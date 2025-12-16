/**
 * Trace Import Adapter Registry
 *
 * Central registry for all trace import adapters. Maps source types to their adapters.
 */

import type { TraceImportAdapter, TraceSource } from '../types';
import type { OpenInferenceSpan } from '../../../types/openinference';
import { PlaygroundAdapter } from './playground';
import { LangfuseAdapter } from './langfuse';
import { PhoenixAdapter } from './phoenix';
import { LangSmithAdapter } from './langsmith';

/**
 * Registry mapping source types to their adapters
 *
 * Note: Adapters will be implemented in subsequent tasks:
 * - langfuse.ts - ✓ IMPLEMENTED - Langfuse observations to OpenInference
 * - langsmith.ts - ✓ IMPLEMENTED - LangSmith runs to OpenInference
 * - openai.ts - OpenAI API responses to OpenInference
 * - phoenix.ts - ✓ IMPLEMENTED - Phoenix Arize (validates and normalizes OpenInference)
 * - playground.ts - ✓ IMPLEMENTED - Playground stream events to OpenInference
 * - taskset.ts - Taskset execution data to OpenInference
 */
const adapterRegistry: Partial<Record<TraceSource, TraceImportAdapter>> = {
  // Playground adapter - transforms LangGraphExecutionStep[] to OpenInferenceSpan[]
  // KEY FIX: Embeds tool_calls in LLM output messages instead of separate child spans
  playground: new PlaygroundAdapter(),

  // Langfuse adapter - transforms Langfuse observations to OpenInferenceSpan[]
  // Handles GENERATION (LLM), SPAN (tool/chain), and EVENT observations
  langfuse: new LangfuseAdapter(),

  // Phoenix adapter - validates and normalizes Phoenix/OpenInference spans
  // Handles both nested JSON and flattened OTEL attribute formats
  phoenix: new PhoenixAdapter(),

  // LangSmith adapter - transforms LangSmith runs to OpenInferenceSpan[]
  // Maps run_type to span_kind and extracts messages, tool calls, and metadata
  langsmith: new LangSmithAdapter(),
};

/**
 * Get the adapter for a specific trace source
 *
 * @param source - The trace source type
 * @returns The adapter if registered, undefined otherwise
 */
export function getAdapter(source: TraceSource): TraceImportAdapter | undefined {
  return adapterRegistry[source];
}

/**
 * Transform raw trace data using the appropriate adapter
 *
 * @param source - The trace source type
 * @param rawData - Source-specific raw trace data
 * @returns Array of OpenInference spans
 * @throws Error if adapter not found or transformation fails
 */
export function transformTrace(source: TraceSource, rawData: unknown): OpenInferenceSpan[] {
  const adapter = getAdapter(source);

  if (!adapter) {
    throw new Error(`No adapter registered for source: ${source}`);
  }

  return adapter.transform(rawData);
}

/**
 * Register an adapter for a specific trace source
 *
 * @param adapter - The adapter to register
 */
export function registerAdapter(adapter: TraceImportAdapter): void {
  adapterRegistry[adapter.source] = adapter;
}

/**
 * Get all registered trace sources
 *
 * @returns Array of registered source types
 */
export function getRegisteredSources(): TraceSource[] {
  return Object.keys(adapterRegistry) as TraceSource[];
}
