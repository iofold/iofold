import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  // Drizzle schema is the source of truth
  schema: './src/db/schema/index.ts',

  // Output directory for generated migrations (used by wrangler d1 migrations)
  out: './drizzle',

  dialect: 'sqlite',

  // D1 HTTP driver for push/pull/studio commands
  // Requires: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_DATABASE_ID, CLOUDFLARE_D1_TOKEN
  driver: 'd1-http',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
    token: process.env.CLOUDFLARE_D1_TOKEN!,
  },

  // Exclude wrangler's migration tracking table from drizzle management
  tablesFilter: ['!d1_migrations', '!_cf_KV', '!sqlite_sequence'],
});
