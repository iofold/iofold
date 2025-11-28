# iofold Module Overview

Complete breakdown of all modules, their responsibilities, and dependencies in the iofold codebase.

## Project Structure

```
iofold/
├── src/               # Backend (Cloudflare Workers)
├── frontend/          # Frontend (Next.js)
├── docs/             # Documentation
└── schema.sql        # Database schema
```

---

## Backend Modules (`/src`)

### 1. **API Layer** (`/src/api`)

REST API endpoints and request handlers for Cloudflare Workers.

#### Files:

**`index.ts`** - Main API router
- Routes all HTTP requests to appropriate handlers
- Pattern matching for dynamic routes (`/api/traces/:id`)
- 404 handling for unknown endpoints

**`traces.ts`** - Trace management endpoints
- `POST /api/traces/import` - Import traces from external platforms
- `GET /api/traces` - List traces with filtering & pagination
- `GET /api/traces/:id` - Get trace detail
- `DELETE /api/traces/:id` - Delete single trace
- `DELETE /api/traces` - Bulk delete traces

**`eval-sets.ts`** - Eval set management
- `POST /api/eval-sets` - Create eval set
- `GET /api/eval-sets` - List all eval sets
- `GET /api/eval-sets/:id` - Get eval set with stats
- `PATCH /api/eval-sets/:id` - Update eval set
- `DELETE /api/eval-sets/:id` - Delete eval set

**`feedback.ts`** - Human feedback submission
- `POST /api/feedback` - Submit feedback on trace
- `PATCH /api/feedback/:id` - Update feedback
- `DELETE /api/feedback/:id` - Delete feedback
- Associates traces with eval sets through feedback

**`evals.ts`** - Eval function management
- `POST /api/eval-sets/:id/generate` - Generate eval from eval set
- `GET /api/evals` - List evals with filtering
- `GET /api/evals/:id` - Get eval detail
- `PATCH /api/evals/:id` - Update eval (name, description, code)
- `DELETE /api/evals/:id` - Delete eval
- `POST /api/evals/:id/execute` - Execute eval on traces

**`integrations.ts`** - External platform connections
- `POST /api/integrations` - Create integration
- `GET /api/integrations` - List integrations
- `POST /api/integrations/:id/test` - Test connection
- `DELETE /api/integrations/:id` - Delete integration

**`jobs.ts`** - Async job management
- `GET /api/jobs/:id` - Get job status
- `GET /api/jobs/:id/stream` - SSE stream for job progress
- `POST /api/jobs/:id/cancel` - Cancel running job
- `GET /api/jobs` - List recent jobs

**`matrix.ts`** - Comparison matrix
- `GET /api/eval-sets/:id/matrix` - Compare human vs eval predictions
- Filters: contradictions only, errors only, date range
- Statistics per eval: accuracy, contradictions, avg time

**`utils.ts`** - Shared API utilities
- Error response formatting
- Request validation helpers
- Pagination utilities

**`matrix.test.ts`** - Matrix API tests
- Test matrix generation
- Test contradiction detection
- Test filtering logic

**Dependencies:**
- D1 Database (Cloudflare)
- Zod for validation
- Job queue for async operations

---

### 2. **Adapters** (`/src/adapters`)

Platform-specific integrations to fetch traces from external observability tools.

#### Files:

**`langfuse.ts`** - Langfuse adapter
- `LangfuseAdapter` class
- `authenticate()` - Verify API key
- `fetchTraces()` - Fetch traces with filters
- `fetchTraceById()` - Get single trace
- Normalizes Langfuse format → `LangGraphExecutionStep`

**`langfuse.test.ts`** - Langfuse adapter tests
- Mock Langfuse API responses
- Test authentication
- Test trace fetching
- Test normalization

**Planned (not yet implemented):**
- `langsmith.ts` - Langsmith adapter
- `openai.ts` - OpenAI adapter

**Interface:**
```typescript
interface TraceAdapter {
  authenticate(apiKey: string): Promise<void>
  fetchTraces(filter: TraceFilter): Promise<Trace[]>
  fetchTraceById(id: string): Promise<Trace>
}
```

**Dependencies:**
- `langfuse` npm package
- Platform-specific SDKs

---

### 3. **Eval Generator** (`/src/eval-generator`)

LLM-powered eval function generation using meta-prompting.

#### Files:

**`generator.ts`** - Core generation logic
- `EvalGenerator` class
- `generate(evalSetId)` - Generate Python eval from training data
- Uses Claude/GPT-4 via Anthropic SDK
- Includes custom instructions in prompt
- Returns: Python code, accuracy, test results

**`generator.test.ts`** - Generator tests
- Mock LLM responses
- Test prompt generation
- Test code extraction
- Test accuracy calculation

**`tester.ts`** - Eval testing & validation
- `EvalTester` class
- `test(code, traces)` - Run eval on training data
- Compute accuracy (correct/incorrect/errors)
- Identify contradictions with human feedback
- Return detailed test results

**`tester.test.ts`** - Tester tests
- Test eval execution
- Test accuracy calculation
- Test error handling

**`prompts.ts`** - Meta-prompt templates
- `generateEvalPrompt()` - Main generation prompt
- `refineEvalPrompt()` - Refinement prompt with contradictions
- Includes training examples, custom instructions
- Structured output format

**Dependencies:**
- `@anthropic-ai/sdk` - Claude API
- Python sandbox for testing

---

### 4. **Sandbox** (`/src/sandbox`)

Secure Python execution environment for running generated eval functions.

#### Files:

**`python-runner.ts`** - Python sandbox
- `PythonRunner` class
- `execute(code, trace)` - Run Python code in sandbox
- Security constraints:
  - Whitelist imports: `json`, `re`, `typing`
  - 5-second timeout
  - 50MB memory limit
  - No network access
  - No file I/O
- Uses `@cloudflare/sandbox` (Pyodide)

**`python-runner.test.ts`** - Sandbox tests
- Test allowed code
- Test blocked imports
- Test timeout enforcement
- Test memory limits
- Test error handling

**Security Model:**
```typescript
{
  allowedImports: ['json', 're', 'typing'],
  timeout: 5000,
  memoryLimit: 50 * 1024 * 1024,
  networkAccess: false,
  fileAccess: false
}
```

**Dependencies:**
- `@cloudflare/sandbox` - Cloudflare Python runtime

---

### 5. **Jobs** (`/src/jobs`)

Background job system for long-running operations.

#### Files:

**`job-manager.ts`** - Job queue management
- `JobManager` class
- `createJob(type, data)` - Create new job
- `getJob(id)` - Get job status
- `updateProgress(id, progress)` - Update job progress
- `completeJob(id, result)` - Mark job complete
- `failJob(id, error)` - Mark job failed
- Stores jobs in D1 database

**`job-worker.ts`** - Job execution worker
- `JobWorker` class
- Polls job queue
- Dispatches to appropriate handler
- Updates progress via SSE
- Error handling & retries

**`trace-import-job.ts`** - Trace import handler
- Fetch traces from external platform via adapter
- Normalize to unified format
- Store in D1 database
- Progress: X/Y traces imported

**`eval-generation-job.ts`** - Eval generation handler
- Fetch training data (traces with feedback)
- Call `EvalGenerator.generate()`
- Test on training data
- Store eval in database
- Progress: Analyzing → Generating → Testing

**`eval-execution-job.ts`** - Eval execution handler
- Fetch traces to evaluate
- Run eval in sandbox for each trace
- Store execution results
- Progress: X/Y traces evaluated

**Job Types:**
```typescript
type JobType = 'import' | 'generate' | 'execute'
type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
```

**Dependencies:**
- D1 for job storage
- SSE for progress streaming
- Adapters, generators, sandbox

---

### 6. **Types** (`/src/types`)

TypeScript type definitions for backend.

#### Files:

**`api.ts`** - API request/response types
- All request interfaces (`CreateEvalSetRequest`, etc.)
- All response interfaces (`ListTracesResponse`, etc.)
- Entity types: `Trace`, `EvalSet`, `Eval`, `Feedback`, etc.
- Job types: `Job`, `JobResponse`
- Error types: `APIError`
- SSE event types

**`trace.ts`** - Trace data structures
- `LangGraphExecutionStep` - Unified trace format
- `Message` - Chat messages
- `ToolCall` - Tool invocations
- Adapter-specific types

**Shared with Frontend:**
`/frontend/types/api.ts` is a copy for type safety across frontend/backend.

---

### 7. **Analytics** (`/src/analytics`)

Cost tracking and usage analytics.

#### Files:

**`cost-tracker.ts`** - LLM usage tracking
- `CostTracker` class
- `trackGeneration()` - Log LLM call costs
- `trackExecution()` - Log eval execution costs
- Calculates costs based on:
  - Model used (Claude/GPT-4)
  - Tokens consumed
  - Execution time

**`cost-tracker.test.ts`** - Cost tracker tests
- Test cost calculation
- Test different models
- Test aggregation

**Dependencies:**
- D1 for cost storage

---

### 8. **Utils** (`/src/utils`)

Shared utility functions.

#### Files:

**`errors.ts`** - Error handling
- `ValidationError` - Input validation errors
- `NotFoundError` - Resource not found
- `RateLimitError` - Rate limiting
- Error serialization

**`crypto.ts`** - Encryption utilities
- `encrypt()` - Encrypt API keys
- `decrypt()` - Decrypt API keys
- Uses Cloudflare Workers crypto API

**`sse.ts`** - Server-Sent Events helpers
- `createSSEResponse()` - Create SSE response
- `sendSSEMessage()` - Send SSE message
- `closeSSEStream()` - Close connection

**Dependencies:**
- Cloudflare Workers Web Crypto API

---

### 9. **Client** (`/src/client`)

SDK for programmatic access to iofold (optional).

#### Files:

**`api-client.ts`** - Programmatic API client
- `IOFoldClient` class
- Methods for all API endpoints
- Type-safe requests
- Error handling

**`examples.ts`** - Usage examples
- Import traces
- Create eval set
- Submit feedback
- Generate eval

**`index.ts`** - Client exports
- Re-export all client functionality

**Use Case:** Allow users to integrate iofold into their CI/CD pipelines.

---

### 10. **Entry Point** (`/src/index.ts`)

Cloudflare Workers entry point.

- `fetch()` handler - Route HTTP requests
- `scheduled()` handler - Cron jobs (future)
- Environment setup
- CORS handling
- Request logging

**Dependencies:**
- All API handlers
- Job manager

---

## Frontend Modules (`/frontend`)

### 1. **Pages** (`/frontend/app`)

Next.js 13+ App Router pages.

#### Files:

**`layout.tsx`** - Root layout
- HTML structure
- Global providers (React Query, Toast)
- Navigation bar
- Font configuration

**`page.tsx`** - Dashboard (home)
- Eval set list
- Quick stats
- Recent activity
- Empty states

**`error.tsx`** - Error boundary page
- Global error handling
- User-friendly error messages

#### Subdirectories:

**`/app/integrations`** - Integrations management
- List integrations
- Add integration modal
- Test connections

**`/app/traces`** - Trace browser
- List traces with filters
- Trace detail modal
- Search & pagination

**`/app/eval-sets`** - Eval set management
- List eval sets
- Create eval set modal
- **`/app/eval-sets/[id]`** - Eval set detail
  - Feedback summary
  - Generated evals list
  - Actions (review, generate, matrix)

**`/app/review`** - Swipe interface ⭐
- `page.tsx` - Review page with swipable cards
- Keyboard shortcuts
- Progress tracking
- Completion screen

**`/app/evals`** - Eval list
- Browse all evals
- Filter by eval set
- Accuracy sorting

**`/app/evals/[id]`** - Eval detail
- Code viewer with syntax highlighting
- Test results tab
- Execution history tab
- Actions (execute, refine, compare)

---

### 2. **Components** (`/frontend/components`)

Reusable React components.

#### UI Components:

**`navigation.tsx`** - Top navigation bar
- Logo
- Links (Home, Integrations, Traces, Eval Sets, Evals)
- Active state styling

**`providers.tsx`** - React context providers
- React Query client setup
- Toast notification provider
- API client initialization

**`error-boundary.tsx`** - Error boundary component
- Catch React errors
- Display fallback UI
- Error reporting

#### Feature Components:

**`trace-card.tsx`** - Trace summary card
- Input/output preview
- Status indicator
- Feedback badge
- Click to expand

**`swipable-trace-card.tsx`** ⭐ - Draggable feedback card
- Framer Motion animations
- Swipe right (positive), left (negative), down (neutral)
- Visual feedback (colored glow, icons)
- Threshold detection

**`trace-detail.tsx`** - Full trace display
- All messages (Human, Assistant, Tool)
- Collapsible tool calls
- JSON formatting
- Metadata display

**`trace-feedback.tsx`** - Feedback display
- Rating emoji
- Notes text
- Timestamp
- Edit button

**`feedback-buttons.tsx`** - Quick feedback buttons
- 👍 Positive
- 👎 Negative
- 😐 Neutral
- Click handlers

**`code-viewer.tsx`** - Syntax-highlighted code display
- Python syntax highlighting
- Line numbers
- Copy button
- Download button

**`matrix-table.tsx`** - Comparison matrix
- Table with human feedback vs eval predictions
- Expandable rows
- Visual indicators (✅ ❌ ⚠️)
- Filtering controls

**`import-traces-modal.tsx`** - Trace import dialog
- Integration selection
- Filter inputs (date, tags, limit)
- Job progress tracking

#### Component Library (`/frontend/components/ui`):

Shadcn UI components (customized):
- `button.tsx`
- `card.tsx`
- `dialog.tsx`
- `input.tsx`
- `label.tsx`
- `progress.tsx`
- `select.tsx`
- `skeleton.tsx`
- `error-state.tsx`

---

### 3. **Library** (`/frontend/lib`)

Frontend utilities and clients.

#### Files:

**`api-client.ts`** ⭐ - Backend API client
- `APIClient` class
- All endpoint methods
- Automatic header injection
- Error handling
- SSE streaming helpers
- Singleton export: `apiClient`

**`sse-client.ts`** - SSE connection management
- `SSEClient` class
- Reconnection logic
- Event parsing
- Error handling

**`trace-parser.ts`** - Trace data parser
- Parse trace JSON
- Extract messages
- Extract tool calls
- Format for display

**`utils.ts`** - Utility functions
- `cn()` - Tailwind class merging
- Date formatting
- String truncation
- Validation helpers

---

### 4. **Hooks** (`/frontend/hooks`)

Custom React hooks.

#### Files:

**`use-job-monitor.ts`** - Job progress monitoring
- Subscribe to job SSE stream
- Return: `{ status, progress, result, error }`
- Auto-cleanup on unmount
- Retry logic

**Commonly used patterns:**
```typescript
const { status, progress, result } = useJobMonitor(jobId)
```

---

### 5. **Types** (`/frontend/types`)

Frontend TypeScript types.

#### Files:

**`api.ts`** - API types (copied from backend)
- All request/response types
- Entity models
- Error types

**`trace.ts`** - Trace display types
- Extended trace types
- UI-specific fields
- Display states

---

### 6. **Scripts** (`/frontend/scripts`)

Development and testing scripts.

#### Files:

**`test-trace-parser.ts`** - Parser test
- Test trace parsing logic
- Validate output format

**`verify-parser.ts`** - Parser validation
- Integration test with real traces

**`test-with-api.ts`** - API integration test
- Test full request/response cycle
- Verify API client

---

### 7. **Configuration**

**`tailwind.config.ts`** - Tailwind CSS config
- Theme customization
- Custom colors
- Plugins

**`next.config.js`** - Next.js config
- Build settings
- Environment variables
- Redirects

**`tsconfig.json`** - TypeScript config
- Compiler options
- Path aliases (`@/` → `./`)

**`package.json`** - Dependencies
- React 18
- Next.js 14
- React Query (TanStack Query)
- Framer Motion
- Shadcn UI
- Tailwind CSS
- Sonner (toast notifications)

---

## Database Schema (`/schema.sql`)

D1 SQLite tables:

1. **`users`** - User accounts
2. **`workspaces`** - Multi-tenancy
3. **`integrations`** - Platform connections (encrypted API keys)
4. **`traces`** - Imported traces (JSON blobs)
5. **`eval_sets`** - Eval set metadata
6. **`feedback`** - Human feedback on traces
7. **`evals`** - Generated Python functions
8. **`eval_executions`** - Eval run results
9. **`jobs`** - Background job queue

**Key Views:**
- `eval_comparison` - Joins executions + feedback for contradiction detection

---

## Documentation (`/docs`)

1. **`API_SPECIFICATION.md`** - Complete REST API docs
2. **`FRONTEND_INTEGRATION_GUIDE.md`** - Integration guide
3. **`FRONTEND_BACKEND_SPLIT.md`** - Separation guide
4. **`UX_UI_SPECIFICATION.md`** - Complete UX/UI design
5. **`MODULE_OVERVIEW.md`** - This document
6. **`success_criteria.md`** - Success criteria
7. **Design docs** - Original architecture documents

---

## Dependencies Summary

### Backend (`/src`)

**Runtime:**
- `@anthropic-ai/sdk` - Claude API for eval generation
- `@cloudflare/sandbox` - Python sandbox (Pyodide)
- `langfuse` - Langfuse SDK
- `zod` - Schema validation

**Dev:**
- `@cloudflare/workers-types` - TypeScript types
- `wrangler` - Cloudflare CLI
- `vitest` - Testing framework
- `typescript` - TypeScript compiler
- `tsx` - TypeScript execution

### Frontend (`/frontend`)

**Core:**
- `react` 18
- `next` 14
- `@tanstack/react-query` - Data fetching
- `framer-motion` - Animations

**UI:**
- `tailwindcss` - Styling
- `@radix-ui/*` - Headless UI components
- `lucide-react` - Icons
- `sonner` - Toast notifications

**Dev:**
- `typescript`
- `eslint`
- `prettier`

---

## Module Interaction Diagram

```
User Request
     │
     ▼
┌─────────────────┐
│  Frontend       │
│  (Next.js)      │
└────────┬────────┘
         │ HTTP/SSE
         ▼
┌─────────────────┐
│  API Router     │──┐
│  (index.ts)     │  │
└────────┬────────┘  │
         │           │
    ┌────┴────┐      │
    ▼         ▼      │
┌───────┐ ┌──────┐  │
│Traces │ │Evals │  │ Other endpoints
└───┬───┘ └──┬───┘  │
    │        │      │
    ▼        ▼      ▼
┌──────────────────────┐
│   Job Manager        │
└───────┬──────────────┘
        │
   ┌────┴────┐
   ▼         ▼
┌───────┐ ┌─────────┐
│Import │ │Generate │
│ Job   │ │  Job    │
└───┬───┘ └────┬────┘
    │          │
    ▼          ▼
┌─────────┐ ┌──────────┐
│Adapters │ │Generator │
└─────────┘ └─────┬────┘
                  │
                  ▼
            ┌──────────┐
            │ Sandbox  │
            └──────────┘
                  │
                  ▼
            ┌──────────┐
            │    D1    │
            │ Database │
            └──────────┘
```

---

## Key Patterns

### 1. **Async Operations (Jobs)**
```
User clicks "Import" → API creates job → Returns job_id
Frontend polls /api/jobs/:id OR subscribes to SSE
Job worker picks up job → Runs adapter → Updates progress
Job completes → Frontend receives result → Updates UI
```

### 2. **Eval Generation**
```
User clicks "Generate" → API creates generation job
Job fetches traces with feedback from eval set
Generator calls LLM with meta-prompt + training data
Tester runs generated code on training data
Job stores eval + test results → Frontend displays
```

### 3. **Trace Review (Swipe)**
```
Frontend fetches traces without feedback
User swipes/presses key → POST /api/feedback
Feedback associates trace with eval set
Progress updates → Next trace displayed
Completion → All traces reviewed
```

### 4. **Contradiction Detection**
```
Eval executes on trace → Stores result
Matrix endpoint joins executions + feedback
Finds where human rating ≠ eval prediction
User views contradictions → Clicks "Refine"
New eval generated with contradiction cases included
```

---

## Testing Strategy

### Backend
- Unit tests: `*.test.ts` files
- Test runners: Vitest
- Coverage: Generators, adapters, sandbox

### Frontend
- E2E tests: Playwright (planned)
- Component tests: Jest + React Testing Library (planned)
- Manual testing: Current approach

---

## Build & Deploy

### Backend
```bash
npm run dev     # Local development (wrangler dev)
npm run deploy  # Deploy to Cloudflare Workers
npm test        # Run tests
```

### Frontend
```bash
cd frontend
npm run dev     # Local development (Next.js dev server)
npm run build   # Production build
npm run start   # Production server
```

---

## Security Considerations

### Backend
1. **API Keys:** Encrypted at rest in D1
2. **Python Sandbox:** Restricted imports, timeout, memory limit
3. **Rate Limiting:** Per-workspace limits (planned)
4. **CORS:** Configured allowed origins
5. **Input Validation:** Zod schemas

### Frontend
1. **XSS Prevention:** React escaping
2. **CSRF:** Not needed (no cookies)
3. **API Key Storage:** None (backend handles)
4. **HTTPS:** Required in production

---

## Performance Optimizations

### Backend
1. **D1 Indexing:** Foreign keys, unique constraints
2. **Job Queue:** Async processing for heavy operations
3. **Caching:** None yet (future: KV storage)
4. **Pagination:** Cursor-based for large datasets

### Frontend
1. **Code Splitting:** Dynamic imports (Framer Motion)
2. **React Query:** Caching, deduplication
3. **Lazy Loading:** Trace details on demand
4. **Debouncing:** Search inputs

---

## Future Modules (Planned)

### Backend
1. **Multi-turn Evals** - Handle conversation traces
2. **LLM-based Evals** - Generate LLM-as-judge evals
3. **Auto-refinement** - Trigger on accuracy threshold
4. **Webhooks** - Notify on eval generation
5. **Analytics Dashboard** - Cost, usage, accuracy trends

### Frontend
1. **Eval Comparison** - Side-by-side code diffs
2. **Version History** - View all eval versions
3. **Bulk Operations** - Multi-select & batch actions
4. **Export** - CSV/JSON exports for matrix
5. **Dark Mode** - Theme switching

---

## Module Checklist

### Implemented ✅
- [x] API endpoints (all 30+)
- [x] Trace adapter (Langfuse)
- [x] Eval generator
- [x] Python sandbox
- [x] Job queue
- [x] Frontend pages (all)
- [x] Swipe interface
- [x] Code viewer
- [x] Matrix view
- [x] SSE streaming

### In Progress 🚧
- [ ] Langsmith adapter
- [ ] OpenAI adapter
- [ ] E2E tests
- [ ] Cost analytics

### Planned 📋
- [ ] Multi-turn eval support
- [ ] Auto-refinement
- [ ] Webhooks
- [ ] Advanced analytics
- [ ] Dark mode

---

**Last Updated:** 2025-11-17
**Total Modules:** 50+ files across backend and frontend
**Lines of Code:** ~15,000 (backend: ~8,000, frontend: ~7,000)
