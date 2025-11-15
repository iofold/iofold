# Trace Parser & Data Layer

**Version**: 1.0
**Date**: 2025-11-14
**Purpose**: Parse and transform raw API trace data for the card-swiping UI

---

## Overview

The trace parser transforms raw API trace data into an optimized format for the card-swiping interface. It handles:

- Message extraction and truncation
- Tool call parsing
- Status detection (complete/partial/error)
- Duration calculation
- Edge case handling (empty messages, missing fields, etc.)

## Files

- **`lib/trace-parser.ts`** - Main parser implementation
- **`types/trace.ts`** - TypeScript type definitions
- **`lib/__tests__/trace-parser.test.ts`** - Unit tests
- **`scripts/test-trace-parser.ts`** - Manual test script
- **`scripts/test-with-api.ts`** - API integration test

---

## Core Functions

### `parseTrace(trace, traceNumber, config?)`

Main parser function that converts a raw trace to `ParsedTrace` format.

```typescript
import { parseTrace } from '@/lib/trace-parser'
import type { Trace } from '@/types/api'

const trace: Trace = await fetchTrace(traceId)
const parsed = parseTrace(trace, 1, {
  maxMessageLength: 200,
  includeMetadata: false,
})

console.log(parsed.header.status) // 'complete' | 'partial' | 'error'
console.log(parsed.lastExchange.human?.content)
console.log(parsed.toolCalls)
```

**Parameters:**
- `trace: Trace` - Raw trace from API
- `traceNumber: number` - Sequential number for display (e.g., "Trace #12")
- `config?: ParserConfig` - Optional configuration

**Returns:** `ParsedTrace`

---

### `parseTraces(traces, config?)`

Batch parse multiple traces at once.

```typescript
import { parseTraces } from '@/lib/trace-parser'

const traces = await fetchTraces()
const parsed = parseTraces(traces, { maxMessageLength: 150 })

parsed.forEach((p, i) => {
  console.log(`Trace ${i + 1}: ${p.header.status}`)
})
```

---

### `extractLastExchange(steps, config?)`

Extract the last human and assistant messages from trace steps.

```typescript
import { extractLastExchange } from '@/lib/trace-parser'

const exchange = extractLastExchange(trace.steps)
console.log(exchange.human?.content) // Last user message
console.log(exchange.assistant?.content) // Last AI response
```

---

### `extractToolCalls(steps)`

Extract all tool calls from trace steps.

```typescript
import { extractToolCalls } from '@/lib/trace-parser'

const tools = extractToolCalls(trace.steps)
tools.forEach(tool => {
  console.log(`${tool.module}.${tool.name}`)
  console.log(`Result: ${tool.result}`)
})
```

---

### `truncateMessage(text, maxLength)`

Truncate long messages at word boundaries.

```typescript
import { truncateMessage } from '@/lib/trace-parser'

const result = truncateMessage('Very long message...', 50)
console.log(result.content) // Truncated text with "..."
console.log(result.truncated) // true
console.log(result.fullContent) // Original text
```

---

## Helper Functions

### `formatRelativeTime(timestamp)`

Format timestamps as relative time strings.

```typescript
import { formatRelativeTime } from '@/lib/trace-parser'

formatRelativeTime('2025-11-13T12:00:00Z')
// Returns: "just now", "5m ago", "2h ago", "3d ago", or "Nov 13"
```

### `formatDuration(seconds)`

Format duration in human-readable format.

```typescript
import { formatDuration } from '@/lib/trace-parser'

formatDuration(0.123) // "123ms"
formatDuration(2.5) // "2.5s"
formatDuration(125) // "2m 5s"
```

### `getStatusEmoji(status)`

Get emoji for trace status.

```typescript
import { getStatusEmoji } from '@/lib/trace-parser'

getStatusEmoji('complete') // "🟢"
getStatusEmoji('partial') // "🟡"
getStatusEmoji('error') // "🔴"
```

### `validateTrace(trace)`

Validate trace data before parsing.

```typescript
import { validateTrace } from '@/lib/trace-parser'

if (validateTrace(data)) {
  const parsed = parseTrace(data, 1)
}
```

---

## Type Definitions

### `ParsedTrace`

```typescript
interface ParsedTrace {
  header: TraceHeader
  lastExchange: LastExchange
  toolCalls: ParsedToolCall[]
  previousSteps: PreviousStep[]
  raw: Trace // Original trace for reference
}
```

### `TraceHeader`

```typescript
interface TraceHeader {
  status: 'complete' | 'partial' | 'error'
  traceNumber: number
  timestamp: string
  stepCount: number
  duration?: number // in seconds
}
```

### `LastExchange`

```typescript
interface LastExchange {
  human?: TruncatedMessage
  assistant?: TruncatedMessage
}
```

### `TruncatedMessage`

```typescript
interface TruncatedMessage {
  content: string
  truncated: boolean
  fullContent?: string
}
```

### `ParsedToolCall`

```typescript
interface ParsedToolCall {
  name: string
  module?: string // e.g., "math_tools"
  arguments?: Record<string, any>
  result?: any
  error?: string
}
```

### `PreviousStep`

```typescript
interface PreviousStep {
  role: 'human' | 'assistant'
  content: string
  tools?: ParsedToolCall[]
  timestamp?: string
}
```

---

## Usage Examples

### Example 1: Card Component

```typescript
import { parseTrace, getStatusEmoji, formatRelativeTime } from '@/lib/trace-parser'
import type { Trace } from '@/types/api'

function TraceCard({ trace, index }: { trace: Trace; index: number }) {
  const parsed = parseTrace(trace, index)
  const { header, lastExchange, toolCalls } = parsed

  return (
    <div className="card">
      <div className="header">
        <span>{getStatusEmoji(header.status)}</span>
        <span>Trace #{header.traceNumber}</span>
        <span>{formatRelativeTime(header.timestamp)}</span>
      </div>

      {lastExchange.human && (
        <div className="message">
          <strong>Human:</strong> {lastExchange.human.content}
        </div>
      )}

      {lastExchange.assistant && (
        <div className="message">
          <strong>Assistant:</strong> {lastExchange.assistant.content}
        </div>
      )}

      {toolCalls.length > 0 && (
        <div className="tools">
          {toolCalls.map((tool, i) => (
            <div key={i}>
              Used tool: {tool.module ? `${tool.module}.` : ''}{tool.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

### Example 2: Fetch and Parse

```typescript
import { apiClient } from '@/lib/api-client'
import { parseTraces } from '@/lib/trace-parser'

async function loadTraces(evalSetId: string) {
  const response = await apiClient.listTraces({
    eval_set_id: evalSetId,
    limit: 50,
  })

  // Parse all traces at once
  const parsed = parseTraces(response.traces)

  return parsed
}
```

### Example 3: Filter by Status

```typescript
import { parseTraces } from '@/lib/trace-parser'

const parsed = parseTraces(traces)

// Get only error traces
const errors = parsed.filter(p => p.header.status === 'error')

// Get traces with messages
const withMessages = parsed.filter(
  p => p.lastExchange.human || p.lastExchange.assistant
)

// Get traces with tool calls
const withTools = parsed.filter(p => p.toolCalls.length > 0)
```

---

## Edge Cases Handled

### Empty Traces

Traces with no steps or empty messages are handled gracefully:

```typescript
const trace = {
  id: 'trc_123',
  steps: [], // Empty steps
}

const parsed = parseTrace(trace, 1)
// parsed.lastExchange = {}
// parsed.toolCalls = []
// parsed.header.status = 'partial'
```

### Missing Fields

Missing optional fields are handled:

```typescript
const step = {
  step_id: '1',
  messages_added: null, // null instead of array
  tool_calls: undefined, // undefined instead of array
}

// Parser treats these as empty arrays
```

### Malformed Messages

Non-string message content is converted to JSON:

```typescript
const message = {
  role: 'user',
  content: { complex: 'object' }, // Object instead of string
}

// Parser converts to: '{"complex":"object"}'
```

### Timestamp Issues

Missing timestamps are handled:

```typescript
// Duration calculation only happens if timestamps are valid
const parsed = parseTrace(trace, 1)
console.log(parsed.header.duration) // undefined if no valid timestamps
```

---

## Testing

### Run Unit Tests

```bash
# Run all tests
npm test frontend/lib/__tests__/trace-parser.test.ts

# Run with coverage
npm test -- --coverage frontend/lib/__tests__/trace-parser.test.ts
```

### Run Manual Tests

```bash
# Test with sample data
npx tsx frontend/scripts/test-trace-parser.ts

# Test with real API data
npx tsx frontend/scripts/test-with-api.ts
```

---

## Configuration

### Parser Config

```typescript
interface ParserConfig {
  maxMessageLength: number // Default: 200
  includeMetadata: boolean // Default: false
}

// Usage:
const parsed = parseTrace(trace, 1, {
  maxMessageLength: 150, // Truncate at 150 chars
  includeMetadata: true, // Include metadata in parsed result
})
```

---

## Performance Considerations

1. **Batch Parsing**: Use `parseTraces()` instead of multiple `parseTrace()` calls
2. **Memoization**: Consider memoizing parsed results in components
3. **Lazy Loading**: Parse traces on-demand as they're displayed
4. **Truncation**: Default 200-char limit keeps memory usage low

---

## Known Limitations

1. **Multi-turn conversations**: Parser focuses on last exchange. For full conversation history, use `previousSteps`.
2. **Complex tool results**: Large tool results are not automatically truncated.
3. **Metadata**: Trace metadata is not parsed by default (set `includeMetadata: true`).

---

## Future Enhancements

- [ ] Support for streaming/partial traces
- [ ] More sophisticated message extraction (e.g., find most important exchange)
- [ ] Tool result truncation
- [ ] Metadata parsing and display
- [ ] Support for conversation threads
- [ ] Custom truncation strategies

---

## Support

For issues or questions:
1. Check the unit tests for usage examples
2. Run manual test scripts to verify API integration
3. Review type definitions in `types/trace.ts`
4. Consult `docs/UI_UX_SPECIFICATION.md` for UI requirements
