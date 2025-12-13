-- Migration 017: Taskset Runs
-- Created: 2025-12-12
-- Description: Adds tables for tracking taskset execution runs.
--              Enables running all tasks from a taskset through the playground
--              in a single click via background job.

-- ============================================================================
-- Step 1: Create taskset_runs table
-- ============================================================================

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

-- ============================================================================
-- Step 2: Create taskset_run_results table
-- ============================================================================

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

-- ============================================================================
-- Step 3: Create indexes
-- ============================================================================

-- Taskset runs indexes
CREATE INDEX IF NOT EXISTS idx_taskset_runs_workspace ON taskset_runs(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_taskset_runs_taskset ON taskset_runs(taskset_id);
CREATE INDEX IF NOT EXISTS idx_taskset_runs_created ON taskset_runs(created_at DESC);

-- Taskset run results indexes
CREATE INDEX IF NOT EXISTS idx_taskset_run_results_run ON taskset_run_results(run_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_taskset_run_results_task ON taskset_run_results(run_id, task_id);
