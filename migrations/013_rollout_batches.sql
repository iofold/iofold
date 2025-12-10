-- Migration 013: Rollout batches and results for GEPA integration
-- Created: 2025-12-10
-- Description: Adds tables for managing batch rollout requests and results
--              for GEPA prompt optimization (Phase 1 of GEPA integration)

-- ============================================================================
-- Step 1: Create rollout_batches table
-- ============================================================================

-- Rollout batches requested by GEPA
-- Tracks batch requests for parallel agent execution with candidate prompts
CREATE TABLE IF NOT EXISTS rollout_batches (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  task_count INTEGER NOT NULL,
  status TEXT DEFAULT 'queued',  -- 'queued', 'running', 'completed', 'partial', 'failed'
  config TEXT DEFAULT '{}',       -- JSON: parallelism, timeout, model_id
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- ============================================================================
-- Step 2: Create rollout_results table
-- ============================================================================

-- Individual rollout results
-- Stores execution results for each task in a rollout batch
CREATE TABLE IF NOT EXISTS rollout_results (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL,           -- 'completed', 'failed', 'timeout'
  trace TEXT,                     -- JSON: LangGraphExecutionStep[]
  error TEXT,
  execution_time_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (batch_id) REFERENCES rollout_batches(id) ON DELETE CASCADE
);

-- ============================================================================
-- Step 3: Create indexes
-- ============================================================================

-- Rollout batches indexes
CREATE INDEX IF NOT EXISTS idx_rollout_batches_workspace ON rollout_batches(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_rollout_batches_created ON rollout_batches(created_at DESC);

-- Rollout results indexes
CREATE INDEX IF NOT EXISTS idx_rollout_results_batch ON rollout_results(batch_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rollout_results_task ON rollout_results(batch_id, task_id);
