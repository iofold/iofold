# iofold.com API Implementation

This directory contains the implementation of the eval generation and execution APIs for iofold.com, following the specification in `docs/plans/2025-11-12-api-specification.md`.

## Architecture Overview

The implementation follows a job-based async architecture:

```
Client Request → Create Job → Background Processing → SSE Progress Updates → Job Complete
```

## Structure

```
src/api/
├── evals.ts          # Eval CRUD and execution endpoints
└── jobs.ts           # Job status and streaming endpoints

src/jobs/
├── job-manager.ts            # Job lifecycle management
├── eval-generation-job.ts    # Async eval generation handler
└── eval-execution-job.ts     # Async eval execution handler

src/utils/
├── errors.ts         # Standardized error handling
└── sse.ts            # Server-Sent Events streaming

src/types/
└── api.ts            # TypeScript interfaces matching API spec
```

## Implemented Endpoints

### Evals API (`evals.ts`)

- **POST /api/eval-sets/:id/generate** - Generate eval from labeled traces (async with job)
- **GET /api/evals** - List evals with pagination
- **GET /api/evals/:id** - Get eval details including code
- **PATCH /api/evals/:id** - Update eval properties or code
- **POST /api/evals/:id/execute** - Execute eval against traces (async with job)
- **DELETE /api/evals/:id** - Delete eval and execution results

### Jobs API (`jobs.ts`)

- **GET /api/jobs/:id** - Get job status and result
- **GET /api/jobs/:id/stream** - Stream job progress via SSE
- **POST /api/jobs/:id/cancel** - Cancel running job
- **GET /api/jobs** - List recent jobs for workspace

## Key Features

### 1. Cursor-Based Pagination

All list endpoints use cursor-based pagination for consistent performance:

```typescript
// Cursor format: base64(timestamp:id)
GET /api/traces?cursor=eyJ0aW1lc3RhbXAiOi4uLiwiaWQiOi4uLn0&limit=50

Response:
{
  "traces": [...],
  "next_cursor": "xyz...",
  "has_more": true,
  "total_count": 1247
}
```

### 2. Error Handling

Standardized error responses across all endpoints:

```typescript
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Trace not found",
    "details": {...},
    "request_id": "req_abc123"
  }
}
```

Error codes: `VALIDATION_ERROR`, `NOT_FOUND`, `ALREADY_EXISTS`, `INSUFFICIENT_EXAMPLES`, `INTERNAL_ERROR`, etc.

### 3. Workspace Isolation

All endpoints require `X-Workspace-Id` header for multi-tenancy:

```http
X-Workspace-Id: workspace_abc123
```

### 4. Prepared Statements

All database queries use prepared statements for security:

```typescript
await env.DB.prepare('SELECT * FROM traces WHERE id = ? AND workspace_id = ?')
  .bind(traceId, workspaceId)
  .first();
```

### 5. Optimistic UI Support

Feedback endpoints designed for optimistic UI patterns:

```typescript
// Frontend can update UI immediately, queue for background sync
POST /api/feedback
{
  "trace_id": "trace_123",
  "eval_set_id": "set_xyz",
  "rating": "positive",
  "notes": "Good response"
}
```

## Database Schema

The implementation uses the updated schema in `/schema.sql`:

- **users** - User accounts
- **workspaces** - Multi-tenant workspaces
- **integrations** - Platform connections (encrypted API keys)
- **traces** - Imported traces (normalized format)
- **eval_sets** - Collections for organizing feedback
- **feedback** - User ratings (positive/negative/neutral)
- **evals** - Generated Python eval functions
- **eval_executions** - Prediction results
- **jobs** - Background task tracking

## Usage in Worker

Integrate with the main Cloudflare Worker:

```typescript
import { handleApiRequest } from './api';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Route API requests
    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(request, env);
    }

    // Other routes...
    return new Response('Not Found', { status: 404 });
  }
};
```

## Design Decisions

### 1. No Authentication Middleware

Auth is stubbed out (`env.user` assumed available). The production implementation should add:

```typescript
// Verify JWT token
const token = request.headers.get('Authorization')?.replace('Bearer ', '');
const user = await verifyToken(token);

// Validate workspace access
const hasAccess = await checkWorkspaceAccess(user.id, workspaceId);
```

### 2. API Key Encryption

Currently uses base64 encoding (NOT secure). Production should use:

```typescript
// Use Cloudflare Workers Crypto API
const key = await crypto.subtle.importKey(...);
const encrypted = await crypto.subtle.encrypt(..., key, apiKey);
```

### 3. Background Jobs

Job creation implemented, but execution is TODO:

```typescript
// TODO: Trigger actual background import job via Queue
// For now, jobs are created but not processed
```

Production should integrate with Cloudflare Queues or Durable Objects.

### 4. Total Count Caching

`total_count` in list responses is expensive to compute. Production should:

- Cache counts for 60 seconds in KV/Durable Object
- Consider removing if not essential for UX
- Use approximate counts for large datasets

### 5. Trace Summaries

Input/output previews are truncated to 200 characters and computed on-the-fly. For better performance:

- Pre-compute summaries during import
- Store in separate columns (`input_preview`, `output_preview`)
- Update schema and import pipeline

## Testing

Manual testing with curl:

```bash
# Create workspace (for testing)
export WORKSPACE_ID="workspace_test123"

# Create integration
curl -X POST http://localhost:8787/api/integrations \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: $WORKSPACE_ID" \
  -d '{"platform":"langfuse","api_key":"sk_test_123","name":"Test Integration"}'

# Create eval set
curl -X POST http://localhost:8787/api/eval-sets \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: $WORKSPACE_ID" \
  -d '{"name":"response-quality","description":"Test eval set","minimum_examples":5}'

# Submit feedback
curl -X POST http://localhost:8787/api/feedback \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: $WORKSPACE_ID" \
  -d '{"trace_id":"trace_123","eval_set_id":"set_abc","rating":"positive","notes":"Great!"}'

# List traces
curl http://localhost:8787/api/traces?limit=10 \
  -H "X-Workspace-Id: $WORKSPACE_ID"
```

## Next Steps

### For Other Agents

1. **Eval Generation Endpoints** (`/api/eval-sets/:id/generate`)
   - Implement in separate file: `src/api/eval-generation.ts`
   - Integrate with existing `EvalGenerator` class
   - Add job queue processing for async generation

2. **Eval Execution Endpoints** (`/api/evals/:id/execute`)
   - Implement in: `src/api/eval-execution.ts`
   - Use existing `EvalTester` and `PythonRunner` classes
   - Add background execution via Queues

3. **Comparison Matrix Endpoint** (`/api/eval-sets/:id/matrix`)
   - Complex query joining traces, feedback, and executions
   - Implement in: `src/api/matrix.ts`
   - Use `eval_comparison` view for contradiction detection

4. **Jobs & SSE Endpoints** (`/api/jobs/:id`, `/api/jobs/:id/stream`)
   - Implement in: `src/api/jobs.ts`
   - Add Server-Sent Events for real-time progress
   - Integrate with Durable Objects for state management

5. **Authentication Middleware**
   - JWT token verification
   - Workspace access control
   - Rate limiting (1000 req/min per workspace)

6. **Background Job Processing**
   - Cloudflare Queues for import/generation/execution
   - Durable Objects for job state
   - Progress tracking and SSE event emission

## Status

✅ **Implemented:**
- Trace management (import job creation, list, get, delete)
- Eval set CRUD operations
- Feedback submission and management
- Integration management (create, list, test, delete)
- Cursor-based pagination utilities
- Error handling framework
- Database schema updates

⏳ **TODO (for other agents):**
- Eval generation endpoints
- Eval execution endpoints
- Comparison matrix endpoint
- Jobs management and SSE streaming
- Authentication middleware
- Background job processing
- Total count caching
- API key encryption (production-grade)

## Questions?

See the complete API specification in `/docs/plans/2025-11-12-api-specification.md`
