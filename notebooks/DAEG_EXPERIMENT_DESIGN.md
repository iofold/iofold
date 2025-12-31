# Deep Agent Eval Generation (DAEG) Experiment

## Overview

This experiment tests automated reward function generation using a deep agent with clustering and comparative evaluation tools, inspired by the Proto-RM and LLM Comparative Assessment approaches.

## Experiment Setup

### Dataset
- **Source**: ART-E benchmark (~55K email Q&A tasks)
- **Scale**: 1000 tasks for agent execution
- **Feedback**: 100 traces with simulated human feedback (skewed positive)

### Agent Under Evaluation
- **Model**: GPT-4o-mini (deliberately weaker model for diverse failure modes)
- **Task**: Email search and Q&A on Enron dataset

### Deep Agent Architecture
- **Approach**: Multi-candidate generation
- **Candidates**: Generate ≥5 reward function candidates
- **Iterations**: Max 5 iterations until 80% accuracy on validation set
- **Split**: 80% train+validation / 20% hidden test holdout

## Deep Agent Tools

### 1. fetch_traces
Fetch labeled trace summaries for pattern analysis.
- Filter by rating (positive/negative/all)
- Returns summaries, step counts, tool call presence
- **Train set only** to prevent data leakage

### 2. cluster_traces
Cluster traces using embedding-based similarity.
- **Strategies**:
  - `first_message`: Embed first user message only
  - `full_trace`: Embed concatenated trace content
  - `tool_pattern`: Embed sequence of tool calls
  - `outcome`: Cluster by success/failure patterns
- Returns cluster assignments and centroids

### 3. compare_similar_traces (Ruler-inspired)
Compare traces on similar tasks to determine which performed better.
- Find similar tasks via embedding similarity
- Compare execution quality between traces
- Returns pairwise preferences
- **Key insight**: Comparative evaluation is often more reliable than absolute scoring

### 4. test_reward_function
Test a candidate reward function against validation set.
- Computes accuracy, Pearson correlation, Cohen's kappa
- Returns per-trace predictions and mismatches
- **Validation set only** (hidden test set reserved for final evaluation)

### 5. write_analysis_to_file
Dump analysis results to file for the agent to process.

### 6. execute_python_analysis
Run Python with data science libraries (numpy, pandas, sklearn) for custom analysis.

## Reward Function Specification

```python
def reward_function(trace: dict, ctx=None) -> tuple[float, str]:
    """
    Evaluate agent trace quality.

    Args:
        trace: Dict with keys: id, trace_id, steps, spans, metadata
        ctx: Optional context with LLM access for hybrid evaluation

    Returns:
        (score, feedback) where:
            score: float in [0, 1], >= 0.5 = positive, < 0.5 = negative
            feedback: string explaining the score
    """
    # Can use:
    # - Code-based heuristics (tool counts, error detection)
    # - LLM calls via ctx.llm_judge() for semantic evaluation
    # - Hybrid approaches combining both
    return (score, "reasoning")
```

## Clustering Strategies

### 1. First Message Embedding
- Embed only the initial user query
- Groups tasks with similar intents
- Fast, captures task-level similarity

### 2. Full Trace Embedding
- Embed all messages concatenated
- Captures execution patterns and conversation flow
- More comprehensive but noisier

### 3. Tool Pattern Embedding
- Embed the sequence of tool names called
- Groups traces with similar execution strategies
- Good for identifying behavioral patterns

### 4. Outcome-Based Clustering
- Cluster by success/failure + error types
- Groups traces with similar outcomes
- Useful for understanding failure modes

## Comparative Evaluation (Ruler-Inspired)

Based on research showing pairwise comparisons are often more reliable than absolute scoring:

1. **Find Similar Tasks**: Use embedding similarity to find traces on similar tasks
2. **Pairwise Comparison**: Ask "which trace performed better on this similar task?"
3. **Aggregate Preferences**: Build ranking from pairwise preferences
4. **Calibrate Scores**: Map rankings to absolute scores

### Benefits
- Reduces LLM evaluation bias
- More consistent across diverse tasks
- Better at detecting subtle quality differences

## Train/Validation/Test Split

```
100 labeled traces
├── Train (64 traces, 64%)
│   └── Used for pattern discovery and clustering
├── Validation (16 traces, 16%)
│   └── Used for candidate testing during generation
└── Test (20 traces, 20%)
    └── Hidden holdout for final evaluation
```

**Split Method**: Deterministic hash of trace_id
- Same trace always in same split
- Reproducible across runs

## Success Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| Pearson r | ≥ 0.5 | Correlation with human feedback |
| Accuracy | ≥ 80% | Binary classification accuracy |
| Cohen's κ | ≥ 0.4 | Agreement beyond chance |

## Experiment Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Setup: Load ART-E tasks, configure agent                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Generate Traces: Run GPT-4o-mini on 1000 tasks          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Simulate Feedback: Label 100 traces (skewed positive)   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Deep Agent Generation:                                   │
│    a. Fetch traces from train set                          │
│    b. Cluster traces using various strategies              │
│    c. Compare similar traces (Ruler approach)              │
│    d. Generate 5+ reward function candidates               │
│    e. Test on validation set                               │
│    f. Iterate until 80% accuracy or 5 iterations           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Final Evaluation: Test best candidate on hidden test set │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Analysis: Compare clustering strategies, ablations       │
└─────────────────────────────────────────────────────────────┘
```

## Key Research Questions

1. **Does clustering help?** Compare agents with vs without clustering tools
2. **Which clustering strategy works best?** Compare first_message vs full_trace vs tool_pattern
3. **Does Ruler-style comparison improve quality?** Compare with vs without pairwise comparison
4. **How many candidates are needed?** Analyze candidate diversity and quality
5. **What's the iteration efficiency?** Track accuracy improvement per iteration

## References

- [Prototypical Reward Network (Proto-RM)](https://arxiv.org/abs/2406.06606): Clustering similar examples in embedding space
- [LLM Comparative Assessment](https://aclanthology.org/2024.eacl-long.8/): Pairwise comparisons for evaluation
- [The Comparative Trap](https://arxiv.org/abs/2406.12319): Biases in pairwise LLM evaluation
