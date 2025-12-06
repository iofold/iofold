# iofold.com API Specification

**Date:** November 12, 2025
**Status:** Design Phase
**Version:** 1.0

---

## Overview

This document defines the complete REST API specification for iofold.com Phases 1 & 2, covering:
- Trace import and management
- Annotation and feedback collection
- Eval generation and execution
- Comparison matrix and exploration

### Design Principles

1. **Performance-First**: Optimized for quick and snappy UX
   - Cursor-based pagination for consistent performance
   - Two-tier data loading (list summaries, detail on-demand)
   - Optimistic UI with background queues
   - Server-Sent Events for real-time updates

2. **RESTful**: Standard HTTP conventions
   - Resource-oriented URLs
   - Standard HTTP methods (GET, POST, PATCH, DELETE)
   - Predictable status codes
   - Simple query param filters

3. **Developer-Friendly**:
   - Consistent response formats
   - Detailed error messages
   - TypeScript types provided
   - Request/response examples

### Base URL

```
Production: https://api.iofold.com/v1
Development: http://localhost:8787/v1
```

### Authentication

All API requests require authentication via Bearer token:

```http
Authorization: Bearer <jwt_token>
```

Workspace context provided via header:

```http
X-Workspace-Id: workspace_abc123
```

---

## Table of Contents

1. [Authentication & Integrations](#1-authentication--integrations)
2. [Trace Management](#2-trace-management)
3. [Eval Sets & Feedback](#3-eval-sets--feedback)
4. [Eval Generation & Execution](#4-eval-generation--execution)
5. [Eval Matrix & Results](#5-eval-matrix--results)
6. [Jobs & Background Tasks](#6-jobs--background-tasks)
7. [Error Handling](#7-error-handling)
8. [Data Types & Schemas](#8-data-types--schemas)

---

## 1. Authentication & Integrations

### 1.1 Connect External Platform

Connect Langfuse, Langsmith, or OpenAI account for trace import.

**Endpoint:** `POST /api/integrations`

**Request:**
```json
{
  "platform": "langfuse" | "langsmith" | "openai",
  "api_key": "string",
  "base_url": "string (optional, for self-hosted)",
  "name": "string (optional, user-friendly label)"
}
```

**Response:** `201 Created`
```json
{
  "id": "int_abc123",
  "platform": "langfuse",
  "name": "Production Langfuse",
  "status": "active",
  "last_synced_at": null,
  "created_at": "2025-11-12T10:00:00Z"
}
```

**Errors:**
- `400` - Invalid platform or missing API key
- `422` - API key validation failed (cannot connect to platform)

---

### 1.2 List Integrations

Get all connected platforms for workspace.

**Endpoint:** `GET /api/integrations`

**Response:** `200 OK`
```json
{
  "integrations": [
    {
      "id": "int_abc123",
      "platform": "langfuse",
      "name": "Production Langfuse",
      "status": "active",
      "error_message": null,
      "last_synced_at": "2025-11-12T09:45:00Z"
    },
    {
      "id": "int_def456",
      "platform": "langsmith",
      "name": "Staging",
      "status": "error",
      "error_message": "Invalid API key",
      "last_synced_at": "2025-11-10T14:20:00Z"
    }
  ]
}
```

---

### 1.3 Test Connection

Verify integration credentials are still valid.

**Endpoint:** `POST /api/integrations/{id}/test`

**Response:** `200 OK`
```json
{
  "status": "success"
}
```

**Or on error:**
```json
{
  "status": "error",
  "error_message": "API key expired"
}
```

---

### 1.4 Delete Integration

Remove connected platform and associated data.

**Endpoint:** `DELETE /api/integrations/{id}`

**Response:** `204 No Content`

**Note:** This does NOT delete imported traces, only the connection.

---

## 2. Trace Management

### 2.1 Import Traces

Fetch traces from connected platform into iofold.

**Endpoint:** `POST /api/traces/import`

**Request:**
```json
{
  "integration_id": "int_abc123",
  "filters": {
    "date_from": "2025-11-01T00:00:00Z (optional)",
    "date_to": "2025-11-12T23:59:59Z (optional)",
    "tags": ["production", "v2"] (optional),
    "user_ids": ["user_123"] (optional),
    "limit": 100 (optional, default: 100, max: 1000)
  }
}
```

**Response:** `202 Accepted`
```json
{
  "job_id": "job_xyz789",
  "status": "queued",
  "estimated_count": 87
}
```

**Monitor progress via SSE:**
```
GET /api/jobs/{job_id}/stream

Events:
  data: {"status":"fetching","progress":0}
  data: {"status":"processing","progress":45,"imported":45,"total":100}
  data: {"status":"completed","imported":98,"failed":2,"errors":[...]}
```

**Errors:**
- `404` - Integration not found
- `422` - Invalid filter parameters

---

### 2.2 List Traces

Get paginated list of traces (lightweight for annotation UI).

**Endpoint:** `GET /api/traces`

**Query Parameters:**
- `eval_set_id` (optional) - Filter by eval set
- `source` (optional) - `langfuse`, `langsmith`, `openai`
- `rating` (optional) - `positive`, `negative`, `neutral` (comma-separated)
- `has_feedback` (optional) - `true` or `false`
- `date_from` (optional) - ISO 8601 timestamp
- `date_to` (optional) - ISO 8601 timestamp
- `cursor` (optional) - Pagination cursor
- `limit` (optional) - Default: 50, Max: 200

**Response:** `200 OK`
```json
{
  "traces": [
    {
      "id": "trace_abc123",
      "trace_id": "langfuse_trace_456",
      "source": "langfuse",
      "timestamp": "2025-11-12T09:30:00Z",
      "step_count": 3,
      "feedback": {
        "rating": "positive",
        "notes": "Good response quality",
        "eval_set_id": "set_xyz"
      },
      "summary": {
        "input_preview": "User asked about pricing...",
        "output_preview": "Our pricing starts at $10/month...",
        "has_errors": false
      }
    }
  ],
  "next_cursor": "cursor_def456",
  "has_more": true,
  "total_count": 1247
}
```

**Notes:**
- `total_count` is expensive to compute, cached for 60 seconds
- `feedback` is `null` if trace not annotated
- Summaries are pre-computed on import (first 200 chars)

---

### 2.3 Get Trace Details

Get complete trace data with all steps, messages, and tool calls.

**Endpoint:** `GET /api/traces/{id}`

**Response:** `200 OK`
```json
{
  "id": "trace_abc123",
  "trace_id": "langfuse_trace_456",
  "source": "langfuse",
  "timestamp": "2025-11-12T09:30:00Z",
  "metadata": {
    "user_id": "user_789",
    "session_id": "session_xyz",
    "tags": ["production", "chat"],
    "environment": "prod"
  },
  "steps": [
    {
      "step_id": "step_1",
      "timestamp": "2025-11-12T09:30:01Z",
      "messages_added": [
        {
          "role": "user",
          "content": "What are your pricing plans?"
        }
      ],
      "tool_calls": [],
      "input": {
        "query": "What are your pricing plans?"
      },
      "output": {
        "response": "Our pricing starts at $10/month..."
      },
      "error": null,
      "metadata": {
        "model": "gpt-4",
        "temperature": 0.7
      }
    },
    {
      "step_id": "step_2",
      "timestamp": "2025-11-12T09:30:03Z",
      "messages_added": [
        {
          "role": "assistant",
          "content": "Let me check our pricing database..."
        }
      ],
      "tool_calls": [
        {
          "tool_name": "get_pricing",
          "arguments": {
            "plan_type": "standard"
          },
          "result": {
            "price": 10,
            "currency": "USD"
          },
          "error": null
        }
      ],
      "input": {},
      "output": {
        "pricing_data": {...}
      },
      "error": null,
      "metadata": {}
    }
  ],
  "feedback": {
    "id": "fb_123",
    "rating": "positive",
    "notes": "Good response quality",
    "eval_set_id": "set_xyz",
    "created_at": "2025-11-12T09:35:00Z"
  }
}
```

**Errors:**
- `404` - Trace not found

**Performance Note:**
- This endpoint loads full trace data (~10-100KB per trace)
- Only called when user clicks into trace detail view
- Frontend should cache aggressively

---

### 2.4 Delete Trace

Remove trace from database.

**Endpoint:** `DELETE /api/traces/{id}`

**Response:** `204 No Content`

**Bulk delete:**
```
DELETE /api/traces
Request: { "trace_ids": ["trace_1", "trace_2"] }
Response: { "deleted_count": 2 }
```

---

## 3. Eval Sets & Feedback

### 3.1 Create Eval Set

Create new collection for organizing feedback.

**Endpoint:** `POST /api/eval-sets`

**Request:**
```json
{
  "name": "response-quality",
  "description": "Checks if responses are helpful and accurate (optional)",
  "minimum_examples": 5 (optional, default: 5)
}
```

**Response:** `201 Created`
```json
{
  "id": "set_abc123",
  "name": "response-quality",
  "description": "Checks if responses are helpful and accurate",
  "minimum_examples": 5,
  "stats": {
    "positive_count": 0,
    "negative_count": 0,
    "neutral_count": 0,
    "total_count": 0
  },
  "created_at": "2025-11-12T10:00:00Z"
}
```

**Errors:**
- `409` - Eval set with same name already exists

---

### 3.2 List Eval Sets

Get all eval sets for workspace.

**Endpoint:** `GET /api/eval-sets`

**Response:** `200 OK`
```json
{
  "eval_sets": [
    {
      "id": "set_abc123",
      "name": "response-quality",
      "description": "Checks if responses are helpful and accurate",
      "stats": {
        "positive_count": 7,
        "negative_count": 3,
        "neutral_count": 1,
        "total_count": 11
      },
      "eval_count": 2,
      "last_updated": "2025-11-12T09:45:00Z",
      "created_at": "2025-11-10T14:20:00Z"
    }
  ]
}
```

---

### 3.3 Get Eval Set Details

Get detailed information about eval set.

**Endpoint:** `GET /api/eval-sets/{id}`

**Response:** `200 OK`
```json
{
  "id": "set_abc123",
  "name": "response-quality",
  "description": "Checks if responses are helpful and accurate",
  "minimum_examples": 5,
  "stats": {
    "positive_count": 7,
    "negative_count": 3,
    "neutral_count": 1,
    "total_count": 11
  },
  "evals": [
    {
      "id": "eval_xyz",
      "name": "response_quality_check",
      "accuracy": 0.9,
      "created_at": "2025-11-11T10:00:00Z"
    }
  ],
  "created_at": "2025-11-10T14:20:00Z",
  "updated_at": "2025-11-12T09:45:00Z"
}
```

---

### 3.4 Update Eval Set

Modify eval set properties.

**Endpoint:** `PATCH /api/eval-sets/{id}`

**Request:**
```json
{
  "name": "response-quality-v2 (optional)",
  "description": "Updated description (optional)",
  "minimum_examples": 10 (optional)
}
```

**Response:** `200 OK` (same as GET)

---

### 3.5 Delete Eval Set

Remove eval set and associated feedback.

**Endpoint:** `DELETE /api/eval-sets/{id}`

**Response:** `204 No Content`

**Note:** This also deletes all feedback in the set. Associated evals are NOT deleted.

---

### 3.6 Submit Feedback

Annotate a trace with rating (optimistic UI on frontend).

**Endpoint:** `POST /api/feedback`

**Request:**
```json
{
  "trace_id": "trace_abc123",
  "eval_set_id": "set_xyz",
  "rating": "positive" | "negative" | "neutral",
  "notes": "Good response quality (optional)"
}
```

**Response:** `201 Created`
```json
{
  "id": "fb_123",
  "trace_id": "trace_abc123",
  "eval_set_id": "set_xyz",
  "rating": "positive",
  "notes": "Good response quality",
  "created_at": "2025-11-12T10:05:00Z"
}
```

**Errors:**
- `404` - Trace or eval set not found
- `409` - Feedback already exists for this trace/eval_set combination (use PATCH to update)

**Frontend Implementation:**
```typescript
// Optimistic queue pattern
const feedbackQueue = [];

function submitFeedback(feedback) {
  // 1. Update UI immediately
  updateUIOptimistically(feedback);

  // 2. Add to queue
  feedbackQueue.push(feedback);

  // 3. Process in background
  processFeedbackQueue();
}

async function processFeedbackQueue() {
  while (feedbackQueue.length > 0) {
    const feedback = feedbackQueue[0];
    try {
      await api.post('/api/feedback', feedback);
      feedbackQueue.shift(); // Remove on success
    } catch (error) {
      if (isRetryable(error)) {
        await sleep(2000);
        continue;
      } else {
        // Show error indicator, remove from queue
        showErrorToast(feedback);
        feedbackQueue.shift();
      }
    }
  }
}
```

---

### 3.7 Update Feedback

Modify existing feedback rating or notes.

**Endpoint:** `PATCH /api/feedback/{id}`

**Request:**
```json
{
  "rating": "negative (optional)",
  "notes": "Updated notes (optional)"
}
```

**Response:** `200 OK` (same as POST)

---

### 3.8 Delete Feedback

Remove feedback annotation.

**Endpoint:** `DELETE /api/feedback/{id}`

**Response:** `204 No Content`

---

### 3.9 Eval Set Live Updates (SSE)

Stream real-time updates for eval set progress.

**Endpoint:** `GET /api/eval-sets/{id}/stream`

**SSE Events:**
```
event: feedback_added
data: {"trace_id":"trace_123","rating":"positive","stats":{"positive_count":6,"negative_count":4,"neutral_count":0,"total_count":10}}

event: threshold_reached
data: {"ready_to_generate":true,"minimum_examples":5,"current_count":10}

event: eval_generated
data: {"eval_id":"eval_xyz","accuracy":0.9}
```

**Frontend Implementation:**
```typescript
const eventSource = new EventSource(`/api/eval-sets/${setId}/stream`, {
  headers: { 'Authorization': `Bearer ${token}` }
});

eventSource.addEventListener('feedback_added', (e) => {
  const data = JSON.parse(e.data);
  updateStatsInUI(data.stats);
});

eventSource.addEventListener('threshold_reached', (e) => {
  const data = JSON.parse(e.data);
  showGenerateButton(data.ready_to_generate);
});
```

---

## 4. Eval Generation & Execution

### 4.1 Generate Eval

Generate Python eval function from labeled traces in eval set.

**Endpoint:** `POST /api/eval-sets/{id}/generate`

**Request:**
```json
{
  "name": "response_quality_check",
  "description": "Checks if response is helpful and accurate (optional)",
  "model": "claude-sonnet-4.5 (optional, default)",
  "custom_instructions": "Focus on technical accuracy and completeness (optional)"
}
```

**Response:** `202 Accepted`
```json
{
  "job_id": "job_xyz789",
  "status": "queued"
}
```

**Monitor generation via SSE:**
```
GET /api/jobs/{job_id}/stream

Events:
  data: {"status":"fetching_traces","progress":0}
  data: {"status":"calling_llm","progress":20}
  data: {"status":"validating_code","progress":60}
  data: {"status":"testing_accuracy","progress":80,"tested":8,"total":10}
  data: {"status":"completed","progress":100,"result":{"eval_id":"eval_xyz","accuracy":0.9,"test_results":{"correct":9,"incorrect":1,"errors":0}}}

OR on failure:
  data: {"status":"failed","error":"Invalid Python syntax","details":"SyntaxError at line 12"}
```

**Errors:**
- `404` - Eval set not found
- `422` - Insufficient examples (below minimum_examples threshold)

**Generation Process:**
1. Fetch all feedback from eval set
2. Group by rating (positive/negative/neutral)
3. Call LLM with meta-prompting template
4. Validate generated Python code (syntax, imports)
5. Execute against training set
6. Save eval with accuracy metrics
7. Return result

**Typical Duration:** 15-45 seconds depending on:
- Number of traces (5-20)
- Trace complexity (size of input/output)
- LLM response time

---

### 4.2 List Evals

Get all generated evals.

**Endpoint:** `GET /api/evals`

**Query Parameters:**
- `eval_set_id` (optional) - Filter by eval set
- `cursor` (optional)
- `limit` (optional, default: 50)

**Response:** `200 OK`
```json
{
  "evals": [
    {
      "id": "eval_abc123",
      "name": "response_quality_check",
      "description": "Checks if response is helpful and accurate",
      "eval_set_id": "set_xyz",
      "accuracy": 0.9,
      "execution_count": 127,
      "contradiction_count": 3,
      "created_at": "2025-11-11T10:00:00Z",
      "updated_at": "2025-11-12T09:45:00Z"
    }
  ],
  "next_cursor": "cursor_def456",
  "has_more": true
}
```

---

### 4.3 Get Eval Details

Get complete eval including generated code and test results.

**Endpoint:** `GET /api/evals/{id}`

**Response:** `200 OK`
```json
{
  "id": "eval_abc123",
  "name": "response_quality_check",
  "description": "Checks if response is helpful and accurate",
  "eval_set_id": "set_xyz",
  "code": "import json\nimport re\nfrom typing import Tuple\n\ndef response_quality_check(trace: dict) -> Tuple[bool, str]:\n    # Check if output exists and is non-empty\n    steps = trace.get('steps', [])\n    if not steps:\n        return (False, 'No execution steps found')\n    \n    last_step = steps[-1]\n    output = last_step.get('output', {})\n    \n    if not output:\n        return (False, 'Empty output')\n    \n    # Check for errors\n    if last_step.get('error'):\n        return (False, f\"Error in execution: {last_step['error']}\")\n    \n    # Check output quality indicators\n    response_text = str(output)\n    if len(response_text) < 10:\n        return (False, 'Response too short')\n    \n    # Check for helpful patterns\n    helpful_patterns = ['pricing', 'plan', 'cost', 'help']\n    if any(p in response_text.lower() for p in helpful_patterns):\n        return (True, 'Response contains helpful information')\n    \n    return (False, 'Response does not contain expected information')",
  "model_used": "claude-sonnet-4.5",
  "accuracy": 0.9,
  "test_results": {
    "correct": 9,
    "incorrect": 1,
    "errors": 0,
    "total": 10,
    "details": [
      {
        "trace_id": "trace_1",
        "expected": true,
        "predicted": true,
        "match": true,
        "reason": "Response contains helpful information",
        "execution_time_ms": 12
      },
      {
        "trace_id": "trace_2",
        "expected": false,
        "predicted": true,
        "match": false,
        "reason": "Response contains helpful information",
        "execution_time_ms": 8
      }
    ]
  },
  "execution_count": 127,
  "contradiction_count": 3,
  "created_at": "2025-11-11T10:00:00Z",
  "updated_at": "2025-11-12T09:45:00Z"
}
```

**Notes:**
- `code` is the full Python function as string
- `test_results` show performance on training set
- `accuracy` = correct / total from training set
- `contradiction_count` = predictions != human feedback across all executions

---

### 4.4 Update Eval

Modify eval properties or code (manual editing).

**Endpoint:** `PATCH /api/evals/{id}`

**Request:**
```json
{
  "name": "response_quality_v2 (optional)",
  "description": "Updated description (optional)",
  "code": "import json\n... (optional, full code)"
}
```

**Response:** `200 OK` (same as GET)

**Important:**
- Editing code invalidates `accuracy` and `test_results`
- User should trigger re-execution to update metrics
- Frontend should show warning: "Code modified, re-run tests to update accuracy"

---

### 4.5 Execute Eval

Run eval against traces to generate predictions.

**Endpoint:** `POST /api/evals/{eval_id}/execute`

**Request:**
```json
{
  "trace_ids": ["trace_1", "trace_2"] (optional, all traces in eval set if omitted),
  "force": false (optional, re-run even if already executed, default: false)
}
```

**Response:** `202 Accepted`
```json
{
  "job_id": "job_xyz789",
  "status": "queued",
  "estimated_count": 15
}
```

**Monitor execution via SSE:**
```
GET /api/jobs/{job_id}/stream

Events:
  data: {"status":"running","progress":45,"completed":45,"total":100,"avg_execution_time_ms":15}
  data: {"status":"completed","completed":98,"failed":2,"errors":[{"trace_id":"trace_123","error":"Execution timeout"}]}
```

**Execution Details:**
- Runs in Cloudflare Sandbox (isolated Python container)
- 5-second timeout per trace
- 50MB memory limit
- Captures stdout/stderr for debugging
- Marks contradictions (prediction != human feedback)

**When to Execute:**
- Auto-triggered after eval generation (on training set)
- Manual trigger after code editing
- Manual trigger for new traces added to eval set

---

### 4.6 Delete Eval

Remove eval and all execution results.

**Endpoint:** `DELETE /api/evals/{id}`

**Response:** `204 No Content`

**Warning:** This deletes all execution results for this eval. Cannot be undone.

---

## 5. Eval Matrix & Results

### 5.1 Get Comparison Matrix

View eval predictions vs human feedback across traces (paginated).

**Endpoint:** `GET /api/eval-sets/{id}/matrix`

**Query Parameters:**
- `eval_ids` (required) - Comma-separated eval IDs to compare
- `filter` (optional) - `contradictions_only`, `errors_only`, `all` (default)
- `rating` (optional) - Filter by human rating: `positive`, `negative`, `neutral`
- `date_from` (optional)
- `date_to` (optional)
- `cursor` (optional)
- `limit` (optional, default: 50, max: 200)

**Example Request:**
```
GET /api/eval-sets/set_abc/matrix?eval_ids=eval_1,eval_2,eval_3&filter=contradictions_only&cursor=xyz&limit=50
```

**Response:** `200 OK`
```json
{
  "rows": [
    {
      "trace_id": "trace_abc123",
      "trace_summary": {
        "timestamp": "2025-11-12T09:30:00Z",
        "input_preview": "User asked about pricing...",
        "output_preview": "Our pricing starts at $10/month...",
        "source": "langfuse"
      },
      "human_feedback": {
        "rating": "positive",
        "notes": "Good response quality"
      },
      "predictions": {
        "eval_1": {
          "result": false,
          "reason": "Response too generic",
          "execution_time_ms": 12,
          "error": null,
          "is_contradiction": true
        },
        "eval_2": {
          "result": true,
          "reason": "Response contains pricing information",
          "execution_time_ms": 8,
          "error": null,
          "is_contradiction": false
        },
        "eval_3": null
      }
    }
  ],
  "stats": {
    "total_traces": 15,
    "traces_with_feedback": 12,
    "per_eval": {
      "eval_1": {
        "eval_name": "response_quality_check",
        "accuracy": 0.75,
        "contradiction_count": 3,
        "error_count": 0,
        "avg_execution_time_ms": 11
      },
      "eval_2": {
        "eval_name": "tool_usage_check",
        "accuracy": 0.92,
        "contradiction_count": 1,
        "error_count": 0,
        "avg_execution_time_ms": 9
      },
      "eval_3": {
        "eval_name": "format_check",
        "accuracy": null,
        "contradiction_count": 0,
        "error_count": 0,
        "avg_execution_time_ms": null
      }
    }
  },
  "next_cursor": "cursor_def456",
  "has_more": true
}
```

**Notes:**
- `predictions[eval_id]` is `null` if eval hasn't been executed against this trace
- `is_contradiction` = (human positive AND predicted false) OR (human negative AND predicted true)
- Neutral ratings are NOT considered contradictions
- `accuracy` computed only for traces with human feedback
- Stats are computed for filtered subset (not entire eval set)

**Performance:**
- Matrix computed on-demand (not pre-materialized)
- Filtering applied at query level (efficient)
- Typical response time: 50-200ms for 50 rows

---

### 5.2 Get Eval Execution Result

Get detailed result for specific eval on specific trace.

**Endpoint:** `GET /api/eval-executions/{trace_id}/{eval_id}`

**Response:** `200 OK`
```json
{
  "trace_id": "trace_abc123",
  "eval_id": "eval_xyz",
  "result": false,
  "reason": "Response too generic",
  "execution_time_ms": 12,
  "error": null,
  "stdout": "",
  "stderr": "",
  "executed_at": "2025-11-12T10:30:00Z",
  "human_feedback": {
    "rating": "positive",
    "notes": "Good response quality"
  },
  "is_contradiction": true
}
```

**Errors:**
- `404` - Execution result not found (eval not run against this trace)

**Use Case:** Drill-down from matrix cell to see full details

---

### 5.3 List Executions for Trace

Get all eval results for a specific trace.

**Endpoint:** `GET /api/traces/{trace_id}/executions`

**Response:** `200 OK`
```json
{
  "executions": [
    {
      "eval_id": "eval_1",
      "eval_name": "response_quality_check",
      "result": false,
      "reason": "Response too generic",
      "execution_time_ms": 12,
      "error": null,
      "executed_at": "2025-11-12T10:30:00Z"
    },
    {
      "eval_id": "eval_2",
      "eval_name": "tool_usage_check",
      "result": true,
      "reason": "Correct tools used",
      "execution_time_ms": 9,
      "error": null,
      "executed_at": "2025-11-12T10:30:05Z"
    }
  ]
}
```

**Use Case:** Trace detail view showing all eval results

---

### 5.4 List Executions for Eval

Get all traces evaluated by specific eval (paginated).

**Endpoint:** `GET /api/evals/{eval_id}/executions`

**Query Parameters:**
- `result` (optional) - `true` or `false` to filter pass/fail
- `has_error` (optional) - `true` to show only failed executions
- `cursor` (optional)
- `limit` (optional, default: 50)

**Response:** `200 OK`
```json
{
  "executions": [
    {
      "id": "exec_abc123",
      "trace_id": "trace_xyz",
      "result": false,
      "reason": "Response too generic",
      "execution_time_ms": 12,
      "error": null,
      "executed_at": "2025-11-12T10:30:00Z",
      "trace_summary": {
        "timestamp": "2025-11-12T09:30:00Z",
        "input_preview": "User asked about pricing...",
        "output_preview": "Our pricing starts at $10/month..."
      }
    }
  ],
  "next_cursor": "cursor_def456",
  "has_more": true
}
```

**Use Case:** Eval detail view showing all predictions

---

## 6. Jobs & Background Tasks

### 6.1 Get Job Status

Check status of long-running operation.

**Endpoint:** `GET /api/jobs/{job_id}`

**Response:** `200 OK`
```json
{
  "id": "job_xyz789",
  "type": "import" | "generate" | "execute",
  "status": "queued" | "running" | "completed" | "failed" | "cancelled",
  "progress": 75,
  "created_at": "2025-11-12T10:00:00Z",
  "started_at": "2025-11-12T10:00:02Z",
  "completed_at": null,
  "result": null,
  "error": null
}
```

**When completed:**
```json
{
  "id": "job_xyz789",
  "type": "generate",
  "status": "completed",
  "progress": 100,
  "created_at": "2025-11-12T10:00:00Z",
  "started_at": "2025-11-12T10:00:02Z",
  "completed_at": "2025-11-12T10:00:35Z",
  "result": {
    "eval_id": "eval_abc",
    "accuracy": 0.9,
    "test_results": {...}
  },
  "error": null
}
```

**When failed:**
```json
{
  "id": "job_xyz789",
  "type": "generate",
  "status": "failed",
  "progress": 60,
  "created_at": "2025-11-12T10:00:00Z",
  "started_at": "2025-11-12T10:00:02Z",
  "completed_at": "2025-11-12T10:00:25Z",
  "result": null,
  "error": "Invalid Python syntax: SyntaxError at line 12"
}
```

---

### 6.2 Stream Job Progress (SSE)

Real-time updates for job progress.

**Endpoint:** `GET /api/jobs/{job_id}/stream`

**SSE Events:**

```
# Import job
event: progress
data: {"status":"running","progress":45,"imported":45,"total":100}

event: completed
data: {"status":"completed","imported":98,"failed":2}

# Generate job
event: progress
data: {"status":"calling_llm","progress":20}

event: progress
data: {"status":"testing_accuracy","progress":80,"tested":8,"total":10}

event: completed
data: {"status":"completed","result":{"eval_id":"eval_xyz","accuracy":0.9}}

# Execute job
event: progress
data: {"status":"running","progress":65,"completed":65,"total":100,"avg_execution_time_ms":12}

event: completed
data: {"status":"completed","completed":98,"failed":2,"errors":[...]}

# Any job failure
event: failed
data: {"status":"failed","error":"Execution timeout","details":"..."}
```

**Connection Management:**
- Server sends heartbeat every 30 seconds
- Client should reconnect on disconnect
- Job events cached for 5 minutes (can reconnect and resume)

---

### 6.3 Cancel Job

Stop running job (best effort).

**Endpoint:** `POST /api/jobs/{job_id}/cancel`

**Response:** `200 OK`
```json
{
  "id": "job_xyz789",
  "status": "cancelled"
}
```

**Notes:**
- Cancellation is best-effort (may complete if already near end)
- Partial results are saved (e.g., 45 of 100 traces imported)
- Job status changes to `cancelled`

---

### 6.4 List Recent Jobs

Get recent jobs for workspace.

**Endpoint:** `GET /api/jobs`

**Query Parameters:**
- `type` (optional) - `import`, `generate`, `execute`
- `status` (optional) - `queued`, `running`, `completed`, `failed`, `cancelled`
- `limit` (optional, default: 20, max: 100)

**Response:** `200 OK`
```json
{
  "jobs": [
    {
      "id": "job_xyz789",
      "type": "generate",
      "status": "completed",
      "progress": 100,
      "created_at": "2025-11-12T10:00:00Z",
      "completed_at": "2025-11-12T10:00:35Z"
    }
  ]
}
```

---

## 7. Error Handling

### 7.1 Standard Error Format

All errors return consistent JSON structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": {
      "field": "eval_set_id",
      "reason": "Eval set not found"
    },
    "request_id": "req_abc123"
  }
}
```

**Fields:**
- `code` - Machine-readable error code (see below)
- `message` - Human-readable error message
- `details` - Additional context (field-specific errors, stack traces in dev)
- `request_id` - Unique ID for support/debugging

---

### 7.2 HTTP Status Codes

**Success:**
- `200 OK` - Successful GET/PATCH
- `201 Created` - Successful POST (resource created)
- `202 Accepted` - Async operation queued
- `204 No Content` - Successful DELETE

**Client Errors:**
- `400 Bad Request` - Invalid syntax, malformed JSON
- `401 Unauthorized` - Missing or invalid auth token
- `403 Forbidden` - Authenticated but insufficient permissions
- `404 Not Found` - Resource doesn't exist
- `409 Conflict` - Resource already exists (duplicate name)
- `422 Unprocessable Entity` - Valid syntax but logical error (e.g., insufficient examples)
- `429 Too Many Requests` - Rate limit exceeded

**Server Errors:**
- `500 Internal Server Error` - Unexpected server error
- `503 Service Unavailable` - External service down (Langfuse, Claude API)

---

### 7.3 Error Codes

**Validation:**
- `VALIDATION_ERROR` - Invalid request parameters
- `MISSING_REQUIRED_FIELD` - Required field not provided
- `INVALID_FORMAT` - Field format invalid (e.g., bad date)

**Resource:**
- `NOT_FOUND` - Resource doesn't exist
- `ALREADY_EXISTS` - Duplicate resource
- `INSUFFICIENT_EXAMPLES` - Not enough labeled traces

**Authentication:**
- `UNAUTHORIZED` - Authentication failed
- `FORBIDDEN` - Permission denied
- `INVALID_TOKEN` - JWT token invalid/expired

**Rate Limiting:**
- `RATE_LIMIT_EXCEEDED` - Too many requests

**External Services:**
- `INTEGRATION_ERROR` - External platform API error
- `LLM_ERROR` - Claude/GPT API error
- `GENERATION_FAILED` - LLM failed to generate valid eval

**Execution:**
- `EXECUTION_TIMEOUT` - Eval execution exceeded timeout
- `EXECUTION_ERROR` - Runtime error in eval code
- `INVALID_CODE` - Generated code failed validation

---

### 7.4 Rate Limiting

**Limits:**
- 1000 requests per minute per workspace
- 100 concurrent SSE connections per workspace
- 10 concurrent generation jobs per workspace

**Headers:**
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1672531200
```

**On limit exceeded:**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded",
    "details": {
      "limit": 1000,
      "reset_at": "2025-11-12T10:05:00Z"
    },
    "request_id": "req_abc123"
  }
}
```

---

## 8. Data Types & Schemas

### 8.1 TypeScript Types

```typescript
// ============================================================================
// Core Entities
// ============================================================================

interface Trace {
  id: string;
  trace_id: string;
  source: 'langfuse' | 'langsmith' | 'openai';
  timestamp: string; // ISO 8601
  metadata: Record<string, any>;
  steps: ExecutionStep[];
  feedback?: Feedback;
}

interface TraceSummary {
  id: string;
  trace_id: string;
  source: string;
  timestamp: string;
  step_count: number;
  feedback?: Feedback;
  summary: {
    input_preview: string;
    output_preview: string;
    has_errors: boolean;
  };
}

interface ExecutionStep {
  step_id: string;
  timestamp: string;
  messages_added: Message[];
  tool_calls: ToolCall[];
  input: any;
  output: any;
  error?: string;
  metadata: Record<string, any>;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, any>;
}

interface ToolCall {
  tool_name: string;
  arguments: Record<string, any>;
  result?: any;
  error?: string;
}

// ============================================================================
// Eval Sets & Feedback
// ============================================================================

interface EvalSet {
  id: string;
  name: string;
  description: string | null;
  minimum_examples: number;
  stats: {
    positive_count: number;
    negative_count: number;
    neutral_count: number;
    total_count: number;
  };
  created_at: string;
  updated_at: string;
}

interface EvalSetWithEvals extends EvalSet {
  evals: EvalSummary[];
}

interface EvalSummary {
  id: string;
  name: string;
  accuracy: number;
  created_at: string;
}

interface Feedback {
  id: string;
  trace_id: string;
  eval_set_id: string;
  rating: 'positive' | 'negative' | 'neutral';
  notes: string | null;
  created_at: string;
}

// ============================================================================
// Evals
// ============================================================================

interface Eval {
  id: string;
  name: string;
  description: string | null;
  eval_set_id: string;
  code: string;
  model_used: string;
  accuracy: number;
  test_results: TestResults;
  execution_count: number;
  contradiction_count: number;
  created_at: string;
  updated_at: string;
}

interface TestResults {
  correct: number;
  incorrect: number;
  errors: number;
  total: number;
  details: TestCaseResult[];
}

interface TestCaseResult {
  trace_id: string;
  expected: boolean;
  predicted: boolean;
  match: boolean;
  reason: string;
  execution_time_ms: number;
  error?: string;
}

// ============================================================================
// Eval Execution & Matrix
// ============================================================================

interface EvalExecution {
  trace_id: string;
  eval_id: string;
  result: boolean;
  reason: string;
  execution_time_ms: number;
  error?: string;
  stdout?: string;
  stderr?: string;
  executed_at: string;
}

interface EvalExecutionWithContext extends EvalExecution {
  human_feedback?: Feedback;
  is_contradiction: boolean;
}

interface MatrixRow {
  trace_id: string;
  trace_summary: {
    timestamp: string;
    input_preview: string;
    output_preview: string;
    source: string;
  };
  human_feedback: {
    rating: 'positive' | 'negative' | 'neutral';
    notes: string | null;
  } | null;
  predictions: {
    [eval_id: string]: {
      result: boolean;
      reason: string;
      execution_time_ms: number;
      error?: string;
      is_contradiction: boolean;
    } | null;
  };
}

interface MatrixStats {
  total_traces: number;
  traces_with_feedback: number;
  per_eval: {
    [eval_id: string]: {
      eval_name: string;
      accuracy: number | null;
      contradiction_count: number;
      error_count: number;
      avg_execution_time_ms: number | null;
    };
  };
}

// ============================================================================
// Jobs
// ============================================================================

interface Job {
  id: string;
  type: 'import' | 'generate' | 'execute';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0-100
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  result?: any;
  error?: string;
}

// ============================================================================
// Integrations
// ============================================================================

interface Integration {
  id: string;
  platform: 'langfuse' | 'langsmith' | 'openai';
  name: string;
  status: 'active' | 'error';
  error_message?: string;
  last_synced_at: string | null;
  created_at: string;
}

// ============================================================================
// Pagination
// ============================================================================

interface PaginatedResponse<T> {
  data: T[];
  next_cursor: string | null;
  has_more: boolean;
}

interface PaginatedResponseWithCount<T> extends PaginatedResponse<T> {
  total_count: number;
}

// ============================================================================
// Errors
// ============================================================================

interface APIError {
  error: {
    code: string;
    message: string;
    details?: any;
    request_id: string;
  };
}

// ============================================================================
// SSE Events
// ============================================================================

type SSEEvent =
  | { type: 'job_progress'; job_id: string; status: string; progress: number }
  | { type: 'job_completed'; job_id: string; result: any }
  | { type: 'job_failed'; job_id: string; error: string }
  | { type: 'feedback_added'; trace_id: string; rating: string; stats: any }
  | { type: 'threshold_reached'; ready_to_generate: boolean }
  | { type: 'eval_generated'; eval_id: string; accuracy: number }
  | { type: 'execution_completed'; eval_id: string; trace_id: string };

// ============================================================================
// Request Types
// ============================================================================

interface CreateIntegrationRequest {
  platform: 'langfuse' | 'langsmith' | 'openai';
  api_key: string;
  base_url?: string;
  name?: string;
}

interface ImportTracesRequest {
  integration_id: string;
  filters?: {
    date_from?: string;
    date_to?: string;
    tags?: string[];
    user_ids?: string[];
    limit?: number;
  };
}

interface CreateEvalSetRequest {
  name: string;
  description?: string;
  minimum_examples?: number;
}

interface UpdateEvalSetRequest {
  name?: string;
  description?: string;
  minimum_examples?: number;
}

interface SubmitFeedbackRequest {
  trace_id: string;
  eval_set_id: string;
  rating: 'positive' | 'negative' | 'neutral';
  notes?: string;
}

interface UpdateFeedbackRequest {
  rating?: 'positive' | 'negative' | 'neutral';
  notes?: string;
}

interface GenerateEvalRequest {
  name: string;
  description?: string;
  model?: string;
  custom_instructions?: string;
}

interface UpdateEvalRequest {
  name?: string;
  description?: string;
  code?: string;
}

interface ExecuteEvalRequest {
  trace_ids?: string[];
  force?: boolean;
}
```

---

## Appendix A: API Usage Examples

### Example 1: Complete Annotation Flow

```typescript
// 1. Connect Langfuse
const integration = await api.post('/api/integrations', {
  platform: 'langfuse',
  api_key: 'sk_lf_...',
  name: 'Production'
});

// 2. Import traces
const importJob = await api.post('/api/traces/import', {
  integration_id: integration.id,
  filters: {
    date_from: '2025-11-01T00:00:00Z',
    limit: 100
  }
});

// 3. Monitor import via SSE
const eventSource = new EventSource(`/api/jobs/${importJob.job_id}/stream`);
eventSource.addEventListener('completed', (e) => {
  console.log('Import completed:', JSON.parse(e.data));
});

// 4. Create eval set
const evalSet = await api.post('/api/eval-sets', {
  name: 'response-quality',
  description: 'Checks if responses are helpful',
  minimum_examples: 5
});

// 5. Fetch traces for annotation
const traces = await api.get('/api/traces', {
  params: { limit: 50 }
});

// 6. Submit feedback (optimistic)
for (const trace of traces.traces) {
  await api.post('/api/feedback', {
    trace_id: trace.id,
    eval_set_id: evalSet.id,
    rating: 'positive',
    notes: 'Good response'
  });
}

// 7. Generate eval
const genJob = await api.post(`/api/eval-sets/${evalSet.id}/generate`, {
  name: 'response_quality_check'
});

// 8. Monitor generation via SSE
const genEvents = new EventSource(`/api/jobs/${genJob.job_id}/stream`);
genEvents.addEventListener('completed', (e) => {
  const result = JSON.parse(e.data).result;
  console.log('Eval generated:', result.eval_id, 'Accuracy:', result.accuracy);
});
```

### Example 2: Matrix Exploration

```typescript
// 1. Get matrix with multiple evals
const matrix = await api.get(`/api/eval-sets/${evalSetId}/matrix`, {
  params: {
    eval_ids: 'eval_1,eval_2,eval_3',
    filter: 'contradictions_only',
    limit: 50
  }
});

// 2. Render matrix rows
matrix.rows.forEach(row => {
  console.log(`Trace: ${row.trace_id}`);
  console.log(`Human: ${row.human_feedback?.rating}`);

  Object.entries(row.predictions).forEach(([evalId, pred]) => {
    if (pred) {
      console.log(`  ${evalId}: ${pred.result} - ${pred.reason}`);
      if (pred.is_contradiction) {
        console.log('    ⚠️  CONTRADICTION');
      }
    }
  });
});

// 3. Drill into specific contradiction
const execution = await api.get(
  `/api/eval-executions/${row.trace_id}/${evalId}`
);
console.log('Full execution details:', execution);

// 4. Fetch trace details
const trace = await api.get(`/api/traces/${row.trace_id}`);
console.log('Full trace:', trace);
```

### Example 3: Frontend Optimistic Queue

```typescript
class FeedbackQueue {
  private queue: SubmitFeedbackRequest[] = [];
  private processing = false;

  async submit(feedback: SubmitFeedbackRequest) {
    // 1. Update UI immediately
    this.updateUI(feedback);

    // 2. Add to queue
    this.queue.push(feedback);

    // 3. Start processing if not already
    if (!this.processing) {
      this.process();
    }
  }

  private async process() {
    this.processing = true;

    while (this.queue.length > 0) {
      const feedback = this.queue[0];

      try {
        await api.post('/api/feedback', feedback);
        this.queue.shift(); // Remove on success
        this.markSynced(feedback);
      } catch (error) {
        if (this.isRetryable(error)) {
          await this.sleep(2000);
          continue; // Retry
        } else {
          this.showError(feedback, error);
          this.queue.shift(); // Remove on permanent failure
        }
      }
    }

    this.processing = false;
  }

  private isRetryable(error: any): boolean {
    return error.status === 429 || // Rate limit
           error.status === 503 || // Service unavailable
           error.code === 'ECONNREFUSED'; // Network error
  }

  private updateUI(feedback: SubmitFeedbackRequest) {
    // Show feedback immediately with "syncing" indicator
    const el = document.querySelector(`[data-trace="${feedback.trace_id}"]`);
    el?.classList.add('pending-sync');
  }

  private markSynced(feedback: SubmitFeedbackRequest) {
    const el = document.querySelector(`[data-trace="${feedback.trace_id}"]`);
    el?.classList.remove('pending-sync');
    el?.classList.add('synced');
  }

  private showError(feedback: SubmitFeedbackRequest, error: any) {
    toast.error(`Failed to sync feedback for ${feedback.trace_id}`);
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## Appendix B: Database Schema Reference

For complete database schema, see `docs/2025-11-05-iofold-auto-evals-design.md` Section "Data Schema (Cloudflare D1)".

**Key tables:**
- `users`, `workspaces` - Multi-tenancy
- `integrations` - Platform connections
- `traces` - Imported traces (normalized)
- `eval_sets` - Feedback collections
- `feedback` - User ratings
- `evals` - Generated Python functions
- `eval_executions` - Prediction results
- `jobs` - Background task tracking

**Key views:**
- `eval_comparison` - Pre-joins executions with feedback for contradiction detection

---

## Appendix C: Performance Considerations

### Pagination Strategy
- Use cursor-based pagination everywhere
- Cursors encode `(timestamp, id)` for stable ordering
- No offset-based pagination (skips/duplicates on data changes)

### Caching Strategy
- Trace summaries cached aggressively (immutable after import)
- Matrix stats cached for 60s (expensive aggregate queries)
- SSE connections maintain 5-minute event buffer for reconnects

### Query Optimization
- Indexes on: `trace_id`, `eval_set_id`, `eval_id`, `timestamp`, `rating`
- Composite index: `(eval_set_id, rating, timestamp)` for filtered lists
- Composite index: `(eval_id, trace_id)` for execution lookups

### Rate Limiting
- 1000 req/min per workspace (standard tier)
- 10 concurrent generation jobs (LLM API limits)
- 100 concurrent SSE connections (Worker CPU limits)

### Cloudflare Limits
- Workers: 50ms CPU time (paid), 128MB memory
- D1: 100k rows/query, 5MB response size
- R2: Unlimited reads, pay per operation

---

## Appendix D: Change Log

### v1.0 (2025-11-12)
- Initial API specification for Phase 1 & 2
- Authentication via JWT
- Complete trace management
- Eval set and feedback APIs
- Eval generation and execution
- Matrix comparison endpoints
- SSE for real-time updates
- Background job management

---

**End of API Specification**
