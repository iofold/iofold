// Local config for pushing schema to local D1 (run inside Docker container)
// Usage: docker exec iofold-backend npx drizzle-kit push --config=drizzle.config.local.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    // Local D1 database managed by wrangler/miniflare (main DB file)
    url: '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/94f9c944e2fcde882db360736013d5240cfb4b265a0843b1cea78d1c7b62bc11.sqlite',
  },
});
