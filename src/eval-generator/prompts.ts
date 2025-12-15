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

Your task is to generate a Python function that scores traces on a continuous scale (0.0 to 1.0) based on the examples provided below.

## HIGH-QUALITY TRACES (should score close to 1.0):
${positiveJson}

## LOW-QUALITY TRACES (should score close to 0.0):
${negativeJson}

## Requirements:

1. **Function signature:**
   \`\`\`python
   def eval_${name}(trace: dict, ctx: EvalContext = None) -> tuple[float, str]:
       """
       Evaluates a trace and returns (score, feedback).

       Args:
           trace: Dictionary containing trace data with keys:
               - trace_id: str
               - steps: list of execution steps, each with:
                   - input: any
                   - output: any
                   - tool_calls: list
                   - error: str or None
           ctx: Optional EvalContext for LLM-as-judge evaluation

       Returns:
           tuple[float, str]: (score from 0.0 to 1.0, feedback explaining the score)
               - 1.0 = excellent quality, matches high-quality examples
               - 0.0 = poor quality, matches low-quality examples
               - Values in between reflect partial quality
       """
       # Your implementation here
   \`\`\`

2. **EvalContext API (ctx parameter - optional, for LLM-as-judge):**
   When ctx is provided, you can use this method for semantic evaluation:

   \`\`\`python
   if ctx:
       # Call an LLM for semantic evaluation
       response = ctx.call_llm(
           prompt="Evaluate the quality of this response: ...",
           model="anthropic/claude-haiku-4-5",  # Optional: cheaper/faster model
           temperature=0.0,  # Optional: default 0.0 for determinism
           max_tokens=500    # Optional: default 500
       )
   \`\`\`

3. **Evaluation strategy (prefer heuristics first):**
   - **Prefer heuristics** for clear, deterministic checks (errors, lengths, patterns)
   - **Use LLM-as-judge** only when semantic understanding is needed (tone, relevance, accuracy)
   - **Combine both** for comprehensive scoring when appropriate
   - **Cost-conscious**: Use \`anthropic/claude-haiku-4-5\` for LLM checks when possible

4. **Allowed imports ONLY:** json, re, typing, math, datetime, difflib
   - Do not import any other modules
   - No os, sys, subprocess, requests, etc.

5. **Scoring guidelines:**
   - Identify multiple quality dimensions from the examples
   - Weight each dimension appropriately
   - Return a nuanced score, not just 0 or 1
   - Example: if 3 of 4 quality checks pass, return ~0.75

6. **Handle edge cases:**
   - Missing fields (use .get() with defaults)
   - Different data types
   - Empty lists/dicts
   - Unexpected structures

7. **Add clear comments explaining your scoring logic**

8. **Return format:**
   - Return (score, "Detailed feedback explaining the score")
   - Feedback should mention which quality dimensions passed/failed
   - Score must be a float between 0.0 and 1.0 inclusive

## Output:

Generate the complete Python function following the requirements above. Include only the function code, no additional explanation.`;
}
