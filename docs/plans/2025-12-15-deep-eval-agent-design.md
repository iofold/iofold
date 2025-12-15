# Deep Eval Agent Design

**Date:** 2025-12-15
**Status:** Approved

## Overview

Replace single-shot eval generation with an iterative, tool-using agent that can fetch traces, test its code, and refine until achieving 80% accuracy.

## Architecture

```
User triggers "Generate Eval"
        ↓
EvalGenerationJob starts
        ↓
DeepEvalAgent initialized with:
  - System prompt (methodical process)
  - Tools: fetch_traces, test_eval_code, get_trace_details, filesystem, todo
  - Agent ID & eval name
        ↓
Agent iterates naturally:
  1. Fetch trace summaries
  2. Analyze patterns
  3. Write eval code
  4. Test against traces
  5. If accuracy < 80%, analyze failures and refine
        ↓
Final eval code extracted and saved
```

## Key Decisions

| Decision | Choice |
|----------|--------|
| Architecture | Reuse DeepAgents pattern from playground |
| Model | Claude Sonnet 4.5 |
| Max iterations | 5 (via recursion limit ~50 steps) |
| Success threshold | 80% accuracy |
| Agent personality | Methodical/systematic process |
| Output | Clean eval code (streaming shows thinking) |
| Integration | Replace EvalGenerationJob internals |
| EvalContext | Simplified (remove LLM cache complexity) |

## Tools

### fetch_traces

Fetch labeled traces for the agent. Returns summaries to avoid context overflow.

```typescript
{
  name: "fetch_traces",
  parameters: {
    agent_id: string,           // Required - which agent's traces
    rating?: "positive" | "negative" | "all",
    limit?: number,             // Default 20
    offset?: number
  },
  returns: {
    traces: [{
      id: string,
      trace_id: string,
      rating: string,
      summary: string,          // First 200 chars of output
      step_count: number,
      has_tool_calls: boolean
    }],
    total: number
  }
}
```

### get_trace_details

Get full details of a specific trace for deep analysis.

```typescript
{
  name: "get_trace_details",
  parameters: {
    trace_id: string
  },
  returns: {
    id: string,
    steps: Step[],              // Full step data
    raw_data: any
  }
}
```

### test_eval_code

Test eval function against labeled traces. Returns accuracy and mismatches.

```typescript
{
  name: "test_eval_code",
  parameters: {
    code: string,               // Python eval function
    trace_ids?: string[]        // Specific traces, or all if omitted
  },
  returns: {
    accuracy: number,           // 0-1
    total: number,
    correct: number,
    incorrect: number,
    errors: number,
    mismatches: [{
      trace_id: string,
      expected: "positive" | "negative",
      predicted: "positive" | "negative",
      score: number,
      feedback: string
    }]
  }
}
```

### Filesystem & Todo Tools

Reuse existing tools from playground:
- `read_file`, `write_file`, `list_files` - for storing notes/intermediate data
- `manage_todos` - for planning work

## System Prompt

```
You are an eval function generator. Your job is to write a Python function that accurately classifies agent trace quality based on labeled examples.

## Your Process

1. **Fetch samples** - Use fetch_traces to get positive and negative examples
2. **Analyze patterns** - Study what distinguishes good from bad traces
3. **Write eval** - Create a Python function: def eval_{name}(trace, ctx=None) -> tuple[float, str]
4. **Test** - Use test_eval_code to measure accuracy
5. **Refine** - If accuracy < 80%, analyze mismatches and improve

## Eval Function Requirements

- Signature: def eval_{name}(trace: dict, ctx=None) -> tuple[float, str]
- Return: (score 0.0-1.0, "explanation string")
- Score >= 0.5 means "positive/good quality"
- Score < 0.5 means "negative/bad quality"
- Allowed imports: json, re, typing, math, datetime, difflib

## Tips

- Use get_trace_details to inspect specific traces deeply
- If context gets large, write notes to files
- Use todos to track your approach
- Focus on patterns that generalize, not trace-specific hacks

## Success Criteria

Stop when accuracy >= 80%. You have up to 5 test attempts.
```

## Job Integration

EvalGenerationJob becomes a thin orchestrator:

```typescript
async execute(stream?: SSEStream): Promise<GenerateEvalJobResult> {
  // 1. Setup
  await this.log('info', 'Starting deep eval agent...');

  // 2. Create agent
  const agent = new DeepEvalAgent({
    agentId: this.config.agentId,
    evalName: this.config.name,
    model: 'anthropic/claude-sonnet-4-5',
    db: this.deps.db,
    sandbox: this.deps.sandboxBinding,
    onLog: (level, msg, data) => this.log(level, msg, data)
  });

  // 3. Run agent
  const result = await agent.generate();

  // 4. Save eval to database
  const evalId = await this.saveEval(result.code, result.accuracy);

  // 5. Complete job
  await this.jobManager.completeJob(this.config.jobId, { eval_id: evalId, ... });
}
```

## Recursion Limit Handling

When approaching the recursion limit, force a final answer:

```typescript
const RECURSION_LIMIT = 50;
const WRAP_UP_THRESHOLD = 45;

if (currentStep >= WRAP_UP_THRESHOLD) {
  messages.push({
    role: 'user',
    content: 'Provide your final eval function now. No more tool calls allowed.'
  });
  availableTools = [];  // Disable tools
}
```

## EvalContext Simplification

**Before (complex):**
```python
class EvalContext:
  def call_llm(prompt, model, temp, max_tokens, cache_key) -> str
  def get_cost_so_far() -> float
  def get_remaining_budget() -> float
  def has_cache(key) -> bool
  def get_cache(key) -> str | None
  def set_cache(key, value) -> None
```

**After (simple):**
```python
class EvalContext:
  def call_llm(prompt, model='claude-haiku', temperature=0, max_tokens=1000) -> str
```

Gateway handles caching if needed.

## File Changes

**New files:**
- `src/services/eval/deep-eval-agent.ts` - Main agent class
- `src/services/eval/eval-tools.ts` - Tool definitions and handlers

**Modified files:**
- `src/jobs/eval-generation-job.ts` - Replace internals with agent
- `src/services/eval/eval-context.ts` - Remove cache methods
- `src/services/eval/eval-runner.ts` - Simplify LLM bridge
- `src/eval-generator/prompts.ts` - Update EvalContext docs in prompt

## Streaming

Agent events stream to LiveJobMonitor via existing SSE:
- Tool calls → "Fetching traces..."
- Tool results → Show data
- Agent thinking → Show reasoning
- Test results → Show accuracy + mismatches
