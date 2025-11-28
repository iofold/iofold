# Frontend/Backend Separation Guide

Quick guide for splitting the iofold frontend and backend into separate deployments.

## TL;DR

The iofold platform is already architected for frontend/backend separation:

- **Backend:** Cloudflare Workers + D1 database (REST API + SSE)
- **Frontend:** Any framework, hosted anywhere
- **Communication:** REST API over HTTP/HTTPS + Server-Sent Events (SSE)

## Documentation Provided

### 1. **API Specification** (`/docs/API_SPECIFICATION.md`)
Complete REST API documentation with:
- All endpoints (Integrations, Traces, Eval Sets, Feedback, Evals, Jobs, Matrix)
- Request/response schemas
- Query parameters and pagination
- SSE streaming endpoints
- Error handling
- Example workflows
- TypeScript types

**Pass this to your frontend developer.**

### 2. **Frontend Integration Guide** (`/docs/FRONTEND_INTEGRATION_GUIDE.md`)
Step-by-step guide for integrating a custom frontend:
- Backend deployment instructions
- Frontend setup and configuration
- API client patterns
- React Query integration examples
- SSE streaming patterns
- Common pitfalls and solutions
- Testing checklist
- Deployment checklist

**Use this as an implementation reference.**

### 3. **Type Definitions** (`/frontend/types/api.ts`)
Complete TypeScript type definitions for:
- All request/response types
- Entity models (Trace, EvalSet, Eval, Feedback, etc.)
- Error responses
- SSE events

**Copy this file to your frontend project.**

### 4. **Reference API Client** (`/frontend/lib/api-client.ts`)
Production-ready API client with:
- Automatic header injection
- Error handling
- All endpoint methods
- SSE streaming helpers

**Adapt this for your frontend framework.**

## Quick Start

### Backend Setup (5 minutes)

```bash
# 1. Deploy to Cloudflare
cd /path/to/iofold
npm install
npx wrangler login

# 2. Create database
npx wrangler d1 create iofold-db
# Copy the database_id from output

# 3. Update wrangler.toml with database_id
# [[d1_databases]]
# binding = "DB"
# database_id = "<paste-id-here>"

# 4. Run migrations
npx wrangler d1 execute iofold-db --file=./schema.sql

# 5. Set API keys in wrangler.toml
# [vars]
# ANTHROPIC_API_KEY = "sk-ant-..."

# 6. Deploy
npm run deploy

# Your API is now live at:
# https://iofold-api.<subdomain>.workers.dev/v1
```

### Frontend Setup (2 minutes)

```bash
# 1. Set environment variables
echo "NEXT_PUBLIC_API_URL=https://your-worker.workers.dev/v1" > .env.local
echo "NEXT_PUBLIC_WORKSPACE_ID=test-workspace-1" >> .env.local

# 2. Copy type definitions
cp /path/to/iofold/frontend/types/api.ts ./src/types/

# 3. Copy API client (optional, or write your own)
cp /path/to/iofold/frontend/lib/api-client.ts ./src/lib/

# 4. Start development
npm run dev
```

### Test Connection

```typescript
// Test API is accessible
fetch('https://your-worker.workers.dev/v1/api/eval-sets', {
  headers: {
    'Content-Type': 'application/json',
    'X-Workspace-Id': 'test-workspace-1'
  }
})
  .then(res => res.json())
  .then(data => console.log('✅ Connected:', data))
  .catch(err => console.error('❌ Error:', err))
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   Custom Frontend                            │
│                                                              │
│  Tech: React/Vue/Svelte/Angular/etc.                        │
│  Hosting: Vercel/Netlify/Cloudflare Pages/AWS/etc.         │
│  URL: https://your-frontend.com                             │
│                                                              │
│  Features:                                                   │
│  - Dashboard UI                                              │
│  - Trace review interface                                    │
│  - Eval management                                           │
│  - Real-time updates (SSE)                                   │
└─────────────────────┬────────────────────────────────────────┘
                      │
                      │ HTTPS + SSE
                      │ Headers: X-Workspace-Id, Content-Type
                      │
┌─────────────────────▼────────────────────────────────────────┐
│              iofold Backend API                              │
│                                                              │
│  Tech: Cloudflare Workers + D1 (SQLite)                     │
│  URL: https://iofold-api.workers.dev/v1                     │
│                                                              │
│  Endpoints:                                                  │
│  - POST   /api/integrations                                  │
│  - GET    /api/traces                                        │
│  - POST   /api/feedback                                      │
│  - POST   /api/eval-sets/{id}/generate                       │
│  - GET    /api/jobs/{id}/stream (SSE)                        │
│  - ... 30+ endpoints                                         │
│                                                              │
│  Storage:                                                    │
│  - D1 Database (SQLite)                                      │
│  - Encrypted API keys                                        │
│  - Job queue                                                 │
└──────────────────────────────────────────────────────────────┘
```

## Key Integration Points

### 1. API Client

```typescript
import { apiClient } from '@/lib/api-client'

// Configure once
apiClient.setAuth('', 'test-workspace-1')

// Use everywhere
const traces = await apiClient.listTraces({ has_feedback: false })
const evalSets = await apiClient.listEvalSets()
const { job_id } = await apiClient.generateEval(evalSetId, { name: '...' })
```

### 2. Async Operations (Jobs)

```typescript
// Start async operation
const { job_id } = await apiClient.importTraces({ ... })

// Option A: Poll for status
const job = await apiClient.getJob(job_id)

// Option B: Stream progress (recommended)
const eventSource = apiClient.streamJob(job_id)
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data)
  if (data.type === 'job_completed') {
    console.log('Done!', data.result)
  }
}
```

### 3. Real-time Updates

```typescript
// Stream eval set updates
const eventSource = apiClient.streamEvalSet(evalSetId)

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data)

  switch (data.type) {
    case 'feedback_added':
      updateFeedbackStats(data.stats)
      break
    case 'eval_generated':
      showNewEval(data.eval_id)
      break
  }
}
```

## Critical Implementation Notes

### ⚠️ Trace-Eval Set Association

**Problem:** Traces don't belong to an eval set until feedback is submitted.

**Wrong:**
```typescript
// ❌ This returns empty for new eval sets
const traces = await apiClient.listTraces({
  eval_set_id: newEvalSetId
})
```

**Correct:**
```typescript
// ✅ Don't filter by eval_set_id when fetching for review
const traces = await apiClient.listTraces({
  has_feedback: false  // No eval_set_id here!
})

// Association happens when submitting feedback
await apiClient.submitFeedback({
  trace_id: trace.id,
  eval_set_id: currentEvalSet.id,  // Association created here
  rating: 'positive'
})
```

### ⚠️ Error Handling

```typescript
import { APIError } from '@/lib/api-client'

try {
  await apiClient.createEvalSet(data)
} catch (error) {
  if (error instanceof APIError) {
    console.error('API Error:', error.code, error.message)
    console.error('Request ID:', error.requestId)
  }
}
```

### ⚠️ CORS Configuration

Add your frontend URL to backend `wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGINS = "https://your-frontend.com,http://localhost:3000"
```

Then redeploy backend: `npm run deploy`

## Migration Path

### Option 1: Keep Both Frontends

```
Backend (Cloudflare Workers)
  ├── Old Frontend (Next.js) - /frontend
  └── New Frontend (Your custom) - separate repo
```

Both frontends use the same backend API. You can:
- Run both in parallel
- Gradually migrate pages
- A/B test interfaces
- Retire old frontend when ready

### Option 2: Replace Frontend

```
Backend (Cloudflare Workers)
  └── New Frontend (Your custom) - separate repo
      ├── Delete /frontend directory
      └── Update documentation
```

### Option 3: Keep Backend Only

```
iofold-backend/
  ├── src/api/          - API implementation
  ├── schema.sql        - Database schema
  ├── wrangler.toml     - Cloudflare config
  └── docs/             - API docs

your-frontend/         - Separate repo
  ├── src/
  ├── types/api.ts     - Copied from iofold
  └── .env.local       - API_URL configured
```

## Current Frontend (Reference)

The existing Next.js frontend in `/frontend` is a complete reference implementation showing:

- **Pages:**
  - `/` - Dashboard
  - `/integrations` - Platform connections
  - `/traces` - Trace browser
  - `/eval-sets` - Eval set management
  - `/eval-sets/[id]` - Eval set detail
  - `/review` - Swipe interface for feedback
  - `/evals` - Eval list
  - `/evals/[id]` - Eval detail

- **Components:**
  - `swipable-trace-card.tsx` - Gesture-based feedback
  - `providers.tsx` - React Query setup
  - `ui/*` - Shadcn UI components

- **Features:**
  - Keyboard shortcuts (1/2/3 for feedback)
  - Real-time progress tracking
  - SSE streaming for jobs
  - Toast notifications
  - Error boundaries
  - Loading states

**Use as reference or copy components you need.**

## Deployment Options

### Backend
- **Cloudflare Workers** (recommended, already configured)
- AWS Lambda + API Gateway
- Google Cloud Functions
- Docker container (Fly.io, Railway, etc.)

### Frontend
- **Cloudflare Pages** (same provider as backend)
- Vercel (great for Next.js)
- Netlify (great for static sites)
- AWS Amplify
- Self-hosted (Nginx, Apache)

### Recommended: Both on Cloudflare
- **Backend:** Cloudflare Workers (`api.iofold.com`)
- **Frontend:** Cloudflare Pages (`app.iofold.com`)
- **Benefits:** Same provider, low latency, easy CORS, free tier

## Checklist for Your Frontend Developer

- [ ] Read `/docs/API_SPECIFICATION.md` completely
- [ ] Read `/docs/FRONTEND_INTEGRATION_GUIDE.md`
- [ ] Copy `/frontend/types/api.ts` to project
- [ ] Copy or adapt `/frontend/lib/api-client.ts`
- [ ] Set up environment variables (API_URL, WORKSPACE_ID)
- [ ] Test backend connection
- [ ] Implement eval sets list page
- [ ] Implement trace review interface
- [ ] Implement feedback submission
- [ ] Implement eval generation workflow
- [ ] Test async operations (jobs)
- [ ] Test SSE streaming
- [ ] Implement error handling
- [ ] Test CORS configuration
- [ ] Deploy and test production

## Support Files

All necessary files for frontend/backend split:

1. **API Docs:** `/docs/API_SPECIFICATION.md` (30+ endpoints documented)
2. **Integration Guide:** `/docs/FRONTEND_INTEGRATION_GUIDE.md` (step-by-step)
3. **Types:** `/frontend/types/api.ts` (TypeScript definitions)
4. **Client:** `/frontend/lib/api-client.ts` (reference implementation)
5. **Schema:** `/schema.sql` (database structure)
6. **Examples:** `/frontend/app/*` and `/frontend/components/*` (reference UI)

## Questions?

**Backend Issues:**
- Check `/src/api/` for implementation details
- Review error logs in Cloudflare dashboard
- Verify environment variables are set

**Frontend Issues:**
- Check API client configuration
- Verify CORS settings
- Test with curl/Postman first
- Review browser network tab

**Integration Issues:**
- Verify base URL is correct
- Check X-Workspace-Id header
- Test with reference frontend first
- Compare with working examples in `/frontend`

---

**You're ready to split frontend and backend! 🚀**

Pass these docs to your frontend developer and they'll have everything needed to build against your backend API.
