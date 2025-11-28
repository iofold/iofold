# iofold API Specification v1

Complete REST API documentation for the iofold automated eval generation platform.

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
```

**Note:** For MVP, authentication is optional. Use workspace ID `test-workspace-1` for development.

---

## Error Responses

All error responses follow this schema:

```typescript
{
  "error": {
    "code": string,           // ERROR_CODE (e.g., "VALIDATION_ERROR", "NOT_FOUND")
    "message": string,        // Human-readable error message
    "details": any,          // Optional additional error details
    "request_id": string     // Unique request identifier for debugging
  }
}
```

**Common HTTP Status Codes:**
- `200 OK` - Success
- `201 Created` - Resource created successfully
- `204 No Content` - Success with no response body
- `400 Bad Request` - Invalid request data
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

---

## 1. Integrations API

Connect to external observability platforms (Langfuse, Langsmith, OpenAI).

### Create Integration

**Endpoint:** `POST /api/integrations`

**Request Body:**
```typescript
{
  "platform": "langfuse" | "langsmith" | "openai",
  "api_key": string,
  "base_url": string,      // Optional: Custom base URL
  "name": string           // Optional: Display name
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
  "last_synced_at": string | null,  // ISO 8601 timestamp
  "created_at": string               // ISO 8601 timestamp
}
```

### List Integrations

**Endpoint:** `GET /api/integrations`

**Response:** `200 OK`
```typescript
{
  "integrations": [
    {
      "id": string,
      "platform": "langfuse" | "langsmith" | "openai",
      "name": string,
      "status": "active" | "error",
      "error_message": string | null,
      "last_synced_at": string | null,
      "created_at": string
    }
  ]
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
    "date_to": string,         // Optional: ISO 8601 timestamp
    "tags": string[],          // Optional: Filter by tags
    "user_ids": string[],      // Optional: Filter by user IDs
    "limit": number            // Optional: Max traces to import
  }
}
```

**Response:** `200 OK`
```typescript
{
  "job_id": string,
  "status": "queued" | "running",
  "estimated_count": number  // Optional: Estimated number of traces
}
```

**Note:** This is an asynchronous operation. Use the Jobs API to poll status or stream progress.

### List Traces

**Endpoint:** `GET /api/traces`

**Query Parameters:**
- `eval_set_id` (string, optional) - Filter by eval set
- `source` (string, optional) - Filter by source platform
- `rating` (string, optional) - Filter by feedback rating (positive/negative/neutral)
- `has_feedback` (boolean, optional) - Filter traces with/without feedback
- `date_from` (string, optional) - ISO 8601 timestamp
- `date_to` (string, optional) - ISO 8601 timestamp
- `cursor` (string, optional) - Pagination cursor
- `limit` (number, optional) - Results per page (default: 50, max: 100)

**Response:** `200 OK`
```typescript
{
  "traces": [
    {
      "id": string,
      "trace_id": string,
      "source": "langfuse" | "langsmith" | "openai",
      "timestamp": string,  // ISO 8601
      "step_count": number,
      "feedback": {
        "id": string,
        "rating": "positive" | "negative" | "neutral",
        "notes": string | null,
        "created_at": string
      } | null,
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
  "source": "langfuse" | "langsmith" | "openai",
  "timestamp": string,
  "metadata": Record<string, any>,
  "steps": [
    {
      "step_id": string,
      "timestamp": string,
      "messages_added": [
        {
          "role": "user" | "assistant" | "system",
          "content": string,
          "metadata": Record<string, any>
        }
      ],
      "tool_calls": [
        {
          "tool_name": string,
          "arguments": Record<string, any>,
          "result": any,
          "error": string | null
        }
      ],
      "input": any,
      "output": any,
      "error": string | null,
      "metadata": Record<string, any>
    }
  ],
  "feedback": {
    "id": string,
    "rating": "positive" | "negative" | "neutral",
    "notes": string | null,
    "created_at": string
  } | null
}
```

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

## 3. Eval Sets API

Organize feedback collections for generating evals.

### Create Eval Set

**Endpoint:** `POST /api/eval-sets`

**Request Body:**
```typescript
{
  "name": string,
  "description": string,        // Optional
  "minimum_examples": number    // Optional: Default 5
}
```

**Response:** `201 Created`
```typescript
{
  "id": string,
  "name": string,
  "description": string | null,
  "minimum_examples": number,
  "stats": {
    "positive_count": number,
    "negative_count": number,
    "neutral_count": number,
    "total_count": number
  },
  "created_at": string,
  "updated_at": string
}
```

### List Eval Sets

**Endpoint:** `GET /api/eval-sets`

**Response:** `200 OK`
```typescript
{
  "eval_sets": [
    {
      "id": string,
      "name": string,
      "description": string | null,
      "minimum_examples": number,
      "stats": {
        "positive_count": number,
        "negative_count": number,
        "neutral_count": number,
        "total_count": number
      },
      "created_at": string,
      "updated_at": string
    }
  ]
}
```

### Get Eval Set

**Endpoint:** `GET /api/eval-sets/{id}`

**Response:** `200 OK`
```typescript
{
  "id": string,
  "name": string,
  "description": string | null,
  "minimum_examples": number,
  "stats": {
    "positive_count": number,
    "negative_count": number,
    "neutral_count": number,
    "total_count": number
  },
  "created_at": string,
  "updated_at": string,
  "evals": [
    {
      "id": string,
      "name": string,
      "accuracy": number,
      "created_at": string
    }
  ]
}
```

### Update Eval Set

**Endpoint:** `PATCH /api/eval-sets/{id}`

**Request Body:**
```typescript
{
  "name": string,              // Optional
  "description": string,       // Optional
  "minimum_examples": number   // Optional
}
```

**Response:** `200 OK`
```typescript
{
  "id": string,
  "name": string,
  "description": string | null,
  "minimum_examples": number,
  "stats": {
    "positive_count": number,
    "negative_count": number,
    "neutral_count": number,
    "total_count": number
  },
  "created_at": string,
  "updated_at": string
}
```

### Delete Eval Set

**Endpoint:** `DELETE /api/eval-sets/{id}`

**Response:** `204 No Content`

---

## 4. Feedback API

Submit and manage human feedback on traces.

### Submit Feedback

**Endpoint:** `POST /api/feedback`

**Request Body:**
```typescript
{
  "trace_id": string,
  "eval_set_id": string,
  "rating": "positive" | "negative" | "neutral",
  "notes": string  // Optional
}
```

**Response:** `201 Created`
```typescript
{
  "id": string,
  "trace_id": string,
  "eval_set_id": string,
  "rating": "positive" | "negative" | "neutral",
  "notes": string | null,
  "created_at": string
}
```

**Note:** Submitting feedback associates the trace with the eval set.

### Update Feedback

**Endpoint:** `PATCH /api/feedback/{id}`

**Request Body:**
```typescript
{
  "rating": "positive" | "negative" | "neutral",  // Optional
  "notes": string                                  // Optional
}
```

**Response:** `200 OK`
```typescript
{
  "id": string,
  "trace_id": string,
  "eval_set_id": string,
  "rating": "positive" | "negative" | "neutral",
  "notes": string | null,
  "created_at": string
}
```

### Delete Feedback

**Endpoint:** `DELETE /api/feedback/{id}`

**Response:** `204 No Content`

---

## 5. Evals API

Generate and manage Python eval functions.

### Generate Eval

**Endpoint:** `POST /api/eval-sets/{eval_set_id}/generate`

**Request Body:**
```typescript
{
  "name": string,
  "description": string,           // Optional
  "model": string,                 // Optional: LLM model (default: claude-3-5-sonnet-20241022)
  "custom_instructions": string    // Optional: Additional instructions
}
```

**Response:** `200 OK`
```typescript
{
  "job_id": string,
  "status": "queued" | "running",
  "estimated_count": number  // Optional
}
```

**Note:** This is an asynchronous operation. Use the Jobs API to monitor progress.

### List Evals

**Endpoint:** `GET /api/evals`

**Query Parameters:**
- `eval_set_id` (string, optional) - Filter by eval set
- `cursor` (string, optional) - Pagination cursor
- `limit` (number, optional) - Results per page (default: 50)

**Response:** `200 OK`
```typescript
{
  "evals": [
    {
      "id": string,
      "name": string,
      "description": string | null,
      "eval_set_id": string,
      "code": string,               // Python eval function code
      "model_used": string,
      "accuracy": number,            // 0-100
      "test_results": {
        "correct": number,
        "incorrect": number,
        "errors": number,
        "total": number,
        "details": [
          {
            "trace_id": string,
            "expected": boolean,
            "predicted": boolean,
            "match": boolean,
            "reason": string,
            "execution_time_ms": number,
            "error": string | null
          }
        ]
      },
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

**Response:** `200 OK`
```typescript
{
  "id": string,
  "name": string,
  "description": string | null,
  "eval_set_id": string,
  "code": string,
  "model_used": string,
  "accuracy": number,
  "test_results": {
    "correct": number,
    "incorrect": number,
    "errors": number,
    "total": number,
    "details": [...]
  },
  "execution_count": number,
  "contradiction_count": number,
  "created_at": string,
  "updated_at": string
}
```

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

**Response:** `200 OK`
```typescript
{
  "id": string,
  "name": string,
  "description": string | null,
  "eval_set_id": string,
  "code": string,
  "model_used": string,
  "accuracy": number,
  "test_results": {...},
  "execution_count": number,
  "contradiction_count": number,
  "created_at": string,
  "updated_at": string
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
  "trace_ids": string[],  // Optional: Specific traces to evaluate
  "force": boolean        // Optional: Re-execute even if already executed
}
```

**Response:** `200 OK`
```typescript
{
  "job_id": string,
  "status": "queued" | "running"
}
```

**Note:** This is an asynchronous operation. Use the Jobs API to monitor progress.

### Get Eval Executions

**Endpoint:** `GET /api/evals/{id}/executions`

**Query Parameters:**
- `filter` (string, optional) - Filter: "contradictions_only", "errors_only", "all" (default: "all")
- `cursor` (string, optional) - Pagination cursor
- `limit` (number, optional) - Results per page (default: 50)

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
      "stdout": string | null,
      "stderr": string | null,
      "executed_at": string,
      "human_feedback": {
        "rating": "positive" | "negative" | "neutral",
        "notes": string | null
      } | null,
      "is_contradiction": boolean,
      "trace_summary": {
        "trace_id": string,
        "input_preview": string,
        "output_preview": string,
        "source": string
      }
    }
  ],
  "next_cursor": string | null,
  "has_more": boolean
}
```

---

## 6. Matrix API

Compare human feedback vs eval predictions.

### Get Matrix

**Endpoint:** `GET /api/eval-sets/{eval_set_id}/matrix`

**Query Parameters:**
- `eval_ids` (string, required) - Comma-separated eval IDs
- `filter` (string, optional) - Filter: "contradictions_only", "errors_only", "all"
- `rating` (string, optional) - Filter by rating: "positive", "negative", "neutral"
- `date_from` (string, optional) - ISO 8601 timestamp
- `date_to` (string, optional) - ISO 8601 timestamp
- `cursor` (string, optional) - Pagination cursor
- `limit` (number, optional) - Results per page (default: 50)

**Response:** `200 OK`
```typescript
{
  "rows": [
    {
      "trace_id": string,
      "trace_summary": {
        "timestamp": string,
        "input_preview": string,
        "output_preview": string,
        "source": string
      },
      "human_feedback": {
        "rating": "positive" | "negative" | "neutral",
        "notes": string | null
      } | null,
      "predictions": {
        "[eval_id]": {
          "result": boolean,
          "reason": string,
          "execution_time_ms": number,
          "error": string | null,
          "is_contradiction": boolean
        } | null
      }
    }
  ],
  "stats": {
    "total_traces": number,
    "traces_with_feedback": number,
    "per_eval": {
      "[eval_id]": {
        "eval_name": string,
        "accuracy": number | null,
        "contradiction_count": number,
        "error_count": number,
        "avg_execution_time_ms": number | null
      }
    }
  },
  "next_cursor": string | null,
  "has_more": boolean
}
```

---

## 7. Jobs API

Monitor asynchronous operations (import, generate, execute).

### Get Job Status

**Endpoint:** `GET /api/jobs/{id}`

**Response:** `200 OK`
```typescript
{
  "id": string,
  "type": "import" | "generate" | "execute",
  "status": "queued" | "running" | "completed" | "failed" | "cancelled",
  "progress": number,        // 0-100
  "created_at": string,
  "started_at": string | null,
  "completed_at": string | null,
  "result": any,            // Job-specific result data
  "error": string | null
}
```

### List Jobs

**Endpoint:** `GET /api/jobs`

**Query Parameters:**
- `type` (string, optional) - Filter by type: "import", "generate", "execute"
- `status` (string, optional) - Filter by status
- `limit` (number, optional) - Results per page (default: 50)

**Response:** `200 OK`
```typescript
{
  "jobs": [
    {
      "id": string,
      "type": "import" | "generate" | "execute",
      "status": "queued" | "running" | "completed" | "failed" | "cancelled",
      "progress": number,
      "created_at": string,
      "started_at": string | null,
      "completed_at": string | null,
      "result": any,
      "error": string | null
    }
  ]
}
```

### Cancel Job

**Endpoint:** `POST /api/jobs/{id}/cancel`

**Response:** `200 OK`
```typescript
{
  "id": string,
  "type": "import" | "generate" | "execute",
  "status": "cancelled",
  "progress": number,
  "created_at": string,
  "started_at": string | null,
  "completed_at": string | null,
  "result": any,
  "error": string | null
}
```

### Stream Job Progress (SSE)

**Endpoint:** `GET /api/jobs/{id}/stream`

**Response:** Server-Sent Events stream

**Event Types:**
```typescript
// Job progress update
{
  "type": "job_progress",
  "job_id": string,
  "status": "queued" | "running",
  "progress": number
}

// Job completed
{
  "type": "job_completed",
  "job_id": string,
  "result": any
}

// Job failed
{
  "type": "job_failed",
  "job_id": string,
  "error": string
}
```

---

## 8. SSE Streaming Endpoints

Real-time updates for eval sets and jobs.

### Stream Eval Set Updates

**Endpoint:** `GET /api/eval-sets/{id}/stream`

**Response:** Server-Sent Events stream

**Event Types:**
```typescript
// Feedback added to eval set
{
  "type": "feedback_added",
  "trace_id": string,
  "rating": "positive" | "negative" | "neutral",
  "stats": {
    "positive_count": number,
    "negative_count": number,
    "neutral_count": number,
    "total_count": number
  }
}

// Threshold reached (ready to generate)
{
  "type": "threshold_reached",
  "ready_to_generate": boolean
}

// Eval generated for this set
{
  "type": "eval_generated",
  "eval_id": string,
  "accuracy": number
}

// Execution completed
{
  "type": "execution_completed",
  "eval_id": string,
  "trace_id": string
}
```

---

## Common Patterns

### Pagination

Most list endpoints support cursor-based pagination:

**Request:**
```
GET /api/traces?limit=50&cursor={next_cursor}
```

**Response:**
```typescript
{
  "data": [...],
  "next_cursor": string | null,
  "has_more": boolean
}
```

- Use `next_cursor` from the response to fetch the next page
- `has_more` indicates if more pages exist
- `next_cursor` is `null` when no more pages available

### Filtering

Many endpoints support filtering via query parameters. Common filters:

- **Date ranges:** `date_from`, `date_to` (ISO 8601 timestamps)
- **Ratings:** `rating` (positive/negative/neutral)
- **Boolean flags:** `has_feedback`, `force`
- **IDs:** `eval_set_id`, `trace_ids`, `eval_ids`

### Timestamps

All timestamps use ISO 8601 format:
```
2025-11-17T10:30:00.000Z
```

### Resource IDs

All IDs use prefixed UUIDs for type safety:
- Traces: `trace_*`
- Eval Sets: `set_*`
- Evals: `eval_*`
- Feedback: `feedback_*`
- Integrations: `integration_*`
- Jobs: `job_*`

---

## Example Workflows

### Workflow 1: Import Traces and Create Eval

```typescript
// 1. Create integration
POST /api/integrations
{
  "platform": "langfuse",
  "api_key": "sk-lf-...",
  "name": "Production Langfuse"
}
// Response: { id: "integration_123" }

// 2. Import traces
POST /api/traces/import
{
  "integration_id": "integration_123",
  "filters": { "limit": 100 }
}
// Response: { job_id: "job_456" }

// 3. Poll job status
GET /api/jobs/job_456
// Wait until status = "completed"

// 4. Create eval set
POST /api/eval-sets
{
  "name": "Customer Support Quality",
  "minimum_examples": 10
}
// Response: { id: "set_789" }

// 5. Submit feedback on traces
POST /api/feedback
{
  "trace_id": "trace_abc",
  "eval_set_id": "set_789",
  "rating": "positive"
}
// Repeat for multiple traces

// 6. Generate eval
POST /api/eval-sets/set_789/generate
{
  "name": "Check Customer Satisfaction"
}
// Response: { job_id: "job_999" }

// 7. Monitor generation progress
GET /api/jobs/job_999/stream
// SSE stream with progress updates
```

### Workflow 2: Review Traces Without Eval Set Filter

```typescript
// Fetch traces without feedback (for review interface)
GET /api/traces?has_feedback=false&limit=50

// User provides feedback via swipe interface
POST /api/feedback
{
  "trace_id": "trace_xyz",
  "eval_set_id": "set_789",
  "rating": "negative",
  "notes": "Response was too slow"
}

// Continue until all traces reviewed
// Check eval set stats
GET /api/eval-sets/set_789
// Shows updated feedback counts
```

### Workflow 3: Compare Human vs Eval

```typescript
// Get comparison matrix
GET /api/eval-sets/set_789/matrix?eval_ids=eval_001,eval_002&filter=contradictions_only

// Response shows:
// - Human feedback vs eval predictions
// - Contradiction flags
// - Accuracy stats per eval

// If contradictions found, refine eval:
POST /api/eval-sets/set_789/generate
{
  "name": "Check Customer Satisfaction v2",
  "custom_instructions": "Focus on response tone"
}
```

---

## TypeScript Types

All TypeScript type definitions are available in `/frontend/types/api.ts` for easy integration.

Import types:
```typescript
import type {
  Trace,
  EvalSet,
  Feedback,
  Eval,
  CreateEvalSetRequest,
  SubmitFeedbackRequest,
  // ... etc
} from '@/types/api'
```

---

## Notes for Frontend Development

1. **Workspace ID:** Use `test-workspace-1` for development. Include in `X-Workspace-Id` header.

2. **Error Handling:** All errors follow the standard error response format. Parse `error.code` for specific error handling.

3. **Async Operations:** Import, generate, and execute operations are asynchronous. Poll job status or use SSE streaming for real-time updates.

4. **Trace Association:** Traces don't belong to an eval set until feedback is submitted. Don't filter traces by `eval_set_id` when fetching for review.

5. **Pagination:** Use cursor-based pagination for large datasets. `next_cursor` is opaque - don't try to parse or manipulate it.

6. **Real-time Updates:** Use SSE endpoints for live updates in dashboards. Fallback to polling if SSE not available.

7. **Date Handling:** Always use ISO 8601 format for timestamps. JavaScript: `new Date().toISOString()`

8. **Authentication:** Currently optional for MVP. Will be required in production.

---

## API Client Example

```typescript
class IOFoldAPIClient {
  private baseURL: string
  private workspaceId: string

  constructor(baseURL: string = 'http://localhost:8787/v1') {
    this.baseURL = baseURL
    this.workspaceId = 'test-workspace-1'
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Id': this.workspaceId,
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new APIError(error, response.status)
    }

    if (response.status === 204) {
      return {} as T
    }

    return response.json()
  }

  // Example method
  async listTraces(params?: {
    has_feedback?: boolean
    limit?: number
  }): Promise<ListTracesResponse> {
    const query = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          query.append(key, String(value))
        }
      })
    }
    return this.request(`/api/traces?${query}`)
  }
}
```

---

## Support

For questions or issues with the API:
- Check the error response `request_id` for debugging
- Review the implementation in `/src/api/` directory
- Consult the database schema in `/schema.sql`

**API Version:** v1 (2025-11-17)
