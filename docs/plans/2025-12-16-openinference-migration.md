# OpenInference Trace Format Migration

## Overview

Migrate trace storage from custom `LangGraphExecutionStep` format to OpenInference-compliant spans. This enables importing traces from multiple sources (Langfuse, LangSmith, OpenAI, Phoenix Arize, Playground) into a canonical format for analysis and visualization.

## Goals

1. **Multi-source import** - Normalize traces from Langfuse, LangSmith, OpenAI, Phoenix Arize, Playground
2. **Better data representation** - Tool calls embedded in LLM output messages (not separate steps)
3. **Improved visualization** - UI can properly show which tools an LLM decided to call
4. **Standard compliance** - Follow OpenInference semantic conventions

## Non-Goals

- Export to external platforms (import only)
- Flattened OTEL attribute format (use structured JSON)
- Backwards compatibility with old traces (fresh start)

## Canonical Span Schema

```typescript
interface OpenInferenceSpan {
  // Core identifiers
  span_id: string;
  trace_id: string;
  parent_span_id?: string;

  // OpenInference span kind (required)
  span_kind: 'LLM' | 'TOOL' | 'AGENT' | 'CHAIN' | 'RETRIEVER' | 'EMBEDDING' | 'RERANKER';

  // Timing
  name: string;
  start_time: string;  // ISO 8601
  end_time?: string;
  status: 'OK' | 'ERROR' | 'UNSET';
  status_message?: string;

  // LLM-specific (when span_kind = 'LLM')
  llm?: {
    model_name?: string;
    provider?: string;
    input_messages: Message[];
    output_messages: Message[];  // Includes tool_calls if LLM requested them
    token_count_prompt?: number;
    token_count_completion?: number;
    token_count_total?: number;
  };

  // Tool-specific (when span_kind = 'TOOL')
  tool?: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;  // Input args
    output?: unknown;  // Result
  };

  // Generic input/output for other span kinds
  input?: unknown;
  output?: unknown;

  // Catch-all for source-specific attributes
  attributes?: Record<string, unknown>;

  // Original source span ID for debugging
  source_span_id?: string;
}

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: ToolCallRequest[];  // LLM's request to call tools
  tool_call_id?: string;  // For tool result messages
}

interface ToolCallRequest {
  id: string;
  function: {
    name: string;
    arguments: string;  // JSON string per OpenAI spec
  };
}
```

## Database Schema Changes

Update `traces` table:
- `steps` → `spans` (OpenInferenceSpan[])
- Keep `rawData` for unmapped attributes
- Add `totalTokens`, `totalDurationMs` summary fields
- Rename `stepCount` → `spanCount`

## Import Adapter Architecture

```
src/services/trace-import/
├── types.ts           # OpenInferenceSpan, TraceImportAdapter interface
├── adapters/
│   ├── index.ts       # Adapter registry
│   ├── langfuse.ts    # Observations → OpenInferenceSpan
│   ├── langsmith.ts   # Runs → OpenInferenceSpan
│   ├── openai.ts      # API responses → OpenInferenceSpan
│   ├── phoenix.ts     # Already OpenInference, minimal transform
│   └── playground.ts  # Stream events → OpenInferenceSpan
└── index.ts           # Main import service
```

## Key Fix: Tool Calls in Playground Adapter

Current problem: Tool calls create separate child spans, not embedded in LLM output.

Solution in playground adapter:
1. Buffer tool call requests from `tool-call-start` events
2. When LLM generation completes, attach buffered tool_calls to `llm.output_messages`
3. Create separate TOOL spans for execution results (linked via tool_call_id)

## Implementation Phases

### Phase 1: Core Types & Schema
- Create `src/types/openinference.ts`
- Create database migration (add spans column)
- Create adapter interface

### Phase 2: Import Adapters
- Implement playground adapter (priority - fixes tool_calls)
- Implement langfuse adapter
- Implement langsmith adapter
- Implement phoenix adapter
- Implement openai adapter

### Phase 3: Backend Integration
- Update D1TraceCollector to output OpenInference spans
- Update trace import endpoints
- Update trace API responses

### Phase 4: Frontend
- Update types
- Update ConversationThread (extract from LLM spans)
- Update TraceExplorer (render new format)
- Simplify trace-parser.ts

### Phase 5: Cleanup
- Delete old trace data
- Remove steps column
- Remove legacy code
