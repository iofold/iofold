#!/usr/bin/env npx tsx
/**
 * Test script for LLM-based eval execution
 *
 * Demonstrates how to create and run an eval that calls an LLM via ctx.call_llm()
 * to evaluate parts of a trace.
 *
 * This test directly calls the Python executor service to demonstrate the
 * iterative LLM bridge pattern used by EvalRunner.
 *
 * Usage:
 *   npx tsx scripts/test-llm-eval.ts
 *
 * Requirements:
 *   - Python executor service running (docker compose up python-sandbox)
 *   - AI Gateway credentials in .dev.vars
 */

import { config } from 'dotenv';
import OpenAI from 'openai';

// Load environment variables from .dev.vars
config({ path: '.dev.vars' });

// Example LLM-based eval code
// This eval uses ctx.call_llm() to semantically evaluate the agent's response
const LLM_EVAL_CODE = `
def eval_function(task, task_metadata, trace, ctx):
    """
    LLM-based eval that uses Claude to evaluate trace quality.

    This eval:
    1. Extracts the final agent response from the trace
    2. Calls an LLM to evaluate the response quality
    3. Returns a score (0-1) and feedback
    """
    import json
    import re

    # Extract the final agent response from trace steps
    agent_response = ""
    for step in reversed(trace.get("steps", [])):
        messages = step.get("messages_added", [])
        for msg in reversed(messages):
            if msg.get("role") == "assistant":
                content = msg.get("content", "")
                if isinstance(content, list):
                    agent_response = "".join(
                        block.get("text", "")
                        for block in content
                        if isinstance(block, dict) and block.get("type") == "text"
                    )
                else:
                    agent_response = str(content)
                break
        if agent_response:
            break

    if not agent_response:
        return (0.0, "No agent response found in trace")

    # Get the original user query
    user_query = task.get("user_message", "")
    if not user_query:
        for step in trace.get("steps", []):
            messages = step.get("messages_added", [])
            for msg in messages:
                if msg.get("role") == "user":
                    user_query = msg.get("content", "")
                    break
            if user_query:
                break

    # Call LLM to evaluate the response
    evaluation_prompt = f"""Evaluate the following agent response for quality and helpfulness.

USER QUERY: {user_query[:500]}

AGENT RESPONSE: {agent_response[:1000]}

Rate the response on a scale from 0.0 to 1.0 where:
- 0.0 = Completely unhelpful, wrong, or harmful
- 0.5 = Partially helpful but has issues
- 1.0 = Excellent, fully addresses the query

Respond with ONLY a JSON object in this exact format:
{{"score": <float between 0 and 1>, "feedback": "<brief explanation>"}}
"""

    try:
        # Call LLM via ctx.call_llm() - this bridges to TypeScript EvalContext
        llm_response = ctx.call_llm(
            prompt=evaluation_prompt,
            model="anthropic/claude-haiku-4-5",
            temperature=0.0,
            max_tokens=200
        )

        # Parse the LLM response
        json_match = re.search(r'\\{[^}]+\\}', llm_response)
        if json_match:
            result = json.loads(json_match.group())
            score = float(result.get("score", 0.5))
            feedback = result.get("feedback", "No feedback provided")
            score = max(0.0, min(1.0, score))
            return (score, feedback)
        else:
            return (0.5, f"Could not parse LLM response: {llm_response[:100]}")

    except Exception as e:
        return (0.0, f"LLM evaluation failed: {str(e)}")
`;

// Example trace data
const EXAMPLE_TRACE = {
  trace_id: 'test-trace-001',
  steps: [
    {
      step_id: 'step_0',
      timestamp: new Date().toISOString(),
      messages_added: [{ role: 'user', content: 'What is the capital of France?' }],
      tool_calls: [],
      input: null,
      output: null,
      metadata: {}
    },
    {
      step_id: 'step_1',
      timestamp: new Date().toISOString(),
      messages_added: [{
        role: 'assistant',
        content: 'The capital of France is Paris. It is the largest city in France and serves as the country\'s political, economic, and cultural center.'
      }],
      tool_calls: [],
      input: null,
      output: null,
      metadata: {}
    }
  ]
};

const EXAMPLE_TASK = { user_message: 'What is the capital of France?' };

/**
 * Build Python wrapper code with LLM bridge support (same pattern as EvalRunner)
 */
function buildPythonWrapper(
  evalCode: string,
  task: Record<string, unknown>,
  taskMetadata: Record<string, unknown>,
  trace: Record<string, unknown>,
  llmResponses: Record<string, string> = {}
): string {
  const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const taskJson = escape(JSON.stringify(task));
  const taskMetadataJson = escape(JSON.stringify(taskMetadata));
  const traceJson = escape(JSON.stringify(trace));
  const llmResponsesJson = escape(JSON.stringify(llmResponses));

  return `import json
import re
from typing import Any, Dict, Optional, Tuple

# Pre-loaded LLM responses from previous iterations
_llm_responses: Dict[str, str] = json.loads("${llmResponsesJson}")
_llm_call_counter = 0

class EvalContext:
    """Sandboxed context for eval function execution."""

    def call_llm(
        self,
        prompt: str,
        model: str = "anthropic/claude-sonnet-4-5",
        temperature: float = 0.0,
        max_tokens: int = 500
    ) -> str:
        """Call an LLM for semantic evaluation."""
        global _llm_call_counter
        _llm_call_counter += 1
        request_id = f"llm_call_{_llm_call_counter}"

        # Check if response is already available from previous iteration
        if request_id in _llm_responses:
            return _llm_responses[request_id]

        # Signal TypeScript to process this LLM call
        request = {
            "id": request_id,
            "prompt": prompt,
            "model": model,
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        print(f"[LLM_REQUEST]{json.dumps(request)}[/LLM_REQUEST]")
        raise SystemExit(0)

# User's eval function
${evalCode}

# Load inputs
task = json.loads("${taskJson}")
task_metadata = json.loads("${taskMetadataJson}")
trace = json.loads("${traceJson}")

# Create context and execute
ctx = EvalContext()
try:
    result = eval_function(task, task_metadata, trace, ctx)
    if isinstance(result, tuple) and len(result) == 2:
        score, feedback = result
    else:
        raise ValueError(f"eval_function must return tuple[float, str], got {type(result)}")

    score = max(0.0, min(1.0, float(score)))
    output = {"score": score, "feedback": str(feedback)}
    print(json.dumps(output))
except Exception as e:
    print(json.dumps({"score": 0.0, "feedback": f"Eval error: {str(e)}"}))
`;
}

/**
 * Execute Python code via the dev executor service
 */
async function executePython(code: string): Promise<{ success: boolean; output?: string; error?: string }> {
  const executorUrl = process.env.PYTHON_EXECUTOR_URL || 'http://localhost:9999';

  try {
    const response = await fetch(`${executorUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, timeout: 30000 })
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${await response.text()}` };
    }

    const result = await response.json() as { success: boolean; output?: string; error?: string };
    return result;
  } catch (error: any) {
    return { success: false, error: `Request failed: ${error.message}` };
  }
}

/**
 * Call LLM via Cloudflare AI Gateway
 */
async function callLLM(
  client: OpenAI,
  prompt: string,
  model: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature,
    max_tokens: maxTokens
  });

  return response.choices[0]?.message?.content || '';
}

async function main() {
  console.log('=== LLM-Based Eval Test ===\n');

  const cfAccountId = process.env.CF_ACCOUNT_ID;
  const cfGatewayId = process.env.CF_AI_GATEWAY_ID;
  const cfGatewayToken = process.env.CF_AI_GATEWAY_TOKEN;

  if (!cfAccountId || !cfGatewayId) {
    console.error('Error: Missing CF_ACCOUNT_ID or CF_AI_GATEWAY_ID in .dev.vars');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  CF_ACCOUNT_ID: ${cfAccountId.substring(0, 8)}...`);
  console.log(`  CF_AI_GATEWAY_ID: ${cfGatewayId}`);
  console.log(`  Python Executor: ${process.env.PYTHON_EXECUTOR_URL || 'http://localhost:9999'}`);
  console.log('');

  // Create OpenAI client pointing to AI Gateway /compat endpoint
  const client = new OpenAI({
    apiKey: cfGatewayToken || 'placeholder',
    baseURL: `https://gateway.ai.cloudflare.com/v1/${cfAccountId}/${cfGatewayId}/compat`
  });

  console.log('Eval Code (showing ctx.call_llm usage):');
  console.log('---');
  // Show the key part of the eval
  const keyLines = LLM_EVAL_CODE.split('\n').filter(line =>
    line.includes('call_llm') || line.includes('evaluation_prompt') || line.includes('def eval_function')
  );
  keyLines.forEach(line => console.log(line));
  console.log('---\n');

  console.log('Test Trace: User asks "What is the capital of France?"');
  console.log('Agent responds: "The capital of France is Paris..."\n');

  // Iterative execution with LLM bridge
  const MAX_ITERATIONS = 10;
  const llmResponses: Record<string, string> = {};
  let iteration = 0;
  let totalLLMCalls = 0;

  console.log('Executing eval with LLM bridge...\n');

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`[Iteration ${iteration}]`);

    const wrappedCode = buildPythonWrapper(LLM_EVAL_CODE, EXAMPLE_TASK, {}, EXAMPLE_TRACE, llmResponses);
    const execution = await executePython(wrappedCode);

    if (!execution.success) {
      console.error(`Execution failed: ${execution.error}`);
      process.exit(1);
    }

    const output = execution.output || '';

    // Check for LLM request marker
    const llmRequestMatch = output.match(/\[LLM_REQUEST\](.*?)\[\/LLM_REQUEST\]/s);

    if (llmRequestMatch) {
      const request = JSON.parse(llmRequestMatch[1]) as {
        id: string;
        prompt: string;
        model: string;
        temperature: number;
        max_tokens: number;
      };

      console.log(`  LLM Request: ${request.id}`);
      console.log(`  Model: ${request.model}`);
      console.log(`  Prompt: "${request.prompt.substring(0, 100)}..."`);

      // Call LLM
      console.log('  Calling LLM via AI Gateway...');
      try {
        const response = await callLLM(
          client,
          request.prompt,
          request.model,
          request.temperature,
          request.max_tokens
        );

        console.log(`  Response: "${response.substring(0, 100)}..."`);
        llmResponses[request.id] = response;
        totalLLMCalls++;
      } catch (error: any) {
        console.error(`  LLM call failed: ${error.message}`);
        process.exit(1);
      }

      continue;
    }

    // Parse final result
    const jsonMatch = output.match(/\{[\s\S]*"score"[\s\S]*"feedback"[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      console.log('\n=== Result ===');
      console.log(`Score: ${result.score.toFixed(2)}`);
      console.log(`Feedback: ${result.feedback}`);
      console.log(`\nExecution Stats:`);
      console.log(`  Iterations: ${iteration}`);
      console.log(`  LLM Calls: ${totalLLMCalls}`);
      process.exit(0);
    }

    console.error(`Could not parse output: ${output}`);
    process.exit(1);
  }

  console.error(`Exceeded max iterations (${MAX_ITERATIONS})`);
  process.exit(1);
}

main();
