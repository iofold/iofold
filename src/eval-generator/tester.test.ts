import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the @cloudflare/sandbox module BEFORE importing anything else
vi.mock('@cloudflare/sandbox', async () => {
  const mock = await import('../sandbox/__mocks__/sandbox-mock');
  return {
    getSandbox: mock.getMockSandbox
  };
});

import { EvalTester } from './tester';
import { PythonRunner } from '../sandbox/python-runner';
import { mockSandboxBinding } from '../sandbox/__mocks__/sandbox-mock';
import type { Trace } from '../types/trace';

describe('EvalTester', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.restoreAllMocks();
  });

  it('should test eval against training set with float scores', async () => {
    // Mock PythonRunner to simulate successful eval execution
    vi.spyOn(PythonRunner.prototype, 'execute').mockImplementation(async (code: string) => {
      // Return a high score (0.9) - should match high expectedScore, not low
      return {
        success: true,
        output: '{"score":0.9,"feedback":"High quality response"}',
        executionTimeMs: 5
      };
    });

    const tester = new EvalTester({ sandboxBinding: mockSandboxBinding });

    // Simple eval that returns a high score
    const evalCode = `
def eval_test(trace):
    return (0.9, "High quality response")
`;

    const traces = [
      {
        trace: {
          id: '1',
          trace_id: '1',
          source: 'langfuse' as const,
          raw_data: {},
          steps: [{
            step_id: '1',
            trace_id: '1',
            timestamp: new Date().toISOString(),
            messages_added: [],
            tool_calls: [],
            input: {},
            output: { result: 'success' },
            metadata: {}
          }]
        },
        expectedScore: 1.0 // High quality - should match
      },
      {
        trace: {
          id: '2',
          trace_id: '2',
          source: 'langfuse' as const,
          raw_data: {},
          steps: [{
            step_id: '2',
            trace_id: '2',
            timestamp: new Date().toISOString(),
            messages_added: [],
            tool_calls: [],
            input: {},
            output: { result: 'failure' },
            metadata: {}
          }]
        },
        expectedScore: 0.0 // Low quality - should NOT match (predicted 0.9, expected 0.0)
      }
    ];

    const result = await tester.test(evalCode, traces);

    // Since our eval always returns 0.9 (high):
    // - Trace 1 (expectedScore: 1.0 >= 0.5) matches (predicted 0.9 >= 0.5)
    // - Trace 2 (expectedScore: 0.0 < 0.5) doesn't match (predicted 0.9 >= 0.5)
    expect(result.total).toBe(2);
    expect(result.correct).toBe(1); // Only trace 1 matches
    expect(result.incorrect).toBe(1); // Trace 2 doesn't match
    expect(result.errors).toBe(0);
    expect(result.accuracy).toBe(0.5); // 50% accuracy
    expect(result.meanAbsoluteError).toBeCloseTo(0.5, 1); // Average of |0.9-1.0| and |0.9-0.0|
  });
});
