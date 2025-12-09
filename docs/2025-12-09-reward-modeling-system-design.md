# Reward Modeling System Design for iofold

**Date:** 2025-12-09
**Status:** Research Complete
**Purpose:** Design per-agent reward modeling with evolved evals, RULER scoring, and trace clustering

---

## Executive Summary

This document synthesizes research from 5 parallel exploration agents to design a comprehensive reward modeling system for iofold. The system enables:

1. **Per-agent reward modeling** (not per agent-version)
2. **Evolved eval definitions** - beyond code to LLM calls + trace fetching
3. **RULER-like relative scoring** - compare traces side-by-side
4. **Trace clustering** - find similar tasks for comparison groups
5. **GEPA integration** - use DSPy's primitives for eval evolution

---

## Table of Contents

1. [Critical vs Superfluous Components](#1-critical-vs-superfluous-components)
2. [GEPA Primitives Analysis](#2-gepa-primitives-analysis)
3. [Evolved Eval Definition Schema](#3-evolved-eval-definition-schema)
4. [RULER Relative Scoring Implementation](#4-ruler-relative-scoring-implementation)
5. [Trace Clustering Architecture](#5-trace-clustering-architecture)
6. [Demo Strategy](#6-demo-strategy)
7. [Implementation Roadmap](#7-implementation-roadmap)

---

## 1. Critical vs Superfluous Components

### Critical (Must Have for MVP)

| Component | Why Critical | Effort |
|-----------|-------------|--------|
| **Listwise RULER scoring** | Core of relative evaluation - 8x cheaper than pairwise | 1 week |
| **Task-level trace embedding** | Required to find comparable traces | 3 days |
| **Evolved eval schema** | Enables LLM-as-judge and reference comparison | 1 week |
| **GRPO advantage calculation** | Normalizes scores for GEPA evolution | 2 days |
| **Cost tracking & caching** | Prevents runaway LLM costs | 3 days |

### Important (Week 2-3)

| Component | Why Important | Effort |
|-----------|--------------|--------|
| **Bradley-Terry ranking** | Aggregates multiple comparisons | 3 days |
| **Golden trace management** | Bootstraps scoring without labels | 1 week |
| **Hybrid evals (code + LLM)** | Best of both worlds | 1 week |
| **Pareto frontier tracking** | Multi-objective optimization | 3 days |

### Nice to Have (Later)

| Component | Why Lower Priority | Effort |
|-----------|-------------------|--------|
| **Structural embeddings** | Task embedding sufficient for MVP | 1 week |
| **Active ranking** | Listwise good enough initially | 2 weeks |
| **External API whitelist** | Can hardcode allowed endpoints | 1 week |
| **Full GEPA merge logic** | Mutation alone works well | 1 week |

### Superfluous (Skip)

| Component | Why Skip |
|-----------|----------|
| **Per-objective Pareto** | GEPA uses per-example Pareto, not per-objective |
| **Complex merge heuristics** | Simple weighted combination sufficient |
| **Tournament ranking** | Listwise is more efficient |
| **Real-time clustering** | Batch clustering at 20+ traces is fine |

---

## 2. GEPA Primitives Analysis

### Core Types We Need to Implement

```typescript
// Candidate - An eval definition variant
interface Candidate {
  id: string;
  evalDefinitionId: string;
  version: number;

  // The evolved components
  components: {
    code?: string;           // Pure Python eval logic
    llmPrompt?: string;      // LLM-as-judge prompt
    rubric?: string;         // Scoring criteria
    referenceTraceIds?: string[];  // Golden examples
  };

  // Lineage
  parentId: string | null;
  mutationType: 'reflection' | 'merge' | 'manual';

  // Performance tracking
  scores: Map<string, number>;  // traceId -> score
  avgScore: number;
  frontierCoverage: number;     // How many examples is this best on?
}

// Pareto Frontier - Per-example best candidates
interface ParetoFrontier {
  // Maps example_id -> Set of candidate_ids that are best on that example
  perExampleBest: Map<string, Set<string>>;

  // Global frontier (union of all per-example bests, minus dominated)
  globalFrontier: Set<string>;
}

// Reward Function Interface (μ and μ_f)
interface RewardResult {
  score: number;           // μ: 0-1 scalar
  feedback: string;        // μ_f: textual explanation for reflection
  components?: {           // Optional breakdown
    accuracy?: number;
    efficiency?: number;
    quality?: number;
  };
}

// Metric function signature (matches GEPA)
type MetricFn = (
  trace: Trace,
  evalCandidate: Candidate,
  context: EvalContext
) => Promise<RewardResult>;
```

### Key GEPA Algorithm Insights

1. **Budget = Metric Calls, Not Iterations**
   - Each trace evaluation counts toward budget
   - Full validation is expensive (~50x minibatch)
   - For iofold: budget = total LLM judge calls allowed

2. **Per-Example Pareto (NOT per-objective)**
   - Track which candidate is best on EACH trace
   - NOT separate frontiers for accuracy vs efficiency
   - Multi-objective tradeoffs baked into single score

3. **Selection Probability ∝ Frontier Coverage**
   - Candidates that are "best on more examples" get selected more
   - Exploration: 10% random selection from entire pool
   - Merge: 30% chance when multiple candidates on frontier

4. **Textual Feedback Drives Mutation**
   - Score selects candidates; feedback guides reflection
   - Rich, domain-specific feedback = better mutations
   - This is why LLM-as-judge is critical

---

## 3. Evolved Eval Definition Schema

### Database Schema

```sql
-- Core eval definition with versioning
CREATE TABLE eval_definitions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),

  -- Metadata
  name TEXT NOT NULL,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  parent_version_id TEXT REFERENCES eval_definitions(id),

  -- Type: what kind of eval is this?
  type TEXT CHECK(type IN ('code', 'llm', 'comparative', 'reference', 'hybrid')),
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'testing', 'active', 'archived')),

  -- Code component (pure Python, existing capability)
  code_body TEXT,
  function_name TEXT,

  -- LLM component (NEW)
  llm_model TEXT DEFAULT 'claude-sonnet-4-5-20250514',
  llm_temperature REAL DEFAULT 0.0,
  llm_prompt_template TEXT,
  llm_rubric TEXT,
  llm_cache_enabled BOOLEAN DEFAULT TRUE,

  -- Reference component (NEW) - for golden trace comparison
  reference_trace_ids TEXT,  -- JSON array of trace IDs
  reference_comparison_method TEXT CHECK(reference_comparison_method IN ('embedding', 'semantic', 'exact')),
  reference_similarity_threshold REAL DEFAULT 0.75,

  -- Comparative component (NEW) - for RULER scoring
  comparative_enabled BOOLEAN DEFAULT FALSE,
  comparative_group_size INTEGER DEFAULT 6,  -- 4-8 recommended
  comparative_prompt_template TEXT,

  -- Execution constraints
  timeout_ms INTEGER DEFAULT 5000,
  memory_limit_mb INTEGER DEFAULT 50,
  cost_limit_per_execution REAL DEFAULT 0.05,  -- USD

  -- Performance metrics
  accuracy REAL,
  contradiction_rate REAL,
  avg_execution_time_ms REAL,
  avg_cost_usd REAL,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(agent_id, name, version)
);

-- Golden/reference traces for comparison
CREATE TABLE eval_reference_traces (
  id TEXT PRIMARY KEY,
  eval_definition_id TEXT NOT NULL REFERENCES eval_definitions(id),
  trace_id TEXT NOT NULL REFERENCES traces(id),

  reference_type TEXT CHECK(reference_type IN ('golden', 'anchor_good', 'anchor_bad')),
  quality_score REAL,  -- 0-1: how good is this reference?
  reason TEXT,         -- Why was this selected?

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(eval_definition_id, trace_id)
);

-- LLM call caching (critical for cost control)
CREATE TABLE eval_llm_cache (
  id TEXT PRIMARY KEY,
  prompt_hash TEXT NOT NULL,  -- SHA256 of prompt
  model TEXT NOT NULL,

  result_json TEXT NOT NULL,  -- Full response
  tokens_used INTEGER,
  cost_usd REAL,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,  -- Optional TTL

  UNIQUE(prompt_hash, model)
);

-- RULER comparison groups
CREATE TABLE comparison_groups (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  eval_definition_id TEXT REFERENCES eval_definitions(id),

  trace_ids TEXT NOT NULL,  -- JSON array of 4-8 trace IDs
  group_hash TEXT UNIQUE,   -- Hash for deduplication

  -- Grouping metadata
  task_similarity REAL,      -- How similar are the tasks?
  execution_diversity REAL,  -- How different are approaches?

  -- Results
  rankings_json TEXT,        -- [{trace_id, rank, score, explanation}]
  grpo_advantages_json TEXT, -- [{trace_id, advantage}]

  model_used TEXT,
  cost_usd REAL,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- GEPA candidate pool
CREATE TABLE eval_candidates (
  id TEXT PRIMARY KEY,
  eval_definition_id TEXT NOT NULL REFERENCES eval_definitions(id),

  -- The evolved components
  code_body TEXT,
  llm_prompt_template TEXT,
  llm_rubric TEXT,
  reference_trace_ids TEXT,

  -- Lineage
  parent_candidate_id TEXT REFERENCES eval_candidates(id),
  mutation_type TEXT CHECK(mutation_type IN ('reflection', 'merge', 'manual', 'seed')),
  mutation_reasoning TEXT,  -- Why was this mutation made?

  -- Performance
  avg_score REAL,
  frontier_coverage INTEGER,  -- How many examples is this best on?
  is_on_frontier BOOLEAN DEFAULT FALSE,

  -- Detailed scores per trace
  scores_json TEXT,  -- {trace_id: {score, feedback}}

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_eval_definitions_agent ON eval_definitions(agent_id);
CREATE INDEX idx_eval_definitions_type ON eval_definitions(type);
CREATE INDEX idx_eval_llm_cache_hash ON eval_llm_cache(prompt_hash);
CREATE INDEX idx_comparison_groups_hash ON comparison_groups(group_hash);
CREATE INDEX idx_eval_candidates_frontier ON eval_candidates(is_on_frontier);
```

### Eval Execution Context

```typescript
// What an eval can access during execution
interface EvalContext {
  // The trace being evaluated
  trace: Trace;

  // Workspace context
  workspace: Workspace;
  agent: Agent;

  // Fetch similar/reference traces (NEW)
  getReferencesTraces(): Promise<Trace[]>;
  getSimilarTraces(count: number, minSimilarity?: number): Promise<Trace[]>;
  getTopTraces(percentile: number, count: number): Promise<Trace[]>;

  // LLM capabilities with cost control (NEW)
  callLLM(options: {
    prompt: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    cacheKey?: string;
  }): Promise<{
    text: string;
    tokens: number;
    cost: number;
    cached: boolean;
  }>;

  // Cost tracking
  getCostSoFar(): number;
  getRemainingBudget(): number;
}

// Evolved eval function signature
type EvolvedEvalFn = (
  trace: Trace,
  ctx: EvalContext
) => Promise<{
  score: number;      // 0-1
  passed: boolean;    // For backward compat
  reason: string;
  feedback?: string;  // Rich feedback for GEPA reflection
  components?: Record<string, number>;
}>;
```

---

## 4. RULER Relative Scoring Implementation

### Core Algorithm

```typescript
/**
 * RULER: Score traces by comparing them side-by-side
 * Much more reliable than absolute scoring
 */

async function rulerScoreGroup(
  traces: Trace[],
  rubric: string,
  options: {
    model?: string;
    temperature?: number;
  } = {}
): Promise<RulerResult[]> {

  if (traces.length < 2) {
    return traces.map(t => ({
      traceId: t.id,
      rawScore: 0.5,
      advantage: 0,
      explanation: 'Single trace - no comparison possible'
    }));
  }

  // Build comparison prompt
  const trajectoriesXml = traces.map((t, i) => `
<trajectory id="${t.id}" index="${i + 1}">
  <user_goal>${extractUserGoal(t)}</user_goal>
  <execution_summary>${summarizeExecution(t)}</execution_summary>
  <final_output>${extractFinalOutput(t)}</final_output>
</trajectory>
  `).join('\n');

  const prompt = `
You are evaluating ${traces.length} agent executions for the same type of task.
Rank them from best (1.0) to worst (0.0).

## Evaluation Rubric
${rubric}

## Agent Trajectories
${trajectoriesXml}

Consider:
1. Goal Achievement (40%): Did the agent accomplish the task?
2. Efficiency (30%): Were steps necessary and well-chosen?
3. Quality (30%): Was the output accurate, helpful, and clear?

Return JSON array (one object per trajectory, ordered by index):
[
  {"trajectory_id": "...", "score": 0.95, "explanation": "..."},
  ...
]
`;

  const response = await claude.messages.create({
    model: options.model || 'claude-sonnet-4-5-20250514',
    max_tokens: 2000,
    temperature: options.temperature || 0,
    messages: [{ role: 'user', content: prompt }]
  });

  const scores = JSON.parse(extractJson(response.content[0].text));

  // Calculate GRPO advantages
  const values = scores.map(s => s.score);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance) || 1;

  return scores.map(s => ({
    traceId: s.trajectory_id,
    rawScore: s.score,
    advantage: (s.score - mean) / std,  // GRPO normalization
    explanation: s.explanation
  }));
}

interface RulerResult {
  traceId: string;
  rawScore: number;     // 0-1 from judge
  advantage: number;    // GRPO normalized: (score - mean) / std
  explanation: string;
}
```

### When to Use RULER vs Absolute Scoring

| Scenario | Use RULER | Use Absolute |
|----------|-----------|--------------|
| No labels, need to bootstrap | ✓ | |
| Comparing agent versions | ✓ | |
| Finding best traces for golden set | ✓ | |
| Binary pass/fail checks | | ✓ |
| Deterministic constraints | | ✓ |
| Cost-sensitive (many traces) | | ✓ |

### Anchor Traces for Bootstrapping

```typescript
/**
 * Use known good/bad examples to calibrate RULER scoring
 */
async function bootstrapWithAnchors(
  traces: Trace[],
  goodAnchors: Trace[],
  badAnchors: Trace[],
  rubric: string
): Promise<RulerResult[]> {

  const results: RulerResult[] = [];

  // Group traces with anchors for calibration
  for (const batch of chunkArray(traces, 4)) {
    // Include 1 good and 1 bad anchor in each group
    const groupWithAnchors = [
      goodAnchors[0],
      badAnchors[0],
      ...batch
    ];

    const scores = await rulerScoreGroup(groupWithAnchors, rubric);

    // Extract non-anchor scores, calibrated by anchor positions
    const goodAnchorScore = scores.find(s => s.traceId === goodAnchors[0].id)?.rawScore || 1;
    const badAnchorScore = scores.find(s => s.traceId === badAnchors[0].id)?.rawScore || 0;

    for (const score of scores) {
      if (!goodAnchors.some(a => a.id === score.traceId) &&
          !badAnchors.some(a => a.id === score.traceId)) {
        // Calibrate score relative to anchors
        const calibrated = (score.rawScore - badAnchorScore) /
                          (goodAnchorScore - badAnchorScore);
        results.push({
          ...score,
          rawScore: Math.max(0, Math.min(1, calibrated))
        });
      }
    }
  }

  return results;
}
```

---

## 5. Trace Clustering Architecture

### Multi-Level Embedding Strategy

```typescript
/**
 * Three complementary embeddings for different purposes
 */
interface TraceEmbeddings {
  // What problem is being solved?
  taskEmbedding: number[];

  // How was it solved?
  trajectoryEmbedding: number[];

  // What tools were used in what order?
  structuralEmbedding: number[];
}

class TraceEmbeddingService {
  constructor(
    private embeddingService: EmbeddingService,  // Existing
    private vectorService: VectorService          // Existing
  ) {}

  async embedTrace(trace: Trace): Promise<TraceEmbeddings> {
    // 1. Task-level: Extract and embed user query
    const userQuery = this.extractUserQuery(trace.steps);
    const taskEmbedding = await this.embeddingService.embed(userQuery);

    // 2. Trajectory-level: Serialize full execution
    const executionSummary = this.serializeExecution(trace.steps);
    const trajectoryEmbedding = await this.embeddingService.embed(executionSummary);

    // 3. Structural-level: Tool call pattern
    const toolPattern = this.extractToolPattern(trace.steps);
    const structuralEmbedding = await this.embeddingService.embed(toolPattern);

    return { taskEmbedding, trajectoryEmbedding, structuralEmbedding };
  }

  private extractUserQuery(steps: ExecutionStep[]): string {
    const firstUserMsg = steps
      .flatMap(s => s.messages_added || [])
      .find(m => m.role === 'user');
    return firstUserMsg?.content || '';
  }

  private serializeExecution(steps: ExecutionStep[]): string {
    return steps.map(step => {
      const tools = step.tool_calls?.map(tc =>
        `${tc.tool_name}(${Object.keys(tc.arguments || {}).join(', ')})`
      ).join(' -> ') || 'no-tools';

      const output = step.messages_added?.[0]?.content?.slice(0, 100) || '';
      return `[Step] ${tools} => ${output}`;
    }).join('\n');
  }

  private extractToolPattern(steps: ExecutionStep[]): string {
    return steps
      .flatMap(s => s.tool_calls || [])
      .map(tc => tc.tool_name)
      .join(' -> ') || 'no-tools';
  }
}
```

### Finding Comparable Traces for RULER

```typescript
/**
 * Find traces that can be meaningfully compared
 * Same task type + different execution approaches
 */
async function findComparableTraces(
  targetTrace: Trace,
  options: {
    groupSize?: number;          // Default: 6
    similarityThreshold?: number; // Default: 0.75
    requireDiversity?: boolean;   // Default: true
  } = {}
): Promise<Trace[]> {

  const { groupSize = 6, similarityThreshold = 0.75, requireDiversity = true } = options;

  // 1. Get task embedding for target trace
  const targetEmbedding = await traceEmbeddingService.getTaskEmbedding(targetTrace.id);

  // 2. Query for similar tasks
  const similar = await vectorService.query(targetEmbedding, {
    topK: groupSize * 3,  // Get extras to filter
    filter: {
      workspace_id: targetTrace.workspace_id,
      agent_id: targetTrace.agent_id  // Same agent, per requirement
    }
  });

  // 3. Filter by similarity threshold
  let candidates = similar.matches
    .filter(m => m.score >= similarityThreshold)
    .map(m => m.id);

  // 4. If requiring diversity, sort by execution diversity
  if (requireDiversity && candidates.length > groupSize) {
    const trajectoryEmbeddings = await Promise.all(
      candidates.map(id => traceEmbeddingService.getTrajectoryEmbedding(id))
    );

    // Select traces that maximize spread in trajectory space
    candidates = selectDiverse(candidates, trajectoryEmbeddings, groupSize);
  }

  // 5. Fetch full trace objects
  return await traceService.getTraces(candidates.slice(0, groupSize));
}

/**
 * Select diverse subset using farthest-point sampling
 */
function selectDiverse(
  candidateIds: string[],
  embeddings: number[][],
  count: number
): string[] {
  const selected: number[] = [0];  // Start with first

  while (selected.length < count && selected.length < candidateIds.length) {
    let maxMinDist = -1;
    let farthestIdx = -1;

    for (let i = 0; i < candidateIds.length; i++) {
      if (selected.includes(i)) continue;

      // Find minimum distance to any selected point
      const minDist = Math.min(
        ...selected.map(j => cosineSimilarity(embeddings[i], embeddings[j]))
      );

      // Select point with maximum minimum distance (farthest from all selected)
      if (1 - minDist > maxMinDist) {  // 1 - similarity = distance
        maxMinDist = 1 - minDist;
        farthestIdx = i;
      }
    }

    if (farthestIdx >= 0) selected.push(farthestIdx);
  }

  return selected.map(i => candidateIds[i]);
}
```

### Database Schema for Trace Embeddings

```sql
-- Store trace embeddings for similarity search
CREATE TABLE trace_embeddings (
  trace_id TEXT PRIMARY KEY REFERENCES traces(id),

  -- Different embeddings for different purposes
  task_embedding BLOB NOT NULL,       -- What problem?
  trajectory_embedding BLOB,          -- How solved? (optional)
  structural_embedding BLOB,          -- Tool pattern? (optional)

  -- Metadata for filtering
  task_hash TEXT,                     -- Hash of problem for grouping
  tool_pattern TEXT,                  -- "read_file -> execute -> write"

  -- Vectorize index IDs
  vectorize_task_id TEXT,
  vectorize_trajectory_id TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_trace_embeddings_task_hash ON trace_embeddings(task_hash);
CREATE INDEX idx_trace_embeddings_tool_pattern ON trace_embeddings(tool_pattern);
```

---

## 6. Demo Strategy

### Recommended: Constraint-Satisfaction Code Task

Based on GEPA paper analysis, the best demo task is **deterministic constraint checking**:

**Why This Task:**
1. **No LLM judge bias** - reward is objective
2. **Instant feedback** - pass/fail on each constraint
3. **Clear visual improvement** - 45% → 89% constraint satisfaction
4. **Uses existing infra** - Python sandbox, trace collection
5. **Low cost** - no expensive LLM judging

**Sample Task Setup:**

```python
# 5 programming tasks, 3 constraints each
DEMO_TASKS = [
  {
    "name": "balanced_parens",
    "description": "Check if parentheses are balanced",
    "constraints": [
      "Use stack data structure",
      "No imports allowed",
      "Code < 10 lines"
    ],
    "test_cases": [
      {"input": "(())", "expected": True},
      {"input": "(()", "expected": False}
    ]
  },
  # ... 4 more tasks
]

# Deterministic reward - no model needed
def calculate_reward(code: str, constraints: List[str]) -> float:
    satisfied = sum(1 for c in constraints if check_constraint(c, code))
    return satisfied / len(constraints)
```

**Demo Flow:**

```
Generation 0: Baseline eval
  → Constraint satisfaction: 45%
  → Issues: Misses list comprehension, wrong immutability checks

Generation 1-3: GEPA evolution
  → Reflection: "Eval misses X pattern, should check Y"
  → Mutation: Updated eval logic
  → Score: 45% → 62% → 78% → 89%

Final: Improved eval
  → 89% constraint satisfaction
  → Clear code diff showing improvements
  → Cost: ~$0.05 total
```

### Alternative: LLM Judge for QA Task

If deterministic isn't compelling enough:

```python
# Multi-hop QA with LLM judge
async def calculate_reward_qa(
  trace: Trace,
  ground_truth: str
) -> RewardResult:

  answer = extract_answer(trace)

  # Tier 1: Exact match (fast, free)
  if answer.strip().lower() == ground_truth.strip().lower():
    return RewardResult(score=1.0, feedback="Exact match")

  # Tier 2: LLM judge (accurate, costs money)
  judge_response = await ctx.callLLM({
    prompt: f"""
      Question: {trace.user_query}
      Expected: {ground_truth}
      Got: {answer}

      Score 0-1: How well does 'Got' answer the question?
      Explain what's missing or wrong.
    """,
    cacheKey: f"qa_judge_{hash(answer)}_{hash(ground_truth)}"
  });

  return RewardResult(
    score: judge_response.score,
    feedback: judge_response.explanation
  );
}
```

---

## 7. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**Goal:** Evolved eval schema + basic RULER scoring

**Tasks:**
- [ ] Create `eval_definitions` table with new schema
- [ ] Add `eval_llm_cache` table
- [ ] Implement `EvalContext` with `callLLM()`
- [ ] Build basic RULER scoring (listwise, 4-8 traces)
- [ ] Add GRPO advantage calculation
- [ ] Create API endpoint: `POST /api/evals/:id/test-evolved`

**Deliverable:** Can create LLM-based evals and score trace groups

### Phase 2: Trace Clustering (Week 2-3)

**Goal:** Find comparable traces for RULER groups

**Tasks:**
- [ ] Create `trace_embeddings` table
- [ ] Implement `TraceEmbeddingService` (task-level first)
- [ ] Add embedding to trace ingestion pipeline
- [ ] Build `findComparableTraces()` function
- [ ] Create `comparison_groups` table
- [ ] API: `POST /api/traces/:id/find-comparable`

**Deliverable:** Can automatically group similar traces for comparison

### Phase 3: GEPA Integration (Week 3-4)

**Goal:** Eval evolution with Pareto frontier

**Tasks:**
- [ ] Create `eval_candidates` table
- [ ] Implement Pareto frontier tracking
- [ ] Build reflection mutation logic
- [ ] Add candidate selection (frontier coverage weighting)
- [ ] Create evolution job (queue-based)
- [ ] API: `POST /api/evals/:id/evolve`

**Deliverable:** Can evolve evals through GEPA loop

### Phase 4: Demo & Polish (Week 4-5)

**Goal:** Working demo + UI

**Tasks:**
- [ ] Set up constraint-satisfaction demo task
- [ ] Create 5 synthetic programming problems
- [ ] Build evolution visualization dashboard
- [ ] Add cost tracking UI
- [ ] Record demo walkthrough
- [ ] Documentation

**Deliverable:** Impressive demo showing eval improvement

---

## Appendix A: GEPA Pseudocode Reference

```python
def gepa_evolve_eval(
    eval_definition: EvalDefinition,
    traces: List[Trace],
    budget: int = 1000  # Total metric calls allowed
) -> EvalCandidate:

    # Initialize
    candidate_pool = [create_seed_candidate(eval_definition)]
    per_example_frontiers = defaultdict(set)
    metric_calls = 0

    while metric_calls < budget:
        # 1. SELECT parent from Pareto frontier
        parent = select_from_frontier(
            candidate_pool,
            exploration_prob=0.1,
            merge_prob=0.3
        )

        # 2. SAMPLE minibatch of traces
        minibatch = random.sample(traces, k=5)

        # 3. EVALUATE parent on minibatch
        parent_scores = []
        for trace in minibatch:
            result = await evaluate(parent, trace)
            parent_scores.append(result)
            metric_calls += 1

        # 4. REFLECT on failures
        failures = [
            (trace, result)
            for trace, result in zip(minibatch, parent_scores)
            if result.score < 0.8
        ]

        # 5. MUTATE via LLM reflection
        mutation = await reflect_and_mutate(
            parent,
            failures,
            reflection_model='claude-opus-4-5-20250514'
        )

        # 6. EVALUATE mutation on minibatch
        mutation_scores = []
        for trace in minibatch:
            result = await evaluate(mutation, trace)
            mutation_scores.append(result)
            metric_calls += 1

        # 7. If improved, validate on full set
        if mean(mutation_scores) > mean(parent_scores):
            validation_scores = await evaluate_all(mutation, traces)
            metric_calls += len(traces)

            # Update Pareto frontiers
            for trace, score in zip(traces, validation_scores):
                update_frontier(per_example_frontiers, trace.id, mutation, score)

            candidate_pool.append(mutation)

    # Return best overall candidate
    return max(candidate_pool, key=lambda c: c.avg_score)
```

---

## Appendix B: Cost Estimates

| Operation | Cost | Notes |
|-----------|------|-------|
| Task embedding (bge-base) | Free | Cloudflare Workers AI |
| Vector query (Vectorize) | Free | Cloudflare included |
| RULER scoring (6 traces) | ~$0.01 | Claude Sonnet |
| Full GEPA iteration | ~$0.05 | 5 minibatch + 1 validation |
| Complete evolution (20 iter) | ~$1.00 | Acceptable for demo |

**Cost Controls:**
- LLM cache prevents duplicate calls
- Cost limit per eval execution ($0.05 default)
- Budget tracking in GEPA loop

---

## Appendix C: Technology Stack

| Component | Technology | Status |
|-----------|-----------|--------|
| Embeddings | bge-base-en-v1.5 (Workers AI) | ✅ Integrated |
| Vector DB | Cloudflare Vectorize | ✅ Integrated |
| LLM Judge | Claude Sonnet/Opus | ✅ Available |
| Metadata | D1 (SQLite) | ✅ Integrated |
| Queue | Cloudflare Queues | ✅ Integrated |
| Sandbox | Python (existing) | ✅ Integrated |

No new infrastructure required - builds on existing iofold stack.
