# iofold.com - Auto-Evals Platform Design

**Date:** November 5, 2025
**Author:** Yash Gupta
**Status:** Design Phase

---

## Executive Summary

iofold.com is an automated evaluation generation platform for AI agents that integrates with existing observability tools (Langfuse, Langsmith, OpenAI) to bootstrap high-quality eval functions through human feedback and meta-prompting.

**Core Value Proposition:** Reduce eval writing time by automatically generating code-based eval functions from labeled trace examples, with continuous refinement based on user feedback.

**Target Users:** AI product teams at startups who need fast iteration cycles and lack dedicated ML infrastructure.

**Success Metric:** 10+ teams actively using the platform within 3 months.

---

## Design Principles

1. **Quality First** - Eval accuracy is paramount; we optimize for correctness over speed
2. **Plugin Architecture** - Integrate with existing tools rather than replacing them
3. **User Control** - User-triggered refinement, explicit generation thresholds
4. **Code-First Evals** - Prioritize deterministic code-based evals over expensive LLM judges
5. **Pragmatic MVP** - Start with LangGraph execution steps, expand to multi-turn later

---

## Architecture Overview

### High-Level Components

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
         ▲              ▲              ▲
         │              │              │
    ┌────┴──┐      ┌────┴───┐    ┌────┴────┐
    │Langfuse│     │Langsmith│   │ OpenAI  │
    └────────┘      └────────┘    └─────────┘
```

### Technology Stack

**Infrastructure:** Cloudflare (Workers, D1, R2, Pages)
- Workers for API and compute (TypeScript + Python runtime)
- D1 (SQLite) for relational data
- R2 for large trace artifacts
- Pages for frontend hosting

**Frontend:** Next.js or SvelteKit
- Server-side rendering on Cloudflare Pages
- Data-dense dashboard for trace review and eval management

**Backend:** TypeScript + Python hybrid
- TypeScript for API orchestration and adapters
- Python for eval generation and sandboxed execution

**Eval Execution Sandbox:**
- RestrictedPython or deno_python
- Allowed imports: json, re, typing only
- 5-second timeout, 50MB memory limit
- No network, file I/O, or subprocess access

---

## Component 1: Trace Adapters

### Purpose
Normalize different trace formats from Langfuse, Langsmith, and OpenAI into a unified internal schema.

### Implementation

Each adapter is a Cloudflare Worker endpoint implementing:

```typescript
interface TraceAdapter {
  authenticate(apiKey: string): Promise<void>
  fetchTraces(filter: TraceFilter): Promise<Trace[]>
  fetchTraceById(id: string): Promise<Trace>
}
```

### Supported Platforms

**Langfuse Adapter**
- Uses Langfuse SDK/API to pull traces
- Maps `Observation` model (spans, generations, events) to unified schema
- Extracts scores, tags, user IDs from their metadata format

**Langsmith Adapter**
- Pulls via Langsmith REST API
- Maps `Run` objects (parent/child relationships) to flat execution steps
- Extracts tool calls, errors, latency

**OpenAI Adapter**
- Integrates with OpenAI Assistants API or custom tracing
- Normalizes streaming/batch responses into step format

### Unified Trace Schema

Each trace becomes a `LangGraphExecutionStep`:

```typescript
interface LangGraphExecutionStep {
  step_id: string
  trace_id: string
  timestamp: datetime
  messages_added: Message[]  // state changes
  tool_calls: ToolCall[]     // tool invocations
  input: any                 // step input
  output: any                // step output
  metadata: Record<string, any>
  error?: string             // if failed
}
```

### Technical Details
- Workers run on Cloudflare edge for low-latency access
- Auth tokens cached in Durable Objects
- Retry with exponential backoff on API failures
- Trace results cached in R2 to reduce re-fetching

---

## Component 2: Web Dashboard

### Purpose
Standalone application for trace review, feedback collection, eval management, and performance comparison.

### Core Screens

#### 1. Trace Review Screen (Swipe Interface)

**Features:**
- Grid/list view of imported traces from connected platforms
- Click trace → detail view with swipe controls
- Display format:
  - Input section
  - Execution steps (collapsed/expandable tree)
  - Output section
  - Metadata panel
- Swipe gestures or button controls: 👍 👎 😐 + custom notes field
- Progress indicator: "7 of 10 examples collected for eval set: 'response-quality'"
- "Generate Eval" button (enabled at 5+ examples)

**User Flow:**
1. Connect Langfuse/Langsmith/OpenAI account (OAuth or API key)
2. Dashboard fetches recent traces via adapters
3. Create new eval set or add to existing
4. Review and rate traces
5. Trigger generation when threshold met

#### 2. Eval Management Screen

**Features:**
- List of generated eval functions with metadata:
  - Name, created date, accuracy %, version number
  - Training examples used, status (draft/active/archived)
- Code viewer with syntax highlighting (Python)
- Version history with diff viewer
- Actions: Test, Deploy, Refine, Archive, Export

**Eval Cards Show:**
- Accuracy on training set
- Number of executions
- Contradiction count
- Last refined date

#### 3. Comparison Matrix Screen

**Features:**
- Table showing: Trace ID | Human Rating | Eval v1 | Eval v2 | Eval v3 | Agreement
- Color coding:
  - Green = agreement
  - Red = contradiction
  - Yellow = timeout/error
- Filters:
  - Show only disagreements
  - By date range
  - By eval version
  - By trace source
- Click cell → drill into execution details:
  - Predicted result and reason
  - Execution time
  - Full trace data
  - Eval code that ran
- Statistics panel:
  - Accuracy %, precision, recall, F1 per eval version
  - Confusion matrix

#### 4. Eval Sets Screen

**Features:**
- Organize feedback into named sets
  - "response-quality"
  - "tool-usage-correctness"
  - "output-format-validation"
- Each set shows:
  - Examples collected (positive/negative/neutral split)
  - Generated evals (count and versions)
  - Performance metrics
  - Last updated timestamp
- Actions: Create, Edit, Archive, Export

---

## Component 3: Eval Generation Engine

### Purpose
Analyze 5-10 labeled traces and generate executable Python eval function that accurately classifies good vs bad traces.

### Simplified Single-Phase Approach

**Worker Endpoint:** `POST /api/eval-sets/{id}/generate`

```typescript
async function generateEval(evalSet: EvalSet) {
  // 1. Fetch labeled traces
  const positiveTraces = await fetchTraces(evalSet.positiveIds)
  const negativeTraces = await fetchTraces(evalSet.negativeIds)

  // 2. Build prompt with examples
  const prompt = `
You are an expert at writing eval functions for LangGraph agent traces.

Given these examples of GOOD traces:
${JSON.stringify(positiveTraces, null, 2)}

And these examples of BAD traces:
${JSON.stringify(negativeTraces, null, 2)}

Generate a Python function that distinguishes good from bad traces.

Requirements:
- Function signature: def eval_${evalSet.name}(trace: dict) -> tuple[bool, str]
- Return (True, reason) for pass, (False, reason) for fail
- Use only these imports: json, re, typing
- Be specific about what makes traces good/bad
- Add comments explaining your logic
- Handle edge cases gracefully

Generate the complete Python function:
`

  // 3. Call LLM (Claude/GPT-4)
  const code = await callLLM(prompt)

  // 4. Validate syntax
  if (!validatePythonSyntax(code)) {
    throw new Error("Generated invalid Python code")
  }

  // 5. Save eval
  const evalId = await saveEval(evalSet.id, code)

  // 6. Test on training set
  const accuracy = await testEval(evalId, [...positiveTraces, ...negativeTraces])

  // 7. Flag if low quality
  if (accuracy < 0.80) {
    await markEval(evalId, 'low_confidence')
  }

  return { evalId, code, accuracy }
}
```

### Sandboxed Execution

**Python Runtime in Cloudflare Worker:**
- Use RestrictedPython or deno_python
- Whitelist imports: `json`, `re`, `typing` only
- Execution limits:
  - Timeout: 5 seconds
  - Memory: 50MB
  - No network access
  - No file I/O
  - No subprocess execution

**Pre-execution Validation:**
- Static analysis with `ast.parse()` to check syntax
- Scan for banned imports: `os`, `sys`, `subprocess`, `socket`, etc.
- Reject code with dangerous operations before execution

**Error Capture:**
- Capture stdout/stderr for debugging
- Log exceptions with full stack trace
- Mark failed executions in database

### Context Optimization (Deferred to Later)

**Note:** Trace minification/summarization deferred to avoid context bloat.

**Future optimization strategies:**
- Summarize large state objects
- Extract only relevant fields for eval
- Compress repetitive patterns
- Use semantic chunking for long traces

---

## Component 4: Eval Refinement Workflow

### Purpose
Handle cases where generated eval predictions disagree with user feedback, with user-triggered refinement.

### Contradiction Detection

Dashboard automatically tracks disagreements:

```sql
table eval_executions {
  ...
  is_contradiction: boolean
  -- computed: (human=positive AND predicted=false) OR
  --           (human=negative AND predicted=true)
}
```

**Comparison Matrix highlights:**
- Traces with contradictions in red
- Count badge: "5 contradictions detected for eval v1.2"
- "Refine Eval" button (user-triggered)

### Refinement Process

**Triggered by user action:**

1. User clicks "Refine Eval" in dashboard
2. System fetches:
   - Original training examples (e.g., 5 positive + 5 negative)
   - Contradicting cases (e.g., 3 false positives, 2 false negatives)
3. Re-run generation with expanded dataset
4. Enhanced prompt:
   ```
   Previous eval (v1.2) failed on these cases:
   [contradicting examples with explanations]

   Fix these issues while maintaining accuracy on original examples.
   ```
5. Generate new version → eval v1.3
6. Test against ALL examples (original + contradictions)
7. Display accuracy comparison:
   - v1.2: 70% (7/10 training, 0/5 contradictions)
   - v1.3: 90% (9/10 training, 4/5 contradictions)
8. User chooses action:
   - Deploy v1.3
   - Keep v1.2
   - Collect more examples and retry

### Version Management

**Each refinement creates new version:**
- Version number auto-increments
- Full version history preserved
- Comparison matrix can toggle between eval versions
- Track lineage: parent version, training examples used

**Rollback capability:**
- User can revert to any previous version
- All execution history preserved per version
- Clear audit trail of changes

---

## Data Schema (Cloudflare D1)

### Core Tables

```sql
-- User accounts and workspaces
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Platform integrations
CREATE TABLE integrations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  platform TEXT NOT NULL, -- 'langfuse' | 'langsmith' | 'openai'
  api_key_encrypted TEXT NOT NULL,
  config JSON,
  status TEXT DEFAULT 'active', -- 'active' | 'error' | 'disabled'
  last_sync DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Imported traces
CREATE TABLE traces (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  integration_id TEXT NOT NULL REFERENCES integrations(id),
  external_id TEXT NOT NULL, -- ID from source platform
  trace_data JSON NOT NULL, -- normalized LangGraphExecutionStep
  imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(integration_id, external_id)
);

-- Eval sets (groups of traces for training)
CREATE TABLE eval_sets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  target_count INTEGER DEFAULT 10,
  status TEXT DEFAULT 'collecting', -- 'collecting' | 'ready' | 'generated'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User feedback on traces
CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  eval_set_id TEXT NOT NULL REFERENCES eval_sets(id),
  trace_id TEXT NOT NULL REFERENCES traces(id),
  rating TEXT NOT NULL, -- 'positive' | 'negative' | 'neutral'
  rating_detail TEXT, -- optional notes or numeric score
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(eval_set_id, trace_id)
);

-- Generated eval functions
CREATE TABLE evals (
  id TEXT PRIMARY KEY,
  eval_set_id TEXT NOT NULL REFERENCES eval_sets(id),
  version INTEGER NOT NULL,
  parent_eval_id TEXT REFERENCES evals(id), -- refinement chain
  name TEXT NOT NULL,
  code TEXT NOT NULL, -- Python function
  accuracy REAL, -- % correct on training set
  training_trace_ids JSON, -- array of trace IDs
  generation_prompt TEXT, -- prompt used
  status TEXT DEFAULT 'draft', -- 'draft' | 'active' | 'archived'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(eval_set_id, version)
);

-- Eval execution results
CREATE TABLE eval_executions (
  id TEXT PRIMARY KEY,
  eval_id TEXT NOT NULL REFERENCES evals(id),
  trace_id TEXT NOT NULL REFERENCES traces(id),
  predicted_result BOOLEAN NOT NULL,
  predicted_reason TEXT,
  execution_time_ms INTEGER,
  error TEXT, -- if execution failed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Views

```sql
-- Comparison matrix: link executions to human feedback
CREATE VIEW eval_comparison AS
SELECT
  e.id as execution_id,
  e.eval_id,
  e.trace_id,
  e.predicted_result,
  e.predicted_reason,
  f.rating as human_rating,
  CASE
    WHEN f.rating = 'positive' AND e.predicted_result = 1 THEN 'agreement'
    WHEN f.rating = 'negative' AND e.predicted_result = 0 THEN 'agreement'
    ELSE 'contradiction'
  END as agreement_status
FROM eval_executions e
JOIN feedback f ON e.trace_id = f.trace_id;
```

### Indexes

```sql
CREATE INDEX idx_traces_workspace ON traces(workspace_id);
CREATE INDEX idx_feedback_eval_set ON feedback(eval_set_id);
CREATE INDEX idx_executions_eval ON eval_executions(eval_id);
CREATE INDEX idx_executions_trace ON eval_executions(trace_id);
```

---

## Error Handling & Edge Cases

### Generation Failures

**Invalid Python Code**
- Validate syntax with `ast.parse()` before saving
- Retry generation 2 more times with error feedback in prompt
- If still fails: surface to user with error message, suggest manual review
- Save failed attempts to debug table for analysis

**Low Accuracy (< 80%)**
- Flag eval as "Low Confidence" in dashboard
- Show accuracy breakdown per trace
- User options:
  - Collect more examples
  - Trigger refinement
  - Proceed with warning
- Don't auto-deploy low-confidence evals

**Dangerous Code Patterns**
- Static analysis before execution: check for banned imports
- Sandbox enforces: no file I/O, network, subprocess
- 5-second timeout per execution
- If eval crashes: capture exception, mark eval as broken, show in dashboard

### Execution Failures

**Timeout (> 5 seconds)**
- Mark execution as "timeout" (neither pass nor fail)
- Show in comparison matrix with ⏱️ icon
- If > 20% timeouts: suggest refinement for efficiency

**Runtime Exception**
- Catch all exceptions during execution
- Log: trace_id, exception type, full stack trace
- Mark as "error" in results
- Dashboard: "Eval crashed on 3 traces, view details"

### Data Quality Issues

**Contradictory Feedback**
- Same trace rated positive then negative
- Dashboard warning: "Conflicting feedback detected for trace X"
- Prompt user: keep latest, keep both, or discard trace

**Imbalanced Training Data**
- If 10 positive, 1 negative (or vice versa)
- Warning: "Imbalanced dataset may produce biased eval"
- Suggest collecting more examples of minority class
- Show class distribution prominently

### Integration Failures

**Adapter API Failure**
- Langfuse/Langsmith/OpenAI API down or rate limited
- Retry with exponential backoff (3 attempts)
- Cache traces in R2 to reduce re-fetching
- Surface connection status in dashboard with status indicator
- Error messages with troubleshooting steps

---

## User Flows

### Flow 1: Generate First Eval

1. User creates account, connects Langfuse account
2. Dashboard fetches recent traces from Langfuse
3. User creates eval set: "response-quality"
4. User reviews traces in swipe interface:
   - Swipe right (good) on 5 traces with correct responses
   - Swipe left (bad) on 5 traces with incorrect responses
5. Progress bar shows: "10 of 10 examples collected"
6. User clicks "Generate Eval"
7. System generates Python function in ~10 seconds
8. Dashboard shows:
   - Generated code with syntax highlighting
   - Training accuracy: 95% (9.5/10)
   - Status: "Ready to deploy"
9. User clicks "Deploy" → eval marked as "active"
10. User exports Python file, integrates into test suite

### Flow 2: Refine Eval After Contradictions

1. User runs eval against new traces in CI/CD
2. Finds 3 false positives (bad traces marked good)
3. User imports those traces to iofold dashboard
4. Adds feedback: thumbs down on all 3
5. Comparison matrix shows: "3 contradictions detected"
6. User clicks "Refine Eval"
7. System re-generates with original 10 + new 3 examples
8. New version v1.2 created with accuracy: 100% (13/13)
9. User reviews diff between v1.1 and v1.2
10. User clicks "Deploy v1.2"
11. Old version remains available for rollback

### Flow 3: Multi-Platform Workflow

1. User connects Langsmith and Langfuse accounts
2. Creates eval set: "tool-usage-patterns"
3. Adds 3 traces from Langsmith (positive examples)
4. Adds 2 traces from Langfuse (positive examples)
5. Adds 5 traces mixed from both (negative examples)
6. Generates eval from heterogeneous sources
7. Eval works on traces from both platforms

---

## MVP Scope & Future Enhancements

### MVP (3-Month Target)

**In Scope:**
- Langfuse adapter only (defer Langsmith and OpenAI)
- LangGraph single-step execution traces
- Code-based eval generation (Python functions)
- Basic swipe UI with thumbs up/down/neutral
- Single-phase generation (no multi-phase analysis)
- User-triggered refinement only
- Comparison matrix with basic stats
- Manual trace import workflow

**Deferred:**
- Multi-turn eval support
- LLM-based eval generation
- Trace minification/summarization
- Auto-refinement on threshold
- Ensemble eval methods
- Advanced analytics (drift detection, A/B testing)
- Real-time trace streaming
- Batch eval execution API

### Future Enhancements (Post-MVP)

**Phase 2: Multi-Turn Evals**
- Support conversation-level evaluation
- Track state across multiple turns
- Compare full conversation quality

**Phase 3: LLM-Based Evals**
- Generate prompt templates for LLM judges
- Allow embedding LLM calls in eval code
- Hybrid evals: code pre-filters + LLM scoring

**Phase 4: Advanced Features**
- Trace minification using LLM summarization
- Eval drift detection over time
- A/B testing different eval versions
- Automated continuous refinement
- Batch API for running evals at scale
- Integration with CI/CD (GitHub Actions, etc.)

---

## Success Metrics

### 3-Month Goals

**Primary:** 10+ teams actively using platform

**Supporting Metrics:**
- 100+ eval functions generated
- 80%+ average eval accuracy
- 1,000+ traces reviewed with feedback
- 50+ eval refinements triggered
- < 5 second eval execution time (p95)

### Quality Metrics

**Eval Generation:**
- 90%+ of generated evals pass syntax validation
- 80%+ achieve target accuracy on training set
- < 30 second generation time (p95)

**User Experience:**
- < 2 second trace load time
- < 100ms swipe feedback response
- Zero data loss incidents
- 99.9% API uptime

### Engagement Metrics

**Per User:**
- Average 20+ traces reviewed per week
- Average 2+ eval sets created per user
- Average 3+ refinements per eval
- 70%+ of generated evals deployed to production

---

## Technical Risks & Mitigations

### Risk 1: LLM Generation Quality

**Risk:** Generated evals may not accurately capture user intent from examples.

**Mitigation:**
- Start with 5-10 examples minimum (not 2-3)
- Flag low-confidence evals (< 80% accuracy)
- Allow manual code editing before deployment
- Collect generation failures for prompt improvement
- A/B test different meta-prompts

### Risk 2: Python Sandbox Security

**Risk:** Generated code could escape sandbox or consume excessive resources.

**Mitigation:**
- Use battle-tested RestrictedPython library
- Strict import whitelist (json, re, typing only)
- Hard limits: 5s timeout, 50MB memory
- Static analysis before execution
- Monitor for sandbox escape attempts
- Regular security audits

### Risk 3: Trace Data Size

**Risk:** Large LangGraph states could blow up context windows and costs.

**Mitigation:**
- Cache traces in R2, don't re-fetch
- (Future) Implement trace minification
- Set hard limits on trace size (e.g., 100KB)
- Paginate large trace displays in UI
- Warn users about oversized traces

### Risk 4: Platform API Dependencies

**Risk:** Langfuse/Langsmith API changes could break adapters.

**Mitigation:**
- Version pin adapter implementations
- Comprehensive error handling with fallbacks
- Monitor API health and versions
- Cache traces to reduce API dependency
- Build adapter test suite with mocked responses

### Risk 5: Cloudflare Worker Limits

**Risk:** Workers have CPU time limits (50ms-30s depending on plan).

**Mitigation:**
- Use Durable Objects for longer-running operations
- Break eval generation into async steps
- Monitor execution times, optimize hot paths
- Upgrade to paid plan if needed
- Consider fallback to traditional server for heavy compute

---

## Open Questions & Decisions Needed

### Technical Decisions

1. **Frontend Framework:** use tanstack router + tanstack query/tanstack ecosystem.

2. **Python Runtime:** use cloudflare worker's sandbox SDK.

3. **Auth Provider:** use clerk

### Product Decisions

1. **Pricing Model:** Free tier: 10000 traces/month 

2. **Export Format:** How should users consume generated evals?
   - Copy-paste Python code
   - API endpoint they call

3. **Feedback Granularity:** Beyond thumbs up/down?
   - Custom rating scales (1-5 stars)
   - Multiple aspect ratings (accuracy, tone, safety)
   - Free-text feedback integration

---

## Next Steps

### Immediate Actions

1. **Validate with potential users**
   - Show design to 5 AI product teams
   - Get feedback on dashboard mockups
   - Confirm willingness to pay

2. **Technical prototype**
   - Build minimal Langfuse adapter
   - Test Python sandbox execution
   - Prove eval generation quality with 10 examples

3. **Create implementation plan**
   - Break down into 2-week sprints
   - Identify critical path items
   - Estimate effort for MVP

### Phase 1 Implementation (Weeks 1-4)

- Set up Cloudflare infrastructure (Workers, D1, R2, Pages)
- Implement Langfuse adapter with auth
- Build basic trace schema and database
- Create simple trace viewer UI

### Phase 2 Implementation (Weeks 5-8)

- Build swipe interface for feedback collection
- Implement single-phase eval generation
- Set up Python sandbox execution
- Create eval management screen

### Phase 3 Implementation (Weeks 9-12)

- Build comparison matrix UI
- Implement eval refinement workflow
- Add error handling and edge cases
- Polish UX and prepare for launch

---

## Appendices

### Appendix A: Example Generated Eval

```python
def eval_response_quality(trace: dict) -> tuple[bool, str]:
    """
    Evaluates if a trace represents a high-quality response.

    Good traces:
    - Call the search_tool before responding
    - Include citations in the output
    - Response length > 100 characters

    Bad traces:
    - Skip research step
    - Generic responses without sources
    - Very short outputs
    """
    import json
    import re

    # Check if search tool was used
    tool_calls = trace.get('tool_calls', [])
    used_search = any(call.get('name') == 'search_tool' for call in tool_calls)

    if not used_search:
        return (False, "Missing search_tool invocation")

    # Check output quality
    output = trace.get('output', '')

    # Look for citation markers [1], [2], etc.
    has_citations = bool(re.search(r'\[\d+\]', output))

    if not has_citations:
        return (False, "No citations found in output")

    # Check minimum length
    if len(output) < 100:
        return (False, f"Output too short: {len(output)} chars")

    return (True, "Response meets quality criteria")
```

### Appendix B: Comparison Matrix Mock

```
Trace ID    | Human | Eval v1.0 | Eval v1.1 | Agreement
------------|-------|-----------|-----------|----------
trace_001   |   👍  |  ✅ Pass  |  ✅ Pass  |    ✓
trace_002   |   👎  |  ❌ Fail  |  ❌ Fail  |    ✓
trace_003   |   👍  |  ❌ Fail  |  ✅ Pass  |  v1.0: ✗, v1.1: ✓
trace_004   |   👎  |  ✅ Pass  |  ❌ Fail  |  v1.0: ✗, v1.1: ✓
trace_005   |   👍  |  ⏱️ Timeout|  ✅ Pass  |  v1.0: ✗, v1.1: ✓

Stats:       v1.0: 60% (3/5)   v1.1: 100% (5/5)
```

### Appendix C: Key Dependencies

**Frontend:**
- Next.js or SvelteKit
- TailwindCSS for styling
- React/Svelte components
- Monaco Editor for code viewing

**Backend:**
- Cloudflare Workers SDK
- Langfuse SDK/API client, langsmith SDK, openai traces SDK
- LLM API (Anthropic Claude or OpenAI GPT-4)

**Database:**
- Cloudflare D1 (SQLite)
- SQL query builder (Drizzle ORM)

**Monitoring:**
- Use posthog for analytics post launch

---

**End of Design Document**
