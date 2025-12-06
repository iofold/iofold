-- Migration 009: Make agent_id optional in feedback table
--
-- Issue: Feedback should only require trace_id (1:1 relationship)
-- Traces are already linked to agents via agent_version_id
-- Having agent_id as required in feedback creates redundancy and confusion
--
-- SQLite doesn't support modifying column constraints directly,
-- so we need to recreate the table with the new schema.

-- Step 0: Drop dependent view first
DROP VIEW IF EXISTS eval_comparison;

-- Step 1: Create new feedback table with agent_id as optional
CREATE TABLE feedback_new (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  agent_id TEXT,  -- Now optional (nullable)
  rating TEXT NOT NULL, -- 'positive' | 'negative' | 'neutral'
  rating_detail TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trace_id) REFERENCES traces(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  UNIQUE(trace_id)  -- Changed: Only trace_id must be unique (1:1 relationship)
);

-- Step 2: Copy existing data
INSERT INTO feedback_new (id, trace_id, agent_id, rating, rating_detail, created_at)
SELECT id, trace_id, agent_id, rating, rating_detail, created_at
FROM feedback;

-- Step 3: Drop old table (this will drop the old indexes automatically)
DROP TABLE feedback;

-- Step 4: Rename new table
ALTER TABLE feedback_new RENAME TO feedback;

-- Step 5: Recreate indexes
CREATE INDEX idx_feedback_trace_id ON feedback(trace_id);
CREATE INDEX idx_feedback_agent_id ON feedback(agent_id);
CREATE INDEX idx_feedback_rating ON feedback(rating);
CREATE INDEX idx_feedback_agent_created_trace ON feedback(agent_id, created_at, trace_id);

-- Step 6: Recreate eval_comparison view
CREATE VIEW eval_comparison AS
SELECT
  ee.id AS execution_id,
  ee.eval_id,
  ee.trace_id,
  ee.predicted_result,
  ee.predicted_reason,
  ee.execution_time_ms,
  ee.error,
  f.rating AS human_rating,
  f.rating_detail AS human_notes,
  CASE
    WHEN f.rating IS NULL THEN NULL
    WHEN f.rating = 'neutral' THEN 0
    WHEN (f.rating = 'positive' AND ee.predicted_result = 0) THEN 1
    WHEN (f.rating = 'negative' AND ee.predicted_result = 1) THEN 1
    ELSE 0
  END AS is_contradiction
FROM eval_executions ee
LEFT JOIN feedback f ON ee.trace_id = f.trace_id;
