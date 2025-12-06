# iofold Validation Prototype

**Status:** Pre-Implementation Validation Phase

This is a prototype implementation to validate core technical assumptions before building the full iofold.com platform.

## What This Validates

- Langfuse trace fetching and normalization
- Python eval code execution sandbox (prototype)
- LLM-based eval generation quality
- Cost analysis at scale
- Cloudflare Workers + D1 architecture

## Architecture

- **Runtime:** Cloudflare Workers (TypeScript)
- **Database:** D1 (SQLite)
- **LLM:** Claude 3.5 Sonnet via Anthropic API
- **Trace Source:** Langfuse
- **Python Sandbox:** Node.js vm module (prototype only)

```
┌─────────────────────────────────────────────────────────┐
│                  Cloudflare Workers                     │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Langfuse   │  │     Eval     │  │    Python    │ │
│  │   Adapter    │  │  Generator   │  │   Sandbox    │ │
│  │              │  │              │  │  (Prototype) │ │
│  │  Normalize   │  │ Meta-Prompt  │  │              │ │
│  │   Traces     │  │   Claude     │  │   Validate   │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                 │                  │         │
│         └─────────────────┼──────────────────┘         │
│                           │                            │
│                    ┌──────▼──────┐                     │
│                    │  D1 SQLite  │                     │
│                    │   Database  │                     │
│                    └─────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment

Create `.env` file (based on `.env.example`):

```bash
cp .env.example .env
```

Fill in your API keys:
- `LANGFUSE_PUBLIC_KEY` - From Langfuse settings
- `LANGFUSE_SECRET_KEY` - From Langfuse settings
- `ANTHROPIC_API_KEY` - From Anthropic console
- `LANGFUSE_BASE_URL` - (Optional) Default: https://cloud.langfuse.com

### 3. Create D1 Database

```bash
npx wrangler d1 create iofold_validation
```

This will output a database ID. Copy it and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "iofold_validation"
database_id = "YOUR_DATABASE_ID_HERE"  # Replace this
```

### 4. Apply Database Schema

```bash
# Local development database
npx wrangler d1 execute iofold_validation --local --file=./schema.sql

# Remote production database (optional)
npx wrangler d1 execute iofold_validation --remote --file=./schema.sql
```

## Usage

### Start Development Server

```bash
pnpm run dev
```

The server will start at `http://localhost:8787`

### API Endpoints

#### Health Check

```bash
curl http://localhost:8787/health
```

#### Fetch Traces from Langfuse

```bash
curl -X POST http://localhost:8787/api/traces/fetch \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}'
```

**Response:**
```json
{
  "success": true,
  "count": 10,
  "traces": [
    {
      "id": "uuid",
      "trace_id": "langfuse-trace-id",
      "steps_count": 3,
      "source": "langfuse"
    }
  ]
}
```

#### Generate Eval Function

```bash
curl -X POST http://localhost:8787/api/evals/generate \
  -H "Content-Type: application/json" \
  -d '{
    "name": "check_successful_response",
    "positiveTraceIds": ["trace-1", "trace-2"],
    "negativeTraceIds": ["trace-3", "trace-4"]
  }'
```

**Response:**
```json
{
  "success": true,
  "evalId": "uuid",
  "code": "def check_successful_response(trace: dict) -> tuple[bool, str]:\n    ...",
  "metadata": {
    "tokensUsed": 1500,
    "model": "claude-3-5-sonnet-20241022"
  }
}
```

#### Test Eval Accuracy

```bash
curl -X POST http://localhost:8787/api/evals/{eval-id}/test \
  -H "Content-Type: application/json" \
  -d '{
    "traceIds": [
      {"traceId": "trace-1", "expectedPass": true},
      {"traceId": "trace-3", "expectedPass": false}
    ]
  }'
```

**Response:**
```json
{
  "success": true,
  "result": {
    "accuracy": 0.85,
    "correct": 17,
    "incorrect": 3,
    "errors": 0,
    "total": 20,
    "lowConfidence": false
  }
}
```

## Project Structure

```
├── src/
│   ├── index.ts              # Main Worker entry point + API routes
│   ├── adapters/
│   │   └── langfuse.ts       # Langfuse trace adapter
│   ├── eval-generator/
│   │   ├── generator.ts      # LLM-based eval generation
│   │   ├── prompts.ts        # Meta-prompting templates
│   │   └── tester.ts         # Eval accuracy testing
│   ├── sandbox/
│   │   └── python-runner.ts  # Python execution sandbox (prototype)
│   └── types/
│       └── trace.ts          # Unified trace schema
├── docs/
│   ├── 2025-11-05-iofold-auto-evals-design.md  # System design
│   ├── 2025-11-05-iofold-evals-todo.md         # Full implementation plan
│   ├── success_criteria.md                     # Success metrics
│   ├── plans/
│   │   └── 2025-11-12-pre-implementation-validation.md  # Validation plan
│   ├── validation-results.md  # Validation experiment results
│   └── next-steps.md          # Post-validation roadmap
├── schema.sql               # D1 database schema
├── wrangler.toml           # Cloudflare Workers config
├── package.json
└── tsconfig.json
```

## Testing

Run unit tests:

```bash
pnpm test
```

Tests cover:
- Langfuse trace normalization
- Python sandbox security validation
- Eval generation parsing
- Eval accuracy calculation

## Limitations

**This is a PROTOTYPE. Not production-ready.**

### Python Sandbox

- **Current:** Uses Node.js `vm` module with Python-to-JS syntax shim
- **Limitations:**
  - NOT real Python execution
  - Security model demonstrated but not production-grade
  - Limited Python feature support (no imports, classes, etc.)
- **Phase 1 must use:** Cloudflare Python SDK, Pyodide, or external sandbox service

### Missing Features

- No authentication/authorization
- No frontend UI
- No multi-tenancy (users/workspaces)
- No trace minification/summarization
- Minimal error handling
- No caching or optimization
- No rate limiting
- No observability/logging

### Out of Scope

These are explicitly deferred post-validation:
- Multi-turn conversation traces
- LLM-based eval judges
- Auto-refinement on contradictions
- Langsmith/OpenAI adapters
- Real-time trace streaming

## Database Schema

**Tables:**
- `traces` - Imported and normalized traces from Langfuse
- `feedback` - User ratings (positive/negative/neutral) - Not implemented in API yet
- `evals` - Generated Python eval functions with metadata
- `eval_executions` - Results of running evals on traces

See `schema.sql` for full DDL.

## Results

See `docs/validation-results.md` for detailed validation findings (to be completed after running validation experiments).

## Next Steps

If validation successful:

1. **Resolve Technical Decisions**
   - Choose Python runtime (Cloudflare Python SDK, Pyodide, or external service)
   - Confirm frontend framework (TanStack Router + Query)
   - Set up authentication (Clerk)

2. **Begin Phase 1 Implementation**
   - See `docs/2025-11-05-iofold-evals-todo.md` for detailed task breakdown
   - Implement production Python sandbox
   - Build frontend with TanStack Router + Query
   - Add authentication and multi-tenancy

3. **Address Critical Gaps**
   - Production-grade Python sandbox
   - Security audit
   - Error handling and observability
   - Rate limiting and cost controls

See `docs/next-steps.md` for detailed roadmap.

## Development

### Running Tests

```bash
pnpm test
```

### Type Checking

```bash
npx tsc --noEmit
```

### Deploy (for testing)

```bash
pnpm run deploy
```

Note: Requires environment variables to be set in Cloudflare dashboard.

## Documentation

- **Design Doc:** `docs/2025-11-05-iofold-auto-evals-design.md` - Complete system architecture
- **Implementation Tasks:** `docs/2025-11-05-iofold-evals-todo.md` - Phase-by-phase breakdown
- **Validation Plan:** `docs/plans/2025-11-12-pre-implementation-validation.md` - This prototype's requirements
- **Success Criteria:** `docs/success_criteria.md` - Metrics for Phase 1

## License

MIT
