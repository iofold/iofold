#!/bin/sh
# Docker development database initialization script
# Applies Drizzle migrations for local D1 database

set -e

PERSIST_PATH="/app/.wrangler/state"

echo "🔧 Checking database initialization..."

# Check if schema needs to be applied by checking if workspaces table exists
TABLE_CHECK=$(npx wrangler d1 execute DB --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces';" --persist-to=$PERSIST_PATH 2>&1 || true)

if echo "$TABLE_CHECK" | grep -q '"results": \[\]'; then
  echo "📦 Applying Drizzle migrations..."
  npx wrangler d1 migrations apply DB --local --persist-to=$PERSIST_PATH
  echo "✅ Migrations applied successfully"
else
  echo "✅ Schema already exists"
fi

# Seed data using the TypeScript seed script
echo "🌱 Running seed script..."
if [ -f "/app/scripts/seed-database.ts" ]; then
  npx tsx /app/scripts/seed-database.ts --api-url=http://localhost:8787 --traces=20 || echo "⚠ Seed script requires running backend"
fi

echo "✅ Database initialization complete"
