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
