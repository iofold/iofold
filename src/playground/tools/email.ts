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
 * @see https://github.com/OpenPipe/ART/blob/art-e/examples/art-e/art_e/email_search_tools.py
 */
export interface EmailSearchParams {
  inbox: string; // The inbox email address to search within
  keywords: string[]; // Search keywords to match against email content
  from_addr?: string; // Filter by sender email address
  to_addr?: string; // Filter by recipient email address
  sent_after?: string; // Only return emails sent after this date (YYYY-MM-DD)
  sent_before?: string; // Only return emails sent before this date (YYYY-MM-DD)
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
 *
 * @param params - Search parameters matching ART-E spec
 * @param context - Email tool context with BENCHMARKS_DB binding
 * @returns Promise with array of matching emails and total count
 *
 * @see https://github.com/OpenPipe/ART/blob/art-e/examples/art-e/art_e/email_search_tools.py
 *
 * @example
 * ```typescript
 * const result = await emailSearchHandler({
 *   inbox: 'jeff.dasovich@enron.com',
 *   keywords: ['budget', 'report'],
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

  const { inbox, keywords, from_addr, to_addr, sent_after, sent_before } = params as EmailSearchParams;

  // Inbox is required
  if (!inbox || typeof inbox !== 'string' || !inbox.trim()) {
    throw new Error('Invalid inbox: must be a non-empty string (email address)');
  }

  // Keywords is required and must be an array
  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    throw new Error('Invalid keywords: must be a non-empty array of strings');
  }

  // Validate optional parameters
  if (from_addr !== undefined && typeof from_addr !== 'string') {
    throw new Error('Invalid from_addr: must be a string');
  }
  if (to_addr !== undefined && typeof to_addr !== 'string') {
    throw new Error('Invalid to_addr: must be a string');
  }
  if (sent_after !== undefined && typeof sent_after !== 'string') {
    throw new Error('Invalid sent_after: must be a date string (YYYY-MM-DD)');
  }
  if (sent_before !== undefined && typeof sent_before !== 'string') {
    throw new Error('Invalid sent_before: must be a date string (YYYY-MM-DD)');
  }

  if (!context.BENCHMARKS_DB) {
    throw new Error('BENCHMARKS_DB binding not configured');
  }

  // Fixed limit of 10 per ART-E spec
  const limit = 10;

  // Join keywords for FTS5 MATCH query
  const keywordsQuery = keywords.join(' ');

  try {
    const drizzle = createDb(context.BENCHMARKS_DB);

    // Build dynamic WHERE conditions
    // Base query with inbox filter and FTS match
    // We'll build conditions array and use raw SQL for flexibility
    const conditions: string[] = [
      `emails_fts MATCH '${keywordsQuery.replace(/'/g, "''")}'`,
      `e.inbox = '${inbox.replace(/'/g, "''")}'`
    ];

    if (from_addr) {
      conditions.push(`e.sender = '${from_addr.replace(/'/g, "''")}'`);
    }
    if (to_addr) {
      conditions.push(`e.recipients LIKE '%${to_addr.replace(/'/g, "''")}%'`);
    }
    if (sent_after) {
      conditions.push(`e.date >= '${sent_after}'`);
    }
    if (sent_before) {
      conditions.push(`e.date <= '${sent_before}'`);
    }

    const whereClause = conditions.join(' AND ');

    const searchQuerySql = sql.raw(`
      SELECT
        e.message_id,
        e.subject,
        e.sender,
        e.date,
        snippet(emails_fts, 0, '<mark>', '</mark>', '...', 32) as subject_snippet,
        snippet(emails_fts, 1, '<mark>', '</mark>', '...', 64) as body_snippet
      FROM emails_fts
      INNER JOIN emails e ON emails_fts.rowid = e.rowid
      WHERE ${whereClause}
      ORDER BY rank
      LIMIT ${limit}
    `);

    const results = await drizzle.all<{
      message_id: string;
      subject: string | null;
      sender: string | null;
      date: string | null;
      subject_snippet: string;
      body_snippet: string;
    }>(searchQuerySql);

    // Format results matching ART-E SearchResult (message_id + snippet)
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

/**
 * Return final answer parameters (ART-E spec)
 */
export interface ReturnFinalAnswerParams {
  answer: string; // The answer to the user's question
  sources: string[]; // Array of message IDs that support the answer
}

/**
 * Return final answer response
 */
export interface ReturnFinalAnswerResponse {
  answer: string;
  sources: string[];
  status: 'success';
}

/**
 * Return final answer to the user's question (ART-E spec)
 *
 * This tool is called by the agent to provide a structured final answer
 * along with the source message IDs that support the answer.
 *
 * @param params - Answer and sources
 * @param context - Tool context (not used for this tool)
 * @returns The answer and sources for evaluation
 *
 * @see https://github.com/OpenPipe/ART/blob/art-e/examples/art-e/art_e/email_search_tools.py
 */
export async function returnFinalAnswerHandler(
  params: unknown,
  _context: EmailToolContext
): Promise<ReturnFinalAnswerResponse> {
  // Validate parameters
  if (!params || typeof params !== 'object') {
    throw new Error('Invalid parameters: expected object');
  }

  const { answer, sources } = params as ReturnFinalAnswerParams;

  if (!answer || typeof answer !== 'string') {
    throw new Error('Invalid answer: must be a non-empty string');
  }

  if (!sources || !Array.isArray(sources)) {
    throw new Error('Invalid sources: must be an array of message IDs');
  }

  // Return the structured answer for evaluation
  return {
    answer,
    sources,
    status: 'success'
  };
}
