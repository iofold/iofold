# Drizzle ORM Phase 1: Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up Drizzle ORM infrastructure with core schema definitions and migrate one simple file (job-manager.ts) as proof of concept.

**Architecture:** Install Drizzle ORM with D1 adapter, create TypeScript schema definitions mirroring existing SQL tables, establish the database client pattern, then migrate the simplest DB-accessing file to validate the approach.

**Tech Stack:** drizzle-orm, drizzle-kit, @cloudflare/workers-types, D1 (SQLite)

---

## Task 1: Resolve eval_executions Schema Conflict

**Files:**
- Create: `migrations/019_rename_gepa_eval_executions.sql`
- Modify: `src/api/matrix.ts` (lines referencing eval_executions)

**Step 1: Create migration file**

Create `migrations/019_rename_gepa_eval_executions.sql`:

```sql
-- Migration 019: Resolve eval_executions naming collision
-- The GEPA flow uses eval_candidate_id while legacy uses eval_id
-- Rename GEPA version to avoid conflicts
-- Created: 2025-12-14

-- Step 1: Create new table with correct name
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

-- Step 2: Copy data from eval_executions if it has GEPA columns
-- This handles the case where migration 012 was partially applied
INSERT OR IGNORE INTO eval_candidate_executions (
  id, eval_candidate_id, trace_id, score, feedback, success,
  error, duration_ms, llm_calls, llm_cost_usd, cache_hits, created_at
)
SELECT
  id, eval_candidate_id, trace_id, score, feedback, success,
  error, duration_ms, llm_calls, llm_cost_usd, cache_hits, created_at
FROM eval_executions
WHERE eval_candidate_id IS NOT NULL;

-- Step 3: Create indexes
CREATE INDEX IF NOT EXISTS idx_eval_candidate_executions_candidate
  ON eval_candidate_executions(eval_candidate_id);
CREATE INDEX IF NOT EXISTS idx_eval_candidate_executions_trace
  ON eval_candidate_executions(trace_id);
CREATE INDEX IF NOT EXISTS idx_eval_candidate_executions_created
  ON eval_candidate_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_candidate_executions_success
  ON eval_candidate_executions(success);
```

**Step 2: Apply migration to Docker**

Run:
```bash
docker exec iofold-backend npx wrangler d1 execute DB --local --file=/app/migrations/019_rename_gepa_eval_executions.sql --persist-to=/app/.wrangler/state
```

Expected: `commands executed successfully`

**Step 3: Update matrix.ts to use new table name**

In `src/api/matrix.ts`, replace all occurrences of `eval_executions` (in GEPA context) with `eval_candidate_executions`. The queries at lines ~318-333, ~556-572, ~639-652, ~728-747 reference `ee.eval_candidate_id` - these should use the new table.

**Step 4: Verify the API still works**

Run:
```bash
curl http://localhost:8787/health
```

Expected: `{"status":"healthy"}`

**Step 5: Commit**

```bash
git add migrations/019_rename_gepa_eval_executions.sql src/api/matrix.ts
git commit -m "fix(db): rename GEPA eval_executions to eval_candidate_executions

Resolves schema conflict between legacy eval flow (eval_id) and
GEPA candidate flow (eval_candidate_id) which both used the same table name."
```

---

## Task 2: Install Drizzle Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install drizzle-orm and drizzle-kit**

Run:
```bash
pnpm add drizzle-orm
pnpm add -D drizzle-kit
```

Expected: Dependencies added to package.json

**Step 2: Verify installation**

Run:
```bash
pnpm list drizzle-orm drizzle-kit
```

Expected: Shows drizzle-orm and drizzle-kit versions

**Step 3: Add database scripts to package.json**

Edit `package.json` scripts section to add:

```json
{
  "scripts": {
    "dev": "wrangler dev --port 8787 --ip 0.0.0.0",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add drizzle-orm and drizzle-kit"
```

---

## Task 3: Create Drizzle Configuration

**Files:**
- Create: `drizzle.config.ts`

**Step 1: Create drizzle.config.ts**

Create `drizzle.config.ts` in project root:

```typescript
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema/index.ts',
  out: './src/db/drizzle-migrations',
  dialect: 'sqlite',
} satisfies Config;
```

**Step 2: Verify config is valid**

Run:
```bash
pnpm drizzle-kit check
```

Expected: No errors (may warn about missing schema file - that's OK)

**Step 3: Commit**

```bash
git add drizzle.config.ts
git commit -m "chore(db): add drizzle-kit configuration"
```

---

## Task 4: Create Schema Directory Structure

**Files:**
- Create: `src/db/schema/index.ts`
- Create: `src/db/schema/enums.ts`

**Step 1: Create enums file**

Create `src/db/schema/enums.ts`:

```typescript
// src/db/schema/enums.ts
// Shared enum values used across multiple tables

// Agent-related enums
export const agentStatus = ['discovered', 'confirmed', 'archived'] as const;
export type AgentStatus = (typeof agentStatus)[number];

export const agentVersionStatus = ['candidate', 'active', 'rejected', 'archived'] as const;
export type AgentVersionStatus = (typeof agentVersionStatus)[number];

export const agentVersionSource = ['discovered', 'manual', 'ai_improved'] as const;
export type AgentVersionSource = (typeof agentVersionSource)[number];

// Job-related enums
export const jobType = [
  'import', 'generate', 'execute', 'monitor', 'auto_refine',
  'agent_discovery', 'prompt_improvement', 'prompt_evaluation',
  'template_drift', 'eval_revalidation', 'taskset_run'
] as const;
export type JobType = (typeof jobType)[number];

export const jobStatus = ['queued', 'running', 'completed', 'failed', 'cancelled'] as const;
export type JobStatus = (typeof jobStatus)[number];

// Feedback-related enums
export const feedbackRating = ['positive', 'negative', 'neutral'] as const;
export type FeedbackRating = (typeof feedbackRating)[number];

// Eval-related enums
export const evalStatus = ['draft', 'active', 'archived'] as const;
export type EvalStatus = (typeof evalStatus)[number];

export const evalCandidateStatus = ['candidate', 'testing', 'active', 'archived'] as const;
export type EvalCandidateStatus = (typeof evalCandidateStatus)[number];

// Taskset-related enums
export const tasksetStatus = ['active', 'archived'] as const;
export type TasksetStatus = (typeof tasksetStatus)[number];

export const tasksetRunStatus = ['queued', 'running', 'completed', 'partial', 'failed', 'cancelled'] as const;
export type TasksetRunStatus = (typeof tasksetRunStatus)[number];

export const tasksetTaskSource = ['trace', 'manual', 'imported'] as const;
export type TasksetTaskSource = (typeof tasksetTaskSource)[number];

export const tasksetRunResultStatus = ['pending', 'completed', 'failed', 'timeout'] as const;
export type TasksetRunResultStatus = (typeof tasksetRunResultStatus)[number];

// Function-related enums
export const functionType = ['template_extractor', 'template_injector', 'eval'] as const;
export type FunctionType = (typeof functionType)[number];

export const functionStatus = ['active', 'archived', 'failed'] as const;
export type FunctionStatus = (typeof functionStatus)[number];

export const functionRole = ['extractor', 'injector'] as const;
export type FunctionRole = (typeof functionRole)[number];

// Trace-related enums
export const traceSource = ['langfuse', 'langsmith', 'openai', 'playground'] as const;
export type TraceSource = (typeof traceSource)[number];

export const traceAssignmentStatus = ['unassigned', 'assigned', 'orphaned'] as const;
export type TraceAssignmentStatus = (typeof traceAssignmentStatus)[number];

// Integration-related enums
export const integrationPlatform = ['langfuse', 'langsmith', 'openai'] as const;
export type IntegrationPlatform = (typeof integrationPlatform)[number];

export const integrationStatus = ['active', 'error'] as const;
export type IntegrationStatus = (typeof integrationStatus)[number];

// Tool-related enums
export const toolCategory = ['general', 'code', 'filesystem', 'email'] as const;
export type ToolCategory = (typeof toolCategory)[number];

// GEPA-related enums
export const gepaSplit = ['train', 'val', 'test'] as const;
export type GepaSplit = (typeof gepaSplit)[number];

export const gepaRunStatus = ['pending', 'running', 'completed', 'failed', 'cancelled'] as const;
export type GepaRunStatus = (typeof gepaRunStatus)[number];
```

**Step 2: Create index file (placeholder)**

Create `src/db/schema/index.ts`:

```typescript
// src/db/schema/index.ts
// Export all schema definitions

// Enums
export * from './enums';

// Tables will be added as we create them:
// export * from './users';
// export * from './agents';
// export * from './jobs';
// etc.
```

**Step 3: Verify TypeScript compiles**

Run:
```bash
pnpm exec tsc --noEmit
```

Expected: No errors

**Step 4: Commit**

```bash
git add src/db/schema/
git commit -m "feat(db): add Drizzle schema directory structure and enums"
```

---

## Task 5: Create Jobs Schema (First Table)

**Files:**
- Create: `src/db/schema/jobs.ts`
- Modify: `src/db/schema/index.ts`

**Step 1: Create jobs schema**

Create `src/db/schema/jobs.ts`:

```typescript
// src/db/schema/jobs.ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { jobType, jobStatus } from './enums';

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  type: text('type', { enum: jobType }).notNull(),
  status: text('status', { enum: jobStatus }).default('queued').notNull(),
  progress: integer('progress').default(0).notNull(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  result: text('result', { mode: 'json' }).$type<Record<string, unknown>>(),
  error: text('error'),
  retryCount: integer('retry_count').default(0),
  maxRetries: integer('max_retries').default(5),
  errorCategory: text('error_category'),
  lastErrorAt: text('last_error_at'),
  nextRetryAt: text('next_retry_at'),
  priority: integer('priority').default(0),
  agentId: text('agent_id'),
  agentVersionId: text('agent_version_id'),
  triggerEvent: text('trigger_event'),
  triggerThreshold: text('trigger_threshold'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
}, (table) => ({
  workspaceIdx: index('idx_jobs_workspace').on(table.workspaceId),
  statusIdx: index('idx_jobs_status').on(table.status),
  typeIdx: index('idx_jobs_type').on(table.type),
  createdAtIdx: index('idx_jobs_created_at').on(table.createdAt),
  workspaceStatusIdx: index('idx_jobs_workspace_status').on(table.workspaceId, table.status),
}));

export const jobRetryHistory = sqliteTable('job_retry_history', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull().references(() => jobs.id),
  attempt: integer('attempt').notNull(),
  error: text('error').notNull(),
  errorCategory: text('error_category').notNull(),
  delayMs: integer('delay_ms').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  jobIdx: index('idx_job_retry_history_job').on(table.jobId),
  createdAtIdx: index('idx_job_retry_history_created_at').on(table.createdAt),
}));

// Type exports
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type JobRetryHistory = typeof jobRetryHistory.$inferSelect;
export type NewJobRetryHistory = typeof jobRetryHistory.$inferInsert;
```

**Step 2: Export from index**

Update `src/db/schema/index.ts`:

```typescript
// src/db/schema/index.ts
// Export all schema definitions

// Enums
export * from './enums';

// Tables
export * from './jobs';
```

**Step 3: Verify TypeScript compiles**

Run:
```bash
pnpm exec tsc --noEmit
```

Expected: No errors

**Step 4: Commit**

```bash
git add src/db/schema/jobs.ts src/db/schema/index.ts
git commit -m "feat(db): add Drizzle schema for jobs and job_retry_history tables"
```

---

## Task 6: Create Database Client

**Files:**
- Create: `src/db/client.ts`
- Modify: `src/db/schema/index.ts`

**Step 1: Create database client**

Create `src/db/client.ts`:

```typescript
// src/db/client.ts
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

/**
 * Create a Drizzle database client from a D1 binding
 * @param d1 - The D1Database binding from Cloudflare Workers
 * @returns Drizzle ORM client with full schema
 */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

/** Type alias for the Drizzle database client */
export type Database = ReturnType<typeof createDb>;

/**
 * Helper to get typed database from environment
 * Use this in request handlers:
 *
 * @example
 * ```typescript
 * const db = getDb(env.DB);
 * const jobs = await db.query.jobs.findMany();
 * ```
 */
export function getDb(d1: D1Database): Database {
  return createDb(d1);
}
```

**Step 2: Verify TypeScript compiles**

Run:
```bash
pnpm exec tsc --noEmit
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/db/client.ts
git commit -m "feat(db): add Drizzle database client wrapper"
```

---

## Task 7: Create Users/Workspaces Schema

**Files:**
- Create: `src/db/schema/users.ts`
- Modify: `src/db/schema/index.ts`

**Step 1: Create users schema**

Create `src/db/schema/users.ts`:

```typescript
// src/db/schema/users.ts
import { sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const workspaceRole = ['owner', 'admin', 'member'] as const;
export type WorkspaceRole = (typeof workspaceRole)[number];

export const workspaceMembers = sqliteTable('workspace_members', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  userId: text('user_id').notNull().references(() => users.id),
  role: text('role', { enum: workspaceRole }).default('member').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  uniqueMember: uniqueIndex('unique_workspace_member').on(table.workspaceId, table.userId),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type NewWorkspaceMember = typeof workspaceMembers.$inferInsert;
```

**Step 2: Export from index**

Update `src/db/schema/index.ts`:

```typescript
// src/db/schema/index.ts
// Export all schema definitions

// Enums
export * from './enums';

// Tables
export * from './users';
export * from './jobs';
```

**Step 3: Verify TypeScript compiles**

Run:
```bash
pnpm exec tsc --noEmit
```

Expected: No errors

**Step 4: Commit**

```bash
git add src/db/schema/users.ts src/db/schema/index.ts
git commit -m "feat(db): add Drizzle schema for users, workspaces, workspace_members"
```

---

## Task 8: Migrate job-manager.ts to Drizzle (Proof of Concept)

**Files:**
- Modify: `src/jobs/job-manager.ts`
- Modify: `src/jobs/job-manager.test.ts`

**Step 1: Read current job-manager.ts implementation**

Review the file to understand current patterns before modifying.

**Step 2: Update test file to use real DB**

Update `src/jobs/job-manager.test.ts` to add a Drizzle-based test:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JobManager, JobType, JobStatus } from './job-manager';

// Keep existing mock tests for backward compatibility
describe('JobManager (mocked)', () => {
  // ... existing tests ...
});

// Add new Drizzle integration test (skipped until we have test DB setup)
describe.skip('JobManager (Drizzle)', () => {
  it('should create a job with Drizzle', async () => {
    // TODO: Add real DB test when test infrastructure is ready
  });
});
```

**Step 3: Create Drizzle-based job-manager**

Create `src/jobs/job-manager-drizzle.ts` (new file, parallel implementation):

```typescript
// src/jobs/job-manager-drizzle.ts
// Drizzle-based JobManager - parallel implementation for migration
import { eq, and, desc } from 'drizzle-orm';
import { Database, getDb } from '../db/client';
import { jobs, Job, NewJob } from '../db/schema';
import type { JobType, JobStatus } from '../db/schema/enums';

export class JobManagerDrizzle {
  private db: Database;

  constructor(d1: D1Database) {
    this.db = getDb(d1);
  }

  async createJob(params: {
    id: string;
    workspaceId: string;
    type: JobType;
    metadata?: Record<string, unknown>;
    agentId?: string;
    agentVersionId?: string;
  }): Promise<Job> {
    const [job] = await this.db.insert(jobs).values({
      id: params.id,
      workspaceId: params.workspaceId,
      type: params.type,
      status: 'queued',
      progress: 0,
      metadata: params.metadata,
      agentId: params.agentId,
      agentVersionId: params.agentVersionId,
    }).returning();

    return job;
  }

  async getJob(id: string): Promise<Job | null> {
    const result = await this.db.query.jobs.findFirst({
      where: eq(jobs.id, id),
    });
    return result ?? null;
  }

  async updateJobStatus(
    id: string,
    status: JobStatus,
    updates?: {
      progress?: number;
      result?: Record<string, unknown>;
      error?: string;
    }
  ): Promise<Job | null> {
    const updateData: Partial<NewJob> = { status };

    if (status === 'running' && !updates?.progress) {
      updateData.startedAt = new Date().toISOString();
    }
    if (status === 'completed' || status === 'failed') {
      updateData.completedAt = new Date().toISOString();
    }
    if (updates?.progress !== undefined) {
      updateData.progress = updates.progress;
    }
    if (updates?.result !== undefined) {
      updateData.result = updates.result;
    }
    if (updates?.error !== undefined) {
      updateData.error = updates.error;
    }

    const [updated] = await this.db
      .update(jobs)
      .set(updateData)
      .where(eq(jobs.id, id))
      .returning();

    return updated ?? null;
  }

  async listJobs(params: {
    workspaceId: string;
    status?: JobStatus;
    type?: JobType;
    limit?: number;
  }): Promise<Job[]> {
    const conditions = [eq(jobs.workspaceId, params.workspaceId)];

    if (params.status) {
      conditions.push(eq(jobs.status, params.status));
    }
    if (params.type) {
      conditions.push(eq(jobs.type, params.type));
    }

    return this.db.query.jobs.findMany({
      where: and(...conditions),
      orderBy: [desc(jobs.createdAt)],
      limit: params.limit ?? 50,
    });
  }
}
```

**Step 4: Verify TypeScript compiles**

Run:
```bash
pnpm exec tsc --noEmit
```

Expected: No errors

**Step 5: Commit**

```bash
git add src/jobs/job-manager-drizzle.ts src/jobs/job-manager.test.ts
git commit -m "feat(db): add Drizzle-based JobManager implementation

Parallel implementation to validate Drizzle migration approach.
Original job-manager.ts unchanged for safety."
```

---

## Task 9: Verify End-to-End

**Step 1: Rebuild Docker**

Run:
```bash
docker compose down && docker compose up -d --build
```

Expected: Containers start successfully

**Step 2: Check migrations applied**

Run:
```bash
docker exec iofold-backend npx wrangler d1 execute DB --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name='eval_candidate_executions';" --persist-to=/app/.wrangler/state
```

Expected: Shows `eval_candidate_executions` table

**Step 3: Run tests**

Run:
```bash
pnpm test
```

Expected: All tests pass

**Step 4: Final commit for Phase 1**

```bash
git add -A
git commit -m "chore(db): complete Drizzle Phase 1 foundation setup

- Resolved eval_executions schema conflict
- Installed drizzle-orm and drizzle-kit
- Created schema definitions for jobs, users, workspaces
- Added database client wrapper
- Created Drizzle-based JobManager proof of concept"
```

---

## Summary

Phase 1 establishes the foundation:
- Schema conflict resolved
- Drizzle installed and configured
- Core schemas defined (jobs, users, workspaces)
- Database client pattern established
- Proof of concept JobManager implementation

**Next Phase:** Create remaining schemas (agents, traces, evals, tasksets) and migrate more API files.
