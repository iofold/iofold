// src/db/schema/agents.ts
import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { agentStatus, agentVersionStatus, agentVersionSource, functionRole } from './enums';
import { workspaces } from './users';
import { functions } from './functions';
import { tools } from './tools';

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status', { enum: agentStatus }).default('discovered').notNull(),
  activeVersionId: text('active_version_id'),
  activeEvalId: text('active_eval_id'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  workspaceIdx: index('idx_agents_workspace_id').on(table.workspaceId),
  statusIdx: index('idx_agents_status').on(table.status),
  activeEvalIdx: index('idx_agents_active_eval').on(table.activeEvalId),
}));

export const agentVersions = sqliteTable('agent_versions', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  promptTemplate: text('prompt_template').notNull(),
  variables: text('variables', { mode: 'json' }).$type<Record<string, unknown>>(),
  source: text('source', { enum: agentVersionSource }).notNull(),
  parentVersionId: text('parent_version_id'),
  accuracy: real('accuracy'),
  status: text('status', { enum: agentVersionStatus }).default('candidate').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  agentIdx: index('idx_agent_versions_agent_id').on(table.agentId),
  statusIdx: index('idx_agent_versions_status').on(table.status),
  agentVersionUnique: uniqueIndex('agent_versions_agent_id_version_unique').on(table.agentId, table.version),
}));

export const agentFunctions = sqliteTable('agent_functions', {
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  functionId: text('function_id').notNull().references(() => functions.id, { onDelete: 'cascade' }),
  role: text('role', { enum: functionRole }).notNull(),
}, (table) => ({
  pk: { name: 'agent_functions_pkey', columns: [table.agentId, table.role] },
}));

export const agentTools = sqliteTable('agent_tools', {
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  toolId: text('tool_id').notNull().references(() => tools.id, { onDelete: 'cascade' }),
  config: text('config', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  pk: { name: 'agent_tools_pkey', columns: [table.agentId, table.toolId] },
  agentIdx: index('idx_agent_tools_agent').on(table.agentId),
  toolIdx: index('idx_agent_tools_tool').on(table.toolId),
}));

// Type exports
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type AgentVersion = typeof agentVersions.$inferSelect;
export type NewAgentVersion = typeof agentVersions.$inferInsert;
export type AgentFunction = typeof agentFunctions.$inferSelect;
export type NewAgentFunction = typeof agentFunctions.$inferInsert;
export type AgentTool = typeof agentTools.$inferSelect;
export type NewAgentTool = typeof agentTools.$inferInsert;
