# iofold Module Overview

Complete breakdown of all modules, their responsibilities, and dependencies in the iofold codebase.

**Last Updated**: 2025-12-01

## Project Structure

```
iofold/
├── src/                   # Backend (Cloudflare Workers)
│   ├── api/              # REST API endpoints
│   ├── adapters/         # External platform integrations
│   ├── jobs/             # Background job system
│   ├── eval-generator/   # LLM-powered eval generation
│   ├── sandbox/          # Python execution environment
│   ├── analytics/        # Cost tracking
│   ├── errors/           # Error classification
│   ├── types/            # TypeScript types
│   ├── utils/            # Shared utilities
│   ├── db/               # Database schema & migrations
│   └── index.ts          # Worker entry point
├── frontend/             # Frontend (Next.js)
│   ├── app/              # Page routes
│   ├── components/       # React components
│   ├── lib/              # API client & utilities
│   ├── hooks/            # Custom React hooks
│   └── types/            # Frontend types
├── tests/                # Backend tests
├── docs/                 # Documentation
└── migrations/           # Database migrations
```

---

## Backend Modules (`/src`)

### 1. API Layer (`/src/api`)

REST API endpoints for Cloudflare Workers.

#### Core Files

| File | Purpose |
|------|---------|
| `index.ts` | Main API router with pattern matching |
| `traces.ts` | Trace import, list, get, delete endpoints |
| `feedback.ts` | Human feedback submission and management |
| `evals.ts` | Eval generation, execution, CRUD operations |
| `integrations.ts` | External platform connection management |
| `jobs.ts` | Background job monitoring and control |
| `agents.ts` | Agent discovery, versioning, and management |
| `utils.ts` | Shared API utilities (pagination, errors) |

#### API Routes Summary

**Traces**: `POST/GET/DELETE /api/traces`, `POST /api/traces/import`
**Feedback**: `GET/POST/PATCH/DELETE /api/feedback`
**Evals**: Full CRUD + `POST /api/evals/:id/execute`
**Agents**: Full CRUD + versioning + `POST /api/agents/:id/improve`
**Jobs**: `GET /api/jobs`, `GET /api/jobs/:id/stream`, `POST /api/jobs/:id/retry`
**Integrations**: Full CRUD + `POST /api/integrations/:id/test`

---

### 2. Agent Management (`/src/api/agents.ts`)

Agent discovery and version control system.

#### Capabilities
- **Agent Discovery**: Automatic clustering of similar traces
- **Version Management**: Immutable prompt versions with promote/reject workflow
- **ETag Support**: Conditional requests for prompt polling
- **Metrics Aggregation**: Accuracy, contradiction rate, trace counts

#### Agent Lifecycle
```
Discovered → Confirmed → (Active Version) → (New Candidate) → Promoted/Rejected
```

#### Version States
- `candidate` - Newly created, awaiting review
- `active` - Currently deployed version
- `rejected` - User rejected this version
- `archived` - Previous active version after promotion

---

### 3. Jobs System (`/src/jobs`)

Background job processing with robust error handling.

#### Core Files

| File | Purpose |
|------|---------|
| `job-manager.ts` | Job lifecycle management, retry scheduling |
| `job-worker.ts` | Job execution dispatcher |
| `trace-import-job.ts` | Import traces from Langfuse |
| `eval-generation-job.ts` | Generate evals with Claude |
| `eval-execution-job.ts` | Run evals in Python sandbox |
| `agent-discovery-job.ts` | Cluster traces to discover agents |
| `prompt-improvement-job.ts` | AI-powered prompt refinement |
| `prompt-evaluation-job.ts` | Evaluate candidate prompts |

#### Job Types (10 Total)

| Type | Handler | Description |
|------|---------|-------------|
| `import` | TraceImportJob | Fetch and normalize traces |
| `generate` | EvalGenerationJob | Generate Python eval with Claude |
| `execute` | EvalExecutionJob | Run eval in sandbox |
| `monitor` | (Cron trigger) | Performance monitoring |
| `auto_refine` | AutoRefineJob | Auto-improve evals |
| `agent_discovery` | AgentDiscoveryJob | Cluster and discover agents |
| `prompt_improvement` | PromptImprovementJob | Improve prompts based on contradictions |
| `prompt_evaluation` | PromptEvaluationJob | Evaluate candidate versions |
| `template_drift` | TemplateDriftJob | Detect prompt template changes |
| `eval_revalidation` | EvalRevalidationJob | Re-test evals on new traces |

#### Retry System

Jobs use intelligent error classification for retry decisions:

**Transient (Retryable)**:
- `transient_network` - Timeouts, connection errors
- `transient_rate_limit` - 429 responses
- `transient_server` - 5xx errors
- `transient_db_lock` - D1 lock/busy

**Permanent (Non-retryable)**:
- `permanent_validation` - 400/422 validation errors
- `permanent_auth` - 401/403 auth failures
- `permanent_not_found` - 404 resource not found
- `permanent_security` - Sandbox violations
- `unknown` - Unclassified errors

---

### 4. Adapters (`/src/adapters`)

Platform-specific integrations to fetch traces.

#### Files

| File | Purpose |
|------|---------|
| `langfuse.ts` | Langfuse API adapter (MVP only) |

#### Interface
```typescript
interface TraceAdapter {
  authenticate(apiKey: string): Promise<void>
  fetchTraces(filter: TraceFilter): Promise<Trace[]>
  fetchTraceById(id: string): Promise<Trace>
}
```

#### Trace Normalization
All traces normalized to `LangGraphExecutionStep` schema:
- Extract messages from various formats
- Parse tool calls
- Map roles: `human` → `user`, `ai` → `assistant`

---

### 5. Eval Generator (`/src/eval-generator`)

LLM-powered eval function generation.

#### Files

| File | Purpose |
|------|---------|
| `generator.ts` | Core generation with Claude API |
| `tester.ts` | Test generated code on training data |
| `prompts.ts` | Meta-prompt templates |

#### Generation Flow
1. Fetch labeled traces (positive/negative examples)
2. Build meta-prompt with examples and instructions
3. Call Claude API (claude-haiku-4-5 default for cost)
4. Extract Python code from response
5. Test on training data
6. Calculate accuracy and store

---

### 6. Sandbox (`/src/sandbox`)

Secure Python execution environment.

#### Security Constraints
```typescript
{
  allowedImports: ['json', 're', 'typing'],
  timeout: 5000,        // 5 seconds
  memoryLimit: 50 * 1024 * 1024,  // 50MB
  networkAccess: false,
  fileAccess: false
}
```

#### Files

| File | Purpose |
|------|---------|
| `python-runner.ts` | Sandbox execution wrapper |

Uses `@cloudflare/sandbox` (Pyodide-based).

---

### 7. Error Classification (`/src/errors`)

Intelligent error categorization for retry decisions.

#### Files

| File | Purpose |
|------|---------|
| `classifier.ts` | Error pattern matching |

#### Functions
```typescript
classifyError(error: Error | Response): ErrorCategory
isRetryable(category: ErrorCategory): boolean
```

---

### 8. Analytics (`/src/analytics`)

Cost tracking for LLM usage.

#### Files

| File | Purpose |
|------|---------|
| `cost-tracker.ts` | Track LLM API costs |

#### Pricing Tracked
- Claude 4.5 Sonnet: $3/$15 per 1M tokens
- Claude 4.5 Haiku: $1/$5 per 1M tokens
- Claude 3 Haiku: $0.25/$1.25 per 1M tokens

---

### 9. Types (`/src/types`)

TypeScript type definitions.

#### Files

| File | Purpose |
|------|---------|
| `api.ts` | API request/response types |
| `trace.ts` | Trace data structures |
| `agent.ts` | Agent and version types |
| `queue.ts` | Job queue message types |
| `vectorize.ts` | Vector storage types |

---

### 10. Utilities (`/src/utils`)

Shared utility functions.

| File | Purpose |
|------|---------|
| `errors.ts` | Error handling utilities |
| `crypto.ts` | API key encryption (AES-GCM) |
| `sse.ts` | Server-Sent Events helpers |

---

### 11. Entry Point (`/src/index.ts`)

Cloudflare Workers entry point.

- `fetch()` handler - Route HTTP requests
- `scheduled()` handler - Cron jobs
- `queue()` handler - Job queue consumer
- CORS handling
- Request logging

---

## Frontend Modules (`/frontend`)

### 1. Pages (`/frontend/app`)

Next.js 15 App Router pages. All pages are client components using React Query.

#### Primary Routes

| Route | Purpose |
|-------|---------|
| `/` | Dashboard with KPIs, trends, activity |
| `/integrations` | Platform connection management |
| `/agents` | Agent list with version info |
| `/agents/[id]` | Agent detail with versions, functions, metrics |
| `/traces` | Trace explorer with filters |
| `/evals` | Evaluation results dashboard |
| `/evals/[id]` | Eval detail with code viewer |

#### Workflow Routes

| Route | Purpose |
|-------|---------|
| `/review` | Quick feedback interface with keyboard shortcuts |
| `/matrix` | Agent version comparison overview |
| `/matrix/[agent_id]` | Detailed trace evaluation matrix |
| `/setup` | First-time setup wizard (5 steps) |

#### Admin Routes

| Route | Purpose |
|-------|---------|
| `/settings` | User preferences, API keys, theme |
| `/resources` | Usage monitoring, budget tracking |
| `/system` | System health, job queue dashboard |

---

### 2. Components (`/frontend/components`)

85+ React components organized by category.

#### UI Base (`/ui`)
- `button.tsx` - CVA variants (10 variants, 6 sizes)
- `card.tsx` - Compound component with Header/Content/Footer
- `input.tsx`, `textarea.tsx`, `select.tsx` - Form controls
- `dialog.tsx`, `sheet.tsx` - Modals and side panels
- `skeleton.tsx` - Loading placeholders
- `kpi-card.tsx` - Key Performance Indicator cards
- `searchable-select.tsx` - Advanced multi-select with search

#### Layout (`/layout`)
- `main-layout.tsx` - Root layout with sidebar
- `sidebar/sidebar.tsx` - Collapsible navigation (72px/256px)

#### Feature Components
- `feedback-buttons.tsx` - Good/Neutral/Bad rating buttons
- `trace-feedback.tsx` - Full feedback UI with history
- `trace-card.tsx` - Trace summary card
- `code-viewer.tsx` - Syntax-highlighted Python display
- `trace-review/*.tsx` - Trace review components

#### Modals (`/modals`)
- `GenerateEvalModal.tsx` - Eval generation with SSE progress
- `AddIntegrationModal.tsx` - Integration setup
- `create-agent-modal.tsx` - Agent creation
- `create-agent-version-modal.tsx` - Version management
- `import-traces-modal.tsx` - Trace import

#### Matrix Analysis (`/matrix`)
- `agent-version-overview.tsx` - Version performance cards
- `comparison-panel.tsx` - Side-by-side comparison
- `trace-evaluation-details.tsx` - Detailed eval results

#### Charts (`/charts`)
- `pass-rate-trend-chart.tsx` - Composed chart with dual Y-axes
- `evaluation-chart.tsx` - Eval results visualization

#### Jobs (`/jobs`)
- `job-queue-dashboard.tsx` - Real-time job monitoring
- `job-retry-badge.tsx` - Retry status indicator

#### Skeletons (`/skeletons`)
- Loading states for dashboard, tables, traces, agents, evals

---

### 3. Library (`/frontend/lib`)

Frontend utilities and API client.

| File | Purpose |
|------|---------|
| `api-client.ts` | Typed API client with all endpoints |
| `sse-client.ts` | SSE connection management |
| `trace-parser.ts` | Parse trace JSON for display |
| `utils.ts` | Utilities (cn, date formatting) |

---

### 4. Hooks (`/frontend/hooks`)

Custom React hooks.

| Hook | Purpose |
|------|---------|
| `use-job-monitor.ts` | SSE + polling for job progress |

---

### 5. Types (`/frontend/types`)

Frontend TypeScript types.

| File | Purpose |
|------|---------|
| `api.ts` | API types (duplicated from backend) |
| `agent.ts` | Agent-specific types |
| `trace.ts` | UI-specific trace parsing types |

---

## Database (`/src/db`)

### Schema (22 Tables)

#### Core Tables
- `users` - User accounts
- `workspaces` - Multi-tenancy containers
- `workspace_members` - Membership with roles
- `integrations` - External platform connections
- `traces` - Normalized execution traces

#### Eval Tables
- `eval_sets` - Feedback collections
- `feedback` - Human annotations
- `evals` - Generated Python functions
- `eval_executions` - Prediction results

#### Agent Tables
- `agents` - Discovered agent groupings
- `agent_versions` - Immutable prompt versions
- `functions` - AI-generated code (extractor, injector, eval)
- `agent_functions` - Agent-to-function mapping
- `prompt_best_practices` - Reference material

#### Job Tables
- `jobs` - Background job tracking
- `job_retry_history` - Retry attempt audit

#### Monitoring Tables
- `system_prompts` - Unique prompts with SHA-256 hash
- `performance_snapshots` - Daily metrics aggregation
- `performance_alerts` - Performance monitoring alerts
- `refinement_history` - Auto-refinement audit trail
- `auto_refine_cooldowns` - Cooldown tracking

### Migrations

| Migration | Description |
|-----------|-------------|
| `001_initial_schema.sql` | Core tables, indexes |
| `002_add_updated_at_to_eval_sets.sql` | Add updated_at column |
| `003_add_metadata_to_jobs.sql` | Job metadata fields |
| `004_system_prompt_versioning.sql` | Prompt tracking |
| `005_agent_management.sql` | Agents, versions, functions |
| `006_job_retry_tracking.sql` | Retry infrastructure |

### Views
- `eval_comparison` - Joins executions + feedback for contradictions
- `prompt_performance_summary` - Aggregated prompt metrics
- `current_eval_metrics` - Current metrics with 7-day rolling stats
- `refinement_timeline` - Auto-refinement history

---

## Testing (`/tests`)

### Backend E2E Tests
- **32 test files** in `/tests/e2e/`
- Categories: smoke, integrations, traces, evals, jobs, agents, errors

### Test Infrastructure
- **Framework**: Playwright 1.57.0
- **Config**: `/playwright.config.ts`
- **Fixtures**: `/tests/fixtures/` (integrations, traces, agents, jobs)
- **Helpers**: `/tests/helpers/` (API client, assertions, wait utilities)

### Frontend E2E Tests
- **4 test files** in `/frontend/e2e/`
- Includes accessibility testing (WCAG 2.1 AA)

---

## Dependencies

### Backend
| Package | Purpose |
|---------|---------|
| `@anthropic-ai/sdk` | Claude API for eval generation |
| `@cloudflare/sandbox` | Python sandbox (Pyodide) |
| `langfuse` | Langfuse SDK |
| `zod` | Schema validation |

### Frontend
| Package | Purpose |
|---------|---------|
| `next` 15 | React framework |
| `@tanstack/react-query` | Server state management |
| `framer-motion` | Animations |
| `recharts` | Charts |
| `tailwindcss` | Styling |
| `@radix-ui/*` | Headless UI components |
| `sonner` | Toast notifications |
| `lucide-react` | Icons |

---

## Key Patterns

### 1. Async Job Pattern
```
POST request → Create job → Return job_id
Client polls /api/jobs/:id OR subscribes to SSE stream
Job worker processes → Updates progress → Completes/fails
```

### 2. Agent Version Workflow
```
Discovered Agent → Confirm → Active Version
Create New Version → Candidate → Promote/Reject
Promote → Old version archived, new version active
```

### 3. Eval Generation
```
Fetch labeled traces → Build meta-prompt → Call Claude
Extract Python code → Test on training data → Store with accuracy
```

### 4. Error Classification
```
Error caught → classifyError() → ErrorCategory
isRetryable(category) → true: schedule retry, false: mark failed
```

---

## Security

### Backend
1. **API Keys**: AES-GCM encryption at rest
2. **Python Sandbox**: Restricted imports, timeout, memory limit
3. **Multi-tenancy**: All queries filtered by workspace_id
4. **Input Validation**: Zod schemas

### Frontend
1. **XSS Prevention**: React escaping
2. **HTTPS**: Required in production
3. **No Secret Storage**: All secrets on backend

---

**Last Updated**: 2025-12-01
**Total Modules**: 100+ files across backend and frontend
