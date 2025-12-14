// src/db/schema/integrations.ts
import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { integrationPlatform, integrationStatus } from './enums';
import { workspaces } from './users';

export const integrations = sqliteTable('integrations', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  platform: text('platform', { enum: integrationPlatform }).notNull(),
  apiKeyEncrypted: text('api_key_encrypted').notNull(),
  config: text('config', { mode: 'json' }).$type<Record<string, unknown>>(),
  status: text('status', { enum: integrationStatus }).default('active').notNull(),
  lastSyncedAt: text('last_synced_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  workspaceIdx: index('idx_integrations_workspace_id').on(table.workspaceId),
  platformIdx: index('idx_integrations_platform').on(table.platform),
}));

// Type exports
export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
