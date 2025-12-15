/**
 * D1TraceCollector - D1 Database implementation of TraceCollector
 *
 * Buffers trace events in memory and converts them to LangGraphExecutionStep
 * format on flush, then persists to the traces table (source='playground').
 * Step data is embedded in the trace's steps JSON field.
 */

import type { LangGraphExecutionStep, Message, ToolCall } from '../../types/trace';
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
  type: 'llm_call' | 'tool_call' | 'tool_result';
  startTime: string;
  endTime?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  metadata?: Record<string, unknown>;
  // For tool calls
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  toolError?: string;
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
      type: 'llm_call', // Default, will be updated based on events
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
      span.type = 'llm_call';
      span.input = event.input;
      span.output = event.output;
      span.usage = event.usage;
      if (event.metadata) {
        span.metadata = { ...span.metadata, ...event.metadata };
      }
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
      span.type = 'tool_call';
      span.toolName = event.toolName;
      span.toolArgs = event.input;
      if (event.metadata) {
        span.metadata = { ...span.metadata, ...event.metadata };
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
    if (span) {
      span.toolResult = result;
      span.toolError = error;
    }

    // Buffer the event
    this.buffer.push({
      type: 'tool_result',
      traceId: this.traceId!,
      spanId,
      name: span?.toolName || 'unknown',
      timestamp: new Date().toISOString(),
      output: result,
      error,
    });
  }

  async flush(): Promise<void> {
    if (!this.traceId || !this.metadata) {
      throw new Error('Cannot flush: trace not initialized');
    }

    // Convert spans to LangGraphExecutionStep format
    const steps = this.convertToLangGraphSteps();

    // Prepare trace data
    // Use this.traceId as the id so it matches what's stored in session messages
    const traceData = {
      id: this.traceId,
      workspaceId: this.metadata.workspaceId,
      integrationId: this.metadata.integrationId || 'playground', // Use provided integration ID or default
      traceId: this.traceId,
      source: this.metadata.source || 'playground', // Use provided source or default to 'playground'
      timestamp: new Date().toISOString(),
      steps: JSON.stringify(steps),
      metadata: this.metadata.customMetadata ? JSON.stringify(this.metadata.customMetadata) : null,
      inputPreview: this.generateInputPreview(),
      outputPreview: this.generateOutputPreview(),
      stepCount: steps.length,
      hasErrors: steps.some((s) => !!s.error),
      // Include agent version info from metadata for proper trace-agent linking
      agentVersionId: this.metadata.agentVersionId || null,
    };

    try {
      // Insert into traces table with agent_version_id for proper trace-agent linking
      await this.db
        .prepare(
          `INSERT INTO traces (
          id, workspace_id, integration_id, trace_id, source, timestamp,
          steps, metadata, input_preview, output_preview, step_count, has_errors, imported_at,
          agent_version_id, assignment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          traceData.id,
          traceData.workspaceId,
          traceData.integrationId,
          traceData.traceId,
          traceData.source,
          traceData.timestamp,
          traceData.steps,
          traceData.metadata,
          traceData.inputPreview,
          traceData.outputPreview,
          traceData.stepCount,
          traceData.hasErrors ? 1 : 0,
          new Date().toISOString(),
          traceData.agentVersionId,
          traceData.agentVersionId ? 'assigned' : 'unassigned'
        )
        .run();

      // Note: playground_steps table was removed in migration 0002
      // Step data is embedded in the trace's steps JSON field instead
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
   * Convert buffered spans to LangGraphExecutionStep format
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
      if (span.type === 'llm_call') {
        if (span.input) {
          // Assume input is either a string or has messages
          if (typeof span.input === 'string') {
            messages.push({
              role: 'user',
              content: span.input,
            });
          } else if (
            typeof span.input === 'object' &&
            'messages' in span.input &&
            Array.isArray(span.input.messages)
          ) {
            messages.push(...(span.input.messages as Message[]));
          }
        }

        if (span.output) {
          // Assume output is a string or has content
          const content =
            typeof span.output === 'string'
              ? span.output
              : typeof span.output === 'object' && 'content' in span.output
                ? String(span.output.content)
                : JSON.stringify(span.output);

          messages.push({
            role: 'assistant',
            content,
          });
        }
      }

      // Extract tool calls
      if (span.type === 'tool_call' && span.toolName) {
        toolCalls.push({
          tool_name: span.toolName,
          arguments: span.toolArgs || {},
          result: span.toolResult,
          error: span.toolError,
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
   * Generate input preview (first 200 chars)
   */
  private generateInputPreview(): string {
    const firstSpan = Array.from(this.spans.values()).sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    )[0];

    if (!firstSpan?.input) return 'No input';

    const inputStr =
      typeof firstSpan.input === 'string'
        ? firstSpan.input
        : JSON.stringify(firstSpan.input);

    return inputStr.length > 200 ? `${inputStr.slice(0, 200)}...` : inputStr;
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

    // Find the last span with an output (LLM calls have output, tool calls don't)
    for (const span of sortedSpans) {
      if (span.output) {
        // Handle output that might be {content: string} or just a string
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
