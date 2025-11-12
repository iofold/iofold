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

      return response.data.map(trace => this.normalizeTrace(trace));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch traces: ${message}`, {
        cause: error
      });
    }
  }

  async fetchTraceById(id: string): Promise<Trace> {
    try {
      const trace = await this.client.api.traceGet(id);
      return this.normalizeTrace(trace);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch trace ${id}: ${message}`, {
        cause: error
      });
    }
  }

  private normalizeTrace(langfuseTrace: any): Trace {
    // Extract observations (spans, generations, events)
    const observations = langfuseTrace.observations || [];

    const steps: LangGraphExecutionStep[] = observations.map((obs: any) => ({
      step_id: obs.id,
      trace_id: langfuseTrace.id,
      timestamp: obs.startTime || obs.timestamp,
      messages_added: this.extractMessages(obs),
      tool_calls: this.extractToolCalls(obs),
      input: obs.input,
      output: obs.output,
      metadata: {
        name: obs.name,
        type: obs.type,
        level: obs.level,
        statusMessage: obs.statusMessage,
        ...obs.metadata
      },
      error: obs.level === 'ERROR' ? obs.statusMessage : undefined
    }));

    return {
      id: langfuseTrace.id,
      trace_id: langfuseTrace.id,
      steps,
      source: 'langfuse',
      raw_data: langfuseTrace
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
