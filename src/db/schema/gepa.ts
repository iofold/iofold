// src/db/schema/gepa.ts
import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { gepaRunStatus, gepaSplit } from './enums';
import { workspaces } from './users';
import { agents, agentVersions } from './agents';
import { evals } from './evals';
import { tasksets } from './tasksets';
import { tasksetTasks } from './tasksets';

export const gepaRuns = sqliteTable('gepa_runs', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  agentId: text('agent_id').notNull().references(() => agents.id),
  evalId: text('eval_id').references(() => evals.id),
  seedPrompt: text('seed_prompt').notNull(),
  testCaseCount: integer('test_case_count').notNull(),
  maxMetricCalls: integer('max_metric_calls').default(50),
  parallelism: integer('parallelism').default(5),
  status: text('status', { enum: gepaRunStatus }).default('pending').notNull(),
  progressMetricCalls: integer('progress_metric_calls').default(0),
  bestPrompt: text('best_prompt'),
  bestScore: real('best_score'),
  totalCandidates: integer('total_candidates').default(0),
  statePath: text('state_path'),
  error: text('error'),
  optimizedVersionId: text('optimized_version_id').references(() => agentVersions.id),
  tasksetId: text('taskset_id').references(() => tasksets.id),
  trainSplit: real('train_split').default(0.7),
  valSplit: real('val_split').default(0.3),
  randomSeed: integer('random_seed'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
}, (table) => ({
  workspaceIdx: index('idx_gepa_runs_workspace').on(table.workspaceId, table.status),
  agentIdx: index('idx_gepa_runs_agent').on(table.agentId),
  tasksetIdx: index('idx_gepa_runs_taskset').on(table.tasksetId),
  createdIdx: index('idx_gepa_runs_created').on(table.createdAt),
}));

export const gepaRunTasks = sqliteTable('gepa_run_tasks', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => gepaRuns.id, { onDelete: 'cascade' }),
  taskId: text('task_id').notNull().references(() => tasksetTasks.id),
  split: text('split', { enum: gepaSplit }).notNull(),
  score: real('score'),
}, (table) => ({
  runIdx: index('idx_gepa_run_tasks_run').on(table.runId),
  taskIdx: index('idx_gepa_run_tasks_task').on(table.taskId),
  splitIdx: index('idx_gepa_run_tasks_split').on(table.runId, table.split),
  runTaskUnique: uniqueIndex('gepa_run_tasks_run_task_unique').on(table.runId, table.taskId),
}));

// Type exports
export type GepaRun = typeof gepaRuns.$inferSelect;
export type NewGepaRun = typeof gepaRuns.$inferInsert;
export type GepaRunTask = typeof gepaRunTasks.$inferSelect;
export type NewGepaRunTask = typeof gepaRunTasks.$inferInsert;
