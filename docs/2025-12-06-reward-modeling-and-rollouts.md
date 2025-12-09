# Reward Function Design & Rollout Generation Strategy

**Date**: 2025-12-06
**Status**: Research Complete, Ready for Implementation Planning
**Prerequisites**: [2025-12-05-trace-analysis-evolution-plan.md](./2025-12-05-trace-analysis-evolution-plan.md)

## Executive Summary

This document synthesizes research from 10 parallel exploration agents on:
1. **Reward Function (μ)** - How to score candidate evals/prompts
2. **Textual Feedback (μ_f)** - How to generate actionable reflection signals
3. **Rollout Generation** - How to execute agents with new prompt versions

---

## Part 1: Reward Function Design (μ)

### 1.1 Core Principles from GEPA

The reward function μ : Y × M → [0, 1] measures output quality. For GEPA to work effectively:

| Principle | Description | Implementation |
|-----------|-------------|----------------|
| **Task-Aligned** | Directly measures success criteria | Match eval prediction to human label |
| **Bounded** | Returns [0, 1] for stable optimization | Normalize all metrics |
| **Differentiating** | Distinguishes good from bad clearly | Avoid clustering at 0 or 1 |
| **Multi-Objective** | Supports Pareto optimization | Decompose into sub-scores |

### 1.2 Reward Decomposition Strategy

Based on research, decompose rewards into measurable components:

```typescript
interface RewardComponents {
  // Primary: Agreement with ground truth
  accuracy: number;        // eval matches human label

  // Secondary: Quality metrics
  precision: number;       // true positives / (TP + FP)
  recall: number;          // true positives / (TP + FN)

  // Tertiary: Efficiency
  executionTime: number;   // normalized latency
  explanationQuality: number; // how actionable is the reason?
}
```

### 1.3 Available Signals from iofold Traces

From the codebase exploration, we have rich data for reward modeling:

**Already Captured:**
| Signal | Location | Usage |
|--------|----------|-------|
| Human feedback | `feedback.rating` | Ground truth labels |
| Eval predictions | `eval_executions.predicted_result` | Model output |
| Execution time | `playground_steps.latency_ms` | Efficiency metric |
| Token usage | `playground_steps.tokens_input/output` | Cost metric |
| Tool calls | `steps.tool_calls[]` | Behavior analysis |
| Errors | `traces.has_errors`, `tool_error` | Failure detection |

**Gaps to Fill:**
| Signal | Proposed Field | Purpose |
|--------|----------------|---------|
| Estimated cost | `traces.estimated_cost_usd` | Cost optimization |
| Quality score | `traces.quality_score` | LLM-judged quality |
| Explanation quality | `eval_executions.explanation_score` | Feedback usefulness |

### 1.4 Concrete Reward Function Implementation

```python
# src/services/reward-calculator.ts (pseudocode)

def calculate_reward(
    trace: Trace,
    feedback: Feedback,
    eval_result: EvalExecution,
    config: RewardConfig
) -> RewardResult:
    """
    Calculate multi-objective reward for GEPA optimization.

    Returns:
        RewardResult with scalar score and component breakdown
    """

    # Primary: Accuracy (agreement with human)
    expected = feedback.rating == 'positive'
    predicted = eval_result.predicted_result
    accuracy = 1.0 if expected == predicted else 0.0

    # Secondary: Execution efficiency
    max_time_ms = config.max_acceptable_time_ms  # e.g., 5000
    time_score = 1.0 - min(eval_result.execution_time_ms / max_time_ms, 1.0)

    # Tertiary: Explanation quality (LLM-judged)
    explanation_score = await judge_explanation_quality(
        eval_result.predicted_reason,
        trace,
        feedback
    )

    # Weighted combination (user-configurable)
    weights = config.weights or {
        'accuracy': 0.7,
        'efficiency': 0.1,
        'explanation': 0.2
    }

    scalar_reward = (
        weights['accuracy'] * accuracy +
        weights['efficiency'] * time_score +
        weights['explanation'] * explanation_score
    )

    return RewardResult(
        score=scalar_reward,
        components={
            'accuracy': accuracy,
            'efficiency': time_score,
            'explanation': explanation_score
        },
        is_contradiction=accuracy == 0.0
    )
```

### 1.5 RULER-Style Relative Scoring

For cases without human labels, use **comparative evaluation**:

```python
async def ruler_score_group(
    traces: list[Trace],
    judge_model: str = "claude-sonnet-4-5-20250514",
    rubric: str = DEFAULT_RUBRIC
) -> list[RelativeScore]:
    """
    Compare traces relative to each other (RULER approach).

    Key insight: LLMs are better at ranking than absolute scoring.
    """

    # Build comparison prompt
    traces_xml = "\n".join([
        f'<trajectory id="{t.id}">\n{json.dumps(t.steps)}\n</trajectory>'
        for t in traces
    ])

    prompt = f"""
{rubric}

Compare these {len(traces)} agent executions and assign relative scores (0.0 to 1.0):

{traces_xml}

Scoring criteria:
1. Goal Achievement (40%): Did the agent accomplish the task?
2. Efficiency (30%): Minimal unnecessary steps or tool calls?
3. Quality (30%): Accurate, helpful, well-formatted response?

Return JSON array:
[{{"trajectory_id": "...", "score": 0.85, "explanation": "..."}}]
"""

    response = await claude.generate(prompt, model=judge_model)
    scores = parse_json_array(response)

    # GRPO normalization: convert to advantages
    values = [s['score'] for s in scores]
    mean_score = sum(values) / len(values)
    std_score = (sum((v - mean_score)**2 for v in values) / len(values)) ** 0.5

    return [
        RelativeScore(
            trace_id=s['trajectory_id'],
            raw_score=s['score'],
            advantage=(s['score'] - mean_score) / (std_score or 1),
            explanation=s['explanation']
        )
        for s in scores
    ]
```

---

## Part 2: Textual Feedback Design (μ_f)

### 2.1 Why Textual Feedback Matters

GEPA achieves **35x sample efficiency** over traditional RL because μ_f provides:
- **Interpretation**: Why did this fail?
- **Actionability**: What specific change would fix it?
- **Pattern Recognition**: What's common across failures?

### 2.2 Three-Tier Feedback Structure

Based on compiler error message research and LLM judge patterns:

```typescript
interface ActionableFeedback {
  // Tier 1: VERIFICATION - What happened?
  verdict: 'pass' | 'fail' | 'partial';
  score: number;

  // Tier 2: DIAGNOSIS - Why did it happen?
  diagnosis: {
    category: FailureCategory;      // Enum of known failure types
    pattern: string;                // Human-readable pattern name
    rootCause: string;              // Plain language explanation
    evidence: string[];             // Specific examples from trace
    affectedLines?: [number, number]; // Code location if applicable
  };

  // Tier 3: GUIDANCE - What to do about it?
  guidance: {
    nextStep: string;               // ONE concrete action
    reasoning: string;              // Why this action helps
    codeChange?: string;            // Suggested code modification
    expectedImprovement: string;    // What will get better
  };

  // CONTRASTIVE - What went wrong vs what should happen?
  contrastive?: {
    observed: string;               // What actually happened
    expected: string;               // What should have happened
    diff: string;                   // Key differences
  };
}
```

### 2.3 Failure Category Taxonomy

From Microsoft's AI failure taxonomy and multi-agent research:

```typescript
enum FailureCategory {
  // Coordination Failures
  TASK_DERAILMENT = 'task_derailment',           // Deviated from objective
  INFORMATION_WITHHOLDING = 'info_withholding',  // Failed to share data
  CLARIFICATION_NEEDED = 'needs_clarification',  // Should have asked

  // Execution Failures
  TOOL_USAGE_ERROR = 'tool_usage_error',         // Wrong tool or args
  TOOL_SELECTION_ERROR = 'tool_selection_error', // Should have used different tool
  TIMEOUT = 'timeout',                           // Took too long

  // Quality Failures
  RESPONSE_QUALITY_LOW = 'quality_low',          // Unhelpful/unclear
  INCOMPLETE_RESPONSE = 'incomplete',            // Didn't finish task
  HALLUCINATION = 'hallucination',               // Made up facts

  // Data Failures
  MISSING_DATA = 'missing_data',                 // Required info absent
  INVALID_FORMAT = 'invalid_format',             // Wrong structure

  // Logic Failures
  REASONING_ERROR = 'reasoning_error',           // Incorrect logic
  EDGE_CASE_MISSED = 'edge_case',                // Didn't handle corner case
}
```

### 2.4 Feedback Generation Prompt

```markdown
# Eval Failure Analysis Prompt

You are analyzing why an eval function produced incorrect results.

## Context

### Current Eval Code
```python
{{eval_code}}
```

### Contradiction Cases
These traces show where the eval disagreed with human judgment:

{{#each contradictions}}
**Trace {{trace_id}}**
- Human label: {{human_rating}}
- Eval prediction: {{eval_prediction}}
- Eval reason: {{eval_reason}}
- Trace excerpt: {{trace_excerpt}}
{{/each}}

## Analysis Tasks

### 1. Pattern Detection
Group similar failures together. What patterns do you see?

### 2. Root Cause Analysis
For each pattern:
- What is the eval checking?
- Why does it fail on these cases?
- What assumption is incorrect?

### 3. Concrete Improvements
For each root cause:
- Cite specific line numbers in the eval code
- Provide exact code change
- Explain which contradictions this fixes
- Note any potential side effects

## Output Format

Return JSON:
```json
{
  "patterns": [
    {
      "name": "descriptive_name",
      "description": "What this pattern represents",
      "frequency": 5,
      "trace_ids": ["id1", "id2", ...]
    }
  ],
  "root_causes": [
    {
      "pattern": "pattern_name",
      "explanation": "Why the eval fails",
      "affected_code_lines": [10, 15],
      "incorrect_assumption": "What the code wrongly assumes"
    }
  ],
  "improvements": [
    {
      "root_cause": "cause_name",
      "code_change": "def eval_quality(trace):\n  ...",
      "reasoning": "Why this fixes the issue",
      "expected_fixes": ["trace_id1", "trace_id2"],
      "potential_regressions": ["might break X if..."]
    }
  ]
}
```
```

### 2.5 Aggregated Feedback Across Failures

For batch analysis, aggregate patterns:

```python
def aggregate_feedback(
    failures: list[FailureAnalysis]
) -> AggregatedFeedback:
    """
    Aggregate feedback across multiple failures for reflection.

    Inspired by: Allure test reports, 5 Whys RCA, Fishbone diagrams
    """

    # Count pattern frequencies
    pattern_counts = Counter(f.diagnosis.pattern for f in failures)

    # Find recurring root causes (Fishbone pattern)
    root_cause_clusters = cluster_by_similarity(
        [f.diagnosis.rootCause for f in failures]
    )

    # Identify quick wins (high frequency, clear fix)
    quick_wins = [
        f for f in failures
        if f.guidance.codeChange and pattern_counts[f.diagnosis.pattern] >= 3
    ]

    return AggregatedFeedback(
        summary=FeedbackSummary(
            total_failures=len(failures),
            unique_patterns=len(pattern_counts),
            top_patterns=pattern_counts.most_common(5),
            categories=Counter(f.diagnosis.category for f in failures)
        ),

        actionable_insights=[
            ActionableInsight(
                pattern=pattern,
                frequency=count,
                impact='high' if count >= 5 else 'medium',
                recommended_action=get_best_fix(pattern, failures),
                estimated_fixes=count
            )
            for pattern, count in pattern_counts.most_common(10)
        ],

        quick_wins=quick_wins[:3],  # Top 3 easy fixes

        # For reflection prompt
        reflection_context=format_for_reflection(failures, root_cause_clusters)
    )
```

### 2.6 Contrastive Examples

Research shows contrastive feedback (what went wrong vs. what should happen) is highly effective:

```python
def generate_contrastive_feedback(
    failed_trace: Trace,
    similar_successful_trace: Trace
) -> ContrastiveFeedback:
    """
    Generate contrastive feedback by comparing failed vs successful traces.

    Key insight from research: "Effective feedback should include both
    verification (right/wrong) and elaboration (why and how to fix)."
    """

    prompt = f"""
Compare these two agent executions for the same type of task:

## Failed Execution (received negative feedback)
{format_trace(failed_trace)}

## Successful Execution (received positive feedback)
{format_trace(similar_successful_trace)}

Identify:
1. What did the successful execution do differently?
2. At what point did the failed execution go wrong?
3. What specific behavior should be added/changed?

Return JSON:
{{
  "divergence_point": "Step where executions diverged",
  "successful_behavior": "What the good trace did",
  "failed_behavior": "What the bad trace did",
  "key_difference": "The critical distinction",
  "actionable_fix": "Specific change to make"
}}
"""

    return await claude.generate(prompt)
```

---

## Part 3: Rollout Generation Strategy

### 3.1 The Core Challenge

Without rollout generation, the GEPA/RULER system breaks down because:
- Can't test new prompt versions
- Can't generate training data for evolution
- Can't validate improvements before deployment

### 3.2 Three Approaches (Trade-offs)

| Approach | Speed | Cost | Realism | Determinism |
|----------|-------|------|---------|-------------|
| **Trace Replay** | Fast | Free | Medium | High |
| **Simulated Rollout** | Medium | Low | Medium | Medium |
| **Full Rollout** | Slow | High | High | Low |

### 3.3 Approach A: Trace Replay (MVP)

**Use case**: Test eval changes without re-running agents

```typescript
// Surgical replacement of system prompt in historical traces
async function replayTraceWithNewPrompt(
  originalTrace: Trace,
  newPrompt: string
): Promise<ReplayResult> {

  // For evals: just re-run eval on same trace
  // The trace data doesn't change, only how we evaluate it
  const evalResult = await runEval(newEvalCode, originalTrace);

  return {
    traceId: originalTrace.id,
    originalPrompt: originalTrace.systemPrompt,
    newPrompt: newPrompt,  // For tracking only
    evalResult: evalResult,
    replayType: 'eval_only'
  };
}
```

**When to use**:
- Testing eval code changes
- Backtesting on historical data
- Fast iteration during development

### 3.4 Approach B: Simulated Rollout (Recommended for MVP)

**Use case**: Test prompt changes with mocked tool responses

```typescript
async function simulatedRollout(
  testCase: TestCase,
  candidatePrompt: string,
  mockConfig: MockConfig
): Promise<SimulatedTrace> {

  // Create agent with new prompt
  const agent = createPlaygroundDeepAgent({
    systemPrompt: candidatePrompt,
    modelProvider: 'anthropic',
    modelId: 'claude-sonnet-4-5-20250514',
    // Use mock tools that return cached/predetermined responses
    tools: createMockTools(mockConfig),
    env: testEnv
  });

  // Run with test input
  const messages = [{ role: 'user', content: testCase.input }];

  // Capture trace with D1TraceCollector (existing infra)
  const trace = await agent.invoke(messages);

  return {
    trace,
    candidatePrompt,
    testCaseId: testCase.id,
    mockConfig
  };
}

function createMockTools(config: MockConfig): Tool[] {
  return [
    {
      name: 'execute_python',
      // Return cached results for known inputs
      execute: async (args) => {
        const cacheKey = hash(args);
        if (config.cache[cacheKey]) {
          return config.cache[cacheKey];
        }
        // Fall back to real execution or throw
        if (config.allowRealExecution) {
          return await realExecute(args);
        }
        throw new Error(`No cached result for ${cacheKey}`);
      }
    }
  ];
}
```

**When to use**:
- Testing prompt variations
- A/B testing before production
- Building training datasets

### 3.5 Approach C: Full Rollout (Production)

**Use case**: True end-to-end testing with real tools

```typescript
// New job type: RolloutGenerationJob
interface RolloutConfig {
  agentId: string;
  candidatePrompts: string[];           // Prompt variations to test
  testCases: TestCase[];                // Input scenarios
  models: ModelConfig[];                // Models to test
  evalId?: string;                      // Auto-evaluate results
  parallelExecutions: number;           // Concurrency limit
}

async function generateRollouts(config: RolloutConfig): Promise<RolloutResult> {
  const executions: RolloutExecution[] = [];

  // Generate execution matrix
  for (const prompt of config.candidatePrompts) {
    for (const model of config.models) {
      for (const testCase of config.testCases) {
        executions.push({
          prompt,
          model,
          testCase,
          status: 'pending'
        });
      }
    }
  }

  // Execute with concurrency control
  const results = await pMap(
    executions,
    async (exec) => {
      const agent = createPlaygroundDeepAgent({
        systemPrompt: exec.prompt,
        modelProvider: exec.model.provider,
        modelId: exec.model.id,
        // Real tools, real execution
        tools: createRealTools(),
        env: productionEnv
      });

      const trace = await agent.invoke([
        { role: 'user', content: exec.testCase.input }
      ]);

      // Auto-evaluate if eval provided
      let evalResult = null;
      if (config.evalId) {
        evalResult = await runEval(config.evalId, trace);
      }

      return {
        ...exec,
        trace,
        evalResult,
        status: 'completed'
      };
    },
    { concurrency: config.parallelExecutions }
  );

  return {
    config,
    results,
    summary: summarizeResults(results)
  };
}
```

**When to use**:
- Final validation before deployment
- Discovering new edge cases
- Production monitoring

### 3.6 Handling Non-Determinism

Key insight from research: **temperature=0 does NOT guarantee determinism** due to:
- Floating-point arithmetic differences
- GPU thread scheduling
- Batched inference routing
- Continuous optimization changes

**Mitigation strategies**:

```typescript
interface DeterminismConfig {
  // Run multiple times, take statistical mode
  runsPerCase: number;              // e.g., 3

  // Seed where possible
  seed?: number;

  // Accept statistical validation
  agreementThreshold: number;       // e.g., 0.67 (2/3 must agree)

  // Cache for true determinism
  cacheResponses: boolean;
  cacheKey: (input: any) => string;
}

async function deterministicRollout(
  config: RolloutConfig,
  deterministicConfig: DeterminismConfig
): Promise<DeterministicResult> {

  const runResults: Map<string, TraceResult[]> = new Map();

  for (let run = 0; run < deterministicConfig.runsPerCase; run++) {
    const results = await generateRollouts(config);

    for (const result of results) {
      const key = `${result.prompt}-${result.testCase.id}`;
      if (!runResults.has(key)) runResults.set(key, []);
      runResults.get(key).push(result);
    }
  }

  // Validate agreement
  const validatedResults: ValidatedResult[] = [];

  for (const [key, runs] of runResults) {
    const evalOutcomes = runs.map(r => r.evalResult?.passed);
    const agreement = mostCommonRatio(evalOutcomes);

    validatedResults.push({
      key,
      runs,
      agreement,
      isStable: agreement >= deterministicConfig.agreementThreshold,
      consensusResult: mode(evalOutcomes)
    });
  }

  return {
    results: validatedResults,
    unstableCount: validatedResults.filter(r => !r.isStable).length,
    overallAgreement: mean(validatedResults.map(r => r.agreement))
  };
}
```

### 3.7 Cost Optimization Strategies

From research on semantic caching and efficient rollouts:

```typescript
// Tier 1: Cache everything cacheable
const responseCache = new SemanticCache({
  embedModel: 'bge-base-en-v1.5',
  similarityThreshold: 0.95,
  storage: cloudflareKV
});

// Tier 2: Use cheap models for most work
const modelTiers = {
  exploration: 'claude-3-haiku',      // $0.25/M tokens
  validation: 'claude-sonnet-4-5',    // $3/M tokens
  final: 'claude-opus-4-5'            // $15/M tokens
};

// Tier 3: Batch operations
async function batchRollout(config: RolloutConfig) {
  // Group by model to maximize batching efficiency
  const byModel = groupBy(config.executions, e => e.model.id);

  for (const [modelId, executions] of byModel) {
    // Process in batches of 10 for better throughput
    for (const batch of chunk(executions, 10)) {
      await Promise.all(batch.map(executeOne));
    }
  }
}

// Tier 4: Early stopping
async function evolveWithEarlyStopping(config: EvolutionConfig) {
  let bestAccuracy = 0;
  let noImprovementCount = 0;

  for (let gen = 0; gen < config.maxGenerations; gen++) {
    const results = await evaluateGeneration(gen);

    if (results.bestAccuracy > bestAccuracy) {
      bestAccuracy = results.bestAccuracy;
      noImprovementCount = 0;
    } else {
      noImprovementCount++;
    }

    // Stop if no improvement for N generations
    if (noImprovementCount >= config.earlyStoppingPatience) {
      break;
    }
  }
}
```

### 3.8 Infrastructure: Leveraging Existing iofold Architecture

The codebase already has most infrastructure needed:

| Component | Status | Location |
|-----------|--------|----------|
| Agent execution | ✅ Ready | `src/playground/agent-deepagents.ts` |
| Trace collection | ✅ Ready | `src/playground/tracing/d1-collector.ts` |
| Job queue | ✅ Ready | `src/jobs/`, `src/queue/` |
| Python sandbox | ✅ Ready | `src/sandbox/python-runner.ts` |
| Eval execution | ✅ Ready | `src/jobs/eval-execution-job.ts` |
| Model providers | ✅ Ready | `src/playground/llm/streaming.ts` |

**New components needed**:

```
/src/jobs/rollout-generation-job.ts     # New job type
/src/services/ruler-scorer.ts           # RULER implementation
/src/services/reward-calculator.ts      # μ calculation
/src/services/feedback-generator.ts     # μ_f generation
```

---

## Part 4: Putting It All Together

### 4.1 The Complete GEPA Loop for iofold

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GEPA EVOLUTION LOOP                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐                                                    │
│  │ 1. SEED     │  Start with initial eval from meta-prompting      │
│  └──────┬──────┘                                                    │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 2. EVALUATE (μ)                                              │   │
│  │                                                              │   │
│  │  For each trace with feedback:                               │   │
│  │    - Run eval code in sandbox                                │   │
│  │    - Compare prediction to human label                       │   │
│  │    - Calculate reward components:                            │   │
│  │      • accuracy (0/1 match)                                  │   │
│  │      • efficiency (execution time)                           │   │
│  │      • explanation quality (LLM-judged)                      │   │
│  │    - Aggregate into scalar reward                            │   │
│  └──────┬──────────────────────────────────────────────────────┘   │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 3. IDENTIFY FAILURES                                         │   │
│  │                                                              │   │
│  │  Filter to contradictions (eval ≠ human):                    │   │
│  │    - Group by failure pattern                                │   │
│  │    - Cluster similar root causes                             │   │
│  │    - Prioritize by frequency                                 │   │
│  └──────┬──────────────────────────────────────────────────────┘   │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 4. REFLECT (μ_f)                                             │   │
│  │                                                              │   │
│  │  LLM analyzes failures with structured prompt:               │   │
│  │    - Pattern detection                                       │   │
│  │    - Root cause analysis                                     │   │
│  │    - Contrastive examples (failed vs successful)             │   │
│  │    - Concrete code changes                                   │   │
│  │                                                              │   │
│  │  Output: ActionableFeedback with 3 tiers:                    │   │
│  │    - Verification (what happened)                            │   │
│  │    - Diagnosis (why it happened)                             │   │
│  │    - Guidance (what to do)                                   │   │
│  └──────┬──────────────────────────────────────────────────────┘   │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 5. MUTATE                                                    │   │
│  │                                                              │   │
│  │  Generate improved eval code based on reflection:            │   │
│  │    - Apply suggested code changes                            │   │
│  │    - Validate syntax and security                            │   │
│  │    - Create new EvalCandidate                                │   │
│  │                                                              │   │
│  │  Optional crossover:                                         │   │
│  │    - Combine strengths from 2 Pareto candidates              │   │
│  └──────┬──────────────────────────────────────────────────────┘   │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 6. SELECT (Pareto)                                           │   │
│  │                                                              │   │
│  │  Update Pareto frontier:                                     │   │
│  │    - Track per-instance best scores                          │   │
│  │    - Keep non-dominated candidates                           │   │
│  │    - Sample next parent weighted by coverage                 │   │
│  │                                                              │   │
│  │  Multi-objective: accuracy × efficiency × quality            │   │
│  └──────┬──────────────────────────────────────────────────────┘   │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────┐                                                    │
│  │ 7. REPEAT   │  Until budget exhausted or early stopping         │
│  └─────────────┘                                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 The Complete Agent Improvement Loop

```
┌─────────────────────────────────────────────────────────────────────┐
│                   AGENT SELF-IMPROVEMENT LOOP                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐                                                    │
│  │ 1. COLLECT  │  Fetch production traces from Langfuse            │
│  └──────┬──────┘                                                    │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 2. SCORE (RULER)                                             │   │
│  │                                                              │   │
│  │  Group traces by similarity (same task type):                │   │
│  │    - Compare 4-8 traces side-by-side                         │   │
│  │    - LLM judge assigns relative scores (0-1)                 │   │
│  │    - Calculate GRPO advantages:                              │   │
│  │      advantage = (score - mean) / std                        │   │
│  │                                                              │   │
│  │  No human labels needed!                                     │   │
│  └──────┬──────────────────────────────────────────────────────┘   │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 3. IDENTIFY PATTERNS                                         │   │
│  │                                                              │   │
│  │  High advantage traces: What worked well?                    │   │
│  │  Low advantage traces: What failed?                          │   │
│  │                                                              │   │
│  │  Contrastive analysis:                                       │   │
│  │    - Compare successful vs unsuccessful                      │   │
│  │    - Identify key behavioral differences                     │   │
│  └──────┬──────────────────────────────────────────────────────┘   │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 4. GENERATE CANDIDATE                                        │   │
│  │                                                              │   │
│  │  LLM improves system prompt based on analysis:               │   │
│  │    - Keep what's working                                     │   │
│  │    - Fix identified issues                                   │   │
│  │    - Add missing instructions                                │   │
│  └──────┬──────────────────────────────────────────────────────┘   │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 5. ROLLOUT                                                   │   │
│  │                                                              │   │
│  │  Test candidate prompt on test cases:                        │   │
│  │    - Use simulated rollout (cached tools) for speed          │   │
│  │    - Or full rollout for final validation                    │   │
│  │    - Generate N traces per test case                         │   │
│  └──────┬──────────────────────────────────────────────────────┘   │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 6. VALIDATE                                                  │   │
│  │                                                              │   │
│  │  Compare new vs old prompt:                                  │   │
│  │    - Run evolved eval on both                                │   │
│  │    - Check statistical significance                          │   │
│  │    - Only promote if improvement confirmed                   │   │
│  └──────┬──────────────────────────────────────────────────────┘   │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────┐                                                    │
│  │ 7. DEPLOY   │  Promote to active version if validated           │
│  └─────────────┘                                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Part 5: Demo Scenarios

### Demo 1: Eval Evolution (No Rollouts Needed)

**Story**: "Our eval is at 78% accuracy. Let's evolve it to 90%+."

```
1. Show current eval with contradictions
2. Trigger GEPA evolution (10 generations)
3. Watch:
   - Reflection analyzing failures
   - Mutations being generated
   - Pareto frontier forming
   - Accuracy improving: 78% → 85% → 89% → 92%
4. Show code diff between generations
5. Promote best candidate
```

**No rollouts needed** - uses existing traces with human labels.

### Demo 2: RULER Scoring (No Labels Needed)

**Story**: "We have 100 traces but no labels. Let's still improve."

```
1. Import unlabeled traces from Langfuse
2. Group into sets of 4 similar traces
3. Run RULER: LLM compares and ranks
4. Show relative scores + explanations
5. Auto-derive positive/negative labels
6. Generate eval from derived labels
```

**No human labeling needed** - RULER does comparative evaluation.

### Demo 3: Prompt A/B Testing

**Story**: "Is the new prompt actually better? Let's test."

```
1. Show two prompt versions side-by-side
2. Define 10 test cases
3. Run simulated rollouts (both prompts × all test cases)
4. Compare results:
   - Old prompt: 72% pass rate
   - New prompt: 88% pass rate
5. Show trace comparison for interesting cases
6. Approve new prompt for production
```

**Uses simulated rollouts** - cached tool responses for speed.

---

## Part 6: Implementation Roadmap

### Phase 1: Reward & Feedback (Week 1)

- [ ] Implement `RewardCalculator` service
- [ ] Add reward components to `eval_executions` table
- [ ] Implement `FeedbackGenerator` with 3-tier structure
- [ ] Add failure category taxonomy

### Phase 2: RULER Scoring (Week 2)

- [ ] Implement `RulerScorer` service
- [ ] Add `/api/traces/compare` endpoint
- [ ] Create trace comparison UI
- [ ] Implement GRPO advantage calculation

### Phase 3: Reflection & Mutation (Week 3)

- [ ] Create reflection prompt template
- [ ] Implement aggregated feedback analysis
- [ ] Add mutation generation logic
- [ ] Integrate with existing `EvalGenerationJob`

### Phase 4: Rollout Generation (Week 4)

- [ ] Implement `RolloutGenerationJob`
- [ ] Add test case management
- [ ] Create mock tool infrastructure
- [ ] Build rollout comparison UI

### Phase 5: GEPA Loop (Week 5-6)

- [ ] Implement Pareto frontier tracking
- [ ] Create `EvalEvolutionJob`
- [ ] Add early stopping logic
- [ ] Build evolution dashboard

### Phase 6: Agent Improvement (Week 7-8)

- [ ] Connect RULER → label derivation
- [ ] Implement prompt mutation logic
- [ ] Add A/B validation workflow
- [ ] Create agent improvement UI

---

## Appendix A: Database Schema Additions

```sql
-- Reward components per eval execution
ALTER TABLE eval_executions ADD COLUMN reward_score REAL;
ALTER TABLE eval_executions ADD COLUMN reward_components TEXT; -- JSON

-- Feedback analysis cache
CREATE TABLE feedback_analysis (
  id TEXT PRIMARY KEY,
  eval_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  patterns TEXT NOT NULL,           -- JSON: detected patterns
  root_causes TEXT NOT NULL,        -- JSON: analyzed causes
  improvements TEXT NOT NULL,       -- JSON: suggested changes
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (eval_id) REFERENCES evals(id) ON DELETE CASCADE
);

-- RULER scoring results
CREATE TABLE ruler_scores (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,           -- Groups traces scored together
  trace_id TEXT NOT NULL,
  raw_score REAL NOT NULL,
  advantage REAL NOT NULL,
  explanation TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trace_id) REFERENCES traces(id) ON DELETE CASCADE
);

-- Test cases for rollouts
CREATE TABLE test_cases (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT,
  name TEXT NOT NULL,
  input TEXT NOT NULL,              -- JSON: user message
  expected_behavior TEXT,
  source_trace_id TEXT,             -- Optional: derived from real trace
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Rollout executions
CREATE TABLE rollout_executions (
  id TEXT PRIMARY KEY,
  rollout_id TEXT NOT NULL,
  agent_version_id TEXT NOT NULL,
  test_case_id TEXT NOT NULL,
  model_provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  trace_id TEXT,                    -- Generated trace
  status TEXT DEFAULT 'pending',
  execution_time_ms INTEGER,
  eval_result BOOLEAN,
  eval_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Appendix B: Key Research Sources

### GEPA & Reward Modeling
- [GEPA Paper](https://arxiv.org/abs/2507.19457) - Reflective Prompt Evolution
- [DSPy GEPA Documentation](https://dspy.ai/api/optimizers/GEPA/overview/)
- [Process Reward Models](https://arxiv.org/html/2502.10325v1)

### RULER & Relative Scoring
- [OpenPipe RULER](https://openpipe.ai/blog/ruler)
- [GRPO Paper](https://arxiv.org/pdf/2402.03300) - DeepSeekMath
- [ART Framework](https://github.com/OpenPipe/ART)

### LLM-as-Judge
- [G-Eval Framework](https://www.confident-ai.com/blog/g-eval-the-definitive-guide)
- [LLM-as-Judge Best Practices](https://www.patronus.ai/llm-testing/llm-as-a-judge)
- [Bias in LLM Judges](https://llm-judge-bias.github.io/)

### Feedback Generation
- [Compiler Error Message Design](https://dl.acm.org/doi/fullHtml/10.1145/3411764.3445696)
- [Microsoft AI Failure Taxonomy](https://cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/microsoft/final/en-us/microsoft-brand/documents/Taxonomy-of-Failure-Mode-in-Agentic-AI-Systems-Whitepaper.pdf)
- [Chain-of-Thought Critique](https://arxiv.org/abs/2501.18645)

### Rollout Generation
- [AgentRR Record & Replay](https://arxiv.org/html/2505.17716v1)
- [LangGraph Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)
- [Trajectory Stitching](https://proceedings.mlr.press/v235/li24bf.html)

### Langfuse Integration
- [External Evaluation Pipelines](https://langfuse.com/guides/cookbook/example_external_evaluation_pipelines)
- [DSPy + Langfuse](https://langfuse.com/integrations/frameworks/dspy)
- [Experiment Runner SDK](https://langfuse.com/changelog/2025-09-17-experiment-runner-sdk)
