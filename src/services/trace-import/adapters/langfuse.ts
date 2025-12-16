/**
 * Langfuse Trace Import Adapter
 *
 * Transforms Langfuse observation data to OpenInference spans.
 * Langfuse uses an observations-based model where traces contain observations
 * of different types: GENERATION (LLM calls), SPAN (operations), and EVENT (tool calls).
 *
 * KEY MAPPINGS:
 * - GENERATION observations → LLM spans with input/output messages
 * - SPAN observations with toolName → TOOL spans
 * - Other SPAN observations → CHAIN spans
 * - parentObservationId → parent_span_id for hierarchy
 */

import type { TraceImportAdapter, TraceSummary } from '../types';
import type {
  OpenInferenceSpan,
  OpenInferenceMessage,
  ToolCallRequest,
} from '../../../types/openinference';

/**
 * Langfuse observation structure
 */
interface LangfuseObservation {
  id: string;
  traceId: string;
  type: 'GENERATION' | 'SPAN' | 'EVENT';
  name?: string;
  parentObservationId?: string;
  startTime: string;
  endTime?: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  model?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  level?: string;
  statusMessage?: string;
}

/**
 * Langfuse trace data format
 */
interface LangfuseTraceData {
  id: string;
  observations: LangfuseObservation[];
}

export class LangfuseAdapter implements TraceImportAdapter {
  source = 'langfuse' as const;

  /**
   * Transform Langfuse observations to OpenInference spans
   *
   * Algorithm:
   * 1. Validate input format (expects { id, observations })
   * 2. Build observation map for quick lookups
   * 3. For each observation, determine span kind based on type and metadata
   * 4. Extract messages from input/output for GENERATION observations
   * 5. Extract tool information for SPAN observations with toolName
   * 6. Link parent-child relationships via parentObservationId
   */
  transform(rawData: unknown): OpenInferenceSpan[] {
    // Validate input format
    if (!rawData || typeof rawData !== 'object' || !('observations' in rawData)) {
      throw new Error(
        'Invalid Langfuse trace format: expected { id, observations: LangfuseObservation[] }'
      );
    }

    const traceData = rawData as LangfuseTraceData;
    const { id: traceId, observations } = traceData;

    if (!Array.isArray(observations)) {
      throw new Error('Invalid Langfuse trace format: observations must be an array');
    }

    if (observations.length === 0) {
      return [];
    }

    // Build observation ID to observation mapping for quick lookups
    const observationMap = new Map<string, LangfuseObservation>();
    for (const obs of observations) {
      observationMap.set(obs.id, obs);
    }

    // Build parent-child relationships
    const childrenMap = new Map<string, LangfuseObservation[]>();
    for (const obs of observations) {
      if (obs.parentObservationId) {
        if (!childrenMap.has(obs.parentObservationId)) {
          childrenMap.set(obs.parentObservationId, []);
        }
        childrenMap.get(obs.parentObservationId)!.push(obs);
      }
    }

    const spans: OpenInferenceSpan[] = [];

    for (const obs of observations) {
      const spanKind = this.determineSpanKind(obs);

      if (spanKind === 'LLM') {
        // Create LLM span from GENERATION observation
        const llmSpan = this.createLLMSpan(obs, traceId, childrenMap);
        spans.push(llmSpan);
      } else if (spanKind === 'TOOL') {
        // Create TOOL span from SPAN observation with toolName
        const toolSpan = this.createToolSpan(obs, traceId);
        spans.push(toolSpan);
      } else {
        // Create generic CHAIN span
        const chainSpan = this.createChainSpan(obs, traceId, spanKind);
        spans.push(chainSpan);
      }
    }

    return spans;
  }

  /**
   * Determine the OpenInference span kind based on observation characteristics
   */
  private determineSpanKind(
    obs: LangfuseObservation
  ): 'LLM' | 'TOOL' | 'CHAIN' {
    // GENERATION observations are LLM calls
    if (obs.type === 'GENERATION') {
      return 'LLM';
    }

    // SPAN observations with toolName are tool executions
    if (obs.type === 'SPAN') {
      // Check metadata or input for toolName
      const metadata = obs.metadata || {};
      const input = obs.input as any;

      if (
        metadata.toolName ||
        metadata.tool_name ||
        input?.toolName ||
        input?.tool_name
      ) {
        return 'TOOL';
      }
    }

    // Default to CHAIN for other spans
    return 'CHAIN';
  }

  /**
   * Create an LLM span from a GENERATION observation
   */
  private createLLMSpan(
    obs: LangfuseObservation,
    traceId: string,
    childrenMap: Map<string, LangfuseObservation[]>
  ): OpenInferenceSpan {
    // Extract input and output messages
    const inputMessages = this.extractMessages(obs.input, 'user');
    const outputMessages = this.extractMessages(obs.output, 'assistant');

    // Check for tool calls in child observations or output
    const children = childrenMap.get(obs.id) || [];
    const toolCallRequests = this.extractToolCallsFromChildren(children, obs);

    // If we found tool calls, embed them in the last assistant message
    if (toolCallRequests.length > 0 && outputMessages.length > 0) {
      const lastAssistantMessage =
        outputMessages[outputMessages.length - 1];
      lastAssistantMessage.tool_calls = toolCallRequests;
    }

    // Determine status
    const status =
      obs.level === 'ERROR'
        ? 'ERROR'
        : obs.endTime
          ? 'OK'
          : 'UNSET';

    return {
      span_id: obs.id,
      trace_id: traceId,
      parent_span_id: obs.parentObservationId,
      span_kind: 'LLM',
      name: obs.name || 'llm_generation',
      start_time: obs.startTime,
      end_time: obs.endTime,
      status,
      status_message: obs.statusMessage,
      llm: {
        model_name: obs.model,
        provider: this.extractProvider(obs.model),
        input_messages: inputMessages,
        output_messages: outputMessages,
        token_count_prompt: obs.usage?.promptTokens,
        token_count_completion: obs.usage?.completionTokens,
        token_count_total: obs.usage?.totalTokens,
      },
      attributes: {
        ...this.extractAdditionalAttributes(obs.metadata),
      },
      source_span_id: obs.id,
    };
  }

  /**
   * Create a TOOL span from a SPAN observation with toolName
   */
  private createToolSpan(
    obs: LangfuseObservation,
    traceId: string
  ): OpenInferenceSpan {
    // Extract tool name from metadata or input
    const metadata = obs.metadata || {};
    const input = obs.input as any;
    const toolName =
      (metadata.toolName as string) ||
      (metadata.tool_name as string) ||
      input?.toolName ||
      input?.tool_name ||
      obs.name ||
      'unknown';

    // Determine status
    const status =
      obs.level === 'ERROR'
        ? 'ERROR'
        : obs.endTime
          ? 'OK'
          : 'UNSET';

    return {
      span_id: obs.id,
      trace_id: traceId,
      parent_span_id: obs.parentObservationId,
      span_kind: 'TOOL',
      name: toolName,
      start_time: obs.startTime,
      end_time: obs.endTime,
      status,
      status_message: obs.statusMessage,
      tool: {
        name: toolName,
        parameters: this.extractToolParameters(obs.input),
        output: obs.output,
      },
      attributes: {
        ...this.extractAdditionalAttributes(obs.metadata),
      },
      source_span_id: obs.id,
    };
  }

  /**
   * Create a generic CHAIN span
   */
  private createChainSpan(
    obs: LangfuseObservation,
    traceId: string,
    spanKind: 'CHAIN'
  ): OpenInferenceSpan {
    // Determine status
    const status =
      obs.level === 'ERROR'
        ? 'ERROR'
        : obs.endTime
          ? 'OK'
          : 'UNSET';

    return {
      span_id: obs.id,
      trace_id: traceId,
      parent_span_id: obs.parentObservationId,
      span_kind: spanKind,
      name: obs.name || 'chain',
      start_time: obs.startTime,
      end_time: obs.endTime,
      status,
      status_message: obs.statusMessage,
      input: obs.input,
      output: obs.output,
      attributes: {
        observation_type: obs.type,
        ...this.extractAdditionalAttributes(obs.metadata),
      },
      source_span_id: obs.id,
    };
  }

  /**
   * Extract messages from input/output data
   * Input/output may be strings, objects, or arrays of messages
   */
  private extractMessages(
    data: unknown,
    defaultRole: 'user' | 'assistant'
  ): OpenInferenceMessage[] {
    if (!data) {
      return [];
    }

    // Handle string content
    if (typeof data === 'string') {
      return [
        {
          role: defaultRole,
          content: data,
        },
      ];
    }

    // Handle array of messages
    if (Array.isArray(data)) {
      const messages: OpenInferenceMessage[] = [];
      for (const item of data) {
        if (typeof item === 'string') {
          messages.push({
            role: defaultRole,
            content: item,
          });
        } else if (
          typeof item === 'object' &&
          item !== null &&
          ('content' in item || 'text' in item)
        ) {
          const role =
            ('role' in item ? item.role : defaultRole) ||
            defaultRole;
          const content =
            ('content' in item ? item.content : item.text) || '';
          messages.push({
            role: role as 'user' | 'assistant' | 'system' | 'tool',
            content:
              typeof content === 'string'
                ? content
                : JSON.stringify(content),
          });
        }
      }
      return messages;
    }

    // Handle object with content or text field
    if (typeof data === 'object' && data !== null) {
      const obj = data as any;

      // Check for messages array in object
      if (obj.messages && Array.isArray(obj.messages)) {
        return this.extractMessages(obj.messages, defaultRole);
      }

      // Check for content or text field
      if (obj.content || obj.text) {
        const content = obj.content || obj.text;
        return [
          {
            role: obj.role || defaultRole,
            content:
              typeof content === 'string'
                ? content
                : JSON.stringify(content),
          },
        ];
      }

      // If no recognizable structure, stringify the object
      return [
        {
          role: defaultRole,
          content: JSON.stringify(data),
        },
      ];
    }

    return [];
  }

  /**
   * Extract tool calls from child observations or output content
   */
  private extractToolCallsFromChildren(
    children: LangfuseObservation[],
    parentObs: LangfuseObservation
  ): ToolCallRequest[] {
    const toolCalls: ToolCallRequest[] = [];

    // Check output for tool_calls structure
    const output = parentObs.output as any;
    if (output && typeof output === 'object' && output.tool_calls) {
      const outputToolCalls = Array.isArray(output.tool_calls)
        ? output.tool_calls
        : [output.tool_calls];

      for (const tc of outputToolCalls) {
        if (tc.function || tc.name) {
          toolCalls.push({
            id: tc.id || `call_${parentObs.id}_${tc.name || tc.function?.name}`,
            function: {
              name: tc.name || tc.function?.name || 'unknown',
              arguments:
                typeof tc.arguments === 'string'
                  ? tc.arguments
                  : typeof tc.args === 'string'
                    ? tc.args
                    : JSON.stringify(
                        tc.arguments || tc.args || tc.function?.arguments || {}
                      ),
            },
          });
        }
      }
    }

    // If no tool calls in output, check children for tool execution spans
    if (toolCalls.length === 0) {
      for (const child of children) {
        if (
          child.type === 'SPAN' &&
          (child.metadata?.toolName ||
            child.metadata?.tool_name ||
            (child.input as any)?.toolName)
        ) {
          const toolName =
            (child.metadata?.toolName as string) ||
            (child.metadata?.tool_name as string) ||
            (child.input as any)?.toolName ||
            child.name ||
            'unknown';

          toolCalls.push({
            id: child.id,
            function: {
              name: toolName,
              arguments: JSON.stringify(child.input || {}),
            },
          });
        }
      }
    }

    return toolCalls;
  }

  /**
   * Extract tool parameters from input data
   */
  private extractToolParameters(
    input: unknown
  ): Record<string, unknown> | undefined {
    if (!input) {
      return undefined;
    }

    if (typeof input === 'object' && input !== null) {
      const obj = input as any;

      // If input has a parameters or args field, use that
      if (obj.parameters) {
        return obj.parameters;
      }
      if (obj.args) {
        return obj.args;
      }

      // Otherwise return the whole input object
      return obj as Record<string, unknown>;
    }

    return undefined;
  }

  /**
   * Extract provider from model name
   */
  private extractProvider(model?: string): string | undefined {
    if (!model) {
      return undefined;
    }

    const lowerModel = model.toLowerCase();

    if (lowerModel.includes('gpt') || lowerModel.includes('openai')) {
      return 'openai';
    }
    if (lowerModel.includes('claude') || lowerModel.includes('anthropic')) {
      return 'anthropic';
    }
    if (lowerModel.includes('gemini') || lowerModel.includes('google')) {
      return 'google';
    }
    if (lowerModel.includes('llama') || lowerModel.includes('meta')) {
      return 'meta';
    }
    if (lowerModel.includes('mistral')) {
      return 'mistral';
    }
    if (lowerModel.includes('cohere')) {
      return 'cohere';
    }

    return undefined;
  }

  /**
   * Extract additional attributes from observation metadata
   * Excludes already-mapped fields
   */
  private extractAdditionalAttributes(
    metadata?: Record<string, unknown>
  ): Record<string, unknown> {
    if (!metadata) return {};

    const excludeKeys = [
      'toolName',
      'tool_name',
      'model',
      'provider',
      'latency_ms',
    ];

    const additional: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (!excludeKeys.includes(key)) {
        additional[key] = value;
      }
    }

    return additional;
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
    const firstLLMSpan = spans.find((s) => s.span_kind === 'LLM');
    if (firstLLMSpan?.llm?.input_messages?.[0]) {
      const firstMsg = firstLLMSpan.llm.input_messages[0];
      inputPreview =
        firstMsg.content.length > 200
          ? `${firstMsg.content.slice(0, 200)}...`
          : firstMsg.content;
    }

    // Find last LLM span for output
    const llmSpans = spans.filter((s) => s.span_kind === 'LLM');
    if (llmSpans.length > 0) {
      const lastLLMSpan = llmSpans[llmSpans.length - 1];
      if (lastLLMSpan.llm?.output_messages?.[0]) {
        const lastMsg =
          lastLLMSpan.llm.output_messages[
            lastLLMSpan.llm.output_messages.length - 1
          ];
        outputPreview =
          lastMsg.content.length > 200
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
        const duration =
          new Date(span.end_time).getTime() -
          new Date(span.start_time).getTime();
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
