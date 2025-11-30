-- Migration 006: Add retry tracking and expanded job types
-- Created: 2025-11-30
-- Description: Adds retry_count, max_retries, error_category, priority, and expands job type constraint

-- ============================================================================
-- Step 1: Create new jobs table with updated schema
-- ============================================================================

-- SQLite doesn't support ALTER TABLE for CHECK constraints, so we recreate the table
CREATE TABLE jobs_new (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,

  -- Expanded type constraint to include all 10 job types
  type TEXT NOT NULL CHECK(type IN (
    'import', 'generate', 'execute',
    'monitor', 'auto_refine',
    'agent_discovery', 'prompt_improvement', 'prompt_evaluation',
    'template_drift', 'eval_revalidation'
  )),

  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN (
    'queued', 'running', 'completed', 'failed', 'cancelled'
  )),

  progress INTEGER NOT NULL DEFAULT 0,

  -- Existing fields
  metadata TEXT,
  result TEXT,
  error TEXT,

  -- NEW: Retry tracking fields
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  error_category TEXT,  -- From ErrorCategory type
  last_error_at DATETIME,
  next_retry_at DATETIME,

  -- NEW: Priority for job ordering (higher = process first)
  priority INTEGER NOT NULL DEFAULT 0,

  -- Existing timestamp fields
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME,

  -- Foreign key fields (from migration 005)
  agent_id TEXT,
  agent_version_id TEXT,
  trigger_event TEXT,
  trigger_threshold TEXT,

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (agent_version_id) REFERENCES agent_versions(id)
);

-- ============================================================================
-- Step 2: Copy data from old table
-- ============================================================================

INSERT INTO jobs_new (
  id, workspace_id, type, status, progress,
  metadata, result, error,
  retry_count, max_retries, priority,
  created_at, started_at, completed_at,
  agent_id, agent_version_id, trigger_event, trigger_threshold
)
SELECT
  id, workspace_id, type, status, progress,
  metadata, result, error,
  0 as retry_count,  -- Default for existing jobs
  5 as max_retries,  -- Default max retries
  0 as priority,     -- Default priority
  created_at, started_at, completed_at,
  agent_id, agent_version_id, trigger_event, trigger_threshold
FROM jobs;

-- ============================================================================
-- Step 3: Drop old table and rename new
-- ============================================================================

DROP TABLE jobs;
ALTER TABLE jobs_new RENAME TO jobs;

-- ============================================================================
-- Step 4: Recreate indexes
-- ============================================================================

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_type ON jobs(type);
CREATE INDEX idx_jobs_workspace_status ON jobs(workspace_id, status);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);

-- NEW: Index for retry scheduling
CREATE INDEX idx_jobs_next_retry ON jobs(next_retry_at) WHERE status = 'queued' AND next_retry_at IS NOT NULL;

-- NEW: Index for priority ordering
CREATE INDEX idx_jobs_priority ON jobs(priority DESC, created_at ASC) WHERE status = 'queued';

-- NEW: Index for error category analysis
CREATE INDEX idx_jobs_error_category ON jobs(error_category) WHERE status = 'failed';

-- ============================================================================
-- Step 5: Create job_retry_history table for audit trail
-- ============================================================================

CREATE TABLE job_retry_history (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  error TEXT NOT NULL,
  error_category TEXT NOT NULL,
  delay_ms INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE INDEX idx_job_retry_history_job ON job_retry_history(job_id);
CREATE INDEX idx_job_retry_history_created_at ON job_retry_history(created_at DESC);
