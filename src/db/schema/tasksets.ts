// src/db/schema/tasksets.ts
import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { tasksetStatus, tasksetTaskSource, tasksetRunStatus, tasksetRunResultStatus } from './enums';
import { workspaces } from './users';
import { agents } from './agents';
import { traces } from './traces';

export const tasksets = sqliteTable('tasksets', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  agentId: text('agent_id').notNull().references(() => agents.id),
  name: text('name').notNull(),
  description: text('description'),
  taskCount: integer('task_count').default(0),
  status: text('status', { enum: tasksetStatus }).default('active').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  workspaceIdx: index('idx_tasksets_workspace').on(table.workspaceId, table.status),
  agentIdx: index('idx_tasksets_agent').on(table.agentId),
  createdIdx: index('idx_tasksets_created').on(table.createdAt),
}));

export const tasksetTasks = sqliteTable('taskset_tasks', {
  id: text('id').primaryKey(),
  tasksetId: text('taskset_id').notNull().references(() => tasksets.id, { onDelete: 'cascade' }),
  userMessage: text('user_message').notNull(),
  expectedOutput: text('expected_output'),
  source: text('source', { enum: tasksetTaskSource }).notNull(),
  sourceTraceId: text('source_trace_id').references(() => traces.id),
  contentHash: text('content_hash').notNull(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  tasksetIdx: index('idx_taskset_tasks_taskset').on(table.tasksetId),
  sourceIdx: index('idx_taskset_tasks_source').on(table.sourceTraceId),
  hashIdx: index('idx_taskset_tasks_hash').on(table.contentHash),
  tasksetHashUnique: uniqueIndex('taskset_tasks_taskset_hash_unique').on(table.tasksetId, table.contentHash),
}));

export const tasksetRuns = sqliteTable('taskset_runs', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  agentId: text('agent_id').notNull().references(() => agents.id),
  tasksetId: text('taskset_id').notNull().references(() => tasksets.id),
  status: text('status', { enum: tasksetRunStatus }).default('queued').notNull(),
  taskCount: integer('task_count').notNull(),
  completedCount: integer('completed_count').default(0),
  failedCount: integer('failed_count').default(0),
  modelProvider: text('model_provider').default('anthropic'),
  modelId: text('model_id').default('anthropic/claude-sonnet-4-5'),
  config: text('config', { mode: 'json' }).default('{}').$type<Record<string, unknown>>(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  error: text('error'),
}, (table) => ({
  workspaceIdx: index('idx_taskset_runs_workspace').on(table.workspaceId, table.status),
  tasksetIdx: index('idx_taskset_runs_taskset').on(table.tasksetId),
  createdIdx: index('idx_taskset_runs_created').on(table.createdAt),
}));

export const tasksetRunResults = sqliteTable('taskset_run_results', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => tasksetRuns.id, { onDelete: 'cascade' }),
  taskId: text('task_id').notNull().references(() => tasksetTasks.id),
  status: text('status', { enum: tasksetRunResultStatus }).notNull(),
  response: text('response'),
  expectedOutput: text('expected_output'),
  score: real('score'),
  scoreReason: text('score_reason'),
  traceId: text('trace_id'),
  executionTimeMs: integer('execution_time_ms'),
  error: text('error'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  runIdx: index('idx_taskset_run_results_run').on(table.runId),
  runTaskUnique: uniqueIndex('idx_taskset_run_results_task').on(table.runId, table.taskId),
}));

// Type exports
export type Taskset = typeof tasksets.$inferSelect;
export type NewTaskset = typeof tasksets.$inferInsert;
export type TasksetTask = typeof tasksetTasks.$inferSelect;
export type NewTasksetTask = typeof tasksetTasks.$inferInsert;
export type TasksetRun = typeof tasksetRuns.$inferSelect;
export type NewTasksetRun = typeof tasksetRuns.$inferInsert;
export type TasksetRunResult = typeof tasksetRunResults.$inferSelect;
export type NewTasksetRunResult = typeof tasksetRunResults.$inferInsert;
