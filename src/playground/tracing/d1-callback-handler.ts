/**
 * D1CallbackHandler - LangChain Callback Handler for D1 Database Tracing
 *
 * Automatically captures multi-turn LLM interactions by implementing
 * LangChain's BaseCallbackHandler interface. Each LLM turn gets its own
 * span, with tool calls properly nested as child spans.
 *
 * Key advantage over manual tracing: LangChain calls handleChatModelStart/End
 * per-turn, not per-request, so multi-turn conversations are captured correctly.
 */

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';
import type { LLMResult } from '@langchain/core/outputs';
import type { BaseMessage } from '@langchain/core/messages';
import type {
  OpenInferenceSpan,
  OpenInferenceMessage,
  ToolCallRequest,
  OpenInferenceSpanKind,
} from '../../types/openinference';
import type { LangGraphExecutionStep, Message, ToolCall } from '../../types/trace';
import type { TraceMetadata } from './types';

interface SpanData {
  spanId: string;
  parentSpanId?: string;
  spanKind: OpenInferenceSpanKind;
  name: string;
  startTime: string;
  endTime?: string;
  error?: string;

  // LLM-specific
  inputMessages?: OpenInferenceMessage[];
  outputMessages?: OpenInferenceMessage[];
  modelName?: string;
  provider?: string;
  tokenCounts?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };

  // Tool-specific
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;

  // Generic
  input?: unknown;
  output?: unknown;
}

export class D1CallbackHandler extends BaseCallbackHandler {
  name = 'D1CallbackHandler';

  private db: D1Database;
  private traceId: string;
  private metadata: TraceMetadata;

  // Map LangChain runId → our span data
  private spans: Map<string, SpanData> = new Map();

  // Map runId → spanId for parent lookups
  private runIdToSpanId: Map<string, string> = new Map();

  // Counter for generating unique span IDs
  private spanCounter = 0;

  // Track pending tool calls per LLM span (runId → tool calls)
  private pendingToolCalls: Map<string, ToolCallRequest[]> = new Map();

  constructor(db: D1Database, traceId: string, metadata: TraceMetadata) {
    super();
    this.db = db;
    this.traceId = traceId;
    this.metadata = metadata;
  }

  /**
   * Called at the start of a Chat Model run (per LLM turn)
   */
  handleChatModelStart(
    llm: Serialized,
    messages: BaseMessage[][],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    _tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string
  ): void {
    const spanId = this.generateSpanId();
    this.runIdToSpanId.set(runId, spanId);

    // Extract input messages from LangChain format
    const inputMessages = this.extractInputMessages(messages);

    // Extract model info from extraParams or metadata
    const modelName =
      (extraParams?.model as string) ||
      (metadata?.model as string) ||
      (llm.id?.[llm.id.length - 1] as string);
    const provider =
      (extraParams?.provider as string) ||
      (metadata?.provider as string) ||
      (llm.id?.[1] as string);

    const span: SpanData = {
      spanId,
      parentSpanId: parentRunId ? this.runIdToSpanId.get(parentRunId) : undefined,
      spanKind: 'LLM',
      name: runName || 'LLM Generation',
      startTime: new Date().toISOString(),
      inputMessages,
      outputMessages: [],
      modelName,
      provider,
    };

    this.spans.set(runId, span);
  }

  /**
   * Called at the end of an LLM/ChatModel run
   */
  handleLLMEnd(
    output: LLMResult,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _extraParams?: Record<string, unknown>
  ): void {
    const span = this.spans.get(runId);
    if (!span) return;

    span.endTime = new Date().toISOString();

    // Extract output messages and token usage
    const { outputMessages, toolCalls } = this.extractOutputMessages(output);
    span.outputMessages = outputMessages;

    // If there are tool calls, store them for embedding in the span
    if (toolCalls.length > 0) {
      this.pendingToolCalls.set(runId, toolCalls);
    }

    // Extract token counts
    if (output.llmOutput) {
      const tokenUsage = output.llmOutput.tokenUsage || output.llmOutput.usage;
      if (tokenUsage) {
        span.tokenCounts = {
          prompt: tokenUsage.promptTokens || tokenUsage.prompt_tokens,
          completion: tokenUsage.completionTokens || tokenUsage.completion_tokens,
          total: tokenUsage.totalTokens || tokenUsage.total_tokens,
        };
      }
    }
  }

  /**
   * Called at the start of a Tool run
   */
  handleToolStart(
    tool: Serialized,
    input: string,
    runId: string,
    parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    runName?: string
  ): void {
    const spanId = this.generateSpanId();
    this.runIdToSpanId.set(runId, spanId);

    // Parse tool input
    let toolInput: Record<string, unknown>;
    try {
      toolInput = typeof input === 'string' ? JSON.parse(input) : input;
    } catch {
      toolInput = { raw: input };
    }

    const toolName = runName || tool.id?.[tool.id.length - 1] || 'unknown_tool';

    const span: SpanData = {
      spanId,
      parentSpanId: parentRunId ? this.runIdToSpanId.get(parentRunId) : undefined,
      spanKind: 'TOOL',
      name: toolName,
      startTime: new Date().toISOString(),
      toolName,
      toolInput,
    };

    this.spans.set(runId, span);
  }

  /**
   * Called at the end of a Tool run
   */
  handleToolEnd(output: unknown, runId: string): void {
    const span = this.spans.get(runId);
    if (!span) return;

    span.endTime = new Date().toISOString();
    span.toolOutput = output;
  }

  /**
   * Called if a Tool run encounters an error
   */
  handleToolError(err: Error, runId: string): void {
    const span = this.spans.get(runId);
    if (!span) return;

    span.endTime = new Date().toISOString();
    span.error = err.message;
  }

  /**
   * Called if an LLM run encounters an error
   */
  handleLLMError(err: Error, runId: string): void {
    const span = this.spans.get(runId);
    if (!span) return;

    span.endTime = new Date().toISOString();
    span.error = err.message;
  }

  /**
   * Flush all collected spans to D1 database
   */
  async flush(): Promise<void> {
    const spans = this.convertToOpenInferenceSpans();
    const steps = this.convertToLangGraphSteps();

    // Calculate summary statistics
    let totalTokens = 0;
    let totalDurationMs = 0;
    let hasErrors = false;

    for (const span of spans) {
      if (span.llm?.token_count_total) {
        totalTokens += span.llm.token_count_total;
      }
      if (span.start_time && span.end_time) {
        totalDurationMs += new Date(span.end_time).getTime() - new Date(span.start_time).getTime();
      }
      if (span.status === 'ERROR') {
        hasErrors = true;
      }
    }

    const traceData = {
      id: this.traceId,
      workspaceId: this.metadata.workspaceId,
      integrationId: this.metadata.integrationId || 'playground',
      traceId: this.traceId,
      source: this.metadata.source || 'playground',
      timestamp: new Date().toISOString(),
      steps: JSON.stringify(steps),
      spans: JSON.stringify(spans),
      metadata: this.metadata.customMetadata ? JSON.stringify(this.metadata.customMetadata) : null,
      inputPreview: this.generateInputPreview(),
      outputPreview: this.generateOutputPreview(),
      stepCount: steps.length,
      spanCount: spans.length,
      totalTokens: totalTokens > 0 ? totalTokens : null,
      totalDurationMs: totalDurationMs > 0 ? totalDurationMs : null,
      hasErrors,
      agentVersionId: this.metadata.agentVersionId || null,
    };

    try {
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
    } catch (error) {
      console.error('Failed to flush trace:', error);
      throw error;
    }
  }

  /**
   * Get the trace ID
   */
  getTraceId(): string {
    return this.traceId;
  }

  // ============ Private Helper Methods ============

  private generateSpanId(): string {
    return `span_${this.traceId}_${++this.spanCounter}`;
  }

  /**
   * Extract input messages from LangChain BaseMessage format
   */
  private extractInputMessages(messages: BaseMessage[][]): OpenInferenceMessage[] {
    const result: OpenInferenceMessage[] = [];

    // messages is array of arrays (for batch support), we use first batch
    const batch = messages[0] || [];

    for (const msg of batch) {
      const role = this.mapMessageRole(msg._getType());
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

      result.push({ role, content });
    }

    return result;
  }

  /**
   * Extract output messages and tool calls from LLMResult
   */
  private extractOutputMessages(output: LLMResult): {
    outputMessages: OpenInferenceMessage[];
    toolCalls: ToolCallRequest[];
  } {
    const outputMessages: OpenInferenceMessage[] = [];
    const toolCalls: ToolCallRequest[] = [];

    for (const generation of output.generations.flat()) {
      const content =
        typeof generation.text === 'string' ? generation.text : JSON.stringify(generation.text);

      const message: OpenInferenceMessage = {
        role: 'assistant',
        content,
      };

      // Check for tool calls in the generation (ChatGeneration has a message property)
      // Use type guard to check if this is a ChatGeneration
      if ('message' in generation && generation.message) {
        const genMessage = generation.message as BaseMessage;

        // Check for tool calls in message (Anthropic/newer format)
        if ('tool_calls' in genMessage && Array.isArray((genMessage as any).tool_calls)) {
          for (const tc of (genMessage as any).tool_calls) {
            toolCalls.push({
              id: tc.id || `call_${Date.now()}_${tc.name}`,
              function: {
                name: tc.name,
                arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args),
              },
            });
          }
        }

        // Check additional_kwargs for tool_calls (OpenAI format)
        if (
          'additional_kwargs' in genMessage &&
          (genMessage as any).additional_kwargs?.tool_calls
        ) {
          for (const tc of (genMessage as any).additional_kwargs.tool_calls) {
            toolCalls.push({
              id: tc.id,
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            });
          }
        }
      }

      outputMessages.push(message);
    }

    return { outputMessages, toolCalls };
  }

  /**
   * Map LangChain message type to OpenInference role
   */
  private mapMessageRole(type: string): 'user' | 'assistant' | 'system' | 'tool' {
    switch (type) {
      case 'human':
        return 'user';
      case 'ai':
        return 'assistant';
      case 'system':
        return 'system';
      case 'tool':
        return 'tool';
      case 'function':
        return 'tool';
      default:
        return 'user';
    }
  }

  /**
   * Convert spans to OpenInference format
   */
  private convertToOpenInferenceSpans(): OpenInferenceSpan[] {
    const oiSpans: OpenInferenceSpan[] = [];

    // Sort spans by start time
    const sortedSpans = Array.from(this.spans.entries()).sort(
      ([, a], [, b]) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    for (const [runId, span] of sortedSpans) {
      const status: 'OK' | 'ERROR' | 'UNSET' = span.error ? 'ERROR' : 'OK';

      const baseSpan = {
        span_id: span.spanId,
        trace_id: this.traceId,
        parent_span_id: span.parentSpanId,
        span_kind: span.spanKind,
        name: span.name,
        start_time: span.startTime,
        end_time: span.endTime || span.startTime,
        status,
        status_message: span.error,
        source_span_id: span.spanId,
      };

      if (span.spanKind === 'LLM') {
        // Get pending tool calls for this LLM span
        const toolCallsForSpan = this.pendingToolCalls.get(runId) || [];

        // Embed tool calls in last assistant message
        let outputMessages = [...(span.outputMessages || [])];
        if (toolCallsForSpan.length > 0 && outputMessages.length > 0) {
          const lastIdx = outputMessages.length - 1;
          if (outputMessages[lastIdx].role === 'assistant') {
            outputMessages[lastIdx] = {
              ...outputMessages[lastIdx],
              tool_calls: toolCallsForSpan,
            };
          }
        }

        oiSpans.push({
          ...baseSpan,
          llm: {
            model_name: span.modelName,
            provider: span.provider,
            input_messages: span.inputMessages || [],
            output_messages: outputMessages,
            token_count_prompt: span.tokenCounts?.prompt,
            token_count_completion: span.tokenCounts?.completion,
            token_count_total: span.tokenCounts?.total,
          },
          attributes: {
            latency_ms: span.endTime
              ? new Date(span.endTime).getTime() - new Date(span.startTime).getTime()
              : undefined,
          },
        });
      } else if (span.spanKind === 'TOOL') {
        oiSpans.push({
          ...baseSpan,
          tool: {
            name: span.toolName || span.name,
            parameters: span.toolInput,
            output: span.toolOutput,
          },
          attributes: {
            latency_ms: span.endTime
              ? new Date(span.endTime).getTime() - new Date(span.startTime).getTime()
              : undefined,
          },
        });
      } else {
        oiSpans.push({
          ...baseSpan,
          input: span.input,
          output: span.output,
          attributes: {
            latency_ms: span.endTime
              ? new Date(span.endTime).getTime() - new Date(span.startTime).getTime()
              : undefined,
          },
        });
      }
    }

    return oiSpans;
  }

  /**
   * Convert spans to LangGraphExecutionStep format (backwards compatibility)
   */
  private convertToLangGraphSteps(): LangGraphExecutionStep[] {
    const steps: LangGraphExecutionStep[] = [];
    let stepIndex = 0;

    const sortedSpans = Array.from(this.spans.values()).sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    for (const span of sortedSpans) {
      const messages: Message[] = [];
      const toolCalls: ToolCall[] = [];

      if (span.spanKind === 'LLM') {
        // Add input messages
        for (const msg of span.inputMessages || []) {
          if (msg.role !== 'tool') {
            messages.push({
              role: msg.role as 'user' | 'assistant' | 'system',
              content: msg.content,
            });
          }
        }
        // Add output messages
        for (const msg of span.outputMessages || []) {
          if (msg.role !== 'tool') {
            messages.push({
              role: msg.role as 'user' | 'assistant' | 'system',
              content: msg.content,
            });
          }
        }
      }

      if (span.spanKind === 'TOOL') {
        toolCalls.push({
          tool_name: span.toolName || span.name,
          arguments: span.toolInput || {},
          result: span.toolOutput,
          error: span.error,
        });
      }

      steps.push({
        step_id: `step_${stepIndex++}`,
        trace_id: this.traceId,
        timestamp: span.startTime,
        messages_added: messages,
        tool_calls: toolCalls,
        input: span.spanKind === 'LLM' ? { messages: span.inputMessages } : span.toolInput,
        output:
          span.spanKind === 'LLM'
            ? { content: span.outputMessages?.[0]?.content }
            : span.toolOutput,
        metadata: {
          span_id: span.spanId,
          parent_span_id: span.parentSpanId,
          span_name: span.name,
          latency_ms: span.endTime
            ? new Date(span.endTime).getTime() - new Date(span.startTime).getTime()
            : undefined,
          tokens_input: span.tokenCounts?.prompt,
          tokens_output: span.tokenCounts?.completion,
        },
        error: span.error,
      });
    }

    return steps;
  }

  /**
   * Generate input preview (first 200 chars)
   */
  private generateInputPreview(): string {
    const sortedSpans = Array.from(this.spans.values()).sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    const firstLLMSpan = sortedSpans.find((s) => s.spanKind === 'LLM');
    if (firstLLMSpan?.inputMessages?.[0]) {
      const content = firstLLMSpan.inputMessages[0].content;
      return content.length > 200 ? `${content.slice(0, 200)}...` : content;
    }

    return 'No input';
  }

  /**
   * Generate output preview (first 200 chars)
   */
  private generateOutputPreview(): string {
    const sortedSpans = Array.from(this.spans.values()).sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );

    // Find last LLM span with output
    for (const span of sortedSpans) {
      if (span.spanKind === 'LLM' && span.outputMessages?.length) {
        const lastMsg = span.outputMessages[span.outputMessages.length - 1];
        const content = lastMsg.content;
        return content.length > 200 ? `${content.slice(0, 200)}...` : content;
      }
    }

    return 'No output';
  }
}
