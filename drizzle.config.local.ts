// Local config for comparing Drizzle schema against local SQLite
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: '.tmp/seed.db',
  },
});
