# Frontend Integration Guide

Guide for integrating a custom frontend with the iofold backend API.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Application                      │
│                   (Your Custom Dashboard)                    │
│                                                              │
│  - React / Vue / Svelte / Next.js / etc.                    │
│  - Hosted anywhere (Vercel, Netlify, Cloudflare Pages)      │
│  - Communicates via REST API + SSE                          │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     │ HTTP/HTTPS + SSE
                     │
┌────────────────────▼─────────────────────────────────────────┐
│                  iofold Backend API                          │
│              (Cloudflare Workers + D1)                       │
│                                                              │
│  Base URL: https://your-worker.workers.dev/v1               │
│  - REST API endpoints                                        │
│  - SSE streaming for real-time updates                      │
│  - Job queue for async operations                           │
└──────────────────────────────────────────────────────────────┘
```

## Backend Setup

### 1. Deploy Backend to Cloudflare

The backend is already implemented and ready to deploy:

```bash
cd /path/to/iofold

# Install dependencies
npm install

# Configure Cloudflare (first time only)
npx wrangler login

# Create D1 database
npx wrangler d1 create iofold-db

# Update wrangler.toml with database binding
# [[d1_databases]]
# binding = "DB"
# database_name = "iofold-db"
# database_id = "<id from previous command>"

# Run migrations
npx wrangler d1 execute iofold-db --file=./schema.sql

# Deploy to Cloudflare Workers
npm run deploy
```

Your backend will be available at:
```
https://iofold-api.<your-subdomain>.workers.dev/v1
```

### 2. Backend Environment Variables

Configure in `wrangler.toml`:

```toml
[vars]
# Required
ANTHROPIC_API_KEY = "sk-ant-..."  # For eval generation

# Optional
OPENAI_API_KEY = "sk-..."         # If using OpenAI integration
LANGSMITH_API_KEY = "lsv2_..."    # If using Langsmith integration

# CORS (for frontend)
ALLOWED_ORIGINS = "https://your-frontend.com,http://localhost:3000"
```

### 3. Test Backend is Running

```bash
# Health check (add this endpoint if needed)
curl https://your-worker.workers.dev/v1/api/eval-sets

# Expected: {"eval_sets": []}
```

## Frontend Setup

### 1. Environment Variables

Create `.env.local` (or equivalent for your framework):

```bash
# Backend API URL
NEXT_PUBLIC_API_URL=https://your-worker.workers.dev/v1
# or for development:
NEXT_PUBLIC_API_URL=http://localhost:8787/v1

# Workspace ID (for MVP)
NEXT_PUBLIC_WORKSPACE_ID=test-workspace-1

# Optional: Enable debug logging
NEXT_PUBLIC_DEBUG=true
```

### 2. Install Dependencies

```bash
npm install
# or
yarn add
# or
pnpm add
```

**Recommended packages:**
- HTTP client: `axios` or native `fetch`
- Real-time: `eventsource` or native `EventSource`
- State management: `@tanstack/react-query`, `swr`, or `zustand`
- Types: Copy `/frontend/types/api.ts` to your project

### 3. API Client Setup

You can copy and adapt the existing API client:

**Location:** `/frontend/lib/api-client.ts`

**Key features:**
- Automatic header injection (`X-Workspace-Id`, `Content-Type`)
- Error handling with typed errors
- Support for all endpoints
- SSE streaming helpers

**Usage:**
```typescript
import { apiClient } from '@/lib/api-client'

// Configure once at app initialization
apiClient.setAuth('', 'test-workspace-1')

// Use throughout your app
const traces = await apiClient.listTraces({ has_feedback: false })
const evalSets = await apiClient.listEvalSets()
```

### 4. TypeScript Types

Copy the complete type definitions:

**Source:** `/frontend/types/api.ts`
**Destination:** Your project's types directory

```bash
cp /path/to/iofold/frontend/types/api.ts /your-frontend/src/types/
```

All request/response types are fully typed for TypeScript autocomplete.

## Integration Patterns

### Pattern 1: Polling for Job Status

```typescript
async function waitForJob(jobId: string): Promise<Job> {
  while (true) {
    const job = await apiClient.getJob(jobId)

    if (job.status === 'completed') {
      return job
    }

    if (job.status === 'failed' || job.status === 'cancelled') {
      throw new Error(job.error || 'Job failed')
    }

    // Wait 1 second before polling again
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

// Usage
const { job_id } = await apiClient.importTraces({ integration_id: '...' })
const result = await waitForJob(job_id)
```

### Pattern 2: SSE Streaming (Recommended)

```typescript
function streamJobProgress(
  jobId: string,
  onProgress: (progress: number) => void,
  onComplete: (result: any) => void,
  onError: (error: string) => void
) {
  const eventSource = apiClient.streamJob(jobId)

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data)

    switch (data.type) {
      case 'job_progress':
        onProgress(data.progress)
        break
      case 'job_completed':
        onComplete(data.result)
        eventSource.close()
        break
      case 'job_failed':
        onError(data.error)
        eventSource.close()
        break
    }
  }

  eventSource.onerror = () => {
    onError('Connection lost')
    eventSource.close()
  }

  return () => eventSource.close() // Cleanup function
}

// Usage in React
useEffect(() => {
  const cleanup = streamJobProgress(
    jobId,
    setProgress,
    setResult,
    setError
  )
  return cleanup
}, [jobId])
```

### Pattern 3: React Query Integration

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// Fetch traces without feedback
function useTracesForReview() {
  return useQuery({
    queryKey: ['traces', 'review'],
    queryFn: () => apiClient.listTraces({
      has_feedback: false,
      limit: 50
    })
  })
}

// Submit feedback
function useSubmitFeedback() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: SubmitFeedbackRequest) =>
      apiClient.submitFeedback(data),
    onSuccess: () => {
      // Invalidate traces query to refetch
      queryClient.invalidateQueries({ queryKey: ['traces'] })
    }
  })
}

// Usage in component
function TraceReview() {
  const { data, isLoading } = useTracesForReview()
  const submitFeedback = useSubmitFeedback()

  const handleFeedback = (traceId: string, rating: string) => {
    submitFeedback.mutate({
      trace_id: traceId,
      eval_set_id: evalSetId,
      rating
    })
  }

  // ...
}
```

### Pattern 4: Error Handling

```typescript
import { APIError } from '@/lib/api-client'

try {
  const result = await apiClient.createEvalSet(data)
} catch (error) {
  if (error instanceof APIError) {
    switch (error.code) {
      case 'VALIDATION_ERROR':
        showError('Invalid input: ' + error.message)
        break
      case 'NOT_FOUND':
        showError('Resource not found')
        break
      case 'RATE_LIMIT_EXCEEDED':
        showError('Too many requests, please wait')
        break
      default:
        showError('An error occurred: ' + error.message)
    }

    // Log request ID for debugging
    console.error('Request ID:', error.requestId)
  } else {
    showError('Network error')
  }
}
```

## Key Endpoints Reference

### Most Common Operations

```typescript
// 1. List eval sets
const { eval_sets } = await apiClient.listEvalSets()

// 2. Get traces for review (without filtering by eval_set_id!)
const { traces } = await apiClient.listTraces({
  has_feedback: false,
  limit: 50
})

// 3. Submit feedback (this associates trace with eval set)
await apiClient.submitFeedback({
  trace_id: trace.id,
  eval_set_id: currentEvalSet.id,
  rating: 'positive' // or 'negative', 'neutral'
})

// 4. Get eval set with stats
const evalSet = await apiClient.getEvalSet(evalSetId)
// Returns: { stats: { positive_count, negative_count, neutral_count } }

// 5. Generate eval
const { job_id } = await apiClient.generateEval(evalSetId, {
  name: 'Check Response Quality'
})

// 6. Monitor job
const eventSource = apiClient.streamJob(job_id)
// Or: poll with apiClient.getJob(job_id)

// 7. List evals
const { evals } = await apiClient.listEvals({
  eval_set_id: evalSetId
})

// 8. Execute eval
const { job_id } = await apiClient.executeEval(evalId, {
  trace_ids: [...], // Optional: specific traces
  force: false      // Optional: re-execute
})
```

## Important Notes for Frontend Developers

### 1. Trace-Eval Set Association

**Critical:** Traces are NOT associated with eval sets until feedback is submitted.

**Wrong:**
```typescript
// ❌ This will return empty results for new eval sets
const traces = await apiClient.listTraces({
  eval_set_id: newEvalSetId,
  has_feedback: false
})
```

**Correct:**
```typescript
// ✅ Fetch all traces without feedback (no eval_set_id filter)
const traces = await apiClient.listTraces({
  has_feedback: false
})

// Then submit feedback to associate with eval set
await apiClient.submitFeedback({
  trace_id: trace.id,
  eval_set_id: currentEvalSet.id,
  rating: rating
})
```

### 2. Async Operations

Import, generate, and execute operations return a `job_id`. You must:

1. Poll job status: `GET /api/jobs/{job_id}`
2. Or stream with SSE: `GET /api/jobs/{job_id}/stream`

**Don't assume immediate completion.**

### 3. Pagination

Use cursor-based pagination:

```typescript
let allTraces = []
let cursor = null

do {
  const response = await apiClient.listTraces({
    cursor,
    limit: 100
  })
  allTraces.push(...response.traces)
  cursor = response.next_cursor
} while (response.has_more)
```

### 4. Real-time Updates

For dashboards, use SSE streaming:

```typescript
// Stream eval set updates (feedback, threshold, generation)
const eventSource = apiClient.streamEvalSet(evalSetId)

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data)

  switch (data.type) {
    case 'feedback_added':
      updateStats(data.stats)
      break
    case 'threshold_reached':
      showGenerateButton(data.ready_to_generate)
      break
    case 'eval_generated':
      addEvalToList(data.eval_id, data.accuracy)
      break
  }
}
```

### 5. Error Codes

Common error codes to handle:

- `VALIDATION_ERROR` - Invalid input data
- `NOT_FOUND` - Resource doesn't exist
- `INSUFFICIENT_EXAMPLES` - Not enough traces for eval generation
- `GENERATION_FAILED` - LLM generation failed
- `EXECUTION_ERROR` - Eval execution failed
- `RATE_LIMIT_EXCEEDED` - Too many requests

### 6. CORS

If you encounter CORS errors, ensure:

1. Backend `ALLOWED_ORIGINS` includes your frontend URL
2. Credentials are not required (no cookies/auth for MVP)
3. Use correct headers: `Content-Type: application/json`, `X-Workspace-Id: {id}`

## Testing

### Local Development

1. Start backend: `npm run dev` (runs on `http://localhost:8787`)
2. Start frontend: `npm run dev` (your framework's dev command)
3. Set `NEXT_PUBLIC_API_URL=http://localhost:8787/v1`

### Test API Connection

```typescript
// Simple connection test
async function testConnection() {
  try {
    const response = await fetch('http://localhost:8787/v1/api/eval-sets', {
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Id': 'test-workspace-1'
      }
    })

    if (response.ok) {
      console.log('✅ Backend connection successful')
      const data = await response.json()
      console.log('Eval sets:', data.eval_sets)
    } else {
      console.error('❌ Backend error:', response.status)
    }
  } catch (error) {
    console.error('❌ Connection failed:', error)
  }
}
```

## Deployment Checklist

### Backend
- [ ] Deploy to Cloudflare Workers
- [ ] Run database migrations
- [ ] Set environment variables (API keys)
- [ ] Configure CORS with frontend URL
- [ ] Test API endpoints work

### Frontend
- [ ] Update `NEXT_PUBLIC_API_URL` to production URL
- [ ] Verify API client configuration
- [ ] Test error handling
- [ ] Test SSE streaming
- [ ] Test pagination
- [ ] Deploy frontend to hosting platform

### Integration
- [ ] Test end-to-end workflows
- [ ] Verify CORS configuration
- [ ] Test async operations (import, generate, execute)
- [ ] Verify real-time updates work
- [ ] Load test if expecting high traffic

## Example Frontend Pages

### Minimal Implementation

**1. Eval Sets List Page**
- `GET /api/eval-sets` - Show all eval sets
- Show stats: positive/negative/neutral counts
- "Create Eval Set" button → POST /api/eval-sets
- Click eval set → Navigate to detail page

**2. Eval Set Detail Page**
- `GET /api/eval-sets/{id}` - Show eval set details
- Display feedback stats
- "Review Traces" button → Navigate to review page
- "Generate Eval" button → POST /api/eval-sets/{id}/generate

**3. Trace Review Page**
- `GET /api/traces?has_feedback=false` - Fetch traces
- Display trace content (messages, tool calls)
- Feedback buttons (👍 👎 😐) → POST /api/feedback
- Progress tracking
- Auto-advance to next trace

**4. Evals List Page**
- `GET /api/evals?eval_set_id={id}` - Show generated evals
- Display: name, accuracy, execution count
- Click eval → Navigate to detail page

**5. Eval Detail Page**
- `GET /api/evals/{id}` - Show eval details
- Display Python code (syntax highlighted)
- Display test results
- "Execute" button → POST /api/evals/{id}/execute

## Reference Implementation

The existing Next.js frontend in `/frontend` is a complete reference implementation with:

- All API endpoints integrated
- Error handling patterns
- SSE streaming
- React Query integration
- Swipable card interface
- Job progress monitoring

You can use it as a reference or adapt components for your custom frontend.

## Support & Resources

- **API Specification:** `/docs/API_SPECIFICATION.md`
- **Database Schema:** `/schema.sql`
- **Type Definitions:** `/frontend/types/api.ts`
- **Reference Client:** `/frontend/lib/api-client.ts`
- **Example Components:** `/frontend/components/` and `/frontend/app/`

## Common Issues

### Issue: "CORS policy" error

**Solution:** Add your frontend URL to `ALLOWED_ORIGINS` in `wrangler.toml` and redeploy.

### Issue: "No traces to review" despite traces existing

**Solution:** Don't filter by `eval_set_id` when fetching traces for review. See section 1 above.

### Issue: Jobs never complete

**Solution:** Check backend logs. Ensure API keys are set for LLM providers. Verify queue worker is running.

### Issue: SSE connection drops

**Solution:** Implement reconnection logic. SSE can timeout after 30s-60s of inactivity. Send keep-alive pings from backend.

### Issue: Type errors

**Solution:** Ensure you copied `/frontend/types/api.ts` and all imports resolve correctly.

---

**Last Updated:** 2025-11-17
**API Version:** v1
