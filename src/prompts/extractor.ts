/**
 * System Prompt Extractor
 *
 * Extracts system prompts from trace data across different formats
 * (Langfuse, Langsmith, OpenAI) for version tracking.
 */

import type { Trace, LangGraphExecutionStep, Message } from '../types/trace';

/**
 * Extracted prompt result
 */
export interface ExtractedPrompt {
  /** Raw system prompt content */
  content: string;
  /** Detected agent name (from metadata or trace) */
  agentName: string;
  /** Source of the extraction */
  extractionSource: 'messages' | 'input' | 'raw_data' | 'metadata';
  /** Optional structured metadata */
  metadata?: Record<string, any>;
}

/**
 * PromptExtractor extracts system prompts from trace data
 */
export class PromptExtractor {
  /**
   * Extract system prompt from a trace
   * Returns null if no system prompt is found
   */
  extract(trace: Trace): ExtractedPrompt | null {
    // Try multiple extraction strategies in order of reliability
    const strategies = [
      () => this.extractFromStepMessages(trace),
      () => this.extractFromRawDataInput(trace),
      () => this.extractFromRawDataMetadata(trace),
      () => this.extractFromLangfuseSpecific(trace)
    ];

    for (const strategy of strategies) {
      const result = strategy();
      if (result) {
        return result;
      }
    }

    return null;
  }

  /**
   * Extract from step messages (standard format)
   * Looks for role: 'system' in messages_added
   */
  private extractFromStepMessages(trace: Trace): ExtractedPrompt | null {
    for (const step of trace.steps) {
      for (const message of step.messages_added) {
        if (message.role === 'system' && message.content) {
          return {
            content: message.content,
            agentName: this.detectAgentName(trace, step),
            extractionSource: 'messages',
            metadata: step.metadata
          };
        }
      }
    }
    return null;
  }

  /**
   * Extract from raw_data.input.messages (common Langfuse format)
   */
  private extractFromRawDataInput(trace: Trace): ExtractedPrompt | null {
    const rawData = trace.raw_data;
    if (!rawData) return null;

    // Check input.messages array
    const inputMessages = rawData.input?.messages;
    if (Array.isArray(inputMessages)) {
      for (const msg of inputMessages) {
        if (msg.role === 'system' && msg.content) {
          return {
            content: typeof msg.content === 'string'
              ? msg.content
              : JSON.stringify(msg.content),
            agentName: this.detectAgentNameFromRaw(rawData),
            extractionSource: 'input',
            metadata: { originalFormat: 'input.messages' }
          };
        }
      }
    }

    // Check direct input.system_prompt
    if (rawData.input?.system_prompt) {
      return {
        content: rawData.input.system_prompt,
        agentName: this.detectAgentNameFromRaw(rawData),
        extractionSource: 'input',
        metadata: { originalFormat: 'input.system_prompt' }
      };
    }

    return null;
  }

  /**
   * Extract from raw_data metadata (various formats)
   */
  private extractFromRawDataMetadata(trace: Trace): ExtractedPrompt | null {
    const rawData = trace.raw_data;
    if (!rawData) return null;

    // Check metadata.system_prompt
    if (rawData.metadata?.system_prompt) {
      return {
        content: rawData.metadata.system_prompt,
        agentName: this.detectAgentNameFromRaw(rawData),
        extractionSource: 'metadata',
        metadata: { originalFormat: 'metadata.system_prompt' }
      };
    }

    // Check metadata.prompt
    if (rawData.metadata?.prompt && typeof rawData.metadata.prompt === 'string') {
      return {
        content: rawData.metadata.prompt,
        agentName: this.detectAgentNameFromRaw(rawData),
        extractionSource: 'metadata',
        metadata: { originalFormat: 'metadata.prompt' }
      };
    }

    return null;
  }

  /**
   * Langfuse-specific extraction from observations
   */
  private extractFromLangfuseSpecific(trace: Trace): ExtractedPrompt | null {
    const rawData = trace.raw_data;
    if (!rawData || trace.source !== 'langfuse') return null;

    // Langfuse stores system message in output.messages
    const outputMessages = rawData.output?.messages;
    if (Array.isArray(outputMessages)) {
      for (const msg of outputMessages) {
        if (msg.type === 'system' && msg.content) {
          return {
            content: typeof msg.content === 'string'
              ? msg.content
              : JSON.stringify(msg.content),
            agentName: this.detectAgentNameFromRaw(rawData),
            extractionSource: 'raw_data',
            metadata: { originalFormat: 'langfuse.output.messages' }
          };
        }
      }
    }

    // Check observations for GENERATION type with system prompt
    const observations = rawData.observations;
    if (Array.isArray(observations)) {
      for (const obs of observations) {
        if (obs.type === 'GENERATION' && obs.input) {
          // Parse input if it's a string
          let input = obs.input;
          if (typeof input === 'string') {
            try {
              input = JSON.parse(input);
            } catch {
              // Not JSON, skip
              continue;
            }
          }

          // Check for system message in parsed input
          if (Array.isArray(input)) {
            for (const msg of input) {
              if (msg.role === 'system' && msg.content) {
                return {
                  content: msg.content,
                  agentName: obs.name || this.detectAgentNameFromRaw(rawData),
                  extractionSource: 'raw_data',
                  metadata: {
                    originalFormat: 'langfuse.observation.input',
                    observationId: obs.id
                  }
                };
              }
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Detect agent name from trace step
   */
  private detectAgentName(trace: Trace, step: LangGraphExecutionStep): string {
    // Try step metadata
    if (step.metadata?.agent_name) {
      return step.metadata.agent_name;
    }
    if (step.metadata?.model) {
      return `agent_${step.metadata.model}`;
    }

    // Fall back to raw data
    return this.detectAgentNameFromRaw(trace.raw_data);
  }

  /**
   * Detect agent name from raw data
   */
  private detectAgentNameFromRaw(rawData: any): string {
    if (!rawData) return 'unknown_agent';

    // Try various fields
    if (rawData.name) return rawData.name;
    if (rawData.metadata?.agent_name) return rawData.metadata.agent_name;
    if (rawData.metadata?.model_name) return `agent_${rawData.metadata.model_name}`;
    if (rawData.session_id) return `session_${rawData.session_id}`;
    if (rawData.userId) return `user_${rawData.userId}`;

    // For Langfuse, try to extract from tags
    if (Array.isArray(rawData.tags)) {
      const agentTag = rawData.tags.find((t: string) =>
        t.startsWith('agent:') || t.startsWith('model:')
      );
      if (agentTag) {
        return agentTag.replace(/^(agent|model):/, '');
      }
    }

    return 'unknown_agent';
  }

  /**
   * Generate SHA-256 hash of prompt content for deduplication
   */
  async hashPromptContent(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Extract prompts from multiple traces and deduplicate
   */
  async extractBatch(traces: Trace[]): Promise<Map<string, ExtractedPrompt & { hash: string }>> {
    const results = new Map<string, ExtractedPrompt & { hash: string }>();

    for (const trace of traces) {
      const extracted = this.extract(trace);
      if (extracted) {
        const hash = await this.hashPromptContent(extracted.content);

        // Only add if not already in results (dedup by hash)
        if (!results.has(hash)) {
          results.set(hash, { ...extracted, hash });
        }
      }
    }

    return results;
  }
}
