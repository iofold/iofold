/**
 * Trace Import Service
 *
 * Main entry point for importing traces from multiple sources into OpenInference format.
 *
 * Usage:
 *   import { transformTrace, getAdapter } from './services/trace-import';
 *
 *   // Transform trace data
 *   const spans = transformTrace('langfuse', rawLangfuseData);
 *
 *   // Get adapter directly for more control
 *   const adapter = getAdapter('langsmith');
 *   const spans = adapter.transform(rawData);
 *   const summary = adapter.extractSummary(spans);
 */

// Re-export types
export type { TraceImportAdapter, TraceSource, TraceSummary } from './types';

// Re-export registry functions
export {
  getAdapter,
  transformTrace,
  registerAdapter,
  getRegisteredSources,
} from './adapters';
