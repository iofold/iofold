import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvalGenerator } from './generator';
import type { Trace } from '../types/trace';

// Check if real API keys are available for integration tests
const hasGatewayConfig =
  process.env.CF_ACCOUNT_ID &&
  process.env.CF_AI_GATEWAY_ID &&
  process.env.CF_AI_GATEWAY_TOKEN;

describe('EvalGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should instantiate with config', () => {
    const generator = new EvalGenerator({
      cfAccountId: 'test-account-id',
      cfGatewayId: 'test-gateway-id',
      cfGatewayToken: 'test-token'
    });

    expect(generator).toBeDefined();
    expect(generator).toBeInstanceOf(EvalGenerator);
  });

  it.skipIf(!hasGatewayConfig)('should generate eval function from labeled traces', async () => {
    const generator = new EvalGenerator({
      cfAccountId: process.env.CF_ACCOUNT_ID!,
      cfGatewayId: process.env.CF_AI_GATEWAY_ID!,
      cfGatewayToken: process.env.CF_AI_GATEWAY_TOKEN!
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
    expect(result.metadata.cost.model).toBe('anthropic/claude-sonnet-4-5');
  }, 30000); // 30s timeout for LLM call
});
