# iofold.com Database Layer

This directory contains the database schema and client for iofold.com, designed for Cloudflare D1 (SQLite) using **Drizzle ORM**.

## Files

- **`schema/`** - Drizzle ORM schema definitions (TypeScript)
- **`client.ts`** - Database client factory for D1

## Schema Overview (31 Tables)

### Core Tables
- **`users`** - User accounts
- **`workspaces`** - Multi-tenant workspaces

### Agents & Functions
- **`agents`** - AI agent definitions
- **`agent_versions`** - Version history for agent prompts
- **`agent_functions`** - Function assignments to agents
- **`agent_tools`** - Tool attachments to agents
- **`functions`** - Reusable function definitions

### Traces & Tasks
- **`traces`** - Imported and normalized traces
- **`trace_summaries`** - Pre-computed trace summaries
- **`task_metadata`** - Task extraction and enrichment

### Evals & Feedback
- **`evals`** - Generated Python eval functions (consolidated from eval_candidates)
- **`eval_executions`** - Prediction results (consolidated from eval_candidate_executions)
- **`feedback`** - Human annotations

### GEPA (Generated Eval Pipeline)
- **`gepa_runs`** - GEPA pipeline run tracking
- **`gepa_run_tasks`** - Tasks included in GEPA runs

### Jobs & Monitoring
- **`jobs`** - Background task tracking
- **`job_retry_history`** - Retry attempt logging
- **`performance_snapshots`** - Agent performance metrics
- **`performance_alerts`** - Performance alert history

### Prompts & Refinement
- **`system_prompts`** - System prompt templates
- **`refinement_history`** - Full refinement tracking
- **`auto_refine_cooldowns`** - Auto-refinement rate limiting

### Tasksets & Rollouts
- **`tasksets`** - Evaluation task collections
- **`taskset_tasks`** - Individual tasks in tasksets
- **`taskset_runs`** - Taskset execution runs
- **`taskset_run_results`** - Run result records
- **`rollout_batches`** - Staged rollout batches
- **`rollout_results`** - Rollout outcome tracking

### Playground & Tools
- **`playground_sessions`** - Interactive testing sessions
- **`tools`** - Tool registry definitions
- **`integrations`** - External platform connections

## Usage

### Import Schema Tables

```typescript
import { agents, traces, evals } from '@/db/schema';
```

### Create Database Client

```typescript
import { createDb } from '@/db/client';

// In a Worker handler:
const db = createDb(env.DB);

// Query with Drizzle
const allAgents = await db.select().from(agents);
```

### Type-Safe Queries

```typescript
import { eq, desc } from 'drizzle-orm';
import { traces, feedback } from '@/db/schema';

// Get recent traces with feedback
const result = await db
  .select()
  .from(traces)
  .leftJoin(feedback, eq(traces.id, feedback.traceId))
  .where(eq(traces.workspaceId, workspaceId))
  .orderBy(desc(traces.timestamp))
  .limit(50);
```

### Insert Records

```typescript
import { agents } from '@/db/schema';

await db.insert(agents).values({
  id: 'agent_123',
  workspaceId: 'ws_abc',
  name: 'Support Bot',
  description: 'Customer support agent',
  status: 'confirmed',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
```

## Schema Management with Drizzle

### Migration-Based Workflow (Recommended)

**IMPORTANT:** Always use the migration-based workflow for D1. Do NOT use `drizzle-kit push` with remote D1 databases - it has issues with foreign key constraints.

```bash
# 1. Make schema changes in src/db/schema/*.ts

# 2. Generate migration
npx drizzle-kit generate --name descriptive_name

# 3. Review generated SQL in drizzle/XXXX_descriptive_name.sql

# 4. Apply to local D1 (inside Docker container)
docker exec iofold-backend npx wrangler d1 migrations apply DB --local

# 5. Apply to staging D1
npx wrangler d1 migrations apply DB --remote --env staging

# 6. Apply to production D1
npx wrangler d1 migrations apply DB --remote --env production
```

### Before Applying Migrations to Remote

Always create a backup bookmark before applying migrations:

```bash
# Get current bookmark (for rollback if needed)
npx wrangler d1 time-travel info DB --env staging

# To restore if something goes wrong:
npx wrangler d1 time-travel restore DB --env staging --bookmark=<bookmark_id>
```

### Why Not `drizzle-kit push`?

`drizzle-kit push` doesn't work reliably with Cloudflare D1 because:

1. **FK Constraint Issues**: D1 executes statements sequentially, and `PRAGMA foreign_keys=OFF` doesn't persist across statements. When drizzle tries to recreate tables (even for minor changes), dropping tables fails due to FK constraints.

2. **Table Recreation**: Push tries to recreate every table to normalize structure (CHECK constraints, column order), even when there are no meaningful changes.

3. **Views**: D1 views can block schema changes if they reference tables being modified.

**Solution**: Use the migration workflow which:
- Generates SQL files you can review
- Handles FK constraints properly via wrangler's migration system
- Is tracked in `d1_migrations` table
- Can be rolled back via Time Travel

### Handling Views During Migrations

If a migration fails due to a view dependency:

```bash
# 1. Drop the view
npx wrangler d1 execute DB --remote --env staging \
  --command="DROP VIEW IF EXISTS view_name;"

# 2. Apply migration
npx wrangler d1 migrations apply DB --remote --env staging

# 3. Recreate the view (if needed - check if it's in schema)
```

### Drizzle Config

Two config files exist:
- **`drizzle.config.ts`** - For remote D1 (uses d1-http driver, requires env vars)
- **`drizzle.config.local.ts`** - For local development

Required environment variables for remote:
```bash
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_DATABASE_ID=your_database_id  # From wrangler d1 list
CLOUDFLARE_D1_TOKEN=your_api_token       # From .dev.vars or Cloudflare dashboard
```

### Table Exclusions

The drizzle config excludes these D1/system tables:
- `d1_migrations` - Wrangler's migration tracker
- `_cf_KV` - Cloudflare internal
- `sqlite_sequence` - SQLite internal

## Type Exports

All table types are exported from `@/db/schema`:

```typescript
import type {
  Agent,
  NewAgent,
  Trace,
  NewTrace,
  Eval,
  NewEval,
  EvalExecution,
  NewEvalExecution,
} from '@/db/schema';
```

## Performance Notes

- Pre-computed summaries avoid expensive JSON parsing
- Composite indexes for common query patterns
- Workspace-scoped queries use indexed columns
- Use `limit()` and pagination for large result sets

## Troubleshooting

### "FOREIGN KEY constraint failed" during migrations

This usually means:
1. A view references the table being modified - drop view first
2. An old `__new_*` temp table exists - drop it manually
3. Data exists that violates the new constraint - fix data first

```bash
# Check for leftover temp tables
npx wrangler d1 execute DB --remote --env staging \
  --command="SELECT name FROM sqlite_master WHERE name LIKE '__new_%';"

# Drop if found
npx wrangler d1 execute DB --remote --env staging \
  --command="DROP TABLE IF EXISTS __new_tablename;"
```

### Schema out of sync

If you suspect schema drift:

```bash
# Generate a new migration - if empty, schemas match
npx drizzle-kit generate --name check_sync

# If "No schema changes", you're in sync
# If migration generated, review and apply it
```

## Related Documentation

- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Project Architecture](/docs/2025-11-05-iofold-auto-evals-design.md)
