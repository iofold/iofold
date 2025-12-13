-- Migration 018: Add taskset_run job type
-- Created: 2025-12-12
-- Description: Adds 'taskset_run' to the jobs.type CHECK constraint

-- SQLite doesn't support ALTER TABLE for CHECK constraints, so we recreate the table
CREATE TABLE jobs_new (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,

  -- Expanded type constraint to include taskset_run
  type TEXT NOT NULL CHECK(type IN (
    'import', 'generate', 'execute',
    'monitor', 'auto_refine',
    'agent_discovery', 'prompt_improvement', 'prompt_evaluation',
    'template_drift', 'eval_revalidation',
    'taskset_run'
  )),

  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN (
    'queued', 'running', 'completed', 'failed', 'cancelled'
  )),

  progress INTEGER NOT NULL DEFAULT 0,

  metadata TEXT,
  result TEXT,
  error TEXT,

  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  error_category TEXT,
  last_error_at DATETIME,
  next_retry_at DATETIME,

  priority INTEGER NOT NULL DEFAULT 0,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME,

  agent_id TEXT,
  agent_version_id TEXT,
  trigger_event TEXT,
  trigger_threshold TEXT,

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (agent_version_id) REFERENCES agent_versions(id)
);

-- Copy data from old table
INSERT INTO jobs_new (
  id, workspace_id, type, status, progress,
  metadata, result, error,
  retry_count, max_retries, error_category, last_error_at, next_retry_at,
  priority,
  created_at, started_at, completed_at,
  agent_id, agent_version_id, trigger_event, trigger_threshold
)
SELECT
  id, workspace_id, type, status, progress,
  metadata, result, error,
  retry_count, max_retries, error_category, last_error_at, next_retry_at,
  priority,
  created_at, started_at, completed_at,
  agent_id, agent_version_id, trigger_event, trigger_threshold
FROM jobs;

-- Drop old table and rename new
DROP TABLE jobs;
ALTER TABLE jobs_new RENAME TO jobs;

-- Recreate indexes
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_type ON jobs(type);
CREATE INDEX idx_jobs_workspace_status ON jobs(workspace_id, status);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX idx_jobs_next_retry ON jobs(next_retry_at) WHERE status = 'queued' AND next_retry_at IS NOT NULL;
CREATE INDEX idx_jobs_priority ON jobs(priority DESC, created_at ASC) WHERE status = 'queued';
CREATE INDEX idx_jobs_error_category ON jobs(error_category) WHERE status = 'failed';
