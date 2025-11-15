# Bug Fix Quick Reference Guide

**Priority**: CRITICAL - These bugs block all eval workflow testing
**Estimated Total Time**: 4-6 hours
**Files to Modify**: 2-3 frontend files

---

## BUG-001: Eval Sets Page Crashes (2-3 hours)

### Step 1: Check Browser Console

```bash
# Start frontend
cd frontend && npm run dev

# Open http://localhost:3000/eval-sets in browser
# Open developer console (F12)
# Check for error messages
```

### Step 2: Add Null Checks

**File**: `/frontend/app/eval-sets/page.tsx`

**Problem Areas** (lines 50-75):
```tsx
{data?.eval_sets.map((evalSet) => (
  // ...
  <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-700">
    {evalSet.stats.positive_count} positive  // ← evalSet.stats might be undefined
  </span>
))}
```

**Fix**: Add null checks
```tsx
{data?.eval_sets.map((evalSet) => (
  // ...
  <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-700">
    {evalSet.stats?.positive_count ?? 0} positive
  </span>
  <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-700">
    {evalSet.stats?.negative_count ?? 0} negative
  </span>
  <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700">
    {evalSet.stats?.neutral_count ?? 0} neutral
  </span>
))}
```

### Step 3: Check Date Formatting

**Problem** (line 71):
```tsx
<p className="text-xs text-muted-foreground">
  Updated {formatRelativeTime(evalSet.updated_at)}  // ← Date might be invalid
</p>
```

**Fix**: Add date validation
```tsx
<p className="text-xs text-muted-foreground">
  Updated {evalSet.updated_at ? formatRelativeTime(evalSet.updated_at) : 'recently'}
</p>
```

### Step 4: Test Fix

```bash
# Refresh http://localhost:3000/eval-sets
# Should see "No eval sets found" message (not "Page error")
```

### Step 5: Run API Test to Create Data

```bash
npx playwright test tests/e2e/04-eval-sets/eval-set-api.spec.ts
```

Should see eval set appear in UI now.

---

## BUG-002: Create Eval Set Modal (2-3 hours)

### Step 1: Create Modal Component

**File**: `/frontend/components/modals/CreateEvalSetModal.tsx` (NEW FILE)

```tsx
'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

interface CreateEvalSetModalProps {
  children: React.ReactNode
}

export function CreateEvalSetModal({ children }: CreateEvalSetModalProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      apiClient.createEvalSet(data),
    onSuccess: () => {
      toast.success('Eval set created successfully')
      queryClient.invalidateQueries({ queryKey: ['eval-sets'] })
      setOpen(false)
      setName('')
      setDescription('')
    },
    onError: (error: Error) => {
      toast.error(`Failed to create eval set: ${error.message}`)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
    })
  }

  return (
    <>
      <div onClick={() => setOpen(true)}>{children}</div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Eval Set</DialogTitle>
            <DialogDescription>
              Create a new eval set to organize feedback for generating evals.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Quality Evaluation Set"
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the purpose of this eval set..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Optional: Add a description to help you remember the purpose of this eval set.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Eval Set'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

### Step 2: Update Eval Sets Page

**File**: `/frontend/app/eval-sets/page.tsx`

**Add import** (line 12):
```tsx
import { CreateEvalSetModal } from '@/components/modals/CreateEvalSetModal'
```

**Replace button** (lines 29-32):
```tsx
<CreateEvalSetModal>
  <Button>
    <Plus className="w-4 h-4 mr-2" />
    Create Eval Set
  </Button>
</CreateEvalSetModal>
```

### Step 3: Test Modal

```bash
# Refresh page
# Click "Create Eval Set" button
# Modal should open
# Fill in form and submit
# Should see toast notification and new eval set in list
```

---

## BUG-003: Delete Functionality (1-2 hours)

### Step 1: Add Delete Button to Cards

**File**: `/frontend/app/eval-sets/page.tsx`

**Import** (top of file):
```tsx
import { Trash2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
```

**Add delete mutation** (after data fetching, around line 19):
```tsx
const queryClient = useQueryClient()

const deleteMutation = useMutation({
  mutationFn: (id: string) => apiClient.deleteEvalSet(id),
  onSuccess: () => {
    toast.success('Eval set deleted successfully')
    queryClient.invalidateQueries({ queryKey: ['eval-sets'] })
  },
  onError: (error: Error) => {
    toast.error(`Failed to delete eval set: ${error.message}`)
  },
})

const handleDelete = (id: string, name: string, e: React.MouseEvent) => {
  e.preventDefault() // Prevent navigation
  e.stopPropagation()

  if (window.confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
    deleteMutation.mutate(id)
  }
}
```

**Update card JSX** (around line 51):
```tsx
<Link key={evalSet.id} href={`/eval-sets/${evalSet.id}`}>
  <Card className="p-6 hover:bg-accent transition-colors cursor-pointer relative group">
    {/* Delete button - positioned absolutely in top right */}
    <Button
      variant="ghost"
      size="icon"
      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
      onClick={(e) => handleDelete(evalSet.id, evalSet.name, e)}
      disabled={deleteMutation.isPending}
    >
      <Trash2 className="w-4 h-4 text-red-600" />
    </Button>

    <h3 className="font-semibold mb-2 pr-8">{evalSet.name}</h3>
    {/* ... rest of card ... */}
  </Card>
</Link>
```

### Step 2: Test Delete

```bash
# Refresh page
# Hover over eval set card
# Should see delete button appear in top right
# Click delete button
# Confirm in dialog
# Eval set should be removed from list
```

---

## Verification Checklist

After fixing all bugs, verify:

### ✅ BUG-001 Fixed
- [ ] Navigate to `/eval-sets` - no "Page error"
- [ ] Page shows "No eval sets found" when empty
- [ ] Page shows eval set cards when data exists
- [ ] Stats display correctly (positive, negative, neutral counts)
- [ ] Date displays correctly

### ✅ BUG-002 Fixed
- [ ] "Create Eval Set" button opens modal
- [ ] Modal has name and description fields
- [ ] Submitting empty name shows error
- [ ] Submitting valid form creates eval set
- [ ] New eval set appears in list
- [ ] Toast notification shown on success

### ✅ BUG-003 Fixed
- [ ] Delete button appears on hover
- [ ] Clicking delete shows confirmation dialog
- [ ] Confirming delete removes eval set
- [ ] Toast notification shown on success
- [ ] List updates without page refresh

---

## Run Tests After Fixes

```bash
# Run all eval set tests
npx playwright test tests/e2e/04-eval-sets --timeout=60000

# Expected: 6 tests pass
# ✓ TEST-ES01-API: Create eval set via API
# ✓ TEST-ES06-API: Delete eval set via API
# ✓ TEST-ES01: Create eval set via UI
# ✓ TEST-ES06: Delete eval set via UI
# ✓ TEST-ES03: View eval set detail
# ✓ TEST-ES04: Feedback summary calculation

# Run all eval tests (these depend on eval sets working)
npx playwright test tests/e2e/05-evals --timeout=180000

# Expected: 5 tests pass (eval generation takes 60-90s)
# ✓ TEST-E01: Generate eval
# ✓ TEST-E02: Insufficient feedback error
# ✓ TEST-E03: View eval code
# ✓ TEST-E04: Execute eval
# ✓ TEST-E05: View execution results
# ✓ TEST-E06: Contradiction detection

# Run all tests together
npx playwright test tests/e2e/04-eval-sets tests/e2e/05-evals --timeout=180000

# Expected: 11/11 tests pass (100%)
```

---

## Common Issues

### Issue: "Cannot find module '@/components/ui/dialog'"

**Solution**: Create missing UI components
```bash
# Install shadcn/ui dialog
npx shadcn-ui@latest add dialog

# Or manually copy from shadcn/ui documentation
```

### Issue: "Cannot find module 'sonner'"

**Solution**: Install toast library
```bash
npm install sonner
```

### Issue: Tests still fail after fixes

**Solution**: Clear test results and retry
```bash
rm -rf test-results playwright-report
npx playwright test --timeout=180000
```

### Issue: Eval generation times out

**Solution**: Increase timeout
```bash
# In playwright.config.ts
timeout: 300 * 1000, // 5 minutes
```

---

## Success Criteria

### Tests Should Show:
```
Running 11 tests using 4 workers

✓ [chromium] › tests/e2e/04-eval-sets/eval-set-api.spec.ts:28:7 › TEST-ES01-API
✓ [chromium] › tests/e2e/04-eval-sets/eval-set-api.spec.ts:60:7 › TEST-ES06-API
✓ [chromium] › tests/e2e/04-eval-sets/create-eval-set.spec.ts:25:7 › TEST-ES01
✓ [chromium] › tests/e2e/04-eval-sets/create-eval-set.spec.ts:84:7 › TEST-ES06
✓ [chromium] › tests/e2e/04-eval-sets/eval-set-detail.spec.ts:44:7 › TEST-ES03
✓ [chromium] › tests/e2e/04-eval-sets/eval-set-detail.spec.ts:72:7 › TEST-ES04
✓ [chromium] › tests/e2e/05-evals/generate-eval.spec.ts:56:7 › TEST-E01
✓ [chromium] › tests/e2e/05-evals/generate-eval.spec.ts:182:7 › TEST-E02
✓ [chromium] › tests/e2e/05-evals/execute-eval.spec.ts:70:7 › TEST-E03
✓ [chromium] › tests/e2e/05-evals/execute-eval.spec.ts:106:7 › TEST-E04
✓ [chromium] › tests/e2e/05-evals/eval-results.spec.ts:57:7 › TEST-E05

11 passed (5-10 minutes)
```

---

## Timeline Summary

| Bug | Priority | Estimated Time | Status |
|-----|----------|---------------|--------|
| BUG-001: Page crash | P0 | 2-3 hours | ⏳ To Do |
| BUG-002: Create modal | P0 | 2-3 hours | ⏳ To Do |
| BUG-003: Delete button | P1 | 1-2 hours | ⏳ To Do |
| **Total** | | **4-6 hours** | |

---

## Need Help?

### Documentation References
- [TEST_EXECUTION_REPORT.md](./TEST_EXECUTION_REPORT.md) - Detailed bug reports
- [EVAL_WORKFLOW_BUGS.md](./EVAL_WORKFLOW_BUGS.md) - Bug descriptions and impact
- [TESTING_SUMMARY.md](./TESTING_SUMMARY.md) - High-level overview
- [tests/README.md](./tests/README.md) - Test suite documentation

### Code References
- Generate Eval Modal: `/frontend/components/modals/GenerateEvalModal.tsx` (working example)
- Dialog Component: `/frontend/components/ui/dialog.tsx`
- Button Component: `/frontend/components/ui/button.tsx`
- API Client: `/frontend/lib/api-client.ts`

---

**Last Updated**: 2025-11-14
**Status**: Ready for implementation
**Estimated Completion**: 1-2 days with focused development
