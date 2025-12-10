-- Enron Email Database Setup
-- Created: 2025-12-10
-- Description: Database schema for Enron email dataset (~500K emails)
--
-- This database supports the Email Search Agent and ART-E benchmark.
-- Includes full-text search via FTS5 for efficient email queries.
--
-- Usage:
--   1. Create database: npx wrangler d1 create enron-emails
--   2. Run this migration: npx wrangler d1 execute enron-emails --local --file=scripts/setup-enron-db.sql
--   3. Import data: npx tsx scripts/import-enron.ts

-- ============================================================================
-- Step 1: Create emails table
-- ============================================================================

CREATE TABLE emails (
  -- Primary key: Email message ID (RFC 2822 Message-ID header)
  message_id TEXT PRIMARY KEY,

  -- Inbox owner (email address)
  inbox TEXT NOT NULL,

  -- Email metadata
  subject TEXT,
  sender TEXT,
  recipients TEXT,                    -- JSON array of email addresses
  date TEXT,                          -- ISO 8601 timestamp

  -- Email content
  body TEXT,

  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Step 2: Create indexes
-- ============================================================================

-- Index for inbox lookups (most common query pattern)
CREATE INDEX idx_emails_inbox ON emails(inbox);

-- Index for date-based queries (temporal filtering for ART-E benchmark)
CREATE INDEX idx_emails_date ON emails(date DESC);

-- Index for sender lookups
CREATE INDEX idx_emails_sender ON emails(sender);

-- Composite index for inbox + date (optimizes ART-E temporal queries)
CREATE INDEX idx_emails_inbox_date ON emails(inbox, date DESC);

-- ============================================================================
-- Step 3: Create FTS5 virtual table for full-text search
-- ============================================================================

-- FTS5 table for efficient full-text search
-- content=emails links it to the main emails table
-- Indexes: subject (column 0) and body (column 1)
CREATE VIRTUAL TABLE emails_fts USING fts5(
  subject,
  body,
  content=emails,
  content_rowid=rowid,
  tokenize = 'porter ascii'         -- Porter stemming + ASCII folding
);

-- ============================================================================
-- Step 4: Create FTS5 triggers to keep virtual table in sync
-- ============================================================================

-- Trigger: Insert new email into FTS5
CREATE TRIGGER emails_fts_insert AFTER INSERT ON emails BEGIN
  INSERT INTO emails_fts(rowid, subject, body)
  VALUES (new.rowid, new.subject, new.body);
END;

-- Trigger: Delete email from FTS5
CREATE TRIGGER emails_fts_delete AFTER DELETE ON emails BEGIN
  DELETE FROM emails_fts WHERE rowid = old.rowid;
END;

-- Trigger: Update email in FTS5
CREATE TRIGGER emails_fts_update AFTER UPDATE ON emails BEGIN
  DELETE FROM emails_fts WHERE rowid = old.rowid;
  INSERT INTO emails_fts(rowid, subject, body)
  VALUES (new.rowid, new.subject, new.body);
END;

-- ============================================================================
-- Step 5: Create ART-E tasks table (optional, for benchmark runner)
-- ============================================================================

-- Store ART-E benchmark tasks for evaluation
CREATE TABLE art_e_tasks (
  id INTEGER PRIMARY KEY,             -- Task ID from dataset
  question TEXT NOT NULL,             -- Question to answer
  answer TEXT NOT NULL,               -- Ground truth answer
  message_ids TEXT NOT NULL,          -- JSON array of source message IDs
  inbox_address TEXT NOT NULL,        -- Which inbox to search
  query_date TEXT NOT NULL,           -- Temporal cutoff (ISO 8601)
  how_realistic REAL,                 -- Realism score (0.3-1.0)
  split TEXT NOT NULL,                -- 'train' or 'test'

  -- Execution tracking
  executed INTEGER DEFAULT 0,         -- 0 = not run, 1 = completed
  agent_answer TEXT,                  -- Agent's response
  similarity_score REAL,              -- Semantic similarity to ground truth
  execution_time_ms INTEGER,          -- Execution latency
  trace_id TEXT,                      -- Link to traces table

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  executed_at DATETIME,

  CHECK(split IN ('train', 'test'))
);

-- Indexes for ART-E tasks
CREATE INDEX idx_art_e_tasks_inbox ON art_e_tasks(inbox_address);
CREATE INDEX idx_art_e_tasks_split ON art_e_tasks(split);
CREATE INDEX idx_art_e_tasks_executed ON art_e_tasks(executed);

-- ============================================================================
-- Database Setup Complete
-- ============================================================================

-- Summary:
-- - emails table: ~500K rows (after import)
-- - emails_fts: Full-text search index (subject + body)
-- - Indexes: inbox, date, sender, composite inbox+date
-- - Triggers: Keep FTS5 in sync with emails table
-- - art_e_tasks: Optional benchmark task storage

-- Next steps:
-- 1. Run import script: npx tsx scripts/import-enron.ts
-- 2. Verify import: SELECT COUNT(*) FROM emails;
-- 3. Test FTS search: SELECT * FROM emails_fts WHERE emails_fts MATCH 'meeting' LIMIT 5;
