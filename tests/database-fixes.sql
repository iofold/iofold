-- Database Integrity Fixes and Enhancements
-- iofold.com - Testing Agent 2
-- Apply these SQL statements to fix identified issues

-- ============================================================================
-- 1. Add Integration Name Uniqueness (Optional Enhancement)
-- ============================================================================

-- First, check for existing duplicates
-- Run this query to see if you have any duplicates before adding the constraint
SELECT workspace_id, name, COUNT(*) as count, GROUP_CONCAT(id) as integration_ids
FROM integrations
GROUP BY workspace_id, name
HAVING COUNT(*) > 1;

-- If no duplicates exist, add the unique constraint
-- Note: If duplicates exist, you'll need to rename them first
CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_workspace_name
ON integrations(workspace_id, name);

-- ============================================================================
-- 2. Enable WAL Mode for Better Concurrency (Production Recommendation)
-- ============================================================================

-- Check current journal mode
PRAGMA journal_mode;

-- Enable Write-Ahead Logging for better read/write concurrency
-- This is recommended for production workloads
PRAGMA journal_mode = WAL;

-- Set synchronous mode for better performance with WAL
-- normal is safe with WAL mode
PRAGMA synchronous = NORMAL;

-- ============================================================================
-- 3. Add Covering Indexes for Common Queries (Performance Optimization)
-- ============================================================================

-- Covering index for trace list queries (avoids table lookups)
CREATE INDEX IF NOT EXISTS idx_traces_list_covering
ON traces(workspace_id, timestamp, id, trace_id, source, step_count, has_errors);

-- Covering index for eval execution summaries
CREATE INDEX IF NOT EXISTS idx_executions_summary
ON eval_executions(eval_id, result, execution_time_ms);

-- ============================================================================
-- 4. Add Partial Indexes (Memory Optimization)
-- ============================================================================

-- Index only active integrations (most queries filter by active status)
CREATE INDEX IF NOT EXISTS idx_integrations_active
ON integrations(workspace_id, platform) WHERE status = 'active';

-- Index only pending/running jobs (completed jobs rarely queried)
CREATE INDEX IF NOT EXISTS idx_jobs_active
ON jobs(workspace_id, created_at, type) WHERE status IN ('queued', 'running');

-- ============================================================================
-- 5. Add Updated_At Triggers (Auto-Update Timestamps)
-- ============================================================================

-- Note: Cloudflare D1 may not support triggers yet. Check documentation.
-- If supported, these will automatically update timestamps on modifications.

-- Trigger for workspaces
CREATE TRIGGER IF NOT EXISTS update_workspaces_timestamp
AFTER UPDATE ON workspaces
BEGIN
  UPDATE workspaces SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger for integrations
CREATE TRIGGER IF NOT EXISTS update_integrations_timestamp
AFTER UPDATE ON integrations
BEGIN
  UPDATE integrations SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger for agents
CREATE TRIGGER IF NOT EXISTS update_agents_timestamp
AFTER UPDATE ON agents
BEGIN
  UPDATE agents SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger for feedback
CREATE TRIGGER IF NOT EXISTS update_feedback_timestamp
AFTER UPDATE ON feedback
BEGIN
  UPDATE feedback SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger for evals
CREATE TRIGGER IF NOT EXISTS update_evals_timestamp
AFTER UPDATE ON evals
BEGIN
  UPDATE evals SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ============================================================================
-- 6. Add Email Format Validation (Basic)
-- ============================================================================

-- Drop and recreate users table with email validation
-- WARNING: This will delete all user data. Only do this if table is empty.
-- For production, use a migration that preserves data.

-- Check if users table is empty first
-- SELECT COUNT(*) FROM users;

-- If empty, you can add validation:
-- DROP TABLE IF EXISTS users_backup;
-- ALTER TABLE users RENAME TO users_backup;

-- CREATE TABLE users (
--   id TEXT PRIMARY KEY,
--   email TEXT UNIQUE NOT NULL CHECK(email LIKE '%@%.%'),
--   name TEXT,
--   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
--   updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
-- );

-- INSERT INTO users SELECT * FROM users_backup;
-- DROP TABLE users_backup;

-- ============================================================================
-- 7. Analyze Tables for Query Optimization
-- ============================================================================

-- Gather statistics for query planner
-- This helps SQLite choose optimal query plans
ANALYZE;

-- Analyze specific tables if needed
ANALYZE traces;
ANALYZE feedback;
ANALYZE eval_executions;
ANALYZE jobs;

-- ============================================================================
-- 8. Vacuum Database (Reclaim Space)
-- ============================================================================

-- Rebuild database file to reclaim unused space and defragment
-- Run periodically in maintenance window
-- VACUUM;

-- ============================================================================
-- 9. Database Health Checks
-- ============================================================================

-- Check for table corruption
PRAGMA integrity_check;

-- Check foreign key integrity
PRAGMA foreign_key_check;

-- ============================================================================
-- 10. Query Plan Analysis (Diagnostic)
-- ============================================================================

-- Use these to verify indexes are being used:

-- Example 1: Trace listing query
EXPLAIN QUERY PLAN
SELECT t.*, f.rating
FROM traces t
LEFT JOIN feedback f ON t.id = f.trace_id
WHERE t.workspace_id = 'workspace_default'
ORDER BY t.timestamp DESC
LIMIT 50;

-- Example 2: Job status query
EXPLAIN QUERY PLAN
SELECT *
FROM jobs
WHERE workspace_id = 'workspace_default'
  AND status IN ('queued', 'running')
ORDER BY created_at DESC;

-- Example 3: Eval comparison view
EXPLAIN QUERY PLAN
SELECT *
FROM eval_comparison
WHERE eval_id = 'eval_001';

-- ============================================================================
-- 11. Clean Up Test Data (Optional)
-- ============================================================================

-- Remove all test workspaces except default
-- DELETE FROM workspaces WHERE id != 'workspace_default';

-- Remove all test jobs older than 30 days
-- DELETE FROM jobs WHERE created_at < datetime('now', '-30 days');

-- Remove failed jobs older than 7 days
-- DELETE FROM jobs WHERE status = 'failed' AND created_at < datetime('now', '-7 days');

-- ============================================================================
-- 12. Performance Monitoring Queries
-- ============================================================================

-- Table sizes
SELECT name, COUNT(*) as row_count
FROM (
  SELECT 'users' as name, COUNT(*) as count FROM users
  UNION ALL SELECT 'workspaces', COUNT(*) FROM workspaces
  UNION ALL SELECT 'integrations', COUNT(*) FROM integrations
  UNION ALL SELECT 'traces', COUNT(*) FROM traces
  UNION ALL SELECT 'agents', COUNT(*) FROM agents
  UNION ALL SELECT 'feedback', COUNT(*) FROM feedback
  UNION ALL SELECT 'evals', COUNT(*) FROM evals
  UNION ALL SELECT 'eval_executions', COUNT(*) FROM eval_executions
  UNION ALL SELECT 'jobs', COUNT(*) FROM jobs
) counts
GROUP BY name;

-- Index usage (not directly available in SQLite, but you can check):
SELECT name, type, tbl_name
FROM sqlite_master
WHERE type = 'index'
ORDER BY tbl_name, name;

-- Job status distribution
SELECT status, COUNT(*) as count
FROM jobs
GROUP BY status
ORDER BY count DESC;

-- Integration status distribution
SELECT status, COUNT(*) as count
FROM integrations
GROUP BY status
ORDER BY count DESC;

-- Feedback rating distribution
SELECT rating, COUNT(*) as count
FROM feedback
GROUP BY rating
ORDER BY count DESC;

-- Average eval execution times
SELECT
  e.name,
  COUNT(ex.id) as execution_count,
  AVG(ex.execution_time_ms) as avg_time_ms,
  MIN(ex.execution_time_ms) as min_time_ms,
  MAX(ex.execution_time_ms) as max_time_ms
FROM evals e
LEFT JOIN eval_executions ex ON e.id = ex.eval_id
GROUP BY e.id, e.name
HAVING COUNT(ex.id) > 0
ORDER BY avg_time_ms DESC;

-- ============================================================================
-- 13. Backup Preparation
-- ============================================================================

-- Export data for backup (run via wrangler or sqlite3 CLI)
-- .output backup.sql
-- .dump

-- Or backup specific tables:
-- .output traces_backup.sql
-- .dump traces

-- ============================================================================
-- END OF FIXES
-- ============================================================================

-- Notes:
-- 1. Test all changes in development environment first
-- 2. Some features (triggers, VACUUM) may not be supported in Cloudflare D1
-- 3. Always backup before applying structural changes
-- 4. Monitor query performance after applying indexes
-- 5. Run ANALYZE after significant data changes
