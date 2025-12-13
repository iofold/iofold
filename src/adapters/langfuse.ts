import Langfuse from 'langfuse';
import type { Trace, LangGraphExecutionStep } from '../types/trace';

interface LangfuseConfig {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
}

export interface TraceFilter {
  limit?: number;
  userId?: string;
  tags?: string[];
  fromTimestamp?: Date;
  toTimestamp?: Date;
}

export class LangfuseAdapter {
  private client: Langfuse;

  constructor(private config: LangfuseConfig) {
    this.client = new Langfuse({
      publicKey: config.publicKey,
      secretKey: config.secretKey,
      baseUrl: config.baseUrl || 'https://cloud.langfuse.com'
    });
  }

  async fetchTraces(filter: TraceFilter = {}): Promise<Trace[]> {
    try {
      const response = await this.client.api.traceList({
        limit: filter.limit || 10,
        userId: filter.userId,
        tags: filter.tags,
        fromTimestamp: filter.fromTimestamp?.toISOString(),
        toTimestamp: filter.toTimestamp?.toISOString()
      });

      // Fetch observations for each trace
      const tracesWithObservations = await Promise.all(
        response.data.map(async (trace) => {
          const observations = await this.fetchObservations(trace.id);
          return this.normalizeTrace(trace, observations);
        })
      );

      return tracesWithObservations;
    } catch (error) {
      let message: string;
      if (error instanceof Error) {
        message = error.message;
      } else if (error && typeof error === 'object' && 'status' in error) {
        // Handle Response objects from fetch errors
        const resp = error as Response;
        message = `HTTP ${resp.status}`;
      } else {
        message = String(error);
      }
      throw new Error(`Failed to fetch traces: ${message}`, {
        cause: error
      });
    }
  }

  async fetchTraceById(id: string): Promise<Trace> {
    try {
      const trace = await this.client.api.traceGet(id);
      const observations = await this.fetchObservations(id);
      return this.normalizeTrace(trace, observations);
    } catch (error) {
      let message: string;
      if (error instanceof Error) {
        message = error.message;
      } else if (error && typeof error === 'object' && 'status' in error) {
        // Handle Response objects from fetch errors
        const resp = error as Response;
        message = `HTTP ${resp.status}`;
      } else {
        message = String(error);
      }
      throw new Error(`Failed to fetch trace ${id}: ${message}`, {
        cause: error
      });
    }
  }

  private async fetchObservations(traceId: string): Promise<any[]> {
    try {
      // Langfuse API: GET /api/public/observations?traceId=xxx
      const response = await this.client.api.observationsGetMany({
        traceId,
        limit: 100 // Get all observations for this trace
      });
      return response.data || [];
    } catch (error) {
      console.warn(`Failed to fetch observations for trace ${traceId}:`, error);
      return [];
    }
  }

  private normalizeTrace(langfuseTrace: any, observations: any[] = []): Trace {
    // Langfuse returns messages in output.messages, not in observations
    // observations is just an array of IDs
    const messages = langfuseTrace.output?.messages || [];

    // Build a map of tool_call_id -> result from tool messages
    // This allows us to link tool results back to their original tool calls
    const toolResultsMap = new Map<string, any>();
    for (const msg of messages) {
      if (msg.type === 'tool' && msg.tool_call_id) {
        toolResultsMap.set(msg.tool_call_id, msg.content);
      }
    }

    // Create steps from the messages, filtering out tool messages since their results
    // are already linked to the AI message tool_calls via toolResultsMap
    const steps: LangGraphExecutionStep[] = messages
      .filter((msg: any) => msg.type !== 'tool') // Skip tool messages - results are linked in tool_calls
      .map((msg: any, index: number) => {
        // Extract tool calls if this is an AI message, linking results from toolResultsMap
        const toolCalls = msg.type === 'ai' && msg.tool_calls
          ? msg.tool_calls.map((tc: any) => ({
              tool_name: tc.name,
              arguments: tc.args || {},
              result: toolResultsMap.get(tc.id), // Link result from subsequent tool message (undefined if not found)
              id: tc.id
            }))
          : [];

        // Extract message content
        let messageContent = '';
        if (typeof msg.content === 'string') {
          messageContent = msg.content;
        } else if (Array.isArray(msg.content)) {
          // Handle structured content (reasoning + text)
          messageContent = msg.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n');
        }

        // Build messages_added array
        const messages_added: any[] = [];
        if (msg.type === 'human') {
          messages_added.push({
            role: 'user',
            content: messageContent
          });
        } else if (msg.type === 'ai') {
          messages_added.push({
            role: 'assistant',
            content: messageContent
          });
        }

        return {
          step_id: msg.id || `step_${index}`,
          trace_id: langfuseTrace.id,
          timestamp: msg.created_at ? new Date(msg.created_at * 1000).toISOString() : langfuseTrace.timestamp,
          messages_added,
          tool_calls: toolCalls,
          input: msg.type === 'human' ? messageContent : null,
          output: msg.type === 'ai' ? messageContent : null,
          metadata: {
            type: msg.type,
            usage: msg.usage_metadata || null,
            model: msg.response_metadata?.model || null,
            ...msg.additional_kwargs
          },
          error: msg.status === 'error' ? msg.content : undefined
        };
      });

    return {
      id: langfuseTrace.id,
      trace_id: langfuseTrace.id,
      steps,
      source: 'langfuse',
      raw_data: {
        ...langfuseTrace,
        observations: observations.map(obs => ({
          id: obs.id,
          type: obs.type,
          name: obs.name,
          parentObservationId: obs.parentObservationId,
          startTime: obs.startTime,
          endTime: obs.endTime,
          input: obs.input,
          output: obs.output,
          metadata: obs.metadata,
          model: obs.model,
          usage: obs.usage,
          level: obs.level,
          statusMessage: obs.statusMessage,
        }))
      }
    };
  }

  private extractMessages(observation: any): any[] {
    // Langfuse stores messages in input/output for generation observations
    if (observation.type === 'GENERATION') {
      const messages = [];

      if (observation.input) {
        messages.push({
          role: 'user',
          content: typeof observation.input === 'string'
            ? observation.input
            : JSON.stringify(observation.input)
        });
      }

      if (observation.output) {
        messages.push({
          role: 'assistant',
          content: typeof observation.output === 'string'
            ? observation.output
            : JSON.stringify(observation.output)
        });
      }

      return messages;
    }

    return [];
  }

  private extractToolCalls(observation: any): any[] {
    // Check if this is a tool/function call
    if (observation.type === 'EVENT' && observation.name?.startsWith('tool_')) {
      return [{
        tool_name: observation.name.replace('tool_', ''),
        arguments: observation.input || {},
        result: observation.output,
        error: observation.level === 'ERROR' ? observation.statusMessage : undefined
      }];
    }

    return [];
  }
}
