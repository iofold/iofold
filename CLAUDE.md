# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**iofold.com** is an automated evaluation generation platform for AI agents. The platform integrates with existing observability tools (Langfuse, Langsmith, OpenAI) to bootstrap high-quality eval functions through human feedback and meta-prompting.

**Core Value Proposition:** Reduce eval writing time by automatically generating code-based eval functions from labeled trace examples, with continuous refinement based on user feedback.

**Current Status:** Design phase - no implementation yet. All architecture and requirements are documented in `docs/`.

## Architecture

The system is built on **Cloudflare's edge infrastructure** with a plugin architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    iofold.com Platform                       │
│                                                              │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────┐ │
│  │  Trace Adapters │  │  Web Dashboard   │  │  Eval Gen  │ │
│  │                 │  │                  │  │   Engine   │ │
│  │  - Langfuse     │  │  - Trace Review  │  │            │ │
│  │  - Langsmith    │  │  - Feedback UI   │  │  Meta-     │ │
│  │  - OpenAI       │  │  - Eval Mgmt     │  │  Prompting │ │
│  │                 │  │  - Comparison    │  │            │ │
│  └────────┬────────┘  └────────┬─────────┘  └─────┬──────┘ │
│           │                    │                   │        │
│           └────────────────────┼───────────────────┘        │
│                                │                            │
│                    ┌───────────▼──────────┐                 │
│                    │  Cloudflare Workers  │                 │
│                    │  (TypeScript + Python)│                 │
│                    └───────────┬──────────┘                 │
│                                │                            │
│           ┌────────────────────┼────────────────┐           │
│           │                    │                │           │
│      ┌────▼─────┐        ┌────▼────┐      ┌────▼────┐      │
│      │ D1 (DB)  │        │   R2    │      │  Pages  │      │
│      │          │        │ Storage │      │ (Frontend)│      │
│      └──────────┘        └─────────┘      └─────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

- **Infrastructure:** Cloudflare Workers, D1 (SQLite), R2 storage, Pages
- **Frontend:** Next.js or SvelteKit (decision pending)
- **Backend:** TypeScript for orchestration, Python for eval generation
- **Eval Sandbox:** RestrictedPython or deno_python (decision pending)
- **LLM:** Claude/GPT-4 for meta-prompting eval generation

## Key Components

### 1. Trace Adapters
Normalize different trace formats from external platforms into unified `LangGraphExecutionStep` schema:

```typescript
interface LangGraphExecutionStep {
  step_id: string
  trace_id: string
  timestamp: datetime
  messages_added: Message[]
  tool_calls: ToolCall[]
  input: any
  output: any
  metadata: Record<string, any>
  error?: string
}
```

Each adapter implements:
- `authenticate(apiKey: string): Promise<void>`
- `fetchTraces(filter: TraceFilter): Promise<Trace[]>`
- `fetchTraceById(id: string): Promise<Trace>`

**MVP:** Langfuse adapter only. Langsmith/OpenAI deferred.

### 2. Eval Generation Engine
Core meta-prompting system that:
1. Takes 5-10 labeled traces (positive/negative examples)
2. Calls LLM with specialized prompt
3. Generates Python eval function with signature: `def eval_name(trace: dict) -> tuple[bool, str]`
4. Validates syntax and security (allowed imports: `json`, `re`, `typing` only)
5. Tests on training set and computes accuracy
6. Flags low-confidence evals (< 80% accuracy)

**Critical:** Sandboxed execution with 5s timeout, 50MB memory limit, no network/file I/O.

### 3. Web Dashboard
Four main screens:
- **Trace Review:** Swipe interface for labeling traces (👍 👎 😐)
- **Eval Management:** View generated evals, code viewer, version history
- **Comparison Matrix:** Human ratings vs eval predictions with contradiction highlighting
- **Eval Sets:** Organize feedback collections

### 4. Eval Refinement Workflow
User-triggered process when contradictions detected:
1. Fetch original training examples + contradicting cases
2. Re-run generation with expanded dataset
3. Create new version (e.g., v1.2 → v1.3)
4. Test against ALL examples
5. User chooses to deploy, rollback, or collect more data

## Database Schema (Cloudflare D1)

Core tables:
- `users`, `workspaces` - Multi-tenancy
- `integrations` - Platform connections (encrypted API keys)
- `traces` - Imported and normalized traces
- `eval_sets` - Collections of traces for training
- `feedback` - User ratings (positive/negative/neutral)
- `evals` - Generated Python functions with versioning
- `eval_executions` - Results of running evals on traces

Key view: `eval_comparison` - Links executions to human feedback for contradiction detection.

## Design Principles

1. **Quality First** - Eval accuracy paramount; optimize for correctness over speed
2. **Plugin Architecture** - Integrate with existing tools, don't replace them
3. **User Control** - User-triggered refinement, explicit generation thresholds
4. **Code-First Evals** - Prioritize deterministic code-based evals over LLM judges
5. **Pragmatic MVP** - Start with LangGraph single-step traces, expand to multi-turn later

## MVP Scope (12 weeks)

**In Scope:**
- Langfuse adapter only
- Single-step LangGraph execution traces
- Code-based Python eval generation
- Basic thumbs up/down/neutral feedback
- User-triggered refinement only
- Manual trace import workflow

**Explicitly Deferred:**
- Multi-turn conversation evals
- LLM-based eval generation
- Trace minification/summarization
- Auto-refinement on threshold
- Langsmith/OpenAI adapters
- Real-time trace streaming

## Critical Technical Decisions Pending

1. **Frontend Framework:** Next.js vs SvelteKit
2. **Python Runtime:** RestrictedPython vs deno_python vs external service
3. **Auth Provider:** Cloudflare Access vs Clerk vs Auth0
4. **LLM Provider:** Claude vs GPT-4 for eval generation

## Security Constraints

**Python Sandbox MUST enforce:**
- Whitelist imports only: `json`, `re`, `typing`
- 5-second timeout
- 50MB memory limit
- No network access
- No file I/O
- No subprocess execution
- Static analysis pre-execution to reject dangerous code

## Success Metrics (3 months)

**Primary:** 10+ teams actively using platform

**Supporting:**
- 100+ eval functions generated
- 80%+ average eval accuracy
- 1,000+ traces reviewed with feedback
- < 5 second eval execution time (p95)

## Documentation

- **Design Doc:** `docs/2025-11-05-iofold-auto-evals-design.md` - Complete system architecture
- **Implementation Tasks:** `docs/2025-11-05-iofold-evals-todo.md` - Phase-by-phase breakdown
- **Success Criteria:** `docs/success_criteria.md`

## Development Philosophy

When implementing:
1. Consult design doc first - all architectural decisions are documented
2. Prioritize eval accuracy over speed or features
3. Build for Cloudflare edge constraints (CPU limits, cold starts)
4. Test sandbox security extensively - this is a critical attack surface
5. Start with Langfuse only - resist scope creep to other platforms
6. User must explicitly trigger eval generation and refinement (no auto-magic)
