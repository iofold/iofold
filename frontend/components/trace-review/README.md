# Trace Review Card Components

Card-swiping UI components for rapid trace review and feedback collection.

## Components

### TraceCard (Main Component)

The primary card component that orchestrates all sub-components and handles interactions.

**Features:**
- Drag/swipe gestures for feedback (left: negative, right: positive, down: neutral)
- Keyboard shortcuts (1/2/3 for feedback, arrows for navigation, E to expand)
- Smooth animations with framer-motion
- Expandable previous messages
- Mobile-first responsive design

**Props:**
```typescript
interface TraceCardProps {
  trace: ParsedTrace
  onFeedback: (rating: 'positive' | 'neutral' | 'negative') => void
  onNext?: () => void
  onPrevious?: () => void
  onSkip?: () => void
}
```

**Usage:**
```tsx
import { TraceCard } from '@/components/trace-review'
import { parseTrace } from '@/lib/trace-parser'

function TraceReviewPage() {
  const trace = parseTrace(rawTrace)

  return (
    <TraceCard
      trace={trace}
      onFeedback={(rating) => console.log('Feedback:', rating)}
      onNext={() => console.log('Next')}
      onPrevious={() => console.log('Previous')}
      onSkip={() => console.log('Skip')}
    />
  )
}
```

### TraceHeader

Displays trace metadata at the top of the card.

**Shows:**
- Status emoji (🟢 complete, 🟡 partial, 🔴 error)
- Trace number
- Relative timestamp (e.g., "30m ago", "Nov 13")
- Step count
- Duration (if available)

**Props:**
```typescript
interface TraceHeaderProps {
  header: TraceHeader
}
```

### MessageDisplay

Shows the last human and AI messages with truncation support.

**Features:**
- Color-coded messages (blue for human, purple for AI)
- "Show more/less" for truncated messages
- Empty state handling
- Accessible role labels

**Props:**
```typescript
interface MessageDisplayProps {
  lastExchange: LastExchange
  onExpand?: () => void
}
```

### ToolCallsList

Displays tool calls with expand/collapse for details.

**Features:**
- Compact tool call display
- Error highlighting (red)
- Success result display (green)
- Expandable arguments and full results
- JSON formatting for complex objects

**Props:**
```typescript
interface ToolCallsListProps {
  toolCalls: ParsedToolCall[]
}
```

### ActionBar

Feedback buttons and keyboard shortcut hints.

**Features:**
- Three feedback buttons (positive, neutral, negative)
- Skip button
- Keyboard shortcut hints
- Swipe gesture instructions
- Full-width buttons on mobile, inline on desktop

**Props:**
```typescript
interface ActionBarProps {
  onFeedback: (rating: 'positive' | 'neutral' | 'negative') => void
  onSkip?: () => void
}
```

### PreviousSteps

Expandable section showing previous conversation messages.

**Features:**
- Chronological message history
- Tool calls associated with messages
- Color-coded by role
- Scrollable with max-height
- Relative timestamps

**Props:**
```typescript
interface PreviousStepsProps {
  steps: PreviousStep[]
}
```

## Keyboard Shortcuts

| Key | Action | Description |
|-----|--------|-------------|
| `1` | Positive feedback | Mark trace as positive |
| `2` | Neutral feedback | Mark trace as neutral |
| `3` | Negative feedback | Mark trace as negative |
| `Space` | Skip | Skip to next trace without feedback |
| `→` | Next | Navigate to next trace |
| `←` | Previous | Navigate to previous trace |
| `E` | Expand/Collapse | Toggle previous messages view |

## Swipe Gestures

### Desktop (Mouse Drag)
- **Drag right** (>100px): Positive feedback (green glow)
- **Drag left** (>100px): Negative feedback (red glow)
- **Drag down** (>100px): Neutral feedback (gray glow)

### Mobile (Touch Swipe)
- **Swipe right**: Positive feedback
- **Swipe left**: Negative feedback
- **Swipe down**: Neutral feedback
- **Swipe up**: Skip (if implemented)

## Styling

All components use Tailwind CSS with these color schemes:

- **Positive**: Green (green-500, green-600)
- **Neutral**: Gray (gray-500, gray-600)
- **Negative**: Red (red-500, red-600)
- **Human messages**: Blue (blue-50, blue-500, blue-700)
- **AI messages**: Purple (purple-50, purple-500, purple-700)
- **Tool calls**: Gray background (gray-50)
- **Status complete**: Green (🟢)
- **Status partial**: Yellow (🟡)
- **Status error**: Red (🔴)

## Responsive Design

### Mobile (<640px)
- Full-width card (90vw)
- Stacked buttons
- Larger touch targets
- Simplified layout

### Tablet (640-1024px)
- 80vw card width
- Inline buttons

### Desktop (1024px+)
- Fixed 600px card width
- Hover effects
- Drag gestures enabled

## Accessibility

- **ARIA labels** on all interactive elements
- **Keyboard navigation** fully supported
- **Screen reader** instructions included
- **Focus indicators** visible on all buttons
- **Color contrast** meets WCAG AA standards
- **Role attributes** for semantic meaning

## Animation Specs

Using framer-motion:

- **Card enter**: Fade in + scale up + slide up (300ms)
- **Card exit**: Fade out + scale down + slide down (200ms)
- **Drag rotation**: Up to ±15 degrees based on drag distance
- **Swipe feedback**: Color glow based on direction
- **Smooth transitions**: Cubic bezier easing

## Testing

Use the example component to test:

```tsx
import { TraceCardExample } from '@/components/trace-review/TraceCardExample'

// In your page
<TraceCardExample />
```

The example includes:
1. Complete trace with successful tool call
2. Error trace with failed API call
3. Long message trace with truncation

## Dependencies

- `framer-motion`: For drag gestures and animations
- `react`: ^18.0.0
- `@/lib/trace-parser`: For parsing raw traces
- `@/types/trace`: For TypeScript types

## Integration Example

Full page integration:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TraceCard } from '@/components/trace-review'
import { parseTraces } from '@/lib/trace-parser'
import { apiClient } from '@/lib/api-client'

export default function TraceReviewPage() {
  const [currentIndex, setCurrentIndex] = useState(0)

  // Fetch traces without feedback
  const { data } = useQuery({
    queryKey: ['traces', 'unfeedback'],
    queryFn: () => apiClient.listTraces({ has_feedback: false, limit: 50 })
  })

  const traces = data?.traces ? parseTraces(data.traces) : []
  const currentTrace = traces[currentIndex]

  const handleFeedback = async (rating: 'positive' | 'neutral' | 'negative') => {
    await apiClient.submitFeedback({
      trace_id: currentTrace.raw.trace_id,
      rating,
      eval_set_id: 'your-eval-set-id'
    })

    // Move to next
    if (currentIndex < traces.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
  }

  if (!currentTrace) {
    return <div>No traces to review</div>
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center">
          Trace Review ({currentIndex + 1}/{traces.length})
        </h1>

        <TraceCard
          trace={currentTrace}
          onFeedback={handleFeedback}
          onNext={() => setCurrentIndex(Math.min(currentIndex + 1, traces.length - 1))}
          onPrevious={() => setCurrentIndex(Math.max(currentIndex - 1, 0))}
          onSkip={() => setCurrentIndex(Math.min(currentIndex + 1, traces.length - 1))}
        />
      </div>
    </div>
  )
}
```

## Performance

- **Lazy loading**: Only render visible card
- **Memoization**: Sub-components use React.memo where appropriate
- **Virtual scrolling**: For long previous steps list
- **Optimized animations**: GPU-accelerated transforms

## Future Enhancements

- [ ] Undo last feedback
- [ ] Batch feedback submission
- [ ] Custom swipe thresholds
- [ ] Haptic feedback on mobile
- [ ] Voice commands
- [ ] Multi-card stack preview
- [ ] Swipe progress indicator
- [ ] Gesture customization
