-- Migration 004: Eval Monitoring & Auto-Refinement
--
-- This migration adds tables for continuous eval monitoring,
-- performance alerting, and auto-refinement tracking.

-- ============================================================================
-- Add monitoring settings to evals table
-- ============================================================================

-- Enable automatic eval execution on new trace imports
ALTER TABLE evals ADD COLUMN auto_execute_enabled BOOLEAN DEFAULT FALSE;

-- Enable automatic refinement when performance thresholds are crossed
ALTER TABLE evals ADD COLUMN auto_refine_enabled BOOLEAN DEFAULT FALSE;

-- JSON-encoded monitoring thresholds (customizable per eval)
-- Default: {"min_accuracy": 0.80, "max_contradiction_rate": 0.15, "max_error_rate": 0.10, "min_executions_for_alert": 20}
ALTER TABLE evals ADD COLUMN monitoring_thresholds TEXT;

-- ============================================================================
-- Daily performance snapshots
-- ============================================================================
CREATE TABLE IF NOT EXISTS performance_snapshots (
  id TEXT PRIMARY KEY,
  eval_id TEXT NOT NULL REFERENCES evals(id) ON DELETE CASCADE,
  -- Date of snapshot (UTC)
  snapshot_date DATE NOT NULL,
  -- Core metrics
  accuracy REAL,
  execution_count INTEGER DEFAULT 0,
  contradiction_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  -- Additional context
  pass_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  -- Prompt version distribution (JSON: {"prompt_id": count})
  prompt_distribution TEXT,
  -- Timestamps
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- One snapshot per eval per day
  UNIQUE(eval_id, snapshot_date)
);

-- Index for querying snapshots by eval and date range
CREATE INDEX IF NOT EXISTS idx_performance_snapshots_eval_date
ON performance_snapshots(eval_id, snapshot_date DESC);

-- ============================================================================
-- Performance alerts
-- ============================================================================
CREATE TABLE IF NOT EXISTS performance_alerts (
  id TEXT PRIMARY KEY,
  eval_id TEXT NOT NULL REFERENCES evals(id) ON DELETE CASCADE,
  -- Alert classification
  alert_type TEXT NOT NULL, -- 'accuracy_drop', 'contradiction_spike', 'error_spike', 'prompt_drift', 'insufficient_data'
  severity TEXT DEFAULT 'warning', -- 'info', 'warning', 'critical'
  -- Alert context
  current_value REAL,
  threshold_value REAL,
  message TEXT NOT NULL,
  -- Optional reference to the prompt that drifted
  prompt_id TEXT REFERENCES system_prompts(id),
  -- State tracking
  triggered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at DATETIME,
  acknowledged_by TEXT,
  resolved_at DATETIME,
  resolved_by TEXT,
  -- Auto-action taken (if any)
  auto_action_taken TEXT, -- 'none', 'auto_refine_queued', 'auto_refine_completed', 'auto_refine_failed'
  auto_action_job_id TEXT REFERENCES jobs(id),
  -- Metadata (JSON)
  metadata TEXT
);

-- Index for querying active alerts
CREATE INDEX IF NOT EXISTS idx_performance_alerts_active
ON performance_alerts(eval_id, resolved_at)
WHERE resolved_at IS NULL;

-- Index for querying alerts by type
CREATE INDEX IF NOT EXISTS idx_performance_alerts_type
ON performance_alerts(alert_type, triggered_at DESC);

-- ============================================================================
-- Refinement history (tracks auto and manual refinements)
-- ============================================================================
CREATE TABLE IF NOT EXISTS refinement_history (
  id TEXT PRIMARY KEY,
  eval_id TEXT NOT NULL REFERENCES evals(id) ON DELETE CASCADE,
  -- Version tracking
  parent_version INTEGER, -- NULL for original eval
  new_version INTEGER NOT NULL,
  -- Trigger context
  trigger_type TEXT NOT NULL, -- 'manual', 'threshold', 'drift', 'scheduled'
  trigger_alert_id TEXT REFERENCES performance_alerts(id),
  trigger_metrics TEXT, -- JSON with metrics that triggered refinement
  -- Refinement configuration
  include_contradictions BOOLEAN DEFAULT TRUE,
  custom_instructions TEXT,
  -- Results
  result_accuracy REAL,
  improvement_delta REAL, -- new_accuracy - parent_accuracy
  -- Status tracking
  status TEXT DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed', 'rejected', 'deployed'
  job_id TEXT REFERENCES jobs(id),
  -- Rejection tracking (user rejected auto-refinement result)
  rejected_at DATETIME,
  rejected_by TEXT,
  rejection_reason TEXT,
  -- Deployment tracking
  deployed_at DATETIME,
  deployed_by TEXT,
  -- Timestamps
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

-- Index for querying refinement history by eval
CREATE INDEX IF NOT EXISTS idx_refinement_history_eval
ON refinement_history(eval_id, created_at DESC);

-- Index for querying by status
CREATE INDEX IF NOT EXISTS idx_refinement_history_status
ON refinement_history(status, created_at DESC);

-- ============================================================================
-- Auto-refinement cooldown tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS auto_refine_cooldowns (
  id TEXT PRIMARY KEY,
  eval_id TEXT NOT NULL REFERENCES evals(id) ON DELETE CASCADE,
  -- Last auto-refinement attempt
  last_attempt_at DATETIME NOT NULL,
  -- Next allowed attempt (enforces cooldown)
  next_allowed_at DATETIME NOT NULL,
  -- Consecutive failures (for backoff)
  consecutive_failures INTEGER DEFAULT 0,
  -- Updated on each attempt
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(eval_id)
);

-- ============================================================================
-- View: Current eval performance metrics
-- ============================================================================
CREATE VIEW IF NOT EXISTS current_eval_metrics AS
SELECT
  e.id as eval_id,
  e.name as eval_name,
  e.auto_execute_enabled,
  e.auto_refine_enabled,
  e.monitoring_thresholds,
  -- Accuracy from test_results
  CAST(json_extract(e.test_results, '$.accuracy') AS REAL) as current_accuracy,
  -- Execution stats from last 7 days
  (
    SELECT SUM(execution_count)
    FROM performance_snapshots ps
    WHERE ps.eval_id = e.id
    AND ps.snapshot_date >= date('now', '-7 days')
  ) as recent_executions,
  -- Contradiction rate from last 7 days
  (
    SELECT CAST(SUM(contradiction_count) AS REAL) / NULLIF(SUM(execution_count), 0)
    FROM performance_snapshots ps
    WHERE ps.eval_id = e.id
    AND ps.snapshot_date >= date('now', '-7 days')
  ) as recent_contradiction_rate,
  -- Error rate from last 7 days
  (
    SELECT CAST(SUM(error_count) AS REAL) / NULLIF(SUM(execution_count), 0)
    FROM performance_snapshots ps
    WHERE ps.eval_id = e.id
    AND ps.snapshot_date >= date('now', '-7 days')
  ) as recent_error_rate,
  -- Active alerts count
  (
    SELECT COUNT(*)
    FROM performance_alerts pa
    WHERE pa.eval_id = e.id
    AND pa.resolved_at IS NULL
  ) as active_alerts,
  -- Latest alert
  (
    SELECT alert_type
    FROM performance_alerts pa
    WHERE pa.eval_id = e.id
    AND pa.resolved_at IS NULL
    ORDER BY pa.triggered_at DESC
    LIMIT 1
  ) as latest_alert_type
FROM evals e;

-- ============================================================================
-- View: Refinement timeline for dashboard
-- ============================================================================
CREATE VIEW IF NOT EXISTS refinement_timeline AS
SELECT
  rh.id,
  rh.eval_id,
  e.name as eval_name,
  rh.parent_version,
  rh.new_version,
  rh.trigger_type,
  rh.result_accuracy,
  rh.improvement_delta,
  rh.status,
  rh.created_at,
  rh.completed_at,
  rh.deployed_at,
  pa.alert_type as trigger_alert_type,
  pa.message as trigger_alert_message
FROM refinement_history rh
JOIN evals e ON rh.eval_id = e.id
LEFT JOIN performance_alerts pa ON rh.trigger_alert_id = pa.id
ORDER BY rh.created_at DESC;
