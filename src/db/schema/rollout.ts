// src/db/schema/rollout.ts
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './users';
import { agents } from './agents';

export const rolloutBatches = sqliteTable('rollout_batches', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  agentId: text('agent_id').notNull().references(() => agents.id),
  systemPrompt: text('system_prompt').notNull(),
  taskCount: integer('task_count').notNull(),
  status: text('status', {
    enum: ['queued', 'running', 'completed', 'partial', 'failed']
  }).default('queued').notNull(),
  config: text('config', { mode: 'json' }).default('{}').$type<Record<string, unknown>>(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: text('completed_at'),
}, (table) => ({
  workspaceIdx: index('idx_rollout_batches_workspace').on(table.workspaceId, table.status),
  createdIdx: index('idx_rollout_batches_created').on(table.createdAt),
}));

export const rolloutResults = sqliteTable('rollout_results', {
  id: text('id').primaryKey(),
  batchId: text('batch_id').notNull().references(() => rolloutBatches.id, { onDelete: 'cascade' }),
  taskId: text('task_id').notNull(),
  status: text('status', { enum: ['completed', 'failed', 'timeout'] }).notNull(),
  trace: text('trace', { mode: 'json' }).$type<unknown[]>(),
  error: text('error'),
  executionTimeMs: integer('execution_time_ms'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  batchIdx: index('idx_rollout_results_batch').on(table.batchId),
  batchTaskUnique: uniqueIndex('idx_rollout_results_task').on(table.batchId, table.taskId),
}));

// Type exports
export type RolloutBatch = typeof rolloutBatches.$inferSelect;
export type NewRolloutBatch = typeof rolloutBatches.$inferInsert;
export type RolloutResult = typeof rolloutResults.$inferSelect;
export type NewRolloutResult = typeof rolloutResults.$inferInsert;
