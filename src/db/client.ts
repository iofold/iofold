// src/db/client.ts
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

/**
 * Create a Drizzle database client from a D1 binding
 * @param d1 - The D1Database binding from Cloudflare Workers
 * @returns Drizzle ORM client with full schema
 */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

/** Type alias for the Drizzle database client */
export type Database = ReturnType<typeof createDb>;

/**
 * Helper to get typed database from environment
 * Use this in request handlers:
 *
 * @example
 * ```typescript
 * const db = getDb(env.DB);
 * const jobs = await db.query.jobs.findMany();
 * ```
 */
export function getDb(d1: D1Database): Database {
  return createDb(d1);
}
