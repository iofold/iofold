# CLAUDE.md

## MANDATORY: Progress Log
After ANY task, append to `docs/progress_log.ndjson` (see user CLAUDE.md for jq protocol).

## Project Overview
**iofold.com** - Auto-generate code-based evals from labeled traces via meta-prompting.

| Stack | Technology |
|-------|------------|
| Infra | Cloudflare Workers, D1, R2, Pages |
| Frontend | Next.js (React) |
| Backend | TypeScript + Python sandbox |
| Package Manager | **pnpm only** |

## Quick Reference

| Task | Command |
|------|---------|
| Dev server (backend) | `pnpm run dev` → `:8787` |
| Dev server (frontend) | `cd frontend && pnpm dev` → `:3000` |
| Unit tests | `pnpm test` |
| E2E tests | `cd frontend && pnpm test:e2e` |
| Deploy staging | `wrangler deploy --env staging` |
| ART-E benchmark | `npx tsx scripts/run-art-e-benchmark.ts --agent ID --limit 10` |

## Database Migrations

Drizzle generates migrations in `drizzle/`. Apply using Wrangler's migration system (tracks applied migrations in `d1_migrations` table).

**Generate migration after schema changes:**
```bash
pnpm drizzle-kit generate
```

**Local (Docker):** Must run from inside the container:
```bash
docker exec iofold-backend npx wrangler d1 migrations apply DB --local
```

**Staging:** Run from host with `--remote`:
```bash
npx wrangler d1 migrations apply DB --remote --env staging
```

## Documentation

| Guide | Path | Contents |
|-------|------|----------|
| Architecture | `docs/2025-11-05-iofold-auto-evals-design.md` | Full system design |
| Testing | `docs/testing-guide.md` | E2E + Unit + API testing |
| Deployment | `docs/deployment-guide.md` | Envs, secrets, gotchas |
| Tool Registry | `docs/tool-registry.md` | DB schema, API, handlers |
| ART-E Benchmark | `docs/art-e-benchmark.md` | CLI, scoring, Enron DB |

## Enron Email Setup (ART-E Benchmark)

The ART-E benchmark requires Enron emails in BENCHMARKS_DB.

**1. Create schema (if not exists):**
```bash
docker exec iofold-backend npx wrangler d1 execute BENCHMARKS_DB --local --file=/app/scripts/setup-enron-db.sql
```

**2. Import emails (downloads from HuggingFace `corbt/enron-emails`):**
```bash
bun scripts/import-enron-batched.ts --limit 10000  # Local
bun scripts/import-enron-batched.ts --limit 10000 --remote  # Staging
```

**3. Verify:**
```bash
docker exec iofold-backend npx wrangler d1 execute BENCHMARKS_DB --local --command="SELECT COUNT(*) FROM emails;"
```

| Module Overview | `docs/MODULE_OVERVIEW.md` | Code walkthrough |

## Development Rules
1. **pnpm only** - Never npm/yarn
2. **Consult design docs** - Architecture is documented
3. **Langfuse only (MVP)** - No scope creep
4. **User-triggered** - No auto-magic for eval gen
5. **Accuracy > speed** - Quality paramount

## Security: Python Sandbox
Evals run in container with: `json`, `re`, `typing` only | 5s timeout | 50MB RAM | No network/filesystem

## Core Schema
Tables: `users`, `workspaces`, `agents`, `traces`, `evals`, `tools`, `agent_tools`

## Key Gotchas
| Issue | Impact |
|-------|--------|
| Local DB = Staging DB | Data pollution risk |
| No `[env.production]` | Can't deploy to prod |
| DLQ not monitored | Silent job failures |
| ENCRYPTION_KEY fallback | Uses weak default |

## Test Auth (E2E)
```
Email: e2e-test@iofold.com
Pass:  (see frontend/.env.local or 1Password)
```
No 2FA enabled - works without OTP verification.

## API Pattern
```bash
curl http://localhost:8787/v1/api/agents -H "X-Workspace-Id: workspace_default"
```
All endpoints require `X-Workspace-Id` header.
