-- Migration 016: GEPA Tasksets
-- Created: 2025-12-11
-- Description: Adds tables for storing GEPA tasksets with reproducible train/val/test splits.
--              Enables comparison across runs and prevents duplicate tasks.

-- ============================================================================
-- Step 1: Create tasksets table
-- ============================================================================

-- Tasksets - container for a collection of tasks belonging to an agent
CREATE TABLE IF NOT EXISTS tasksets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  task_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- ============================================================================
-- Step 2: Create taskset_tasks table
-- ============================================================================

-- Individual tasks within a taskset
CREATE TABLE IF NOT EXISTS taskset_tasks (
  id TEXT PRIMARY KEY,
  taskset_id TEXT NOT NULL,
  user_message TEXT NOT NULL,
  expected_output TEXT,
  source TEXT NOT NULL CHECK(source IN ('trace', 'manual', 'imported')),
  source_trace_id TEXT,
  content_hash TEXT NOT NULL,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (taskset_id) REFERENCES tasksets(id) ON DELETE CASCADE,
  FOREIGN KEY (source_trace_id) REFERENCES traces(id),
  UNIQUE(taskset_id, content_hash)
);

-- ============================================================================
-- Step 3: Create gepa_run_tasks table
-- ============================================================================

-- Links GEPA runs to specific tasks with split assignments
CREATE TABLE IF NOT EXISTS gepa_run_tasks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  split TEXT NOT NULL CHECK(split IN ('train', 'val', 'test')),
  score REAL,

  FOREIGN KEY (run_id) REFERENCES gepa_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES taskset_tasks(id),
  UNIQUE(run_id, task_id)
);

-- ============================================================================
-- Step 4: Alter gepa_runs table
-- ============================================================================

-- Add taskset reference and split configuration to gepa_runs
ALTER TABLE gepa_runs ADD COLUMN taskset_id TEXT REFERENCES tasksets(id);
ALTER TABLE gepa_runs ADD COLUMN train_split REAL DEFAULT 0.7;
ALTER TABLE gepa_runs ADD COLUMN val_split REAL DEFAULT 0.3;
ALTER TABLE gepa_runs ADD COLUMN random_seed INTEGER;

-- ============================================================================
-- Step 5: Create indexes
-- ============================================================================

-- Tasksets indexes
CREATE INDEX IF NOT EXISTS idx_tasksets_agent ON tasksets(agent_id);
CREATE INDEX IF NOT EXISTS idx_tasksets_workspace ON tasksets(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_tasksets_created ON tasksets(created_at DESC);

-- Taskset tasks indexes
CREATE INDEX IF NOT EXISTS idx_taskset_tasks_taskset ON taskset_tasks(taskset_id);
CREATE INDEX IF NOT EXISTS idx_taskset_tasks_source ON taskset_tasks(source_trace_id);
CREATE INDEX IF NOT EXISTS idx_taskset_tasks_hash ON taskset_tasks(content_hash);

-- GEPA run tasks indexes
CREATE INDEX IF NOT EXISTS idx_gepa_run_tasks_run ON gepa_run_tasks(run_id);
CREATE INDEX IF NOT EXISTS idx_gepa_run_tasks_task ON gepa_run_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_gepa_run_tasks_split ON gepa_run_tasks(run_id, split);

-- GEPA runs taskset index
CREATE INDEX IF NOT EXISTS idx_gepa_runs_taskset ON gepa_runs(taskset_id);
