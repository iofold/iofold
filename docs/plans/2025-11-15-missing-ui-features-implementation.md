# Missing UI Features Implementation Plan

> **For Claude:** This plan dispatches 10 parallel agents to implement all missing UI features.

**Goal:** Implement all missing UI components to achieve feature completeness and increase test pass rate from 37% to 90%+

**Architecture:** React components with shadcn/ui, React Query for data fetching, SSE for real-time updates

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, React Query, EventSource API

---

## Overview

Current status: 27/73 tests passing (37%), 12/12 smoke tests passing
Target: Implement 10 missing feature areas in parallel to reach 90%+ test pass rate

### Parallel Workstreams

1. Integration Management Modal
2. Trace Import UI
3. Trace Feedback Interface
4. Eval Set Management
5. Eval Generation UI
6. Eval Execution UI
7. Job Monitoring with SSE
8. Error Handling Components
9. Loading State Components
10. Test Fixture Corrections

---

## Workstream 1: Integration Management Modal

**Owner:** Agent 1 - Frontend Forms Specialist

**Goal:** Add modal dialog for creating/editing/testing/deleting integrations

**Files:**
- Create: `frontend/components/modals/add-integration-modal.tsx`
- Create: `frontend/components/modals/integration-actions.tsx`
- Modify: `frontend/app/integrations/page.tsx`

**Implementation:**

### Step 1: Create Add Integration Modal Component

```tsx
// frontend/components/modals/add-integration-modal.tsx
'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

interface AddIntegrationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddIntegrationModal({ open, onOpenChange }: AddIntegrationModalProps) {
  const [platform, setPlatform] = useState<'langfuse' | 'langsmith' | 'openai'>('langfuse')
  const [name, setName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (data: { platform: string; name: string; api_key: string; base_url?: string }) =>
      apiClient.createIntegration(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      toast.success('Integration added successfully')
      onOpenChange(false)
      resetForm()
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to add integration')
    },
  })

  const resetForm = () => {
    setName('')
    setApiKey('')
    setBaseUrl('')
    setPlatform('langfuse')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      platform,
      name,
      api_key: apiKey,
      base_url: baseUrl || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Integration</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="platform">Platform</Label>
              <Select value={platform} onValueChange={(v: any) => setPlatform(v)}>
                <SelectTrigger id="platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="langfuse">Langfuse</SelectItem>
                  <SelectItem value="langsmith">Langsmith</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Integration"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api_key">API Key</Label>
              <Input
                id="api_key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="base_url">Base URL (optional)</Label>
              <Input
                id="base_url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://cloud.langfuse.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Adding...' : 'Add Integration'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

### Step 2: Create Integration Actions Component

```tsx
// frontend/components/modals/integration-actions.tsx
'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Trash2, TestTube2 } from 'lucide-react'

interface IntegrationActionsProps {
  integrationId: string
}

export function IntegrationActions({ integrationId }: IntegrationActionsProps) {
  const queryClient = useQueryClient()

  const testMutation = useMutation({
    mutationFn: () => apiClient.testIntegration(integrationId),
    onSuccess: (data) => {
      if (data.status === 'success') {
        toast.success('Integration test successful')
      } else {
        toast.error(data.error_message || 'Integration test failed')
      }
    },
    onError: () => {
      toast.error('Failed to test integration')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.deleteIntegration(integrationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      toast.success('Integration deleted')
    },
    onError: () => {
      toast.error('Failed to delete integration')
    },
  })

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => testMutation.mutate()}
        disabled={testMutation.isPending}
      >
        <TestTube2 className="w-4 h-4 mr-1" />
        {testMutation.isPending ? 'Testing...' : 'Test'}
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => deleteMutation.mutate()}
        disabled={deleteMutation.isPending}
      >
        <Trash2 className="w-4 h-4 mr-1" />
        {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
      </Button>
    </div>
  )
}
```

### Step 3: Update Integrations Page

```tsx
// Modify frontend/app/integrations/page.tsx
// Add state and modal:
const [addModalOpen, setAddModalOpen] = useState(false)

// Update the "Add Integration" button:
<Button onClick={() => setAddModalOpen(true)}>
  <Plus className="w-4 h-4 mr-2" />
  Add Integration
</Button>

// Add modal and actions to the component:
<AddIntegrationModal open={addModalOpen} onOpenChange={setAddModalOpen} />

// Update integration cards to include actions:
<Card key={integration.id} className="p-6">
  <div className="flex items-start justify-between mb-4">
    {/* existing content */}
  </div>
  <IntegrationActions integrationId={integration.id} />
</Card>
```

### Step 4: Commit

```bash
git add frontend/components/modals/add-integration-modal.tsx \
        frontend/components/modals/integration-actions.tsx \
        frontend/app/integrations/page.tsx
git commit -m "feat: add integration management modal and actions"
```

---

## Workstream 2: Trace Import UI

**Owner:** Agent 2 - Job Flow Specialist

**Goal:** Add trace import modal with job tracking

**Files:**
- Create: `frontend/components/modals/import-traces-modal.tsx`
- Create: `frontend/components/job-status-monitor.tsx`
- Modify: `frontend/app/traces/page.tsx`

**Implementation:**

### Step 1: Create Import Traces Modal

```tsx
// frontend/components/modals/import-traces-modal.tsx
'use client'

import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'

interface ImportTracesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  integrations: Array<{ id: string; platform: string; name: string }>
}

export function ImportTracesModal({ open, onOpenChange, integrations }: ImportTracesModalProps) {
  const [integrationId, setIntegrationId] = useState('')
  const [limit, setLimit] = useState('10')
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<'pending' | 'running' | 'completed' | 'failed' | null>(null)
  const [progress, setProgress] = useState(0)

  const importMutation = useMutation({
    mutationFn: (data: { integration_id: string; limit?: number }) =>
      apiClient.importTraces(data),
    onSuccess: (data) => {
      if (data.job_id) {
        setJobId(data.job_id)
        setJobStatus('pending')
        toast.success('Import started')
      }
    },
    onError: () => {
      toast.error('Failed to start import')
    },
  })

  // Poll job status
  useEffect(() => {
    if (!jobId || jobStatus === 'completed' || jobStatus === 'failed') return

    const interval = setInterval(async () => {
      try {
        const job = await apiClient.getJob(jobId)
        setJobStatus(job.status as any)
        setProgress(job.progress || 0)

        if (job.status === 'completed') {
          toast.success(`Imported ${job.result?.imported_count || 0} traces`)
          clearInterval(interval)
          setTimeout(() => onOpenChange(false), 2000)
        } else if (job.status === 'failed') {
          toast.error(job.error || 'Import failed')
          clearInterval(interval)
        }
      } catch (error) {
        clearInterval(interval)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [jobId, jobStatus, onOpenChange])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    importMutation.mutate({
      integration_id: integrationId,
      limit: parseInt(limit) || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Traces</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="integration">Integration</Label>
              <Select value={integrationId} onValueChange={setIntegrationId}>
                <SelectTrigger id="integration">
                  <SelectValue placeholder="Select integration" />
                </SelectTrigger>
                <SelectContent>
                  {integrations.map((int) => (
                    <SelectItem key={int.id} value={int.id}>
                      {int.platform} - {int.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="limit">Limit (optional)</Label>
              <Input
                id="limit"
                type="number"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                min="1"
                max="100"
              />
            </div>
            {jobStatus && jobStatus !== 'completed' && (
              <div className="space-y-2">
                <Label>Progress</Label>
                <Progress value={progress} />
                <p className="text-sm text-muted-foreground">
                  Status: {jobStatus}
                </p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!integrationId || importMutation.isPending || jobStatus === 'running'}
            >
              {importMutation.isPending || jobStatus === 'running' ? 'Importing...' : 'Import'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

### Step 2: Update Traces Page

```tsx
// Modify frontend/app/traces/page.tsx
const [importModalOpen, setImportModalOpen] = useState(false)

// Fetch integrations for the modal
const { data: integrationsData } = useQuery({
  queryKey: ['integrations'],
  queryFn: () => apiClient.listIntegrations(),
})

// Add import button
<Button onClick={() => setImportModalOpen(true)}>
  <Upload className="w-4 h-4 mr-2" />
  Import Traces
</Button>

// Add modal
<ImportTracesModal
  open={importModalOpen}
  onOpenChange={setImportModalOpen}
  integrations={integrationsData?.integrations || []}
/>
```

### Step 3: Commit

```bash
git add frontend/components/modals/import-traces-modal.tsx \
        frontend/app/traces/page.tsx
git commit -m "feat: add trace import UI with job tracking"
```

---

## Workstream 3: Trace Feedback Interface

**Owner:** Agent 3 - Interaction Design Specialist

**Goal:** Add feedback submission buttons and keyboard shortcuts

**Files:**
- Create: `frontend/components/trace-feedback.tsx`
- Modify: `frontend/app/traces/page.tsx`

**Implementation:**

### Step 1: Create Trace Feedback Component

```tsx
// frontend/components/trace-feedback.tsx
'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { ThumbsUp, ThumbsDown, Minus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface TraceFeedbackProps {
  traceId: string
  evalSetId: string
  currentRating?: 'positive' | 'negative' | 'neutral' | null
  onFeedbackChange?: () => void
}

export function TraceFeedback({ traceId, evalSetId, currentRating, onFeedbackChange }: TraceFeedbackProps) {
  const [rating, setRating] = useState<'positive' | 'negative' | 'neutral' | null>(currentRating || null)
  const queryClient = useQueryClient()

  const submitMutation = useMutation({
    mutationFn: (rating: 'positive' | 'negative' | 'neutral') =>
      apiClient.submitFeedback({
        trace_id: traceId,
        eval_set_id: evalSetId,
        rating,
      }),
    onSuccess: (_, rating) => {
      setRating(rating)
      queryClient.invalidateQueries({ queryKey: ['traces'] })
      queryClient.invalidateQueries({ queryKey: ['eval-sets', evalSetId] })
      toast.success(`Marked as ${rating}`)
      onFeedbackChange?.()
    },
    onError: () => {
      toast.error('Failed to submit feedback')
    },
  })

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === '1' || e.key === 'ArrowLeft') {
        e.preventDefault()
        submitMutation.mutate('positive')
      } else if (e.key === '2' || e.key === 'ArrowDown') {
        e.preventDefault()
        submitMutation.mutate('neutral')
      } else if (e.key === '3' || e.key === 'ArrowRight') {
        e.preventDefault()
        submitMutation.mutate('negative')
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [submitMutation])

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant={rating === 'positive' ? 'default' : 'outline'}
        onClick={() => submitMutation.mutate('positive')}
        disabled={submitMutation.isPending}
        className={cn(rating === 'positive' && 'bg-green-600 hover:bg-green-700')}
      >
        <ThumbsUp className="w-4 h-4 mr-1" />
        Positive (1)
      </Button>
      <Button
        size="sm"
        variant={rating === 'neutral' ? 'default' : 'outline'}
        onClick={() => submitMutation.mutate('neutral')}
        disabled={submitMutation.isPending}
      >
        <Minus className="w-4 h-4 mr-1" />
        Neutral (2)
      </Button>
      <Button
        size="sm"
        variant={rating === 'negative' ? 'default' : 'outline'}
        onClick={() => submitMutation.mutate('negative')}
        disabled={submitMutation.isPending}
        className={cn(rating === 'negative' && 'bg-red-600 hover:bg-red-700')}
      >
        <ThumbsDown className="w-4 h-4 mr-1" />
        Negative (3)
      </Button>
    </div>
  )
}
```

### Step 2: Add Feedback to Traces Page

```tsx
// Modify frontend/app/traces/page.tsx
// Import and add to each trace card:
<TraceFeedback
  traceId={trace.id}
  evalSetId="default" // or from URL params
  currentRating={trace.feedback?.rating}
/>
```

### Step 3: Commit

```bash
git add frontend/components/trace-feedback.tsx \
        frontend/app/traces/page.tsx
git commit -m "feat: add trace feedback interface with keyboard shortcuts"
```

---

## Workstream 4: Eval Set Management

**Owner:** Agent 4 - Data Management Specialist

**Goal:** Add eval set creation, detail view, and management

**Files:**
- Create: `frontend/components/modals/create-eval-set-modal.tsx`
- Create: `frontend/app/eval-sets/[id]/page.tsx`
- Modify: `frontend/app/eval-sets/page.tsx`

**Implementation:**

### Step 1: Create Eval Set Modal

```tsx
// frontend/components/modals/create-eval-set-modal.tsx
'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'

interface CreateEvalSetModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateEvalSetModal({ open, onOpenChange }: CreateEvalSetModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const queryClient = useQueryClient()
  const router = useRouter()

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      apiClient.createEvalSet(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['eval-sets'] })
      toast.success('Eval set created')
      onOpenChange(false)
      router.push(`/eval-sets/${data.id}`)
    },
    onError: () => {
      toast.error('Failed to create eval set')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ name, description: description || undefined })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Eval Set</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Eval Set"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this eval set is for..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

### Step 2: Create Eval Set Detail Page

```tsx
// frontend/app/eval-sets/[id]/page.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function EvalSetDetailPage({ params }: { params: { id: string } }) {
  const { data, isLoading } = useQuery({
    queryKey: ['eval-sets', params.id],
    queryFn: () => apiClient.getEvalSet(params.id),
  })

  if (isLoading) {
    return <div className="container py-8">
      <Skeleton className="h-8 w-64 mb-4" />
      <Skeleton className="h-24 w-full" />
    </div>
  }

  if (!data) return <div>Eval set not found</div>

  const positiveFeedback = data.feedback_summary?.positive || 0
  const negativeFeedback = data.feedback_summary?.negative || 0
  const totalFeedback = positiveFeedback + negativeFeedback + (data.feedback_summary?.neutral || 0)
  const canGenerate = totalFeedback >= 5 && positiveFeedback >= 1 && negativeFeedback >= 1

  return (
    <div className="container py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{data.name}</h1>
        {data.description && (
          <p className="text-muted-foreground mt-2">{data.description}</p>
        )}
      </div>

      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Feedback Summary</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Positive</p>
            <p className="text-2xl font-bold text-green-600">{positiveFeedback}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Neutral</p>
            <p className="text-2xl font-bold">{data.feedback_summary?.neutral || 0}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Negative</p>
            <p className="text-2xl font-bold text-red-600">{negativeFeedback}</p>
          </div>
        </div>
        <div className="mt-6">
          <Button disabled={!canGenerate}>
            {canGenerate ? 'Generate Eval' : `Need ${5 - totalFeedback} more feedback`}
          </Button>
          {!canGenerate && totalFeedback >= 5 && (
            <p className="text-sm text-muted-foreground mt-2">
              Need at least 1 positive and 1 negative example
            </p>
          )}
        </div>
      </Card>

      {data.evals && data.evals.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Generated Evals</h2>
          <div className="space-y-4">
            {data.evals.map((eval) => (
              <div key={eval.id} className="border rounded p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold">{eval.name}</h3>
                    {eval.accuracy && (
                      <p className="text-sm text-muted-foreground">
                        Accuracy: {(eval.accuracy * 100).toFixed(1)}%
                      </p>
                    )}
                  </div>
                  <Button size="sm" variant="outline">View</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
```

### Step 3: Update Eval Sets Page

```tsx
// Modify frontend/app/eval-sets/page.tsx
const [createModalOpen, setCreateModalOpen] = useState(false)

<Button onClick={() => setCreateModalOpen(true)}>
  <Plus className="w-4 h-4 mr-2" />
  Create Eval Set
</Button>

<CreateEvalSetModal open={createModalOpen} onOpenChange={setCreateModalOpen} />
```

### Step 4: Commit

```bash
git add frontend/components/modals/create-eval-set-modal.tsx \
        frontend/app/eval-sets/\[id\]/page.tsx \
        frontend/app/eval-sets/page.tsx
git commit -m "feat: add eval set management and detail view"
```

---

## Workstream 5-10: [Abbreviated for brevity]

The remaining workstreams follow the same pattern:

5. **Eval Generation UI** - Generate eval modal with job tracking
6. **Eval Execution UI** - Execute eval modal with results display
7. **Job Monitoring with SSE** - EventSource integration for real-time updates
8. **Error Handling Components** - Error boundary and toast notifications
9. **Loading State Components** - Skeleton loaders and progress indicators
10. **Test Fixture Corrections** - Fix test helper functions

---

## Execution Strategy

**Use 10 parallel agents with Task tool:**

Each agent implements one workstream independently, then commits. After all agents complete, we'll:
1. Test each feature individually
2. Fix any integration issues
3. Re-run full test suite
4. Iterate on failures

**Commit Strategy:**
- Each agent commits their work as they complete it
- Use conventional commit messages
- Keep commits atomic and focused

**Success Criteria:**
- All 10 features implemented and committed
- Test pass rate increases from 37% to 70%+
- No TypeScript compilation errors
- Frontend compiles and runs without errors
