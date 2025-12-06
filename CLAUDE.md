# CLAUDE.md

## MANDATORY: Progress Log Updates

After completing ANY task, append to `docs/progress_log.ndjson` using jq (see user CLAUDE.md for protocol). A Stop hook blocks if not updated.

## Project Overview

**iofold.com** - Automated eval generation platform for AI agents. Integrates with observability tools (Langfuse, Langsmith, OpenAI) to generate code-based eval functions from labeled traces via meta-prompting.

## Tech Stack

- **Infra:** Cloudflare Workers, D1, R2, Pages
- **Frontend:** Next.js (React)
- **Backend:** TypeScript + Python (eval generation)
- **Package Manager:** pnpm only (no npm/yarn)

## Key Documentation

- `docs/2025-11-05-iofold-auto-evals-design.md` - Full architecture
- `docs/2025-11-05-iofold-evals-todo.md` - Implementation tasks
- `docs/success_criteria.md` - Success metrics

## Development Rules

1. **pnpm only** - Use `pnpm` for all package management
2. **Consult design docs first** - Architecture decisions are documented
3. **Langfuse only for MVP** - Resist scope creep
4. **User-triggered actions** - No auto-magic for eval generation/refinement
5. **Eval accuracy > speed** - Quality is paramount

## Security: Python Sandbox

Eval execution MUST enforce:
- Whitelist imports: `json`, `re`, `typing` only
- 5s timeout, 50MB memory limit
- No network/file I/O/subprocess

## Core Schema

Key tables: `users`, `workspaces`, `integrations`, `traces`, `eval_sets`, `feedback`, `evals`, `eval_executions`

Traces normalized to `LangGraphExecutionStep` schema (see design doc).