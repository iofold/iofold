# iofold.com Database Layer

This directory contains the complete database schema and seed data for iofold.com, designed for Cloudflare D1 (SQLite).

## Files

- **`schema.sql`** - Complete database schema (canonical reference)
- **`seed.sql`** - Sample test data for development
- **`migrations/001_initial_schema.sql`** - Initial migration (identical to schema.sql)

## Schema Overview

### Core Tables (10 tables)

1. **`users`** - User accounts
2. **`workspaces`** - Multi-tenant workspaces
3. **`workspace_members`** - Many-to-many workspace membership
4. **`integrations`** - Connected platforms (Langfuse, Langsmith, OpenAI)
5. **`traces`** - Imported and normalized traces
6. **`eval_sets`** - Collections of traces for training
7. **`feedback`** - Human annotations (positive/negative/neutral)
8. **`evals`** - Generated Python eval functions
9. **`eval_executions`** - Prediction results
10. **`jobs`** - Background task tracking

### Views (1 view)

- **`eval_comparison`** - Pre-joins eval executions with human feedback for contradiction detection

### Indexes (25 indexes)

Performance-optimized indexes for:
- Multi-tenancy (workspace_id)
- Trace filtering (timestamp, source, has_errors)
- Feedback queries (eval_set_id, rating)
- Execution lookups (eval_id, trace_id composite)
- Job monitoring (status, type)

## Key Design Decisions

### 1. Multi-Tenancy via Workspaces
- All major tables link to `workspace_id` for data isolation
- `workspace_members` supports team collaboration
- Indexes on workspace_id for query performance

### 2. Normalized Trace Storage
- Traces stored as JSON in `steps` column (flexible schema)
- Pre-computed summaries (`input_preview`, `output_preview`) for list views
- Avoids expensive JSON parsing on every query

### 3. Foreign Key Cascades
- `ON DELETE CASCADE` for child records (integrations, traces, feedback)
- `ON DELETE SET NULL` for optional references (parent_eval_id)
- Maintains referential integrity

### 4. Versioned Evals
- `version` + `parent_eval_id` tracks refinement chain
- Unique constraint on `(eval_set_id, version)`
- Enables rollback and version comparison

### 5. Job System for Async Operations
- Generic `jobs` table for import/generate/execute operations
- `context` and `result` as JSON for flexibility
- Progress tracking (0-100) for UI feedback

### 6. Contradiction Detection via View
- `eval_comparison` view computes `is_contradiction` automatically
- Comparison matrix queries hit view instead of manual JOINs
- Logic: contradiction = (human positive AND predicted false) OR (human negative AND predicted true)

## Sample Data

The `seed.sql` file contains:
- 1 test workspace with 1 user
- 1 Langfuse integration
- 5 sample traces (3 positive, 2 negative examples)
- 1 eval set with 5 feedback entries
- 1 generated eval with test results
- 5 eval execution records (100% accuracy)
- 1 completed import job

## Usage

### Apply Schema (Cloudflare D1)

```bash
# Create database
npx wrangler d1 create iofold-db

# Apply schema
npx wrangler d1 execute iofold-db --file=./src/db/schema.sql

# Or use migration
npx wrangler d1 migrations apply iofold-db
```

### Load Seed Data

```bash
npx wrangler d1 execute iofold-db --file=./src/db/seed.sql
```

### Query Examples

```sql
-- Get traces with feedback
SELECT t.id, t.input_preview, f.rating
FROM traces t
LEFT JOIN feedback f ON t.id = f.trace_id
WHERE t.workspace_id = 'ws_test123';

-- Get eval accuracy stats
SELECT
  e.name,
  e.accuracy,
  e.execution_count,
  e.contradiction_count
FROM evals e
WHERE e.workspace_id = 'ws_test123'
ORDER BY e.created_at DESC;

-- Get contradictions using view
SELECT *
FROM eval_comparison
WHERE is_contradiction = 1
AND eval_set_id = 'set_quality123';
```

## Index Strategy

### High-Volume Tables
- **`eval_executions`** - Most frequently queried
  - Composite index on `(eval_id, trace_id)` for lookups
  - Separate indexes on each for filtering
  - Result index for pass/fail filtering

### Time-Series Queries
- **`traces`** - Timestamp DESC for recent traces
- **`jobs`** - Created_at DESC for job history
- **`eval_executions`** - Executed_at DESC for recent predictions

### Multi-Column Filters
- **`feedback`** - `(eval_set_id, rating)` for grouped stats
- **`jobs`** - `(workspace_id, status)` for active job monitoring
- **`integrations`** - `(workspace_id, platform)` for connection checks

## Performance Notes

### Query Optimization
- Pre-compute summaries on trace import (input_preview, output_preview)
- Use indexes for all workspace-scoped queries
- Limit JSON parsing to detail views (not list views)

### Scaling Considerations
- D1 limit: 100k rows per query, 5MB response size
- For large trace datasets, implement pagination (cursor-based)
- Consider R2 storage for trace artifacts > 100KB

### Caching Strategy
- Trace summaries: Cache aggressively (immutable after import)
- Matrix stats: Cache for 60s (expensive aggregates)
- Eval code: Cache until version changes

## Future Enhancements

### Potential Migrations
1. **Trace minification** - Add `minified_data` column for context optimization
2. **Eval analytics** - Add `eval_metrics` table for drift detection
3. **Audit log** - Track schema changes and data modifications
4. **Partitioning** - Time-based partitioning for traces (if D1 supports)

### Monitoring Queries
```sql
-- Check integration health
SELECT platform, status, COUNT(*)
FROM integrations
GROUP BY platform, status;

-- Eval accuracy distribution
SELECT
  CASE
    WHEN accuracy >= 0.9 THEN 'High (90%+)'
    WHEN accuracy >= 0.8 THEN 'Medium (80-90%)'
    ELSE 'Low (<80%)'
  END as accuracy_bucket,
  COUNT(*) as eval_count
FROM evals
GROUP BY accuracy_bucket;

-- Job failure rate
SELECT
  type,
  status,
  COUNT(*) as count,
  AVG(JULIANDAY(completed_at) - JULIANDAY(started_at)) * 86400 as avg_duration_sec
FROM jobs
WHERE started_at IS NOT NULL
GROUP BY type, status;
```

## Schema Version

**Current Version:** 1.0
**Last Updated:** November 12, 2025
**Migration Count:** 1

## Contact

For schema questions or migration issues, see `/home/ygupta/workspace/iofold/docs/2025-11-05-iofold-auto-evals-design.md`
