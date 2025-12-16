// src/db/schema/traces.ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { traceSource, traceAssignmentStatus } from './enums';
import { workspaces } from './users';
import { integrations } from './integrations';
import { agentVersions } from './agents';
import { systemPrompts } from './prompts';

export const traces = sqliteTable('traces', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  // Nullable for internal sources (playground, taskset) that don't have an external integration
  integrationId: text('integration_id').references(() => integrations.id, { onDelete: 'cascade' }),
  traceId: text('trace_id').notNull(),
  source: text('source', { enum: traceSource }).notNull(),
  timestamp: text('timestamp').notNull(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  steps: text('steps', { mode: 'json' }).notNull().$type<unknown[]>(),
  // OpenInference format (new columns for migration)
  spans: text('spans', { mode: 'json' }).$type<unknown[]>(),
  totalTokens: integer('total_tokens'),
  totalDurationMs: integer('total_duration_ms'),
  spanCount: integer('span_count'),
  rawData: text('raw_data', { mode: 'json' }).$type<unknown>(),
  inputPreview: text('input_preview'),
  outputPreview: text('output_preview'),
  stepCount: integer('step_count').default(0),
  hasErrors: integer('has_errors', { mode: 'boolean' }).default(false),
  agentVersionId: text('agent_version_id').references(() => agentVersions.id),
  assignmentStatus: text('assignment_status', { enum: traceAssignmentStatus }).default('unassigned').notNull(),
  systemPromptId: text('system_prompt_id').references(() => systemPrompts.id),
  importedAt: text('imported_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  workspaceIdx: index('idx_traces_workspace_id').on(table.workspaceId),
  integrationIdx: index('idx_traces_integration_id').on(table.integrationId),
  traceIdIdx: index('idx_traces_trace_id').on(table.traceId),
  agentVersionIdx: index('idx_traces_agent_version_id').on(table.agentVersionId),
  assignmentStatusIdx: index('idx_traces_assignment_status').on(table.assignmentStatus),
  systemPromptIdx: index('idx_traces_system_prompt').on(table.systemPromptId),
  importedAtIdx: index('idx_traces_imported_at').on(table.importedAt),
}));

export const traceSummaries = sqliteTable('trace_summaries', {
  traceId: text('trace_id').primaryKey().references(() => traces.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),
  keyBehaviors: text('key_behaviors', { mode: 'json' }).$type<string[]>(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  createdAtIdx: index('idx_trace_summaries_created').on(table.createdAt),
}));

// Type exports
export type Trace = typeof traces.$inferSelect;
export type NewTrace = typeof traces.$inferInsert;
export type TraceSummary = typeof traceSummaries.$inferSelect;
export type NewTraceSummary = typeof traceSummaries.$inferInsert;
