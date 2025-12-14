// src/db/schema/monitoring.ts
import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { evals } from './evals';
import { systemPrompts } from './prompts';
import { jobs } from './jobs';

export const performanceAlerts = sqliteTable('performance_alerts', {
  id: text('id').primaryKey(),
  evalId: text('eval_id').notNull().references(() => evals.id, { onDelete: 'cascade' }),
  alertType: text('alert_type', {
    enum: ['accuracy_drop', 'contradiction_spike', 'error_spike', 'prompt_drift', 'insufficient_data']
  }).notNull(),
  severity: text('severity', { enum: ['info', 'warning', 'critical'] }).default('warning').notNull(),
  currentValue: real('current_value'),
  thresholdValue: real('threshold_value'),
  message: text('message').notNull(),
  promptId: text('prompt_id').references(() => systemPrompts.id),
  triggeredAt: text('triggered_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  acknowledgedAt: text('acknowledged_at'),
  acknowledgedBy: text('acknowledged_by'),
  resolvedAt: text('resolved_at'),
  resolvedBy: text('resolved_by'),
  autoActionTaken: text('auto_action_taken', {
    enum: ['none', 'auto_refine_queued', 'auto_refine_completed', 'auto_refine_failed']
  }),
  autoActionJobId: text('auto_action_job_id').references(() => jobs.id),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
}, (table) => ({
  typeIdx: index('idx_performance_alerts_type').on(table.alertType, table.triggeredAt),
  activeIdx: index('idx_performance_alerts_active').on(table.evalId, table.resolvedAt),
}));

export const performanceSnapshots = sqliteTable('performance_snapshots', {
  id: text('id').primaryKey(),
  evalId: text('eval_id').notNull().references(() => evals.id, { onDelete: 'cascade' }),
  snapshotDate: text('snapshot_date').notNull(),
  accuracy: real('accuracy'),
  executionCount: integer('execution_count').default(0),
  contradictionCount: integer('contradiction_count').default(0),
  errorCount: integer('error_count').default(0),
  passCount: integer('pass_count').default(0),
  failCount: integer('fail_count').default(0),
  promptDistribution: text('prompt_distribution', { mode: 'json' }).$type<Record<string, number>>(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  evalDateIdx: index('idx_performance_snapshots_eval_date').on(table.evalId, table.snapshotDate),
  evalDateUnique: uniqueIndex('performance_snapshots_eval_date_unique').on(table.evalId, table.snapshotDate),
}));

export const autoRefineCooldowns = sqliteTable('auto_refine_cooldowns', {
  id: text('id').primaryKey(),
  evalId: text('eval_id').notNull().references(() => evals.id, { onDelete: 'cascade' }),
  lastAttemptAt: text('last_attempt_at').notNull(),
  nextAllowedAt: text('next_allowed_at').notNull(),
  consecutiveFailures: integer('consecutive_failures').default(0),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  evalUnique: uniqueIndex('auto_refine_cooldowns_eval_unique').on(table.evalId),
}));

export const refinementHistory = sqliteTable('refinement_history', {
  id: text('id').primaryKey(),
  evalId: text('eval_id').notNull().references(() => evals.id, { onDelete: 'cascade' }),
  parentVersion: integer('parent_version'),
  newVersion: integer('new_version').notNull(),
  triggerType: text('trigger_type', { enum: ['manual', 'threshold', 'drift', 'scheduled'] }).notNull(),
  triggerAlertId: text('trigger_alert_id').references(() => performanceAlerts.id),
  triggerMetrics: text('trigger_metrics', { mode: 'json' }).$type<Record<string, unknown>>(),
  includeContradictions: integer('include_contradictions', { mode: 'boolean' }).default(true),
  customInstructions: text('custom_instructions'),
  resultAccuracy: real('result_accuracy'),
  improvementDelta: real('improvement_delta'),
  status: text('status', {
    enum: ['pending', 'running', 'completed', 'failed', 'rejected', 'deployed']
  }).default('pending').notNull(),
  jobId: text('job_id').references(() => jobs.id),
  rejectedAt: text('rejected_at'),
  rejectedBy: text('rejected_by'),
  rejectionReason: text('rejection_reason'),
  deployedAt: text('deployed_at'),
  deployedBy: text('deployed_by'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: text('completed_at'),
}, (table) => ({
  evalIdx: index('idx_refinement_history_eval').on(table.evalId, table.createdAt),
  statusIdx: index('idx_refinement_history_status').on(table.status, table.createdAt),
}));

// Type exports
export type PerformanceAlert = typeof performanceAlerts.$inferSelect;
export type NewPerformanceAlert = typeof performanceAlerts.$inferInsert;
export type PerformanceSnapshot = typeof performanceSnapshots.$inferSelect;
export type NewPerformanceSnapshot = typeof performanceSnapshots.$inferInsert;
export type AutoRefineCooldown = typeof autoRefineCooldowns.$inferSelect;
export type NewAutoRefineCooldown = typeof autoRefineCooldowns.$inferInsert;
export type RefinementHistory = typeof refinementHistory.$inferSelect;
export type NewRefinementHistory = typeof refinementHistory.$inferInsert;
