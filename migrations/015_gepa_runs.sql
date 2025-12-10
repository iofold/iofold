-- Migration 015: GEPA Optimization Runs
-- Created: 2025-12-10
-- Description: Adds gepa_runs table for tracking GEPA (Genetic Prompt Algorithm) optimization runs.
--              Stores configuration, progress, and results for prompt optimization workflows.

-- ============================================================================
-- Step 1: Create gepa_runs table
-- ============================================================================

-- GEPA optimization runs - tracks prompt optimization experiments
CREATE TABLE IF NOT EXISTS gepa_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  eval_id TEXT,                       -- Optional: FK to evals table for evaluation function

  -- Configuration
  seed_prompt TEXT NOT NULL,          -- Initial prompt to optimize from
  test_case_count INTEGER NOT NULL,   -- Number of test cases to evaluate against
  max_metric_calls INTEGER DEFAULT 50, -- Maximum number of metric evaluations
  parallelism INTEGER DEFAULT 5,      -- Number of parallel evaluations

  -- Status tracking
  status TEXT DEFAULT 'pending',      -- 'pending', 'running', 'completed', 'failed', 'cancelled'
  progress_metric_calls INTEGER DEFAULT 0, -- Current count of metric evaluations

  -- Results (populated on completion)
  best_prompt TEXT,                   -- Best performing prompt found
  best_score REAL,                    -- Score of the best prompt
  total_candidates INTEGER DEFAULT 0, -- Total number of candidates evaluated

  -- State persistence
  state_path TEXT,                    -- R2 path for GEPA state persistence (checkpointing)

  -- Error tracking
  error TEXT,                         -- Error message if status is 'failed'

  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,              -- When the run completed/failed

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (eval_id) REFERENCES evals(id)
);

-- ============================================================================
-- Step 2: Create indexes
-- ============================================================================

-- Query runs by workspace and status (for dashboard views)
CREATE INDEX IF NOT EXISTS idx_gepa_runs_workspace ON gepa_runs(workspace_id, status);

-- Query runs by agent (for agent-specific optimization history)
CREATE INDEX IF NOT EXISTS idx_gepa_runs_agent ON gepa_runs(agent_id);

-- Query recent runs (for activity feeds)
CREATE INDEX IF NOT EXISTS idx_gepa_runs_created ON gepa_runs(created_at DESC);
