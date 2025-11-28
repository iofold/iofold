-- Migration 003: System Prompt Versioning
--
-- This migration adds tables for tracking system prompts used by agents
-- and linking eval performance to specific prompt versions.

-- ============================================================================
-- Store unique system prompts (deduplicated by content hash)
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_prompts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  -- SHA-256 hash of prompt content for deduplication
  prompt_hash TEXT NOT NULL,
  -- Full prompt text
  content TEXT NOT NULL,
  -- Optional structured metadata (JSON)
  metadata TEXT,
  -- Timestamps for first and last occurrence
  first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Count of traces using this prompt
  trace_count INTEGER DEFAULT 1,
  -- Ensure unique prompts per workspace
  UNIQUE(workspace_id, prompt_hash)
);

-- Index for looking up prompts by workspace and agent
CREATE INDEX IF NOT EXISTS idx_system_prompts_workspace_agent
ON system_prompts(workspace_id, agent_name);

-- Index for looking up prompts by hash (for deduplication)
CREATE INDEX IF NOT EXISTS idx_system_prompts_hash
ON system_prompts(prompt_hash);

-- ============================================================================
-- Link traces to their system prompt version
-- ============================================================================
-- Add column to traces table to reference the prompt used
ALTER TABLE traces ADD COLUMN system_prompt_id TEXT REFERENCES system_prompts(id);

-- Index for querying traces by prompt
CREATE INDEX IF NOT EXISTS idx_traces_system_prompt
ON traces(system_prompt_id);

-- ============================================================================
-- Track eval performance per prompt version
-- ============================================================================
CREATE TABLE IF NOT EXISTS eval_prompt_coverage (
  id TEXT PRIMARY KEY,
  eval_id TEXT NOT NULL REFERENCES evals(id) ON DELETE CASCADE,
  system_prompt_id TEXT NOT NULL REFERENCES system_prompts(id) ON DELETE CASCADE,
  -- Execution statistics
  execution_count INTEGER DEFAULT 0,
  pass_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  -- Calculated accuracy for this prompt version
  accuracy REAL,
  -- Timestamps
  first_execution_at DATETIME,
  last_execution_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Unique constraint: one entry per eval+prompt combination
  UNIQUE(eval_id, system_prompt_id)
);

-- Index for looking up coverage by eval
CREATE INDEX IF NOT EXISTS idx_eval_prompt_coverage_eval
ON eval_prompt_coverage(eval_id);

-- Index for looking up coverage by prompt
CREATE INDEX IF NOT EXISTS idx_eval_prompt_coverage_prompt
ON eval_prompt_coverage(system_prompt_id);

-- ============================================================================
-- Prompt iteration lineage (for auto-refinement tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS prompt_iterations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  -- Parent prompt that this iterated from (null for initial prompts)
  parent_prompt_id TEXT REFERENCES system_prompts(id),
  -- Current prompt in this iteration chain
  current_prompt_id TEXT NOT NULL REFERENCES system_prompts(id),
  -- Sequential iteration number
  iteration_number INTEGER NOT NULL DEFAULT 1,
  -- Human-readable summary of changes
  change_summary TEXT,
  -- Metrics that triggered/resulted from this iteration (JSON)
  improvement_metrics TEXT,
  -- Timestamps
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for looking up iterations by workspace and agent
CREATE INDEX IF NOT EXISTS idx_prompt_iterations_workspace_agent
ON prompt_iterations(workspace_id, agent_name);

-- Index for looking up iterations by parent prompt
CREATE INDEX IF NOT EXISTS idx_prompt_iterations_parent
ON prompt_iterations(parent_prompt_id);

-- ============================================================================
-- View: Prompt performance summary with eval statistics
-- ============================================================================
CREATE VIEW IF NOT EXISTS prompt_performance_summary AS
SELECT
  sp.id as prompt_id,
  sp.workspace_id,
  sp.agent_name,
  sp.trace_count,
  sp.first_seen_at,
  sp.last_seen_at,
  COUNT(DISTINCT epc.eval_id) as evals_covering,
  SUM(epc.execution_count) as total_executions,
  AVG(epc.accuracy) as avg_accuracy,
  MIN(epc.accuracy) as min_accuracy,
  MAX(epc.accuracy) as max_accuracy
FROM system_prompts sp
LEFT JOIN eval_prompt_coverage epc ON sp.id = epc.system_prompt_id
GROUP BY sp.id;
