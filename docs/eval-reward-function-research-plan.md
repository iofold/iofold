# Eval/Reward Function Generation Research Plan

## Overview

This document outlines 10 experiments for developing composite reward functions for the ART-E email task using the ~1000 traces dataset. The goal is to generate eval functions that combine deterministic code, LLM calls, and multiple signal sources to provide useful feedback for any trace.

## Dataset

- **Source**: Job `fe33feb1-c6bb-494d-a227-333d83c64f1d`
- **Total traces**: 1,015
- **Feedback coverage**: 100% (1,015 traces with synthetic feedback)
- **Rating distribution**: positive, negative, neutral

## Data Split Strategy

**Critical: Prevent data leakage by using strict train/test/validation splits**

```
Training Set (60%):     ~609 traces  - Used for pattern discovery & function development
Validation Set (20%):   ~203 traces  - Used for hyperparameter tuning & early stopping
Hold-out Test Set (20%): ~203 traces - NEVER seen during development, only for final eval
```

### Split Implementation
Use deterministic hash-based splitting to ensure reproducibility:
```python
def get_split(trace_id: str) -> str:
    """Deterministic split based on trace_id hash."""
    hash_val = sum(ord(c) for c in trace_id) % 100
    if hash_val < 60:
        return "train"
    elif hash_val < 80:
        return "validation"
    else:
        return "test"  # HOLD-OUT - never expose to generation process
```

## Available Signals for Reward Functions

### Trace-Level Signals
| Signal | Type | Description |
|--------|------|-------------|
| `output_preview` | string | Agent's final answer |
| `has_errors` | bool | Execution error flag |
| `total_tokens` | int | Token consumption |
| `total_duration_ms` | int | Execution time |
| `step_count` | int | Number of agent steps |
| `span_count` | int | Number of spans/tool calls |

### Metadata Signals (Ground Truth)
| Signal | Type | Description |
|--------|------|-------------|
| `expectedOutput` | string | Ground truth answer |
| `score` | float | Pre-computed similarity score (0-1) |
| `scoreReason` | string | LLM explanation of score |
| `hasErrors` | bool | Error flag from execution |
| `taskId` | string | Link to taskset_task for full context |

### Span-Level Signals (Per-Step Details)
| Signal | Type | Description |
|--------|------|-------------|
| `span_kind` | string | LLM, TOOL, etc. |
| `llm.tool_calls` | array | Tools invoked |
| `status` | string | OK/ERROR |
| `name` | string | Tool/operation name |

### Feedback (Labels)
| Signal | Type | Description |
|--------|------|-------------|
| `rating` | enum | positive, negative, neutral |
| `rating_detail` | string | Explanation of rating |

---

## Experiment 1: Baseline - Single-Shot LLM Eval Generation

**Hypothesis**: A well-prompted LLM can generate a reasonable eval function in one shot.

**Approach**:
1. Sample 10 positive + 10 negative examples from training set
2. Prompt LLM with examples and task description
3. Generate eval function without iteration
4. Test on validation set

**Tools**: `EvalGenerator` (existing single-shot generator)

**Model**: `gemini-2.5-flash` (fast, cheap)

**Success Criteria**: >70% accuracy on validation set

**Risk**: May produce fragile, example-memorizing functions

---

## Experiment 2: Deep Eval Agent with Standard Tools

**Hypothesis**: An iterative agent with exploration tools will produce more robust evals.

**Approach**:
1. Use existing `DeepEvalAgent` with standard tool set:
   - `fetch_traces`: Get training summaries
   - `get_trace_details`: Deep dive on specific traces
   - `write_traces_to_file`: Bulk data export
   - `execute_python_analysis`: Data science analysis
   - `test_eval_code`: Test on held-out validation set
2. Allow up to 25 iterations
3. Track accuracy progression

**Tools**: `DeepEvalAgent` (existing)

**Model**: `claude-sonnet-4-5` (good reasoning)

**Success Criteria**: >80% accuracy, <5 test iterations

---

## Experiment 3: Deterministic-First Approach

**Hypothesis**: Start with deterministic rules, add LLM only for edge cases.

**Approach**:
1. Analyze training set programmatically to find strong deterministic signals:
   - Error flags correlation with negative ratings
   - Token count thresholds
   - Step count patterns
   - String matching patterns in output
2. Build decision tree of deterministic rules
3. Use LLM only for cases that fall through deterministic rules
4. Measure rule coverage and accuracy separately

**Implementation**:
```python
def eval_deterministic_first(trace: dict, ctx=None) -> tuple[float, str]:
    # Deterministic rules (fast, cheap)
    if trace.get("has_errors"):
        return (0.1, "Error in execution")
    if trace.get("step_count", 0) > 20:
        return (0.2, "Excessive steps - likely stuck")

    # Check answer match
    expected = get_ground_truth(trace)
    actual = trace.get("output_preview", "")
    if exact_match(expected, actual):
        return (0.95, "Exact match")
    if fuzzy_match(expected, actual, threshold=0.8):
        return (0.8, "Strong semantic match")

    # Edge case: call LLM
    return llm_judge(trace, expected, actual)
```

**Success Criteria**: >85% deterministic coverage, >80% overall accuracy

---

## Experiment 4: Ensemble of Specialized Evaluators

**Hypothesis**: Multiple specialized evaluators combined outperform a single general one.

**Approach**:
1. Train separate evaluators for different aspects:
   - **Answer Correctness Evaluator**: Focuses on output vs expected
   - **Efficiency Evaluator**: Focuses on tokens, steps, duration
   - **Behavioral Evaluator**: Focuses on tool usage patterns, loops
   - **Error Handling Evaluator**: Focuses on recovery and error states
2. Combine scores with learned weights
3. Use validation set to tune ensemble weights

**Implementation**:
```python
def eval_ensemble(trace: dict, ctx=None) -> tuple[float, str]:
    scores = {
        "correctness": eval_correctness(trace),
        "efficiency": eval_efficiency(trace),
        "behavior": eval_behavior(trace),
        "errors": eval_errors(trace),
    }

    # Weighted combination (weights learned on validation set)
    weights = {"correctness": 0.5, "efficiency": 0.15, "behavior": 0.2, "errors": 0.15}
    final_score = sum(scores[k][0] * weights[k] for k in weights)

    return (final_score, f"Ensemble: {scores}")
```

**Success Criteria**: >85% accuracy, interpretable component scores

---

## Experiment 5: Self-Improving Agent with Validation Feedback

**Hypothesis**: An agent that sees its validation errors can self-correct.

**Approach**:
1. Generate initial eval function
2. Test on validation set
3. Show agent the misclassified examples
4. Let agent iterate with explicit error feedback
5. Repeat until convergence or max iterations

**Tools**:
- Modified `test_eval_code` that returns misclassified examples
- New `analyze_errors` tool that summarizes failure patterns

**Model**: `claude-sonnet-4-5`

**Success Criteria**: Monotonic improvement over iterations, >85% accuracy

---

## Experiment 6: Code Synthesis with Constraint Solving

**Hypothesis**: Treating eval generation as a constraint satisfaction problem yields more robust functions.

**Approach**:
1. Extract constraints from examples:
   - "If trace has error, score < 0.5"
   - "If output contains expected answer, score > 0.7"
2. Use LLM to generate candidate rules
3. Verify rules against training set
4. Combine verified rules into composite function
5. Use SMT-like pruning to remove contradictory rules

**Implementation**:
```python
rules = []
for example in training_set:
    candidate_rules = llm_suggest_rules(example)
    for rule in candidate_rules:
        if rule.test_against(training_set, min_support=0.9):
            rules.append(rule)

# Prune contradictory rules
rules = resolve_contradictions(rules)
```

**Success Criteria**: >90% rule consistency, >80% accuracy

---

## Experiment 7: Multi-Model Consensus

**Hypothesis**: Agreement across models indicates more robust evaluation criteria.

**Approach**:
1. Generate eval functions using 3 different models:
   - `gemini-2.5-pro` (Google)
   - `claude-sonnet-4-5` (Anthropic)
   - `gpt-5.1` (OpenAI)
2. For each trace, run all 3 evals
3. Use voting or averaging for final score
4. Analyze disagreement cases

**Implementation**:
```python
def eval_multi_model(trace: dict, ctx=None) -> tuple[float, str]:
    scores = [
        eval_gemini(trace)[0],
        eval_claude(trace)[0],
        eval_gpt(trace)[0],
    ]

    # Majority voting for binary (threshold 0.5)
    positive_votes = sum(1 for s in scores if s >= 0.5)

    if positive_votes >= 2:
        return (mean(scores), f"Consensus positive ({positive_votes}/3)")
    else:
        return (mean(scores), f"Consensus negative ({positive_votes}/3)")
```

**Success Criteria**: Higher accuracy when models agree, identify hard cases

---

## Experiment 8: Semantic Embedding Similarity

**Hypothesis**: Embedding-based similarity provides smoother, more generalizable scores.

**Approach**:
1. Generate embeddings for:
   - Expected output
   - Actual output
   - Positive example outputs (centroid)
   - Negative example outputs (centroid)
2. Compute similarity scores
3. Combine embedding similarity with structural features

**Tools**:
- `text-embedding-3-small` via AI Gateway
- Cosine similarity computation

**Implementation**:
```python
def eval_embedding_based(trace: dict, ctx=None) -> tuple[float, str]:
    expected_emb = embed(trace["metadata"]["expectedOutput"])
    actual_emb = embed(trace["output_preview"])

    # Similarity to expected
    answer_similarity = cosine_similarity(expected_emb, actual_emb)

    # Similarity to positive/negative centroids
    pos_similarity = cosine_similarity(actual_emb, positive_centroid)
    neg_similarity = cosine_similarity(actual_emb, negative_centroid)

    # Combine signals
    score = 0.6 * answer_similarity + 0.2 * pos_similarity - 0.2 * neg_similarity
    return (score, f"Embedding sim: {answer_similarity:.2f}")
```

**Success Criteria**: Smooth score distribution, >80% accuracy

---

## Experiment 9: LLM-as-Judge with Chain-of-Thought

**Hypothesis**: Explicit reasoning improves LLM judgment quality.

**Approach**:
1. For each trace, call LLM with structured CoT prompt:
   - Step 1: Summarize what the agent did
   - Step 2: Compare to expected output
   - Step 3: Identify any issues (errors, inefficiency)
   - Step 4: Provide final rating with confidence
2. Parse structured output
3. Calibrate confidence scores on validation set

**Implementation**:
```python
def eval_cot_judge(trace: dict, ctx=None) -> tuple[float, str]:
    prompt = f"""
    Evaluate this agent trace:

    Expected: {trace["metadata"]["expectedOutput"]}
    Actual: {trace["output_preview"]}
    Steps: {trace["step_count"]}
    Errors: {trace["has_errors"]}

    Reason step by step:
    1. What did the agent do?
    2. Did it answer correctly?
    3. Were there any issues?
    4. Final rating (0-1) with confidence (0-1)?

    Output JSON: {{"reasoning": "...", "rating": 0.X, "confidence": 0.Y}}
    """

    result = llm_call(prompt)
    return (result["rating"], result["reasoning"])
```

**Model**: `gemini-2.5-pro` (good at structured reasoning)

**Success Criteria**: High confidence correlates with accuracy, >85% on high-confidence cases

---

## Experiment 10: Hybrid Deep Agent with Tool Augmentation

**Hypothesis**: Giving the deep agent more powerful analysis tools improves results.

**Approach**:
1. Extend `DeepEvalAgent` with new tools:
   - `compute_embeddings`: Get embeddings for traces
   - `cluster_traces`: Group similar traces
   - `find_similar`: Find similar traces to a given one
   - `run_statistical_tests`: Chi-square, t-tests on features
   - `generate_deterministic_rule`: Propose and validate a rule
2. Let agent use tools to build composite function
3. Agent decides when to use LLM vs deterministic

**New Tools**:
```typescript
const augmentedTools = [
  ...standardEvalTools,
  createEmbeddingTool(context),
  createClusterTool(context),
  createSimilaritySearchTool(context),
  createStatisticalTestTool(context),
  createRuleGeneratorTool(context),
];
```

**Model**: `claude-sonnet-4-5`

**Success Criteria**: >85% accuracy, interpretable composite function

---

## Evaluation Methodology

### Metrics
1. **Accuracy**: % of traces correctly classified (positive/negative threshold at 0.5)
2. **F1 Score**: Balanced metric for class imbalance
3. **AUC-ROC**: Score distribution quality
4. **Calibration**: Does 0.8 score mean 80% chance of positive?
5. **Latency**: Time per eval (important for production)
6. **Cost**: $ per eval (important for scale)

### Testing Protocol
1. **Development Phase**: Use training + validation sets only
2. **Final Evaluation**: Single run on hold-out test set
3. **Report**: Per-experiment metrics + statistical significance

### Avoiding Leakage
- Hold-out test set IDs are hashed and hidden
- `test_eval_code` tool only returns accuracy, not individual results
- No trace details from test set exposed during generation

---

## Implementation Priority

| Priority | Experiment | Complexity | Expected Value |
|----------|-----------|------------|----------------|
| 1 | Exp 2: Deep Eval Agent (baseline) | Low | High |
| 2 | Exp 3: Deterministic-First | Medium | High |
| 3 | Exp 4: Ensemble | Medium | High |
| 4 | Exp 1: Single-Shot (comparison) | Low | Medium |
| 5 | Exp 5: Self-Improving | Medium | Medium |
| 6 | Exp 9: CoT Judge | Low | Medium |
| 7 | Exp 8: Embedding Similarity | Medium | Medium |
| 8 | Exp 10: Augmented Tools | High | High |
| 9 | Exp 7: Multi-Model | Medium | Medium |
| 10 | Exp 6: Constraint Solving | High | Medium |

---

## Next Steps

1. **Create experiment tracking infrastructure** in `notebooks/experiments/`
2. **Implement data split utility** with reproducible hashing
3. **Run Experiment 2** (Deep Eval Agent) as baseline
4. **Run Experiment 3** (Deterministic-First) as alternative baseline
5. **Compare results and iterate**

---

## Files Created

- This plan: `docs/eval-reward-function-research-plan.md`
- Experiments will be in: `notebooks/experiments/eval_reward_functions/`
- Results will be logged to: `docs/progress_log.ndjson`
