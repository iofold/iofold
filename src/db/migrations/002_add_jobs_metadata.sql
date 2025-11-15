-- Migration 002: Add metadata column to jobs table
-- Created: 2025-11-13
-- Description: Add metadata column for job-specific data (JobManager uses this name instead of context)

ALTER TABLE jobs ADD COLUMN metadata JSON;
