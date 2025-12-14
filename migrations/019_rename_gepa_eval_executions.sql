-- Migration 019: Resolve eval_executions naming collision
-- The GEPA flow uses eval_candidate_id while legacy uses eval_id
-- Create separate table for GEPA to avoid conflicts
-- Created: 2025-12-14

-- Step 1: Create new table for GEPA eval executions
CREATE TABLE IF NOT EXISTS eval_candidate_executions (
  id TEXT PRIMARY KEY,
  eval_candidate_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  score REAL,
  feedback TEXT,
  success BOOLEAN,
  error TEXT,
  duration_ms INTEGER,
  llm_calls INTEGER,
  llm_cost_usd REAL,
  cache_hits INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (eval_candidate_id) REFERENCES eval_candidates(id) ON DELETE CASCADE,
  FOREIGN KEY (trace_id) REFERENCES traces(id) ON DELETE CASCADE
);

-- Step 2: Create indexes
CREATE INDEX IF NOT EXISTS idx_eval_candidate_executions_candidate
  ON eval_candidate_executions(eval_candidate_id);
CREATE INDEX IF NOT EXISTS idx_eval_candidate_executions_trace
  ON eval_candidate_executions(trace_id);
CREATE INDEX IF NOT EXISTS idx_eval_candidate_executions_created
  ON eval_candidate_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_candidate_executions_success
  ON eval_candidate_executions(success);
