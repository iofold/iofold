// src/db/schema/functions.ts
import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { functionType, functionStatus } from './enums';
import { workspaces } from './users';

export const functions = sqliteTable('functions', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  type: text('type', { enum: functionType }).notNull(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  inputSchema: text('input_schema', { mode: 'json' }).$type<Record<string, unknown>>(),
  outputSchema: text('output_schema', { mode: 'json' }).$type<Record<string, unknown>>(),
  modelUsed: text('model_used'),
  parentFunctionId: text('parent_function_id'),
  status: text('status', { enum: functionStatus }).default('active').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  workspaceIdx: index('idx_functions_workspace_id').on(table.workspaceId),
  typeIdx: index('idx_functions_type').on(table.type),
}));

// Type exports
export type Function = typeof functions.$inferSelect;
export type NewFunction = typeof functions.$inferInsert;
