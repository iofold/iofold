/**
 * Phoenix (Arize) Trace Import Adapter
 *
 * Phoenix uses OpenInference natively, so this adapter is minimal - mostly validation and normalization.
 * Phoenix spans may arrive in two formats:
 * 1. Nested JSON format (structured objects)
 * 2. Flattened OTEL attribute format (dot-notation keys like "llm.input_messages.0.message.role")
 *
 * This adapter handles both formats and normalizes to our OpenInferenceSpan interface.
 */

import type { TraceImportAdapter, TraceSummary } from '../types';
import type {
  OpenInferenceSpan,
  OpenInferenceSpanKind,
  OpenInferenceSpanStatus,
  OpenInferenceMessage,
  OpenInferenceLLM,
  OpenInferenceTool,
  ToolCallRequest,
} from '../../../types/openinference';

/**
 * Phoenix span format (may have flattened or nested attributes)
 */
interface PhoenixSpan {
  context?: {
    span_id?: string;
    trace_id?: string;
  };
  span_id?: string;
  trace_id?: string;
  parent_id?: string;
  name?: string;
  span_kind?: string;
  start_time?: number | string; // Unix timestamp (ms or ns) or ISO string
  end_time?: number | string;
  status_code?: string;
  status_message?: string;
  attributes?: Record<string, any>;
  events?: any[];
}

/**
 * Phoenix trace format
 */
interface PhoenixTrace {
  spans?: PhoenixSpan[];
  // Alternative format - single span
  span_id?: string;
  trace_id?: string;
}

export class PhoenixAdapter implements TraceImportAdapter {
  source = 'phoenix' as const;

  /**
   * Transform Phoenix spans to OpenInference format
   *
   * Phoenix already uses OpenInference conventions, so we primarily:
   * 1. Validate required fields
   * 2. Unflatten OTEL attributes if needed
   * 3. Normalize timestamps to ISO 8601
   * 4. Map status codes
   */
  transform(rawData: unknown): OpenInferenceSpan[] {
    // Validate input format
    if (!rawData || typeof rawData !== 'object') {
      throw new Error('Invalid Phoenix trace format: expected object');
    }

    const data = rawData as PhoenixTrace;

    // Handle array of spans
    if (Array.isArray(rawData)) {
      return (rawData as PhoenixSpan[]).map(span => this.transformSpan(span));
    }

    // Handle trace with spans array
    if (data.spans && Array.isArray(data.spans)) {
      return data.spans.map(span => this.transformSpan(span));
    }

    // Handle single span format
    if (data.span_id || data.trace_id) {
      return [this.transformSpan(data as PhoenixSpan)];
    }

    throw new Error('Invalid Phoenix trace format: no spans found');
  }

  /**
   * Transform a single Phoenix span to OpenInference format
   */
  private transformSpan(phoenixSpan: PhoenixSpan): OpenInferenceSpan {
    // Extract core identifiers
    const spanId = phoenixSpan.span_id || phoenixSpan.context?.span_id;
    const traceId = phoenixSpan.trace_id || phoenixSpan.context?.trace_id;

    if (!spanId || !traceId) {
      throw new Error('Phoenix span missing required span_id or trace_id');
    }

    // Extract and unflatten attributes
    const attributes = phoenixSpan.attributes || {};
    const unflattened = this.unflattenAttributes(attributes);

    // Determine span kind
    const spanKindStr = phoenixSpan.span_kind ||
                        attributes['openinference.span.kind'] ||
                        unflattened['openinference']?.span?.kind ||
                        'CHAIN';
    const spanKind = this.normalizeSpanKind(spanKindStr);

    // Normalize timestamps
    const startTime = this.normalizeTimestamp(phoenixSpan.start_time);
    const endTime = phoenixSpan.end_time ? this.normalizeTimestamp(phoenixSpan.end_time) : undefined;

    // Normalize status
    const status = this.normalizeStatus(phoenixSpan.status_code);

    // Build base span
    const span: OpenInferenceSpan = {
      span_id: spanId,
      trace_id: traceId,
      parent_span_id: phoenixSpan.parent_id,
      span_kind: spanKind,
      name: phoenixSpan.name || 'unknown',
      start_time: startTime,
      end_time: endTime,
      status,
      status_message: phoenixSpan.status_message,
      source_span_id: spanId,
    };

    // Extract span-kind-specific data
    if (spanKind === 'LLM') {
      span.llm = this.extractLLMData(unflattened, attributes);
    } else if (spanKind === 'TOOL') {
      span.tool = this.extractToolData(unflattened, attributes);
    } else {
      // Generic input/output for other span kinds
      span.input = unflattened.input || attributes.input;
      span.output = unflattened.output || attributes.output;
    }

    // Preserve additional attributes (excluding already-mapped fields)
    const additionalAttrs = this.extractAdditionalAttributes(unflattened, attributes);
    if (Object.keys(additionalAttrs).length > 0) {
      span.attributes = additionalAttrs;
    }

    return span;
  }

  /**
   * Extract LLM-specific data from Phoenix span attributes
   */
  private extractLLMData(
    unflattened: Record<string, any>,
    flatAttributes: Record<string, any>
  ): OpenInferenceLLM {
    // Try unflattened format first
    const llmData = unflattened.llm || {};

    // Extract input messages
    let inputMessages: OpenInferenceMessage[] = [];
    if (llmData.input_messages && Array.isArray(llmData.input_messages)) {
      inputMessages = llmData.input_messages.map((msg: any) => this.normalizeMessage(msg));
    } else {
      // Try extracting from flattened attributes
      inputMessages = this.extractMessagesFromFlat(flatAttributes, 'llm.input_messages');
    }

    // Extract output messages
    let outputMessages: OpenInferenceMessage[] = [];
    if (llmData.output_messages && Array.isArray(llmData.output_messages)) {
      outputMessages = llmData.output_messages.map((msg: any) => this.normalizeMessage(msg));
    } else {
      // Try extracting from flattened attributes
      outputMessages = this.extractMessagesFromFlat(flatAttributes, 'llm.output_messages');
    }

    return {
      model_name: llmData.model_name || flatAttributes['llm.model_name'],
      provider: llmData.provider || flatAttributes['llm.provider'],
      input_messages: inputMessages,
      output_messages: outputMessages,
      token_count_prompt: llmData.token_count_prompt || flatAttributes['llm.token_count.prompt'],
      token_count_completion: llmData.token_count_completion || flatAttributes['llm.token_count.completion'],
      token_count_total: llmData.token_count_total || flatAttributes['llm.token_count.total'],
    };
  }

  /**
   * Extract tool-specific data from Phoenix span attributes
   */
  private extractToolData(
    unflattened: Record<string, any>,
    flatAttributes: Record<string, any>
  ): OpenInferenceTool {
    const toolData = unflattened.tool || {};

    return {
      name: toolData.name || flatAttributes['tool.name'] || 'unknown',
      description: toolData.description || flatAttributes['tool.description'],
      parameters: toolData.parameters || this.extractFromFlat(flatAttributes, 'tool.parameters'),
      output: toolData.output || flatAttributes['tool.output'],
    };
  }

  /**
   * Normalize a message object
   */
  private normalizeMessage(msg: any): OpenInferenceMessage {
    // Handle nested message.role/message.content format
    const message = msg.message || msg;

    const normalized: OpenInferenceMessage = {
      role: message.role || 'user',
      content: message.content || '',
    };

    // Extract tool_calls if present
    if (message.tool_calls && Array.isArray(message.tool_calls)) {
      normalized.tool_calls = message.tool_calls.map((tc: any) => ({
        id: tc.id || tc.tool_call_id || '',
        function: {
          name: tc.function?.name || tc.name || '',
          arguments: tc.function?.arguments || tc.arguments || '{}',
        },
      }));
    }

    // Extract tool_call_id if present
    if (message.tool_call_id) {
      normalized.tool_call_id = message.tool_call_id;
    }

    return normalized;
  }

  /**
   * Extract messages from flattened OTEL attributes
   * Example: "llm.input_messages.0.message.role" = "user"
   */
  private extractMessagesFromFlat(
    attributes: Record<string, any>,
    prefix: string
  ): OpenInferenceMessage[] {
    const messages: Map<number, any> = new Map();

    // Find all message indices
    const messagePattern = new RegExp(`^${prefix}\\.(\\d+)\\.`);

    for (const [key, value] of Object.entries(attributes)) {
      const match = key.match(messagePattern);
      if (match) {
        const index = parseInt(match[1], 10);
        if (!messages.has(index)) {
          messages.set(index, {});
        }

        const msg = messages.get(index)!;
        const remainder = key.slice(match[0].length);

        // Handle nested paths like "message.role" or "message.content"
        this.setNestedValue(msg, remainder, value);
      }
    }

    // Convert to array and normalize
    return Array.from(messages.entries())
      .sort(([a], [b]) => a - b)
      .map(([_, msg]) => this.normalizeMessage(msg));
  }

  /**
   * Extract a nested object from flattened attributes
   */
  private extractFromFlat(attributes: Record<string, any>, prefix: string): any {
    const result: any = {};
    const prefixPattern = `${prefix}.`;

    for (const [key, value] of Object.entries(attributes)) {
      if (key.startsWith(prefixPattern)) {
        const path = key.slice(prefixPattern.length);
        this.setNestedValue(result, path, value);
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * Set a nested value in an object using dot notation path
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        // Check if next part is numeric (array index)
        const nextPart = parts[i + 1];
        current[part] = /^\d+$/.test(nextPart) ? [] : {};
      }
      current = current[part];
    }

    const lastPart = parts[parts.length - 1];
    current[lastPart] = value;
  }

  /**
   * Unflatten OTEL-style dot-notation attributes to nested objects
   * Example: "llm.model_name" => { llm: { model_name: "gpt-4" } }
   */
  private unflattenAttributes(attributes: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(attributes)) {
      // Skip already nested objects
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = value;
        continue;
      }

      // Split by dots and build nested structure
      const parts = key.split('.');
      let current = result;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current)) {
          // Check if next part is numeric (array index)
          const nextPart = parts[i + 1];
          current[part] = /^\d+$/.test(nextPart) ? [] : {};
        }
        current = current[part];
      }

      const lastPart = parts[parts.length - 1];
      current[lastPart] = value;
    }

    return result;
  }

  /**
   * Extract additional attributes that aren't explicitly mapped
   */
  private extractAdditionalAttributes(
    unflattened: Record<string, any>,
    flatAttributes: Record<string, any>
  ): Record<string, any> {
    const excludeKeys = [
      'llm',
      'tool',
      'input',
      'output',
      'openinference',
      'span_id',
      'trace_id',
      'parent_id',
      'name',
      'span_kind',
      'start_time',
      'end_time',
      'status_code',
      'status_message',
    ];

    const excludePrefixes = [
      'llm.',
      'tool.',
      'openinference.',
    ];

    const additional: Record<string, any> = {};

    // Add unflattened attributes
    for (const [key, value] of Object.entries(unflattened)) {
      if (!excludeKeys.includes(key)) {
        additional[key] = value;
      }
    }

    // Add flat attributes that don't match excluded patterns
    for (const [key, value] of Object.entries(flatAttributes)) {
      const shouldExclude = excludeKeys.includes(key) ||
                           excludePrefixes.some(prefix => key.startsWith(prefix));

      if (!shouldExclude && !(key in additional)) {
        additional[key] = value;
      }
    }

    return additional;
  }

  /**
   * Normalize Phoenix span kind to OpenInference span kind
   */
  private normalizeSpanKind(kind: string): OpenInferenceSpanKind {
    const normalized = kind.toUpperCase();

    const validKinds: OpenInferenceSpanKind[] = [
      'LLM',
      'TOOL',
      'AGENT',
      'CHAIN',
      'RETRIEVER',
      'EMBEDDING',
      'RERANKER',
    ];

    if (validKinds.includes(normalized as OpenInferenceSpanKind)) {
      return normalized as OpenInferenceSpanKind;
    }

    // Default to CHAIN for unknown kinds
    return 'CHAIN';
  }

  /**
   * Normalize status code to OpenInference status
   */
  private normalizeStatus(statusCode?: string): OpenInferenceSpanStatus {
    if (!statusCode) return 'UNSET';

    const normalized = statusCode.toUpperCase();

    if (normalized === 'OK' || normalized === 'STATUS_CODE_OK') {
      return 'OK';
    }

    if (normalized === 'ERROR' || normalized.includes('ERROR')) {
      return 'ERROR';
    }

    return 'UNSET';
  }

  /**
   * Normalize timestamp to ISO 8601 string
   * Phoenix may send Unix timestamps (ms or ns) or ISO strings
   */
  private normalizeTimestamp(timestamp: number | string | undefined): string {
    if (!timestamp) {
      return new Date().toISOString();
    }

    // Already ISO string
    if (typeof timestamp === 'string') {
      return timestamp;
    }

    // Unix timestamp - detect if ms or ns (nanoseconds > 10^12)
    if (timestamp > 1e12) {
      // Nanoseconds - convert to milliseconds
      return new Date(timestamp / 1e6).toISOString();
    }

    // Milliseconds
    return new Date(timestamp).toISOString();
  }

  /**
   * Extract summary information from spans
   */
  extractSummary(spans: OpenInferenceSpan[]): TraceSummary {
    let inputPreview = 'No input';
    let outputPreview = 'No output';
    let totalTokens = 0;
    let totalDurationMs = 0;
    let hasErrors = false;

    // Find first LLM span for input
    const firstLLMSpan = spans.find(s => s.span_kind === 'LLM');
    if (firstLLMSpan?.llm?.input_messages?.[0]) {
      const firstMsg = firstLLMSpan.llm.input_messages[0];
      inputPreview = firstMsg.content.length > 200
        ? `${firstMsg.content.slice(0, 200)}...`
        : firstMsg.content;
    }

    // Find last LLM span for output
    const llmSpans = spans.filter(s => s.span_kind === 'LLM');
    if (llmSpans.length > 0) {
      const lastLLMSpan = llmSpans[llmSpans.length - 1];
      if (lastLLMSpan.llm?.output_messages?.[0]) {
        const lastMsg = lastLLMSpan.llm.output_messages[lastLLMSpan.llm.output_messages.length - 1];
        outputPreview = lastMsg.content.length > 200
          ? `${lastMsg.content.slice(0, 200)}...`
          : lastMsg.content;
      }
    }

    // Calculate totals
    for (const span of spans) {
      // Token counts
      if (span.llm?.token_count_total) {
        totalTokens += span.llm.token_count_total;
      }

      // Duration
      if (span.start_time && span.end_time) {
        const duration = new Date(span.end_time).getTime() - new Date(span.start_time).getTime();
        totalDurationMs += duration;
      }

      // Errors
      if (span.status === 'ERROR') {
        hasErrors = true;
      }
    }

    return {
      inputPreview,
      outputPreview,
      spanCount: spans.length,
      totalTokens,
      totalDurationMs,
      hasErrors,
    };
  }
}
