import { describe, it, expect } from 'vitest';
import { EvalGenerator } from './generator';
import type { Trace } from '../types/trace';

describe('EvalGenerator', () => {
  it('should generate eval function from labeled traces', async () => {
    const generator = new EvalGenerator({
      anthropicApiKey: process.env.ANTHROPIC_API_KEY!
    });

    const positiveTraces: Trace[] = [
      {
        id: '1',
        trace_id: '1',
        source: 'langfuse',
        raw_data: {},
        steps: [{
          step_id: '1',
          trace_id: '1',
          timestamp: new Date().toISOString(),
          messages_added: [],
          tool_calls: [],
          input: { query: 'What is 2+2?' },
          output: { answer: '4', confidence: 0.99 },
          metadata: {}
        }]
      }
    ];

    const negativeTraces: Trace[] = [
      {
        id: '2',
        trace_id: '2',
        source: 'langfuse',
        raw_data: {},
        steps: [{
          step_id: '2',
          trace_id: '2',
          timestamp: new Date().toISOString(),
          messages_added: [],
          tool_calls: [],
          input: { query: 'What is the capital of France?' },
          output: { answer: 'London', confidence: 0.5 },
          metadata: {}
        }]
      }
    ];

    const result = await generator.generate({
      name: 'answer_quality',
      positiveExamples: positiveTraces,
      negativeExamples: negativeTraces
    });

    expect(result.code).toContain('def eval_answer_quality');
    expect(result.code).toContain('return');
    expect(result.metadata.tokensUsed).toBeGreaterThan(0);
    expect(result.metadata.cost).toBeDefined();
    expect(result.metadata.cost.estimatedCostUSD).toBeGreaterThan(0);
    expect(result.metadata.cost.model).toBe('claude-sonnet-4-5-20250929');
  }, 30000); // 30s timeout for LLM call
});
