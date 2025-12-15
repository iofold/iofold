import { PythonRunner, type PythonRunnerConfig } from '../sandbox/python-runner';
import type { Trace } from '../types/trace';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';

export interface TestCase {
  trace: Trace;
  expectedScore: number; // 0.0 to 1.0 (1.0 = high quality, 0.0 = low quality)
}

export interface TestResult {
  correct: number;
  incorrect: number;
  errors: number;
  total: number;
  accuracy: number;
  meanAbsoluteError: number; // Average |predicted - expected| for scored cases
  details: TestCaseResult[];
}

export interface TestCaseResult {
  traceId: string;
  expectedScore: number;
  predictedScore: number;
  feedback: string;
  match: boolean; // True if prediction direction matches expectation
  error?: string;
  executionTimeMs: number;
}

// Threshold for converting scores to pass/fail
const PASS_THRESHOLD = 0.5;

export interface EvalTesterConfig {
  sandboxBinding?: DurableObjectNamespace<Sandbox>;
  timeout?: number;
}

export class EvalTester {
  private runner: PythonRunner;

  constructor(config: EvalTesterConfig = {}) {
    this.runner = new PythonRunner({
      sandboxBinding: config.sandboxBinding,
      timeout: config.timeout
    });
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

    // Calculate mean absolute error for non-error cases
    const scoredResults = results.filter(r => !r.error);
    const totalAbsError = scoredResults.reduce(
      (sum, r) => sum + Math.abs(r.predictedScore - r.expectedScore),
      0
    );
    const meanAbsoluteError = scoredResults.length > 0 ? totalAbsError / scoredResults.length : 0;

    return {
      correct,
      incorrect: total - correct - errors,
      errors,
      total,
      accuracy: total > 0 ? correct / total : 0,
      meanAbsoluteError,
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
# Handle both float scores (new format) and boolean (legacy format)
score = float(result[0]) if isinstance(result[0], (int, float)) else (1.0 if result[0] else 0.0)
result_dict = {"score": score, "feedback": str(result[1])}
print(json.dumps(result_dict))
`;

    try {
      const execution = await this.runner.execute(executionCode);

      if (!execution.success) {
        return {
          traceId: testCase.trace.id,
          expectedScore: testCase.expectedScore,
          predictedScore: 0,
          feedback: '',
          match: false,
          error: execution.error,
          executionTimeMs: execution.executionTimeMs
        };
      }

      // Parse result from output - find and parse JSON object
      const output = execution.output || '';

      // Find JSON object in output (handles any text before/after)
      const jsonMatch = output.match(/\{[\s\S]*"score"[\s\S]*"feedback"[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          traceId: testCase.trace.id,
          expectedScore: testCase.expectedScore,
          predictedScore: 0,
          feedback: '',
          match: false,
          error: `Could not find JSON in output. Output: ${output.substring(0, 200)}`,
          executionTimeMs: execution.executionTimeMs
        };
      }

      let predictedScore: number;
      let feedback: string;
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        predictedScore = typeof parsed.score === 'number' ? parsed.score : parseFloat(parsed.score);
        feedback = String(parsed.feedback || '');
      } catch (parseError: any) {
        return {
          traceId: testCase.trace.id,
          expectedScore: testCase.expectedScore,
          predictedScore: 0,
          feedback: '',
          match: false,
          error: `JSON parse error: ${parseError.message}. Output: ${output.substring(0, 200)}`,
          executionTimeMs: execution.executionTimeMs
        };
      }

      // Match if both are on same side of threshold
      const expectedPass = testCase.expectedScore >= PASS_THRESHOLD;
      const predictedPass = predictedScore >= PASS_THRESHOLD;

      return {
        traceId: testCase.trace.id,
        expectedScore: testCase.expectedScore,
        predictedScore,
        feedback,
        match: expectedPass === predictedPass,
        executionTimeMs: execution.executionTimeMs
      };
    } catch (error: any) {
      return {
        traceId: testCase.trace.id,
        expectedScore: testCase.expectedScore,
        predictedScore: 0,
        feedback: '',
        match: false,
        error: error.message,
        executionTimeMs: 0
      };
    }
  }
}
