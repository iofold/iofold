# D1CallbackHandler Design - Multi-Turn Trace Capture

**Date:** 2025-12-17
**Status:** Approved

## Problem

Multi-turn agent responses (message → tool calls → another message based on results) are not being properly captured in traces. The current implementation creates a single LLM span per request, collapsing all turns into one.

## Root Cause

The current `D1TraceCollector` is manually called from the streaming loop in `playground.ts`:
- Creates ONE `mainSpanId` at the start of a request
- Accumulates all text into a single response
- Tool calls are children of the single span
- No turn boundaries are captured

This approach tries to reconstruct trace data by parsing streaming events - backwards from how tracing should work.

## Solution

Replace manual collector calls with a LangChain `BaseCallbackHandler` that automatically captures trace data at the source.

### Key Insight

LangChain/LangGraph calls `handleLLMStart`/`handleLLMEnd` **per turn**, not per request. Multi-turn is handled automatically by the callback system.

## Design

### D1CallbackHandler Class

```typescript
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';

class D1CallbackHandler extends BaseCallbackHandler {
  name = 'D1CallbackHandler';

  private db: D1Database;
  private traceId: string;
  private metadata: TraceMetadata;

  // Map runId → span data
  private spans: Map<string, SpanData>;
  private runIdToSpanId: Map<string, string>;

  // LLM callbacks - called per turn
  handleLLMStart(llm, prompts, runId, parentRunId, extraParams) {
    // Create new LLM span
  }

  handleLLMEnd(output, runId) {
    // End LLM span with output (including tool_calls if present)
  }

  // Tool callbacks
  handleToolStart(tool, input, runId, parentRunId) {
    // Create TOOL span as child of parent LLM span
  }

  handleToolEnd(output, runId) {
    // End TOOL span with result
  }

  // Flush to D1
  async flush(): Promise<void> {
    // Convert spans to OpenInference format
    // Insert to traces table
  }
}
```

### Integration

```typescript
// playground.ts - simplified
const handler = new D1CallbackHandler(env.DB, traceId, metadata);

const eventStream = agent.streamEvents(
  { messages: agentMessages },
  {
    version: 'v2',
    recursionLimit: DEFAULT_RECURSION_LIMIT,
    callbacks: [handler]  // Attach handler
  }
);

// Stream events for UI (unchanged)
for await (const event of eventStream) {
  // Forward to client
}

// Flush trace data
await handler.flush();
```

### Span Structure (OpenInference)

Multi-turn example:
```
Trace: trace_123
├── LLM Span 1 (Turn 1)
│   ├── input_messages: [user question]
│   └── output_messages: [assistant with tool_calls]
│       └── Tool Span 1
│           ├── name: "search"
│           ├── parameters: {...}
│           └── output: {...}
├── LLM Span 2 (Turn 2)
│   ├── input_messages: [user, assistant, tool_result]
│   └── output_messages: [final answer]
```

## Files to Modify

1. **`src/playground/tracing/d1-collector.ts`**
   - Replace with `D1CallbackHandler` extending `BaseCallbackHandler`
   - Keep D1 insertion logic
   - Remove manual span methods

2. **`src/api/playground.ts`**
   - Remove manual collector calls
   - Create handler, attach to config, flush at end

3. **`src/jobs/taskset-run-job.ts`**
   - Same simplification as playground

## Files Unchanged

- `src/services/trace-import/adapters/*` - External imports unaffected
- `frontend/*` - Display logic unchanged
- Database schema - Same `traces` table

## Backwards Compatibility

- Continue generating both `steps` (legacy) and `spans` (OpenInference)
- Can deprecate `steps` column later

## Benefits

| Aspect | Before | After |
|--------|--------|-------|
| Multi-turn | Broken | Works automatically |
| Code | Scattered manual calls | Single callback handler |
| Maintenance | Error-prone | Self-contained |
| Accuracy | Reconstructed from stream | Captured at source |
