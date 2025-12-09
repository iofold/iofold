# Database Migrations

This directory contains SQL migration scripts for the iofold database schema.

## Migration Files

- `001_initial_schema.sql` - Initial database schema (referenced from main schema.sql)
- `002_add_updated_at_to_eval_sets.sql` - Add updated_at column to eval_sets table (2025-11-15)
- `003_prompt_versioning.sql` - Add prompt versioning and agent management tables (2025-11-25)
- `004_monitoring.sql` - Add monitoring and metrics tables (2025-11-25)
- `005_agent_management.sql` - Enhance agent management with functions table (2025-11-28)
- `006_job_retry_tracking.sql` - Add retry tracking to jobs table (2025-11-30)
- `007_playground_tables.sql` - Add playground sessions and steps tables (2025-12-01)
- `008_add_raw_data_column.sql` - Add raw_data column to traces table (2025-12-02)
- `009_feedback_optional_agent.sql` - Make agent_id optional in feedback table (2025-12-06)
- `010_task_metadata.sql` - Add task metadata and enrichment tables for GEPA Phase 1B-3 (2025-12-09)

## Running Migrations

### For Cloudflare D1 (Production)

Run a migration on the remote database:

```bash
wrangler d1 execute DB_NAME --remote --file=migrations/002_add_updated_at_to_eval_sets.sql
```

Replace `DB_NAME` with your actual D1 database binding name from `wrangler.toml`.

### For Local Development

Run a migration on your local D1 database:

```bash
wrangler d1 execute DB_NAME --local --file=migrations/002_add_updated_at_to_eval_sets.sql
```

## Verifying Migrations

Check the schema after running a migration:

```bash
# Check table structure
wrangler d1 execute DB_NAME --command="PRAGMA table_info(eval_sets);"

# Check for updated_at column specifically
wrangler d1 execute DB_NAME --command="SELECT sql FROM sqlite_master WHERE type='table' AND name='eval_sets';"
```

## Creating New Migrations

When creating a new migration:

1. **Name it sequentially**: `XXX_descriptive_name.sql` (e.g., `003_add_status_to_traces.sql`)
2. **Include metadata**: Add comments at the top with date and description
3. **Make it idempotent**: Use `IF NOT EXISTS` or `IF EXISTS` where possible
4. **Test locally first**: Always test with `--local` before running `--remote`
5. **Include verification**: Add a SELECT query at the end to verify the migration

### Migration Template

```sql
-- Migration: [Short description]
-- Date: YYYY-MM-DD
-- Description: [Detailed description of what this migration does]

-- Your migration SQL here
ALTER TABLE table_name ADD COLUMN column_name TYPE DEFAULT value;

-- Verification query
SELECT COUNT(*) FROM table_name WHERE column_name IS NOT NULL;
```

## Rollback Strategy

Cloudflare D1 does not support automatic rollbacks. If a migration fails:

1. **Review the error** - Check what part of the migration failed
2. **Fix the issue** - Update the migration file or data
3. **Manual cleanup** - Write a reverse migration if needed
4. **Test thoroughly** - Always test rollback procedures locally

## Best Practices

1. **Always backup** - Before running production migrations, export your database
2. **Test locally** - Run migrations on local D1 first with `--local`
3. **Small changes** - Keep migrations focused on single logical changes
4. **Document** - Add clear comments explaining why the change is needed
5. **Version control** - Commit migration files before running them
6. **Never modify** - Don't change migrations after they've been run in production
7. **Track execution** - Keep a log of which migrations have been applied and when

## Migration History

| Migration | Date | Description | Status |
|-----------|------|-------------|--------|
| 001_initial_schema.sql | 2025-11-05 | Initial database schema | Applied |
| 002_add_updated_at_to_eval_sets.sql | 2025-11-15 | Add updated_at column to eval_sets | Applied |
| 003_prompt_versioning.sql | 2025-11-25 | Add prompt versioning and agent management | Applied |
| 004_monitoring.sql | 2025-11-25 | Add monitoring and metrics tables | Applied |
| 005_agent_management.sql | 2025-11-28 | Enhance agent management with functions | Applied |
| 006_job_retry_tracking.sql | 2025-11-30 | Add retry tracking to jobs table | Applied |
| 007_playground_tables.sql | 2025-12-01 | Add playground sessions and steps | Applied |
| 008_add_raw_data_column.sql | 2025-12-02 | Add raw_data column to traces table | Pending |
| 009_feedback_optional_agent.sql | 2025-12-06 | Make agent_id optional in feedback table | Applied |
| 010_task_metadata.sql | 2025-12-09 | Add task metadata and enrichment tables for GEPA | Pending |

## Troubleshooting

### Error: "column already exists"

The column was already added. Verify with:
```bash
wrangler d1 execute DB_NAME --command="PRAGMA table_info(eval_sets);"
```

### Error: "database is locked"

Another process is using the database. Close other connections and retry.

### Error: "no such table"

The table doesn't exist. Check your schema or run earlier migrations first.

## Getting Help

- Cloudflare D1 Docs: https://developers.cloudflare.com/d1/
- Wrangler CLI Docs: https://developers.cloudflare.com/workers/wrangler/
- Project Docs: See `/docs/` directory

## Notes for Production

- **Coordinate with team** - Announce migrations in team chat before running
- **Monitor performance** - Large migrations may impact API performance
- **Run during low traffic** - Schedule migrations during off-peak hours if possible
- **Have a rollback plan** - Know how to reverse the migration if issues arise
