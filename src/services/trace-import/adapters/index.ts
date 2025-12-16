/**
 * Trace Import Adapter Registry
 *
 * Central registry for all trace import adapters. Maps source types to their adapters.
 */

import type { TraceImportAdapter, TraceSource } from '../types';
import type { OpenInferenceSpan } from '../../../types/openinference';
import { PlaygroundAdapter } from './playground';

/**
 * Registry mapping source types to their adapters
 *
 * Note: Adapters will be implemented in subsequent tasks:
 * - langfuse.ts - Langfuse observations to OpenInference
 * - langsmith.ts - LangSmith runs to OpenInference
 * - openai.ts - OpenAI API responses to OpenInference
 * - phoenix.ts - Phoenix Arize (already OpenInference-compliant)
 * - playground.ts - ✓ IMPLEMENTED - Playground stream events to OpenInference
 * - taskset.ts - Taskset execution data to OpenInference
 */
const adapterRegistry: Partial<Record<TraceSource, TraceImportAdapter>> = {
  // Playground adapter - transforms LangGraphExecutionStep[] to OpenInferenceSpan[]
  // KEY FIX: Embeds tool_calls in LLM output messages instead of separate child spans
  playground: new PlaygroundAdapter(),
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
