# Trace Parser Quick Reference

## Import

```typescript
import { parseTrace, parseTraces, getStatusEmoji, formatRelativeTime, formatDuration } from '@/lib/trace-parser'
import type { ParsedTrace } from '@/types/trace'
import type { Trace } from '@/types/api'
```

## Parse Single Trace

```typescript
const parsed = parseTrace(trace, 1)
```

Returns:
```typescript
{
  header: {
    status: 'complete' | 'partial' | 'error'
    traceNumber: 1
    timestamp: "2025-11-13T12:00:00Z"
    stepCount: 7
    duration?: 2.5  // seconds
  }
  lastExchange: {
    human?: { content: string, truncated: boolean }
    assistant?: { content: string, truncated: boolean }
  }
  toolCalls: [
    { name: 'calculate', module: 'math_tools', result: 42 }
  ]
  previousSteps: [
    { role: 'human', content: '...', tools: [...] }
  ]
  raw: { /* original trace */ }
}
```

## Parse Multiple Traces

```typescript
const parsed = parseTraces(traces)
// Returns array of ParsedTrace
```

## Helper Functions

```typescript
// Status emoji
getStatusEmoji('complete')  // 🟢
getStatusEmoji('error')     // 🔴
getStatusEmoji('partial')   // 🟡

// Relative time
formatRelativeTime('2025-11-13T12:00:00Z')  // "5m ago", "2h ago", "3d ago"

// Duration
formatDuration(0.123)  // "123ms"
formatDuration(2.5)    // "2.5s"
formatDuration(125)    // "2m 5s"
```

## Component Example

```typescript
function TraceCard({ trace, index }) {
  const parsed = parseTrace(trace, index)

  return (
    <div>
      <div className="header">
        {getStatusEmoji(parsed.header.status)}
        Trace #{parsed.header.traceNumber}
        {formatRelativeTime(parsed.header.timestamp)}
      </div>

      {parsed.lastExchange.human && (
        <div>Human: {parsed.lastExchange.human.content}</div>
      )}

      {parsed.lastExchange.assistant && (
        <div>AI: {parsed.lastExchange.assistant.content}</div>
      )}

      {parsed.toolCalls.map(tool => (
        <div key={tool.name}>
          Tool: {tool.module}.{tool.name}
        </div>
      ))}
    </div>
  )
}
```

## Configuration

```typescript
parseTrace(trace, 1, {
  maxMessageLength: 150,  // Default: 200
  includeMetadata: true,  // Default: false
})
```

## Full Documentation

See: `/home/ygupta/workspace/iofold/frontend/lib/TRACE_PARSER_README.md`
