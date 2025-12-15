# Daily Review Screen Redesign

## Overview

Redesign the daily review screen to provide a conversation-first experience with detailed trace exploration. The new layout replaces the current two-column input/output view with a split-pane design: conversation thread on the left, trace detail tree on the right.

## Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  Header: Progress (5/20) │ Feedback Summary │ Auto │ Time      │
├────────────────────────────┬────────────────────────────────────┤
│                            │                                    │
│   CONVERSATION THREAD      │      TRACE DETAIL TREE             │
│   (Left Pane - 5 cols)     │      (Right Pane - 7 cols)         │
│                            │                                    │
│   [Scrollable, auto-end]   │   [Observation tree/timeline]      │
│                            │                                    │
│   👤 User message          │   ▼ Root Span                      │
│   🤖 Assistant response    │     ▼ Generation (purple)          │
│      └─ Tool calls         │     ▼ Tool Call (orange) ← sel     │
│                            │       • Arguments                  │
│                            │       • Result                     │
│                            │                                    │
├────────────────────────────┴────────────────────────────────────┤
│  [Notes field]              [👎 Bad] [😐 Okay] [👍 Good]         │
└─────────────────────────────────────────────────────────────────┘
```

**Dimensions:**
- Left pane: 5 columns (~40%)
- Right pane: 7 columns (~60%)
- Fixed height content area (~700px)
- Sticky header with progress/controls
- Sticky footer with feedback actions

## Left Pane: Conversation Thread

### Visual Styling (MessageDisplay pattern)

Each message block:
- **4px left border**: Blue (`border-blue-500`) for user, purple (`border-purple-500`) for assistant
- **Subtle background**: `bg-blue-50` for user, `bg-purple-50` for assistant
- **Role indicator**: Emoji + label ("👤 User" or "🤖 Assistant")
- **Content**: `whitespace-pre-wrap` to preserve formatting
- **Clickable**: Cursor pointer, hover highlight

### Tool Calls (Grouped Under Assistant Messages)

```
🤖 Assistant
┌─────────────────────────────────────────┐
│ Here's what I found...                  │
│                                         │
│ ▼ Tool Calls (3)                        │
│   ┌─ search_emails ✓ ──────────────┐    │
│   │  query: "meeting notes"        │    │
│   └────────────────────────────────┘    │
│   ┌─ get_calendar ✓ ───────────────┐    │
│   └────────────────────────────────┘    │
│   ┌─ send_email ✗ ─────────────────┐    │
│   │  error badge if failed         │    │
│   └────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

Tool call cards:
- Compact: tool name + status badge (✓ green / ✗ red)
- Clickable - scrolls + highlights in right pane tree
- Show truncated first argument as preview
- Collapsed by default, "▼ Tool Calls (n)" header to expand

### Scroll Behavior

- Auto-scroll to bottom on load (most recent messages visible)
- Smooth scroll animation
- User can scroll up freely to see earlier messages

## Right Pane: Trace Detail Tree

### Default View (Observation Tree)

Reuse existing pattern from `traces/[id]/page.tsx`:
- Hierarchical tree with expand/collapse
- Depth-based indentation (20px per level)
- Color-coded icons by type:
  - Generation = purple (`text-purple-500`)
  - Tool = orange (`text-orange-500`)
  - Span = blue (`text-blue-500`)
  - Event = green (`text-green-500`)

### Node Display

```
▼ 🟣 generate_response          1,234ms    512 tokens
    ▼ 🟠 search_emails            89ms
        • Arguments: { query: "..." }
        • Result: [3 items]
    ▼ 🟠 get_calendar             45ms
```

Each node shows:
- Type icon (color-coded)
- Name
- Duration (ms)
- Token count (for generations)

### Expanded Node Detail

When selected/expanded:
- **Timing**: Start time, duration
- **Token usage** (for generations): Prompt/Completion/Total
- **Arguments**: JSON pretty-printed in monospace
- **Result/Output**: JSON formatted, truncated with expand option
- **Error**: Red banner if present

### Selection Highlight

- `ring-2 ring-primary` border
- `bg-primary/10` background
- Persists until different selection or next trace

## Cross-Pane Interaction

### Click Handling from Left Pane

1. **Clicking a user message:**
   - Find the next assistant generation in the observation tree
   - Scroll right pane to that generation node
   - Highlight the node

2. **Clicking an assistant message:**
   - Find the corresponding generation span (match by output content or timing)
   - Scroll + highlight in right pane

3. **Clicking a tool call:**
   - Find exact tool call node in observation tree by name + timing
   - Scroll + highlight
   - Auto-expand to show arguments/result

### Visual Feedback

- Brief pulse animation on the left pane item clicked
- Smooth scroll (300ms) in right pane
- Highlight ring fades in on target node

### Selection State

- Track `selectedNodeId` in component state
- Both panes can update selection
- Clicking in right pane tree also works (direct exploration)
- Clear selection when moving to next trace

### Keyboard Support

Preserve existing:
- `1/2/3` - Submit feedback (Bad/Okay/Good)
- `A` - Toggle auto mode
- `←/→` - Navigate traces

New:
- `Tab` - Move focus between panes

## Footer Bar

```
┌─────────────────────────────────────────────────────────────────┐
│ [Notes input (optional)..................] [👎 Bad][😐 Okay][👍 Good] │
│  Keyboard: 1=Bad, 2=Okay, 3=Good, A=Auto                        │
└─────────────────────────────────────────────────────────────────┘
```

- Notes textarea: single line, expands on focus, max 500 chars
- Feedback buttons: destructive/warning/success variants
- Keyboard hints in muted text
- Sticky at bottom with `border-t` separator

## Data Requirements

### Existing API (sufficient)

- `getTrace(id)` returns full trace with observations and steps
- `convertStepsToObservations()` utility for tree building
- `extractLastExchange()` and parsing utilities in `trace-parser.ts`

### New Data Extraction

- Full message history (not just last exchange) - iterate all steps
- Map messages to their corresponding observation nodes (for click-to-scroll)
- Build lookup: `messageIndex → observationId`

## Component Structure

### Files to Modify

- `frontend/app/(main)/review/page.tsx` - Main refactor

### New Components to Extract

- `ConversationThread.tsx` - Left pane conversation display
- `TraceExplorer.tsx` - Right pane wrapper around observation tree

### Reusable Components

- `ObservationTreeNode` pattern from `traces/[id]/page.tsx`
- `MessageDisplay` styling from `trace-review/`
- `ToolCallsList` compact variant
- Existing trace parsing utilities from `lib/trace-parser.ts`

## Implementation Notes

1. Start by extracting the observation tree logic from trace details page into reusable component
2. Build ConversationThread component with message extraction from steps
3. Implement selection state and cross-pane scroll behavior
4. Wire up existing feedback mutation and progress tracking
5. Test with real traces to ensure observation mapping works correctly
