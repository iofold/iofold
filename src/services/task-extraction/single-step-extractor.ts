import { DataInst, TaskValidationResult } from '../../types/datainst';
import { Trace, Message, LangGraphExecutionStep } from '../../types/trace';

/**
 * Result of batch extraction operation
 */
export interface BatchExtractionResult {
  /** Successfully extracted DataInst records */
  extracted: DataInst[];

  /** Trace IDs that were skipped (not single-step) */
  skipped: string[];

  /** Statistics about the extraction */
  stats: {
    total: number;
    successful: number;
    skipped: number;
    successRate: number;
  };
}

/**
 * SingleStepTaskExtractor - Extracts DataInst from single-step traces
 *
 * A single-step trace is defined as:
 * - SystemPrompt → UserMessage → AgentResponse
 * - Exactly ONE user message in the entire trace
 * - Multi-turn conversations (multiple user messages) are NOT single-step
 *
 * @example
 * ```typescript
 * const extractor = new SingleStepTaskExtractor();
 * const dataInst = extractor.extractTask(trace);
 * if (dataInst) {
 *   console.log('Extracted task:', dataInst.task.user_message);
 * }
 * ```
 */
export class SingleStepTaskExtractor {
  /**
   * Extract DataInst from a trace if it's a single-step trace
   *
   * @param trace - The trace to extract from
   * @returns DataInst if single-step, null otherwise
   */
  extractTask(trace: Trace): DataInst | null {
    // Validate trace is single-step
    const validation = this.validate(trace);
    if (!validation.valid) {
      return null;
    }

    // Find the first user message
    const userMessage = this.findFirstUserMessage(trace);
    if (!userMessage) {
      return null;
    }

    // Extract task content
    const taskContent = this.extractMessageContent(userMessage);
    if (!taskContent) {
      return null;
    }

    // Create DataInst with empty task_metadata (enriched later by TaskMetadataEnricher)
    const dataInst: DataInst = {
      task: {
        user_message: taskContent
      },
      task_metadata: {}
    };

    return dataInst;
  }

  /**
   * Validate that a trace is a single-step trace
   *
   * @param trace - The trace to validate
   * @returns Validation result with errors and warnings
   */
  validate(trace: Trace): TaskValidationResult {
    const result: TaskValidationResult = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Check trace has steps
    if (!trace.steps || trace.steps.length === 0) {
      result.valid = false;
      result.errors.push('Trace has no steps');
      return result;
    }

    // Find all user messages
    const userMessages = this.findAllUserMessages(trace);

    // Check for exactly one user message
    if (userMessages.length === 0) {
      result.valid = false;
      result.errors.push('No user messages found in trace');
      return result;
    }

    if (userMessages.length > 1) {
      result.valid = false;
      result.errors.push(
        `Multi-turn trace detected: found ${userMessages.length} user messages (single-step requires exactly 1)`
      );
      return result;
    }

    // Validate user message has content
    const userMessage = userMessages[0];
    const content = this.extractMessageContent(userMessage);
    if (!content || content.trim().length === 0) {
      result.valid = false;
      result.errors.push('User message has no content');
      return result;
    }

    // Check for system prompt (warning if missing)
    const systemPrompt = this.findSystemPrompt(trace);
    if (!systemPrompt) {
      result.warnings.push('No system prompt found');
    }

    // Check for agent response (warning if missing)
    const agentResponse = this.findAgentResponse(trace);
    if (!agentResponse) {
      result.warnings.push('No agent response found');
    }

    return result;
  }

  /**
   * Extract tasks from multiple traces in batch
   *
   * @param traces - Array of traces to process
   * @returns Batch extraction results with stats
   */
  extractBatch(traces: Trace[]): BatchExtractionResult {
    const extracted: DataInst[] = [];
    const skipped: string[] = [];

    for (const trace of traces) {
      const dataInst = this.extractTask(trace);
      if (dataInst) {
        extracted.push(dataInst);
      } else {
        skipped.push(trace.trace_id);
      }
    }

    const total = traces.length;
    const successful = extracted.length;
    const skippedCount = skipped.length;
    const successRate = total > 0 ? successful / total : 0;

    return {
      extracted,
      skipped,
      stats: {
        total,
        successful,
        skipped: skippedCount,
        successRate
      }
    };
  }

  /**
   * Find the first user message in the trace
   *
   * @param trace - The trace to search
   * @returns First user message or undefined
   */
  findFirstUserMessage(trace: Trace): Message | undefined {
    for (const step of trace.steps) {
      if (!step.messages_added) continue;

      for (const message of step.messages_added) {
        if (message.role === 'user') {
          return message;
        }
      }
    }
    return undefined;
  }

  /**
   * Find all user messages in the trace
   *
   * @param trace - The trace to search
   * @returns Array of all user messages
   */
  findAllUserMessages(trace: Trace): Message[] {
    const userMessages: Message[] = [];

    for (const step of trace.steps) {
      if (!step.messages_added) continue;

      for (const message of step.messages_added) {
        if (message.role === 'user') {
          userMessages.push(message);
        }
      }
    }

    return userMessages;
  }

  /**
   * Find the system prompt in the trace
   *
   * @param trace - The trace to search
   * @returns System prompt message or undefined
   */
  findSystemPrompt(trace: Trace): Message | undefined {
    for (const step of trace.steps) {
      if (!step.messages_added) continue;

      for (const message of step.messages_added) {
        if (message.role === 'system') {
          return message;
        }
      }
    }
    return undefined;
  }

  /**
   * Find the agent response in the trace
   *
   * @param trace - The trace to search
   * @returns Agent response message or undefined
   */
  findAgentResponse(trace: Trace): Message | undefined {
    for (const step of trace.steps) {
      if (!step.messages_added) continue;

      for (const message of step.messages_added) {
        if (message.role === 'assistant') {
          return message;
        }
      }
    }
    return undefined;
  }

  /**
   * Extract content from a message
   * Handles both string and object content formats
   *
   * @param message - The message to extract content from
   * @returns Extracted content string or null
   */
  private extractMessageContent(message: Message): string | null {
    if (!message.content) {
      return null;
    }

    // Handle string content (most common case)
    if (typeof message.content === 'string') {
      return message.content;
    }

    // For non-string content, stringify it as fallback
    // In practice, the Message type in trace.ts defines content as string
    // but we handle edge cases for robustness
    try {
      return JSON.stringify(message.content);
    } catch {
      return null;
    }
  }
}
