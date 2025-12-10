# iofold Documentation

**Welcome to the iofold platform documentation.** This directory contains all design documents, implementation guides, and operational documentation for the automated evaluation generation platform.

**Last Updated**: 2025-12-10
**Project Status**: MVP Ready

---

## Quick Navigation

### Getting Started
- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [Development Setup](#development-setup)

### Key Documents
- [API Specification](./API_SPECIFICATION.md) - Complete REST API reference
- [Module Overview](./MODULE_OVERVIEW.md) - Codebase structure and modules
- [Deployment Guide](./deployment-guide.md) - Environments, secrets, gotchas
- [Testing Guide](./testing-guide.md) - E2E + Unit + API testing
- [Tool Registry](./tool-registry.md) - DB-driven tool management
- [ART-E Benchmark](./art-e-benchmark.md) - Email task benchmark

---

## Project Overview

**iofold.com** is an automated evaluation generation platform for AI agents. The platform integrates with observability tools (Langfuse) to bootstrap high-quality eval functions through human feedback and meta-prompting.

### Core Value Proposition
Reduce eval writing time by automatically generating code-based eval functions from labeled trace examples, with continuous refinement based on user feedback and agent version comparison.

### Key Features
- **Trace Import**: Connect to Langfuse and import execution traces
- **Agent Management**: Discover, confirm, and version AI agents from trace patterns
- **Eval Generation**: AI-powered Python eval function generation using Claude
- **Eval Execution**: Secure Python sandbox with whitelist imports
- **Matrix Analysis**: Compare human feedback vs eval predictions
- **Job Queue**: Robust background processing with retry logic

---

## Architecture

### Tech Stack
- **Backend**: Cloudflare Workers (TypeScript)
- **Frontend**: Next.js 15 (React 18)
- **Database**: Cloudflare D1 (SQLite)
- **Package Manager**: pnpm

### Infrastructure Services
| Service | Purpose |
|---------|---------|
| Cloudflare Workers | API backend (port 8787) |
| Cloudflare Pages | Frontend hosting (port 3000) |
| Cloudflare D1 | SQLite database |
| Cloudflare Queues | Background job processing |
| Cloudflare Sandbox | Python eval execution |
| Cloudflare Vectorize | Prompt similarity clustering |

### Database Schema (22 Tables)
| Category | Tables |
|----------|--------|
| **Core** | users, workspaces, workspace_members, integrations, traces |
| **Evals** | eval_sets, feedback, evals, eval_executions |
| **Agents** | agents, agent_versions, functions, agent_functions |
| **Tools** | tools, agent_tools |
| **Jobs** | jobs, job_retry_history |
| **Monitoring** | system_prompts, performance_snapshots, performance_alerts |

---

## Development Setup

### Prerequisites
- Node.js 20+
- pnpm (not npm/yarn)
- Cloudflare account

### Quick Start
```bash
# Clone repository
git clone <repo-url>
cd iofold

# Install dependencies
pnpm install
cd frontend && pnpm install && cd ..

# Start development servers
./dev.sh

# Servers run on:
# - Backend: http://localhost:8787
# - Frontend: http://localhost:3000
```

### Environment Variables
Create `.env` files from examples:
```bash
# Backend (.env)
ANTHROPIC_API_KEY=sk-ant-...
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...

# Frontend (frontend/.env.local)
NEXT_PUBLIC_API_URL=http://localhost:8787/v1
```

---

## API Endpoints Summary

### Core Resources
| Resource | Endpoints | Description |
|----------|-----------|-------------|
| Integrations | 5 | Connect observability platforms |
| Traces | 6 | Import and manage traces |
| Feedback | 4 | Human annotations on traces |
| Evals | 8 | Generate and execute eval functions |
| Agents | 10 | Agent discovery and version management |
| Jobs | 7 | Background job monitoring |

See [API Specification](./API_SPECIFICATION.md) for complete documentation.

---

## Frontend Routes

| Route | Purpose |
|-------|---------|
| `/` | Dashboard with KPIs and trends |
| `/integrations` | Platform connections |
| `/agents` | Agent management |
| `/agents/[id]` | Agent detail and versions |
| `/traces` | Trace explorer |
| `/evals` | Evaluation results |
| `/evals/[id]` | Eval detail with code |
| `/review` | Quick feedback interface |
| `/matrix` | Agent version comparison |
| `/matrix/[agent_id]` | Detailed trace matrix |
| `/settings` | User preferences |
| `/system` | System monitoring |
| `/resources` | Usage and budgets |
| `/setup` | First-time setup wizard |

---

## Job Queue System

### Job Types (10)
| Type | Description |
|------|-------------|
| `import` | Import traces from external platform |
| `generate` | Generate eval function with Claude |
| `execute` | Run eval on traces |
| `monitor` | Performance monitoring (cron) |
| `auto_refine` | Auto-improve evals on threshold |
| `agent_discovery` | Cluster traces to discover agents |
| `prompt_improvement` | AI-improve agent prompts |
| `prompt_evaluation` | Evaluate candidate prompts |
| `template_drift` | Detect prompt changes |
| `eval_revalidation` | Re-test evals on new traces |

### Error Handling
- **9 error categories** for intelligent retry decisions
- **Exponential backoff** for transient errors
- **Dead letter queue** for permanent failures
- **Retry history tracking** for audit

---

## Testing

### Running Tests
```bash
# Backend unit tests (Vitest)
pnpm test

# Backend E2E tests (Playwright)
pnpm exec playwright test

# Frontend E2E tests
cd frontend && pnpm run test:e2e
```

### Test Coverage
- **32 backend E2E test files** covering all API endpoints
- **4 frontend E2E test files** including accessibility tests
- **Fixtures and helpers** for test data seeding

---

## Documentation Files

### Primary Docs
| File | Description |
|------|-------------|
| [API_SPECIFICATION.md](./API_SPECIFICATION.md) | Complete REST API documentation |
| [MODULE_OVERVIEW.md](./MODULE_OVERVIEW.md) | Codebase architecture and modules |
| [deployment-guide.md](./deployment-guide.md) | Environments, secrets, deploy commands |
| [testing-guide.md](./testing-guide.md) | E2E, Unit, API testing |
| [tool-registry.md](./tool-registry.md) | Tool management system |
| [art-e-benchmark.md](./art-e-benchmark.md) | ART-E email benchmark |
| [CHANGELOG.md](./CHANGELOG.md) | Version history |

### Implementation Plans (docs/plans/)
Recent plans for reference:
- `2025-11-30-job-queue-enhancements.md` - Job retry system design
- `2025-11-28-agent-jobs-design.md` - Agent background jobs
- `2025-11-27-agent-management-design.md` - Agent discovery/versioning

---

## Security

### Python Sandbox Constraints
- **Whitelist imports**: `json`, `re`, `typing` only
- **Timeout**: 5 seconds
- **Memory limit**: 50MB
- **No network/file I/O**

### API Key Encryption
- **Production**: AES-GCM with PBKDF2 key derivation
- **Development**: Base64 encoding (non-secure)

### Multi-tenancy
- All queries filtered by `workspace_id`
- `X-Workspace-Id` header required on all requests

---

## Contributing

### Development Rules
1. **pnpm only** - Use pnpm for all package management
2. **Consult design docs** - Architecture decisions are documented in plans/
3. **Langfuse only for MVP** - Resist scope creep to other platforms
4. **User-triggered actions** - No auto-magic for eval generation
5. **Eval accuracy > speed** - Quality is paramount

### Progress Tracking
All work should be logged in [docs/progress_log.ndjson](./progress_log.ndjson) (NDJSON format).

---

## Support

**Project Lead**: ygupta
**Repository**: /home/ygupta/workspace/iofold

For questions:
1. Check relevant documentation
2. Search docs/plans/ for design decisions
3. Review progress_log.md for recent changes

---

**Last Updated**: 2025-12-10
