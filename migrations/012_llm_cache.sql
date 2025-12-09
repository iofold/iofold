-- Migration 012: LLM cache and eval execution logging
-- Created: 2025-12-09
-- Description: Adds tables for LLM call caching during eval execution and
--              detailed eval execution logs for GEPA Phase 3A-3

-- ============================================================================
-- Step 1: Create eval_llm_cache table
-- ============================================================================

-- LLM call caching for eval execution
-- Caches LLM responses to avoid redundant API calls during eval execution
CREATE TABLE IF NOT EXISTS eval_llm_cache (
  id TEXT PRIMARY KEY,
  prompt_hash TEXT NOT NULL,  -- SHA256 of prompt + model
  model TEXT NOT NULL,

  -- Response
  response_text TEXT NOT NULL,
  tokens_input INTEGER,
  tokens_output INTEGER,
  cost_usd REAL,

  -- TTL
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,  -- Optional expiry

  UNIQUE(prompt_hash, model)
);

-- ============================================================================
-- Step 2: Create eval_executions table
-- ============================================================================

-- Eval execution logs
-- Records detailed information about each eval execution against a trace
CREATE TABLE IF NOT EXISTS eval_executions (
  id TEXT PRIMARY KEY,
  eval_candidate_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,

  -- Result
  score REAL,
  feedback TEXT,
  success BOOLEAN,
  error TEXT,

  -- Execution stats
  duration_ms INTEGER,
  llm_calls INTEGER,
  llm_cost_usd REAL,
  cache_hits INTEGER,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (eval_candidate_id) REFERENCES eval_candidates(id) ON DELETE CASCADE,
  FOREIGN KEY (trace_id) REFERENCES traces(id) ON DELETE CASCADE
);

-- ============================================================================
-- Step 3: Create indexes
-- ============================================================================

-- LLM cache indexes
CREATE INDEX IF NOT EXISTS idx_llm_cache_hash ON eval_llm_cache(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_llm_cache_expires ON eval_llm_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_llm_cache_model ON eval_llm_cache(model);
CREATE INDEX IF NOT EXISTS idx_llm_cache_created ON eval_llm_cache(created_at DESC);

-- Eval executions indexes
CREATE INDEX IF NOT EXISTS idx_eval_executions_candidate ON eval_executions(eval_candidate_id);
CREATE INDEX IF NOT EXISTS idx_eval_executions_trace ON eval_executions(trace_id);
CREATE INDEX IF NOT EXISTS idx_eval_executions_created ON eval_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_executions_success ON eval_executions(success);
