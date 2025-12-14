// src/db/schema/feedback.ts
import { sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { feedbackRating } from './enums';
import { traces } from './traces';
import { agents } from './agents';

export const feedback = sqliteTable('feedback', {
  id: text('id').primaryKey(),
  traceId: text('trace_id').notNull().references(() => traces.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
  rating: text('rating', { enum: feedbackRating }).notNull(),
  ratingDetail: text('rating_detail'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  traceIdx: index('idx_feedback_trace_id').on(table.traceId),
  agentIdx: index('idx_feedback_agent_id').on(table.agentId),
  ratingIdx: index('idx_feedback_rating').on(table.rating),
  agentCreatedTraceIdx: index('idx_feedback_agent_created_trace').on(table.agentId, table.createdAt, table.traceId),
  traceUnique: uniqueIndex('feedback_trace_unique').on(table.traceId),
}));

export const taskMetadata = sqliteTable('task_metadata', {
  id: text('id').primaryKey(),
  traceId: text('trace_id').notNull().references(() => traces.id, { onDelete: 'cascade' }),
  userMessage: text('user_message').notNull(),
  expectedOutput: text('expected_output'),
  expectedAction: text('expected_action'),
  successCriteria: text('success_criteria', { mode: 'json' }).$type<string[]>(),
  taskType: text('task_type'),
  difficulty: text('difficulty', { enum: ['easy', 'medium', 'hard'] }),
  domain: text('domain'),
  customMetadata: text('custom_metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  traceIdx: index('idx_task_metadata_trace').on(table.traceId),
  typeIdx: index('idx_task_metadata_type').on(table.taskType),
  updatedIdx: index('idx_task_metadata_updated').on(table.updatedAt),
  traceUnique: uniqueIndex('task_metadata_trace_unique').on(table.traceId),
}));

// Type exports
export type Feedback = typeof feedback.$inferSelect;
export type NewFeedback = typeof feedback.$inferInsert;
export type TaskMetadata = typeof taskMetadata.$inferSelect;
export type NewTaskMetadata = typeof taskMetadata.$inferInsert;
