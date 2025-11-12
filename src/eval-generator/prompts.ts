import type { Trace } from '../types/trace';

export function buildEvalGenerationPrompt(
  name: string,
  positiveExamples: Trace[],
  negativeExamples: Trace[]
): string {
  const positiveJson = JSON.stringify(
    positiveExamples.map(t => ({
      trace_id: t.trace_id,
      steps: t.steps.map(s => ({
        input: s.input,
        output: s.output,
        tool_calls: s.tool_calls,
        error: s.error
      }))
    })),
    null,
    2
  );

  const negativeJson = JSON.stringify(
    negativeExamples.map(t => ({
      trace_id: t.trace_id,
      steps: t.steps.map(s => ({
        input: s.input,
        output: s.output,
        tool_calls: s.tool_calls,
        error: s.error
      }))
    })),
    null,
    2
  );

  return `You are an expert at writing evaluation functions for AI agent execution traces.

Your task is to generate a Python function that can distinguish between good and bad traces based on the examples provided below.

## GOOD TRACES (should return True):
${positiveJson}

## BAD TRACES (should return False):
${negativeJson}

## Requirements:

1. **Function signature:**
   \`\`\`python
   def eval_${name}(trace: dict) -> tuple[bool, str]:
       """
       Evaluates a trace and returns (pass/fail, reason).

       Args:
           trace: Dictionary containing trace data with keys:
               - trace_id: str
               - steps: list of execution steps, each with:
                   - input: any
                   - output: any
                   - tool_calls: list
                   - error: str or None

       Returns:
           tuple: (True, reason) if trace passes, (False, reason) if it fails
       """
       # Your implementation here
   \`\`\`

2. **Allowed imports ONLY:** json, re, typing
   - Do not import any other modules
   - No os, sys, subprocess, requests, etc.

3. **Be specific about what makes traces good vs bad:**
   - Identify concrete patterns from the examples
   - Check specific fields (output quality, error presence, tool usage, etc.)
   - Explain your reasoning in the return message

4. **Handle edge cases:**
   - Missing fields (use .get() with defaults)
   - Different data types
   - Empty lists/dicts
   - Unexpected structures

5. **Add clear comments explaining your logic**

6. **Return format:**
   - Return (True, "Clear reason why this passed") for good traces
   - Return (False, "Clear reason why this failed") for bad traces

## Output:

Generate the complete Python function following the requirements above. Include only the function code, no additional explanation.`;
}
