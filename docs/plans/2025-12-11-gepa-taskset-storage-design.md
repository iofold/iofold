# GEPA Taskset Storage Design

**Date:** 2025-12-11
**Status:** Approved
**Author:** Claude (with user validation)

## Overview

Store GEPA tasksets in the database for reproducibility, comparison across runs, and deduplication. Currently, test cases are extracted on-demand from traces and embedded in queue messages - this loses lineage and prevents reproducible experiments.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Taskset scope | Per-agent | Most natural fit - tasks come from agent's traces |
| Task sources | Track per-task | Allows mixing sources (traces + manual + imported) |
| Split storage | Per-run linkage | Same taskset can use different splits across runs |
| Deduplication | Content hash | SHA256 of user_message prevents duplicates |

## Schema Design

### New Tables

#### `tasksets` - Container for task collections

```sql
CREATE TABLE tasksets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  task_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);
```

#### `taskset_tasks` - Individual tasks in a taskset

```sql
CREATE TABLE taskset_tasks (
  id TEXT PRIMARY KEY,
  taskset_id TEXT NOT NULL,
  user_message TEXT NOT NULL,
  expected_output TEXT,
  source TEXT NOT NULL,              -- 'trace', 'manual', 'imported'
  source_trace_id TEXT,              -- FK to traces (if source='trace')
  content_hash TEXT NOT NULL,        -- SHA256 for deduplication
  metadata TEXT,                     -- JSON for extra fields
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (taskset_id) REFERENCES tasksets(id) ON DELETE CASCADE,
  FOREIGN KEY (source_trace_id) REFERENCES traces(id),
  UNIQUE(taskset_id, content_hash)
);
```

#### `gepa_run_tasks` - Links runs to tasks with split assignment

```sql
CREATE TABLE gepa_run_tasks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  split TEXT NOT NULL,               -- 'train', 'val', 'test'
  score REAL,                        -- Per-task score (optional)

  FOREIGN KEY (run_id) REFERENCES gepa_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES taskset_tasks(id),
  UNIQUE(run_id, task_id)
);
```

### Alterations to Existing Tables

#### `gepa_runs` - Add taskset reference

```sql
ALTER TABLE gepa_runs ADD COLUMN taskset_id TEXT REFERENCES tasksets(id);
ALTER TABLE gepa_runs ADD COLUMN train_split REAL DEFAULT 0.7;
ALTER TABLE gepa_runs ADD COLUMN val_split REAL DEFAULT 0.3;
ALTER TABLE gepa_runs ADD COLUMN random_seed INTEGER;
```

## API Design

### Taskset Management

```
POST   /api/agents/:agentId/tasksets           -- Create empty taskset
GET    /api/agents/:agentId/tasksets           -- List tasksets
GET    /api/agents/:agentId/tasksets/:id       -- Get taskset with tasks
POST   /api/agents/:agentId/tasksets/:id/tasks -- Add tasks manually
DELETE /api/agents/:agentId/tasksets/:id       -- Archive taskset
```

### Convenience Endpoint

```
POST /api/agents/:agentId/tasksets/from-traces
{
  "name": "Art-E Labeled Tasks",
  "filter": {
    "rating": "positive" | "negative" | "any",
    "limit": 100
  }
}
```

### Updated GEPA Start

```typescript
interface StartGEPARequest {
  taskset_id: string;              // Required: use this taskset
  eval_id?: string;                // Eval function to use
  seed_prompt?: string;            // Override agent's current prompt
  train_split?: number;            // Default: 0.7
  random_seed?: number;            // For reproducible splits
  max_metric_calls?: number;
}
```

## Data Flow

### GEPA Start Flow

1. Validate `taskset_id` exists and belongs to agent
2. Load all tasks from `taskset_tasks`
3. Generate `random_seed` if not provided
4. Shuffle tasks using seeded RNG
5. Split into train/val based on `train_split`
6. Insert rows into `gepa_run_tasks` with split assignments
7. Queue job with `run_id` (job loads tasks from DB)

### Task Extraction Flow (from-traces)

1. Query labeled traces for agent
2. Extract first user message from each trace's steps
3. Compute content hash for deduplication
4. Insert into `taskset_tasks` (skip duplicates via UNIQUE constraint)
5. Update `tasksets.task_count`

## Indexes

```sql
CREATE INDEX idx_tasksets_agent ON tasksets(agent_id);
CREATE INDEX idx_tasksets_workspace ON tasksets(workspace_id, status);
CREATE INDEX idx_taskset_tasks_taskset ON taskset_tasks(taskset_id);
CREATE INDEX idx_taskset_tasks_source ON taskset_tasks(source_trace_id);
CREATE INDEX idx_gepa_run_tasks_run ON gepa_run_tasks(run_id);
CREATE INDEX idx_gepa_run_tasks_task ON gepa_run_tasks(task_id);
CREATE INDEX idx_gepa_run_tasks_split ON gepa_run_tasks(run_id, split);
```

## Benefits

1. **Reproducibility**: Exact tasks and splits recorded per run
2. **Comparison**: Same taskset across runs enables fair comparison
3. **Lineage**: Tasks link back to source traces
4. **Deduplication**: Content hash prevents duplicate tasks
5. **Flexibility**: Mix task sources, vary splits per run

## Implementation Order

1. Create migration `016_tasksets.sql`
2. Add taskset API endpoints in `src/api/tasksets.ts`
3. Update `src/api/gepa.ts` to use tasksets
4. Update `src/jobs/gepa-optimization-job.ts` to load from DB
5. Update frontend to show taskset selection (future)
