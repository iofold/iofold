# Taskset System

## Overview

Tasksets are collections of test cases used for reproducible prompt optimization and agent evaluation. They enable:

- Extracting tasks from labeled traces
- Running agents against standardized test sets
- Comparing performance across prompt iterations
- Integration with GEPA for systematic optimization

## Purpose

1. **Reproducibility**: Fixed test sets ensure consistent evaluation across runs
2. **Deduplication**: Content hashing prevents duplicate tasks
3. **Traceability**: Links tasks back to source traces
4. **Automation**: Background job execution for batch testing
5. **Scoring**: Automatic comparison of outputs (exact match, substring, LLM-based)

## Database Schema

### `tasksets`

Container for a collection of tasks belonging to an agent.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Primary key (`tsk_*`) |
| `workspace_id` | TEXT | FK to workspaces |
| `agent_id` | TEXT | FK to agents |
| `name` | TEXT | Taskset name |
| `description` | TEXT | Optional description |
| `task_count` | INTEGER | Number of tasks (updated on changes) |
| `status` | TEXT | `active` or `archived` |
| `created_at` | DATETIME | Creation timestamp |
| `updated_at` | DATETIME | Last modification timestamp |

### `taskset_tasks`

Individual tasks within a taskset.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Primary key (`task_*`) |
| `taskset_id` | TEXT | FK to tasksets (CASCADE delete) |
| `user_message` | TEXT | Task input/prompt |
| `expected_output` | TEXT | Expected response (optional) |
| `source` | TEXT | `trace`, `manual`, or `imported` |
| `source_trace_id` | TEXT | FK to traces (if from trace) |
| `content_hash` | TEXT | SHA256 hash for deduplication |
| `metadata` | TEXT | JSON metadata (e.g., inbox_address, query_date) |
| `created_at` | DATETIME | Creation timestamp |

**Unique Constraint**: `(taskset_id, content_hash)` prevents duplicates per taskset

### `taskset_runs`

Tracks execution of all tasks in a taskset.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Primary key (`tsr_*`) |
| `workspace_id` | TEXT | FK to workspaces |
| `agent_id` | TEXT | FK to agents |
| `taskset_id` | TEXT | FK to tasksets |
| `status` | TEXT | `queued`, `running`, `completed`, `partial`, `failed`, `cancelled` |
| `task_count` | INTEGER | Total tasks to execute |
| `completed_count` | INTEGER | Successfully completed tasks |
| `failed_count` | INTEGER | Failed tasks |
| `model_provider` | TEXT | Provider (default: `anthropic`) |
| `model_id` | TEXT | Model ID (default: `anthropic/claude-sonnet-4-5`) |
| `config` | TEXT | JSON config (parallelism, timeout) |
| `created_at` | DATETIME | Creation timestamp |
| `started_at` | DATETIME | Execution start time |
| `completed_at` | DATETIME | Execution end time |
| `error` | TEXT | Error message if failed |

### `taskset_run_results`

Stores individual task execution results.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Primary key (`trr_*`) |
| `run_id` | TEXT | FK to taskset_runs (CASCADE delete) |
| `task_id` | TEXT | FK to taskset_tasks |
| `status` | TEXT | `pending`, `completed`, `failed`, `timeout` |
| `response` | TEXT | Agent's response |
| `expected_output` | TEXT | Copied from task |
| `score` | REAL | Match score (0.0-1.0) |
| `score_reason` | TEXT | Scoring explanation |
| `trace_id` | TEXT | Reference to traces (optional) |
| `execution_time_ms` | INTEGER | Execution duration |
| `error` | TEXT | Error message if failed |
| `created_at` | DATETIME | Creation timestamp |

**Unique Constraint**: `(run_id, task_id)` prevents duplicate results

## API Endpoints

All endpoints require `X-Workspace-Id` header.

### Create Taskset

**POST** `/api/agents/:agentId/tasksets`

```json
{
  "name": "Email Agent Test Set",
  "description": "Tasks from positive traces"
}
```

**Response**: Taskset object with `task_count: 0`

### Create Taskset from Traces

**POST** `/api/agents/:agentId/tasksets/from-traces`

Extracts user messages from labeled traces.

```json
{
  "name": "Positive Examples",
  "description": "High-quality interactions",
  "filter": {
    "rating": "positive",  // "positive", "negative", or "any"
    "limit": 100           // max 500
  }
}
```

**Response**:
```json
{
  "id": "tsk_abc123",
  "name": "Positive Examples",
  "task_count": 87,
  "skipped_duplicates": 13,
  "message": "Created taskset with 87 tasks (13 duplicates skipped)"
}
```

### List Tasksets

**GET** `/api/agents/:agentId/tasksets?include_archived=false`

**Response**: Array of taskset objects

### Get Taskset with Tasks

**GET** `/api/agents/:agentId/tasksets/:tasksetId`

**Response**: Taskset object with `tasks` array

### Add Tasks

**POST** `/api/agents/:agentId/tasksets/:tasksetId/tasks`

```json
{
  "tasks": [
    {
      "user_message": "Find emails about the budget",
      "expected_output": "Found 3 emails...",  // optional
      "source": "manual",                      // "manual" or "imported"
      "metadata": {                            // optional
        "inbox_address": "user@example.com",
        "query_date": "2001-05-15"
      }
    }
  ]
}
```

**Response**:
```json
{
  "inserted": 1,
  "skipped_duplicates": 0,
  "total_tasks": 88
}
```

### Archive Taskset

**DELETE** `/api/agents/:agentId/tasksets/:tasksetId`

Soft deletes (sets `status = 'archived'`). Archived tasksets cannot accept new tasks or runs.

### Run Taskset

**POST** `/api/agents/:agentId/tasksets/:tasksetId/run`

Executes all tasks via background job.

```json
{
  "model_provider": "anthropic",
  "model_id": "anthropic/claude-sonnet-4-5",
  "config": {
    "parallelism": 1,            // not implemented yet
    "timeout_per_task_ms": 120000  // 2 minutes default
  }
}
```

**Response**:
```json
{
  "run_id": "tsr_xyz789",
  "status": "queued",
  "task_count": 88,
  "model_provider": "anthropic",
  "model_id": "anthropic/claude-sonnet-4-5"
}
```

### List Taskset Runs

**GET** `/api/agents/:agentId/tasksets/:tasksetId/runs`

**Response**: Array of run objects with status, counts, timestamps

### Get Taskset Run Results

**GET** `/api/agents/:agentId/tasksets/:tasksetId/runs/:runId`

**Response**: Run object with full `results` array (includes scores, traces, errors)

## How Taskset Runs Work

### Execution Flow

1. **Enqueue**: API creates `taskset_runs` record with status `queued` and enqueues job
2. **Job Start**: Worker sets status to `running`, records `started_at`
3. **For Each Task**:
   - Fetch agent prompt template
   - Build system prompt by substituting `{{variables}}` from task metadata
   - Create playground agent instance
   - Execute with 2-minute timeout
   - Score response against expected output
   - Insert result to `taskset_run_results`
   - Update run progress (`completed_count` or `failed_count`)
4. **Finalize**: Set status to `completed`, `partial`, or `failed` based on results

### System Prompt Templating

Agent prompt templates can contain variables like `{{variable_name}}` which get replaced with values from task metadata.

**Example Template**:
```
Today's date is {{query_date}}. The user's inbox is {{inbox_address}}.
```

**Example Task Metadata**:
```json
{
  "query_date": "2001-05-15",
  "inbox_address": "jeff.dasovich@enron.com"
}
```

**Resulting System Prompt**:
```
Today's date is 2001-05-15. The user's inbox is jeff.dasovich@enron.com.
```

### Scoring Strategy

Response comparison uses three-tier approach:

1. **No Expected Output**: Score `1.0` if agent responds, `0.0` if empty
2. **Exact Match**: Case-insensitive, trimmed comparison = `1.0`
3. **Substring Match**: Response contains expected output = `0.8`
4. **LLM Comparison**: Use AI Gateway to score `0.0-1.0` with explanation

LLM scoring prompt asks judge to rate:
- `1.0`: Perfect match or semantically equivalent
- `0.7-0.9`: Mostly correct, minor differences
- `0.4-0.6`: Partially correct
- `0.0-0.3`: Incorrect or missing key information

Tasks with score `>= 0.7` marked as `completed`, otherwise `failed`.

### Status Definitions

**Run Statuses**:
- `queued`: Job enqueued, waiting for worker
- `running`: Execution in progress
- `completed`: All tasks succeeded (failed_count = 0)
- `partial`: Some tasks failed (0 < failed_count < task_count)
- `failed`: All tasks failed or job error
- `cancelled`: User cancelled (not implemented)

**Result Statuses**:
- `pending`: Not executed yet
- `completed`: Successfully executed and scored
- `failed`: Execution error
- `timeout`: Exceeded time limit

## GEPA Integration

GEPA (Generative Evaluation for Prompt Agents) uses tasksets for systematic optimization:

### Additional Tables

**`gepa_run_tasks`**: Links GEPA runs to tasks with split assignments

| Column | Type | Description |
|--------|------|-------------|
| `run_id` | TEXT | FK to gepa_runs |
| `task_id` | TEXT | FK to taskset_tasks |
| `split` | TEXT | `train`, `val`, or `test` |
| `score` | REAL | Task score from run |

**GEPA Runs Extensions**: `gepa_runs` table includes:
- `taskset_id`: FK to tasksets
- `train_split`: Training set proportion (default: 0.7)
- `val_split`: Validation set proportion (default: 0.3)
- `random_seed`: For reproducible splits

### Workflow

1. Create taskset from labeled traces
2. GEPA run assigns tasks to train/val/test splits
3. Optimizer uses train set for meta-prompting iterations
4. Validation set for early stopping
5. Test set for final evaluation (never used during optimization)

## Usage Examples

### Create Test Set from Positive Traces

```bash
curl -X POST http://localhost:8787/api/agents/agent_123/tasksets/from-traces \
  -H "X-Workspace-Id: workspace_default" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Email QA Test Set",
    "filter": {"rating": "positive", "limit": 50}
  }'
```

### Run Agent Against Test Set

```bash
curl -X POST http://localhost:8787/api/agents/agent_123/tasksets/tsk_abc/run \
  -H "X-Workspace-Id: workspace_default" \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "anthropic/claude-sonnet-4-5"
  }'
```

### Check Run Status

```bash
curl http://localhost:8787/api/agents/agent_123/tasksets/tsk_abc/runs/tsr_xyz \
  -H "X-Workspace-Id: workspace_default"
```

## Implementation Notes

1. **Deduplication**: SHA256 hash prevents identical tasks within same taskset
2. **Soft Delete**: Archive instead of hard delete preserves historical data
3. **Cascade Delete**: Deleting taskset removes tasks and run results
4. **Background Jobs**: Runs execute via job queue (see `src/queue/consumer.ts`)
5. **Trace Creation**: Currently disabled due to FK constraint (integration_id required)
6. **Parallelism**: Config option exists but not implemented (sequential execution only)
7. **Timeout**: Default 2 minutes per task (configurable, suitable for email tools)

## Related Documentation

- **ART-E Benchmark**: `docs/art-e-benchmark.md` - Similar task execution system
- **Job Queue**: `src/queue/producer.ts`, `src/queue/consumer.ts`
- **Playground Agent**: `src/playground/agent-deepagents.ts`
- **API Utils**: `src/api/utils.ts` - Error handling, workspace validation
