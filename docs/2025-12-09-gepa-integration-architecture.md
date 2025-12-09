# GEPA Integration Architecture for iofold

**Date:** 2025-12-09
**Status:** Design
**Scope:** Single-step agents (multi-turn deferred)

---

## Executive Summary

This document defines how iofold integrates with GEPA for agent optimization. The core insight: GEPA optimizes agent system prompts by testing them against a dataset of tasks, scored by our eval functions.

---

## 1. Scope Limitation: Single-Step Agents Only

### Why Single-Step First

Multi-turn conversations introduce significant complexity:

| Challenge | Single-Step | Multi-Turn |
|-----------|-------------|------------|
| Task definition | Clear: first user message | Ambiguous: user intent spans turns |
| User simulation | Not needed | Requires LLM to simulate user behavior |
| Trace slicing | Trivial: (sys_prompt, user_msg, response) | Complex: conversation state management |
| Eval complexity | Evaluate final output | Evaluate intermediate + final states |
| Rollout generation | One LLM call | Multi-turn orchestration |

### What Single-Step Means

```
Single-Step Agent Flow:
  System Prompt → User Message → Agent Response → Done

Examples:
  ✓ Code generation (one prompt → one solution)
  ✓ Question answering (one question → one answer)
  ✓ Text transformation (one input → one output)
  ✓ Classification (one item → one label)

Not Supported (Yet):
  ✗ Conversational agents (multi-turn dialogue)
  ✗ Interactive debugging (back-and-forth)
  ✗ Agentic tool use with clarification loops
```

### Future: Multi-Turn Support

When we extend to multi-turn:
1. `task_metadata` will include a "user persona" or "user goal model"
2. An LLM will simulate the user given this model
3. Task definition becomes: (initial_context, user_goal, success_criteria)
4. Traces become conversation trees, not linear sequences

**Deferred to Phase 2.**

---

## 2. Core Data Structures

### 2.1 DataInst (GEPA's Input)

```typescript
interface DataInst {
  // The task itself (visible to agent)
  task: {
    user_message: string;      // First user message after system prompt
  };

  // Metadata for evaluation (hidden from agent, visible to eval)
  task_metadata: TaskMetadata;
}

interface TaskMetadata {
  // Ground truth (if available)
  expected_output?: string;
  expected_action?: string;
  success_criteria?: string[];

  // Reference traces for comparison
  similar_high_rated_traces?: TraceSummary[];
  traces_with_specific_feedback?: TraceFeedbackPair[];

  // Task categorization
  task_type?: string;           // "code_generation", "qa", "classification"
  difficulty?: "easy" | "medium" | "hard";
  domain?: string;              // "math", "coding", "support"

  // Custom fields (agent-specific)
  custom?: Record<string, any>;
}

interface TraceSummary {
  trace_id: string;
  summary: string;              // LLM-generated summary
  human_score: number;          // 0-1
  key_behaviors: string[];      // What made this good/bad
}

interface TraceFeedbackPair {
  trace_id: string;
  human_feedback: string;       // Textual feedback
  human_score: number;
}
```

### 2.2 Candidate (What GEPA Optimizes)

```typescript
interface Candidate {
  system_prompt: string;        // The agent's system prompt being optimized
  // Future: could include other optimizable components
  // response_format?: string;
  // tool_descriptions?: string;
}
```

### 2.3 Trace (Agent Execution Record)

```typescript
interface Trace {
  id: string;
  agent_id: string;
  agent_version_id: string;

  // The execution
  system_prompt: string;
  user_message: string;
  agent_response: string;
  tool_calls?: ToolCall[];

  // Extracted task (for DataInst creation)
  extracted_task?: DataInst;

  // Human feedback (when available)
  human_score?: number;         // 0-1
  human_feedback?: string;      // Textual

  // Eval results
  eval_score?: number;          // 0-1 (μ)
  eval_feedback?: string;       // (μ_f)

  created_at: Date;
}
```

### 2.4 EvalFunction (Scores Traces)

```typescript
interface EvalFunction {
  id: string;
  agent_id: string;
  version: number;
  status: "candidate" | "active" | "archived";

  // The eval implementation
  code: string;                 // Python code
  llm_prompt_template?: string; // For LLM-as-judge component

  // Performance metrics
  human_agreement_rate: number; // Correlation with human labels
  confusion_matrix: {
    true_positive: number;
    true_negative: number;
    false_positive: number;
    false_negative: number;
  };

  created_at: Date;
}
```

---

## 3. Eval Function Interface

### 3.1 Function Signature

```python
def eval_function(
    task: dict,              # {"user_message": "..."}
    task_metadata: dict,     # Ground truth, references, etc.
    trace: dict,             # Full execution trace
    ctx: EvalContext         # LLM access, utilities
) -> tuple[float, str]:
    """
    Evaluate an agent's execution.

    Args:
        task: The task the agent was given
        task_metadata: Supplementary evaluation info (hidden from agent)
        trace: The agent's execution trace
        ctx: Evaluation context with utilities

    Returns:
        μ: float in [0, 1] - quality score
        μ_f: str - feedback explaining the score
    """
    ...
```

### 3.2 EvalContext (What Evals Can Access)

```python
class EvalContext:
    """Sandboxed context for eval execution."""

    # LLM access (rate-limited, cost-tracked)
    def call_llm(
        self,
        prompt: str,
        model: str = "claude-sonnet-4-5-20250514",
        temperature: float = 0.0,
        max_tokens: int = 500,
        cache_key: str | None = None
    ) -> str:
        """Call LLM for semantic evaluation."""
        ...

    # Safe imports available
    # - json, re, typing, math, datetime
    # - difflib (for string similarity)
    # - No network, no file I/O, no subprocess

    # Cost tracking
    def get_cost_so_far(self) -> float: ...
    def get_remaining_budget(self) -> float: ...
```

### 3.3 Example Eval Function

```python
def eval_code_quality(task, task_metadata, trace, ctx):
    """Evaluate code generation quality."""

    response = trace["agent_response"]
    expected = task_metadata.get("expected_output")

    # Stage 1: Syntactic checks (fast, free)
    if not response or len(response) < 10:
        return 0.1, "Response too short"

    if "```" not in response:
        return 0.3, "No code block found"

    # Stage 2: Ground truth comparison (if available)
    if expected:
        # Extract code from response
        code = extract_code_block(response)
        if code.strip() == expected.strip():
            return 1.0, "Exact match with expected solution"

    # Stage 3: LLM-as-judge (semantic evaluation)
    similar_traces = task_metadata.get("similar_high_rated_traces", [])
    reference_context = ""
    if similar_traces:
        reference_context = f"""
Reference examples of good solutions:
{format_trace_summaries(similar_traces[:2])}
"""

    judge_prompt = f"""
Evaluate this code solution.

Task: {task["user_message"]}

Solution:
{response}

{reference_context}

Score 0-1 on:
- Correctness (40%): Does it solve the problem?
- Efficiency (30%): Is it reasonably efficient?
- Clarity (30%): Is it readable and well-structured?

Return JSON: {{"score": 0.0-1.0, "feedback": "..."}}
"""

    result = ctx.call_llm(judge_prompt, cache_key=f"judge_{hash(response)}")
    parsed = json.loads(result)

    return parsed["score"], parsed["feedback"]
```

---

## 4. Task Extraction Module

### 4.1 Single-Step Task Extraction

```typescript
interface TaskExtractor {
  /**
   * Extract DataInst from a trace.
   * For single-step: straightforward slicing.
   */
  extractTask(trace: Trace): DataInst;
}

class SingleStepTaskExtractor implements TaskExtractor {
  extractTask(trace: Trace): DataInst {
    return {
      task: {
        user_message: trace.user_message
      },
      task_metadata: {
        // Start empty, enriched later
      }
    };
  }
}
```

### 4.2 Task Metadata Enrichment

```typescript
interface TaskMetadataEnricher {
  /**
   * Enrich task_metadata with additional context.
   * Called after extraction, before eval.
   */
  enrich(dataInst: DataInst, context: EnrichmentContext): Promise<DataInst>;
}

class DefaultMetadataEnricher implements TaskMetadataEnricher {
  async enrich(dataInst: DataInst, ctx: EnrichmentContext): Promise<DataInst> {
    const metadata = { ...dataInst.task_metadata };

    // 1. Find similar high-rated traces
    if (ctx.enableSimilarTraces) {
      const similar = await ctx.traceService.findSimilar(
        dataInst.task.user_message,
        { minScore: 0.8, limit: 3 }
      );
      metadata.similar_high_rated_traces = similar.map(t => ({
        trace_id: t.id,
        summary: t.summary,
        human_score: t.human_score,
        key_behaviors: t.key_behaviors
      }));
    }

    // 2. Find traces with specific feedback
    if (ctx.enableFeedbackTraces) {
      const withFeedback = await ctx.traceService.findWithFeedback(
        dataInst.task.user_message,
        { limit: 2 }
      );
      metadata.traces_with_specific_feedback = withFeedback.map(t => ({
        trace_id: t.id,
        human_feedback: t.human_feedback,
        human_score: t.human_score
      }));
    }

    // 3. Categorize task type
    if (ctx.enableTaskCategorization) {
      metadata.task_type = await ctx.classifier.categorize(
        dataInst.task.user_message
      );
    }

    return { ...dataInst, task_metadata: metadata };
  }
}
```

### 4.3 Synthetic Task Generation

For agents without existing traces:

```typescript
interface SyntheticTaskGenerator {
  /**
   * Generate synthetic tasks for evaluation.
   * Used when no real traces available.
   */
  generate(
    agentDescription: string,
    count: number,
    options?: GenerationOptions
  ): Promise<DataInst[]>;
}

class LLMTaskGenerator implements SyntheticTaskGenerator {
  async generate(
    agentDescription: string,
    count: number,
    options?: GenerationOptions
  ): Promise<DataInst[]> {

    const prompt = `
Generate ${count} realistic test tasks for this agent:

Agent Description:
${agentDescription}

For each task, provide:
1. user_message: What the user would ask
2. expected_output: What a good response looks like (brief)
3. difficulty: easy/medium/hard
4. task_type: categorization

Return JSON array.
`;

    const result = await this.llm.call(prompt);
    const tasks = JSON.parse(result);

    return tasks.map(t => ({
      task: { user_message: t.user_message },
      task_metadata: {
        expected_output: t.expected_output,
        difficulty: t.difficulty,
        task_type: t.task_type
      }
    }));
  }
}
```

---

## 5. Eval Generation and Optimization Flow

### 5.1 Prerequisites

Before eval generation can run:
1. Agent has traces in the system
2. Some traces have human feedback (score + optional text)
3. Minimum threshold: ~20 labeled traces recommended

### 5.2 Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     EVAL GENERATION FLOW                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. COLLECT LABELED TRACES                                          │
│     traces = getTracesWithHumanFeedback(agent_id)                  │
│     require: len(traces) >= 20                                      │
│                                                                     │
│  2. EXTRACT TASKS                                                   │
│     for trace in traces:                                            │
│       data_inst = taskExtractor.extractTask(trace)                  │
│       data_inst = metadataEnricher.enrich(data_inst)               │
│                                                                     │
│  3. GENERATE CANDIDATE EVALS                                        │
│     candidates = autoEvalGenerator.generate(                        │
│       labeled_traces,                                               │
│       target_count=5  # Generate 5 candidate evals                 │
│     )                                                               │
│                                                                     │
│  4. SCORE CANDIDATES (Human Agreement)                              │
│     for candidate in candidates:                                    │
│       for trace in traces:                                          │
│         eval_score = candidate.eval(trace)                          │
│         human_score = trace.human_score                             │
│         agreement += correlation(eval_score, human_score)           │
│       candidate.agreement_rate = agreement / len(traces)            │
│                                                                     │
│  5. SELECT WINNER (Best Human Agreement)                            │
│     winner = max(candidates, key=lambda c: c.agreement_rate)        │
│     if winner.agreement_rate >= threshold:                          │
│       promoteToActive(winner)                                       │
│     else:                                                           │
│       requestMoreLabels()                                           │
│                                                                     │
│  6. ACTIVATE FOR GEPA                                               │
│     agent.active_eval = winner                                      │
│     # Now GEPA can use this eval to optimize agent prompts          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.3 Auto Eval Generation

```python
class AutoEvalGenerator:
    """Generate candidate eval functions from labeled traces."""

    async def generate(
        self,
        labeled_traces: list[LabeledTrace],
        target_count: int = 5
    ) -> list[EvalCandidate]:

        # Analyze patterns in successful vs failed traces
        high_scored = [t for t in labeled_traces if t.human_score > 0.7]
        low_scored = [t for t in labeled_traces if t.human_score < 0.4]

        # Build context for eval generation
        analysis_prompt = f"""
Analyze these agent executions to understand what makes good vs bad responses.

HIGH-QUALITY EXECUTIONS (score > 0.7):
{format_traces(high_scored[:5])}

LOW-QUALITY EXECUTIONS (score < 0.4):
{format_traces(low_scored[:5])}

What patterns distinguish good from bad responses?
What should an eval function check for?
"""

        patterns = await self.llm.call(analysis_prompt)

        # Generate candidate eval functions
        candidates = []
        for i in range(target_count):
            gen_prompt = f"""
Generate a Python eval function based on these patterns:

{patterns}

The function signature MUST be:
def eval_function(task, task_metadata, trace, ctx) -> tuple[float, str]:
    # task: {{"user_message": "..."}}
    # task_metadata: ground truth, references, etc.
    # trace: {{"agent_response": "...", ...}}
    # ctx: has ctx.call_llm() for semantic checks

Return score (0-1) and feedback string.

Variation {i+1}: Focus on {"correctness" if i==0 else "efficiency" if i==1 else "different aspect"}.
"""

            code = await self.llm.call(gen_prompt)
            candidates.append(EvalCandidate(
                code=extract_python_code(code),
                variation=i
            ))

        return candidates
```

### 5.4 Human Agreement Optimization

```python
def optimize_for_human_agreement(
    candidates: list[EvalCandidate],
    labeled_traces: list[LabeledTrace]
) -> EvalCandidate:
    """Select eval with highest correlation to human labels."""

    for candidate in candidates:
        eval_scores = []
        human_scores = []

        for trace in labeled_traces:
            try:
                score, _ = execute_eval(candidate.code, trace)
                eval_scores.append(score)
                human_scores.append(trace.human_score)
            except Exception:
                # Eval failed - penalize
                eval_scores.append(0.0)
                human_scores.append(trace.human_score)

        # Calculate correlation (Pearson or Spearman)
        candidate.agreement_rate = pearson_correlation(eval_scores, human_scores)

        # Calculate confusion matrix (binarized at 0.5)
        candidate.confusion_matrix = calculate_confusion_matrix(
            eval_scores, human_scores, threshold=0.5
        )

    # Return best by agreement
    return max(candidates, key=lambda c: c.agreement_rate)
```

---

## 6. GEPA Integration

### 6.1 IofoldGEPAAdapter

```python
class IofoldGEPAAdapter:
    """
    GEPA adapter for iofold.
    Uses active eval function to score agent executions.
    """

    def __init__(
        self,
        agent_id: str,
        eval_function: EvalFunction,
        task_extractor: TaskExtractor,
        metadata_enricher: TaskMetadataEnricher,
        llm_client: LLMClient
    ):
        self.agent_id = agent_id
        self.eval_function = eval_function
        self.task_extractor = task_extractor
        self.metadata_enricher = metadata_enricher
        self.llm = llm_client

    def evaluate(
        self,
        batch: list[DataInst],
        candidate: dict[str, str],  # {"system_prompt": "..."}
        capture_traces: bool = False
    ) -> EvaluationBatch:

        outputs = []
        scores = []
        trajectories = [] if capture_traces else None

        for data_inst in batch:
            try:
                # 1. Run agent with candidate's system prompt
                response = self.llm.call(
                    system=candidate["system_prompt"],
                    user=data_inst["task"]["user_message"]
                )

                # 2. Create trace from execution
                trace = {
                    "system_prompt": candidate["system_prompt"],
                    "user_message": data_inst["task"]["user_message"],
                    "agent_response": response
                }

                # 3. Score using active eval function
                ctx = EvalContext(llm=self.llm)
                score, feedback = execute_eval(
                    self.eval_function.code,
                    data_inst["task"],
                    data_inst["task_metadata"],
                    trace,
                    ctx
                )

                outputs.append({"response": response, "feedback": feedback})
                scores.append(score)

                if capture_traces:
                    trajectories.append({
                        "data_inst": data_inst,
                        "trace": trace,
                        "score": score,
                        "feedback": feedback
                    })

            except Exception as e:
                outputs.append({"error": str(e)})
                scores.append(0.0)
                if capture_traces:
                    trajectories.append({"error": str(e)})

        return EvaluationBatch(
            outputs=outputs,
            scores=scores,
            trajectories=trajectories
        )

    def make_reflective_dataset(
        self,
        candidate: dict[str, str],
        eval_batch: EvaluationBatch,
        components_to_update: list[str]
    ) -> dict[str, list[dict]]:

        records = []

        for traj, score in zip(eval_batch.trajectories, eval_batch.scores):
            if traj.get("error"):
                feedback = f"Execution failed: {traj['error']}"
            elif score < 0.5:
                feedback = f"Low score ({score:.2f}): {traj.get('feedback', 'No feedback')}"
            else:
                feedback = f"Good score ({score:.2f}): {traj.get('feedback', 'Success')}"

            records.append({
                "Inputs": traj["data_inst"]["task"]["user_message"],
                "Generated Outputs": traj["trace"]["agent_response"][:500],
                "Feedback": feedback
            })

        return {"system_prompt": records}
```

### 6.2 Running GEPA Optimization

```python
async def optimize_agent(agent_id: str):
    """Run GEPA optimization for an agent."""

    # 1. Load agent and its active eval
    agent = await agent_service.get(agent_id)
    eval_fn = await eval_service.get_active(agent_id)

    if not eval_fn:
        raise ValueError("Agent has no active eval function. Generate one first.")

    # 2. Load task dataset
    trainset, valset = await load_task_dataset(agent_id)

    if len(trainset) < 20:
        raise ValueError("Need at least 20 tasks for optimization")

    # 3. Create adapter
    adapter = IofoldGEPAAdapter(
        agent_id=agent_id,
        eval_function=eval_fn,
        task_extractor=SingleStepTaskExtractor(),
        metadata_enricher=DefaultMetadataEnricher(),
        llm_client=llm_client
    )

    # 4. Run GEPA
    result = gepa.optimize(
        seed_candidate={
            "system_prompt": agent.system_prompt
        },
        trainset=trainset,
        valset=valset,
        adapter=adapter,
        reflection_lm="claude-opus-4-5-20250514",
        max_metric_calls=100,
        candidate_selection_strategy="pareto"
    )

    # 5. Save optimized prompt
    if result.best_candidate:
        new_prompt = result.best_candidate["system_prompt"]
        improvement = result.val_aggregate_scores[result.best_idx] - result.val_aggregate_scores[0]

        if improvement > 0.05:  # 5% improvement threshold
            await agent_service.create_version(
                agent_id=agent_id,
                system_prompt=new_prompt,
                source="gepa_optimization",
                improvement_score=improvement
            )

    return result
```

---

## 7. Database Schema Updates

```sql
-- Task metadata for DataInst
CREATE TABLE task_metadata (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL REFERENCES traces(id),

  -- Extracted task
  user_message TEXT NOT NULL,

  -- Ground truth (if available)
  expected_output TEXT,
  expected_action TEXT,
  success_criteria TEXT,  -- JSON array

  -- Task categorization
  task_type TEXT,
  difficulty TEXT CHECK(difficulty IN ('easy', 'medium', 'hard')),
  domain TEXT,

  -- Custom fields
  custom_metadata TEXT,  -- JSON

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(trace_id)
);

-- Similar trace references
CREATE TABLE task_similar_traces (
  id TEXT PRIMARY KEY,
  task_metadata_id TEXT NOT NULL REFERENCES task_metadata(id),
  similar_trace_id TEXT NOT NULL REFERENCES traces(id),

  similarity_score REAL NOT NULL,
  human_score REAL,
  summary TEXT,
  key_behaviors TEXT,  -- JSON array

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Active eval per agent
ALTER TABLE agents ADD COLUMN active_eval_id TEXT REFERENCES eval_definitions(id);

-- Eval candidates with human agreement metrics
CREATE TABLE eval_candidates (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),

  code TEXT NOT NULL,
  llm_prompt_template TEXT,

  -- Human agreement metrics
  agreement_rate REAL,
  confusion_matrix TEXT,  -- JSON: {tp, tn, fp, fn}

  status TEXT DEFAULT 'candidate' CHECK(status IN ('candidate', 'active', 'archived')),

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_task_metadata_trace ON task_metadata(trace_id);
CREATE INDEX idx_eval_candidates_agent ON eval_candidates(agent_id);
CREATE INDEX idx_eval_candidates_status ON eval_candidates(status);
```

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

- [ ] Implement `DataInst` and `TaskMetadata` types
- [ ] Create `SingleStepTaskExtractor`
- [ ] Create `task_metadata` database table
- [ ] Implement basic `EvalContext` with LLM access
- [ ] Update eval function signature to new interface

### Phase 2: Eval Generation (Week 2-3)

- [ ] Implement `AutoEvalGenerator`
- [ ] Build human agreement optimization
- [ ] Create `eval_candidates` table
- [ ] Add "active eval" selection per agent
- [ ] API endpoints for eval generation

### Phase 3: Task Enrichment (Week 3-4)

- [ ] Implement `DefaultMetadataEnricher`
- [ ] Add similar trace lookup
- [ ] Add traces-with-feedback lookup
- [ ] Create `task_similar_traces` table

### Phase 4: GEPA Integration (Week 4-5)

- [ ] Implement `IofoldGEPAAdapter`
- [ ] Create optimization job
- [ ] Add agent versioning for optimized prompts
- [ ] Build optimization dashboard

### Phase 5: Demo (Week 5-6)

- [ ] Set up demo agent with synthetic tasks
- [ ] Generate eval function from sample labels
- [ ] Run GEPA optimization
- [ ] Show improvement metrics

---

## 9. Open Questions

1. **How many labeled traces minimum?** Currently assuming 20, may need experimentation.

2. **Human agreement threshold for activation?** What correlation is "good enough"?

3. **Eval cost budget per trace?** Currently $0.05, may need adjustment.

4. **Synthetic task quality?** How to validate generated tasks are realistic?

5. **Multi-agent eval sharing?** Can similar agents share eval functions?
