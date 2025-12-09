-- Migration 010: Task metadata and enrichment tables for DataInst integration
-- Created: 2025-12-09
-- Description: Adds tables for task metadata extraction, similar trace references,
--              feedback pair tracking, and trace summaries cache for GEPA Phase 1B-3

-- ============================================================================
-- Step 1: Create task_metadata table
-- ============================================================================

-- Task metadata for DataInst enrichment
CREATE TABLE IF NOT EXISTS task_metadata (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,

  -- Extracted task
  user_message TEXT NOT NULL,

  -- Ground truth (if available)
  expected_output TEXT,
  expected_action TEXT,
  success_criteria TEXT,  -- JSON array

  -- Task categorization
  task_type TEXT,  -- "code_generation", "qa", "classification", "extraction"
  difficulty TEXT CHECK(difficulty IN ('easy', 'medium', 'hard')),
  domain TEXT,

  -- Custom agent-specific fields
  custom_metadata TEXT,  -- JSON

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (trace_id) REFERENCES traces(id) ON DELETE CASCADE,
  UNIQUE(trace_id)
);

-- ============================================================================
-- Step 2: Create task_similar_traces table
-- ============================================================================

-- Similar trace references for enrichment
CREATE TABLE IF NOT EXISTS task_similar_traces (
  id TEXT PRIMARY KEY,
  task_metadata_id TEXT NOT NULL,
  similar_trace_id TEXT NOT NULL,

  similarity_score REAL NOT NULL,  -- 0-1
  human_score REAL,  -- Score of the similar trace

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (task_metadata_id) REFERENCES task_metadata(id) ON DELETE CASCADE,
  FOREIGN KEY (similar_trace_id) REFERENCES traces(id) ON DELETE CASCADE,
  UNIQUE(task_metadata_id, similar_trace_id)
);

-- ============================================================================
-- Step 3: Create task_feedback_pairs table
-- ============================================================================

-- Feedback pair references
CREATE TABLE IF NOT EXISTS task_feedback_pairs (
  id TEXT PRIMARY KEY,
  task_metadata_id TEXT NOT NULL,
  feedback_trace_id TEXT NOT NULL,

  human_feedback TEXT NOT NULL,
  human_score REAL,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (task_metadata_id) REFERENCES task_metadata(id) ON DELETE CASCADE,
  FOREIGN KEY (feedback_trace_id) REFERENCES traces(id) ON DELETE CASCADE,
  UNIQUE(task_metadata_id, feedback_trace_id)
);

-- ============================================================================
-- Step 4: Create trace_summaries table
-- ============================================================================

-- Trace summaries cache
CREATE TABLE IF NOT EXISTS trace_summaries (
  trace_id TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  key_behaviors TEXT,  -- JSON array
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (trace_id) REFERENCES traces(id) ON DELETE CASCADE
);

-- ============================================================================
-- Step 5: Create indexes
-- ============================================================================

-- Task metadata indexes
CREATE INDEX IF NOT EXISTS idx_task_metadata_type ON task_metadata(task_type);
CREATE INDEX IF NOT EXISTS idx_task_metadata_trace ON task_metadata(trace_id);
CREATE INDEX IF NOT EXISTS idx_task_metadata_updated ON task_metadata(updated_at DESC);

-- Similar traces indexes
CREATE INDEX IF NOT EXISTS idx_similar_traces_metadata ON task_similar_traces(task_metadata_id);
CREATE INDEX IF NOT EXISTS idx_similar_traces_similar ON task_similar_traces(similar_trace_id);
CREATE INDEX IF NOT EXISTS idx_similar_traces_score ON task_similar_traces(similarity_score DESC);

-- Feedback pairs indexes
CREATE INDEX IF NOT EXISTS idx_feedback_pairs_metadata ON task_feedback_pairs(task_metadata_id);
CREATE INDEX IF NOT EXISTS idx_feedback_pairs_trace ON task_feedback_pairs(feedback_trace_id);

-- Trace summaries indexes
CREATE INDEX IF NOT EXISTS idx_trace_summaries_created ON trace_summaries(created_at DESC);
