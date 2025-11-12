# iofold.com Deployment Guide

**Date:** November 12, 2025
**Target Platform:** Cloudflare (Workers + D1 + Pages)
**Estimated Time:** 1.5 hours for first deployment

---

## Overview

This guide walks through deploying iofold.com from local development to production on Cloudflare's edge platform. The application consists of three main components:

1. **Backend API** - Cloudflare Workers (TypeScript)
2. **Database** - Cloudflare D1 (SQLite)
3. **Frontend** - Cloudflare Pages (Next.js)

---

## Prerequisites

### Required Accounts
- [ ] Cloudflare account (free tier works for dev, paid for Sandbox SDK)
- [ ] Anthropic API key (for Claude LLM)
- [ ] Langfuse API key (for trace import)
- [ ] Clerk account (for authentication)
- [ ] GitHub account (for Pages deployment)

### Required Tools
```bash
# Node.js 18+ required
node --version  # Should be v18.0.0 or higher

# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

### Repository Setup
```bash
git clone https://github.com/yourorg/iofold.git
cd iofold
npm install
```

---

## Part 1: Database Deployment (5 minutes)

### 1.1 Create Production D1 Database

```bash
# Create production database
npx wrangler d1 create iofold-production

# Output will show:
# [[d1_databases]]
# binding = "DB"
# database_name = "iofold-production"
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# Copy the database_id for next step
```

### 1.2 Update wrangler.toml

Edit `wrangler.toml` and replace the database_id:

```toml
[[d1_databases]]
binding = "DB"
database_name = "iofold-production"
database_id = "YOUR_DATABASE_ID_HERE"  # Replace with actual ID from above
```

### 1.3 Apply Database Schema

```bash
# Apply schema to production database
npx wrangler d1 execute iofold-production --file=./src/db/schema.sql

# Verify tables created
npx wrangler d1 execute iofold-production --command="SELECT name FROM sqlite_master WHERE type='table'"

# Expected output: users, workspaces, integrations, traces, eval_sets, feedback, evals, eval_executions, jobs, workspace_members
```

### 1.4 (Optional) Load Seed Data

For testing purposes only:

```bash
# Load sample data
npx wrangler d1 execute iofold-production --file=./src/db/seed.sql

# Verify data loaded
npx wrangler d1 execute iofold-production --command="SELECT COUNT(*) FROM traces"
```

**⚠️ Warning:** Don't load seed data in actual production - it's test data only!

---

## Part 2: Backend API Deployment (15 minutes)

### 2.1 Configure Environment Secrets

```bash
# Set Anthropic API key (required for eval generation)
npx wrangler secret put ANTHROPIC_API_KEY
# Paste your key when prompted

# Set default workspace ID (optional)
npx wrangler secret put DEFAULT_WORKSPACE_ID
# Paste a UUID or leave empty
```

### 2.2 Update wrangler.toml for Production

Verify your `wrangler.toml` has production settings:

```toml
name = "iofold-api"
main = "src/index.ts"
compatibility_date = "2024-11-01"
compatibility_flags = ["nodejs_compat"]

# Production D1 database
[[d1_databases]]
binding = "DB"
database_name = "iofold-production"
database_id = "YOUR_DATABASE_ID"

# Cloudflare Sandbox for Python execution
[[services]]
binding = "Sandbox"
service = "cloudflare/sandbox"

[vars]
ENVIRONMENT = "production"
```

### 2.3 Test Locally

```bash
# Run local dev server
npm run dev

# Test endpoints in another terminal
curl http://localhost:8787/health

# Expected: {"status":"ok","timestamp":"..."}
```

### 2.4 Deploy to Cloudflare Workers

```bash
# Deploy backend
npm run deploy

# Output will show:
# Published iofold-api (X.XX sec)
#   https://iofold-api.your-subdomain.workers.dev

# Save this URL for frontend configuration
```

### 2.5 Verify Deployment

```bash
# Test production endpoint
curl https://iofold-api.your-subdomain.workers.dev/health

# Test database connection
curl https://iofold-api.your-subdomain.workers.dev/api/eval-sets \
  -H "Authorization: Bearer YOUR_TEST_TOKEN" \
  -H "X-Workspace-Id: test-workspace"

# Expected: {"eval_sets":[]}
```

---

## Part 3: Frontend Deployment (10 minutes)

### 3.1 Configure Environment Variables

Create `frontend/.env.production`:

```bash
# API endpoint (from Part 2.4)
NEXT_PUBLIC_API_URL=https://iofold-api.your-subdomain.workers.dev/v1

# Clerk authentication (get from Clerk dashboard)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...

# Clerk redirect URLs
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
```

### 3.2 Build for Production

```bash
cd frontend

# Install dependencies
npm install

# Build static export
npm run build

# Output will be in frontend/out/
```

### 3.3 Deploy to Cloudflare Pages

**Option A: Automatic (via GitHub)**

1. Push code to GitHub
2. Go to Cloudflare Dashboard > Pages
3. Click "Create a project" > "Connect to Git"
4. Select your repository
5. Configure build settings:
   - **Framework preset:** Next.js
   - **Build command:** `npm run build`
   - **Build output directory:** `out`
   - **Root directory:** `frontend`
6. Add environment variables from step 3.1
7. Click "Save and Deploy"

**Option B: Manual (via CLI)**

```bash
# Deploy directly from CLI
npx wrangler pages deploy out \
  --project-name iofold-frontend \
  --branch main

# Output will show:
# ✨ Deployment complete!
# https://iofold-frontend.pages.dev
```

### 3.4 Configure Custom Domain (Optional)

1. Go to Cloudflare Dashboard > Pages > iofold-frontend
2. Click "Custom domains"
3. Add your domain (e.g., `app.iofold.com`)
4. Follow DNS configuration instructions
5. Wait for SSL certificate provisioning (5-10 minutes)

---

## Part 4: Authentication Setup (15 minutes)

### 4.1 Create Clerk Application

1. Go to https://dashboard.clerk.com
2. Create new application: "iofold Production"
3. Enable email/password authentication
4. Copy API keys to `frontend/.env.production`

### 4.2 Configure Clerk Settings

**Paths:**
- Sign-in URL: `/sign-in`
- Sign-up URL: `/sign-up`
- After sign-in: `/`
- After sign-up: `/`

**Session settings:**
- Session lifetime: 7 days
- Require 2FA: No (optional later)

**Allowed redirect URLs:**
- `https://app.iofold.com/*`
- `https://iofold-frontend.pages.dev/*`

### 4.3 Test Authentication

1. Visit your deployed frontend URL
2. Click "Sign In"
3. Create test account
4. Verify redirect to dashboard

---

## Part 5: Integration Testing (30 minutes)

### 5.1 Connect Langfuse Integration

1. Sign in to deployed app
2. Go to Integrations page
3. Click "Connect Langfuse"
4. Enter Langfuse API key
5. Click "Test Connection"
6. Verify status shows "Active"

### 5.2 Import Traces

1. Go to Traces page
2. Click "Import Traces"
3. Select Langfuse integration
4. Set filters (date range, limit: 10)
5. Click "Import"
6. Wait for job to complete (~10 seconds)
7. Verify traces appear in list

### 5.3 Create Eval Set and Add Feedback

1. Go to Eval Sets page
2. Click "Create Eval Set"
3. Name: "test-quality"
4. Minimum examples: 5
5. Click "Create"
6. Go to Traces page
7. Click on each trace
8. Rate with 👍 or 👎 (at least 5 total)
9. Verify progress shows "5 of 5 examples"

### 5.4 Generate Eval Function

1. Go to Eval Sets page
2. Click on "test-quality"
3. Click "Generate Eval"
4. Name: "test_quality_check"
5. Click "Generate"
6. Watch SSE progress stream
7. Wait for completion (~30 seconds)
8. Verify accuracy shown (should be 80-100%)
9. Click "View Code" to see generated Python

### 5.5 Execute Eval Against Traces

1. Go to Evals page
2. Click on "test_quality_check"
3. Click "Execute"
4. Select "All traces in eval set"
5. Click "Execute"
6. Watch progress (~2 seconds per trace)
7. Verify executions complete

### 5.6 View Comparison Matrix

1. Go to Matrix page
2. Select eval set: "test-quality"
3. Select eval: "test_quality_check"
4. Click "Load Matrix"
5. Verify rows show:
   - Trace ID
   - Human rating (👍/👎)
   - Eval prediction (✓/✗)
   - Reason
6. Look for contradictions (red highlights)
7. Click on a cell to see detail

### 5.7 Verify End-to-End Flow

**Complete workflow test:**
- [ ] Import traces from Langfuse → Working
- [ ] Create eval set → Working
- [ ] Add feedback (5+ examples) → Working
- [ ] Generate eval function → Working
- [ ] Execute eval against traces → Working
- [ ] View matrix with predictions → Working
- [ ] Drill into contradiction detail → Working

**If any step fails, see Troubleshooting section below.**

---

## Part 6: Monitoring & Observability (15 minutes)

### 6.1 Set Up Cloudflare Analytics

1. Go to Cloudflare Dashboard > Workers > iofold-api
2. Click "Metrics & Analytics"
3. Verify requests showing up
4. Check error rate (should be <1%)

### 6.2 Set Up Sentry (Error Tracking)

```bash
# Install Sentry SDK
npm install @sentry/cloudflare

# Add to src/index.ts
import * as Sentry from '@sentry/cloudflare';

Sentry.init({
  dsn: 'YOUR_SENTRY_DSN',
  environment: 'production',
  tracesSampleRate: 0.1
});

# Redeploy
npm run deploy
```

### 6.3 Configure Alerts

**Cloudflare Notifications:**
1. Go to Dashboard > Notifications
2. Create alert:
   - Event: Worker Error Rate
   - Condition: > 5%
   - Notification: Email

**Sentry Alerts:**
1. Go to Sentry Dashboard
2. Create alert rule:
   - Condition: Error count > 10 in 5 minutes
   - Action: Email team

### 6.4 Health Check Monitoring

Set up external monitoring (e.g., UptimeRobot, Pingdom):
- URL: `https://iofold-api.your-subdomain.workers.dev/health`
- Interval: 5 minutes
- Alert on: Status code != 200

---

## Post-Deployment Checklist

### Security
- [ ] API keys stored as Wrangler secrets (not in code)
- [ ] CORS configured properly
- [ ] Rate limiting enabled (TODO: implement)
- [ ] SQL injection protections verified (prepared statements)
- [ ] Python sandbox security tested

### Performance
- [ ] Database queries using indexes
- [ ] Cursor pagination working
- [ ] SSE streams tested with slow connections
- [ ] Frontend bundle size < 500KB
- [ ] API response times < 100ms (p95)

### Reliability
- [ ] Error handling tested (invalid inputs)
- [ ] Timeout handling tested (slow LLM responses)
- [ ] Job cancellation tested
- [ ] Database rollback on errors
- [ ] Graceful degradation if Sandbox unavailable

### Documentation
- [ ] API documentation published
- [ ] User guide written
- [ ] Deployment guide (this doc) updated
- [ ] Troubleshooting guide created
- [ ] Changelog started

---

## Troubleshooting

### Database Issues

**Problem:** `Error: D1_ERROR: no such table: traces`

**Solution:**
```bash
# Re-apply schema
npx wrangler d1 execute iofold-production --file=./src/db/schema.sql
```

---

**Problem:** `Error: D1_ERROR: UNIQUE constraint failed`

**Solution:**
```bash
# Clear database and re-import
npx wrangler d1 execute iofold-production --command="DELETE FROM traces WHERE id LIKE 'test%'"
```

---

### Backend API Issues

**Problem:** `500 Internal Server Error` on all endpoints

**Solution:**
```bash
# Check Wrangler logs
npx wrangler tail iofold-api

# Look for errors in output
# Common issues:
# - Missing ANTHROPIC_API_KEY secret
# - Database binding not configured
# - Sandbox binding not configured
```

---

**Problem:** `Error: Sandbox binding not found`

**Solution:**

Check `wrangler.toml` has Sandbox binding:
```toml
[[services]]
binding = "Sandbox"
service = "cloudflare/sandbox"
```

Verify Cloudflare account has Workers Paid plan (Sandbox requires paid).

---

**Problem:** `429 Too Many Requests` from Anthropic

**Solution:**

Anthropic rate limits:
- Tier 1: 50 requests/min
- Tier 2: 1000 requests/min

Either:
1. Upgrade Anthropic tier
2. Add retry logic with backoff (already implemented)
3. Rate limit eval generation on frontend

---

### Frontend Issues

**Problem:** Frontend shows "Failed to fetch" on all API calls

**Solution:**

1. Check `NEXT_PUBLIC_API_URL` in `.env.production`
2. Verify backend deployed and accessible
3. Check browser console for CORS errors
4. Add CORS headers to backend (already implemented)

---

**Problem:** Authentication redirect loop

**Solution:**

Check Clerk configuration:
1. Allowed redirect URLs include your domain
2. Sign-in/sign-up paths match `.env` settings
3. Clear browser cookies and try again

---

**Problem:** "Hydration error" on page load

**Solution:**

Next.js SSR issue. Check:
1. No `window` access in server components
2. Date/time rendering matches server/client
3. Rebuild with `npm run build`

---

### Python Sandbox Issues

**Problem:** `Execution timeout exceeded 5000ms`

**Solution:**

Eval function taking too long:
1. Check generated code for infinite loops
2. Increase timeout in `python-runner.ts` (max 30s)
3. Simplify eval logic

---

**Problem:** `ModuleNotFoundError: No module named 'X'`

**Solution:**

Only `json`, `re`, `typing` are whitelisted. Eval tried to import something else.

1. Check static validation caught it
2. If not, improve validation regex
3. Re-generate eval with clearer instructions

---

### Job System Issues

**Problem:** Jobs stuck in "running" status forever

**Solution:**

1. Check job timeout (default 5 minutes)
2. Look at job error messages
3. Re-run stuck jobs:
```bash
npx wrangler d1 execute iofold-production --command="UPDATE jobs SET status='failed', error='Manual timeout' WHERE status='running' AND created_at < datetime('now', '-10 minutes')"
```

---

**Problem:** SSE connection drops immediately

**Solution:**

1. Browser limits SSE connections (max 6 per domain)
2. Close other tabs with SSE streams
3. Check Cloudflare Worker CPU time not exceeded
4. Verify heartbeat being sent (every 30s)

---

## Rollback Procedure

If deployment fails or has critical issues:

### Rollback Backend

```bash
# List recent deployments
npx wrangler deployments list

# Rollback to previous deployment
npx wrangler rollback <deployment-id>
```

### Rollback Frontend

**Via Cloudflare Dashboard:**
1. Go to Pages > iofold-frontend > Deployments
2. Find previous working deployment
3. Click "..." > "Rollback to this deployment"

**Via CLI:**
```bash
# Re-deploy previous commit
git checkout <previous-commit-hash>
cd frontend
npm run build
npx wrangler pages deploy out
```

### Rollback Database

**⚠️ Warning:** D1 doesn't support automatic rollbacks. Manual process:

1. Export current data:
```bash
npx wrangler d1 export iofold-production --output=backup.sql
```

2. Apply previous schema:
```bash
npx wrangler d1 execute iofold-production --file=./src/db/schema_backup.sql
```

3. Re-import data:
```bash
npx wrangler d1 execute iofold-production --file=backup.sql
```

**Best practice:** Always test migrations in dev first!

---

## Performance Optimization

### After Initial Deployment

1. **Enable R2 Caching** (deferred from MVP)
   - Cache imported traces in R2
   - Reduce Langfuse API calls
   - Save bandwidth

2. **Add CDN Caching**
   - Cache static assets (frontend)
   - Add `Cache-Control` headers
   - Use Cloudflare's edge caching

3. **Optimize Database Queries**
   - Analyze slow queries
   - Add missing indexes
   - Use `EXPLAIN QUERY PLAN`

4. **Bundle Optimization**
   - Code split frontend routes
   - Lazy load Monaco editor
   - Tree-shake unused libraries

---

## Scaling Considerations

### Current Limits (Free/Paid Tier)

**Cloudflare Workers:**
- CPU: 50ms per request (paid) / 10ms (free)
- Requests: 10M/month (paid) / 100k/day (free)
- Duration: 30 seconds (Unbound Workers)

**Cloudflare D1:**
- Reads: 5M/day (paid) / 50k/day (free)
- Writes: 100k/day (paid) / 50k/day (free)
- Storage: 5GB (paid) / 500MB (free)

**Cloudflare Sandbox:**
- Requires Workers Paid plan
- Billed per execution time

### When to Upgrade

**Signs you need paid tier:**
- > 50k traces imported per day
- > 100 eval generations per day
- > 1000 concurrent users
- Need more CPU time for complex evals

**Upgrade path:**
1. Workers Paid: $5/month
2. D1 Paid: Included with Workers Paid
3. Sandbox: Usage-based pricing

---

## Next Steps

### After Successful Deployment

1. **User Testing**
   - Invite alpha users
   - Collect feedback
   - Monitor for errors

2. **Documentation**
   - Write user guide
   - Record demo videos
   - Create FAQ

3. **Marketing**
   - Set up landing page
   - Write launch post
   - Share on social media

4. **Iterate**
   - Fix bugs from testing
   - Add requested features
   - Improve performance

---

## Support

**Issues?**
- Check logs: `npx wrangler tail iofold-api`
- Review docs: `docs/` folder
- Open issue: GitHub Issues

**Questions?**
- API Reference: `docs/plans/2025-11-12-api-specification.md`
- Architecture: `docs/2025-11-05-iofold-auto-evals-design.md`
- Progress: `docs/2025-11-12-implementation-progress.md`

---

**Last Updated:** 2025-11-12
**Version:** 1.0
**Target:** MVP Deployment
