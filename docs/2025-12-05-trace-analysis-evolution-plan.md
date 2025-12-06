# Trace Analysis & Agent Evolution Plan

**Date**: 2025-12-05
**Status**: Planning
**Author**: Auto-generated from research

## Executive Summary

This document outlines the plan to enhance iofold's trace analysis and eval generation system by incorporating:
1. **GEPA** (Genetic-Pareto) - Evolutionary prompt/eval optimization
2. **RULER** (OpenPipe) - Relative scoring for reward modeling
3. **Self-improvement loops** - Continuous agent refinement

## Current State

### What We Have

```
Traces (Langfuse) → Human Labels → Meta-Prompting → Eval Code → Sandbox Execution
                                        ↓
                              Claude (single-shot)
```

**Strengths:**
- Secure Python sandbox (4-layer defense)
- Contradiction tracking (eval vs human disagreement)
- Job queue with retry logic
- Agent discovery via clustering

**Limitations:**
- Single-shot eval generation (no iterative refinement)
- Absolute scoring only (no comparative evaluation)
- No automated self-improvement loop
- Manual prompt improvement workflow

### Key Files

| Component | Location |
|-----------|----------|
| Eval Generation | `src/eval-generator/generator.ts`, `prompts.ts` |
| Eval Testing | `src/eval-generator/tester.ts` |
| Job Workers | `src/jobs/eval-generation-job.ts`, `prompt-improvement-job.ts` |
| Clustering | `src/services/clustering-service.ts` |
| Sandbox | `src/sandbox/python-runner.ts` |

---

## Research Summary

### GEPA (Genetic-Pareto Agent Evolution)

**Paper**: [Reflective Prompt Evolution Can Outperform Reinforcement Learning](https://arxiv.org/abs/2507.19457)

**Core Concepts:**
1. **Reflective Mutation**: LLM analyzes failures in natural language, proposes improvements
2. **Pareto Selection**: Maintain candidates that excel on different training instances
3. **Crossover**: Combine strengths from multiple candidates semantically
4. **35x efficiency**: 400-1,200 rollouts vs 24,000 for traditional RL

**Algorithm:**
```
1. Start with seed candidate (initial prompt/eval)
2. Execute on training batch, capture traces + feedback
3. LLM reflects on failures → identifies patterns
4. Generate improved mutations
5. Evaluate candidates, update Pareto frontier
6. Sample next candidate weighted by coverage
7. Iterate until budget exhausted
```

**Why It Matters for iofold:**
- Can evolve both **eval functions** and **agent prompts**
- Natural language reflection provides interpretable optimization
- Pareto frontier handles multi-objective tradeoffs (accuracy vs cost vs latency)

### RULER (Relative Universal LLM-Elicited Rewards)

**Source**: [OpenPipe RULER](https://openpipe.ai/blog/ruler)

**Core Concepts:**
1. **Comparative Evaluation**: Score traces relative to each other, not in isolation
2. **GRPO Integration**: Group Relative Policy Optimization only needs within-group rankings
3. **No Labels Needed**: Self-improvement without human feedback

**Algorithm:**
```
For each problem:
  1. Generate N trajectories (4-8 recommended)
  2. LLM judge compares all trajectories side-by-side
  3. Assign relative scores (0-1) based on comparison
  4. GRPO normalizes: A_i = (r_i - mean) / std
  5. Update policy to favor higher-advantage trajectories
```

**Key Insight:**
> "It's significantly easier for an LLM to rank several candidate solutions side-by-side than to assign absolute scores to isolated solutions."

**Why It Matters for iofold:**
- Comparative eval generation could be more reliable
- Self-improvement loop for continuous refinement
- Aligns with existing trace comparison needs

---

## Proposed Architecture

### Phase 1: Comparative Eval Generation

**Goal**: Generate evals that compare traces relatively, not absolutely.

```
Current:  eval(trace) → (bool, str)
Proposed: eval(trace_group) → [(trace_id, score, reason), ...]
```

**Implementation:**

```python
# New eval function signature
def eval_quality(traces: list[dict]) -> list[tuple[str, float, str]]:
    """
    Compare traces relative to each other.
    Returns: [(trace_id, relative_score, reason), ...]
    """
    # LLM-generated comparison logic
    pass
```

**Changes Required:**
1. New meta-prompt for comparative eval generation (`src/eval-generator/prompts.ts`)
2. Modified tester to handle group evaluation (`src/eval-generator/tester.ts`)
3. New execution mode in sandbox (`src/sandbox/python-runner.ts`)
4. UI for viewing relative scores (`frontend/app/evals/`)

### Phase 2: GEPA Integration for Eval Evolution

**Goal**: Automatically improve eval functions through reflective mutation.

```
┌─────────────────────────────────────────────────────────────┐
│                    GEPA Eval Evolution Loop                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────┐    ┌──────────┐    ┌─────────────┐            │
│   │  Seed   │───▶│ Execute  │───▶│  Collect    │            │
│   │  Eval   │    │ on Batch │    │  Results    │            │
│   └─────────┘    └──────────┘    └──────┬──────┘            │
│                                          │                   │
│   ┌─────────┐    ┌──────────┐    ┌──────▼──────┐            │
│   │  New    │◀───│  Mutate  │◀───│   Reflect   │            │
│   │  Eval   │    │  Code    │    │ on Failures │            │
│   └────┬────┘    └──────────┘    └─────────────┘            │
│        │                                                     │
│        │         ┌──────────────────────┐                   │
│        └────────▶│  Pareto Selection    │                   │
│                  │  (keep diverse best) │                   │
│                  └──────────────────────┘                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**New Job**: `EvalEvolutionJob`

```typescript
// src/jobs/eval-evolution-job.ts
interface EvalEvolutionConfig {
  seedEvalId: string;
  maxIterations: number;        // e.g., 50
  populationSize: number;       // e.g., 8
  reflectionModel: string;      // e.g., "claude-sonnet-4-5"
  mutationModel: string;        // e.g., "claude-3-haiku"
  paretoObjectives: string[];   // ["accuracy", "precision", "execution_time"]
}
```

**Reflection Prompt Template:**
```markdown
You are analyzing eval function failures. Below are cases where the eval
disagreed with human judgment:

## Contradictions
{{contradictions}}

## Current Eval Code
{{eval_code}}

## Task
1. Identify patterns in the failures
2. Explain what the eval is missing or getting wrong
3. Suggest specific code changes to fix these issues

Return your analysis as JSON:
{
  "failure_patterns": [...],
  "root_causes": [...],
  "suggested_changes": [...]
}
```

### Phase 3: RULER-Style Self-Improvement for Agents

**Goal**: Use relative scoring to improve agent prompts without extensive labeling.

```
┌─────────────────────────────────────────────────────────────┐
│                 Agent Self-Improvement Loop                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────┐    ┌──────────┐    ┌─────────────┐            │
│   │  Agent  │───▶│ Run N    │───▶│  RULER      │            │
│   │ Prompt  │    │ Times    │    │  Judge      │            │
│   └─────────┘    └──────────┘    └──────┬──────┘            │
│                                          │                   │
│   ┌─────────┐    ┌──────────┐    ┌──────▼──────┐            │
│   │ Updated │◀───│  GRPO    │◀───│  Relative   │            │
│   │ Prompt  │    │  Update  │    │  Scores     │            │
│   └─────────┘    └──────────┘    └─────────────┘            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**New Components:**

1. **RULER Scorer** (`src/services/ruler-scorer.ts`)
```typescript
interface RulerConfig {
  judgeModel: string;           // "claude-sonnet-4-5"
  groupSize: number;            // 4-8 trajectories
  rubric?: string;              // Custom evaluation criteria
}

async function scoreTraceGroup(
  traces: Trace[],
  config: RulerConfig
): Promise<RelativeScore[]> {
  // Build comparison prompt
  // Call judge LLM
  // Parse relative scores
}
```

2. **GRPO Calculator** (`src/services/grpo-calculator.ts`)
```typescript
function calculateAdvantages(scores: number[]): number[] {
  const mean = scores.reduce((a, b) => a + b) / scores.length;
  const std = Math.sqrt(
    scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length
  );
  return scores.map(s => (s - mean) / (std || 1));
}
```

3. **Prompt Updater** (`src/services/prompt-updater.ts`)
```typescript
async function improvePrompt(
  currentPrompt: string,
  goodTraces: Trace[],     // High advantage
  badTraces: Trace[],      // Low advantage
  reflectionModel: string
): Promise<string> {
  // Analyze what worked vs didn't
  // Generate improved prompt
}
```

---

## Database Schema Changes

```sql
-- New table for evolutionary candidates
CREATE TABLE eval_candidates (
  id TEXT PRIMARY KEY,
  eval_id TEXT REFERENCES evals(id),
  generation INTEGER NOT NULL,
  code TEXT NOT NULL,
  parent_id TEXT REFERENCES eval_candidates(id),
  mutation_type TEXT,           -- 'reflection', 'crossover', 'initial'

  -- Multi-objective scores
  accuracy REAL,
  precision_score REAL,
  recall_score REAL,
  avg_execution_time REAL,

  -- Pareto tracking
  is_pareto_optimal BOOLEAN DEFAULT FALSE,
  dominated_by TEXT[],          -- IDs of candidates that dominate this one

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Track which instances each candidate wins on
CREATE TABLE candidate_instance_scores (
  candidate_id TEXT REFERENCES eval_candidates(id),
  trace_id TEXT REFERENCES traces(id),
  score REAL,
  is_best_for_instance BOOLEAN,
  PRIMARY KEY (candidate_id, trace_id)
);

-- Agent prompt evolution history
CREATE TABLE prompt_candidates (
  id TEXT PRIMARY KEY,
  agent_version_id TEXT REFERENCES agent_versions(id),
  generation INTEGER NOT NULL,
  system_prompt TEXT NOT NULL,
  parent_id TEXT REFERENCES prompt_candidates(id),

  -- RULER scores
  avg_relative_score REAL,
  grpo_advantage REAL,

  -- Pareto tracking
  is_pareto_optimal BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## API Endpoints

### New Endpoints

```typescript
// Start eval evolution
POST /api/evals/:id/evolve
Body: {
  maxIterations: number,
  populationSize: number,
  objectives: string[]
}
Response: { jobId: string }

// Get evolution status
GET /api/evals/:id/evolution
Response: {
  generation: number,
  paretoFrontier: EvalCandidate[],
  bestAccuracy: number,
  history: EvolutionStep[]
}

// Start agent self-improvement
POST /api/agents/:id/improve
Body: {
  iterations: number,
  tracesPerIteration: number,
  judgeModel: string
}
Response: { jobId: string }

// Get relative scores for trace group
POST /api/traces/compare
Body: {
  traceIds: string[],
  rubric?: string
}
Response: {
  scores: { traceId: string, score: number, reason: string }[]
}
```

---

## UI Components

### Eval Evolution Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│ Eval Evolution: customer_satisfaction_v3                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Generation: 12/50    Best Accuracy: 94.2%    Pareto Size: 5 │
│                                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Pareto Frontier (Accuracy vs Execution Time)            │ │
│ │                                                          │ │
│ │     •                                                    │ │
│ │   •   •                                                  │ │
│ │ •       •                                                │ │
│ │                                                          │ │
│ │ [Accuracy] ──────────────────────────▶                   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ Top Candidates:                                              │
│ ┌──────┬──────────┬───────────┬──────────┬────────────────┐ │
│ │ Gen  │ Accuracy │ Precision │ Time(ms) │ Action         │ │
│ ├──────┼──────────┼───────────┼──────────┼────────────────┤ │
│ │ 12   │ 94.2%    │ 91.0%     │ 45       │ [Promote]      │ │
│ │ 11   │ 93.8%    │ 95.2%     │ 52       │ [Promote]      │ │
│ │ 10   │ 92.1%    │ 89.5%     │ 38       │ [Promote]      │ │
│ └──────┴──────────┴───────────┴──────────┴────────────────┘ │
│                                                              │
│ [Stop Evolution]  [View Code Diff]  [Export Best]           │
└─────────────────────────────────────────────────────────────┘
```

### Trace Comparison View

```
┌─────────────────────────────────────────────────────────────┐
│ Compare Traces                                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Select traces to compare (4-8 recommended):                  │
│ [☑] trace_abc123  [☑] trace_def456  [☑] trace_ghi789       │
│ [☑] trace_jkl012  [ ] trace_mno345  [ ] trace_pqr678       │
│                                                              │
│ Judge Model: [Claude Sonnet 4.5 ▼]                          │
│ Rubric: [Default - Goal Achievement ▼]                      │
│                                                              │
│ [Compare Selected Traces]                                    │
│                                                              │
│ Results:                                                     │
│ ┌──────────────┬───────┬─────────────────────────────────┐  │
│ │ Trace        │ Score │ Reason                          │  │
│ ├──────────────┼───────┼─────────────────────────────────┤  │
│ │ trace_abc123 │ 0.92  │ Achieved goal efficiently       │  │
│ │ trace_jkl012 │ 0.78  │ Correct but verbose response    │  │
│ │ trace_def456 │ 0.45  │ Partially addressed query       │  │
│ │ trace_ghi789 │ 0.21  │ Failed to use appropriate tool  │  │
│ └──────────────┴───────┴─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Tasks:**
1. [ ] Add `eval_candidates` table and migration
2. [ ] Implement `RulerScorer` service
3. [ ] Create `/api/traces/compare` endpoint
4. [ ] Build basic trace comparison UI
5. [ ] Add reflection prompt template

**Demo**: Compare 4 traces side-by-side, see relative scores

### Phase 2: Eval Evolution (Week 3-4)

**Tasks:**
1. [ ] Implement `EvalEvolutionJob`
2. [ ] Add Pareto frontier tracking
3. [ ] Create reflection → mutation pipeline
4. [ ] Build evolution dashboard UI
5. [ ] Add `/api/evals/:id/evolve` endpoint

**Demo**: Start evolution, watch accuracy improve over generations

### Phase 3: Agent Self-Improvement (Week 5-6)

**Tasks:**
1. [ ] Add `prompt_candidates` table
2. [ ] Implement GRPO advantage calculation
3. [ ] Create prompt improvement pipeline
4. [ ] Build agent improvement UI
5. [ ] Add `/api/agents/:id/improve` endpoint

**Demo**: Agent prompt improves based on trace comparisons

### Phase 4: Integration & Polish (Week 7-8)

**Tasks:**
1. [ ] Connect all loops (eval evolution ↔ agent improvement)
2. [ ] Add monitoring and alerting
3. [ ] Performance optimization
4. [ ] Documentation and examples
5. [ ] Demo script and sample data

**Demo**: Full loop - traces in, better agent out

---

## Demo Scenarios

### Demo 1: Comparative Evaluation

**Story**: "Let's see which of these customer support responses was best"

1. Select 4 traces from same customer query type
2. Run RULER comparison
3. Show relative scores with explanations
4. Highlight what made the best response better

### Demo 2: Eval Evolution

**Story**: "Our eval function is at 78% accuracy. Let's evolve it."

1. Show current eval with contradictions
2. Start evolution (10 generations)
3. Watch Pareto frontier form
4. Show reflection analysis of failures
5. Promote best candidate (now 91% accuracy)

### Demo 3: Self-Improving Agent

**Story**: "The agent learns from experience without manual labeling"

1. Run agent on 20 problems, 4 attempts each
2. RULER scores each group
3. Calculate GRPO advantages
4. Generate improved prompt
5. Show before/after comparison

### Demo 4: Full Loop

**Story**: "From production traces to better agent in one workflow"

1. Import traces from Langfuse
2. RULER identifies best/worst automatically
3. Generate eval from RULER scores
4. Evolve eval to 95%+ accuracy
5. Use eval to drive agent improvement
6. Deploy improved agent
7. New traces show improvement

---

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Eval Generation Accuracy | 78% avg | 90%+ avg | After GEPA evolution |
| Manual Labels Required | 20+ per eval | 5 or less | RULER reduces need |
| Time to Improved Agent | Days | Hours | Full loop automation |
| Contradiction Rate | 15% | <5% | After evolution |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| GEPA produces invalid Python | Medium | High | Static analysis before execution |
| RULER scores inconsistent | Medium | Medium | Use larger judge model, average multiple runs |
| Evolution converges prematurely | Low | Medium | Pareto diversity maintains exploration |
| Cost of LLM calls | Medium | Medium | Use Haiku for mutations, Sonnet for reflection |

---

## References

1. [GEPA Paper](https://arxiv.org/abs/2507.19457) - Reflective Prompt Evolution
2. [OpenPipe RULER](https://openpipe.ai/blog/ruler) - Relative Scoring
3. [GRPO Paper](https://arxiv.org/pdf/2402.03300) - DeepSeekMath
4. [DSPy Documentation](https://dspy.ai/) - Framework for LLM programming
5. [ART Framework](https://github.com/OpenPipe/ART) - Agent Reinforcement Trainer

---

## Appendix A: GEPA Adapter for iofold

```typescript
// src/services/gepa-adapter.ts
import { Trace, Eval, Feedback } from '../types';

interface GEPACandidate {
  id: string;
  code: string;
  generation: number;
  parentId?: string;
}

interface GEPAResult {
  scores: Map<string, number>;  // trace_id -> score
  traces: Map<string, any>;     // trace_id -> execution trace
}

class IofoldGEPAAdapter {
  constructor(
    private evalRunner: EvalRunner,
    private db: D1Database
  ) {}

  async evaluate(
    candidate: GEPACandidate,
    batch: Trace[]
  ): Promise<GEPAResult> {
    const scores = new Map<string, number>();
    const traces = new Map<string, any>();

    for (const trace of batch) {
      const result = await this.evalRunner.execute(candidate.code, trace);

      // Get expected result from feedback
      const feedback = await this.getFeedback(trace.id);
      const expected = feedback?.rating === 'positive';
      const actual = result.passed;

      // Score: 1 if match, 0 if contradiction
      scores.set(trace.id, actual === expected ? 1 : 0);
      traces.set(trace.id, {
        predicted: actual,
        expected,
        reason: result.reason,
        executionTime: result.duration
      });
    }

    return { scores, traces };
  }

  async extractTracesForReflection(
    results: GEPAResult[],
    componentId: string
  ): Promise<string> {
    // Collect all failures (score = 0)
    const failures = [];
    for (const result of results) {
      for (const [traceId, score] of result.scores) {
        if (score === 0) {
          const trace = result.traces.get(traceId);
          failures.push({
            traceId,
            predicted: trace.predicted,
            expected: trace.expected,
            reason: trace.reason
          });
        }
      }
    }

    return JSON.stringify(failures, null, 2);
  }
}
```

## Appendix B: RULER Implementation

```typescript
// src/services/ruler-scorer.ts
import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_RUBRIC = `
Evaluate each trajectory based on:
1. Goal Achievement: Did the agent accomplish what was asked?
2. Efficiency: Did it use appropriate tools without unnecessary steps?
3. Quality: Was the response accurate and helpful?

Trajectories that achieve their goal should score significantly higher.
Award partial credit for progress toward the goal.
`;

interface RulerScore {
  traceId: string;
  score: number;
  explanation: string;
}

async function scoreTraceGroup(
  traces: Trace[],
  judgeModel: string = 'claude-sonnet-4-5-20250514',
  rubric: string = DEFAULT_RUBRIC
): Promise<RulerScore[]> {
  const client = new Anthropic();

  // Build comparison prompt
  const tracesXml = traces.map((t, i) => `
<trajectory id="${t.id}">
${JSON.stringify(t.steps, null, 2)}
</trajectory>
`).join('\n');

  const prompt = `
${rubric}

Compare the following trajectories and assign relative scores (0.0 to 1.0):

${tracesXml}

Return JSON array:
[
  {"trajectory_id": "...", "score": 0.0-1.0, "explanation": "..."},
  ...
]
`;

  const response = await client.messages.create({
    model: judgeModel,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }]
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type');

  // Parse JSON from response
  const jsonMatch = content.text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON found in response');

  const scores = JSON.parse(jsonMatch[0]);
  return scores.map((s: any) => ({
    traceId: s.trajectory_id,
    score: s.score,
    explanation: s.explanation
  }));
}
```

## Appendix C: GRPO Calculator

```typescript
// src/services/grpo-calculator.ts

interface TraceAdvantage {
  traceId: string;
  score: number;
  advantage: number;
}

function calculateAdvantages(scores: RulerScore[]): TraceAdvantage[] {
  const values = scores.map(s => s.score);

  // Calculate group statistics
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance) || 1; // Avoid division by zero

  // Normalize to advantages
  return scores.map(s => ({
    traceId: s.traceId,
    score: s.score,
    advantage: (s.score - mean) / std
  }));
}

// Positive advantage = reinforce this behavior
// Negative advantage = discourage this behavior
// Near zero = average performance
```
