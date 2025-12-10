# GEPA Integration Plan v2

**Date:** 2025-12-10
**Status:** Planning (Revised after architecture review)
**Previous:** [v1](./2025-12-10-gepa-integration-plan.md)

## Architecture Overview

GEPA runs in a Python sandbox (Cloudflare Container) and communicates with the iofold platform via HTTP APIs. The platform handles agent execution (rollouts), while the sandbox handles GEPA optimization logic and eval execution.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        GEPA OPTIMIZATION FLOW                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  User clicks "Run GEPA Optimization"                                    │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  TypeScript Worker: POST /api/agents/{id}/gepa/start            │   │
│  │    1. Validate inputs (agent, eval, test cases)                 │   │
│  │    2. Create gepa_runs record (status='pending')                │   │
│  │    3. Spawn Python sandbox with GEPA code                       │   │
│  │    4. Pass: session_token, api_base_url, config                 │   │
│  │    5. Return job_id for polling                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Python Sandbox (Cloudflare Container)                          │   │
│  │                                                                 │   │
│  │  gepa.optimize(                                                 │   │
│  │    adapter=IofoldGEPAAdapter(                                   │   │
│  │      api_base_url="https://api.iofold.com",                    │   │
│  │      session_token=token,  # Same auth as initiating user      │   │
│  │      eval_code=eval_code,                                       │   │
│  │    ),                                                           │   │
│  │    reflection_lm=OpenAI(base_url=AI_GATEWAY_URL),              │   │
│  │    ...                                                          │   │
│  │  )                                                              │   │
│  │                                                                 │   │
│  │  IofoldGEPAAdapter.evaluate(batch, candidate):                 │   │
│  │    │                                                            │   │
│  │    │  # 1. Request rollouts from platform                       │   │
│  │    ├──▶ POST /api/internal/rollouts/batch                      │   │
│  │    │      { agent_id, tasks, system_prompt, parallelism }      │   │
│  │    │      → { batch_id }                                        │   │
│  │    │                                                            │   │
│  │    │  # 2. Poll for completion (10 min timeout)                 │   │
│  │    ├──▶ GET /api/internal/rollouts/batch/{batch_id}            │   │
│  │    │      → { status, results: [{task_id, trace, error}] }     │   │
│  │    │                                                            │   │
│  │    │  # 3. Run evals locally in sandbox                         │   │
│  │    ├──▶ for trace in results: eval_function(task, trace)       │   │
│  │    │                                                            │   │
│  │    └──▶ Return EvaluationBatch(scores, outputs, trajectories)  │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         │  HTTP calls (using session_token for auth)                   │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  TypeScript Worker: Rollout Execution                           │   │
│  │                                                                 │   │
│  │  POST /api/internal/rollouts/batch                             │   │
│  │    1. Validate session_token (same user who started GEPA)      │   │
│  │    2. Create rollout_batch record                               │   │
│  │    3. For each task: queue to Cloudflare Queue                  │   │
│  │    4. Return batch_id                                           │   │
│  │                                                                 │   │
│  │  Queue Consumer (parallelism controlled by queue config):       │   │
│  │    1. createPlaygroundDeepAgent(system_prompt)                  │   │
│  │    2. agent.invoke(task.user_message)                           │   │
│  │    3. Collect trace via D1TraceCollector                        │   │
│  │    4. Store result in rollout_results table                     │   │
│  │                                                                 │   │
│  │  GET /api/internal/rollouts/batch/{batch_id}                   │   │
│  │    1. Query rollout_results for this batch                      │   │
│  │    2. Return completed results + overall status                 │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Agent execution | iofold platform (TypeScript) | Tool calls, tracing, platform integration all work |
| Eval execution | Python sandbox (local) | Fast, no network round-trip per eval |
| LLM for reflection | Python sandbox → AI Gateway | httpx + OpenAI SDK, direct HTTP to gateway |
| Auth for internal APIs | Session token passthrough | No new token type, same permissions as user |
| Rollout parallelism | Cloudflare Queues | Platform handles concurrency, configurable |
| Polling timeout | 10 minutes | Cancel incomplete tasks after timeout |

## New Components

### 1. Internal APIs (TypeScript)

#### `POST /api/internal/rollouts/batch`

Request rollout generation for a batch of tasks.

```typescript
// src/api/internal/rollouts.ts

interface BatchRolloutRequest {
  agent_id: string;
  agent_version_id?: string;      // Optional, defaults to active version
  system_prompt: string;          // Candidate prompt to test (overrides agent default)
  tasks: Array<{
    task_id: string;
    user_message: string;
    context?: Record<string, any>;
  }>;
  config?: {
    parallelism?: number;         // Max concurrent executions (default: 5)
    timeout_per_task_ms?: number; // Per-task timeout (default: 30000)
    model_id?: string;            // Override model
  };
}

interface BatchRolloutResponse {
  batch_id: string;
  task_count: number;
  status: 'queued';
  created_at: string;
}

// Handler
export async function createBatchRollout(
  request: BatchRolloutRequest,
  ctx: ApiContext
): Promise<BatchRolloutResponse> {
  // 1. Validate agent exists and user has access
  const agent = await ctx.db.prepare(
    `SELECT * FROM agents WHERE id = ? AND workspace_id = ?`
  ).bind(request.agent_id, ctx.workspaceId).first();

  if (!agent) throw new ApiError(404, 'Agent not found');

  // 2. Create batch record
  const batchId = generateId('rb');
  await ctx.db.prepare(`
    INSERT INTO rollout_batches (id, workspace_id, agent_id, system_prompt, task_count, status, config)
    VALUES (?, ?, ?, ?, ?, 'queued', ?)
  `).bind(
    batchId,
    ctx.workspaceId,
    request.agent_id,
    request.system_prompt,
    request.tasks.length,
    JSON.stringify(request.config || {})
  ).run();

  // 3. Queue each task
  const parallelism = request.config?.parallelism || 5;
  for (const task of request.tasks) {
    await ctx.queue.send({
      type: 'rollout_task',
      batch_id: batchId,
      task_id: task.task_id,
      agent_id: request.agent_id,
      system_prompt: request.system_prompt,
      user_message: task.user_message,
      context: task.context,
      config: request.config,
    });
  }

  return {
    batch_id: batchId,
    task_count: request.tasks.length,
    status: 'queued',
    created_at: new Date().toISOString(),
  };
}
```

#### `GET /api/internal/rollouts/batch/{batch_id}`

Poll for batch completion status and results.

```typescript
interface BatchStatusResponse {
  batch_id: string;
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed';
  progress: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
  };
  results?: Array<{
    task_id: string;
    status: 'completed' | 'failed' | 'timeout';
    trace?: LangGraphExecutionStep[];
    execution_time_ms?: number;
    error?: string;
  }>;
  created_at: string;
  completed_at?: string;
}

export async function getBatchStatus(
  batchId: string,
  ctx: ApiContext
): Promise<BatchStatusResponse> {
  // 1. Get batch record
  const batch = await ctx.db.prepare(`
    SELECT * FROM rollout_batches WHERE id = ? AND workspace_id = ?
  `).bind(batchId, ctx.workspaceId).first();

  if (!batch) throw new ApiError(404, 'Batch not found');

  // 2. Get all results for this batch
  const results = await ctx.db.prepare(`
    SELECT * FROM rollout_results WHERE batch_id = ?
  `).bind(batchId).all();

  const completed = results.results.filter(r => r.status === 'completed').length;
  const failed = results.results.filter(r => r.status === 'failed').length;
  const pending = batch.task_count - completed - failed;

  // 3. Determine overall status
  let status: BatchStatusResponse['status'] = 'running';
  if (pending === 0) {
    status = failed > 0 ? 'partial' : 'completed';
  } else if (completed === 0 && failed === 0) {
    status = 'queued';
  }

  return {
    batch_id: batchId,
    status,
    progress: {
      total: batch.task_count,
      completed,
      failed,
      pending,
    },
    results: results.results.map(r => ({
      task_id: r.task_id,
      status: r.status,
      trace: r.trace ? JSON.parse(r.trace) : undefined,
      execution_time_ms: r.execution_time_ms,
      error: r.error,
    })),
    created_at: batch.created_at,
    completed_at: pending === 0 ? new Date().toISOString() : undefined,
  };
}
```

### 2. Queue Consumer for Rollout Tasks

```typescript
// src/queue/rollout-consumer.ts

interface RolloutTaskMessage {
  type: 'rollout_task';
  batch_id: string;
  task_id: string;
  agent_id: string;
  system_prompt: string;
  user_message: string;
  context?: Record<string, any>;
  config?: {
    timeout_per_task_ms?: number;
    model_id?: string;
  };
}

export async function handleRolloutTask(
  message: RolloutTaskMessage,
  env: Env
): Promise<void> {
  const startTime = Date.now();

  try {
    // 1. Create agent with candidate system prompt
    const agent = createPlaygroundDeepAgent({
      db: env.DB,
      sandbox: env.SANDBOX,
      sessionId: `rollout-${message.batch_id}-${message.task_id}`,
      systemPrompt: message.system_prompt,
      modelProvider: 'anthropic',
      modelId: message.config?.model_id || 'claude-sonnet-4-5',
      env,
    });

    // 2. Execute agent
    const messages = [{ role: 'user' as const, content: message.user_message }];

    // Use invoke() for non-streaming execution
    const result = await Promise.race([
      agent.invoke(messages),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Task timeout')),
          message.config?.timeout_per_task_ms || 30000)
      ),
    ]);

    // 3. Extract trace from collector
    const trace = await getTraceForSession(env.DB, `rollout-${message.batch_id}-${message.task_id}`);

    // 4. Store result
    await env.DB.prepare(`
      INSERT INTO rollout_results (id, batch_id, task_id, status, trace, execution_time_ms)
      VALUES (?, ?, ?, 'completed', ?, ?)
    `).bind(
      generateId('rr'),
      message.batch_id,
      message.task_id,
      JSON.stringify(trace),
      Date.now() - startTime
    ).run();

  } catch (error: any) {
    // Store failure
    await env.DB.prepare(`
      INSERT INTO rollout_results (id, batch_id, task_id, status, error, execution_time_ms)
      VALUES (?, ?, ?, 'failed', ?, ?)
    `).bind(
      generateId('rr'),
      message.batch_id,
      message.task_id,
      error.message || 'Unknown error',
      Date.now() - startTime
    ).run();
  }
}
```

### 3. IofoldGEPAAdapter (Python)

```python
# gepa_adapter.py - Runs in Cloudflare Python sandbox

import httpx
import time
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

@dataclass
class DataInst:
    task: Dict[str, Any]
    task_metadata: Dict[str, Any]

@dataclass
class EvaluationBatch:
    outputs: List[Any]
    scores: List[float]
    trajectories: Optional[List[Dict]] = None

class IofoldGEPAAdapter:
    """
    GEPA adapter that uses iofold platform APIs for agent execution
    and runs evals locally in the sandbox.
    """

    def __init__(
        self,
        api_base_url: str,
        session_token: str,
        agent_id: str,
        eval_code: str,
        parallelism: int = 5,
        poll_timeout_seconds: int = 600,  # 10 minutes
        poll_interval_seconds: float = 2.0,
    ):
        self.api_base_url = api_base_url.rstrip('/')
        self.agent_id = agent_id
        self.parallelism = parallelism
        self.poll_timeout_seconds = poll_timeout_seconds
        self.poll_interval_seconds = poll_interval_seconds

        # HTTP client with auth
        self.client = httpx.Client(
            base_url=self.api_base_url,
            headers={"Authorization": f"Bearer {session_token}"},
            timeout=30.0,
        )

        # Compile eval function
        self._eval_globals: Dict[str, Any] = {}
        exec(eval_code, self._eval_globals)
        if 'eval_function' not in self._eval_globals:
            raise ValueError("eval_code must define 'eval_function'")

    def evaluate(
        self,
        batch: List[DataInst],
        candidate: Dict[str, str],
        capture_traces: bool = False,
    ) -> EvaluationBatch:
        """
        Execute agent with candidate prompt on batch, run eval locally.

        1. Request rollouts from iofold platform (parallel execution)
        2. Poll for completion (with timeout)
        3. Run evals locally in sandbox
        4. Return EvaluationBatch
        """

        # 1. Request rollouts from platform
        tasks_payload = [
            {
                "task_id": f"task_{i}",
                "user_message": inst.task.get("user_message", ""),
                "context": inst.task.get("context", {}),
            }
            for i, inst in enumerate(batch)
        ]

        response = self.client.post(
            "/api/internal/rollouts/batch",
            json={
                "agent_id": self.agent_id,
                "system_prompt": candidate.get("system_prompt", ""),
                "tasks": tasks_payload,
                "config": {
                    "parallelism": self.parallelism,
                },
            },
        )
        response.raise_for_status()
        batch_id = response.json()["batch_id"]

        # 2. Poll for completion
        results = self._poll_for_completion(batch_id)

        # 3. Run evals locally
        outputs = []
        scores = []
        trajectories = [] if capture_traces else None

        for i, inst in enumerate(batch):
            task_id = f"task_{i}"
            result = next((r for r in results if r["task_id"] == task_id), None)

            if result is None or result["status"] != "completed":
                # Task failed or timed out
                outputs.append({"error": result.get("error", "Task not completed")})
                scores.append(0.0)
                if capture_traces:
                    trajectories.append({
                        "task": inst.task,
                        "error": result.get("error") if result else "Task not found",
                    })
                continue

            trace = result.get("trace", [])

            # Run eval locally
            try:
                score, feedback = self._run_eval(inst, trace)
            except Exception as e:
                score, feedback = 0.0, f"Eval error: {str(e)}"

            outputs.append({"trace": trace, "feedback": feedback})
            scores.append(score)

            if capture_traces:
                trajectories.append({
                    "task": inst.task,
                    "trace": trace,
                    "score": score,
                    "feedback": feedback,
                })

        return EvaluationBatch(
            outputs=outputs,
            scores=scores,
            trajectories=trajectories,
        )

    def _poll_for_completion(self, batch_id: str) -> List[Dict]:
        """Poll until batch completes or timeout."""
        start_time = time.time()

        while time.time() - start_time < self.poll_timeout_seconds:
            response = self.client.get(f"/api/internal/rollouts/batch/{batch_id}")
            response.raise_for_status()
            data = response.json()

            if data["status"] in ("completed", "partial", "failed"):
                return data.get("results", [])

            time.sleep(self.poll_interval_seconds)

        # Timeout - fetch whatever results we have
        response = self.client.get(f"/api/internal/rollouts/batch/{batch_id}")
        response.raise_for_status()
        data = response.json()

        # Mark pending tasks as timed out
        results = data.get("results", [])
        completed_ids = {r["task_id"] for r in results}

        # Note: We don't have task list here, but GEPA will handle missing results
        return results

    def _run_eval(self, inst: DataInst, trace: List[Dict]) -> tuple[float, str]:
        """Execute eval function locally in sandbox."""
        eval_fn = self._eval_globals["eval_function"]

        # Build trace dict in expected format
        trace_dict = {
            "steps": trace,
            "agent_response": self._extract_agent_response(trace),
        }

        result = eval_fn(
            inst.task,
            inst.task_metadata,
            trace_dict,
            None,  # ctx - not needed for local eval
        )

        if isinstance(result, tuple):
            return float(result[0]), str(result[1])
        return float(result), ""

    def _extract_agent_response(self, trace: List[Dict]) -> str:
        """Extract final agent response from trace steps."""
        for step in reversed(trace):
            messages = step.get("messages_added", [])
            for msg in reversed(messages):
                if msg.get("role") == "assistant":
                    return msg.get("content", "")
        return ""

    def make_reflective_dataset(
        self,
        candidate: Dict[str, str],
        eval_batch: EvaluationBatch,
        components_to_update: List[str],
    ) -> Dict[str, List[Dict]]:
        """Build feedback dataset for GEPA's reflection LLM."""
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

### 4. GEPA Runner Script (Python Entry Point)

```python
# gepa_runner.py - Entry point for GEPA optimization in sandbox

import json
import sys
from openai import OpenAI
from gepa import optimize
from gepa_adapter import IofoldGEPAAdapter, DataInst

def run_gepa_optimization(config: dict) -> dict:
    """
    Run GEPA optimization with iofold adapter.

    Args:
        config: {
            "api_base_url": "https://api.iofold.com",
            "session_token": "...",
            "agent_id": "...",
            "eval_code": "def eval_function(...): ...",
            "seed_prompt": "You are...",
            "trainset": [{"task": {...}, "task_metadata": {...}}, ...],
            "valset": [...],
            "ai_gateway_url": "https://gateway.ai.cloudflare.com/v1/...",
            "ai_gateway_token": "...",
            "max_metric_calls": 50,
            "parallelism": 5,
        }

    Returns:
        {
            "best_prompt": "...",
            "best_score": 0.85,
            "total_candidates": 12,
            "total_metric_calls": 48,
            "all_candidates": [...],
        }
    """

    # Create adapter
    adapter = IofoldGEPAAdapter(
        api_base_url=config["api_base_url"],
        session_token=config["session_token"],
        agent_id=config["agent_id"],
        eval_code=config["eval_code"],
        parallelism=config.get("parallelism", 5),
    )

    # Create reflection LLM client pointing to AI Gateway
    reflection_lm = OpenAI(
        api_key=config["ai_gateway_token"],
        base_url=config["ai_gateway_url"],
    )

    # Convert trainset/valset to DataInst
    trainset = [
        DataInst(task=item["task"], task_metadata=item.get("task_metadata", {}))
        for item in config["trainset"]
    ]
    valset = [
        DataInst(task=item["task"], task_metadata=item.get("task_metadata", {}))
        for item in config["valset"]
    ]

    # Run GEPA optimization
    result = optimize(
        seed_candidate={"system_prompt": config["seed_prompt"]},
        trainset=trainset,
        valset=valset,
        adapter=adapter,
        reflection_lm=reflection_lm,
        max_metric_calls=config.get("max_metric_calls", 50),
    )

    return {
        "best_prompt": result.best_candidate.get("system_prompt", ""),
        "best_score": result.best_validation_score,
        "total_candidates": len(result.all_candidates),
        "total_metric_calls": result.total_metric_calls,
        "all_candidates": [
            {"system_prompt": c.get("system_prompt", ""), "score": s}
            for c, s in zip(result.all_candidates, result.all_scores)
        ],
    }


if __name__ == "__main__":
    # Read config from stdin (passed by TypeScript)
    config = json.loads(sys.stdin.read())

    try:
        result = run_gepa_optimization(config)
        print(json.dumps({"success": True, "result": result}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)
```

## Database Schema Additions

```sql
-- Migration: 011_gepa_rollouts.sql

-- Rollout batches requested by GEPA
CREATE TABLE rollout_batches (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  task_count INTEGER NOT NULL,
  status TEXT DEFAULT 'queued',  -- 'queued', 'running', 'completed', 'partial', 'failed'
  config TEXT DEFAULT '{}',       -- JSON: parallelism, timeout, model_id
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE INDEX idx_rollout_batches_workspace ON rollout_batches(workspace_id, status);
CREATE INDEX idx_rollout_batches_created ON rollout_batches(created_at DESC);

-- Individual rollout results
CREATE TABLE rollout_results (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL,           -- 'completed', 'failed', 'timeout'
  trace TEXT,                     -- JSON: LangGraphExecutionStep[]
  error TEXT,
  execution_time_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (batch_id) REFERENCES rollout_batches(id) ON DELETE CASCADE
);

CREATE INDEX idx_rollout_results_batch ON rollout_results(batch_id);
CREATE UNIQUE INDEX idx_rollout_results_task ON rollout_results(batch_id, task_id);

-- GEPA optimization runs
CREATE TABLE gepa_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  eval_id TEXT NOT NULL,

  -- Configuration
  seed_prompt TEXT NOT NULL,
  test_case_count INTEGER NOT NULL,
  max_metric_calls INTEGER DEFAULT 50,
  parallelism INTEGER DEFAULT 5,

  -- Status
  status TEXT DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed', 'cancelled'
  progress_metric_calls INTEGER DEFAULT 0,

  -- Results (populated on completion)
  best_prompt TEXT,
  best_score REAL,
  total_candidates INTEGER,

  -- State persistence (R2 path)
  state_path TEXT,

  -- Timestamps
  started_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (eval_id) REFERENCES evals(id)
);

CREATE INDEX idx_gepa_runs_workspace ON gepa_runs(workspace_id, status);
CREATE INDEX idx_gepa_runs_agent ON gepa_runs(agent_id, created_at DESC);
```

## Demo Flow: Art Email Dataset

```
1. LOAD TRACES
   POST /api/traces/import { integration_id, filters: { dataset: "art_email" } }
   → Imports ~100 traces from Langfuse

2. LABEL 10% (10 traces)
   UI: /agents/{agent_id}/annotate
   POST /api/feedback { trace_id, rating: "positive"|"negative" }
   → Creates labeled dataset

3. EXTRACT TASKS
   POST /api/agents/{agent_id}/tasks/extract
   → Converts traces to test_cases table

4. GENERATE EVAL
   POST /api/agents/{agent_id}/evals/generate
   → Creates eval candidates
   POST /api/agents/{agent_id}/evals/select-winner
   → Activates best eval

5. RUN GEPA OPTIMIZATION
   POST /api/agents/{agent_id}/gepa/start {
     eval_id: "...",
     test_case_ids: [...],
     max_metric_calls: 50,
     parallelism: 5
   }
   → Spawns Python sandbox
   → GEPA calls /api/internal/rollouts/batch for each evaluation
   → Returns job_id

6. MONITOR PROGRESS
   GET /api/jobs/{job_id}/stream (SSE)
   → Real-time updates: { metric_calls: 15, best_score: 0.72, ... }

7. CREATE NEW VERSION
   On completion:
   POST /api/agents/{agent_id}/versions {
     prompt_template: result.best_prompt,
     source: "gepa_optimization",
     parent_version_id: current_active_version
   }
   POST /api/agents/{agent_id}/versions/{new_version}/promote
   → New optimized version is now active
```

## Implementation Phases

### Phase 1: Internal Rollout APIs (2-3 days)
- [ ] Create `rollout_batches` and `rollout_results` tables (migration)
- [ ] Implement `POST /api/internal/rollouts/batch`
- [ ] Implement `GET /api/internal/rollouts/batch/{batch_id}`
- [ ] Add rollout task handler to queue consumer
- [ ] Test rollout execution with existing agent

### Phase 2: GEPA Python Integration (2-3 days)
- [ ] Set up Python sandbox with httpx, openai dependencies
- [ ] Implement `IofoldGEPAAdapter`
- [ ] Implement `gepa_runner.py` entry point
- [ ] Test adapter with mock GEPA calls

### Phase 3: GEPA Job Orchestration (2-3 days)
- [ ] Create `gepa_runs` table (migration)
- [ ] Implement `POST /api/agents/{agent_id}/gepa/start`
- [ ] Implement GEPA job that spawns Python sandbox
- [ ] Add progress reporting via SSE
- [ ] Handle completion: create new agent version

### Phase 4: UI Integration (1-2 days)
- [ ] Add "Run GEPA Optimization" button to agent detail page
- [ ] Create optimization progress modal/panel
- [ ] Show optimization history and results
- [ ] Link to new versions created by GEPA

## Configuration

```typescript
interface GEPARunConfig {
  // Required
  agent_id: string;
  eval_id: string;
  test_case_ids: string[];

  // Optional with defaults
  max_metric_calls?: number;       // Default: 50
  parallelism?: number;            // Default: 5
  poll_timeout_seconds?: number;   // Default: 600 (10 min)
  score_threshold?: number;        // Stop early if best >= threshold
}
```

## Success Criteria

- [ ] GEPA optimization completes successfully on 50 test cases
- [ ] Rollout batches execute in parallel with configurable concurrency
- [ ] 10-minute timeout properly cancels incomplete rollouts
- [ ] Session token auth works for internal API calls
- [ ] Progress updates stream to UI during optimization
- [ ] New agent version created automatically on completion
- [ ] Best prompt shows measurable improvement over seed
