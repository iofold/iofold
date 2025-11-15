# Trace Review Components - Quick Reference

## Component Tree

```
<TraceCard>
  │
  ├─ <TraceHeader>
  │   └─ Status, Number, Timestamp, Stats
  │
  ├─ <div className="scrollable-content">
  │   │
  │   ├─ <MessageDisplay>
  │   │   ├─ Human message (blue)
  │   │   └─ AI message (purple)
  │   │
  │   ├─ <ToolCallsList>
  │   │   └─ Tool calls (expandable)
  │   │
  │   ├─ [Expand Button]
  │   │
  │   └─ <PreviousSteps> (conditional)
  │       └─ Message history
  │
  └─ <ActionBar>
      ├─ Positive button
      ├─ Neutral button
      ├─ Negative button
      └─ Skip button
```

## Import Paths

```typescript
// Main component
import { TraceCard } from '@/components/trace-review'

// Individual components (if needed)
import {
  TraceHeader,
  MessageDisplay,
  ToolCallsList,
  ActionBar,
  PreviousSteps
} from '@/components/trace-review'

// Example component
import { TraceCardExample } from '@/components/trace-review/TraceCardExample'

// Parser utilities (from Worker 1)
import { parseTrace } from '@/lib/trace-parser'
```

## Quick Start

### 1. Basic Usage
```tsx
import { TraceCard } from '@/components/trace-review'
import { parseTrace } from '@/lib/trace-parser'

function MyPage() {
  const parsedTrace = parseTrace(rawTrace, traceNumber)

  return (
    <TraceCard
      trace={parsedTrace}
      onFeedback={(rating) => console.log(rating)}
    />
  )
}
```

### 2. Full Integration
```tsx
'use client'

import { useState } from 'react'
import { TraceCard } from '@/components/trace-review'
import { parseTraces } from '@/lib/trace-parser'

export default function TraceReviewPage() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [traces, setTraces] = useState([])

  // Fetch and parse traces
  useEffect(() => {
    fetch('/api/traces')
      .then(res => res.json())
      .then(data => setTraces(parseTraces(data.traces)))
  }, [])

  const currentTrace = traces[currentIndex]

  const handleFeedback = async (rating) => {
    await fetch('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({
        trace_id: currentTrace.raw.trace_id,
        rating
      })
    })
    setCurrentIndex(currentIndex + 1)
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <TraceCard
        trace={currentTrace}
        onFeedback={handleFeedback}
        onNext={() => setCurrentIndex(currentIndex + 1)}
        onPrevious={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
        onSkip={() => setCurrentIndex(currentIndex + 1)}
      />
    </div>
  )
}
```

### 3. With React Query
```tsx
import { useQuery, useMutation } from '@tanstack/react-query'
import { TraceCard } from '@/components/trace-review'
import { parseTraces } from '@/lib/trace-parser'
import { apiClient } from '@/lib/api-client'

export default function TraceReviewPage() {
  const [currentIndex, setCurrentIndex] = useState(0)

  const { data } = useQuery({
    queryKey: ['traces', 'unfeedback'],
    queryFn: () => apiClient.listTraces({ has_feedback: false })
  })

  const submitFeedback = useMutation({
    mutationFn: (params) => apiClient.submitFeedback(params),
    onSuccess: () => setCurrentIndex(currentIndex + 1)
  })

  const traces = data?.traces ? parseTraces(data.traces) : []
  const currentTrace = traces[currentIndex]

  return (
    <TraceCard
      trace={currentTrace}
      onFeedback={(rating) => submitFeedback.mutate({
        trace_id: currentTrace.raw.trace_id,
        rating
      })}
    />
  )
}
```

## Props Reference

### TraceCard
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `trace` | `ParsedTrace` | ✅ | Parsed trace from Worker 1 |
| `onFeedback` | `(rating) => void` | ✅ | Feedback callback |
| `onNext` | `() => void` | ❌ | Navigate to next trace |
| `onPrevious` | `() => void` | ❌ | Navigate to previous trace |
| `onSkip` | `() => void` | ❌ | Skip without feedback |

### TraceHeader
| Prop | Type | Required |
|------|------|----------|
| `header` | `TraceHeader` | ✅ |

### MessageDisplay
| Prop | Type | Required |
|------|------|----------|
| `lastExchange` | `LastExchange` | ✅ |
| `onExpand` | `() => void` | ❌ |

### ToolCallsList
| Prop | Type | Required |
|------|------|----------|
| `toolCalls` | `ParsedToolCall[]` | ✅ |

### ActionBar
| Prop | Type | Required |
|------|------|----------|
| `onFeedback` | `(rating) => void` | ✅ |
| `onSkip` | `() => void` | ❌ |

### PreviousSteps
| Prop | Type | Required |
|------|------|----------|
| `steps` | `PreviousStep[]` | ✅ |

## Keyboard Shortcuts

| Key | Action | Handler |
|-----|--------|---------|
| `1` | Positive feedback | `onFeedback('positive')` |
| `2` | Neutral feedback | `onFeedback('neutral')` |
| `3` | Negative feedback | `onFeedback('negative')` |
| `Space` | Skip | `onSkip()` or `onNext()` |
| `→` | Next trace | `onNext()` |
| `←` | Previous trace | `onPrevious()` |
| `E` | Expand/collapse | Internal state toggle |

## Swipe Gestures

| Gesture | Threshold | Action | Visual Feedback |
|---------|-----------|--------|-----------------|
| Drag right | >100px | Positive feedback | Green glow + 15° rotation |
| Drag left | >100px | Negative feedback | Red glow - 15° rotation |
| Drag down | >100px | Neutral feedback | Gray glow |
| Velocity | >500px/s | Trigger action | Same as threshold |

## Color Scheme

```css
/* Feedback Colors */
--positive: #22c55e (green-500)
--neutral: #64748b (slate-500)
--negative: #ef4444 (red-500)

/* Message Colors */
--human: #3b82f6 (blue-500)
--assistant: #a855f7 (purple-500)

/* Status Colors */
--complete: 🟢 (green)
--partial: 🟡 (yellow)
--error: 🔴 (red)

/* Backgrounds */
--card: #ffffff (white)
--section: #f9fafb (gray-50)
--border: #e5e7eb (gray-200)
```

## Responsive Breakpoints

```css
/* Mobile */
@media (max-width: 639px) {
  .trace-card { width: 90vw }
  .action-buttons { display: block }
}

/* Tablet */
@media (min-width: 640px) and (max-width: 1023px) {
  .trace-card { width: 80vw }
}

/* Desktop */
@media (min-width: 1024px) {
  .trace-card { width: 600px }
  .action-buttons { display: flex }
}
```

## Animation Timings

```typescript
// Card animations
enter: { duration: 300ms, ease: 'easeOut' }
exit: { duration: 200ms, ease: 'easeIn' }

// Drag animations
dragElastic: 0.7
dragConstraints: { left: 0, right: 0, top: 0, bottom: 0 }

// Transforms
rotateZ: [-15deg, 0, 15deg]
opacity: [0.5, 1, 1, 1, 0.5]
```

## Example Data Structure

```typescript
const sampleTrace: ParsedTrace = {
  header: {
    status: 'complete',
    traceNumber: 1,
    timestamp: '2025-11-14T06:00:00Z',
    stepCount: 5,
    duration: 2.3
  },
  lastExchange: {
    human: {
      content: 'Calculate 2+2',
      truncated: false
    },
    assistant: {
      content: 'The answer is 4',
      truncated: false
    }
  },
  toolCalls: [
    {
      name: 'calculate',
      module: 'math_tools',
      result: 4
    }
  ],
  previousSteps: [],
  raw: { /* original trace */ }
}
```

## Common Patterns

### Adding Toast Notifications
```tsx
import { toast } from 'sonner'

const handleFeedback = async (rating) => {
  try {
    await submitFeedback(rating)
    toast.success(`Marked as ${rating}`)
  } catch (error) {
    toast.error('Failed to submit feedback')
  }
}
```

### Progress Tracking
```tsx
const [feedbackCount, setFeedbackCount] = useState(0)

const handleFeedback = async (rating) => {
  await submitFeedback(rating)
  setFeedbackCount(prev => prev + 1)
}

// Show progress
<div>Progress: {feedbackCount} / {totalTraces}</div>
```

### Empty State
```tsx
if (!currentTrace) {
  return (
    <div className="text-center">
      <h2>All caught up!</h2>
      <p>You've reviewed all traces</p>
    </div>
  )
}
```

### Loading State
```tsx
if (isLoading) {
  return <div>Loading traces...</div>
}

if (error) {
  return <div>Error: {error.message}</div>
}

return <TraceCard trace={currentTrace} ... />
```

## Testing

### Unit Test Example
```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { TraceCard } from '@/components/trace-review'

test('handles keyboard shortcuts', () => {
  const onFeedback = jest.fn()
  render(<TraceCard trace={mockTrace} onFeedback={onFeedback} />)

  fireEvent.keyDown(window, { key: '1' })
  expect(onFeedback).toHaveBeenCalledWith('positive')
})
```

### Integration Test
```typescript
test('swipe gesture triggers feedback', async () => {
  const onFeedback = jest.fn()
  render(<TraceCard trace={mockTrace} onFeedback={onFeedback} />)

  const card = screen.getByRole('region')
  fireEvent.dragEnd(card, { offset: { x: 150, y: 0 } })

  expect(onFeedback).toHaveBeenCalledWith('positive')
})
```

## Troubleshooting

### Issue: Keyboard shortcuts not working
**Solution**: Check if input fields have focus. Shortcuts are disabled when typing.

### Issue: Swipe not triggering
**Solution**: Ensure drag distance exceeds 100px or velocity exceeds 500px/s.

### Issue: Components not rendering
**Solution**: Verify trace is parsed with `parseTrace()` from Worker 1.

### Issue: TypeScript errors
**Solution**: Ensure `@/types/trace` is imported and types match ParsedTrace interface.

## File Locations

```
frontend/
├── components/
│   └── trace-review/
│       ├── TraceCard.tsx           # Main component
│       ├── TraceHeader.tsx         # Header
│       ├── MessageDisplay.tsx      # Messages
│       ├── ToolCallsList.tsx       # Tools
│       ├── ActionBar.tsx           # Actions
│       ├── PreviousSteps.tsx       # History
│       ├── TraceCardExample.tsx    # Example
│       ├── index.ts                # Exports
│       ├── README.md               # Full docs
│       ├── IMPLEMENTATION_REPORT.md # Implementation
│       └── COMPONENT_GUIDE.md      # This file
│
├── lib/
│   └── trace-parser.ts             # Worker 1's parser
│
└── types/
    └── trace.ts                    # Type definitions
```

## Next Steps

1. ✅ Install framer-motion
2. ✅ Create all components
3. ⬜ Integrate with trace review page
4. ⬜ Connect to API client
5. ⬜ Add toast notifications
6. ⬜ Add progress tracking
7. ⬜ Deploy and test

---

**Quick Links:**
- [Full Documentation](./README.md)
- [Implementation Report](./IMPLEMENTATION_REPORT.md)
- [UI/UX Specification](/docs/UI_UX_SPECIFICATION.md)
