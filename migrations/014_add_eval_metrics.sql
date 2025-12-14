-- Migration 014: Add advanced eval metrics to evals table
-- Created: 2025-12-13
-- Description: Adds cohen_kappa, f1_score, precision, and recall columns to evals table
--              to support comprehensive eval accuracy reporting in the UI

-- Add cohen_kappa column (Agreement accounting for chance)
ALTER TABLE evals ADD COLUMN cohen_kappa REAL;

-- Add f1_score column (Harmonic mean of precision and recall)
ALTER TABLE evals ADD COLUMN f1_score REAL;

-- Add precision column (True positives / (True positives + False positives))
ALTER TABLE evals ADD COLUMN precision REAL;

-- Add recall column (True positives / (True positives + False negatives))
ALTER TABLE evals ADD COLUMN recall REAL;

-- Create index for querying by cohen_kappa
CREATE INDEX IF NOT EXISTS idx_evals_cohen_kappa ON evals(cohen_kappa DESC);

-- Create index for querying by f1_score
CREATE INDEX IF NOT EXISTS idx_evals_f1_score ON evals(f1_score DESC);
