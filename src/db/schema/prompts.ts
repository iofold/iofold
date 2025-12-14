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

// Type exports
export type SystemPrompt = typeof systemPrompts.$inferSelect;
export type NewSystemPrompt = typeof systemPrompts.$inferInsert;
