/**
 * Drizzle schema for BENCHMARKS_DB
 *
 * Contains Enron emails and ART-E benchmark data.
 * This is a separate D1 database from the main DB.
 */

import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

/**
 * Enron emails table
 *
 * Schema matches setup-enron-db.sql
 */
export const emails = sqliteTable(
  'emails',
  {
    messageId: text('message_id').primaryKey(),
    inbox: text('inbox').notNull(),
    subject: text('subject'),
    sender: text('sender'),
    recipients: text('recipients'), // JSON array of email addresses
    date: text('date'), // ISO 8601 timestamp
    body: text('body'),
    createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  },
  (table) => [
    index('idx_emails_inbox').on(table.inbox),
    index('idx_emails_date').on(table.date),
    index('idx_emails_sender').on(table.sender),
    index('idx_emails_inbox_date').on(table.inbox, table.date),
  ]
);

/**
 * ART-E benchmark tasks table
 */
export const artETasks = sqliteTable(
  'art_e_tasks',
  {
    id: integer('id').primaryKey(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    messageIds: text('message_ids').notNull(), // JSON array of source message IDs
    inboxAddress: text('inbox_address').notNull(),
    queryDate: text('query_date').notNull(), // ISO 8601
    howRealistic: real('how_realistic'),
    split: text('split').notNull(), // 'train' or 'test'

    // Execution tracking
    executed: integer('executed').default(0),
    agentAnswer: text('agent_answer'),
    similarityScore: real('similarity_score'),
    executionTimeMs: integer('execution_time_ms'),
    traceId: text('trace_id'),

    createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
    executedAt: text('executed_at'),
  },
  (table) => [
    index('idx_art_e_tasks_inbox').on(table.inboxAddress),
    index('idx_art_e_tasks_split').on(table.split),
    index('idx_art_e_tasks_executed').on(table.executed),
  ]
);

export type Email = typeof emails.$inferSelect;
export type NewEmail = typeof emails.$inferInsert;
export type ArtETask = typeof artETasks.$inferSelect;
export type NewArtETask = typeof artETasks.$inferInsert;
