// src/db/schema/prompts.ts
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './users';

export const systemPrompts = sqliteTable('system_prompts', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  agentName: text('agent_name').notNull(),
  promptHash: text('prompt_hash').notNull(),
  content: text('content').notNull(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  firstSeenAt: text('first_seen_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  lastSeenAt: text('last_seen_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  traceCount: integer('trace_count').default(1),
}, (table) => ({
  hashIdx: index('idx_system_prompts_hash').on(table.promptHash),
  workspaceAgentIdx: index('idx_system_prompts_workspace_agent').on(table.workspaceId, table.agentName),
  workspaceHashUnique: uniqueIndex('system_prompts_workspace_hash_unique').on(table.workspaceId, table.promptHash),
}));

export const promptBestPractices = sqliteTable('prompt_best_practices', {
  id: text('id').primaryKey(),
  source: text('source', { enum: ['openai', 'anthropic', 'google'] }).notNull(),
  category: text('category', { enum: ['structure', 'clarity', 'safety', 'reasoning', 'general'] }).notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  url: text('url'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const promptIterations = sqliteTable('prompt_iterations', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  agentName: text('agent_name').notNull(),
  parentPromptId: text('parent_prompt_id').references(() => systemPrompts.id),
  currentPromptId: text('current_prompt_id').notNull().references(() => systemPrompts.id),
  iterationNumber: integer('iteration_number').default(1).notNull(),
  changeSummary: text('change_summary'),
  improvementMetrics: text('improvement_metrics', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  parentIdx: index('idx_prompt_iterations_parent').on(table.parentPromptId),
  workspaceAgentIdx: index('idx_prompt_iterations_workspace_agent').on(table.workspaceId, table.agentName),
}));

// Type exports
export type SystemPrompt = typeof systemPrompts.$inferSelect;
export type NewSystemPrompt = typeof systemPrompts.$inferInsert;
export type PromptBestPractice = typeof promptBestPractices.$inferSelect;
export type NewPromptBestPractice = typeof promptBestPractices.$inferInsert;
export type PromptIteration = typeof promptIterations.$inferSelect;
export type NewPromptIteration = typeof promptIterations.$inferInsert;
