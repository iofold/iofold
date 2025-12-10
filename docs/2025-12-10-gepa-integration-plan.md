# GEPA Integration Plan

**Date:** 2025-12-10
**Status:** Planning
**Estimated Code Reduction:** ~70%

## Overview

Integrate with the official GEPA library (github.com/gepa-ai/gepa) instead of reimplementing the optimization algorithm. GEPA provides a complete genetic-Pareto optimization framework for prompt engineering.

## What GEPA Provides (DON'T REIMPLEMENT)

| Component | Description | Lines Saved |
|-----------|-------------|-------------|
| `ReflectiveMutationProposer` | LLM-guided prompt improvement based on failure analysis | ~200 |
| `MergeProposer` | Combines compatible descendants of common ancestors | ~150 |
| `ParetoCandidateSelector` | Tracks best score per validation example | ~100 |
| `GEPAState` | Persistence, resume, Pareto frontier tracking | ~200 |
| `GEPAEngine` | Main optimization loop orchestration | ~300 |
| Stop conditions | MaxMetricCalls, ScoreThreshold, Timeout, NoImprovement | ~50 |
| Experiment tracking | W&B/MLflow integration | ~100 |

**Total lines we don't need to write: ~1,100**

## What We Implement

### 1. IofoldGEPAAdapter (~150 lines Python)

```python
from gepa.core.adapter import GEPAAdapter
from gepa.core.types import Candidate, DataInst, EvaluationBatch

class IofoldGEPAAdapter(GEPAAdapter):
    """Adapter connecting GEPA to iofold's agent execution and eval system."""

    def __init__(self, agent_config: dict, eval_code: str, sandbox_url: str):
        self.agent_config = agent_config
        self.eval_code = eval_code
        self.sandbox_url = sandbox_url

    def evaluate(
        self,
        batch: List[DataInst],
        candidate: Candidate,
        capture_traces: bool = False
    ) -> EvaluationBatch:
        """
        Execute agent with candidate prompt on batch, run eval_code.

        1. For each DataInst in batch:
           a. Execute agent with candidate["system_prompt"]
           b. Run eval_code on (task, trace) in sandbox
           c. Collect score and trajectory
        2. Return EvaluationBatch with all results
        """
        outputs = []
        scores = []
        trajectories = []

        for inst in batch:
            # Execute agent
            trace = self._execute_agent(inst.task, candidate)

            # Run eval
            score = self._run_eval(inst.task, trace, inst.task_metadata)

            outputs.append(trace)
            scores.append(score)
            if capture_traces:
                trajectories.append({"task": inst.task, "trace": trace})

        return EvaluationBatch(
            outputs=outputs,
            scores=scores,
            trajectories=trajectories if capture_traces else None
        )

    def make_reflective_dataset(
        self,
        candidate: Candidate,
        eval_batch: EvaluationBatch,
        components_to_update: List[str]
    ) -> Dict[str, List[Dict]]:
        """
        Build feedback for reflection LLM to analyze failures.

        Returns dict mapping component name to list of failure examples
        with task, output, score, and analysis hints.
        """
        reflective_data = {comp: [] for comp in components_to_update}

        for i, (output, score) in enumerate(zip(eval_batch.outputs, eval_batch.scores)):
            if score < 1.0:  # Include failures and partial successes
                trajectory = eval_batch.trajectories[i] if eval_batch.trajectories else {}
                for comp in components_to_update:
                    reflective_data[comp].append({
                        "task": trajectory.get("task", {}),
                        "output": output,
                        "score": score,
                        "current_text": candidate.get(comp, ""),
                    })

        return reflective_data
```

### 2. GEPAOptimizationJob (~100 lines TypeScript)

```typescript
// src/jobs/gepa-optimization-job.ts

import { Job } from './job-worker';
import { callPythonGEPA } from '../python/gepa-bridge';

interface GEPAJobPayload {
  agent_id: string;
  eval_id: string;
  test_case_ids: string[];
  max_metric_calls?: number;
  resume_run_id?: string;
}

export class GEPAOptimizationJob implements Job<GEPAJobPayload> {
  async execute(payload: GEPAJobPayload, ctx: JobContext): Promise<GEPAJobResult> {
    // 1. Load test cases as DataInst[]
    const testCases = await this.loadTestCases(payload.test_case_ids);

    // 2. Load eval code
    const evalCode = await this.loadEvalCode(payload.eval_id);

    // 3. Load agent config
    const agentConfig = await this.loadAgentConfig(payload.agent_id);

    // 4. Call Python GEPA via bridge
    const result = await callPythonGEPA({
      seed_candidate: { system_prompt: agentConfig.system_prompt },
      trainset: testCases.slice(0, Math.floor(testCases.length * 0.8)),
      valset: testCases.slice(Math.floor(testCases.length * 0.8)),
      adapter_config: {
        agent_config: agentConfig,
        eval_code: evalCode,
        sandbox_url: ctx.env.SANDBOX_URL,
      },
      max_metric_calls: payload.max_metric_calls ?? 50,
      state_path: payload.resume_run_id
        ? `gepa_states/${payload.resume_run_id}.json`
        : undefined,
    });

    // 5. Save results
    await this.saveResults(payload, result);

    return result;
  }
}
```

### 3. Minimal Database Schema

```sql
-- test_cases: DataInst format for GEPA
CREATE TABLE test_cases (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  task JSON NOT NULL,              -- {"user_message": "...", "context": {...}}
  task_metadata JSON DEFAULT '{}', -- expected_output, success_criteria, tags
  name TEXT,
  source TEXT DEFAULT 'manual',    -- 'manual', 'trace', 'synthetic'
  source_trace_id TEXT,
  tags JSON DEFAULT '[]',
  status TEXT DEFAULT 'active',    -- 'active', 'archived', 'failed'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE INDEX idx_test_cases_agent ON test_cases(agent_id, status);
CREATE INDEX idx_test_cases_source ON test_cases(source, source_trace_id);

-- gepa_runs: Minimal run tracking (GEPA handles detailed state internally)
CREATE TABLE gepa_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  eval_id TEXT NOT NULL,

  -- Input
  seed_prompt TEXT NOT NULL,
  test_case_count INTEGER NOT NULL,
  max_metric_calls INTEGER DEFAULT 50,

  -- Status
  status TEXT DEFAULT 'pending',   -- 'pending', 'running', 'completed', 'failed', 'cancelled'

  -- Output (populated on completion)
  best_prompt TEXT,
  best_score REAL,
  total_candidates INTEGER,
  total_metric_calls INTEGER,

  -- GEPA state for resume
  state_path TEXT,                 -- R2 path to GEPAState JSON

  -- Timestamps
  started_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (eval_id) REFERENCES evals(id)
);

CREATE INDEX idx_gepa_runs_status ON gepa_runs(workspace_id, status);
CREATE INDEX idx_gepa_runs_agent ON gepa_runs(agent_id, created_at DESC);
```

## GEPA Architecture Reference

### Entry Point

```python
from gepa import optimize

result = optimize(
    seed_candidate={"system_prompt": "You are a helpful assistant..."},
    trainset=train_data,           # List[DataInst] for optimization
    valset=val_data,               # List[DataInst] for final evaluation
    adapter=IofoldGEPAAdapter(...),
    reflection_lm=dspy.LM("anthropic/claude-sonnet-4-5"),
    max_metric_calls=50,           # Stop after 50 evaluations
    state_path="./gepa_state.json", # For resume
    wandb_project="iofold-gepa",   # Optional tracking
)

print(result.best_candidate)       # {"system_prompt": "Improved prompt..."}
print(result.best_validation_score) # 0.85
```

### Key Data Structures

```python
# Candidate: Component name → text
Candidate = Dict[str, str]
# Example: {"system_prompt": "...", "output_format": "..."}

# DataInst: User-defined input structure
@dataclass
class DataInst:
    task: Dict[str, Any]           # Input to agent
    task_metadata: Dict[str, Any]  # Expected output, success criteria

# EvaluationBatch: Results from evaluate()
@dataclass
class EvaluationBatch:
    outputs: List[Any]             # Agent outputs
    scores: List[float]            # 0.0-1.0 per example
    trajectories: Optional[List]   # For reflection (capture_traces=True)
```

### Optimization Loop (handled by GEPA)

```
1. INITIALIZE
   - Load/create GEPAState with seed candidate
   - Evaluate seed on full valset
   - Initialize Pareto frontier

2. MAIN LOOP (until stop condition)
   a. MERGE ATTEMPT
      - MergeProposer finds compatible Pareto-front candidates
      - If merge successful, add to candidates

   b. REFLECTIVE MUTATION
      - ParetoCandidateSelector picks candidate to improve
      - Sample minibatch from trainset
      - Evaluate with capture_traces=True
      - make_reflective_dataset() builds failure analysis
      - ReflectiveMutationProposer generates improved text
      - Evaluate mutation on minibatch
      - Accept if improved (score >= parent)

   c. FULL EVALUATION
      - Run accepted candidate on full valset
      - Update Pareto frontier per example
      - Track experiment metrics

3. OUTPUT
   - GEPAResult with best_candidate, all candidates, metrics
```

## Files to Deprecate

These files duplicate what GEPA provides:

| File | GEPA Replacement |
|------|------------------|
| `src/services/eval/auto-eval-generator.ts` | `ReflectiveMutationProposer` |
| `src/services/eval/winner-selector.ts` | `ParetoCandidateSelector` |
| `src/services/eval/cross-validator.ts` | `GEPAEngine` validation |

## Files to Keep

These provide functionality GEPA doesn't:

| File | Purpose |
|------|---------|
| `src/services/eval/eval-runner.ts` | Python sandbox execution |
| `src/services/eval/eval-context.ts` | Sandbox LLM context |
| `src/services/task-extraction/` | Extract DataInst from traces |
| `src/playground/agent-deepagents.ts` | Execute agents |

## Implementation Steps

### Phase 1: Dependencies & Schema
1. Add `gepa` to Python dependencies
2. Create D1 migration for `test_cases` and `gepa_runs` tables
3. Create R2 bucket for GEPA state persistence

### Phase 2: Core Integration
4. Implement `IofoldGEPAAdapter` in Python
5. Create Python-TypeScript bridge for GEPA calls
6. Implement `GEPAOptimizationJob`

### Phase 3: API & UI
7. Add API endpoints for GEPA runs
8. Add test case management endpoints
9. UI for starting/monitoring optimization runs

### Phase 4: Cleanup
10. Deprecate redundant services
11. Update documentation
12. Add monitoring/alerting

## Configuration Options

```typescript
interface GEPAConfig {
  // Stop conditions (any can trigger stop)
  max_metric_calls?: number;      // Default: 50
  score_threshold?: number;       // Stop if best >= threshold
  timeout_seconds?: number;       // Max wall-clock time
  no_improvement_calls?: number;  // Stop if no improvement for N calls

  // Optimization parameters
  minibatch_size?: number;        // Default: 4
  components_to_optimize?: string[]; // Default: all
  component_update_mode?: 'round_robin' | 'all_simultaneously';

  // Experiment tracking
  wandb_project?: string;
  mlflow_experiment?: string;
}
```

## Success Metrics

- [ ] GEPA optimization runs successfully on test cases
- [ ] State persistence enables run resumption
- [ ] Best prompt shows measurable improvement over seed
- [ ] ~70% reduction in custom optimization code
- [ ] Integration tests pass for adapter methods
