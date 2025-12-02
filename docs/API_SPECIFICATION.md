# iofold API Specification v1

Complete REST API documentation for the iofold automated eval generation platform.

**Last Updated**: 2025-12-01

## Base Configuration

**Base URL:** `http://localhost:8787/v1` (development) or your deployed Cloudflare Worker URL

**Headers (Required):**
```
Content-Type: application/json
X-Workspace-Id: {workspace_id}
```

**Headers (Optional):**
```
Authorization: Bearer {token}
If-None-Match: {etag}  # For conditional requests (agent prompt endpoint)
```

---

## Error Responses

All error responses follow this schema:

```typescript
{
  "error": {
    "code": string,           // ERROR_CODE (e.g., "VALIDATION_ERROR", "NOT_FOUND")
    "message": string,        // Human-readable error message
    "details": any,           // Optional additional error details
    "request_id": string      // Unique request identifier for debugging
  }
}
```

**Error Codes:**
| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid input, JSON parse errors |
| `MISSING_REQUIRED_FIELD` | 400 | Required field missing |
| `NOT_FOUND` | 404 | Resource not found |
| `ALREADY_EXISTS` | 409 | Duplicate resource (name conflict) |
| `INSUFFICIENT_EXAMPLES` | 422 | Not enough feedback for eval generation |
| `INTERNAL_ERROR` | 500 | Generic server error |
| `DATABASE_ERROR` | 500 | D1 database errors |
| `EXTERNAL_API_ERROR` | 503 | Claude API, platform API failures |

---

## 1. Integrations API

Connect to external observability platforms (Langfuse).

### Create Integration

**Endpoint:** `POST /api/integrations`

**Request Body:**
```typescript
{
  "platform": "langfuse" | "langsmith" | "openai",
  "api_key": string,         // Format: "publicKey:secretKey" for Langfuse
  "base_url": string,        // Optional: Custom base URL
  "name": string             // Optional: Display name
}
```

**Response:** `201 Created`
```typescript
{
  "id": string,
  "platform": "langfuse" | "langsmith" | "openai",
  "name": string,
  "status": "active" | "error",
  "error_message": string | null,
  "last_synced_at": string | null,
  "created_at": string
}
```

### List Integrations

**Endpoint:** `GET /api/integrations`

**Response:** `200 OK`
```typescript
{
  "integrations": Integration[]
}
```

### Get Integration

**Endpoint:** `GET /api/integrations/{id}`

**Response:** `200 OK` - Single integration object

### Update Integration

**Endpoint:** `PATCH /api/integrations/{id}`

**Request Body:**
```typescript
{
  "name": string,      // Optional
  "base_url": string   // Optional
}
```

### Test Integration

**Endpoint:** `POST /api/integrations/{id}/test`

**Response:** `200 OK`
```typescript
{
  "status": "success" | "error",
  "error_message": string | null
}
```

### Delete Integration

**Endpoint:** `DELETE /api/integrations/{id}`

**Response:** `204 No Content`

---

## 2. Traces API

Manage execution traces from external platforms.

### Import Traces

**Endpoint:** `POST /api/traces/import`

**Request Body:**
```typescript
{
  "integration_id": string,
  "filters": {
    "date_from": string,      // Optional: ISO 8601 timestamp
    "date_to": string,        // Optional: ISO 8601 timestamp
    "tags": string[],         // Optional: Filter by tags
    "user_ids": string[],     // Optional: Filter by user IDs
    "limit": number           // Optional: Max traces to import (default: 100)
  }
}
```

**Response:** `202 Accepted`
```typescript
{
  "job_id": string,
  "status": "queued" | "running"
}
```

### List Traces

**Endpoint:** `GET /api/traces`

**Query Parameters:**
- `source` (string) - Filter by source platform
- `rating` (string) - Filter by feedback rating
- `has_feedback` (boolean) - Filter traces with/without feedback
- `agent_id` (string) - Filter by agent
- `date_from` / `date_to` (string) - ISO 8601 timestamps
- `cursor` (string) - Pagination cursor
- `limit` (number) - Results per page (default: 50, max: 200)

**Response:** `200 OK`
```typescript
{
  "traces": [
    {
      "id": string,
      "trace_id": string,
      "source": "langfuse" | "langsmith" | "openai",
      "timestamp": string,
      "step_count": number,
      "feedback": Feedback | null,
      "summary": {
        "input_preview": string,
        "output_preview": string,
        "has_errors": boolean
      }
    }
  ],
  "total_count": number,
  "next_cursor": string | null,
  "has_more": boolean
}
```

### Get Trace

**Endpoint:** `GET /api/traces/{id}`

**Response:** `200 OK`
```typescript
{
  "id": string,
  "trace_id": string,
  "source": string,
  "timestamp": string,
  "metadata": Record<string, any>,
  "steps": LangGraphExecutionStep[],
  "feedback": Feedback | null
}
```

### Get Trace Executions

**Endpoint:** `GET /api/traces/{id}/executions`

**Response:** `200 OK` - List of eval executions for this trace

### Delete Trace

**Endpoint:** `DELETE /api/traces/{id}`

**Response:** `204 No Content`

### Bulk Delete Traces

**Endpoint:** `DELETE /api/traces`

**Request Body:**
```typescript
{
  "trace_ids": string[]
}
```

**Response:** `200 OK`
```typescript
{
  "deleted_count": number
}
```

---

## 3. Feedback API

Submit and manage human feedback on traces.

### List Feedback

**Endpoint:** `GET /api/feedback`

**Query Parameters:**
- `agent_id` (string) - Filter by agent
- `rating` (string) - Filter by rating
- `cursor` / `limit` - Pagination

**Response:** `200 OK`
```typescript
{
  "data": Feedback[],
  "next_cursor": string | null,
  "has_more": boolean
}
```

### Submit Feedback

**Endpoint:** `POST /api/feedback`

**Request Body:**
```typescript
{
  "trace_id": string,
  "agent_id": string,           // Optional
  "rating": "positive" | "negative" | "neutral",
  "notes": string               // Optional
}
```

**Response:** `201 Created`
```typescript
{
  "id": string,
  "trace_id": string,
  "rating": "positive" | "negative" | "neutral",
  "notes": string | null,
  "created_at": string,
  "updated": boolean            // true if upserted existing feedback
}
```

### Update Feedback

**Endpoint:** `PATCH /api/feedback/{id}`

**Request Body:**
```typescript
{
  "rating": "positive" | "negative" | "neutral",  // Optional
  "notes": string                                  // Optional
}
```

### Delete Feedback

**Endpoint:** `DELETE /api/feedback/{id}`

**Response:** `204 No Content`

---

## 4. Agents API

Manage AI agents discovered from trace patterns.

### List Agents

**Endpoint:** `GET /api/agents`

**Response:** `200 OK`
```typescript
{
  "agents": [
    {
      "id": string,
      "name": string,
      "description": string | null,
      "status": "discovered" | "confirmed" | "archived",
      "active_version": {
        "id": string,
        "version": number,
        "accuracy": number | null,
        "status": "active"
      } | null,
      "created_at": string,
      "updated_at": string
    }
  ],
  "pending_discoveries": number  // Count of unconfirmed agents
}
```

### Create Agent

**Endpoint:** `POST /api/agents`

**Request Body:**
```typescript
{
  "name": string,
  "description": string,           // Optional
  "prompt_template": string,       // Initial prompt
  "variables": string[]            // Template variable names
}
```

**Response:** `201 Created`

### Get Agent

**Endpoint:** `GET /api/agents/{id}`

**Response:** `200 OK`
```typescript
{
  "id": string,
  "name": string,
  "description": string | null,
  "status": "discovered" | "confirmed" | "archived",
  "active_version_id": string | null,
  "versions": AgentVersion[],
  "functions": {
    "extractor": Function | null,
    "injector": Function | null
  },
  "metrics": {
    "trace_count": number,
    "feedback_count": number,
    "eval_count": number,
    "accuracy": number | null,
    "contradiction_rate": number | null
  },
  "created_at": string,
  "updated_at": string
}
```

### Confirm Agent

**Endpoint:** `POST /api/agents/{id}/confirm`

Confirms a discovered agent, changing status from `discovered` to `confirmed`.

**Response:** `200 OK`

### Archive Agent

**Endpoint:** `DELETE /api/agents/{id}`

Soft-deletes agent (sets status to `archived`).

**Response:** `204 No Content`

### Improve Agent Prompt

**Endpoint:** `POST /api/agents/{id}/improve`

Triggers AI-powered prompt improvement based on contradictions.

**Request Body:**
```typescript
{
  "max_contradictions": number  // Optional: Max contradictions to analyze
}
```

**Response:** `202 Accepted`
```typescript
{
  "job_id": string,
  "status": "queued"
}
```

### Get Agent Prompt

**Endpoint:** `GET /api/agents/{id}/prompt`

Returns the current active prompt with ETag support for cache validation.

**Headers:**
- `If-None-Match: {etag}` - Returns 304 if unchanged

**Response:** `200 OK`
```typescript
{
  "prompt_template": string,
  "variables": string[],
  "version": number
}
```

**Response Headers:**
- `ETag: "{version_id}-{updated_at}"`

### Get Agent Matrix

**Endpoint:** `GET /api/agents/{id}/matrix`

Get comparison matrix for agent versions.

**Response:** `200 OK`
```typescript
{
  "rows": MatrixRow[],
  "stats": MatrixStats
}
```

---

## 5. Agent Versions API

Manage immutable agent prompt versions.

### List Versions

**Endpoint:** `GET /api/agents/{id}/versions`

**Response:** `200 OK`
```typescript
{
  "versions": [
    {
      "id": string,
      "version": number,
      "prompt_template": string,
      "variables": string[],
      "source": "discovered" | "manual" | "ai_improved",
      "parent_version_id": string | null,
      "accuracy": number | null,
      "status": "candidate" | "active" | "rejected" | "archived",
      "created_at": string
    }
  ]
}
```

### Create Version

**Endpoint:** `POST /api/agents/{id}/versions`

**Request Body:**
```typescript
{
  "prompt_template": string,
  "variables": string[]
}
```

**Response:** `201 Created`

### Get Version

**Endpoint:** `GET /api/agents/{id}/versions/{version}`

**Response:** `200 OK` - Single version object

### Promote Version

**Endpoint:** `POST /api/agents/{id}/versions/{version}/promote`

Promotes a candidate version to active, archiving the current active version.

**Response:** `200 OK`

### Reject Version

**Endpoint:** `POST /api/agents/{id}/versions/{version}/reject`

Rejects a candidate version (cannot reject active versions).

**Response:** `200 OK`

---

## 6. Evals API

Generate and manage Python eval functions.

### Create Eval

**Endpoint:** `POST /api/evals`

**Request Body:**
```typescript
{
  "agent_id": string,
  "name": string,
  "description": string,     // Optional
  "code": string,            // Python eval code
  "model_used": string       // Optional: defaults to "manual"
}
```

### Generate Eval

**Endpoint:** `POST /api/agents/{id}/generate-eval`

Generates an eval function from agent traces using Claude.

**Request Body:**
```typescript
{
  "name": string,
  "description": string,           // Optional
  "model": string,                 // Optional: LLM model
  "custom_instructions": string    // Optional: Additional instructions
}
```

**Response:** `202 Accepted`
```typescript
{
  "job_id": string,
  "status": "queued"
}
```

### List Evals

**Endpoint:** `GET /api/evals`

**Query Parameters:**
- `agent_id` (string) - Filter by agent
- `cursor` / `limit` - Pagination

**Response:** `200 OK`
```typescript
{
  "evals": [
    {
      "id": string,
      "name": string,
      "description": string | null,
      "agent_id": string,
      "code": string,
      "model_used": string,
      "accuracy": number,
      "test_results": TestResults,
      "execution_count": number,
      "contradiction_count": number,
      "created_at": string,
      "updated_at": string
    }
  ],
  "next_cursor": string | null,
  "has_more": boolean
}
```

### Get Eval

**Endpoint:** `GET /api/evals/{id}`

**Response:** `200 OK` - Single eval with full details

### Update Eval

**Endpoint:** `PATCH /api/evals/{id}`

**Request Body:**
```typescript
{
  "name": string,        // Optional
  "description": string, // Optional
  "code": string         // Optional: Updated Python code
}
```

### Delete Eval

**Endpoint:** `DELETE /api/evals/{id}`

**Response:** `204 No Content`

### Execute Eval

**Endpoint:** `POST /api/evals/{id}/execute`

**Request Body:**
```typescript
{
  "trace_ids": string[],  // Optional: Specific traces
  "force": boolean        // Optional: Re-execute even if already run
}
```

**Response:** `202 Accepted`
```typescript
{
  "job_id": string,
  "status": "queued"
}
```

### Get Eval Executions

**Endpoint:** `GET /api/evals/{id}/executions`

**Query Parameters:**
- `filter` - "contradictions_only", "errors_only", "all" (default)
- `cursor` / `limit` - Pagination

**Response:** `200 OK`
```typescript
{
  "executions": [
    {
      "id": string,
      "trace_id": string,
      "eval_id": string,
      "predicted_result": boolean,
      "predicted_reason": string,
      "execution_time_ms": number,
      "error": string | null,
      "executed_at": string,
      "human_feedback": Feedback | null,
      "is_contradiction": boolean
    }
  ],
  "next_cursor": string | null,
  "has_more": boolean
}
```

### Get Eval Metrics

**Endpoint:** `GET /api/evals/{id}/metrics`

**Response:** `200 OK` - Current performance metrics

### Get Eval Performance Trend

**Endpoint:** `GET /api/evals/{id}/performance-trend`

**Response:** `200 OK` - Historical performance snapshots

### Get Eval Alerts

**Endpoint:** `GET /api/evals/{id}/alerts`

**Response:** `200 OK` - Performance alerts for this eval

### Acknowledge Alert

**Endpoint:** `POST /api/evals/{id}/alerts/{alertId}/acknowledge`

### Resolve Alert

**Endpoint:** `POST /api/evals/{id}/alerts/{alertId}/resolve`

### Update Eval Settings

**Endpoint:** `PATCH /api/evals/{id}/settings`

Update monitoring thresholds and settings.

---

## 7. Jobs API

Monitor asynchronous background operations.

### List Jobs

**Endpoint:** `GET /api/jobs`

**Query Parameters:**
- `type` - Filter by job type (see types below)
- `status` - Filter by status
- `limit` - Results per page (default: 20, max: 100)

**Response:** `200 OK`
```typescript
{
  "jobs": [
    {
      "id": string,
      "type": JobType,
      "status": "queued" | "running" | "completed" | "failed" | "cancelled",
      "progress": number,
      "retry_count": number,
      "max_retries": number,
      "error_category": ErrorCategory | null,
      "created_at": string,
      "started_at": string | null,
      "completed_at": string | null,
      "result": any,
      "error": string | null
    }
  ]
}
```

**Job Types:**
- `import` - Import traces from external platform
- `generate` - Generate eval function with Claude
- `execute` - Run eval on traces
- `monitor` - Performance monitoring (cron)
- `auto_refine` - Auto-improve evals on threshold
- `agent_discovery` - Cluster traces to discover agents
- `prompt_improvement` - AI-improve agent prompts
- `prompt_evaluation` - Evaluate candidate prompts
- `template_drift` - Detect prompt changes
- `eval_revalidation` - Re-test evals on new traces

### Get Job Status

**Endpoint:** `GET /api/jobs/{id}`

**Response:** `200 OK` - Single job object

### Stream Job Progress (SSE)

**Endpoint:** `GET /api/jobs/{id}/stream`

**Response:** Server-Sent Events stream

**Event Types:**
```typescript
// Progress update
{ "type": "progress", "data": { "status": string, "progress": number, ... } }

// Job completed
{ "type": "completed", "data": { "status": "completed", "result": any } }

// Job failed
{ "type": "failed", "data": { "status": "failed", "error": string } }

// Keep-alive (every 30s)
{ "type": "heartbeat" }
```

### Cancel Job

**Endpoint:** `POST /api/jobs/{id}/cancel`

**Response:** `200 OK`

### Get Job Retry History

**Endpoint:** `GET /api/jobs/{id}/retries`

**Response:** `200 OK`
```typescript
{
  "retries": [
    {
      "attempt": number,
      "error": string,
      "error_category": ErrorCategory,
      "delay_ms": number,
      "timestamp": string
    }
  ]
}
```

### Retry Failed Job

**Endpoint:** `POST /api/jobs/{id}/retry`

Manually retry a failed job.

**Response:** `200 OK`

### Process Jobs (Development Only)

**Endpoint:** `POST /api/jobs/process`

Manually trigger job processing in local development.

**Response:** `200 OK`

---

## 8. Error Categories

Jobs classify errors into 9 categories for intelligent retry decisions:

**Transient (Retryable):**
| Category | Description |
|----------|-------------|
| `transient_network` | Timeouts, connection errors |
| `transient_rate_limit` | 429 responses |
| `transient_server` | 5xx errors |
| `transient_db_lock` | D1 lock/busy errors |

**Permanent (Non-retryable):**
| Category | Description |
|----------|-------------|
| `permanent_validation` | 400/422 validation errors |
| `permanent_auth` | 401/403 authentication errors |
| `permanent_not_found` | 404 not found |
| `permanent_security` | Sandbox security violations |
| `unknown` | Unclassified errors |

---

## Common Patterns

### Pagination

Most list endpoints support cursor-based pagination:

```
GET /api/traces?limit=50&cursor={next_cursor}
```

Response includes:
- `next_cursor` - Use for next page (null when no more pages)
- `has_more` - Boolean indicating if more pages exist
- `total_count` - Total count (on some endpoints)

### Async Operations

Import, generate, and execute operations are asynchronous:

1. POST request returns `job_id`
2. Poll `GET /api/jobs/{id}` for status
3. Or subscribe to `GET /api/jobs/{id}/stream` for SSE updates

### Timestamps

All timestamps use ISO 8601 format: `2025-12-01T10:30:00.000Z`

### Resource IDs

IDs use prefixed format for type safety:
- Traces: `trace_*`
- Agents: `agent_*`
- Versions: `agentv_*` or `ver_*`
- Evals: `eval_*`
- Feedback: `feedback_*`
- Integrations: `integration_*`
- Jobs: `job_*`

---

## Example Workflows

### Workflow 1: Agent Discovery and Eval Generation

```typescript
// 1. Import traces
POST /api/traces/import
{ "integration_id": "integration_123", "filters": { "limit": 100 } }
// Returns: { "job_id": "job_456" }

// 2. Wait for import to complete
GET /api/jobs/job_456/stream
// SSE stream with progress updates

// 3. View discovered agents
GET /api/agents
// Shows agents with status="discovered"

// 4. Confirm agent
POST /api/agents/agent_789/confirm

// 5. Generate eval from agent traces
POST /api/agents/agent_789/generate-eval
{ "name": "Quality Check" }
// Returns: { "job_id": "job_999" }

// 6. Execute eval on new traces
POST /api/evals/eval_001/execute
{ "trace_ids": ["trace_a", "trace_b"] }
```

### Workflow 2: Agent Version Management

```typescript
// 1. Check agent metrics
GET /api/agents/agent_789
// Shows accuracy, contradiction_rate

// 2. Trigger AI improvement
POST /api/agents/agent_789/improve
// Returns job_id for prompt_improvement job

// 3. Review new candidate version
GET /api/agents/agent_789/versions
// Shows version with status="candidate"

// 4. Promote if satisfied
POST /api/agents/agent_789/versions/2/promote

// 5. Or reject
POST /api/agents/agent_789/versions/2/reject
```

---

## TypeScript Types

All TypeScript type definitions are available in `/frontend/types/api.ts`:

```typescript
import type {
  Agent,
  AgentVersion,
  Trace,
  Eval,
  Feedback,
  Job,
  Integration,
  // ... etc
} from '@/types/api'
```

---

**API Version:** v1
**Last Updated:** 2025-12-01
