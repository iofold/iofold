/**
 * Playground Trace Import Adapter
 *
 * Transforms playground execution traces from LangGraphExecutionStep format to OpenInference spans.
 * This adapter fixes the critical issue where tool_calls are stored as separate child spans
 * instead of being embedded in the LLM's output messages.
 *
 * KEY FIX:
 * - Identifies LLM spans by presence of messages_added with assistant messages
 * - Identifies TOOL spans by presence of tool_calls in the step or toolName in metadata
 * - Extracts tool call decisions from child TOOL steps and embeds them in parent LLM span's output_messages
 * - Creates separate TOOL spans for actual tool execution results
 */

import type { TraceImportAdapter, TraceSummary } from '../types';
import type { OpenInferenceSpan, ToolCallRequest, OpenInferenceMessage } from '../../../types/openinference';
import type { LangGraphExecutionStep } from '../../../types/trace';

export class PlaygroundAdapter implements TraceImportAdapter {
  source = 'playground' as const;

  /**
   * Transform playground execution steps to OpenInference spans
   *
   * Algorithm:
   * 1. Build parent-child relationships from metadata.parent_span_id
   * 2. For each step, determine span kind (LLM, TOOL, CHAIN)
   * 3. For LLM spans: look for child TOOL steps and extract tool_calls to embed in output_messages
   * 4. For TOOL spans: extract tool name, args, and result
   * 5. Generate unique tool_call_ids to link LLM tool_calls to TOOL spans
   */
  transform(rawData: unknown): OpenInferenceSpan[] {
    // Validate input format
    if (!rawData || typeof rawData !== 'object' || !('steps' in rawData)) {
      throw new Error('Invalid playground trace format: expected { steps: LangGraphExecutionStep[] }');
    }

    const { steps } = rawData as { steps: LangGraphExecutionStep[] };

    if (!Array.isArray(steps)) {
      throw new Error('Invalid playground trace format: steps must be an array');
    }

    if (steps.length === 0) {
      return [];
    }

    // Build span ID to step mapping for quick lookups
    const spanIdToStep = new Map<string, LangGraphExecutionStep>();
    for (const step of steps) {
      const spanId = step.metadata?.span_id || step.step_id;
      spanIdToStep.set(spanId, step);
    }

    // Build parent-child relationships
    const childrenMap = new Map<string, LangGraphExecutionStep[]>();
    for (const step of steps) {
      const parentSpanId = step.metadata?.parent_span_id;
      if (parentSpanId) {
        if (!childrenMap.has(parentSpanId)) {
          childrenMap.set(parentSpanId, []);
        }
        childrenMap.get(parentSpanId)!.push(step);
      }
    }

    const spans: OpenInferenceSpan[] = [];

    for (const step of steps) {
      const spanId = step.metadata?.span_id || step.step_id;
      const parentSpanId = step.metadata?.parent_span_id;
      const spanName = step.metadata?.span_name || `step_${step.step_id}`;

      // Determine span kind and create appropriate span
      const spanKind = this.determineSpanKind(step);

      if (spanKind === 'LLM') {
        // Create LLM span with embedded tool_calls
        const llmSpan = this.createLLMSpan(step, spanId, parentSpanId, spanName, childrenMap);
        spans.push(llmSpan);
      } else if (spanKind === 'TOOL') {
        // Create TOOL span for tool execution
        const toolSpan = this.createToolSpan(step, spanId, parentSpanId, spanName);
        spans.push(toolSpan);
      } else {
        // Generic span (CHAIN, AGENT, etc.)
        const genericSpan = this.createGenericSpan(step, spanId, parentSpanId, spanName, spanKind);
        spans.push(genericSpan);
      }
    }

    return spans;
  }

  /**
   * Determine the OpenInference span kind based on step characteristics
   */
  private determineSpanKind(step: LangGraphExecutionStep): 'LLM' | 'TOOL' | 'CHAIN' {
    // Check if this is a tool call step
    if (step.tool_calls && step.tool_calls.length > 0) {
      return 'TOOL';
    }

    // Check metadata for tool name
    if (step.metadata?.toolName || step.metadata?.tool_name) {
      return 'TOOL';
    }

    // Check if this is an LLM generation step (has messages with assistant role)
    if (step.messages_added && step.messages_added.length > 0) {
      const hasAssistantMessage = step.messages_added.some(msg => msg.role === 'assistant');
      if (hasAssistantMessage) {
        return 'LLM';
      }
    }

    // Check metadata for model information (indicates LLM call)
    if (step.metadata?.model || step.metadata?.model_name) {
      return 'LLM';
    }

    // Default to CHAIN for other spans
    return 'CHAIN';
  }

  /**
   * Create an LLM span with tool_calls embedded in output_messages
   *
   * This is the KEY FIX: extracts tool call decisions from child TOOL steps
   * and embeds them in the LLM's output messages.
   */
  private createLLMSpan(
    step: LangGraphExecutionStep,
    spanId: string,
    parentSpanId: string | undefined,
    spanName: string,
    childrenMap: Map<string, LangGraphExecutionStep[]>
  ): OpenInferenceSpan {
    // Extract input and output messages
    const inputMessages: OpenInferenceMessage[] = [];
    const outputMessages: OpenInferenceMessage[] = [];

    for (const msg of step.messages_added || []) {
      const oiMessage: OpenInferenceMessage = {
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content || '',
      };

      if (msg.role === 'assistant') {
        outputMessages.push(oiMessage);
      } else {
        inputMessages.push(oiMessage);
      }
    }

    // Extract tool calls from child TOOL steps and embed in output messages
    const children = childrenMap.get(spanId) || [];
    const toolCallRequests: ToolCallRequest[] = [];

    for (const child of children) {
      // Check if child is a tool call
      if (child.tool_calls && child.tool_calls.length > 0) {
        for (const toolCall of child.tool_calls) {
          // Generate a unique tool_call_id
          const toolCallId = `call_${spanId}_${toolCall.tool_name}_${Date.now()}`;

          toolCallRequests.push({
            id: toolCallId,
            function: {
              name: toolCall.tool_name,
              arguments: JSON.stringify(toolCall.arguments),
            },
          });
        }
      }
    }

    // If we found tool calls, embed them in the last assistant message
    if (toolCallRequests.length > 0 && outputMessages.length > 0) {
      const lastAssistantMessage = outputMessages[outputMessages.length - 1];
      lastAssistantMessage.tool_calls = toolCallRequests;
    }

    // Calculate end time if not present
    const startTime = step.timestamp;
    const latencyMs = step.metadata?.latency_ms as number | undefined;
    const endTime = latencyMs
      ? new Date(new Date(startTime).getTime() + latencyMs).toISOString()
      : startTime;

    return {
      span_id: spanId,
      trace_id: step.trace_id,
      parent_span_id: parentSpanId,
      span_kind: 'LLM',
      name: spanName,
      start_time: startTime,
      end_time: endTime,
      status: step.error ? 'ERROR' : 'OK',
      status_message: step.error,
      llm: {
        model_name: step.metadata?.model as string | undefined,
        provider: step.metadata?.provider as string | undefined,
        input_messages: inputMessages,
        output_messages: outputMessages,
        token_count_prompt: step.metadata?.tokens_input as number | undefined,
        token_count_completion: step.metadata?.tokens_output as number | undefined,
        token_count_total:
          ((step.metadata?.tokens_input as number) || 0) +
          ((step.metadata?.tokens_output as number) || 0) || undefined,
      },
      attributes: {
        latency_ms: latencyMs,
        ...this.extractAdditionalAttributes(step.metadata),
      },
      source_span_id: step.step_id,
    };
  }

  /**
   * Create a TOOL span for tool execution
   */
  private createToolSpan(
    step: LangGraphExecutionStep,
    spanId: string,
    parentSpanId: string | undefined,
    spanName: string
  ): OpenInferenceSpan {
    // Extract tool information
    const toolCall = step.tool_calls?.[0]; // Assume one tool call per step
    const toolName = toolCall?.tool_name || step.metadata?.toolName || step.metadata?.tool_name || 'unknown';

    // Calculate end time
    const startTime = step.timestamp;
    const latencyMs = step.metadata?.latency_ms as number | undefined;
    const endTime = latencyMs
      ? new Date(new Date(startTime).getTime() + latencyMs).toISOString()
      : startTime;

    return {
      span_id: spanId,
      trace_id: step.trace_id,
      parent_span_id: parentSpanId,
      span_kind: 'TOOL',
      name: toolName,
      start_time: startTime,
      end_time: endTime,
      status: step.error || toolCall?.error ? 'ERROR' : 'OK',
      status_message: step.error || toolCall?.error,
      tool: {
        name: toolName,
        parameters: toolCall?.arguments,
        output: toolCall?.result,
      },
      attributes: {
        latency_ms: latencyMs,
        ...this.extractAdditionalAttributes(step.metadata),
      },
      source_span_id: step.step_id,
    };
  }

  /**
   * Create a generic span (CHAIN, AGENT, etc.)
   */
  private createGenericSpan(
    step: LangGraphExecutionStep,
    spanId: string,
    parentSpanId: string | undefined,
    spanName: string,
    spanKind: 'CHAIN' | 'AGENT'
  ): OpenInferenceSpan {
    // Calculate end time
    const startTime = step.timestamp;
    const latencyMs = step.metadata?.latency_ms as number | undefined;
    const endTime = latencyMs
      ? new Date(new Date(startTime).getTime() + latencyMs).toISOString()
      : startTime;

    return {
      span_id: spanId,
      trace_id: step.trace_id,
      parent_span_id: parentSpanId,
      span_kind: spanKind,
      name: spanName,
      start_time: startTime,
      end_time: endTime,
      status: step.error ? 'ERROR' : 'OK',
      status_message: step.error,
      input: step.input,
      output: step.output,
      attributes: {
        latency_ms: latencyMs,
        messages_added: step.messages_added,
        ...this.extractAdditionalAttributes(step.metadata),
      },
      source_span_id: step.step_id,
    };
  }

  /**
   * Extract additional attributes from step metadata
   * Excludes already-mapped fields
   */
  private extractAdditionalAttributes(metadata?: Record<string, any>): Record<string, unknown> {
    if (!metadata) return {};

    const excludeKeys = [
      'span_id',
      'parent_span_id',
      'span_name',
      'latency_ms',
      'tokens_input',
      'tokens_output',
      'model',
      'model_name',
      'provider',
      'toolName',
      'tool_name',
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
