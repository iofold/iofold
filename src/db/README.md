# iofold.com Database Layer

This directory contains the database schema and client for iofold.com, designed for Cloudflare D1 (SQLite) using **Drizzle ORM**.

## Files

- **`schema/`** - Drizzle ORM schema definitions (TypeScript)
- **`client.ts`** - Database client factory for D1

## Schema Overview (41 Tables)

### Core Tables
- **`users`** - User accounts
- **`workspaces`** - Multi-tenant workspaces

### Agents & Functions
- **`agents`** - AI agent definitions
- **`agent_versions`** - Version history for agent prompts
- **`agent_functions`** - Function assignments to agents
- **`functions`** - Reusable function definitions

### Traces & Tasks
- **`traces`** - Imported and normalized traces
- **`trace_summaries`** - Pre-computed trace summaries
- **`task_metadata`** - Task extraction and enrichment
- **`task_similar_traces`** - Similarity relationships

### Evals & Feedback
- **`evals`** - Generated Python eval functions
- **`eval_executions`** - Prediction results
- **`eval_candidates`** - Candidate evals for selection
- **`eval_candidate_executions`** - GEPA candidate execution results
- **`eval_cv_results`** - Cross-validation results
- **`eval_llm_cache`** - LLM response caching
- **`eval_prompt_coverage`** - Prompt coverage tracking
- **`feedback`** - Human annotations
- **`task_feedback_pairs`** - Task-feedback relationships

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
- **`prompt_iterations`** - Prompt refinement history
- **`prompt_best_practices`** - Best practice definitions
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
- **`playground_steps`** - Step-by-step playground history
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

## Schema Management

See `/migrations/README.md` for full workflow.

### Quick Reference

```bash
# Generate migration from schema changes
pnpm db:generate

# Apply to local D1
pnpm db:apply:local

# Apply to remote D1
pnpm db:apply

# Open Drizzle Studio
pnpm db:studio
```

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
} from '@/db/schema';
```

## Performance Notes

- Pre-computed summaries avoid expensive JSON parsing
- Composite indexes for common query patterns
- Workspace-scoped queries use indexed columns
- Use `limit()` and pagination for large result sets

## Related Documentation

- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Project Architecture](/docs/2025-11-05-iofold-auto-evals-design.md)
