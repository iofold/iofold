import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvalTester } from './tester';
import { PythonRunner } from '../sandbox/python-runner';
import type { Trace } from '../types/trace';

describe('EvalTester', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.restoreAllMocks();
  });

  it('should test eval against training set', async () => {
    // Mock PythonRunner to simulate successful eval execution
    // This is necessary because the PythonRunner prototype has limitations
    let callCount = 0;
    vi.spyOn(PythonRunner.prototype, 'execute').mockImplementation(async (code: string) => {
      callCount++;
      // First call should return True (matches expectedPass: true)
      // Second call should return True (doesn't match expectedPass: false)
      return {
        success: true,
        output: '{"passed":true,"reason":"Test always passes"}',
        executionTimeMs: 5
      };
    });

    const tester = new EvalTester();

    // Simple eval that always returns True
    const evalCode = `
def eval_test(trace):
    return (True, "Test always passes")
`;

    const traces: Array<{ trace: Trace; expectedPass: boolean }> = [
      {
        trace: {
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
            input: {},
            output: { result: 'success' },
            metadata: {}
          }]
        },
        expectedPass: true
      },
      {
        trace: {
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
            input: {},
            output: { result: 'failure' },
            metadata: {}
          }]
        },
        expectedPass: false
      }
    ];

    const result = await tester.test(evalCode, traces);

    // Since our eval always returns True, it matches trace 1 (expectedPass: true)
    // but NOT trace 2 (expectedPass: false)
    expect(result.total).toBe(2);
    expect(result.correct).toBe(1); // Only trace 1 matches
    expect(result.incorrect).toBe(1); // Trace 2 doesn't match
    expect(result.errors).toBe(0);
    expect(result.accuracy).toBe(0.5); // 50% accuracy
  });
});
