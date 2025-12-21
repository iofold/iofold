# Evals Page Rework Design

**Date:** 2025-12-02
**Status:** Approved

## Overview

Rework the evals page to focus on eval function management with a table view, side sheet details, and a dedicated playground for iterating on eval code. Move analytics/charts to a separate page.

## Decisions Made

| Decision | Choice |
|----------|--------|
| Primary intent | Browse & manage eval functions |
| Matrix relationship | Keep separate, with links |
| Eval playground style | Side-by-side comparison (code + traces + results) |
| Charts/analytics | Move to `/analytics` |
| Eval list display | Table with right side sheet |
| Playground location | Separate route `/evals/[id]/playground` |

## Routes

```
/evals                      → Eval list (table + agent filter + search)
/evals?selected={id}        → List with side sheet open for that eval
/evals/[id]/playground      → Full-page playground for debugging
/analytics                  → Charts, trends, KPIs (moved from current /evals)
/matrix/[agent_id]          → Unchanged, linked from evals
```

**Navigation changes:**
- "Evals" nav item points to the new list view
- Add "Analytics" to nav (new page)
- Matrix stays where it is

## Evals List Page (`/evals`)

### Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ Header: "Evals" + [Generate Eval] button                            │
├─────────────────────────────────────────────────────────────────────┤
│ Filters: [Agent ▾] [Status ▾] [Search...]           [Refresh]      │
├────────────────────────────────────────┬────────────────────────────┤
│                                        │                            │
│  Table                                 │  Side Sheet (when open)    │
│  ────────────────────────────          │  ────────────────────────  │
│  Name | Agent | Accuracy | Execs |     │  Eval Name                 │
│  ──────────────────────────────        │  Agent: agent-name         │
│  quality_check  | Support | 87% | 234  │  Status: active            │
│  > latency_eval | Sales   | 92% | 156  │                            │
│  tone_checker   | Support | 78% | 89   │  [Tabs: Details|Executions]│
│                                        │                            │
│                                        │  Description: ...          │
│                                        │  Accuracy: 87%             │
│                                        │  Contradictions: 12        │
│                                        │                            │
│                                        │  [Playground] [Matrix]     │
│                                        │  [Execute] [Delete]        │
└────────────────────────────────────────┴────────────────────────────┘
```

### Table Columns

| Column | Description |
|--------|-------------|
| Name | Clickable, opens side sheet |
| Agent | Badge/tag, filterable |
| Accuracy | % with color (green >80%, yellow 60-80%, red <60%) |
| Executions | Count |
| Contradictions | Count, red if >0 |
| Last Run | Relative time |

### Side Sheet Tabs

- **Details**: Description, code preview (read-only), model used, created date
- **Executions**: Recent execution results (trace ID, pass/fail, reason, time)

### Side Sheet Actions

- "Open in Playground" → `/evals/[id]/playground`
- "View in Matrix" → `/matrix/[agent_id]?eval_ids=[id]`
- "Execute" → triggers execution job modal
- "Delete" → confirmation dialog

## Eval Playground (`/evals/[id]/playground`)

### Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ Header: "← Back to Evals"   "quality_check"   [Save] [Save As New]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────┐  ┌───────────────────────────────┐ │
│  │ Code Editor (Monaco)        │  │ Trace Picker                  │ │
│  │                             │  │ ─────────────────────────     │ │
│  │ def eval_quality(trace):    │  │ Agent: [Support Agent ▾]      │ │
│  │   steps = trace['steps']    │  │                               │ │
│  │   ...                       │  │ ☑ trace_abc123 (positive)     │ │
│  │   return (True, "...")      │  │ ☑ trace_def456 (negative)     │ │
│  │                             │  │ ☐ trace_ghi789 (neutral)      │ │
│  │                             │  │ ☐ trace_jkl012 (no feedback)  │ │
│  │                             │  │                               │ │
│  │                             │  │ [Select All] [Clear]          │ │
│  └─────────────────────────────┘  └───────────────────────────────┘ │
│                                                                     │
│  [▶ Run on Selected Traces]                                         │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ Results Table                                                       │
│ ─────────────────────────────────────────────────────────────────── │
│ Trace ID     | Human     | Predicted | Match | Reason    | Time    │
│ trace_abc123 | positive  | ✓ pass    | ✓     | Good...   | 12ms    │
│ trace_def456 | negative  | ✗ fail    | ✓     | Error...  | 8ms     │
│ trace_ghi789 | neutral   | ✓ pass    | -     | OK...     | 15ms    │
├─────────────────────────────────────────────────────────────────────┤
│ Summary: 3 traces | 2 matches | 0 contradictions | Avg: 11.6ms     │
└─────────────────────────────────────────────────────────────────────┘
```

### Features

- **Monaco editor** with Python syntax highlighting
- **Trace picker** shows traces from eval's agent with feedback labels
- **Run button** executes current code against selected traces (dry-run, not persisted)
- **Results table** shows prediction vs human feedback, highlights contradictions
- **Save** updates the eval, **Save As New** creates a new version

### Workflow

1. User opens playground from side sheet
2. Current eval code loads in editor
3. User selects traces to test against
4. Click Run → results appear below
5. Tweak code → Run again → iterate
6. When satisfied → Save

## Analytics Page (`/analytics`)

### Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ Header: "Analytics"                            [Time: Last 7 days ▾]│
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  KPI Cards (row)                                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│  │ Avg      │ │ Total    │ │ Contra-  │ │ Active   │               │
│  │ Accuracy │ │ Execs    │ │ dictions │ │ Evals    │               │
│  │ 84.2%    │ │ 1,234    │ │ 47       │ │ 12       │               │
│  │ ↑ 2.1%   │ │ ↑ 156    │ │ ↓ 8      │ │ +2       │               │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘               │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────┐ ┌─────────────────────────────┐│
│  │ Accuracy Trend (line chart)     │ │ Evals by Agent (bar chart) ││
│  └─────────────────────────────────┘ └─────────────────────────────┘│
│                                                                     │
│  ┌─────────────────────────────────┐ ┌─────────────────────────────┐│
│  │ Score Distribution (pie)        │ │ Top Contradictions (table) ││
│  └─────────────────────────────────┘ └─────────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Components (reuse existing)

- KPI cards with sparklines (from current `/evals` page)
- `EvaluationChart` (line chart for trends)
- `PassRateTrendChart` (already exists)
- Pie chart for score distribution
- Simple table for top contradictions (clickable → navigates to eval)

### Filters

- Time range: 24h, 7d, 30d, custom
- Agent filter (optional): Show analytics for specific agent only

## API Changes

### Existing Endpoints (no changes)

- `GET /api/evals` - List evals (already supports `agent_id` filter)
- `GET /api/evals/:id` - Get eval details with code
- `PATCH /api/evals/:id` - Update eval (name, code)
- `POST /api/evals/:id/execute` - Execute eval on traces
- `GET /api/evals/:id/executions` - Get execution results
- `GET /api/agents/:id/matrix` - Matrix comparison

### New Endpoint: Playground Run

```
POST /api/evals/:id/playground
```

**Request:**
```json
{
  "code": "def eval_...(trace): ...",
  "trace_ids": ["trace_abc", "trace_def"]
}
```

**Response:**
```json
{
  "results": [
    {
      "trace_id": "trace_abc",
      "human_feedback": "positive",
      "predicted": true,
      "reason": "Good output",
      "is_match": true,
      "execution_time_ms": 12,
      "error": null
    }
  ],
  "summary": {
    "total": 2,
    "matches": 2,
    "contradictions": 0,
    "avg_time_ms": 10
  }
}
```

**Key difference from `execute`:** Playground does NOT persist results to `eval_executions`. It's a dry-run for iteration using the provided code, not saved code.

### Optional: Analytics Overview Endpoint

```
GET /api/analytics/overview?days=7&agent_id=xxx
```

Returns aggregated KPIs. Could also compute client-side from existing data.

## Implementation

### Files to Modify

| File | Change |
|------|--------|
| `frontend/app/evals/page.tsx` | Rewrite: table view + side sheet + filters |
| `frontend/app/evals/[id]/page.tsx` | Remove (replaced by side sheet) |
| `frontend/app/evals/[id]/playground/page.tsx` | New: playground page |
| `frontend/app/analytics/page.tsx` | New: move charts here |
| `frontend/components/navigation.tsx` | Add "Analytics" nav item |
| `frontend/components/evals/eval-side-sheet.tsx` | New: side sheet component |
| `frontend/components/evals/eval-table.tsx` | New: table component |
| `frontend/components/playground/eval-playground.tsx` | New: playground component |
| `frontend/lib/api-client.ts` | Add `playgroundRun()` method |
| `src/api/evals.ts` | Add `POST /evals/:id/playground` |

### New Components

- `EvalSideSheet` - Details + Executions tabs, action buttons
- `EvalTable` - Sortable table with agent filter
- `EvalPlayground` - Monaco editor + trace picker + results

### Reused Components

- `CodeViewer` - Read-only code display
- `ExecuteEvalModal` - Existing execute modal
- Chart components from current evals page

### Implementation Order

1. Backend: Add playground endpoint
2. Frontend: Evals list with table + side sheet
3. Frontend: Playground page
4. Frontend: Analytics page (mostly moving existing code)
5. Navigation updates

## Links Between Pages

- From eval side sheet → "Open in Playground" button
- From eval side sheet → "View in Matrix" button (opens matrix filtered to this eval)
- From playground → "Save" updates the eval, "Back" returns to list
- From analytics → Click a chart segment to filter the eval list
