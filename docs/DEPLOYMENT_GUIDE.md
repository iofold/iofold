# Deployment Guide - iofold Platform

**Version**: 1.0
**Last Updated**: 2025-11-15
**Target Platform**: Cloudflare Workers + Pages + D1

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Setup](#environment-setup)
3. [Database Migrations](#database-migrations)
4. [Backend Deployment (Workers)](#backend-deployment-workers)
5. [Frontend Deployment (Pages)](#frontend-deployment-pages)
6. [Post-Deployment Verification](#post-deployment-verification)
7. [Rollback Procedures](#rollback-procedures)
8. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

Before deploying to production, ensure all prerequisites are met:

### Code Quality
- [ ] All TypeScript compilation errors resolved (`npm run type-check`)
- [ ] All unit tests passing (`npm test`)
- [ ] E2E test pass rate ≥ 90% (`npx playwright test`)
- [ ] No console errors in development build
- [ ] Code review completed (if applicable)

### Security
- [ ] Security audit completed
- [ ] API keys encrypted with AES-GCM (not base64)
- [ ] Environment variables configured (see [Environment Setup](#environment-setup))
- [ ] CORS policy reviewed
- [ ] Rate limiting configured (if applicable)

### Database
- [ ] All migrations tested locally
- [ ] Backup strategy in place
- [ ] Rollback plan documented
- [ ] Database indexes created (25 indexes in schema)

### Monitoring
- [ ] Sentry error tracking configured
- [ ] Cloudflare Analytics enabled
- [ ] Alerts set up (error rate, response time)
- [ ] Uptime monitoring configured (Pingdom, UptimeRobot, etc.)

### Documentation
- [ ] Deployment guide reviewed (this document)
- [ ] Runbook created for common issues
- [ ] User documentation complete
- [ ] API documentation published

---

## Environment Setup

### 1. Cloudflare Account Setup

**Create Cloudflare Account** (if not already done):
1. Sign up at [cloudflare.com](https://cloudflare.com)
2. Add payment method (required for Workers and D1)
3. Verify email address

**Install Wrangler CLI**:
```bash
npm install -g wrangler
```

**Authenticate Wrangler**:
```bash
wrangler login
```

### 2. Create Production Resources

**Create D1 Database**:
```bash
# Create production database
wrangler d1 create iofold-production

# Output will show database ID, save this!
# Example output:
# ✅ Successfully created DB 'iofold-production'
#  ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Update `wrangler.toml`** with production database ID:
```toml
[[d1_databases]]
binding = "DB"
database_name = "iofold-production"
database_id = "YOUR_PRODUCTION_DB_ID"  # Replace with actual ID
```

**Create R2 Bucket** (optional, deferred in MVP):
```bash
wrangler r2 bucket create iofold-traces-production
```

### 3. Configure Environment Variables

**Required Secrets** for production:

```bash
# Encryption key for API keys (generate 32-byte hex)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
wrangler secret put ENCRYPTION_KEY

# Anthropic API key for Claude AI
wrangler secret put ANTHROPIC_API_KEY

# Clerk authentication (if using)
wrangler secret put CLERK_SECRET_KEY

# Sentry DSN (optional but recommended)
wrangler secret put SENTRY_DSN
```

**Verify Secrets**:
```bash
wrangler secret list
```

### 4. Custom Domain Setup

**Add Domain to Cloudflare**:
1. Go to Cloudflare dashboard
2. Click "Add a Site"
3. Enter `iofold.com` (or your domain)
4. Follow DNS setup instructions
5. Wait for DNS propagation (~5-10 minutes)

**Configure Workers Route**:
```bash
# In wrangler.toml, add:
routes = [
  { pattern = "api.iofold.com/*", zone_name = "iofold.com" }
]
```

**Configure Pages Custom Domain**:
1. Go to Cloudflare Pages dashboard
2. Select your project
3. Go to "Custom domains"
4. Add `iofold.com` and `www.iofold.com`
5. Wait for SSL certificate provisioning (~1-2 minutes)

---

## Database Migrations

### 1. Review Migrations

**Local Testing**:
```bash
# Test migrations on local database
wrangler d1 execute iofold-local --file=migrations/001_initial_schema.sql
wrangler d1 execute iofold-local --file=migrations/002_add_updated_at_to_eval_sets.sql

# Verify tables created
wrangler d1 execute iofold-local --command="SELECT name FROM sqlite_master WHERE type='table'"
```

**Migration Files**:
- `migrations/001_initial_schema.sql` - Initial database schema (10 tables, 1 view, 25 indexes)
- `migrations/002_add_updated_at_to_eval_sets.sql` - Add `updated_at` column to `eval_sets` table

### 2. Run Production Migrations

**IMPORTANT**: Always backup before migrations (if data exists).

**Backup Production Database** (if applicable):
```bash
# Export to JSON
wrangler d1 execute iofold-production --json --command="SELECT * FROM traces" > backup_traces.json
wrangler d1 execute iofold-production --json --command="SELECT * FROM evals" > backup_evals.json
# Repeat for all tables with data
```

**Run Migrations**:
```bash
# Run initial schema migration
wrangler d1 execute iofold-production --file=migrations/001_initial_schema.sql

# Run subsequent migrations
wrangler d1 execute iofold-production --file=migrations/002_add_updated_at_to_eval_sets.sql
```

**Verify Migration Success**:
```bash
# Check tables exist
wrangler d1 execute iofold-production --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"

# Check indexes exist
wrangler d1 execute iofold-production --command="SELECT name FROM sqlite_master WHERE type='index' ORDER BY name"

# Check row counts (should be 0 for new database)
wrangler d1 execute iofold-production --command="SELECT
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM workspaces) AS workspaces,
  (SELECT COUNT(*) FROM integrations) AS integrations"
```

### 3. Seed Data (Optional)

**For Testing/Demo Purposes**:
```bash
# Seed with sample data
wrangler d1 execute iofold-production --file=src/db/seed.sql

# Verify seed data
wrangler d1 execute iofold-production --command="SELECT COUNT(*) AS total_traces FROM traces"
```

**Production Note**: Do NOT seed production database with sample data unless explicitly for demo accounts.

---

## Backend Deployment (Workers)

### 1. Pre-Deployment Build

**Build and Type-Check**:
```bash
cd /home/ygupta/workspace/iofold

# Type-check TypeScript
npm run type-check

# Run tests
npm test

# Expected output: All tests passing
```

### 2. Deploy Backend

**Deploy to Production**:
```bash
# Deploy Workers with production configuration
npx wrangler deploy

# Expected output:
# Total Upload: XX.XX KiB / gzip: XX.XX KiB
# Uploaded iofold (1.23 sec)
# Published iofold (X.XX sec)
#   https://iofold.YOUR-SUBDOMAIN.workers.dev
#   https://api.iofold.com (if custom domain configured)
```

**Verify Deployment**:
```bash
# Test health endpoint
curl https://api.iofold.com/health

# Expected output:
# {"status":"ok","timestamp":"2025-11-15T..."}
```

### 3. Configure Worker Settings

**Set Concurrency Limits** (if needed):
1. Go to Cloudflare dashboard → Workers
2. Select `iofold` worker
3. Settings → General
4. Adjust:
   - CPU time limit: Default (10ms per request for free, 50ms for paid)
   - Memory: Default (128MB)
   - Request timeout: Default (30s for free, unlimited for paid)

**Set Environment Variables** (non-secret):
```bash
# In wrangler.toml, add:
[env.production.vars]
ENVIRONMENT = "production"
LOG_LEVEL = "info"
CORS_ORIGIN = "https://iofold.com"
```

### 4. Monitor Deployment

**View Live Logs**:
```bash
wrangler tail --env production

# Leave this running in a terminal to monitor requests
```

**Check Metrics**:
1. Go to Cloudflare dashboard → Workers → iofold
2. View "Metrics" tab:
   - Requests per second
   - Success rate
   - CPU time
   - Error rate

---

## Frontend Deployment (Pages)

### 1. Build Frontend

**Production Build**:
```bash
cd /home/ygupta/workspace/iofold/frontend

# Install dependencies (if not already)
npm install

# Build for production
npm run build

# Expected output:
#   ✓ Creating an optimized production build
#   ✓ Compiled successfully
#   ✓ Collecting page data
#   ✓ Generating static pages (12/12)
#   ✓ Finalizing page optimization
#
# Route (app)                  Size     First Load JS
# ┌ ○ /                        5.2 kB    85 kB
# ├ ○ /eval-sets               8.1 kB    93 kB
# ├ ○ /eval-sets/[id]          12 kB     97 kB
# └ ○ /traces                  9.3 kB    94 kB
```

### 2. Deploy to Cloudflare Pages

**Option A: Direct Deployment with Wrangler**:
```bash
# Build Next.js for Cloudflare Pages
npm run pages:build

# Deploy
npm run pages:deploy

# Or manually:
npx wrangler pages deploy .vercel/output/static --project-name=iofold
```

**Option B: Git Integration** (Recommended):
1. Push code to GitHub repository
2. Go to Cloudflare dashboard → Pages
3. Click "Create a project"
4. Connect your GitHub repository
5. Configure build settings:
   - **Build command**: `npm run build`
   - **Build output directory**: `.next` or `.vercel/output/static`
   - **Root directory**: `frontend`
6. Add environment variables:
   - `NEXT_PUBLIC_API_URL`: `https://api.iofold.com`
7. Click "Save and Deploy"
8. Wait for build to complete (~2-3 minutes)

**Option C: Via CI/CD** (Advanced):
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - name: Install and build backend
        run: |
          npm install
          npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      - name: Install and build frontend
        working-directory: ./frontend
        run: |
          npm install
          npm run build
      - name: Deploy frontend
        working-directory: ./frontend
        run: npx wrangler pages deploy .vercel/output/static --project-name=iofold
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### 3. Verify Frontend Deployment

**Test Pages**:
```bash
# Home page
curl -I https://iofold.com

# Should return: HTTP/2 200

# API connectivity
curl https://iofold.com/integrations
# Should load page HTML with API data
```

**Visual Verification**:
1. Open `https://iofold.com` in browser
2. Verify all pages load:
   - Home (`/`)
   - Integrations (`/integrations`)
   - Traces (`/traces`)
   - Eval Sets (`/eval-sets`)
   - Evals (`/evals`)
3. Check browser console for errors (should be 0)
4. Test API calls work (create integration, import traces)

### 4. Configure Pages Settings

**Set Environment Variables**:
1. Go to Pages project → Settings → Environment variables
2. Add:
   - `NEXT_PUBLIC_API_URL`: `https://api.iofold.com`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: `pk_...` (if using Clerk)
3. Save and redeploy

**Configure Redirects** (if needed):
```toml
# In public/_redirects
/api/*  https://api.iofold.com/:splat  200
```

---

## Post-Deployment Verification

### 1. Smoke Tests

**Run E2E Smoke Tests** against production:
```bash
# Update Playwright config to use production URL
# In playwright.config.ts:
# use: {
#   baseURL: 'https://iofold.com',
# }

npx playwright test tests/e2e/01-smoke --project=chromium
```

**Expected Results**:
- TEST-S01: Application Loads ✅
- TEST-S02: API Health Check ✅
- TEST-S03: Database Connectivity ✅
- TEST-S04: Frontend-Backend Communication ✅
- TEST-S05: Basic Navigation ✅

### 2. Manual Testing

**Critical Path Verification**:
1. **Create Account** (if authentication enabled)
   - Sign up with email
   - Verify email
   - Log in

2. **Add Integration**
   - Go to Integrations page
   - Click "Add Integration"
   - Enter Langfuse API keys
   - Test connection
   - Save

3. **Import Traces**
   - Go to Traces page
   - Click "Import Traces"
   - Select integration
   - Set limit to 10
   - Import
   - Verify traces appear

4. **Create Eval Set**
   - Go to Eval Sets page
   - Click "Create Eval Set"
   - Enter name and description
   - Save

5. **Review Traces**
   - Go to trace detail page
   - Click feedback buttons (👍 😐 👎)
   - Verify feedback saved
   - Navigate to next trace

6. **Generate Eval**
   - Go to Eval Set detail page
   - Verify feedback count ≥ 5
   - Click "Generate Eval"
   - Wait for generation to complete
   - View generated Python code

7. **Execute Eval**
   - Go to Evals page
   - Find generated eval
   - Click "Execute"
   - Verify results displayed

### 3. Performance Verification

**Lighthouse Audit**:
```bash
# Install Lighthouse CLI
npm install -g lighthouse

# Run audit
lighthouse https://iofold.com --view

# Target scores:
# - Performance: > 80
# - Accessibility: > 90 (should be 100 after fixes)
# - Best Practices: > 90
# - SEO: > 80
```

**API Response Times**:
```bash
# Health check
time curl https://api.iofold.com/health
# Target: < 100ms

# List traces
time curl -H "Authorization: Bearer YOUR_TOKEN" https://api.iofold.com/api/traces?limit=20
# Target: < 500ms

# Generate eval (will take longer due to LLM)
time curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.iofold.com/api/eval-sets/XXX/generate
# Target: < 5s (LLM time)
```

### 4. Monitoring Setup Verification

**Sentry Error Tracking**:
1. Trigger a test error:
   ```bash
   curl https://api.iofold.com/api/trigger-test-error
   ```
2. Check Sentry dashboard for error
3. Verify error details captured (stack trace, user context, etc.)

**Cloudflare Analytics**:
1. Go to Cloudflare dashboard → Workers → iofold → Metrics
2. Verify data appearing:
   - Requests per second
   - Success rate (should be > 99%)
   - CPU time
   - Error rate (should be < 1%)

**Uptime Monitoring**:
1. Configure uptime monitor (Pingdom, UptimeRobot, etc.)
2. Add checks for:
   - `https://iofold.com` (every 1 minute)
   - `https://api.iofold.com/health` (every 1 minute)
3. Configure alerts (email, Slack, PagerDuty)

### 5. Security Verification

**SSL Certificate**:
```bash
curl -vI https://iofold.com 2>&1 | grep "SSL certificate verify ok"
# Should output: SSL certificate verify ok
```

**Security Headers**:
```bash
curl -I https://iofold.com | grep -E "(Strict-Transport-Security|X-Frame-Options|X-Content-Type-Options)"
# Should see HSTS, X-Frame-Options, X-Content-Type-Options headers
```

**CORS Policy**:
```bash
curl -H "Origin: https://evil.com" -I https://api.iofold.com/api/traces
# Should return 403 or no Access-Control-Allow-Origin header
```

---

## Rollback Procedures

### When to Rollback

Rollback immediately if:
- Error rate > 10% for 5+ minutes
- Critical feature broken (cannot import traces, generate evals)
- Security vulnerability discovered
- Database corruption detected

### Backend Rollback (Workers)

**Option A: Rollback to Previous Deployment**:
```bash
# List recent deployments
wrangler deployments list

# Rollback to previous version
wrangler rollback --message "Rolling back due to [REASON]"
```

**Option B: Deploy Previous Git Commit**:
```bash
# Find last working commit
git log --oneline -10

# Checkout previous commit
git checkout <COMMIT_HASH>

# Deploy
npx wrangler deploy

# Return to latest
git checkout main
```

### Frontend Rollback (Pages)

**Option A: Via Cloudflare Dashboard**:
1. Go to Pages project → Deployments
2. Find previous successful deployment
3. Click "..." → "Rollback to this deployment"
4. Confirm

**Option B: Via Wrangler**:
```bash
# List deployments
wrangler pages deployment list --project-name=iofold

# Rollback to specific deployment
wrangler pages deployment rollback <DEPLOYMENT_ID> --project-name=iofold
```

### Database Rollback

**IMPORTANT**: Database rollbacks are DANGEROUS and can cause data loss.

**Option A: Restore from Backup** (if data exists):
```bash
# Re-import backed up data
wrangler d1 execute iofold-production --file=backup_traces.json
```

**Option B: Reverse Migration** (if schema change only):
```bash
# Create reverse migration (e.g., 002_reverse_add_updated_at.sql)
ALTER TABLE eval_sets DROP COLUMN updated_at;

# Run reverse migration
wrangler d1 execute iofold-production --file=migrations/002_reverse_add_updated_at.sql
```

**Option C: Recreate Database** (LAST RESORT, loses all data):
```bash
# Delete database (DANGEROUS!)
wrangler d1 delete iofold-production

# Recreate
wrangler d1 create iofold-production

# Re-run migrations
wrangler d1 execute iofold-production --file=migrations/001_initial_schema.sql
```

---

## Troubleshooting

### Common Issues

#### Issue: "Worker exceeded CPU time limit"

**Symptoms**:
- API requests timing out
- 503 errors in production

**Cause**: Worker CPU time limit exceeded (10ms for free plan, 50ms for paid)

**Solution**:
```bash
# Check CPU usage in dashboard
# If consistently > 50ms, optimize code:
# 1. Add database indexes
# 2. Reduce LLM prompt size
# 3. Cache expensive operations
# 4. Move to paid plan for higher limits
```

#### Issue: "D1 database not found"

**Symptoms**:
- 500 errors on API calls
- "Database not found" errors in logs

**Cause**: Database ID mismatch in `wrangler.toml`

**Solution**:
```bash
# List databases
wrangler d1 list

# Update wrangler.toml with correct database_id
# Redeploy
npx wrangler deploy
```

#### Issue: "CORS error when calling API"

**Symptoms**:
- Frontend shows CORS errors in console
- API calls fail with "Access-Control-Allow-Origin" error

**Cause**: CORS headers not configured or wrong origin

**Solution**:
```typescript
// In src/api/index.ts
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://iofold.com', // Update origin
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
```

#### Issue: "Secrets not found"

**Symptoms**:
- API returns 500 errors
- Logs show "ENCRYPTION_KEY is undefined"

**Cause**: Secrets not set in production

**Solution**:
```bash
# Set missing secrets
wrangler secret put ENCRYPTION_KEY
wrangler secret put ANTHROPIC_API_KEY

# Verify
wrangler secret list
```

#### Issue: "Next.js page shows 404"

**Symptoms**:
- Some pages load, others show 404
- Dynamic routes fail

**Cause**: Static export incompatible with dynamic routes

**Solution**:
```javascript
// In next.config.js, ensure:
module.exports = {
  output: undefined, // Do NOT set to 'export'
  // OR use Edge Runtime:
  experimental: {
    runtime: 'edge',
  },
}
```

### Monitoring Commands

**View Live Logs**:
```bash
# Backend logs
wrangler tail --env production

# Filter for errors only
wrangler tail --env production --format=pretty | grep ERROR
```

**Query Database**:
```bash
# Count records
wrangler d1 execute iofold-production --command="
SELECT
  (SELECT COUNT(*) FROM traces) AS traces,
  (SELECT COUNT(*) FROM evals) AS evals,
  (SELECT COUNT(*) FROM feedback) AS feedback
"

# Recent errors
wrangler d1 execute iofold-production --command="
SELECT * FROM eval_executions
WHERE result = 'error'
ORDER BY created_at DESC
LIMIT 10
"
```

**Check Worker Status**:
```bash
# Worker info
wrangler whoami

# Worker routes
wrangler routes list
```

### Emergency Contacts

**Escalation Path**:
1. **First Responder**: On-call engineer (see PagerDuty)
2. **Escalation**: Project lead (ygupta)
3. **Critical Issues**: Cloudflare support (if infrastructure issue)

**Support Channels**:
- **Cloudflare Support**: support.cloudflare.com (paid plan required)
- **Internal Slack**: #iofold-ops (if applicable)
- **PagerDuty**: iofold-production (if configured)

---

## Appendix: Configuration Files

### `wrangler.toml` (Backend)
```toml
name = "iofold"
main = "src/index.ts"
compatibility_date = "2025-11-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "iofold-production"
database_id = "YOUR_PRODUCTION_DB_ID"

[env.production]
vars = { ENVIRONMENT = "production", LOG_LEVEL = "info" }
routes = [
  { pattern = "api.iofold.com/*", zone_name = "iofold.com" }
]
```

### `frontend/wrangler.toml` (Frontend)
```toml
name = "iofold-frontend"
compatibility_date = "2025-11-01"
pages_build_output_dir = ".vercel/output/static"

[env.production]
vars = { NEXT_PUBLIC_API_URL = "https://api.iofold.com" }
```

### Environment Variables Summary

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `ENCRYPTION_KEY` | Yes | 32-byte hex key for API key encryption | `a1b2c3...` (64 chars) |
| `ANTHROPIC_API_KEY` | Yes | Claude AI API key | `sk-ant-...` |
| `CLERK_SECRET_KEY` | No | Clerk auth secret (if using Clerk) | `sk_live_...` |
| `SENTRY_DSN` | No | Sentry error tracking DSN | `https://...@sentry.io/...` |
| `NEXT_PUBLIC_API_URL` | Yes | Frontend API URL | `https://api.iofold.com` |
| `ENVIRONMENT` | No | Environment name | `production` |
| `LOG_LEVEL` | No | Logging level | `info` |

---

**Document Version**: 1.0
**Last Updated**: 2025-11-15
**Maintained By**: iofold Platform Team

**Need Help?** See [Troubleshooting](#troubleshooting) or contact ygupta.
