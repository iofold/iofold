-- Migration: Add updated_at column to eval_sets table
-- Date: 2025-11-15
-- Description: Adds updated_at column for proper timestamp tracking

-- Add updated_at column if it doesn't exist
ALTER TABLE eval_sets ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Set existing rows to have updated_at = created_at
UPDATE eval_sets SET updated_at = created_at WHERE updated_at IS NULL;

-- Verify migration
SELECT COUNT(*) as total_rows,
       COUNT(updated_at) as rows_with_updated_at
FROM eval_sets;
