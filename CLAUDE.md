# CLAUDE.md

## Progress Log (Mandatory)
After ANY task: `docs/progress_log.ndjson` (see user CLAUDE.md for jq protocol)

## Project
**iofold.com** - Auto-generate code-based evals from labeled traces via meta-prompting.

| Stack | Tech |
|-------|------|
| Infra | Cloudflare Workers, D1, R2, Pages |
| Frontend | Next.js |
| Backend | TypeScript + Python sandbox |
| Package | **pnpm only** |

## Commands

```bash
# Dev servers
pnpm run dev                    # Backend :8787
cd frontend && pnpm dev         # Frontend :3000

# Tests
pnpm test                       # Unit
cd frontend && pnpm test:e2e    # E2E

# Docker
docker compose up -d            # Start all
docker logs -f iofold-backend   # Logs
docker exec iofold-backend CMD  # Run command

# Deploy to staging (run from repo root)
npx wrangler deploy --env staging                    # Backend → api.staging.iofold.com
cd frontend && pnpm deploy:staging                   # Frontend → platform.staging.iofold.com

# Deploy to production (not yet configured)
# npx wrangler deploy                                # Backend
# cd frontend && pnpm deploy                         # Frontend

# Database (always use migrations, NOT drizzle-kit push)
npx drizzle-kit generate --name NAME                           # Generate
docker exec iofold-backend npx wrangler d1 migrations apply DB --local  # Local
npx wrangler d1 migrations apply DB --remote --env staging     # Staging

# D1 Execute (use binding name for local, database name for remote)
docker exec iofold-backend npx wrangler d1 execute DB --local --command "SQL"                    # Local main DB
docker exec iofold-backend npx wrangler d1 execute BENCHMARKS_DB --local --command "SQL"         # Local benchmarks
npx wrangler d1 execute iofold-staging-db --remote --env staging --command "SQL"                 # Staging main DB
npx wrangler d1 execute iofold-benchmarks --remote --env staging --command "SQL"                 # Staging benchmarks
```

## API
```bash
curl http://localhost:8787/v1/api/agents -H "X-Workspace-Id: workspace_default"
```

## Rules
1. **Docker** - Always use containers for dev
2. **pnpm** - Never npm/yarn
3. **Migrations** - Never `drizzle-kit push` on remote D1
4. **Playwright** - 1920x1080 viewport
5. **Accuracy > speed**

## Staging URLs
| Service | URL |
|---------|-----|
| Backend API | https://api.staging.iofold.com |
| Frontend | https://platform.staging.iofold.com |

## Secrets Management
```bash
# List secrets
npx wrangler secret list --env staging

# Add/update secret
npx wrangler secret put SECRET_NAME --env staging
```

## Gotchas
| Issue | Impact |
|-------|--------|
| `drizzle-kit push` + D1 | FK failures - use migrations |
| Local DB = Staging DB | Data pollution risk |
| No `[env.production]` | Can't deploy to prod |
| DLQ not monitored | Silent job failures |
| Missing secrets on staging | 403/500 errors - check `wrangler secret list` |

## Docs
| Topic | File |
|-------|------|
| Architecture | `docs/2025-11-05-iofold-auto-evals-design.md` |
| Database/Drizzle | `src/db/README.md` |
| Deployment/Docker | `docs/deployment-guide.md` |
| Testing/E2E | `docs/testing-guide.md` |
| ART-E/Enron Setup | `docs/art-e-benchmark.md` |
| Tool Registry | `docs/tool-registry.md` |
| Module Overview | `docs/MODULE_OVERVIEW.md` |

## E2E Auth
```
e2e-test@iofold.com (see frontend/.env.local)
```
