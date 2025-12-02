-- Migration 008: Add raw_data column to traces table
-- Created: 2025-12-02
-- Description: Stores the original observation hierarchy from Langfuse/Langsmith for tree view rendering
--              This preserves the original trace structure for UI display purposes

-- ============================================================================
-- Step 1: Add raw_data column to traces table
-- ============================================================================

-- Add raw_data column to store original trace data from observability platforms
-- This enables hierarchical/tree view rendering in the frontend without losing
-- the original structure during normalization to LangGraphExecutionStep format
ALTER TABLE traces ADD COLUMN raw_data TEXT;

-- Note: SQLite stores JSON as TEXT. The column can be NULL for existing traces
-- that were imported before this migration. New traces should populate this field.
