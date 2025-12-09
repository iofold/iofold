-- Migration 011: Eval candidates and cross-validation tables
-- Created: 2025-12-09
-- Description: Adds tables for eval candidate tracking, human agreement metrics,
--              cross-validation results, and active eval tracking for GEPA Phase 2A-2

-- ============================================================================
-- Step 1: Create eval_candidates table
-- ============================================================================

-- Eval candidates with human agreement metrics
CREATE TABLE IF NOT EXISTS eval_candidates (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,

  -- The eval code
  code TEXT NOT NULL,
  variation TEXT,  -- "correctness", "efficiency", "safety", "completeness", "ensemble"

  -- Human agreement metrics
  agreement_rate REAL,  -- Pearson correlation
  accuracy REAL,        -- Binary accuracy at 0.5
  cohen_kappa REAL,     -- Agreement accounting for chance
  f1_score REAL,

  -- Confusion matrix
  confusion_matrix TEXT,  -- JSON: {"true_positive": N, "true_negative": N, ...}

  -- Per-trace results
  per_trace_results TEXT,  -- JSON array of per-trace scores

  -- Execution stats
  total_cost_usd REAL,
  avg_duration_ms REAL,

  -- Status
  status TEXT DEFAULT 'candidate' CHECK(status IN ('candidate', 'testing', 'active', 'archived')),

  -- Lineage
  parent_candidate_id TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  activated_at DATETIME,

  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_candidate_id) REFERENCES eval_candidates(id)
);

-- ============================================================================
-- Step 2: Create eval_cv_results table
-- ============================================================================

-- Cross-validation results
CREATE TABLE IF NOT EXISTS eval_cv_results (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,

  -- CV configuration
  k_folds INTEGER NOT NULL DEFAULT 5,

  -- Aggregated metrics
  mean_accuracy REAL,
  mean_kappa REAL,
  mean_f1 REAL,
  mean_agreement_rate REAL,

  -- Stability metrics
  std_accuracy REAL,
  std_kappa REAL,
  is_stable BOOLEAN,

  -- Per-fold results
  fold_results TEXT,  -- JSON array

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (candidate_id) REFERENCES eval_candidates(id) ON DELETE CASCADE
);

-- ============================================================================
-- Step 3: Add active_eval_id to agents table
-- ============================================================================

-- Add active_eval_id column to track the currently active eval candidate
-- This column may already exist in some environments, so we handle gracefully
-- Note: SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN
-- The migration will fail if the column exists, which is expected behavior
ALTER TABLE agents ADD COLUMN active_eval_id TEXT REFERENCES eval_candidates(id);

-- ============================================================================
-- Step 4: Create indexes
-- ============================================================================

-- Eval candidates indexes
CREATE INDEX IF NOT EXISTS idx_eval_candidates_agent ON eval_candidates(agent_id);
CREATE INDEX IF NOT EXISTS idx_eval_candidates_status ON eval_candidates(status);
CREATE INDEX IF NOT EXISTS idx_eval_candidates_accuracy ON eval_candidates(accuracy DESC);
CREATE INDEX IF NOT EXISTS idx_eval_candidates_parent ON eval_candidates(parent_candidate_id);
CREATE INDEX IF NOT EXISTS idx_eval_candidates_created ON eval_candidates(created_at DESC);

-- Cross-validation results indexes
CREATE INDEX IF NOT EXISTS idx_cv_results_candidate ON eval_cv_results(candidate_id);
CREATE INDEX IF NOT EXISTS idx_cv_results_stable ON eval_cv_results(is_stable);
CREATE INDEX IF NOT EXISTS idx_cv_results_accuracy ON eval_cv_results(mean_accuracy DESC);

-- Agents active eval index
CREATE INDEX IF NOT EXISTS idx_agents_active_eval ON agents(active_eval_id);
