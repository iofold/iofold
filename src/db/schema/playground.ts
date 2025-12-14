// src/db/schema/playground.ts
import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './users';
import { agents, agentVersions } from './agents';

export const playgroundSessions = sqliteTable('playground_sessions', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  agentVersionId: text('agent_version_id').notNull().references(() => agentVersions.id, { onDelete: 'cascade' }),
  messages: text('messages', { mode: 'json' }).notNull().default('[]').$type<unknown[]>(),
  variables: text('variables', { mode: 'json' }).notNull().default('{}').$type<Record<string, unknown>>(),
  files: text('files', { mode: 'json' }).notNull().default('{}').$type<Record<string, unknown>>(),
  modelProvider: text('model_provider', { enum: ['anthropic', 'openai', 'google'] }).notNull(),
  modelId: text('model_id').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  workspaceIdx: index('idx_playground_sessions_workspace').on(table.workspaceId),
  agentIdx: index('idx_playground_sessions_agent').on(table.agentId),
  agentVersionIdx: index('idx_playground_sessions_agent_version').on(table.agentVersionId),
  updatedIdx: index('idx_playground_sessions_updated').on(table.updatedAt),
}));

// Type exports
export type PlaygroundSession = typeof playgroundSessions.$inferSelect;
export type NewPlaygroundSession = typeof playgroundSessions.$inferInsert;
