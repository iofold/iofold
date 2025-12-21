# Agent Jobs Design - Discovery, Improvement, Evaluation

**Date:** November 28, 2025
**Status:** Approved

---

## Overview

This document describes the implementation of three background jobs for agent management:
1. **Agent Discovery Job** - Automatically discover agents from unassigned traces
2. **Prompt Improvement Job** - Generate improved prompt candidates based on failures
3. **Prompt Evaluation Job** - Evaluate prompt candidates against historical data

---

## Architecture

### Infrastructure Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     iofold Job System                            │
│                                                                  │
│  ┌──────────────────┐   ┌──────────────────┐   ┌─────────────┐ │
│  │ Agent Discovery  │   │Prompt Improvement│   │Prompt Eval  │ │
│  │      Job         │   │      Job         │   │    Job      │ │
│  └────────┬─────────┘   └────────┬─────────┘   └──────┬──────┘ │
│           │                      │                     │        │
│           └──────────────────────┼─────────────────────┘        │
│                                  │                              │
│                    ┌─────────────▼─────────────┐                │
│                    │      Job Worker           │                │
│                    │   (queue consumer)        │                │
│                    └─────────────┬─────────────┘                │
│                                  │                              │
│      ┌───────────────────────────┼───────────────────────┐      │
│      │                           │                       │      │
│  ┌───▼────┐   ┌─────────┐   ┌───▼────┐   ┌──────────┐   │      │
│  │Workers │   │Vectorize│   │   D1   │   │  Claude  │   │      │
│  │  AI    │   │ (vectors)│  │ (data) │   │  (LLM)   │   │      │
│  └────────┘   └─────────┘   └────────┘   └──────────┘   │      │
│                                                          │      │
└──────────────────────────────────────────────────────────┴──────┘
```

### New Cloudflare Bindings

```toml
# wrangler.toml additions
[[vectorize]]
binding = "VECTORIZE"
index_name = "system-prompts"

[ai]
binding = "AI"
```

### Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Embeddings | Workers AI (`@cf/baai/bge-base-en-v1.5`) | 768-dim text embeddings |
| Vector DB | Cloudflare Vectorize | Similarity search |
| Clustering | Custom greedy algorithm | Group similar prompts |
| Template Extraction | Claude | Extract template + variables |
| Prompt Improvement | Claude | Generate improved prompts |

---

## Job 1: Agent Discovery

### Trigger
- Unassigned traces count ≥ 20 (configurable)

### Flow

```
1. FETCH unassigned traces from D1
   └─ SELECT id, normalized_data FROM traces WHERE assignment_status = 'unassigned'

2. EXTRACT system prompts from each trace's normalized_data
   └─ Parse JSON, find system message content

3. EMBED each prompt using Workers AI
   └─ env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [prompt] })

4. UPSERT vectors to Vectorize with metadata
   └─ env.VECTORIZE.upsert([{ id: traceId, values: embedding, metadata: { workspace_id, status: 'unassigned' } }])

5. CLUSTER using greedy similarity
   └─ For each unassigned:
      - Query Vectorize for similar vectors (score > 0.85)
      - Group matches into cluster
      - Mark as 'clustered' in metadata

6. For clusters with 5+ traces, call Claude to EXTRACT TEMPLATE
   └─ Input: 3-5 example prompts from cluster
   └─ Output: { template: "You are {{role}}...", variables: ["role", "date"] }

7. CREATE agent + version in D1
   └─ INSERT INTO agents (status='discovered', ...)
   └─ INSERT INTO agent_versions (source='discovered', prompt_template=..., variables=...)

8. UPDATE traces with agent_version_id
   └─ UPDATE traces SET agent_version_id = ?, assignment_status = 'assigned'

9. NOTIFY: Return discovered agent IDs for user review
```

### Types

```typescript
interface AgentDiscoveryJobConfig {
  jobId: string;
  workspaceId: string;
  similarityThreshold?: number;  // default: 0.85
  minClusterSize?: number;       // default: 5
  maxTracesToProcess?: number;   // default: 100
}

interface AgentDiscoveryResult {
  discovered_agents: Array<{
    agent_id: string;
    name: string;
    trace_count: number;
  }>;
  orphaned_traces: number;
  processed_traces: number;
}
```

### Clustering Algorithm

```
Greedy Similarity Clustering:
1. Get all unassigned trace IDs from D1
2. For each trace, embed system prompt → store in Vectorize
3. Pick first unassigned as seed
4. Query Vectorize: "find all vectors with score > 0.85"
5. Group those into a cluster
6. Mark them as 'clustered' in metadata
7. Repeat from step 3 until no unassigned remain
8. Clusters with 5+ traces → create agent
```

---

## Job 2: Prompt Improvement

### Trigger
- Agent contradiction rate > 15% OR accuracy < 80%

### Flow

```
1. GATHER failure data from D1
   └─ Contradictions: human rated positive, eval predicted negative (or vice versa)
   └─ SELECT traces, feedback, eval_executions WHERE mismatch

2. ANALYZE failure patterns with Claude (Step 1 of 2)
   └─ Input: Up to 20 contradiction examples
   └─ Output: Summarized failure themes
      "The prompt fails when:
       1. User asks multi-part questions
       2. Context contains code blocks
       3. Request is ambiguous"

3. FETCH best practices from D1
   └─ SELECT * FROM prompt_best_practices
      WHERE category IN ('clarity', 'structure', 'reasoning')

4. IMPROVE prompt with Claude (Step 2 of 2)
   └─ Input:
      - Current prompt template
      - Failure pattern summary (from step 2)
      - Best practices guidelines
   └─ Output:
      - Improved prompt template
      - Explanation of changes
      - Preserved variables list

5. CREATE new agent_version in D1
   └─ INSERT INTO agent_versions (
        agent_id, version=N+1, prompt_template, variables,
        source='ai_improved', parent_version_id, status='candidate'
      )

6. RETURN result for user review
   └─ { new_version_id, changes_summary, parent_version }
```

### Types

```typescript
interface PromptImprovementJobConfig {
  jobId: string;
  agentId: string;
  workspaceId: string;
  maxContradictions?: number;  // default: 20
}

interface PromptImprovementResult {
  new_version_id: string;
  new_version_number: number;
  changes_summary: string;
  failure_patterns: string[];
  best_practices_applied: string[];
}
```

### Meta-Prompt Structure

```
You are a prompt engineering expert. Improve this system prompt based on:

## Current Prompt
{current_template}

## Failure Analysis
{failure_summary}

## Best Practices to Apply
{best_practices}

## Requirements
- Preserve these variables: {variables}
- Maintain the core intent
- Address the identified failure patterns
- Output JSON: { "improved_prompt": "...", "changes": ["..."], "reasoning": "..." }
```

---

## Job 3: Prompt Evaluation (MVP)

### Trigger
- New agent_version created with source='ai_improved'

### Scope (MVP)
- Eval-only comparison, no trace re-execution
- Future: True re-execution with tool call replay

### Flow

```
1. FETCH candidate version and active version from D1
   └─ SELECT * FROM agent_versions WHERE id = ? (candidate)
   └─ SELECT * FROM agent_versions WHERE id = agent.active_version_id

2. FETCH historical traces assigned to this agent
   └─ SELECT * FROM traces WHERE agent_version_id = active_version_id
   └─ Limit to N traces (default: 50)

3. FETCH all evals for this agent
   └─ SELECT * FROM evals WHERE agent_id = ?

4. RUN each eval on historical trace outputs
   └─ For each trace:
      - Execute eval code in sandbox
      - Record pass/fail + reason

5. CALCULATE accuracy metrics
   └─ accuracy = correct / total
   └─ Compare to active version's stored accuracy

6. UPDATE candidate version with accuracy
   └─ UPDATE agent_versions SET accuracy = ? WHERE id = ?

7. RETURN comparison report
   └─ { candidate_accuracy, active_accuracy, delta, recommendation }
```

### Types

```typescript
interface PromptEvaluationJobConfig {
  jobId: string;
  agentVersionId: string;  // The candidate version to evaluate
  workspaceId: string;
  maxTraces?: number;      // default: 50
}

interface PromptEvaluationResult {
  candidate_version_id: string;
  candidate_accuracy: number;
  active_version_id: string | null;
  active_accuracy: number | null;
  accuracy_delta: number | null;
  eval_results: Array<{
    eval_id: string;
    eval_name: string;
    passed: number;
    failed: number;
    errors: number;
  }>;
  recommendation: 'promote' | 'reject' | 'needs_review';
}
```

### Recommendation Logic

```typescript
function getRecommendation(delta: number | null, candidateAccuracy: number): string {
  if (delta === null) return 'promote';  // First version, no comparison
  if (delta >= 0.05) return 'promote';   // 5%+ improvement
  if (delta <= -0.05) return 'reject';   // 5%+ regression
  return 'needs_review';                  // Marginal change
}
```

---

## File Structure

```
src/
├── jobs/
│   ├── agent-discovery-job.ts       # NEW
│   ├── agent-discovery-job.test.ts  # NEW
│   ├── prompt-improvement-job.ts    # NEW
│   ├── prompt-improvement-job.test.ts # NEW
│   ├── prompt-evaluation-job.ts     # NEW
│   └── prompt-evaluation-job.test.ts # NEW
├── services/
│   ├── embedding-service.ts         # NEW - Workers AI wrapper
│   ├── vector-service.ts            # NEW - Vectorize wrapper
│   └── clustering-service.ts        # NEW - Greedy clustering logic
└── types/
    └── vectorize.ts                 # NEW - Vectorize types
```

---

## Testing Strategy

### Approach
- **Unit tests** with mocks for all external dependencies
- **E2E tests** separately through the UI (uses real APIs)

### Mocks

```typescript
// Mock Workers AI
const mockAI = {
  run: vi.fn().mockResolvedValue({
    data: [[0.1, 0.2, ...]] // 768-dim vector
  })
};

// Mock Vectorize
const mockVectorize = {
  upsert: vi.fn().mockResolvedValue({ count: 1 }),
  query: vi.fn().mockResolvedValue({
    matches: [{ id: 'trace_1', score: 0.92 }]
  }),
  getByIds: vi.fn(),
  deleteByIds: vi.fn()
};

// Mock Anthropic (Claude)
const mockAnthropic = {
  messages: {
    create: vi.fn().mockResolvedValue({
      content: [{ text: '{"template": "...", "variables": [...]}' }]
    })
  }
};
```

### Test Coverage

| Job | Test Cases |
|-----|------------|
| Agent Discovery | Happy path: 20 traces → 2 agents discovered |
| | No clusters found (all orphaned) |
| | Single large cluster |
| | Embedding failure handling |
| | Template extraction failure |
| Prompt Improvement | Happy path: contradictions → improved prompt |
| | No contradictions (skip improvement) |
| | Best practices applied correctly |
| | LLM failure handling |
| Prompt Evaluation | Happy path: candidate vs active comparison |
| | First version (no active to compare) |
| | All evals pass/fail |
| | Sandbox execution errors |

---

## Environment Updates

### Env Interface

```typescript
export interface Env {
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
  SANDBOX?: DurableObjectNamespace<Sandbox>;
  JOB_QUEUE?: Queue;
  // NEW
  VECTORIZE?: VectorizeIndex;
  AI?: Ai;
}
```

### wrangler.toml

```toml
# Add to existing config
[[vectorize]]
binding = "VECTORIZE"
index_name = "system-prompts"

[ai]
binding = "AI"
```

---

## Deferred Features

- **True re-execution**: Re-run traces with new prompt (requires tool call replay)
- **A/B testing**: Split traffic between prompt versions
- **Auto-promotion**: Automatically promote if metrics exceed threshold
- **Canary deployment**: Gradual rollout with monitoring
