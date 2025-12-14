# Database Migrations (Drizzle ORM)

This project uses **Drizzle ORM** with code-as-source-of-truth for database schema management.

## Schema Location

All schema definitions live in TypeScript files:

```
src/db/schema/
├── index.ts          # Exports all tables
├── enums.ts          # Shared enum definitions
├── agents.ts         # agents, agent_versions, agent_functions, functions
├── traces.ts         # traces, trace_summaries
├── evals.ts          # evals, eval_executions, eval_candidates, eval_cv_results
├── feedback.ts       # feedback, task_feedback_pairs
├── gepa.ts           # gepa_runs, gepa_run_tasks
├── integrations.ts   # integrations
├── jobs.ts           # jobs, job_retry_history
├── monitoring.ts     # performance_snapshots, performance_alerts
├── playground.ts     # playground_sessions, playground_steps
├── prompts.ts        # system_prompts, prompt_iterations, prompt_best_practices
├── refinement.ts     # refinement_history, auto_refine_cooldowns
├── rollout.ts        # rollout_batches, rollout_results
├── tasksets.ts       # tasksets, taskset_tasks, taskset_runs, taskset_run_results
├── tasks.ts          # task_metadata, task_similar_traces
├── tools.ts          # tools
└── users.ts          # users, workspaces
```

## Workflow

### Making Schema Changes

1. **Edit schema files** in `src/db/schema/`
2. **Generate migration**: `pnpm db:generate`
3. **Test locally**: `pnpm db:apply:local`
4. **Apply to staging**: `pnpm db:apply`

### Available Commands

| Command | Description |
|---------|-------------|
| `pnpm db:generate` | Generate SQL migration from schema diff |
| `pnpm db:push` | Push schema directly to D1 (dev only) |
| `pnpm db:pull` | Pull schema from D1 to TypeScript |
| `pnpm db:studio` | Open Drizzle Studio GUI |
| `pnpm db:apply` | Apply migrations to remote D1 |
| `pnpm db:apply:local` | Apply migrations to local D1 |

### Configuration Files

- `drizzle.config.ts` - Main config for D1 HTTP (requires CF credentials)
- `drizzle.config.local.ts` - Local SQLite config for testing

## Environment Variables

For remote D1 operations, set these in `.dev.vars`:

```env
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_DATABASE_ID=your_database_id
CLOUDFLARE_D1_TOKEN=your_api_token
```

## Best Practices

1. **Schema changes in code** - Never edit SQL files directly
2. **Test locally first** - Use `drizzle.config.local.ts` for validation
3. **Review generated SQL** - Check `drizzle/` folder before applying
4. **Small incremental changes** - Avoid large schema changes in one migration

## Migration History

Migrations are now tracked in the `drizzle/` folder as generated SQL files.
The Drizzle meta folder (`drizzle/meta/`) tracks applied migrations.

## Troubleshooting

### "No schema changes"
Schema is already in sync. Verify with local config:
```bash
pnpm drizzle-kit generate --config=drizzle.config.local.ts
```

### TypeScript errors in schema
Check for missing imports from `drizzle-orm/sqlite-core`.

### Migration conflicts
Delete `drizzle/meta/` and regenerate if starting fresh.
