# Implementation Plan: "Run Taskset" Feature

## Overview

This plan describes the implementation of a "Run Taskset" feature that allows users to execute all tasks from a taskset through the playground in a single click via a background job. The design follows existing patterns in the codebase, particularly the GEPA rollout batch pattern and prompt evaluation job pattern.

## Architecture Summary

### Current Relevant Architecture

1. **Tasksets**: Stored in `tasksets` table with tasks in `taskset_tasks` table containing `user_message`, `expected_output`, `source`, and `metadata` fields
2. **Playground Chat API**: `POST /api/agents/:agentId/playground/chat` handles streaming chat interactions
3. **Jobs System**: Uses Cloudflare Queues with producer (`src/queue/producer.ts`) and consumer (`src/queue/consumer.ts`)
4. **Rollout Batches**: Existing pattern for batch execution in `src/api/internal/rollouts.ts` with `rollout_batches` and `rollout_results` tables
5. **GEPA Integration**: Uses rollout tasks to execute agent with candidate prompts

### Proposed Architecture

The "Run Taskset" feature will follow the rollout batch pattern but with:
1. A new `taskset_runs` table to track taskset execution runs
2. A new `taskset_run_results` table to store individual task results
3. A new job type `taskset_run` in the queue system
4. Frontend components to trigger and display progress

## Database Schema

### Migration 017: Taskset Runs

```sql
-- Migration 017: Taskset Runs
-- Description: Adds tables for tracking taskset execution runs

-- Taskset runs - tracks execution of all tasks in a taskset
CREATE TABLE IF NOT EXISTS taskset_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  taskset_id TEXT NOT NULL,
  status TEXT DEFAULT 'queued' CHECK(status IN ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled')),
  task_count INTEGER NOT NULL,
  completed_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  model_provider TEXT DEFAULT 'anthropic',
  model_id TEXT DEFAULT 'anthropic/claude-sonnet-4-5',
  config TEXT DEFAULT '{}',  -- JSON: parallelism, timeout, etc.
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME,
  error TEXT,

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (taskset_id) REFERENCES tasksets(id)
);

-- Taskset run results - stores individual task execution results
CREATE TABLE IF NOT EXISTS taskset_run_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'completed', 'failed', 'timeout')),
  response TEXT,                    -- Agent response
  expected_output TEXT,             -- From taskset_tasks
  score REAL,                       -- Comparison score (0.0-1.0)
  score_reason TEXT,                -- Explanation of score
  trace_id TEXT,                    -- Reference to traces table
  execution_time_ms INTEGER,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (run_id) REFERENCES taskset_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES taskset_tasks(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_taskset_runs_workspace ON taskset_runs(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_taskset_runs_taskset ON taskset_runs(taskset_id);
CREATE INDEX IF NOT EXISTS idx_taskset_runs_created ON taskset_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_taskset_run_results_run ON taskset_run_results(run_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_taskset_run_results_task ON taskset_run_results(run_id, task_id);
```

## Backend Implementation

### 1. Queue Types (`src/types/queue.ts`)

Add new payload types:

```typescript
/**
 * Payload for taskset run jobs
 */
export interface TasksetRunJobPayload {
  type: 'taskset_run';
  run_id: string;
  workspace_id: string;
  agent_id: string;
  taskset_id: string;
  model_provider?: string;
  model_id?: string;
  config?: {
    parallelism?: number;
    timeout_per_task_ms?: number;
  };
}
```

### 2. API Endpoints (`src/api/tasksets.ts`)

Add new endpoint functions:

```typescript
// POST /api/agents/:agentId/tasksets/:tasksetId/run
export async function runTaskset(...)

// GET /api/agents/:agentId/tasksets/:tasksetId/runs
export async function listTasksetRuns(...)

// GET /api/agents/:agentId/tasksets/:tasksetId/runs/:runId
export async function getTasksetRunStatus(...)

// GET /api/agents/:agentId/tasksets/:tasksetId/runs/:runId/stream
export async function streamTasksetRunProgress(...)
```

### 3. Job Implementation (`src/jobs/taskset-run-job.ts`)

Create a new job handler following the `PromptEvaluationJob` pattern.

### 4. Queue Consumer (`src/queue/consumer.ts`)

Add handler for new job types.

### 5. Producer Method (`src/queue/producer.ts`)

Add method to enqueue taskset run jobs.

## Frontend Implementation

### 1. Types (`frontend/types/taskset.ts`)

Add new types for TasksetRun and TasksetRunResult.

### 2. Taskset Detail Page

Create `frontend/app/(main)/agents/[id]/tasksets/[tasksetId]/page.tsx`

### 3. Run Taskset Button Component

Add "Run Taskset" button with modal for configuration.

### 4. Results Display Component

Create component to display run results with progress bar, summary statistics, and individual task results.

## Implementation Sequence

1. **Phase 1: Database & Types** - Migration + TypeScript types
2. **Phase 2: Backend API** - API endpoints and routes
3. **Phase 3: Job System** - TasksetRunJob class and queue integration
4. **Phase 4: Frontend** - UI components
5. **Phase 5: Testing & Polish** - Tests and error handling

## Critical Files for Implementation

- `/home/ygupta/workspace/iofold/src/api/tasksets.ts` - Add new endpoints
- `/home/ygupta/workspace/iofold/src/queue/consumer.ts` - Add handler for taskset_run job type
- `/home/ygupta/workspace/iofold/src/types/queue.ts` - Add TasksetRunJobPayload type
- `/home/ygupta/workspace/iofold/src/api/internal/rollouts.ts` - Reference pattern for batch execution
- `/home/ygupta/workspace/iofold/src/jobs/prompt-evaluation-job.ts` - Reference pattern for job implementation
