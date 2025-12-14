# Drizzle ORM Migration Plan for iofold

**Created:** 2025-12-14
**Status:** Draft
**Estimated Scope:** 43 tables, 100+ queries, 55 files with DB access

---

## Executive Summary

This plan outlines the migration from raw D1 SQL queries to Drizzle ORM. The migration will:
1. Resolve existing schema conflicts (eval_executions table collision)
2. Provide type-safe database operations
3. Consolidate schema definitions
4. Enable proper migration management
5. Improve test infrastructure

---

## Part 1: Pre-Migration - Resolve Schema Conflicts

### Critical Issue: `eval_executions` Table Collision

**Problem:** Two different schemas defined for the same table name:

| Version | Source | FK Column | Result Column | Used By |
|---------|--------|-----------|---------------|---------|
| Legacy | schema.sql, Migration 001 | `eval_id` → evals | `result`, `reason` | `eval-execution-job.ts` |
| GEPA | Migration 012 | `eval_candidate_id` → eval_candidates | `success`, `feedback` | `matrix.ts`, `eval-generation.ts` |

**Resolution:** Rename the GEPA version to `eval_candidate_executions`

```sql
-- Migration 019: Resolve eval_executions naming collision
-- Rename GEPA eval_executions references to eval_candidate_executions

-- 1. Create new table with correct name
CREATE TABLE IF NOT EXISTS eval_candidate_executions (
  id TEXT PRIMARY KEY,
  eval_candidate_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  score REAL,
  feedback TEXT,
  success BOOLEAN,
  error TEXT,
  duration_ms INTEGER,
  llm_calls INTEGER,
  llm_cost_usd REAL,
  cache_hits INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (eval_candidate_id) REFERENCES eval_candidates(id) ON DELETE CASCADE,
  FOREIGN KEY (trace_id) REFERENCES traces(id) ON DELETE CASCADE
);

-- 2. Migrate data if exists
INSERT INTO eval_candidate_executions
SELECT * FROM eval_executions WHERE eval_candidate_id IS NOT NULL;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_eval_candidate_executions_candidate ON eval_candidate_executions(eval_candidate_id);
CREATE INDEX IF NOT EXISTS idx_eval_candidate_executions_trace ON eval_candidate_executions(trace_id);
```

**Code Changes Required:**
- `src/api/matrix.ts`: Change `eval_executions` → `eval_candidate_executions` (lines 318-333, 556-572, 639-652, 728-747)
- `src/api/eval-generation.ts`: Update any GEPA-related queries

---

## Part 2: Drizzle Setup

### 2.1 Install Dependencies

```bash
pnpm add drizzle-orm
pnpm add -D drizzle-kit
```

### 2.2 Project Structure

```
src/
├── db/
│   ├── index.ts              # Drizzle client initialization
│   ├── schema/
│   │   ├── index.ts          # Export all schemas
│   │   ├── users.ts          # User & workspace tables
│   │   ├── agents.ts         # Agent, versions, functions
│   │   ├── traces.ts         # Traces, feedback
│   │   ├── evals.ts          # Evals, eval_candidates, executions
│   │   ├── jobs.ts           # Jobs, retry history
│   │   ├── tasksets.ts       # Tasksets, tasks, runs
│   │   ├── tools.ts          # Tool registry
│   │   ├── playground.ts     # Playground sessions/steps
│   │   ├── monitoring.ts     # Performance, alerts, refinement
│   │   └── relations.ts      # All table relations
│   ├── migrations/           # Drizzle migrations (generated)
│   └── seed.ts               # Seed data for development
├── repositories/             # (Optional) Repository pattern
│   ├── agentRepository.ts
│   ├── evalRepository.ts
│   └── ...
```

### 2.3 Drizzle Configuration

```typescript
// drizzle.config.ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: process.env.CF_ACCOUNT_ID!,
    databaseId: process.env.D1_DATABASE_ID!,
    token: process.env.CF_API_TOKEN!,
  },
} satisfies Config;
```

### 2.4 Database Client Initialization

```typescript
// src/db/index.ts
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Database = ReturnType<typeof createDb>;
```

---

## Part 3: Schema Definitions

### 3.1 Priority Order (by query frequency & dependencies)

1. **Core (Week 1):** users, workspaces, workspace_members
2. **Agents (Week 1):** agents, agent_versions, functions, agent_functions
3. **Traces (Week 2):** integrations, traces, feedback, system_prompts
4. **Evals (Week 2):** evals, eval_executions, eval_candidates, eval_candidate_executions, eval_cv_results
5. **Jobs (Week 2):** jobs, job_retry_history
6. **Tasksets (Week 3):** tasksets, taskset_tasks, taskset_runs, taskset_run_results
7. **GEPA (Week 3):** gepa_runs, gepa_run_tasks, rollout_batches, rollout_results
8. **Tools (Week 3):** tools, agent_tools
9. **Monitoring (Week 4):** performance_snapshots, performance_alerts, refinement_history, auto_refine_cooldowns
10. **Playground (Week 4):** playground_sessions, playground_steps
11. **Task Enrichment (Week 4):** task_metadata, task_similar_traces, task_feedback_pairs, trace_summaries
12. **Cache (Week 4):** eval_llm_cache

### 3.2 Example Schema: Agents

```typescript
// src/db/schema/agents.ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const agentStatus = ['discovered', 'confirmed', 'archived'] as const;
export type AgentStatus = typeof agentStatus[number];

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status', { enum: agentStatus }).default('discovered').notNull(),
  activeVersionId: text('active_version_id'),
  activeEvalId: text('active_eval_id').references(() => evalCandidates.id),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  workspaceIdx: index('idx_agents_workspace_id').on(table.workspaceId),
  statusIdx: index('idx_agents_status').on(table.status),
  activeEvalIdx: index('idx_agents_active_eval').on(table.activeEvalId),
}));

export const agentVersionSource = ['discovered', 'manual', 'ai_improved'] as const;
export const agentVersionStatus = ['candidate', 'active', 'rejected', 'archived'] as const;

export const agentVersions = sqliteTable('agent_versions', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id),
  version: integer('version').notNull(),
  promptTemplate: text('prompt_template').notNull(),
  variables: text('variables', { mode: 'json' }).$type<string[]>(),
  source: text('source', { enum: agentVersionSource }).notNull(),
  parentVersionId: text('parent_version_id'),
  accuracy: integer('accuracy'),
  status: text('status', { enum: agentVersionStatus }).default('candidate').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  agentIdx: index('idx_agent_versions_agent_id').on(table.agentId),
  statusIdx: index('idx_agent_versions_status').on(table.status),
  uniqueVersion: index('unique_agent_version').on(table.agentId, table.version),
}));

// Type exports for use in application code
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type AgentVersion = typeof agentVersions.$inferSelect;
export type NewAgentVersion = typeof agentVersions.$inferInsert;
```

### 3.3 Relations Definition

```typescript
// src/db/schema/relations.ts
import { relations } from 'drizzle-orm';
import { agents, agentVersions, traces, feedback, evalCandidates } from './index';

export const agentsRelations = relations(agents, ({ one, many }) => ({
  activeVersion: one(agentVersions, {
    fields: [agents.activeVersionId],
    references: [agentVersions.id],
  }),
  activeEval: one(evalCandidates, {
    fields: [agents.activeEvalId],
    references: [evalCandidates.id],
  }),
  versions: many(agentVersions),
  traces: many(traces),
}));

export const agentVersionsRelations = relations(agentVersions, ({ one, many }) => ({
  agent: one(agents, {
    fields: [agentVersions.agentId],
    references: [agents.id],
  }),
  parentVersion: one(agentVersions, {
    fields: [agentVersions.parentVersionId],
    references: [agentVersions.id],
  }),
  traces: many(traces),
}));
```

---

## Part 4: Query Migration Strategy

### 4.1 Migration Pattern (Per File)

For each file with raw SQL:

1. **Add Drizzle import alongside existing code**
2. **Create typed query helpers**
3. **Replace one query at a time**
4. **Test after each replacement**
5. **Remove old SQL after all queries migrated**

### 4.2 Example Migration: agents.ts

**Before (raw SQL):**
```typescript
const result = await env.DB.prepare(
  `SELECT * FROM agents WHERE id = ? AND workspace_id = ?`
).bind(agentId, workspaceId).first();

if (!result) return null;
return {
  id: result.id as string,
  workspace_id: result.workspace_id as string,
  // ... manual type casting
};
```

**After (Drizzle):**
```typescript
import { eq, and } from 'drizzle-orm';
import { createDb } from '../db';
import { agents } from '../db/schema';

const db = createDb(env.DB);

const result = await db.query.agents.findFirst({
  where: and(
    eq(agents.id, agentId),
    eq(agents.workspaceId, workspaceId)
  ),
  with: {
    activeVersion: true,
    activeEval: true,
  },
});

// Result is already typed as Agent | undefined
```

### 4.3 Files to Migrate (Priority Order)

| Priority | File | Queries | Complexity | Dependencies |
|----------|------|---------|------------|--------------|
| 1 | `src/jobs/job-manager.ts` | 8 | Low | jobs |
| 2 | `src/api/feedback.ts` | 10 | Low | feedback, agents, traces |
| 3 | `src/api/tools.ts` | 12 | Low | tools, agent_tools, agents |
| 4 | `src/api/tasksets.ts` | 15 | Medium | tasksets, taskset_tasks, taskset_runs |
| 5 | `src/api/agents.ts` | 25+ | High | agents, agent_versions, functions, traces |
| 6 | `src/api/traces.ts` | 20+ | High | traces, integrations, feedback |
| 7 | `src/api/evals.ts` | 15+ | High | evals, feedback, agents |
| 8 | `src/api/eval-generation.ts` | 20+ | High | eval_candidates, task_metadata, traces |
| 9 | `src/api/matrix.ts` | 5 | Medium | eval_executions, eval_candidates |
| 10 | `src/jobs/eval-execution-job.ts` | 5 | Medium | evals, eval_executions, traces |

---

## Part 5: Testing Strategy

### 5.1 Test Database Setup

```typescript
// src/db/test-utils.ts
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

export function createTestDb() {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });

  // Run migrations
  migrate(db, { migrationsFolder: './src/db/migrations' });

  return { db, sqlite };
}

export function cleanupTestDb(sqlite: Database.Database) {
  sqlite.close();
}
```

### 5.2 Update vitest.config.ts

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'frontend/**', '.tmp/**'],
    setupFiles: ['./src/db/test-setup.ts'], // Add setup file
  },
});
```

### 5.3 Example Test with Real DB

```typescript
// src/api/agents.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, cleanupTestDb } from '../db/test-utils';
import { agents } from '../db/schema';
import { eq } from 'drizzle-orm';

describe('Agents API', () => {
  let db: ReturnType<typeof createTestDb>['db'];
  let sqlite: ReturnType<typeof createTestDb>['sqlite'];

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    sqlite = testDb.sqlite;
  });

  afterEach(() => {
    cleanupTestDb(sqlite);
  });

  it('should create an agent', async () => {
    const newAgent = await db.insert(agents).values({
      id: 'agent_test_123',
      workspaceId: 'workspace_default',
      name: 'Test Agent',
      status: 'discovered',
    }).returning();

    expect(newAgent[0].id).toBe('agent_test_123');
  });
});
```

---

## Part 6: Migration Process

### 6.1 Drizzle Migration Workflow

```bash
# Generate migration from schema changes
pnpm drizzle-kit generate

# Apply migrations to local D1
pnpm drizzle-kit migrate

# Push schema directly (development only)
pnpm drizzle-kit push
```

### 6.2 Update docker/init-db.sh

```bash
#!/bin/sh
# Docker development database initialization script

set -e
PERSIST_PATH="/app/.wrangler/state"

echo "🔧 Checking database initialization..."

# Check if using Drizzle migrations
if [ -d "/app/src/db/migrations" ]; then
  echo "📦 Applying Drizzle migrations..."
  # Drizzle migrations are applied via the app startup
  # or use drizzle-kit migrate command
else
  # Legacy: Apply schema.sql and manual migrations
  echo "📦 Applying legacy schema..."
  npx wrangler d1 execute DB --local --file=/app/schema.sql --persist-to=$PERSIST_PATH
fi

# Seed data
echo "🌱 Ensuring seed data exists..."
npx wrangler d1 execute DB --local --file=/app/docker/init-db.sql --persist-to=$PERSIST_PATH
echo "✅ Database initialization complete"
```

### 6.3 Add package.json Scripts

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

---

## Part 7: Rollout Plan

### Phase 1: Foundation (Week 1)
- [ ] Create migration 019 to resolve eval_executions conflict
- [ ] Install Drizzle dependencies
- [ ] Create schema definitions for core tables (users, workspaces, agents)
- [ ] Setup Drizzle configuration
- [ ] Create database client wrapper

### Phase 2: Schema Completion (Week 2)
- [ ] Complete all 43 table schemas
- [ ] Define all relations
- [ ] Generate initial Drizzle migration from existing DB
- [ ] Verify schema matches existing data

### Phase 3: Query Migration - Low Risk (Week 3)
- [ ] Migrate `job-manager.ts` (8 queries)
- [ ] Migrate `feedback.ts` (10 queries)
- [ ] Migrate `tools.ts` (12 queries)
- [ ] Add tests for migrated code

### Phase 4: Query Migration - Medium Risk (Week 4)
- [ ] Migrate `tasksets.ts` (15 queries)
- [ ] Migrate `matrix.ts` (5 queries)
- [ ] Update E2E tests

### Phase 5: Query Migration - High Risk (Week 5-6)
- [ ] Migrate `agents.ts` (25+ queries)
- [ ] Migrate `traces.ts` (20+ queries)
- [ ] Migrate `evals.ts` (15+ queries)
- [ ] Migrate `eval-generation.ts` (20+ queries)

### Phase 6: Cleanup & Documentation (Week 7)
- [ ] Remove legacy SQL files
- [ ] Update CLAUDE.md with new commands
- [ ] Create developer documentation
- [ ] Performance testing

---

## Part 8: Risk Mitigation

### 8.1 Rollback Strategy
- Keep raw SQL alongside Drizzle during migration
- Feature flag to switch between implementations
- Database schema unchanged (only access layer changes)

### 8.2 Performance Considerations
- Drizzle generates efficient SQL
- Test query plans before/after migration
- Monitor D1 metrics during rollout

### 8.3 Known Gotchas
- D1 doesn't support transactions (Drizzle batch operations)
- JSON columns need explicit type casting
- DATETIME stored as TEXT in SQLite

---

## Appendix A: Table Count Summary

| Category | Tables | Status |
|----------|--------|--------|
| User Management | 3 | Need types |
| Agent System | 5 | Good types |
| Trace System | 4 | Partial types |
| Eval System | 6 | Good types |
| Job System | 2 | Good types |
| Taskset System | 4 | Good types |
| GEPA System | 4 | Need types |
| Tool System | 2 | Need types |
| Monitoring | 4 | Need types |
| Playground | 2 | Need types |
| Task Enrichment | 4 | Need types |
| Cache | 1 | Need types |
| **Total** | **43** | |

---

## Appendix B: Files with Raw SQL (55 total)

- `src/api/agents.ts` - 25+ queries
- `src/api/traces.ts` - 20+ queries
- `src/api/evals.ts` - 15+ queries
- `src/api/eval-generation.ts` - 20+ queries
- `src/api/feedback.ts` - 10 queries
- `src/api/tools.ts` - 12 queries
- `src/api/tasksets.ts` - 15 queries
- `src/api/matrix.ts` - 5 queries
- `src/jobs/job-manager.ts` - 8 queries
- `src/jobs/eval-execution-job.ts` - 5 queries
- `src/services/eval/winner-selector.ts` - 3 queries
- Plus 44 other files with occasional queries
