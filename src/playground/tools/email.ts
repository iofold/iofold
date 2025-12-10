/**
 * Email Search Tools for Agents Playground
 *
 * Provides email search and retrieval capabilities using the Enron email dataset.
 * Designed for building and testing email search agents.
 */

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
 * Email search parameters
 */
export interface EmailSearchParams {
  query: string;
  inbox_id: string;
  limit?: number;
}

/**
 * Email get parameters
 */
export interface EmailGetParams {
  message_id: string;
}

/**
 * Search emails using full-text search
 *
 * Searches across email subjects and bodies using SQLite FTS5.
 * Returns matching emails with snippets for the given inbox.
 *
 * @param params - Search parameters (query, inbox_id, optional limit)
 * @param context - Email tool context with BENCHMARKS_DB binding
 * @returns Promise with array of matching emails and total count
 *
 * @example
 * ```typescript
 * const result = await emailSearchHandler({
 *   query: 'meeting schedule',
 *   inbox_id: 'john.arnold@enron.com',
 *   limit: 10
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

  const { query, inbox_id, limit = 20 } = params as EmailSearchParams;

  if (!query || typeof query !== 'string' || !query.trim()) {
    throw new Error('Invalid query: must be a non-empty string');
  }

  if (!inbox_id || typeof inbox_id !== 'string' || !inbox_id.trim()) {
    throw new Error('Invalid inbox_id: must be a non-empty string');
  }

  if (typeof limit !== 'number' || limit < 1 || limit > 100) {
    throw new Error('Invalid limit: must be a number between 1 and 100');
  }

  if (!context.BENCHMARKS_DB) {
    throw new Error('BENCHMARKS_DB binding not configured');
  }

  try {
    // Use FTS5 for full-text search
    // FTS5 snippet() function returns highlighted text snippets
    const searchQuery = `
      SELECT
        e.message_id,
        e.subject,
        e.sender,
        e.date,
        snippet(emails_fts, 0, '<mark>', '</mark>', '...', 32) as subject_snippet,
        snippet(emails_fts, 1, '<mark>', '</mark>', '...', 64) as body_snippet
      FROM emails_fts
      INNER JOIN emails e ON emails_fts.rowid = e.rowid
      WHERE emails_fts MATCH ?
        AND e.inbox = ?
      ORDER BY rank
      LIMIT ?
    `;

    const results = await context.BENCHMARKS_DB.prepare(searchQuery)
      .bind(query, inbox_id, limit)
      .all<{
        message_id: string;
        subject: string | null;
        sender: string | null;
        date: string | null;
        subject_snippet: string;
        body_snippet: string;
      }>();

    if (!results.success) {
      throw new Error(`Database query failed: ${results.error || 'unknown error'}`);
    }

    // Format results
    const emails: EmailSearchResult[] = results.results.map((row) => ({
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
    const query = `
      SELECT
        message_id,
        inbox,
        subject,
        sender,
        recipients,
        date,
        body
      FROM emails
      WHERE message_id = ?
      LIMIT 1
    `;

    const result = await context.BENCHMARKS_DB.prepare(query)
      .bind(message_id)
      .first<{
        message_id: string;
        inbox: string;
        subject: string | null;
        sender: string | null;
        recipients: string | null;
        date: string | null;
        body: string | null;
      }>();

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
