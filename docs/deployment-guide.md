# Deployment Guide

**Version**: 2.0
**Last Updated**: 2025-12-10
**Target Platform**: Cloudflare Workers + Pages + D1

---

## Table of Contents

1. [Overview](#overview)
2. [Environments](#environments)
3. [Deploy Commands](#deploy-commands)
4. [Required Secrets](#required-secrets)
5. [Database Bindings](#database-bindings)
6. [Key Gotchas](#key-gotchas)
7. [Pre-Deployment Checklist](#pre-deployment-checklist)
8. [Deployment Procedures](#deployment-procedures)
9. [Post-Deployment Verification](#post-deployment-verification)
10. [Rollback Procedures](#rollback-procedures)
11. [Troubleshooting](#troubleshooting)

---

## Overview

iofold.com is deployed on Cloudflare's edge infrastructure:
- **Backend**: Cloudflare Workers (API + job processing)
- **Frontend**: Cloudflare Pages (Next.js)
- **Database**: D1 (SQLite at the edge)
- **Queues**: Cloudflare Queues (job queue + DLQ)
- **AI**: Cloudflare AI Gateway (LLM routing)
- **Containers**: Python sandbox for eval execution

---

## Environments

### 1. Local Development

**Purpose**: Local development and testing

**Configuration**:
- Backend: `http://localhost:8787`
- Frontend: `http://localhost:3000`
- Database: Shared staging database (see Gotchas)
- Wrangler: `wrangler dev`

**Access**:
```bash
# Backend
cd /home/ygupta/workspace/iofold
pnpm dev

# Frontend
cd /home/ygupta/workspace/iofold/frontend
pnpm dev
```

### 2. Staging

**Purpose**: Pre-production testing and validation

**URLs**:
- Backend API: `https://api.staging.iofold.com`
- Frontend: `https://staging.iofold.com` (if configured)

**Configuration**:
- Environment: `staging` in `wrangler.toml`
- Database: `iofold-staging-db` (ID: `9eaff631-3152-432f-9d07-20de2ed8857f`)
- Benchmarks DB: `iofold-benchmarks` (ID: `e5357be6-fc4e-43ad-9b14-3a05189ed9f9`)
- Custom domain: `api.staging.iofold.com`

**Important**: Local dev shares the staging database. Changes in local dev affect staging.

### 3. Production

**Status**: NOT CONFIGURED YET

**Planned URLs**:
- Backend API: `https://api.iofold.com`
- Frontend: `https://iofold.com`

**Todo**:
- [ ] Create production D1 database
- [ ] Configure production environment in `wrangler.toml`
- [ ] Set up production custom domains
- [ ] Configure production secrets
- [ ] Deploy and test production environment

---

## Deploy Commands

### Backend (Cloudflare Workers)

**Package Manager**: **pnpm only** (never use npm or yarn)

```bash
# From project root: /home/ygupta/workspace/iofold

# Deploy to staging (default environment)
pnpm deploy

# Full command with wrangler
pnpm exec wrangler deploy --env staging

# View live logs
pnpm exec wrangler tail --env staging

# When production is ready:
pnpm exec wrangler deploy --env production
```

**Build artifacts**: None required (Wrangler builds on deploy)

### Frontend (Cloudflare Pages)

**Framework**: Next.js with `@opennextjs/cloudflare` adapter

```bash
# From frontend directory: /home/ygupta/workspace/iofold/frontend

# Build and preview locally
pnpm preview

# Deploy to staging
pnpm deploy:staging

# Deploy to production (when ready)
pnpm deploy
```

**Deployment process**:
1. `opennextjs-cloudflare build` - Builds Next.js for Cloudflare
2. `opennextjs-cloudflare deploy` - Deploys to Pages

**Build output**: `.worker-next/` directory

---

## Required Secrets

Secrets are set per environment using `wrangler secret put`.

### Core Secrets

```bash
# LLM API Keys
wrangler secret put LANGFUSE_PUBLIC_KEY --env staging
# Value: pk-lf-... (from Langfuse dashboard)

wrangler secret put LANGFUSE_SECRET_KEY --env staging
# Value: sk-lf-... (from Langfuse dashboard)

# Cloudflare AI Gateway
wrangler secret put CF_ACCOUNT_ID --env staging
# Value: Your Cloudflare account ID

wrangler secret put CF_AI_GATEWAY_TOKEN --env staging
# Value: Your AI Gateway token (optional but recommended)

# Search/Research
wrangler secret put TAVILY_API_KEY --env staging
# Value: tvly-... (from Tavily dashboard)
```

### Optional Secrets

```bash
# Clerk Authentication (if enabled)
wrangler secret put CLERK_SECRET_KEY --env staging
# Value: sk_live_... or sk_test_...

# Error Monitoring (recommended for production)
wrangler secret put SENTRY_DSN --env staging
# Value: https://...@sentry.io/...

# Encryption key for sensitive data
wrangler secret put ENCRYPTION_KEY --env staging
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### List Current Secrets

```bash
# View all secrets (values are hidden)
wrangler secret list --env staging

# Delete a secret (if needed)
wrangler secret delete SECRET_NAME --env staging
```

### Frontend Environment Variables

Set in Cloudflare Pages dashboard or via `.env.local` for local dev:

```bash
# Required
NEXT_PUBLIC_API_URL=https://api.staging.iofold.com

# Optional (if using Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

---

## Database Bindings

### Current Configuration

From `wrangler.toml`:

#### Development (Local)

```toml
[[d1_databases]]
binding = "DB"
database_name = "iofold-staging-db"
database_id = "9eaff631-3152-432f-9d07-20de2ed8857f"

[[d1_databases]]
binding = "BENCHMARKS_DB"
database_name = "iofold-benchmarks"
database_id = "local"  # Local D1 uses "local" as ID
```

**Warning**: Local dev uses the actual staging database for `DB` binding!

#### Staging

```toml
[[env.staging.d1_databases]]
binding = "DB"
database_name = "iofold-staging-db"
database_id = "9eaff631-3152-432f-9d07-20de2ed8857f"

[[env.staging.d1_databases]]
binding = "BENCHMARKS_DB"
database_name = "iofold-benchmarks"
database_id = "e5357be6-fc4e-43ad-9b14-3a05189ed9f9"
```

### Database Operations

```bash
# List all databases
wrangler d1 list

# Execute SQL query
wrangler d1 execute iofold-staging-db --env staging \
  --command="SELECT COUNT(*) FROM traces"

# Run migration
wrangler d1 execute iofold-staging-db --env staging \
  --file=migrations/001_initial_schema.sql

# Backup database (export to JSON)
wrangler d1 execute iofold-staging-db --env staging \
  --json --command="SELECT * FROM traces" > backup_traces.json

# View recent migrations
wrangler d1 execute iofold-staging-db --env staging \
  --command="SELECT * FROM d1_migrations ORDER BY id DESC LIMIT 10"
```

### Creating Production Database

When ready to deploy production:

```bash
# 1. Create production database
wrangler d1 create iofold-production

# 2. Save the database ID from output
# Example: database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# 3. Add to wrangler.toml under [env.production]
[[env.production.d1_databases]]
binding = "DB"
database_name = "iofold-production"
database_id = "YOUR_PRODUCTION_DB_ID"

# 4. Run all migrations
wrangler d1 execute iofold-production --env production \
  --file=migrations/001_initial_schema.sql
# ... repeat for all migration files

# 5. Verify schema
wrangler d1 execute iofold-production --env production \
  --command="SELECT name FROM sqlite_master WHERE type='table'"
```

---

## Key Gotchas

### 1. Shared Dev/Staging Database

**Issue**: Local development (`wrangler dev`) connects to the actual staging database.

**Impact**:
- Changes in local dev affect staging
- Risk of data corruption during local testing
- Multiple developers may interfere with each other

**Workarounds**:
- Use `--local` flag for truly local testing: `wrangler dev --local`
- Create separate dev database per developer
- Be extra careful when testing destructive operations locally

**Example**:
```bash
# Safe local dev (isolated)
wrangler dev --local --persist

# Current behavior (connects to staging DB)
wrangler dev
```

### 2. No Production Environment

**Issue**: Production environment is not configured yet.

**Impact**:
- Cannot deploy to production
- No production database exists
- Production secrets not set

**Action Required**:
- Follow "Creating Production Database" section above
- Add `[env.production]` section to `wrangler.toml`
- Configure production custom domains
- Set production secrets

### 3. Dead Letter Queue (DLQ) Monitoring

**Issue**: Failed jobs go to DLQ but there's no automatic alerting.

**Impact**:
- Failed jobs may go unnoticed
- Manual monitoring required

**Monitoring Strategy**:
```bash
# Check DLQ regularly
wrangler queues consumer list iofold-jobs-dlq --env staging

# View failed messages
wrangler queues consumer inspect iofold-jobs-dlq --env staging

# Set up cron job or alert system to monitor DLQ depth
```

**Recommended**: Set up Cloudflare Workers Analytics alerts for queue depth.

### 4. Encryption TODO

**Issue**: Encryption for sensitive data (API keys) is planned but not fully implemented.

**Current State**:
- Secrets stored in Wrangler (encrypted at rest)
- User API keys in database may not be encrypted
- `ENCRYPTION_KEY` secret exists but implementation incomplete

**Action Required**:
- Review `src/adapters/langfuse.ts` and other API key storage
- Implement AES-GCM encryption for user-provided API keys
- Never store API keys in plain text in D1

**Security Note**: For MVP, rely on Cloudflare's built-in encryption and access controls.

### 5. Package Manager: pnpm Only

**Issue**: Project uses `pnpm` workspaces and specific overrides.

**Impact**:
- Using `npm` or `yarn` will fail or produce incorrect builds
- `package-lock.json` or `yarn.lock` should not exist

**Commands**:
```bash
# Always use pnpm
pnpm install
pnpm dev
pnpm deploy

# Never use
npm install  # ❌
yarn install # ❌
```

### 6. Cron Triggers

**Configuration**: Cron jobs are configured in `wrangler.toml`:

```toml
[env.staging.triggers]
crons = ["0 */6 * * *"]  # Every 6 hours
```

**Purpose**: Scheduled jobs (agent discovery, eval generation, etc.)

**Monitoring**: Check cron execution in Cloudflare dashboard under Workers > Triggers

### 7. Container-Based Python Sandbox

**Issue**: Python eval execution requires Docker containers (Container Workers).

**Configuration**:
```toml
[[env.staging.containers]]
class_name = "PythonSandbox"
image = "./Dockerfile"
instance_type = "lite"
max_instances = 5
```

**Gotcha**: Containers are disabled in local dev by default:
```toml
[dev]
enable_containers = false
```

**To enable locally**: Set `enable_containers = true` and ensure Docker is running.

---

## Pre-Deployment Checklist

Before deploying to any environment, verify:

### Code Quality
- [ ] All TypeScript compilation errors resolved
  ```bash
  cd /home/ygupta/workspace/iofold
  pnpm exec tsc --noEmit
  cd frontend
  pnpm exec tsc --noEmit
  ```
- [ ] All tests passing
  ```bash
  pnpm test  # Backend unit tests
  ```
- [ ] No ESLint errors
  ```bash
  cd frontend
  pnpm lint
  ```

### Configuration
- [ ] Secrets configured for target environment
  ```bash
  wrangler secret list --env staging
  ```
- [ ] Database migrations tested
  ```bash
  wrangler d1 execute iofold-staging-db --env staging \
    --command="SELECT name FROM sqlite_master WHERE type='table'"
  ```
- [ ] Environment variables set (check `wrangler.toml`)
- [ ] Custom domains configured (if deploying to production)

### Security
- [ ] No API keys in code (use secrets only)
- [ ] CORS policy reviewed
- [ ] Rate limiting configured (if applicable)
- [ ] Security headers enabled

### Documentation
- [ ] CHANGELOG.md updated with changes
- [ ] API documentation current
- [ ] Runbook updated for new features

---

## Deployment Procedures

### Deploying Backend (Staging)

```bash
# 1. Navigate to project root
cd /home/ygupta/workspace/iofold

# 2. Run pre-deployment checks
pnpm exec tsc --noEmit
pnpm test

# 3. Deploy to staging
pnpm deploy

# 4. Monitor deployment
pnpm exec wrangler tail --env staging

# 5. Verify health endpoint
curl https://api.staging.iofold.com/health
```

### Deploying Frontend (Staging)

```bash
# 1. Navigate to frontend directory
cd /home/ygupta/workspace/iofold/frontend

# 2. Build and deploy
pnpm deploy:staging

# 3. Verify deployment
curl -I https://staging.iofold.com  # (if domain configured)

# Or test via Pages preview URL from deployment output
```

### Database Migrations

```bash
# 1. Test migration locally first (use --local for safety)
wrangler dev --local --persist
# Then test migration endpoint or run manual SQL

# 2. Backup production data (if exists)
wrangler d1 execute iofold-staging-db --env staging \
  --json --command="SELECT * FROM critical_table" > backup.json

# 3. Run migration
wrangler d1 execute iofold-staging-db --env staging \
  --file=migrations/XXX_migration_name.sql

# 4. Verify migration
wrangler d1 execute iofold-staging-db --env staging \
  --command="PRAGMA table_info(your_table)"

# 5. Test application functionality
curl https://api.staging.iofold.com/api/endpoint-using-new-schema
```

### First-Time Production Deployment

**When production environment is ready**:

```bash
# 1. Create production database
wrangler d1 create iofold-production

# 2. Update wrangler.toml with production config
# (Add [env.production] section)

# 3. Run all migrations
for migration in migrations/*.sql; do
  echo "Running $migration..."
  wrangler d1 execute iofold-production --env production --file="$migration"
done

# 4. Set production secrets
wrangler secret put LANGFUSE_PUBLIC_KEY --env production
wrangler secret put LANGFUSE_SECRET_KEY --env production
wrangler secret put CF_ACCOUNT_ID --env production
wrangler secret put CF_AI_GATEWAY_TOKEN --env production
wrangler secret put TAVILY_API_KEY --env production
# ... etc

# 5. Deploy backend
pnpm exec wrangler deploy --env production

# 6. Deploy frontend
cd frontend
NEXT_PUBLIC_API_URL=https://api.iofold.com pnpm exec opennextjs-cloudflare build
pnpm exec opennextjs-cloudflare deploy --env production

# 7. Verify deployment
curl https://api.iofold.com/health
curl -I https://iofold.com
```

---

## Post-Deployment Verification

### Backend Verification

```bash
# 1. Health check
curl https://api.staging.iofold.com/health
# Expected: {"status":"ok","timestamp":"..."}

# 2. Check environment
curl https://api.staging.iofold.com/v1/debug/environment
# Should show: "environment": "staging"

# 3. Test database connectivity
curl -X POST https://api.staging.iofold.com/v1/integrations \
  -H "Content-Type: application/json" \
  -d '{"type":"langfuse","name":"Test"}'
# Should return integration object or validation error

# 4. View live logs
wrangler tail --env staging --format=pretty

# 5. Check queue status
wrangler queues list --env staging
```

### Frontend Verification

```bash
# 1. Homepage loads
curl -I https://staging.iofold.com
# Expected: HTTP/2 200

# 2. API integration works (check in browser)
# Navigate to https://staging.iofold.com
# Open browser console
# Check for API calls to api.staging.iofold.com
# Verify no CORS errors

# 3. Check Next.js build info
curl https://staging.iofold.com/_next/static/...
# Should return built assets
```

### E2E Testing (Recommended)

```bash
# Run end-to-end tests against staging
cd /home/ygupta/workspace/iofold/frontend
NEXT_PUBLIC_API_URL=https://api.staging.iofold.com \
  pnpm test:e2e

# Run specific test suite
pnpm test:e2e:headed tests/e2e/01-smoke
```

### Performance Check

```bash
# Measure API response time
time curl https://api.staging.iofold.com/health
# Target: < 200ms

# Check First Load JS size (from build output)
# Target: < 100kB for main page

# Use Lighthouse (if deployed to public URL)
npx lighthouse https://staging.iofold.com --view
# Targets: Performance > 80, Accessibility > 90
```

---

## Rollback Procedures

### When to Rollback

Rollback immediately if:
- Error rate > 5% for 5+ minutes
- Critical functionality broken (cannot import traces, generate evals)
- Database corruption detected
- Security vulnerability exposed

### Backend Rollback

**Option A: Wrangler Rollback**
```bash
# List recent deployments
wrangler deployments list --env staging

# Rollback to previous version
wrangler rollback --env staging --message "Rolling back due to [REASON]"
```

**Option B: Deploy Previous Commit**
```bash
# Find last working commit
git log --oneline -10

# Deploy specific commit
git checkout <COMMIT_HASH>
pnpm exec wrangler deploy --env staging

# Return to latest
git checkout master
```

### Frontend Rollback

**Via Cloudflare Dashboard**:
1. Go to Cloudflare Pages dashboard
2. Select project → Deployments
3. Find previous working deployment
4. Click "..." → "Rollback to this deployment"

**Via Wrangler** (if configured):
```bash
wrangler pages deployment list --project-name=iofold-frontend
wrangler pages deployment rollback <DEPLOYMENT_ID>
```

### Database Rollback

**Warning**: Database rollbacks are risky and may cause data loss.

**Option A: Revert Migration**
```bash
# Create reverse migration SQL
# Example: migrations/XXX_revert_feature.sql
ALTER TABLE your_table DROP COLUMN new_column;

# Run revert migration
wrangler d1 execute iofold-staging-db --env staging \
  --file=migrations/XXX_revert_feature.sql
```

**Option B: Restore from Backup**
```bash
# If you have a backup JSON file
wrangler d1 execute iofold-staging-db --env staging \
  --json --command="$(cat backup.json | jq -r 'INSERT SQL here')"
```

**Last Resort**: Contact Cloudflare support for database restoration.

---

## Troubleshooting

### Common Issues

#### "Error: No database with name 'X' found"

**Cause**: Database binding misconfigured or database doesn't exist.

**Solution**:
```bash
# List available databases
wrangler d1 list

# Verify wrangler.toml has correct database_id
# Update if needed and redeploy
```

#### "Secret not found: LANGFUSE_PUBLIC_KEY"

**Cause**: Secret not set in environment.

**Solution**:
```bash
# Set the secret
wrangler secret put LANGFUSE_PUBLIC_KEY --env staging

# Verify all secrets are set
wrangler secret list --env staging
```

#### "CORS Error" in Frontend

**Cause**: API and frontend origins don't match.

**Solution**:
1. Check frontend's `NEXT_PUBLIC_API_URL` matches deployed API
2. Verify API CORS headers allow frontend origin
3. Check browser console for specific CORS error

**Debug**:
```bash
# Test CORS manually
curl -H "Origin: https://staging.iofold.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -X OPTIONS \
  https://api.staging.iofold.com/v1/integrations
```

#### "CPU time limit exceeded"

**Cause**: Worker processing time > 10ms (free tier) or 50ms (paid).

**Solution**:
- Optimize queries (add indexes)
- Reduce payload sizes
- Cache expensive operations
- Upgrade to paid plan for higher limits

**Check CPU usage**:
```bash
# View metrics in dashboard
# Cloudflare Dashboard → Workers → iofold-staging → Metrics → CPU Time
```

#### "Queue consumer failing repeatedly"

**Cause**: Job processing error causing retries to fail.

**Solution**:
```bash
# Check DLQ for failed messages
wrangler queues consumer inspect iofold-jobs-dlq --env staging

# View error logs
wrangler tail --env staging --format=pretty | grep ERROR

# Manually process a failed message (if safe to retry)
# Fix the bug, redeploy, then retry or discard failed messages
```

#### "Container execution failed"

**Cause**: Python sandbox container issue.

**Solution**:
- Check Dockerfile is valid
- Verify container class_name matches configuration
- Ensure durable object migrations are applied
- Check container logs in dashboard

```bash
# View durable object migrations
wrangler d1 execute iofold-staging-db --env staging \
  --command="SELECT * FROM sqlite_master WHERE name LIKE '%migration%'"
```

### Debug Commands

```bash
# View all environment configuration
wrangler whoami
wrangler deployments list --env staging

# Check D1 database
wrangler d1 info iofold-staging-db

# Monitor live logs with filtering
wrangler tail --env staging --format=pretty | grep -E "(ERROR|WARN)"

# Check queue status
wrangler queues list --env staging

# Test Worker locally before deploying
wrangler dev --env staging --remote  # Use remote resources

# Inspect specific request
wrangler tail --env staging --format=pretty --header "X-Request-ID: xxx"
```

### Getting Help

**Resources**:
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)

**Support**:
- Cloudflare Community: https://community.cloudflare.com/
- Cloudflare Support: Available on paid plans

**Internal**:
- Check `docs/` directory for additional documentation
- Review `docs/progress_log.ndjson` for recent changes
- Contact: ygupta

---

## Appendix: Configuration Reference

### Environment Variables (Backend)

From `wrangler.toml` and secrets:

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `ENVIRONMENT` | Var | Yes | Environment name: "development", "staging", "production" |
| `LANGFUSE_BASE_URL` | Var | No | Langfuse API base URL (default: https://cloud.langfuse.com) |
| `CF_AI_GATEWAY_ID` | Var | Yes | Cloudflare AI Gateway ID |
| `LANGFUSE_PUBLIC_KEY` | Secret | Yes | Langfuse public API key (pk-lf-...) |
| `LANGFUSE_SECRET_KEY` | Secret | Yes | Langfuse secret API key (sk-lf-...) |
| `CF_ACCOUNT_ID` | Secret | Yes | Cloudflare account ID |
| `CF_AI_GATEWAY_TOKEN` | Secret | No | Cloudflare AI Gateway token (recommended) |
| `TAVILY_API_KEY` | Secret | Yes | Tavily search API key (tvly-...) |
| `CLERK_SECRET_KEY` | Secret | No | Clerk authentication secret key |
| `SENTRY_DSN` | Secret | No | Sentry error tracking DSN |
| `ENCRYPTION_KEY` | Secret | No | 32-byte hex key for data encryption |

### Environment Variables (Frontend)

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Env | Yes | Backend API URL (e.g., https://api.staging.iofold.com) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Env | No | Clerk publishable key (if using auth) |

### Bindings (Backend)

| Binding | Type | Description |
|---------|------|-------------|
| `DB` | D1 | Main application database |
| `BENCHMARKS_DB` | D1 | Benchmarks/evaluation data database |
| `JOB_QUEUE` | Queue | Queue for background jobs (producer) |
| `DEAD_LETTER_QUEUE` | Queue | Failed jobs queue (producer) |
| `VECTORIZE` | Vectorize | Vector database for embeddings (system-prompts) |
| `AI` | AI | Cloudflare Workers AI (for embeddings) |
| `SANDBOX` | Durable Object | Python sandbox container for eval execution |

### Package.json Scripts

**Backend** (`/home/ygupta/workspace/iofold`):
```json
{
  "dev": "wrangler dev --port 8787 --ip 0.0.0.0",
  "deploy": "wrangler deploy",
  "test": "vitest run"
}
```

**Frontend** (`/home/ygupta/workspace/iofold/frontend`):
```json
{
  "dev": "next dev -p 3000 -H 0.0.0.0",
  "build": "next build",
  "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
  "deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
  "deploy:staging": "NEXT_PUBLIC_API_URL=https://api.staging.iofold.com opennextjs-cloudflare build && opennextjs-cloudflare deploy --env staging",
  "test:e2e": "playwright test"
}
```

---

**Document Version**: 2.0
**Last Updated**: 2025-12-10
**Maintained By**: iofold Platform Team

**Questions?** Contact ygupta or see `docs/` for additional documentation.
