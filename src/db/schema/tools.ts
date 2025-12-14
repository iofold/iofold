// src/db/schema/tools.ts
import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { toolCategory } from './enums';

export const tools = sqliteTable('tools', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  parametersSchema: text('parameters_schema').notNull(),
  handlerKey: text('handler_key').notNull(),
  category: text('category', { enum: toolCategory }).default('general').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  categoryIdx: index('idx_tools_category').on(table.category),
  handlerIdx: index('idx_tools_handler').on(table.handlerKey),
}));

// Type exports
export type Tool = typeof tools.$inferSelect;
export type NewTool = typeof tools.$inferInsert;
