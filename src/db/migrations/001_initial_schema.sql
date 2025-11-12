-- Migration 001: Initial Schema
-- Created: 2025-11-12
-- Description: Initial database setup for iofold.com (Phases 1 & 2)

-- ============================================================================
-- User Accounts and Workspaces
-- ============================================================================

-- User accounts (supports multi-user workspaces)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Workspaces for multi-tenancy
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Workspace membership (many-to-many)
CREATE TABLE workspace_members (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'admin' | 'member'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(workspace_id, user_id)
);

-- ============================================================================
-- External Platform Integrations
-- ============================================================================

-- Connected platforms (Langfuse, Langsmith, OpenAI)
CREATE TABLE integrations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  platform TEXT NOT NULL, -- 'langfuse' | 'langsmith' | 'openai'
  name TEXT NOT NULL, -- User-friendly label (e.g., "Production Langfuse")
  api_key_encrypted TEXT NOT NULL, -- Encrypted API credentials
  base_url TEXT, -- Optional, for self-hosted instances
  config JSON, -- Platform-specific configuration
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'error'
  error_message TEXT, -- Last error if status = 'error'
  last_synced_at DATETIME, -- Last successful trace import
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- ============================================================================
-- Traces (Imported from External Platforms)
-- ============================================================================

-- Normalized traces from all platforms
CREATE TABLE traces (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  integration_id TEXT NOT NULL,
  trace_id TEXT NOT NULL, -- External ID from source platform
  source TEXT NOT NULL, -- 'langfuse' | 'langsmith' | 'openai'
  timestamp DATETIME NOT NULL, -- Trace execution time
  metadata JSON, -- User IDs, tags, session info, environment
  steps JSON NOT NULL, -- Array of LangGraphExecutionStep
  -- Pre-computed summaries for list views (performance optimization)
  input_preview TEXT, -- First 200 chars of input
  output_preview TEXT, -- First 200 chars of output
  step_count INTEGER NOT NULL DEFAULT 0,
  has_errors BOOLEAN NOT NULL DEFAULT 0,
  imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE,
  UNIQUE(integration_id, trace_id)
);

-- ============================================================================
-- Eval Sets (Collections for Training)
-- ============================================================================

-- Groups of traces with feedback for generating evals
CREATE TABLE eval_sets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  minimum_examples INTEGER NOT NULL DEFAULT 5, -- Minimum traces needed to generate eval
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE(workspace_id, name)
);

-- ============================================================================
-- Feedback (Human Annotations)
-- ============================================================================

-- User ratings on traces (positive/negative/neutral)
CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  eval_set_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  rating TEXT NOT NULL CHECK(rating IN ('positive', 'negative', 'neutral')),
  notes TEXT, -- Optional user comments
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (eval_set_id) REFERENCES eval_sets(id) ON DELETE CASCADE,
  FOREIGN KEY (trace_id) REFERENCES traces(id) ON DELETE CASCADE,
  UNIQUE(eval_set_id, trace_id)
);

-- ============================================================================
-- Generated Evals (Python Functions)
-- ============================================================================

-- Generated eval functions with versioning
CREATE TABLE evals (
  id TEXT PRIMARY KEY,
  eval_set_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  parent_eval_id TEXT, -- For refinement chain (links to previous version)
  code TEXT NOT NULL, -- Full Python function as string
  model_used TEXT NOT NULL, -- 'claude-sonnet-4.5' | 'gpt-4' | etc.
  generation_prompt TEXT, -- Prompt used for generation
  custom_instructions TEXT, -- User-provided instructions
  -- Test results on training set
  accuracy REAL, -- 0.0 to 1.0
  test_results JSON, -- { correct, incorrect, errors, total, details: [...] }
  training_trace_ids JSON, -- Array of trace IDs used for training
  -- Execution statistics
  execution_count INTEGER NOT NULL DEFAULT 0,
  contradiction_count INTEGER NOT NULL DEFAULT 0, -- Predictions != human feedback
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'active' | 'archived'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (eval_set_id) REFERENCES eval_sets(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_eval_id) REFERENCES evals(id) ON DELETE SET NULL,
  UNIQUE(eval_set_id, version)
);

-- ============================================================================
-- Eval Executions (Prediction Results)
-- ============================================================================

-- Results of running evals against traces
CREATE TABLE eval_executions (
  id TEXT PRIMARY KEY,
  eval_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  result BOOLEAN NOT NULL, -- True = pass, False = fail
  reason TEXT NOT NULL, -- Explanation returned by eval function
  execution_time_ms INTEGER NOT NULL, -- Execution duration
  error TEXT, -- Error message if execution failed
  stdout TEXT, -- Captured stdout (for debugging)
  stderr TEXT, -- Captured stderr (for debugging)
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (eval_id) REFERENCES evals(id) ON DELETE CASCADE,
  FOREIGN KEY (trace_id) REFERENCES traces(id) ON DELETE CASCADE,
  UNIQUE(eval_id, trace_id)
);

-- ============================================================================
-- Background Jobs (Async Operations)
-- ============================================================================

-- Track long-running operations (import, generate, execute)
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('import', 'generate', 'execute')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  progress INTEGER NOT NULL DEFAULT 0, -- 0-100
  -- Context for different job types
  context JSON, -- Job-specific data (integration_id, eval_set_id, trace_ids, etc.)
  result JSON, -- Final result when completed
  error TEXT, -- Error message if failed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- ============================================================================
-- Views
-- ============================================================================

-- Comparison matrix: link eval executions to human feedback
CREATE VIEW eval_comparison AS
SELECT
  e.id as execution_id,
  e.eval_id,
  e.trace_id,
  e.result as predicted_result,
  e.reason as predicted_reason,
  e.execution_time_ms,
  e.error as execution_error,
  e.executed_at,
  f.id as feedback_id,
  f.rating as human_rating,
  f.notes as feedback_notes,
  f.eval_set_id,
  CASE
    WHEN f.rating IS NULL THEN NULL
    WHEN f.rating = 'positive' AND e.result = 1 THEN 0
    WHEN f.rating = 'negative' AND e.result = 0 THEN 0
    WHEN f.rating = 'neutral' THEN 0
    ELSE 1
  END as is_contradiction
FROM eval_executions e
LEFT JOIN feedback f ON e.trace_id = f.trace_id;

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Workspace-based queries (multi-tenancy)
CREATE INDEX idx_integrations_workspace ON integrations(workspace_id);
CREATE INDEX idx_traces_workspace ON traces(workspace_id);
CREATE INDEX idx_eval_sets_workspace ON eval_sets(workspace_id);
CREATE INDEX idx_jobs_workspace ON jobs(workspace_id);

-- Trace queries
CREATE INDEX idx_traces_integration ON traces(integration_id);
CREATE INDEX idx_traces_timestamp ON traces(timestamp DESC);
CREATE INDEX idx_traces_source ON traces(source);
CREATE INDEX idx_traces_has_errors ON traces(has_errors);

-- Feedback queries
CREATE INDEX idx_feedback_eval_set ON feedback(eval_set_id);
CREATE INDEX idx_feedback_trace ON feedback(trace_id);
CREATE INDEX idx_feedback_rating ON feedback(rating);
CREATE INDEX idx_feedback_eval_set_rating ON feedback(eval_set_id, rating);

-- Eval queries
CREATE INDEX idx_evals_eval_set ON evals(eval_set_id);
CREATE INDEX idx_evals_status ON evals(status);
CREATE INDEX idx_evals_parent ON evals(parent_eval_id);

-- Execution queries (high-volume table)
CREATE INDEX idx_executions_eval ON eval_executions(eval_id);
CREATE INDEX idx_executions_trace ON eval_executions(trace_id);
CREATE INDEX idx_executions_eval_trace ON eval_executions(eval_id, trace_id);
CREATE INDEX idx_executions_result ON eval_executions(result);
CREATE INDEX idx_executions_executed_at ON eval_executions(executed_at DESC);

-- Job queries
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_type ON jobs(type);
CREATE INDEX idx_jobs_workspace_status ON jobs(workspace_id, status);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);

-- Integration status monitoring
CREATE INDEX idx_integrations_status ON integrations(status);
CREATE INDEX idx_integrations_workspace_platform ON integrations(workspace_id, platform);
