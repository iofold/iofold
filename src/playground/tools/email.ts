/**
 * Email Search Tools for Agents Playground
 *
 * Provides email search and retrieval capabilities using the Enron email dataset.
 * Designed for building and testing email search agents.
 */

import { createDb, type Database } from '../../db/client';
import { sql } from 'drizzle-orm';

/**
 * Context interface for email tool handlers
 */
export interface EmailToolContext {
  BENCHMARKS_DB: D1Database;
}

/**
 * Email search result item
 */
export interface EmailSearchResult {
  message_id: string;
  subject: string | null;
  sender: string | null;
  date: string | null;
  snippet: string;
}

/**
 * Email search response
 */
export interface EmailSearchResponse {
  emails: EmailSearchResult[];
  total: number;
}

/**
 * Full email object
 */
export interface Email {
  message_id: string;
  inbox: string;
  subject: string | null;
  sender: string | null;
  recipients: string[] | null;
  date: string | null;
  body: string | null;
}

/**
 * Email search parameters (ART-E spec)
 * @see https://openpipe.ai/blog/art-e-mail-agent
 */
export interface EmailSearchParams {
  keywords: string;
  sent_after?: string; // ISO 8601 date string (e.g., "2001-01-15")
  sent_before?: string; // ISO 8601 date string (e.g., "2001-12-31")
}

/**
 * Email get parameters
 */
export interface EmailGetParams {
  message_id: string;
}

/**
 * Search emails using full-text search (ART-E spec)
 *
 * Searches across email subjects and bodies using SQLite FTS5.
 * Returns up to 10 matching emails with message IDs and snippets.
 * Supports date filtering via sent_after and sent_before parameters.
 *
 * @param params - Search parameters (keywords, sent_after, sent_before)
 * @param context - Email tool context with BENCHMARKS_DB binding
 * @returns Promise with array of matching emails and total count
 *
 * @see https://openpipe.ai/blog/art-e-mail-agent
 *
 * @example
 * ```typescript
 * const result = await emailSearchHandler({
 *   keywords: 'budget report',
 *   sent_after: '2001-01-01',
 *   sent_before: '2001-12-31'
 * }, { BENCHMARKS_DB: env.BENCHMARKS_DB });
 * ```
 */
export async function emailSearchHandler(
  params: unknown,
  context: EmailToolContext
): Promise<EmailSearchResponse> {
  // Validate parameters
  if (!params || typeof params !== 'object') {
    throw new Error('Invalid parameters: expected object');
  }

  const { keywords, sent_after, sent_before } = params as EmailSearchParams;

  if (!keywords || typeof keywords !== 'string' || !keywords.trim()) {
    throw new Error('Invalid keywords: must be a non-empty string');
  }

  // Validate date parameters if provided
  if (sent_after !== undefined && typeof sent_after !== 'string') {
    throw new Error('Invalid sent_after: must be a date string (e.g., "2001-01-15")');
  }
  if (sent_before !== undefined && typeof sent_before !== 'string') {
    throw new Error('Invalid sent_before: must be a date string (e.g., "2001-12-31")');
  }

  if (!context.BENCHMARKS_DB) {
    throw new Error('BENCHMARKS_DB binding not configured');
  }

  // Fixed limit of 10 per ART-E spec
  const limit = 10;

  try {
    const drizzle = createDb(context.BENCHMARKS_DB);

    // Build query with optional date filters
    // Use FTS5 for full-text search with raw SQL
    let searchQuerySql;

    if (sent_after && sent_before) {
      searchQuerySql = sql`
        SELECT
          e.message_id,
          e.subject,
          e.sender,
          e.date,
          snippet(emails_fts, 0, '<mark>', '</mark>', '...', 32) as subject_snippet,
          snippet(emails_fts, 1, '<mark>', '</mark>', '...', 64) as body_snippet
        FROM emails_fts
        INNER JOIN emails e ON emails_fts.rowid = e.rowid
        WHERE emails_fts MATCH ${keywords}
          AND e.date >= ${sent_after}
          AND e.date <= ${sent_before}
        ORDER BY rank
        LIMIT ${limit}
      `;
    } else if (sent_after) {
      searchQuerySql = sql`
        SELECT
          e.message_id,
          e.subject,
          e.sender,
          e.date,
          snippet(emails_fts, 0, '<mark>', '</mark>', '...', 32) as subject_snippet,
          snippet(emails_fts, 1, '<mark>', '</mark>', '...', 64) as body_snippet
        FROM emails_fts
        INNER JOIN emails e ON emails_fts.rowid = e.rowid
        WHERE emails_fts MATCH ${keywords}
          AND e.date >= ${sent_after}
        ORDER BY rank
        LIMIT ${limit}
      `;
    } else if (sent_before) {
      searchQuerySql = sql`
        SELECT
          e.message_id,
          e.subject,
          e.sender,
          e.date,
          snippet(emails_fts, 0, '<mark>', '</mark>', '...', 32) as subject_snippet,
          snippet(emails_fts, 1, '<mark>', '</mark>', '...', 64) as body_snippet
        FROM emails_fts
        INNER JOIN emails e ON emails_fts.rowid = e.rowid
        WHERE emails_fts MATCH ${keywords}
          AND e.date <= ${sent_before}
        ORDER BY rank
        LIMIT ${limit}
      `;
    } else {
      searchQuerySql = sql`
        SELECT
          e.message_id,
          e.subject,
          e.sender,
          e.date,
          snippet(emails_fts, 0, '<mark>', '</mark>', '...', 32) as subject_snippet,
          snippet(emails_fts, 1, '<mark>', '</mark>', '...', 64) as body_snippet
        FROM emails_fts
        INNER JOIN emails e ON emails_fts.rowid = e.rowid
        WHERE emails_fts MATCH ${keywords}
        ORDER BY rank
        LIMIT ${limit}
      `;
    }

    const results = await drizzle.all<{
      message_id: string;
      subject: string | null;
      sender: string | null;
      date: string | null;
      subject_snippet: string;
      body_snippet: string;
    }>(searchQuerySql);

    // Format results
    const emails: EmailSearchResult[] = results.map((row) => ({
      message_id: row.message_id,
      subject: row.subject,
      sender: row.sender,
      date: row.date,
      snippet: combineSnippets(row.subject_snippet, row.body_snippet)
    }));

    return {
      emails,
      total: emails.length
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Email search failed: ${errorMessage}`);
  }
}

/**
 * Get full email by message ID
 *
 * Retrieves the complete email content including body and all metadata.
 *
 * @param params - Get parameters (message_id)
 * @param context - Email tool context with BENCHMARKS_DB binding
 * @returns Promise with full email object
 *
 * @example
 * ```typescript
 * const email = await emailGetHandler({
 *   message_id: '<1234567890@enron.com>'
 * }, { BENCHMARKS_DB: env.BENCHMARKS_DB });
 * ```
 */
export async function emailGetHandler(
  params: unknown,
  context: EmailToolContext
): Promise<Email> {
  // Validate parameters
  if (!params || typeof params !== 'object') {
    throw new Error('Invalid parameters: expected object');
  }

  const { message_id } = params as EmailGetParams;

  if (!message_id || typeof message_id !== 'string' || !message_id.trim()) {
    throw new Error('Invalid message_id: must be a non-empty string');
  }

  if (!context.BENCHMARKS_DB) {
    throw new Error('BENCHMARKS_DB binding not configured');
  }

  try {
    const drizzle = createDb(context.BENCHMARKS_DB);

    const querySql = sql`
      SELECT
        message_id,
        inbox,
        subject,
        sender,
        recipients,
        date,
        body
      FROM emails
      WHERE message_id = ${message_id}
      LIMIT 1
    `;

    const results = await drizzle.all<{
      message_id: string;
      inbox: string;
      subject: string | null;
      sender: string | null;
      recipients: string | null;
      date: string | null;
      body: string | null;
    }>(querySql);

    const result = results[0];

    if (!result) {
      throw new Error(`Email not found: ${message_id}`);
    }

    // Parse recipients JSON array
    let recipients: string[] | null = null;
    if (result.recipients) {
      try {
        recipients = JSON.parse(result.recipients);
      } catch {
        // If parsing fails, treat as null
        recipients = null;
      }
    }

    return {
      message_id: result.message_id,
      inbox: result.inbox,
      subject: result.subject,
      sender: result.sender,
      recipients,
      date: result.date,
      body: result.body
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Email get failed: ${errorMessage}`);
  }
}

/**
 * Combine subject and body snippets into a single readable snippet
 *
 * @param subjectSnippet - Highlighted snippet from subject
 * @param bodySnippet - Highlighted snippet from body
 * @returns Combined snippet string
 */
function combineSnippets(subjectSnippet: string, bodySnippet: string): string {
  const parts: string[] = [];

  if (subjectSnippet && subjectSnippet !== '...') {
    parts.push(`Subject: ${subjectSnippet}`);
  }

  if (bodySnippet && bodySnippet !== '...') {
    parts.push(`Body: ${bodySnippet}`);
  }

  return parts.length > 0 ? parts.join(' | ') : '(no matches found)';
}
