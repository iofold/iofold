/**
 * LangSmith Trace Import Adapter
 *
 * Transforms LangSmith run data to OpenInference spans.
 * LangSmith runs have a hierarchical structure with parent_run_id relationships
 * and different run_types (chain, llm, tool, retriever, embedding).
 *
 * KEY MAPPINGS:
 * - run_type: 'llm' → span_kind: 'LLM'
 * - run_type: 'tool' → span_kind: 'TOOL'
 * - run_type: 'retriever' → span_kind: 'RETRIEVER'
 * - run_type: 'embedding' → span_kind: 'EMBEDDING'
 * - run_type: 'chain' → span_kind: 'CHAIN'
 * - parent_run_id → parent_span_id
 */

import type { TraceImportAdapter, TraceSummary } from '../types';
import type { OpenInferenceSpan, ToolCallRequest, OpenInferenceMessage } from '../../../types/openinference';

/**
 * LangSmith run type
 */
type LangSmithRunType = 'chain' | 'llm' | 'tool' | 'retriever' | 'embedding';

/**
 * LangSmith run structure from their API
 */
interface LangSmithRun {
  /** Unique run identifier */
  id: string;
  /** Trace identifier (root run ID) */
  trace_id?: string;
  /** Parent run identifier for hierarchy */
  parent_run_id?: string;
  /** Run type determines span kind */
  run_type: LangSmithRunType;
  /** Run name */
  name: string;
  /** Start time in ISO 8601 or Unix timestamp */
  start_time: string | number;
  /** End time in ISO 8601 or Unix timestamp */
  end_time?: string | number;
  /** Input data */
  inputs?: Record<string, any>;
  /** Output data */
  outputs?: Record<string, any>;
  /** Error information */
  error?: string;
  /** Extra metadata (contains model info, tokens, etc.) */
  extra?: Record<string, any>;
  /** Nested child runs (if included in response) */
  child_runs?: LangSmithRun[];
}

/**
 * LangSmith trace data format
 */
interface LangSmithTraceData {
  /** Root run or array of runs */
  runs?: LangSmithRun[];
  /** Alternative: single root run */
  run?: LangSmithRun;
}

export class LangSmithAdapter implements TraceImportAdapter {
  source = 'langsmith' as const;

  /**
   * Transform LangSmith runs to OpenInference spans
   *
   * Algorithm:
   * 1. Flatten nested runs into a flat array
   * 2. Build parent-child relationships from parent_run_id
   * 3. For each run, determine span kind based on run_type
   * 4. For LLM runs: extract messages, model info, and token counts
   * 5. For TOOL runs: extract tool name, arguments, and result
   * 6. Generate unique span IDs and link via parent_span_id
   */
  transform(rawData: unknown): OpenInferenceSpan[] {
    // Validate input format
    if (!rawData || typeof rawData !== 'object') {
      throw new Error('Invalid LangSmith trace format: expected object');
    }

    const data = rawData as LangSmithTraceData;

    // Extract runs array
    let runs: LangSmithRun[] = [];
    if (data.runs && Array.isArray(data.runs)) {
      runs = data.runs;
    } else if (data.run) {
      runs = [data.run];
    } else if ('id' in data && 'run_type' in data) {
      // Single run passed directly
      runs = [data as LangSmithRun];
    } else {
      throw new Error('Invalid LangSmith trace format: no runs found');
    }

    if (runs.length === 0) {
      return [];
    }

    // Flatten nested runs (child_runs) into a single array
    const flatRuns = this.flattenRuns(runs);

    // Build run ID to run mapping for quick lookups
    const runIdToRun = new Map<string, LangSmithRun>();
    for (const run of flatRuns) {
      runIdToRun.set(run.id, run);
    }

    // Build parent-child relationships for tool call detection
    const childrenMap = new Map<string, LangSmithRun[]>();
    for (const run of flatRuns) {
      if (run.parent_run_id) {
        if (!childrenMap.has(run.parent_run_id)) {
          childrenMap.set(run.parent_run_id, []);
        }
        childrenMap.get(run.parent_run_id)!.push(run);
      }
    }

    const spans: OpenInferenceSpan[] = [];

    for (const run of flatRuns) {
      // Determine trace ID (use trace_id if available, otherwise use root run ID)
      const traceId = run.trace_id || this.findRootRunId(run, runIdToRun);

      // Create span based on run type
      const spanKind = this.mapRunTypeToSpanKind(run.run_type);

      if (spanKind === 'LLM') {
        const llmSpan = this.createLLMSpan(run, traceId, childrenMap);
        spans.push(llmSpan);
      } else if (spanKind === 'TOOL') {
        const toolSpan = this.createToolSpan(run, traceId);
        spans.push(toolSpan);
      } else {
        // Generic span (CHAIN, RETRIEVER, EMBEDDING)
        const genericSpan = this.createGenericSpan(run, traceId, spanKind);
        spans.push(genericSpan);
      }
    }

    return spans;
  }

  /**
   * Flatten nested runs (child_runs) into a single array
   */
  private flattenRuns(runs: LangSmithRun[]): LangSmithRun[] {
    const flattened: LangSmithRun[] = [];

    const flatten = (run: LangSmithRun) => {
      flattened.push(run);
      if (run.child_runs && run.child_runs.length > 0) {
        for (const child of run.child_runs) {
          flatten(child);
        }
      }
    };

    for (const run of runs) {
      flatten(run);
    }

    return flattened;
  }

  /**
   * Find the root run ID by traversing up the parent chain
   */
  private findRootRunId(run: LangSmithRun, runIdToRun: Map<string, LangSmithRun>): string {
    let current = run;
    while (current.parent_run_id) {
      const parent = runIdToRun.get(current.parent_run_id);
      if (!parent) break;
      current = parent;
    }
    return current.id;
  }

  /**
   * Map LangSmith run_type to OpenInference span_kind
   */
  private mapRunTypeToSpanKind(runType: LangSmithRunType): OpenInferenceSpan['span_kind'] {
    const mapping: Record<LangSmithRunType, OpenInferenceSpan['span_kind']> = {
      'llm': 'LLM',
      'tool': 'TOOL',
      'retriever': 'RETRIEVER',
      'embedding': 'EMBEDDING',
      'chain': 'CHAIN',
    };
    return mapping[runType] || 'CHAIN';
  }

  /**
   * Normalize timestamp to ISO 8601 string
   */
  private normalizeTimestamp(timestamp: string | number | undefined): string | undefined {
    if (!timestamp) return undefined;

    // If already a string, assume it's ISO 8601
    if (typeof timestamp === 'string') {
      return timestamp;
    }

    // If number, convert from Unix timestamp (milliseconds or seconds)
    // LangSmith typically uses seconds, but handle both
    const ms = timestamp > 1e12 ? timestamp : timestamp * 1000;
    return new Date(ms).toISOString();
  }

  /**
   * Extract messages from LangSmith inputs/outputs
   */
  private extractMessages(
    inputs?: Record<string, any>,
    outputs?: Record<string, any>
  ): { inputMessages: OpenInferenceMessage[]; outputMessages: OpenInferenceMessage[] } {
    const inputMessages: OpenInferenceMessage[] = [];
    const outputMessages: OpenInferenceMessage[] = [];

    // Extract input messages
    if (inputs) {
      // Check for messages array in inputs
      if (inputs.messages && Array.isArray(inputs.messages)) {
        for (const msg of inputs.messages) {
          if (msg.role && (msg.content || msg.content === '')) {
            inputMessages.push({
              role: msg.role as 'user' | 'assistant' | 'system' | 'tool',
              content: String(msg.content || ''),
            });
          }
        }
      }
      // Check for prompt field (single user message)
      else if (inputs.prompt) {
        inputMessages.push({
          role: 'user',
          content: String(inputs.prompt),
        });
      }
      // Check for input field (generic input)
      else if (inputs.input) {
        inputMessages.push({
          role: 'user',
          content: String(inputs.input),
        });
      }
    }

    // Extract output messages
    if (outputs) {
      // Check for generations array (LangChain format)
      if (outputs.generations && Array.isArray(outputs.generations)) {
        for (const gen of outputs.generations) {
          // Each generation may have multiple alternatives
          if (Array.isArray(gen)) {
            for (const alternative of gen) {
              if (alternative.text) {
                outputMessages.push({
                  role: 'assistant',
                  content: String(alternative.text),
                });
              } else if (alternative.message) {
                outputMessages.push({
                  role: 'assistant',
                  content: String(alternative.message.content || alternative.message),
                });
              }
            }
          } else if (gen.text) {
            outputMessages.push({
              role: 'assistant',
              content: String(gen.text),
            });
          }
        }
      }
      // Check for output field (single message)
      else if (outputs.output) {
        const content = typeof outputs.output === 'string'
          ? outputs.output
          : JSON.stringify(outputs.output);
        outputMessages.push({
          role: 'assistant',
          content,
        });
      }
      // Check for text field (single message)
      else if (outputs.text) {
        outputMessages.push({
          role: 'assistant',
          content: String(outputs.text),
        });
      }
    }

    return { inputMessages, outputMessages };
  }

  /**
   * Extract tool calls from child tool runs
   */
  private extractToolCalls(
    run: LangSmithRun,
    childrenMap: Map<string, LangSmithRun[]>
  ): ToolCallRequest[] {
    const toolCalls: ToolCallRequest[] = [];
    const children = childrenMap.get(run.id) || [];

    for (const child of children) {
      if (child.run_type === 'tool') {
        // Generate tool call ID
        const toolCallId = `call_${child.id}`;

        toolCalls.push({
          id: toolCallId,
          function: {
            name: child.name,
            arguments: JSON.stringify(child.inputs || {}),
          },
        });
      }
    }

    return toolCalls;
  }

  /**
   * Create an LLM span from a LangSmith LLM run
   */
  private createLLMSpan(
    run: LangSmithRun,
    traceId: string,
    childrenMap: Map<string, LangSmithRun[]>
  ): OpenInferenceSpan {
    // Extract messages
    const { inputMessages, outputMessages } = this.extractMessages(run.inputs, run.outputs);

    // Extract tool calls from child tool runs
    const toolCalls = this.extractToolCalls(run, childrenMap);

    // If we found tool calls, embed them in the last assistant message
    if (toolCalls.length > 0 && outputMessages.length > 0) {
      const lastAssistantMessage = outputMessages[outputMessages.length - 1];
      lastAssistantMessage.tool_calls = toolCalls;
    }

    // Extract model information from extra metadata
    const modelName = run.extra?.invocation_params?.model_name
      || run.extra?.invocation_params?.model
      || run.extra?.metadata?.model_name
      || run.extra?.metadata?.model;

    const provider = run.extra?.invocation_params?.provider
      || run.extra?.metadata?.provider;

    // Extract token counts
    const tokenUsage = run.extra?.usage_metadata || run.outputs?.usage_metadata || {};
    const tokenCountPrompt = tokenUsage.input_tokens
      || tokenUsage.prompt_tokens
      || run.extra?.token_usage?.prompt_tokens;
    const tokenCountCompletion = tokenUsage.output_tokens
      || tokenUsage.completion_tokens
      || run.extra?.token_usage?.completion_tokens;
    const tokenCountTotal = tokenUsage.total_tokens
      || run.extra?.token_usage?.total_tokens
      || ((tokenCountPrompt || 0) + (tokenCountCompletion || 0)) || undefined;

    return {
      span_id: run.id,
      trace_id: traceId,
      parent_span_id: run.parent_run_id,
      span_kind: 'LLM',
      name: run.name,
      start_time: this.normalizeTimestamp(run.start_time) || new Date().toISOString(),
      end_time: this.normalizeTimestamp(run.end_time),
      status: run.error ? 'ERROR' : 'OK',
      status_message: run.error,
      llm: {
        model_name: modelName,
        provider: provider,
        input_messages: inputMessages,
        output_messages: outputMessages,
        token_count_prompt: tokenCountPrompt,
        token_count_completion: tokenCountCompletion,
        token_count_total: tokenCountTotal,
      },
      attributes: {
        ...this.extractAdditionalAttributes(run.extra),
        langsmith_run_url: run.extra?.metadata?.run_url,
      },
      source_span_id: run.id,
    };
  }

  /**
   * Create a TOOL span from a LangSmith tool run
   */
  private createToolSpan(run: LangSmithRun, traceId: string): OpenInferenceSpan {
    return {
      span_id: run.id,
      trace_id: traceId,
      parent_span_id: run.parent_run_id,
      span_kind: 'TOOL',
      name: run.name,
      start_time: this.normalizeTimestamp(run.start_time) || new Date().toISOString(),
      end_time: this.normalizeTimestamp(run.end_time),
      status: run.error ? 'ERROR' : 'OK',
      status_message: run.error,
      tool: {
        name: run.name,
        parameters: run.inputs,
        output: run.outputs,
      },
      attributes: {
        ...this.extractAdditionalAttributes(run.extra),
        langsmith_run_url: run.extra?.metadata?.run_url,
      },
      source_span_id: run.id,
    };
  }

  /**
   * Create a generic span (CHAIN, RETRIEVER, EMBEDDING, AGENT, RERANKER)
   */
  private createGenericSpan(
    run: LangSmithRun,
    traceId: string,
    spanKind: Exclude<OpenInferenceSpan['span_kind'], 'LLM' | 'TOOL'>
  ): OpenInferenceSpan {
    return {
      span_id: run.id,
      trace_id: traceId,
      parent_span_id: run.parent_run_id,
      span_kind: spanKind,
      name: run.name,
      start_time: this.normalizeTimestamp(run.start_time) || new Date().toISOString(),
      end_time: this.normalizeTimestamp(run.end_time),
      status: run.error ? 'ERROR' : 'OK',
      status_message: run.error,
      input: run.inputs,
      output: run.outputs,
      attributes: {
        ...this.extractAdditionalAttributes(run.extra),
        langsmith_run_url: run.extra?.metadata?.run_url,
      },
      source_span_id: run.id,
    };
  }

  /**
   * Extract additional attributes from run metadata
   * Excludes already-mapped fields
   */
  private extractAdditionalAttributes(extra?: Record<string, any>): Record<string, unknown> {
    if (!extra) return {};

    const attributes: Record<string, unknown> = {};

    // Add relevant metadata that isn't already mapped
    if (extra.metadata) {
      for (const [key, value] of Object.entries(extra.metadata)) {
        if (key !== 'model_name' && key !== 'model' && key !== 'provider' && key !== 'run_url') {
          attributes[`metadata.${key}`] = value;
        }
      }
    }

    // Add other extra fields
    for (const [key, value] of Object.entries(extra)) {
      if (key !== 'metadata' && key !== 'invocation_params' && key !== 'usage_metadata' && key !== 'token_usage') {
        attributes[key] = value;
      }
    }

    return attributes;
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
