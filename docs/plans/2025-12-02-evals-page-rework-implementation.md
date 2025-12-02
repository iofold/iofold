# Evals Page Rework Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rework the evals page to show a table of eval functions with side sheet details, add an eval playground for iterating on code, and move analytics to a separate page.

**Architecture:** Replace the current analytics-heavy `/evals` page with a table-based list view. Clicking a row opens a right-side sheet with details and actions. A new `/evals/[id]/playground` page provides a Monaco editor + trace picker for iterating on eval code. Current charts move to `/analytics`.

**Tech Stack:** Next.js 14, React Query, Radix UI (Sheet, Select), Monaco Editor, Recharts, TailwindCSS

---

## Task 1: Add Playground API Endpoint

**Files:**
- Modify: `src/api/evals.ts`
- Modify: `src/api/index.ts`

**Step 1: Add PlaygroundRunSchema validation**

In `src/api/evals.ts`, add after line 46 (after `ListEvalsSchema`):

```typescript
const PlaygroundRunSchema = z.object({
  code: z.string().min(1),
  trace_ids: z.array(z.string()).min(1).max(50)
});
```

**Step 2: Add playgroundRun method to EvalsAPI class**

In `src/api/evals.ts`, add this method to the `EvalsAPI` class (after the `getEvalExecutions` method):

```typescript
// POST /api/evals/:id/playground - Run eval code against traces without persisting
async playgroundRun(
  evalId: string,
  workspaceId: string,
  body: any
): Promise<Response> {
  try {
    const validated = PlaygroundRunSchema.parse(body);

    // Check if eval exists and get agent_id
    const evalRecord = await this.db
      .prepare('SELECT id, agent_id FROM evals WHERE id = ?')
      .bind(evalId)
      .first();

    if (!evalRecord) {
      return notFoundError('Eval', evalId);
    }

    // Fetch traces with their feedback
    const placeholders = validated.trace_ids.map(() => '?').join(',');
    const traces = await this.db
      .prepare(
        `SELECT t.id, t.steps, t.raw_data,
                f.rating as human_rating, f.rating_detail as human_notes
         FROM traces t
         LEFT JOIN feedback f ON t.id = f.trace_id AND f.agent_id = ?
         WHERE t.id IN (${placeholders})`
      )
      .bind(evalRecord.agent_id, ...validated.trace_ids)
      .all();

    if (!traces.results || traces.results.length === 0) {
      return validationError('trace_ids', 'No valid traces found');
    }

    // Execute eval code against each trace
    const results: any[] = [];
    let matches = 0;
    let contradictions = 0;
    let totalTime = 0;

    for (const trace of traces.results) {
      const startTime = Date.now();
      let predicted = false;
      let reason = '';
      let error: string | null = null;

      try {
        // Parse trace data
        const traceData = {
          trace_id: trace.id,
          steps: typeof trace.steps === 'string' ? JSON.parse(trace.steps as string) : trace.steps,
          raw_data: typeof trace.raw_data === 'string' ? JSON.parse(trace.raw_data as string) : trace.raw_data
        };

        // Execute in sandbox (simplified - in real impl use Pyodide)
        // For now, we'll use the existing sandbox binding
        if (this.sandboxBinding) {
          const sandbox = this.sandboxBinding.get(this.sandboxBinding.idFromName('playground'));
          const result = await sandbox.executeEval(validated.code, traceData);
          predicted = result.predicted;
          reason = result.reason;
        } else {
          error = 'Sandbox not available';
        }
      } catch (e: any) {
        error = e.message || 'Execution error';
      }

      const executionTime = Date.now() - startTime;
      totalTime += executionTime;

      // Determine if this is a match or contradiction
      const humanRating = trace.human_rating as string | null;
      let isMatch: boolean | null = null;
      let isContradiction = false;

      if (humanRating && humanRating !== 'neutral') {
        const expectedPass = humanRating === 'positive';
        isMatch = predicted === expectedPass;
        isContradiction = !isMatch;
        if (isMatch) matches++;
        if (isContradiction) contradictions++;
      }

      results.push({
        trace_id: trace.id,
        human_feedback: humanRating || null,
        predicted,
        reason,
        is_match: isMatch,
        is_contradiction: isContradiction,
        execution_time_ms: executionTime,
        error
      });
    }

    return new Response(JSON.stringify({
      results,
      summary: {
        total: results.length,
        matches,
        contradictions,
        avg_time_ms: Math.round(totalTime / results.length)
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return handleError(e);
  }
}
```

**Step 3: Add route in index.ts**

In `src/api/index.ts`, add the route handler for playground:

```typescript
// In the router, add:
if (path.match(/^\/api\/evals\/[^\/]+\/playground$/) && request.method === 'POST') {
  const evalId = path.split('/')[3];
  return evalsApi.playgroundRun(evalId, workspaceId, await request.json());
}
```

**Step 4: Test the endpoint**

```bash
curl -X POST http://localhost:8787/api/evals/eval_123/playground \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: workspace_default" \
  -d '{"code": "def eval_test(trace): return (True, \"test\")", "trace_ids": ["trace_1"]}'
```

Expected: 200 OK with results array

**Step 5: Commit**

```bash
git add src/api/evals.ts src/api/index.ts
git commit -m "feat(api): add playground endpoint for dry-run eval execution"
```

---

## Task 2: Add API Client Method for Playground

**Files:**
- Modify: `frontend/lib/api-client.ts`
- Modify: `frontend/types/api.ts`

**Step 1: Add types**

In `frontend/types/api.ts`, add after the `EvalExecutionWithContext` interface:

```typescript
// ============================================================================
// Playground
// ============================================================================

export interface PlaygroundRunRequest {
  code: string;
  trace_ids: string[];
}

export interface PlaygroundResult {
  trace_id: string;
  human_feedback: 'positive' | 'negative' | 'neutral' | null;
  predicted: boolean;
  reason: string;
  is_match: boolean | null;
  is_contradiction: boolean;
  execution_time_ms: number;
  error: string | null;
}

export interface PlaygroundRunResponse {
  results: PlaygroundResult[];
  summary: {
    total: number;
    matches: number;
    contradictions: number;
    avg_time_ms: number;
  };
}
```

**Step 2: Add API client method**

In `frontend/lib/api-client.ts`, add after the `getEvalExecutions` method (around line 273):

```typescript
async playgroundRun(
  evalId: string,
  data: PlaygroundRunRequest
): Promise<PlaygroundRunResponse> {
  return this.request(`/api/evals/${evalId}/playground`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}
```

**Step 3: Add import**

In `frontend/lib/api-client.ts`, add to the imports at the top:

```typescript
import type {
  // ... existing imports
  PlaygroundRunRequest,
  PlaygroundRunResponse,
} from '@/types/api'
```

**Step 4: Commit**

```bash
git add frontend/lib/api-client.ts frontend/types/api.ts
git commit -m "feat(frontend): add playgroundRun API client method"
```

---

## Task 3: Create Eval Table Component

**Files:**
- Create: `frontend/components/evals/eval-table.tsx`

**Step 1: Create the component file**

Create `frontend/components/evals/eval-table.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { formatPercentage, formatRelativeTime, cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { Eval } from '@/types/api'

interface EvalTableProps {
  evals: Eval[]
  selectedId: string | null
  onSelect: (evalItem: Eval) => void
  isLoading?: boolean
}

export function EvalTable({ evals, selectedId, onSelect, isLoading }: EvalTableProps) {
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 bg-muted rounded" />
        ))}
      </div>
    )
  }

  if (evals.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No evals found. Generate an eval from an agent to get started.
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-3 text-sm font-medium">Name</th>
            <th className="text-left px-4 py-3 text-sm font-medium">Agent</th>
            <th className="text-right px-4 py-3 text-sm font-medium">Accuracy</th>
            <th className="text-right px-4 py-3 text-sm font-medium">Executions</th>
            <th className="text-right px-4 py-3 text-sm font-medium">Contradictions</th>
            <th className="text-right px-4 py-3 text-sm font-medium">Last Run</th>
          </tr>
        </thead>
        <tbody>
          {evals.map((evalItem) => (
            <tr
              key={evalItem.id}
              onClick={() => onSelect(evalItem)}
              className={cn(
                'border-t cursor-pointer transition-colors',
                selectedId === evalItem.id
                  ? 'bg-accent'
                  : 'hover:bg-muted/50'
              )}
            >
              <td className="px-4 py-3">
                <span className="font-medium">{evalItem.name}</span>
              </td>
              <td className="px-4 py-3">
                <Badge variant="outline" className="text-xs">
                  {evalItem.agent_id.replace('agent_', '')}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <span
                  className={cn(
                    'font-medium',
                    evalItem.accuracy >= 0.8
                      ? 'text-green-600'
                      : evalItem.accuracy >= 0.6
                      ? 'text-yellow-600'
                      : 'text-red-600'
                  )}
                >
                  {formatPercentage(evalItem.accuracy)}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-muted-foreground">
                {evalItem.execution_count}
              </td>
              <td className="px-4 py-3 text-right">
                {evalItem.contradiction_count > 0 ? (
                  <span className="text-red-600 font-medium">
                    {evalItem.contradiction_count}
                  </span>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </td>
              <td className="px-4 py-3 text-right text-muted-foreground text-sm">
                {formatRelativeTime(evalItem.updated_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/components/evals/eval-table.tsx
git commit -m "feat(frontend): add EvalTable component"
```

---

## Task 4: Create Eval Side Sheet Component

**Files:**
- Create: `frontend/components/evals/eval-side-sheet.tsx`

**Step 1: Create the component file**

Create `frontend/components/evals/eval-side-sheet.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { CodeViewer } from '@/components/code-viewer'
import { ExecuteEvalModal } from '@/components/modals/execute-eval-modal'
import {
  Play,
  FlaskConical,
  Grid3X3,
  Trash2,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react'
import { formatPercentage, formatRelativeTime, cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { Eval } from '@/types/api'

interface EvalSideSheetProps {
  evalItem: Eval | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete?: (id: string) => void
}

export function EvalSideSheet({
  evalItem,
  open,
  onOpenChange,
  onDelete,
}: EvalSideSheetProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'executions'>('details')

  // Fetch executions when tab is active
  const { data: executionsData, isLoading: loadingExecutions } = useQuery({
    queryKey: ['eval-executions', evalItem?.id],
    queryFn: () => apiClient.getEvalExecutions(evalItem!.id, { limit: 20 }),
    enabled: open && !!evalItem && activeTab === 'executions',
  })

  if (!evalItem) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-xl">{evalItem.name}</SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <Badge variant="outline">{evalItem.agent_id.replace('agent_', '')}</Badge>
            <span className="text-muted-foreground">
              Created {formatRelativeTime(evalItem.created_at)}
            </span>
          </SheetDescription>
        </SheetHeader>

        {/* Tabs */}
        <div className="flex gap-1 mt-6 border-b">
          <button
            onClick={() => setActiveTab('details')}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'details'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('executions')}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'executions'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            Executions
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {activeTab === 'details' ? (
            <>
              {/* Metrics */}
              <div className="grid grid-cols-3 gap-3">
                <Card className="p-3 text-center">
                  <div
                    className={cn(
                      'text-xl font-bold',
                      evalItem.accuracy >= 0.8
                        ? 'text-green-600'
                        : evalItem.accuracy >= 0.6
                        ? 'text-yellow-600'
                        : 'text-red-600'
                    )}
                  >
                    {formatPercentage(evalItem.accuracy)}
                  </div>
                  <div className="text-xs text-muted-foreground">Accuracy</div>
                </Card>
                <Card className="p-3 text-center">
                  <div className="text-xl font-bold">{evalItem.execution_count}</div>
                  <div className="text-xs text-muted-foreground">Executions</div>
                </Card>
                <Card className="p-3 text-center">
                  <div className="text-xl font-bold text-red-600">
                    {evalItem.contradiction_count}
                  </div>
                  <div className="text-xs text-muted-foreground">Contradictions</div>
                </Card>
              </div>

              {/* Description */}
              {evalItem.description && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Description</h4>
                  <p className="text-sm text-muted-foreground">{evalItem.description}</p>
                </div>
              )}

              {/* Code Preview */}
              <div>
                <h4 className="text-sm font-medium mb-2">Eval Code</h4>
                <div className="max-h-[300px] overflow-auto rounded border">
                  <CodeViewer code={evalItem.code} language="python" />
                </div>
              </div>

              {/* Model Used */}
              <div className="text-sm text-muted-foreground">
                Model: {evalItem.model_used}
              </div>
            </>
          ) : (
            <>
              {loadingExecutions ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading executions...
                </div>
              ) : !executionsData?.executions?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  No executions yet. Run the eval to see results.
                </div>
              ) : (
                <div className="space-y-2">
                  {executionsData.executions.map((exec: any) => (
                    <Card
                      key={exec.id}
                      className={cn(
                        'p-3',
                        exec.is_contradiction && 'border-red-200 bg-red-50/50'
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {exec.error ? (
                            <AlertTriangle className="w-4 h-4 text-yellow-600" />
                          ) : exec.predicted_result ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-600" />
                          )}
                          <Link
                            href={`/traces/${exec.trace_id}`}
                            className="text-sm font-mono hover:underline"
                          >
                            {exec.trace_id.slice(0, 12)}...
                          </Link>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {exec.execution_time_ms}ms
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {exec.predicted_reason}
                      </p>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 pt-4 border-t space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Link href={`/evals/${evalItem.id}/playground`}>
              <Button variant="outline" className="w-full">
                <FlaskConical className="w-4 h-4 mr-2" />
                Playground
              </Button>
            </Link>
            <Link href={`/matrix/${evalItem.agent_id}?eval_ids=${evalItem.id}`}>
              <Button variant="outline" className="w-full">
                <Grid3X3 className="w-4 h-4 mr-2" />
                Matrix
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ExecuteEvalModal evalId={evalItem.id} agentId={evalItem.agent_id}>
              <Button className="w-full">
                <Play className="w-4 h-4 mr-2" />
                Execute
              </Button>
            </ExecuteEvalModal>
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => {
                if (confirm('Are you sure you want to delete this eval?')) {
                  onDelete?.(evalItem.id)
                }
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/components/evals/eval-side-sheet.tsx
git commit -m "feat(frontend): add EvalSideSheet component"
```

---

## Task 5: Rewrite Evals List Page

**Files:**
- Modify: `frontend/app/evals/page.tsx`

**Step 1: Rewrite the page**

Replace the entire contents of `frontend/app/evals/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EvalTable } from '@/components/evals/eval-table'
import { EvalSideSheet } from '@/components/evals/eval-side-sheet'
import { GenerateEvalModal } from '@/components/modals/GenerateEvalModal'
import { RefreshCw, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { Eval } from '@/types/api'

export default function EvalsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  // State
  const [selectedEval, setSelectedEval] = useState<Eval | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [agentFilter, setAgentFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Fetch evals
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['evals', agentFilter],
    queryFn: () =>
      apiClient.listEvals({
        agent_id: agentFilter === 'all' ? undefined : agentFilter,
        limit: 100,
      }),
  })

  // Fetch agents for filter dropdown
  const { data: agentsData } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiClient.listAgents(),
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (evalId: string) => apiClient.deleteEval(evalId),
    onSuccess: () => {
      toast.success('Eval deleted')
      queryClient.invalidateQueries({ queryKey: ['evals'] })
      setSheetOpen(false)
      setSelectedEval(null)
    },
    onError: () => {
      toast.error('Failed to delete eval')
    },
  })

  // Filter evals by search query
  const filteredEvals = (data?.evals || []).filter((evalItem) =>
    searchQuery
      ? evalItem.name.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  )

  // Handle row selection
  const handleSelect = (evalItem: Eval) => {
    setSelectedEval(evalItem)
    setSheetOpen(true)
    // Update URL without navigation
    router.replace(`/evals?selected=${evalItem.id}`, { scroll: false })
  }

  // Handle sheet close
  const handleSheetClose = (open: boolean) => {
    setSheetOpen(open)
    if (!open) {
      router.replace('/evals', { scroll: false })
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Evals</h1>
          <p className="text-muted-foreground">
            Manage evaluation functions for your agents
          </p>
        </div>
        <GenerateEvalModal>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Generate Eval
          </Button>
        </GenerateEvalModal>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search evals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {agentsData?.agents?.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Table */}
      <EvalTable
        evals={filteredEvals}
        selectedId={selectedEval?.id || null}
        onSelect={handleSelect}
        isLoading={isLoading}
      />

      {/* Side Sheet */}
      <EvalSideSheet
        evalItem={selectedEval}
        open={sheetOpen}
        onOpenChange={handleSheetClose}
        onDelete={(id) => deleteMutation.mutate(id)}
      />
    </div>
  )
}
```

**Step 2: Verify the page loads**

```bash
cd frontend && pnpm dev
# Navigate to http://dev4:3000/evals
```

Expected: Table view with filters and side sheet functionality

**Step 3: Commit**

```bash
git add frontend/app/evals/page.tsx
git commit -m "feat(frontend): rewrite evals page with table view and side sheet"
```

---

## Task 6: Create Eval Playground Page

**Files:**
- Create: `frontend/app/evals/[id]/playground/page.tsx`

**Step 1: Create the directory and file**

Create `frontend/app/evals/[id]/playground/page.tsx`:

```tsx
'use client'

import { useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  Play,
  Save,
  Plus,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn, formatPercentage } from '@/lib/utils'
import type { PlaygroundResult } from '@/types/api'

// Dynamic import for Monaco to avoid SSR issues
const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then((mod) => mod.default),
  { ssr: false, loading: () => <div className="h-[400px] bg-muted animate-pulse rounded" /> }
)

export default function EvalPlaygroundPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const evalId = params.id as string

  // State
  const [code, setCode] = useState('')
  const [selectedTraceIds, setSelectedTraceIds] = useState<string[]>([])
  const [results, setResults] = useState<PlaygroundResult[] | null>(null)
  const [summary, setSummary] = useState<{
    total: number
    matches: number
    contradictions: number
    avg_time_ms: number
  } | null>(null)

  // Fetch eval
  const { data: evalData, isLoading: loadingEval } = useQuery({
    queryKey: ['eval', evalId],
    queryFn: () => apiClient.getEval(evalId),
    onSuccess: (data) => {
      if (!code) setCode(data.code)
    },
  })

  // Fetch traces for the eval's agent
  const { data: tracesData, isLoading: loadingTraces } = useQuery({
    queryKey: ['traces', evalData?.agent_id],
    queryFn: () =>
      apiClient.listTraces({
        agent_id: evalData!.agent_id,
        limit: 50,
      }),
    enabled: !!evalData?.agent_id,
  })

  // Run mutation
  const runMutation = useMutation({
    mutationFn: () =>
      apiClient.playgroundRun(evalId, {
        code,
        trace_ids: selectedTraceIds,
      }),
    onSuccess: (data) => {
      setResults(data.results)
      setSummary(data.summary)
      toast.success('Eval executed successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to run eval')
    },
  })

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.updateEval(evalId, { code }),
    onSuccess: () => {
      toast.success('Eval saved')
      queryClient.invalidateQueries({ queryKey: ['eval', evalId] })
    },
    onError: () => {
      toast.error('Failed to save eval')
    },
  })

  // Toggle trace selection
  const toggleTrace = useCallback((traceId: string) => {
    setSelectedTraceIds((prev) =>
      prev.includes(traceId)
        ? prev.filter((id) => id !== traceId)
        : [...prev, traceId]
    )
  }, [])

  // Select all / clear all
  const selectAll = useCallback(() => {
    if (tracesData?.traces) {
      setSelectedTraceIds(tracesData.traces.map((t) => t.id))
    }
  }, [tracesData])

  const clearSelection = useCallback(() => {
    setSelectedTraceIds([])
  }, [])

  if (loadingEval) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">Loading...</div>
      </div>
    )
  }

  if (!evalData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12 text-muted-foreground">
          Eval not found
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <Link href="/evals">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Evals
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">{evalData.name}</h1>
          <Badge variant="outline">Playground</Badge>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save
          </Button>
          <Button variant="outline" onClick={() => toast.info('Save As New not implemented')}>
            <Plus className="w-4 h-4 mr-2" />
            Save As New
          </Button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Code Editor */}
        <div>
          <h3 className="text-sm font-medium mb-2">Eval Code</h3>
          <div className="border rounded-lg overflow-hidden">
            <MonacoEditor
              height="400px"
              language="python"
              theme="vs-dark"
              value={code}
              onChange={(value) => setCode(value || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>
        </div>

        {/* Trace Picker */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium">Select Traces</h3>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAll}>
                Select All
              </Button>
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Clear
              </Button>
            </div>
          </div>
          <div className="border rounded-lg h-[400px] overflow-y-auto p-2 space-y-1">
            {loadingTraces ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading traces...
              </div>
            ) : !tracesData?.traces?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                No traces found for this agent
              </div>
            ) : (
              tracesData.traces.map((trace) => (
                <div
                  key={trace.id}
                  className={cn(
                    'flex items-center gap-3 p-2 rounded cursor-pointer transition-colors',
                    selectedTraceIds.includes(trace.id)
                      ? 'bg-accent'
                      : 'hover:bg-muted'
                  )}
                  onClick={() => toggleTrace(trace.id)}
                >
                  <Checkbox
                    checked={selectedTraceIds.includes(trace.id)}
                    onCheckedChange={() => toggleTrace(trace.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-mono truncate">
                      {trace.id.slice(0, 16)}...
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {trace.summary?.input_preview || 'No preview'}
                    </div>
                  </div>
                  {trace.feedback && (
                    <Badge
                      variant={
                        trace.feedback.rating === 'positive'
                          ? 'default'
                          : trace.feedback.rating === 'negative'
                          ? 'destructive'
                          : 'secondary'
                      }
                      className="text-xs"
                    >
                      {trace.feedback.rating}
                    </Badge>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Run Button */}
      <div className="mb-6">
        <Button
          onClick={() => runMutation.mutate()}
          disabled={selectedTraceIds.length === 0 || runMutation.isPending}
          className="w-full"
          size="lg"
        >
          {runMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          Run on {selectedTraceIds.length} Selected Trace{selectedTraceIds.length !== 1 ? 's' : ''}
        </Button>
      </div>

      {/* Results */}
      {results && (
        <>
          <div className="border rounded-lg overflow-hidden mb-4">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium">Trace ID</th>
                  <th className="text-left px-4 py-3 text-sm font-medium">Human</th>
                  <th className="text-left px-4 py-3 text-sm font-medium">Predicted</th>
                  <th className="text-center px-4 py-3 text-sm font-medium">Match</th>
                  <th className="text-left px-4 py-3 text-sm font-medium">Reason</th>
                  <th className="text-right px-4 py-3 text-sm font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr
                    key={result.trace_id}
                    className={cn(
                      'border-t',
                      result.is_contradiction && 'bg-red-50/50'
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-sm">
                      {result.trace_id.slice(0, 12)}...
                    </td>
                    <td className="px-4 py-3">
                      {result.human_feedback ? (
                        <Badge
                          variant={
                            result.human_feedback === 'positive'
                              ? 'default'
                              : result.human_feedback === 'negative'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {result.human_feedback}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {result.error ? (
                        <AlertTriangle className="w-4 h-4 text-yellow-600" />
                      ) : result.predicted ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {result.is_match === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : result.is_match ? (
                        <CheckCircle className="w-4 h-4 text-green-600 mx-auto" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600 mx-auto" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground max-w-[300px] truncate">
                      {result.error || result.reason}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                      {result.execution_time_ms}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          {summary && (
            <Card className="p-4">
              <div className="flex justify-between items-center">
                <div className="flex gap-6">
                  <div>
                    <span className="text-muted-foreground text-sm">Total:</span>{' '}
                    <span className="font-medium">{summary.total}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-sm">Matches:</span>{' '}
                    <span className="font-medium text-green-600">{summary.matches}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-sm">Contradictions:</span>{' '}
                    <span className="font-medium text-red-600">{summary.contradictions}</span>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Avg: {summary.avg_time_ms}ms
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
```

**Step 2: Install Monaco Editor**

```bash
cd frontend && pnpm add @monaco-editor/react
```

**Step 3: Verify the page loads**

```bash
# Navigate to http://dev4:3000/evals/[eval_id]/playground
```

**Step 4: Commit**

```bash
git add frontend/app/evals/[id]/playground/page.tsx frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat(frontend): add eval playground page with Monaco editor"
```

---

## Task 7: Create Analytics Page

**Files:**
- Create: `frontend/app/analytics/page.tsx`
- Modify: `frontend/components/navigation.tsx`

**Step 1: Create analytics page**

Create `frontend/app/analytics/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EvaluationChart } from '@/components/charts/evaluation-chart'
import { TrendingUp, TrendingDown, Target, AlertTriangle, Activity } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'
import Link from 'next/link'

// Sparkline component (moved from old evals page)
const SparklineChart = ({ data, color }: { data: number[]; color: string }) => {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * 100
      const y = 100 - ((value - min) / range) * 100
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg className="w-full h-12" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

// KPI Card component
const KPICard = ({
  title,
  value,
  trend,
  trendValue,
  icon: Icon,
  sparklineData,
  sparklineColor,
}: {
  title: string
  value: string | number
  trend: 'up' | 'down'
  trendValue: string
  icon: any
  sparklineData: number[]
  sparklineColor: string
}) => (
  <Card className="p-6">
    <div className="flex items-center gap-4 mb-4">
      <div className="p-2 rounded-lg bg-muted">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-sm text-muted-foreground">{title}</div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
      <div
        className={`ml-auto flex items-center gap-1 text-sm ${
          trend === 'up' ? 'text-green-600' : 'text-red-600'
        }`}
      >
        {trend === 'up' ? (
          <TrendingUp className="w-4 h-4" />
        ) : (
          <TrendingDown className="w-4 h-4" />
        )}
        {trendValue}
      </div>
    </div>
    <SparklineChart data={sparklineData} color={sparklineColor} />
  </Card>
)

const scoreDistribution = [
  { range: '0-20', value: 2, color: '#D84315' },
  { range: '21-40', value: 5, color: '#FF8A8A' },
  { range: '41-60', value: 12, color: '#8B949E' },
  { range: '61-80', value: 28, color: '#B2DFDB' },
  { range: '81-90', value: 35, color: '#4ECDC4' },
  { range: '91-100', value: 18, color: '#4CAF50' },
]

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState('7d')
  const [selectedMetrics, setSelectedMetrics] = useState(['success_rate', 'accuracy'])

  // Fetch evals for analytics
  const { data: evalsData, isLoading } = useQuery({
    queryKey: ['evals'],
    queryFn: () => apiClient.listEvals({ limit: 100 }),
  })

  // Calculate aggregate metrics
  const evals = evalsData?.evals || []
  const avgAccuracy =
    evals.length > 0
      ? evals.reduce((sum, e) => sum + (e.accuracy || 0), 0) / evals.length
      : 0
  const totalExecutions = evals.reduce((sum, e) => sum + e.execution_count, 0)
  const totalContradictions = evals.reduce((sum, e) => sum + e.contradiction_count, 0)

  // Mock trend data (in real impl, fetch from API)
  const mockTrendData = [
    { date: '2025-11-24', success_rate: 84.2, accuracy: 86.1 },
    { date: '2025-11-25', success_rate: 85.8, accuracy: 87.3 },
    { date: '2025-11-26', success_rate: 86.5, accuracy: 88.2 },
    { date: '2025-11-27', success_rate: 85.3, accuracy: 86.9 },
    { date: '2025-11-28', success_rate: 87.1, accuracy: 89.1 },
    { date: '2025-11-29', success_rate: 87.8, accuracy: 89.7 },
    { date: '2025-11-30', success_rate: 87.3, accuracy: 89.2 },
  ]

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">
            Evaluation performance overview and trends
          </p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Last 24 hours</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <KPICard
          title="Avg Accuracy"
          value={`${(avgAccuracy * 100).toFixed(1)}%`}
          trend="up"
          trendValue="+2.1%"
          icon={Target}
          sparklineData={[82, 84, 83, 85, 86, 87, 87]}
          sparklineColor="#4ECDC4"
        />
        <KPICard
          title="Total Executions"
          value={totalExecutions.toLocaleString()}
          trend="up"
          trendValue="+156"
          icon={Activity}
          sparklineData={[100, 120, 115, 140, 155, 180, 200]}
          sparklineColor="#4CAF50"
        />
        <KPICard
          title="Contradictions"
          value={totalContradictions}
          trend="down"
          trendValue="-8"
          icon={AlertTriangle}
          sparklineData={[60, 55, 52, 48, 50, 45, 47]}
          sparklineColor="#FF8A8A"
        />
        <KPICard
          title="Active Evals"
          value={evals.length}
          trend="up"
          trendValue="+2"
          icon={Activity}
          sparklineData={[8, 9, 9, 10, 10, 11, 12]}
          sparklineColor="#8B949E"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        {/* Trend Chart */}
        <Card className="col-span-2 p-6">
          <h3 className="text-lg font-medium mb-4">Accuracy Trend</h3>
          <EvaluationChart
            data={mockTrendData}
            selectedMetrics={selectedMetrics}
            onMetricToggle={(metric) =>
              setSelectedMetrics((prev) =>
                prev.includes(metric)
                  ? prev.filter((m) => m !== metric)
                  : [...prev, metric]
              )
            }
          />
        </Card>

        {/* Score Distribution */}
        <Card className="p-6">
          <h3 className="text-lg font-medium mb-4">Score Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={scoreDistribution}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                dataKey="value"
                label={({ range }) => range}
              >
                {scoreDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <RechartsTooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Top Contradictions */}
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4">Top Contradictions</h3>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-muted-foreground">
                <th className="pb-3">Eval Name</th>
                <th className="pb-3">Agent</th>
                <th className="pb-3 text-right">Contradictions</th>
                <th className="pb-3 text-right">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {evals
                .filter((e) => e.contradiction_count > 0)
                .sort((a, b) => b.contradiction_count - a.contradiction_count)
                .slice(0, 5)
                .map((evalItem) => (
                  <tr key={evalItem.id} className="border-t">
                    <td className="py-3">
                      <Link
                        href={`/evals?selected=${evalItem.id}`}
                        className="hover:underline font-medium"
                      >
                        {evalItem.name}
                      </Link>
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {evalItem.agent_id.replace('agent_', '')}
                    </td>
                    <td className="py-3 text-right text-red-600 font-medium">
                      {evalItem.contradiction_count}
                    </td>
                    <td className="py-3 text-right">
                      {(evalItem.accuracy * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
```

**Step 2: Update navigation**

In `frontend/components/navigation.tsx`, update the navItems array:

```tsx
const navItems = [
  { href: '/', label: 'Home' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/agents', label: 'Agents' },
  { href: '/traces', label: 'Traces' },
  { href: '/evals', label: 'Evals' },
  { href: '/analytics', label: 'Analytics' },
]
```

**Step 3: Verify the pages**

```bash
# Navigate to http://dev4:3000/analytics
```

**Step 4: Commit**

```bash
git add frontend/app/analytics/page.tsx frontend/components/navigation.tsx
git commit -m "feat(frontend): add analytics page and update navigation"
```

---

## Task 8: Clean Up Old Eval Detail Page

**Files:**
- Modify: `frontend/app/evals/[id]/page.tsx`

**Step 1: Update to redirect to list with selection**

Replace `frontend/app/evals/[id]/page.tsx` with a redirect:

```tsx
import { redirect } from 'next/navigation'

export default function EvalDetailPage({ params }: { params: { id: string } }) {
  redirect(`/evals?selected=${params.id}`)
}
```

**Step 2: Commit**

```bash
git add frontend/app/evals/[id]/page.tsx
git commit -m "refactor(frontend): redirect eval detail to list with selection"
```

---

## Task 9: Final Integration Testing

**Step 1: Run the dev server**

```bash
cd frontend && pnpm dev
```

**Step 2: Manual testing checklist**

- [ ] `/evals` - Table loads with evals
- [ ] `/evals` - Agent filter works
- [ ] `/evals` - Search filter works
- [ ] `/evals` - Click row opens side sheet
- [ ] Side sheet - Details tab shows code preview
- [ ] Side sheet - Executions tab loads results
- [ ] Side sheet - Playground button navigates correctly
- [ ] Side sheet - Matrix button navigates correctly
- [ ] Side sheet - Execute button opens modal
- [ ] Side sheet - Delete button works
- [ ] `/evals/[id]/playground` - Monaco editor loads
- [ ] `/evals/[id]/playground` - Trace picker shows traces
- [ ] `/evals/[id]/playground` - Run button executes eval
- [ ] `/evals/[id]/playground` - Results table displays
- [ ] `/evals/[id]/playground` - Save button updates eval
- [ ] `/analytics` - KPI cards display
- [ ] `/analytics` - Charts render
- [ ] `/analytics` - Navigation link works

**Step 3: Commit final changes**

```bash
git add .
git commit -m "feat: complete evals page rework with playground and analytics"
```

---

## Summary

**Files created:**
- `frontend/components/evals/eval-table.tsx`
- `frontend/components/evals/eval-side-sheet.tsx`
- `frontend/app/evals/[id]/playground/page.tsx`
- `frontend/app/analytics/page.tsx`

**Files modified:**
- `src/api/evals.ts` - Added playground endpoint
- `src/api/index.ts` - Added route
- `frontend/lib/api-client.ts` - Added playgroundRun method
- `frontend/types/api.ts` - Added playground types
- `frontend/app/evals/page.tsx` - Rewrote to table view
- `frontend/app/evals/[id]/page.tsx` - Redirect to list
- `frontend/components/navigation.tsx` - Added Analytics link

**Dependencies added:**
- `@monaco-editor/react`
