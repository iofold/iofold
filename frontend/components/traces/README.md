# Trace Visualization Components

This directory contains components for visualizing trace execution flows.

## Components

### TraceTimeline

A horizontal waterfall timeline visualization showing spans positioned by time and duration.

**Features:**
- Horizontal timeline with adaptive time markers (μs, ms, s, min)
- Spans positioned by `startTime` and sized by `duration`
- Nested spans indented by `level`
- Color-coded by type (generation, span, tool, agent, event, retriever)
- Error visualization (red border/background)
- Selected span highlighting
- Hover tooltips with span details
- Zoom controls (1x-10x)
- Horizontal scrolling for zoomed views

**Usage:**
```tsx
import { TraceTimeline } from '@/components/traces/trace-timeline'

const spans = [
  {
    id: "span-1",
    name: "Agent Execution",
    type: "agent",
    startTime: 0,
    duration: 1500,
    status: "success",
    level: 0,
  },
  // ... more spans
]

<TraceTimeline
  spans={spans}
  totalDuration={1500}
  selectedSpanId={selectedId}
  onSpanClick={setSelectedId}
/>
```

### SpanTree

A hierarchical tree view showing spans with collapsible nodes.

**Features:**
- Collapsible/expandable nodes
- Type-specific icons
- Duration shown inline
- Status indicators (success/error/running)
- Click to select
- Expand/Collapse all button
- Visual nesting with indentation

**Usage:**
```tsx
import { SpanTree } from '@/components/traces/span-tree'

const treeData = [
  {
    id: "span-1",
    name: "Agent Execution",
    type: "agent",
    startTime: 0,
    duration: 1500,
    status: "success",
    children: [
      {
        id: "span-2",
        name: "LLM Generation",
        type: "generation",
        startTime: 100,
        duration: 800,
        status: "success",
      },
    ],
  },
]

<SpanTree
  spans={treeData}
  selectedSpanId={selectedId}
  onSpanClick={setSelectedId}
/>
```

## Data Structures

### Span (for Timeline)

```typescript
interface Span {
  id: string
  name: string
  type: 'span' | 'generation' | 'event' | 'tool' | 'agent' | 'retriever'
  startTime: number // ms from trace start
  duration: number // ms
  parentId?: string
  status: 'success' | 'error' | 'running'
  level: number // nesting level (0 = root)
}
```

### SpanTreeNode (for Tree)

```typescript
interface SpanTreeNode {
  id: string
  name: string
  type: 'span' | 'generation' | 'event' | 'tool' | 'agent' | 'retriever'
  startTime: number
  duration: number
  status: 'success' | 'error' | 'running'
  children?: SpanTreeNode[]
}
```

## Converting Flat to Tree

See `trace-visualizations-example.tsx` for a `buildSpanTree()` utility that converts flat spans with `parentId` to hierarchical tree structure.

## Color Scheme

- **Generation**: Blue (#3B82F6)
- **Span**: Gray (#6B7280)
- **Tool**: Purple (#A855F7)
- **Agent**: Green (#10B981)
- **Event**: Orange (#F97316)
- **Retriever**: Cyan (#06B6D4)

## Dependencies

- `@radix-ui/react-tooltip` - Tooltips
- `lucide-react` - Icons
- `tailwindcss` - Styling
- Existing UI components: `Button`, `Tooltip`

## Integration Example

See `trace-visualizations-example.tsx` for a complete example showing both components with synchronized selection state.
