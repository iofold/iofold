import { PythonRunner } from '../sandbox/python-runner';
import type { Trace } from '../types/trace';

export interface TestCase {
  trace: Trace;
  expectedPass: boolean;
}

export interface TestResult {
  correct: number;
  incorrect: number;
  errors: number;
  total: number;
  accuracy: number;
  details: TestCaseResult[];
}

export interface TestCaseResult {
  traceId: string;
  expected: boolean;
  predicted: boolean;
  reason: string;
  match: boolean;
  error?: string;
  executionTimeMs: number;
}

export class EvalTester {
  private runner: PythonRunner;

  constructor() {
    this.runner = new PythonRunner();
  }

  async test(evalCode: string, testCases: TestCase[]): Promise<TestResult> {
    const results: TestCaseResult[] = [];

    for (const testCase of testCases) {
      const result = await this.testSingle(evalCode, testCase);
      results.push(result);
    }

    const correct = results.filter(r => r.match && !r.error).length;
    const errors = results.filter(r => r.error).length;
    const total = results.length;

    return {
      correct,
      incorrect: total - correct - errors,
      errors,
      total,
      accuracy: total > 0 ? correct / total : 0,
      details: results
    };
  }

  private async testSingle(
    evalCode: string,
    testCase: TestCase
  ): Promise<TestCaseResult> {
    // Prepare trace data in format eval function expects
    const traceData = {
      trace_id: testCase.trace.trace_id,
      steps: testCase.trace.steps.map(step => ({
        input: step.input,
        output: step.output,
        tool_calls: step.tool_calls,
        error: step.error
      }))
    };

    // Extract function name from eval code
    const functionNameMatch = evalCode.match(/def\s+(\w+)\s*\(/);
    const functionName = functionNameMatch ? functionNameMatch[1] : 'eval_function';

    // Build execution code
    // We create a JSON string that can be parsed
    // Escape backslashes and double quotes for embedding in Python string
    const traceJson = JSON.stringify(traceData)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');

    // Split eval code and execution into separate parts to avoid pythonToJsShim issues
    const executionCode = `
import json

${evalCode}

trace_data = json.loads("${traceJson}")
result = ${functionName}(trace_data)
result_dict = {"passed": result[0], "reason": result[1]}
print(json.dumps(result_dict))
`;

    try {
      // Debug: log execution code
      // console.log('Execution code:', executionCode);

      const execution = await this.runner.execute(executionCode);

      // Debug: log execution result
      // console.log('Execution result:', JSON.stringify(execution, null, 2));

      if (!execution.success) {
        return {
          traceId: testCase.trace.trace_id,
          expected: testCase.expectedPass,
          predicted: false,
          reason: '',
          match: false,
          error: execution.error,
          executionTimeMs: execution.executionTimeMs
        };
      }

      // Parse result from output
      const output = execution.output || '';
      const resultMatch = output.match(/\{"passed":\s*(true|false),\s*"reason":\s*"([^"]*)"\}/);
      if (!resultMatch) {
        return {
          traceId: testCase.trace.trace_id,
          expected: testCase.expectedPass,
          predicted: false,
          reason: '',
          match: false,
          error: `Could not parse eval result. Output: ${output}`,
          executionTimeMs: execution.executionTimeMs
        };
      }

      const predicted = resultMatch[1] === 'true';
      const reason = resultMatch[2];

      return {
        traceId: testCase.trace.trace_id,
        expected: testCase.expectedPass,
        predicted,
        reason,
        match: predicted === testCase.expectedPass,
        executionTimeMs: execution.executionTimeMs
      };
    } catch (error: any) {
      return {
        traceId: testCase.trace.trace_id,
        expected: testCase.expectedPass,
        predicted: false,
        reason: '',
        match: false,
        error: error.message,
        executionTimeMs: 0
      };
    }
  }
}
