// src/db/schema/playground.ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './users';
import { agents, agentVersions } from './agents';
import { traces } from './traces';

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

export const playgroundSteps = sqliteTable('playground_steps', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => playgroundSessions.id, { onDelete: 'cascade' }),
  traceId: text('trace_id').notNull().references(() => traces.id, { onDelete: 'cascade' }),
  stepIndex: integer('step_index').notNull(),
  stepType: text('step_type', { enum: ['llm_call', 'tool_call', 'tool_result'] }).notNull(),
  input: text('input'),
  output: text('output'),
  toolName: text('tool_name'),
  toolArgs: text('tool_args'),
  toolResult: text('tool_result'),
  toolError: text('tool_error'),
  latencyMs: integer('latency_ms'),
  tokensInput: integer('tokens_input'),
  tokensOutput: integer('tokens_output'),
  timestamp: text('timestamp').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  sessionIdx: index('idx_playground_steps_session').on(table.sessionId),
  traceIdx: index('idx_playground_steps_trace').on(table.traceId),
  sessionIndexIdx: index('idx_playground_steps_session_index').on(table.sessionId, table.stepIndex),
  timestampIdx: index('idx_playground_steps_timestamp').on(table.timestamp),
}));

// Type exports
export type PlaygroundSession = typeof playgroundSessions.$inferSelect;
export type NewPlaygroundSession = typeof playgroundSessions.$inferInsert;
export type PlaygroundStep = typeof playgroundSteps.$inferSelect;
export type NewPlaygroundStep = typeof playgroundSteps.$inferInsert;
