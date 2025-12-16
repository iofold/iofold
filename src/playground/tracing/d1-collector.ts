/**
 * D1TraceCollector - D1 Database implementation of TraceCollector
 *
 * Buffers trace events in memory and converts them to both LangGraphExecutionStep
 * format (for backwards compatibility) and OpenInference spans (canonical format).
 * Both formats are persisted to the traces table (source='playground').
 */

import type { LangGraphExecutionStep, Message, ToolCall } from '../../types/trace';
import type {
  OpenInferenceSpan,
  OpenInferenceMessage,
  ToolCallRequest,
  OpenInferenceSpanKind,
} from '../../types/openinference';
import type {
  TraceCollector,
  TraceEvent,
  TraceMetadata,
  SpanStartEvent,
  GenerationEvent,
  ToolCallEvent,
} from './types';

interface Span {
  id: string;
  parentId?: string;
  name: string;
  span_kind: OpenInferenceSpanKind;
  startTime: string;
  endTime?: string;
  error?: string;
  metadata?: Record<string, unknown>;

  // Usage/token tracking
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };

  // LLM-specific data (when span_kind = 'LLM')
  llm?: {
    model_name?: string;
    provider?: string;
    input_messages: OpenInferenceMessage[];
    output_messages: OpenInferenceMessage[];
  };

  // Tool-specific data (when span_kind = 'TOOL')
  tool?: {
    name: string;
    parameters?: Record<string, unknown>;
    output?: unknown;
    error?: string;
  };

  // Generic input/output for non-LLM/TOOL spans
  input?: unknown;
  output?: unknown;

  // Buffered tool call requests (temporary storage before embedding in parent LLM span)
  pendingToolCalls?: ToolCallRequest[];
}

export class D1TraceCollector implements TraceCollector {
  private db: D1Database;
  private traceId?: string;
  private metadata?: TraceMetadata;
  private spans: Map<string, Span> = new Map();
  private buffer: TraceEvent[] = [];
  private spanCounter = 0;

  constructor(db: D1Database) {
    this.db = db;
  }

  startTrace(traceId: string, metadata: TraceMetadata): void {
    this.traceId = traceId;
    this.metadata = metadata;
    this.spans.clear();
    this.buffer = [];
    this.spanCounter = 0;
  }

  async endTrace(traceId: string, output?: unknown): Promise<void> {
    if (this.traceId !== traceId) {
      throw new Error(`Trace ID mismatch: expected ${this.traceId}, got ${traceId}`);
    }

    // Add final output to metadata
    if (output && this.metadata) {
      this.metadata = {
        ...this.metadata,
        finalOutput: output,
      } as TraceMetadata;
    }

    await this.flush();
  }

  startSpan(event: SpanStartEvent): string {
    const spanId = `span_${this.traceId}_${++this.spanCounter}`;
    const timestamp = new Date().toISOString();

    const span: Span = {
      id: spanId,
      parentId: event.parentSpanId,
      name: event.name,
      span_kind: 'CHAIN', // Default, will be updated based on events
      startTime: timestamp,
      input: event.input,
      metadata: event.metadata,
    };

    this.spans.set(spanId, span);

    // Buffer the event
    this.buffer.push({
      type: 'span_start',
      traceId: event.traceId,
      spanId,
      parentSpanId: event.parentSpanId,
      name: event.name,
      timestamp,
      input: event.input,
      metadata: event.metadata,
    });

    return spanId;
  }

  endSpan(spanId: string, output?: unknown, error?: string): void {
    const span = this.spans.get(spanId);
    if (!span) {
      console.warn(`Span ${spanId} not found`);
      return;
    }

    span.endTime = new Date().toISOString();
    span.output = output;
    span.error = error;

    // Buffer the event
    this.buffer.push({
      type: 'span_end',
      traceId: this.traceId!,
      spanId,
      name: span.name,
      timestamp: span.endTime,
      output,
      error,
    });
  }

  logGeneration(event: GenerationEvent): void {
    const span = this.spans.get(event.spanId);
    if (span) {
      span.span_kind = 'LLM';
      span.usage = event.usage;
      if (event.metadata) {
        span.metadata = { ...span.metadata, ...event.metadata };
      }

      // Build LLM structure with input/output messages
      const inputMessages: OpenInferenceMessage[] = [];
      const outputMessages: OpenInferenceMessage[] = [];

      // Extract input messages
      if (event.input) {
        if (typeof event.input === 'string') {
          inputMessages.push({
            role: 'user',
            content: event.input,
          });
        } else if (
          typeof event.input === 'object' &&
          'messages' in event.input &&
          Array.isArray(event.input.messages)
        ) {
          // Convert existing messages to OpenInferenceMessage format
          for (const msg of event.input.messages) {
            inputMessages.push({
              role: msg.role as 'user' | 'assistant' | 'system',
              content: msg.content || '',
            });
          }
        }
      }

      // Extract output messages
      if (event.output) {
        const content =
          typeof event.output === 'string'
            ? event.output
            : typeof event.output === 'object' && 'content' in event.output
              ? String(event.output.content)
              : JSON.stringify(event.output);

        outputMessages.push({
          role: 'assistant',
          content,
        });
      }

      span.llm = {
        model_name: event.metadata?.model as string | undefined,
        provider: event.metadata?.provider as string | undefined,
        input_messages: inputMessages,
        output_messages: outputMessages,
      };

      // Keep generic input/output for backwards compatibility with LangGraphExecutionStep conversion
      span.input = event.input;
      span.output = event.output;
    }

    // Buffer the event
    this.buffer.push({
      type: 'generation',
      traceId: event.traceId,
      spanId: event.spanId,
      name: event.name,
      timestamp: new Date().toISOString(),
      input: event.input,
      output: event.output,
      usage: event.usage,
      latencyMs: event.latencyMs,
      metadata: event.metadata,
    });
  }

  logToolCall(event: ToolCallEvent): void {
    const span = this.spans.get(event.spanId);
    if (span) {
      span.span_kind = 'TOOL';
      if (event.metadata) {
        span.metadata = { ...span.metadata, ...event.metadata };
      }

      // Build TOOL structure
      span.tool = {
        name: event.toolName,
        parameters: event.input as Record<string, unknown>,
      };

      // Generate a unique tool_call_id
      const toolCallId = `call_${event.spanId}_${event.toolName}_${Date.now()}`;

      // Create a ToolCallRequest to buffer for parent LLM span
      const toolCallRequest: ToolCallRequest = {
        id: toolCallId,
        function: {
          name: event.toolName,
          arguments: JSON.stringify(event.input),
        },
      };

      // Find parent LLM span and buffer the tool call request
      if (span.parentId) {
        const parentSpan = this.spans.get(span.parentId);
        if (parentSpan && parentSpan.span_kind === 'LLM') {
          if (!parentSpan.pendingToolCalls) {
            parentSpan.pendingToolCalls = [];
          }
          parentSpan.pendingToolCalls.push(toolCallRequest);
        }
      }
    }

    // Buffer the event
    this.buffer.push({
      type: 'tool_call',
      traceId: event.traceId,
      spanId: event.spanId,
      name: event.toolName,
      timestamp: new Date().toISOString(),
      input: event.input,
      metadata: event.metadata,
    });
  }

  logToolResult(spanId: string, result: unknown, error?: string): void {
    const span = this.spans.get(spanId);
    if (span && span.tool) {
      span.tool.output = result;
      span.tool.error = error;
      if (error) {
        span.error = error;
      }
    }

    // Buffer the event
    this.buffer.push({
      type: 'tool_result',
      traceId: this.traceId!,
      spanId,
      name: span?.tool?.name || 'unknown',
      timestamp: new Date().toISOString(),
      output: result,
      error,
    });
  }

  async flush(): Promise<void> {
    if (!this.traceId || !this.metadata) {
      throw new Error('Cannot flush: trace not initialized');
    }

    // Convert spans to both formats
    const steps = this.convertToLangGraphSteps(); // Old format (backwards compat)
    const spans = this.convertToOpenInferenceSpans(); // New OpenInference format

    // Calculate summary statistics from OpenInference spans
    let totalTokens = 0;
    let totalDurationMs = 0;
    let hasErrors = false;

    for (const span of spans) {
      if (span.llm?.token_count_total) {
        totalTokens += span.llm.token_count_total;
      }
      if (span.start_time && span.end_time) {
        const duration = new Date(span.end_time).getTime() - new Date(span.start_time).getTime();
        totalDurationMs += duration;
      }
      if (span.status === 'ERROR') {
        hasErrors = true;
      }
    }

    // Prepare trace data
    // Use this.traceId as the id so it matches what's stored in session messages
    const traceData = {
      id: this.traceId,
      workspaceId: this.metadata.workspaceId,
      integrationId: this.metadata.integrationId || 'playground', // Use provided integration ID or default
      traceId: this.traceId,
      source: this.metadata.source || 'playground', // Use provided source or default to 'playground'
      timestamp: new Date().toISOString(),
      steps: JSON.stringify(steps), // Old format (backwards compat)
      spans: JSON.stringify(spans), // New OpenInference format
      metadata: this.metadata.customMetadata ? JSON.stringify(this.metadata.customMetadata) : null,
      inputPreview: this.generateInputPreview(),
      outputPreview: this.generateOutputPreview(),
      stepCount: steps.length,
      spanCount: spans.length,
      totalTokens: totalTokens > 0 ? totalTokens : null,
      totalDurationMs: totalDurationMs > 0 ? totalDurationMs : null,
      hasErrors,
      // Include agent version info from metadata for proper trace-agent linking
      agentVersionId: this.metadata.agentVersionId || null,
    };

    try {
      // Insert into traces table with both steps and spans formats
      await this.db
        .prepare(
          `INSERT INTO traces (
          id, workspace_id, integration_id, trace_id, source, timestamp,
          steps, spans, metadata, input_preview, output_preview,
          step_count, span_count, total_tokens, total_duration_ms, has_errors, imported_at,
          agent_version_id, assignment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          traceData.id,
          traceData.workspaceId,
          traceData.integrationId,
          traceData.traceId,
          traceData.source,
          traceData.timestamp,
          traceData.steps,
          traceData.spans,
          traceData.metadata,
          traceData.inputPreview,
          traceData.outputPreview,
          traceData.stepCount,
          traceData.spanCount,
          traceData.totalTokens,
          traceData.totalDurationMs,
          traceData.hasErrors ? 1 : 0,
          new Date().toISOString(),
          traceData.agentVersionId,
          traceData.agentVersionId ? 'assigned' : 'unassigned'
        )
        .run();

      // Note: Both steps and spans are stored for transition period
      // - steps: Old LangGraphExecutionStep format (backwards compat)
      // - spans: New OpenInference format (canonical)
    } catch (error) {
      console.error('Failed to flush trace:', error);
      throw error;
    }
  }

  getCurrentTraceId(): string | undefined {
    return this.traceId;
  }

  clear(): void {
    this.traceId = undefined;
    this.metadata = undefined;
    this.spans.clear();
    this.buffer = [];
    this.spanCounter = 0;
  }

  /**
   * Convert buffered spans to LangGraphExecutionStep format (backwards compatibility)
   */
  private convertToLangGraphSteps(): LangGraphExecutionStep[] {
    const steps: LangGraphExecutionStep[] = [];
    let stepIndex = 0;

    // Sort spans by start time
    const sortedSpans = Array.from(this.spans.values()).sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    for (const span of sortedSpans) {
      const messages: Message[] = [];
      const toolCalls: ToolCall[] = [];

      // Extract messages from LLM calls
      if (span.span_kind === 'LLM' && span.llm) {
        // Add input messages (filter out 'tool' role for old format)
        for (const msg of span.llm.input_messages) {
          if (msg.role !== 'tool') {
            messages.push({
              role: msg.role as 'user' | 'assistant' | 'system',
              content: msg.content,
            });
          }
        }

        // Add output messages (filter out 'tool' role for old format)
        for (const msg of span.llm.output_messages) {
          if (msg.role !== 'tool') {
            messages.push({
              role: msg.role as 'user' | 'assistant' | 'system',
              content: msg.content,
            });
          }
        }
      }

      // Extract tool calls
      if (span.span_kind === 'TOOL' && span.tool) {
        toolCalls.push({
          tool_name: span.tool.name,
          arguments: span.tool.parameters || {},
          result: span.tool.output,
          error: span.tool.error,
        });
      }

      // Create step
      const step: LangGraphExecutionStep = {
        step_id: `step_${stepIndex++}`,
        trace_id: this.traceId!,
        timestamp: span.startTime,
        messages_added: messages,
        tool_calls: toolCalls,
        input: span.input,
        output: span.output,
        metadata: {
          span_id: span.id,
          parent_span_id: span.parentId,
          span_name: span.name,
          latency_ms: span.endTime
            ? new Date(span.endTime).getTime() - new Date(span.startTime).getTime()
            : undefined,
          tokens_input: span.usage?.inputTokens,
          tokens_output: span.usage?.outputTokens,
          ...span.metadata,
        },
        error: span.error,
      };

      steps.push(step);
    }

    return steps;
  }

  /**
   * Convert buffered spans to OpenInference format
   *
   * Key feature: Embeds pending tool_calls from child TOOL spans
   * into parent LLM span's output messages.
   */
  private convertToOpenInferenceSpans(): OpenInferenceSpan[] {
    const oiSpans: OpenInferenceSpan[] = [];

    // Sort spans by start time
    const sortedSpans = Array.from(this.spans.values()).sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    for (const span of sortedSpans) {
      // Calculate end time if not present
      const endTime = span.endTime || span.startTime;

      // Determine status
      const status: 'OK' | 'ERROR' | 'UNSET' = span.error ? 'ERROR' : 'OK';

      // Base span structure
      const baseSpan = {
        span_id: span.id,
        trace_id: this.traceId!,
        parent_span_id: span.parentId,
        span_kind: span.span_kind,
        name: span.name,
        start_time: span.startTime,
        end_time: endTime,
        status,
        status_message: span.error,
        source_span_id: span.id,
      };

      if (span.span_kind === 'LLM' && span.llm) {
        // Embed pending tool calls in output messages
        let outputMessages = [...span.llm.output_messages];

        if (span.pendingToolCalls && span.pendingToolCalls.length > 0) {
          // Add tool_calls to the last assistant message
          if (outputMessages.length > 0) {
            const lastMsg = outputMessages[outputMessages.length - 1];
            if (lastMsg.role === 'assistant') {
              outputMessages[outputMessages.length - 1] = {
                ...lastMsg,
                tool_calls: span.pendingToolCalls,
              };
            }
          }
        }

        oiSpans.push({
          ...baseSpan,
          llm: {
            model_name: span.llm.model_name,
            provider: span.llm.provider,
            input_messages: span.llm.input_messages,
            output_messages: outputMessages,
            token_count_prompt: span.usage?.inputTokens,
            token_count_completion: span.usage?.outputTokens,
            token_count_total:
              (span.usage?.inputTokens || 0) + (span.usage?.outputTokens || 0) || undefined,
          },
          attributes: {
            latency_ms: span.endTime
              ? new Date(span.endTime).getTime() - new Date(span.startTime).getTime()
              : undefined,
            ...span.metadata,
          },
        });
      } else if (span.span_kind === 'TOOL' && span.tool) {
        oiSpans.push({
          ...baseSpan,
          tool: {
            name: span.tool.name,
            parameters: span.tool.parameters,
            output: span.tool.output,
          },
          attributes: {
            latency_ms: span.endTime
              ? new Date(span.endTime).getTime() - new Date(span.startTime).getTime()
              : undefined,
            ...span.metadata,
          },
        });
      } else {
        // Generic span (CHAIN, AGENT, etc.)
        oiSpans.push({
          ...baseSpan,
          input: span.input,
          output: span.output,
          attributes: {
            latency_ms: span.endTime
              ? new Date(span.endTime).getTime() - new Date(span.startTime).getTime()
              : undefined,
            ...span.metadata,
          },
        });
      }
    }

    return oiSpans;
  }

  /**
   * Generate input preview (first 200 chars)
   */
  private generateInputPreview(): string {
    const firstSpan = Array.from(this.spans.values()).sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    )[0];

    if (!firstSpan) return 'No input';

    // Try LLM input messages first
    if (firstSpan.llm?.input_messages?.[0]) {
      const content = firstSpan.llm.input_messages[0].content;
      return content.length > 200 ? `${content.slice(0, 200)}...` : content;
    }

    // Fall back to generic input
    if (firstSpan.input) {
      const inputStr =
        typeof firstSpan.input === 'string'
          ? firstSpan.input
          : JSON.stringify(firstSpan.input);
      return inputStr.length > 200 ? `${inputStr.slice(0, 200)}...` : inputStr;
    }

    return 'No input';
  }

  /**
   * Generate output preview (first 200 chars)
   * Searches backwards through spans to find the last LLM output
   */
  private generateOutputPreview(): string {
    // Sort spans by startTime descending (most recent first)
    const sortedSpans = Array.from(this.spans.values()).sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );

    // Find the last LLM span with output messages
    for (const span of sortedSpans) {
      if (span.llm?.output_messages && span.llm.output_messages.length > 0) {
        const lastMsg = span.llm.output_messages[span.llm.output_messages.length - 1];
        const content = lastMsg.content;
        return content.length > 200 ? `${content.slice(0, 200)}...` : content;
      }
    }

    // Fall back to generic output
    for (const span of sortedSpans) {
      if (span.output) {
        let outputStr: string;
        if (typeof span.output === 'object' && 'content' in span.output) {
          outputStr = String((span.output as { content: string }).content);
        } else if (typeof span.output === 'string') {
          outputStr = span.output;
        } else {
          outputStr = JSON.stringify(span.output);
        }

        return outputStr.length > 200 ? `${outputStr.slice(0, 200)}...` : outputStr;
      }
    }

    return 'No output';
  }
}
