"""
Prompt templates for eval generation.

These prompts are used by the PatternAnalyzer and CandidateGenerator
to analyze traces and generate reward function candidates.
"""

# Pattern analysis prompt - analyzes differences between positive and negative traces
PATTERN_ANALYSIS_PROMPT = """Analyze the patterns in these labeled traces.

## Positive Examples (good quality)
{positive_examples}

## Negative Examples (poor quality)
{negative_examples}

Identify:
1. What patterns distinguish good from bad executions?
2. What signals indicate quality issues?
3. What metrics could detect these patterns?

Return JSON: {{"patterns": [...], "signals": [...], "suggested_checks": [...]}}
"""

# Generation prompt - generates reward function candidates
GENERATION_PROMPT = """## Training Data Summary
{training_summary}

## Cluster Analysis
{cluster_analysis}

## Pairwise Comparison Insights
{comparison_insights}

## Previous Attempts
{previous_attempts}

## Trace Schema (IMPORTANT - USE THIS EXACT STRUCTURE)
The trace dict has these fields:
- trace['id']: str - unique trace ID
- trace['input_preview']: str - the user's question/input (first ~200 chars)
- trace['output_preview']: str - the agent's final answer (first ~200 chars)
- trace['has_errors']: bool - whether any errors occurred
- trace['step_count']: int - number of steps
- trace['metadata']: dict - contains 'expectedOutput' with the correct answer
- trace['steps']: list - execution steps, each step is a dict:
    - step['messages_added']: list of {{'role': 'user'|'assistant'|'system', 'content': str}}
    - step['tool_calls']: list of tool calls, each is:
        {{'tool_name': str (e.g., 'email_search', 'email_get'),
          'arguments': dict,
          'result': {{'lc':..., 'kwargs': {{'status': 'success'|'error', 'content': str}}}}}}

ctx dict may contain:
- ctx['expectedOutput']: str - the ground truth answer (if available)

Key data access patterns:
- Final answer: trace.get('output_preview', '')
- User query: extract from step 0 messages_added where role='user'
- Tool results: iterate trace['steps'], check step['tool_calls'], access result['kwargs']['content']
- Expected output: trace.get('metadata', {{}}).get('expectedOutput', '') or ctx.get('expectedOutput', '')

## Task
Generate {num_candidates} diverse reward function candidates.
Each should use different signals or strategies.
Each function should:
- Take (trace: dict, ctx) parameters
- Return tuple (score: float 0-1, feedback: str)
- Use only allowed modules: json, re, math, datetime, difflib

Output {num_candidates} JSON objects, one per line:
{{"code": "def eval_...(trace, ctx):\\n    ...", "strategy": "description", "reasoning": "why this approach"}}
"""

# Trace summarization prompt - creates compact summaries of traces
TRACE_SUMMARY_PROMPT = """Summarize this execution trace concisely.

Trace:
{trace_data}

Focus on:
- Main task/goal
- Key steps taken
- Final outcome
- Any errors or issues

Return a 2-3 sentence summary.
"""

# Cluster analysis prompt - analyzes clusters of similar traces
CLUSTER_ANALYSIS_PROMPT = """Analyze these trace clusters.

{cluster_data}

For each cluster:
1. What is the common pattern or theme?
2. What distinguishes this cluster from others?
3. What characteristics define membership?

Return JSON: {{"clusters": [{{"id": int, "theme": str, "distinguishing_features": [str], "quality_indicators": [str]}}]}}
"""

# Pairwise comparison prompt - compares two traces
PAIRWISE_COMPARISON_PROMPT = """Compare these two execution traces.

## Trace A (Human Score: {score_a})
{trace_a}

## Trace B (Human Score: {score_b})
{trace_b}

Analyze:
1. What makes the higher-scored trace better?
2. What specific signals indicate quality differences?
3. What check could distinguish between them?

Return JSON: {{"winner": "a|b|tie", "key_differences": [str], "suggested_checks": [str], "reasoning": str}}
"""

# Error analysis prompt - analyzes failed reward functions
ERROR_ANALYSIS_PROMPT = """Analyze why this reward function performed poorly.

## Reward Function Code
```python
{code}
```

## Strategy
{strategy}

## Test Results
- Accuracy: {accuracy}
- Pearson R: {pearson_r}
- Cohen's Kappa: {kappa}

## Misclassified Examples
{misclassified}

Identify:
1. Why did this function fail?
2. What cases does it miss?
3. How could it be improved?

Return JSON: {{"failure_reasons": [str], "missed_cases": [str], "improvement_suggestions": [str]}}
"""

# Refinement prompt - improves an existing reward function
REFINEMENT_PROMPT = """Improve this reward function based on the analysis.

## Original Code
```python
{original_code}
```

## Original Strategy
{original_strategy}

## Analysis
{analysis}

## Misclassified Examples to Handle
{misclassified}

Create an improved version that:
1. Addresses the identified failure reasons
2. Handles the missed cases
3. Maintains the same function signature

Return JSON: {{"code": "def eval_...(trace, ctx):\\n    ...", "strategy": "improved description", "changes_made": [str]}}
"""

# Training data summary prompt - summarizes the training set
TRAINING_SUMMARY_PROMPT = """Summarize this training dataset for reward function generation.

## Statistics
- Total traces: {total_traces}
- Positive (score >= 0.7): {positive_count}
- Negative (score <= 0.3): {negative_count}
- Neutral (0.3 < score < 0.7): {neutral_count}

## Sample Traces
### Positive Examples
{positive_samples}

### Negative Examples
{negative_samples}

Summarize:
1. What types of tasks are represented?
2. What are the main quality signals?
3. What patterns distinguish positive from negative?

Return a concise summary (3-5 paragraphs) suitable for prompting reward function generation.
"""


def format_trace_for_prompt(
    trace: dict,
    max_steps: int = 10,
    max_step_length: int = 500,
) -> str:
    """
    Format a trace for inclusion in a prompt.

    Truncates long traces to avoid context overflow.

    Args:
        trace: Trace dict with steps, metadata, etc.
        max_steps: Maximum number of steps to include
        max_step_length: Maximum characters per step

    Returns:
        Formatted string representation of the trace
    """
    import json

    lines = []

    # Basic info
    trace_id = trace.get("id", trace.get("trace_id", "unknown"))
    lines.append(f"Trace ID: {trace_id}")

    if trace.get("input_preview"):
        lines.append(f"Input: {trace['input_preview'][:200]}")

    if trace.get("output_preview"):
        lines.append(f"Output: {trace['output_preview'][:200]}")

    # Steps
    steps = trace.get("steps", [])
    if steps:
        lines.append(f"\nSteps ({len(steps)} total):")
        for i, step in enumerate(steps[:max_steps]):
            step_str = json.dumps(step, default=str)
            if len(step_str) > max_step_length:
                step_str = step_str[:max_step_length] + "..."
            lines.append(f"  {i+1}. {step_str}")

        if len(steps) > max_steps:
            lines.append(f"  ... ({len(steps) - max_steps} more steps)")

    # Errors
    if trace.get("has_errors"):
        lines.append("\n[Has Errors]")

    return "\n".join(lines)


def format_labeled_trace(trace: dict, score: float) -> str:
    """
    Format a labeled trace with its score for prompts.

    Args:
        trace: Trace dict
        score: Human score (0-1)

    Returns:
        Formatted string with score indicator
    """
    label = "POSITIVE" if score >= 0.7 else ("NEGATIVE" if score <= 0.3 else "NEUTRAL")
    return f"[{label} - Score: {score:.2f}]\n{format_trace_for_prompt(trace)}"


def format_candidates_for_prompt(
    candidates: list,
    include_metrics: bool = True,
    max_candidates: int = 5,
) -> str:
    """
    Format previous candidates for inclusion in generation prompt.

    Args:
        candidates: List of RewardCandidate-like dicts
        include_metrics: Whether to include accuracy/pearson metrics
        max_candidates: Maximum number to include

    Returns:
        Formatted string representation
    """
    if not candidates:
        return "No previous attempts."

    lines = []
    for i, candidate in enumerate(candidates[:max_candidates]):
        lines.append(f"\n### Attempt {i+1}")
        lines.append(f"Strategy: {candidate.get('strategy', 'unknown')}")

        if include_metrics:
            acc = candidate.get('val_accuracy', candidate.get('accuracy', 0))
            pearson = candidate.get('val_pearson', candidate.get('pearson_r', 0))
            kappa = candidate.get('val_kappa', candidate.get('cohen_kappa', 0))
            lines.append(f"Metrics: Accuracy={acc:.2%}, Pearson={pearson:.3f}, Kappa={kappa:.3f}")

        code = candidate.get('code', '')
        if len(code) > 500:
            code = code[:500] + "\n    # ... (truncated)"
        lines.append(f"```python\n{code}\n```")

    if len(candidates) > max_candidates:
        lines.append(f"\n({len(candidates) - max_candidates} more attempts not shown)")

    return "\n".join(lines)
