# Simulated Human Feedback Generator for ART-E Tasksets

**Date:** 2025-12-22
**Status:** Approved

## Overview

Generate simulated human feedback on ART-E taskset runs by comparing agent execution with ground truth data. This enables experimentation with eval generation without requiring manual labeling.

## Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         INPUT                                        │
│  job_id (from taskset run) + knobs (coverage, detail_level, variance)│
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  1. FETCH TRACES                                                     │
│     - Query traces where metadata.jobId = job_id                     │
│     - Join with art_e_tasks to get ground truth                      │
│     - Returns: trace + expected_answer + expected_emails + etc.      │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. SAMPLE FOR COVERAGE                                              │
│     - For each trace: if random() > coverage → skip                  │
│     - Remaining traces proceed to comparison                         │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3. COMPARE & SCORE (LLM-based)                                      │
│     - Send trace + ground truth + rubric to LLM                      │
│     - LLM returns: rating + reasoning                                │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  4. GENERATE TEXTUAL FEEDBACK                                        │
│     - Sample detail_score ~ N(detail_level, detail_variance)         │
│     - If detail_score < 0.5 → rating only                            │
│     - If >= 0.5 → LLM generates human-like feedback (verbosity ∝ score)│
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  5. INSERT FEEDBACK                                                  │
│     - Upsert into existing feedback table (traceId, rating, ratingDetail)│
│     - Return summary DataFrame for analysis                          │
└─────────────────────────────────────────────────────────────────────┘
```

## Knob Parameters

```python
def generate_simulated_feedback(
    job_id: str,
    coverage: float = 0.8,        # 0.0-1.0, % of traces receiving feedback
    detail_level: float = 0.6,    # Mean of detail distribution
    detail_variance: float = 0.2, # Std dev of detail distribution
    rubric: str = EVALUATION_RUBRIC,
    model: str = "gemini-2.5-flash",
    dry_run: bool = False         # Preview without writing to DB
) -> pd.DataFrame:
```

| Knob | Range | Effect |
|------|-------|--------|
| `coverage=0.3` | 0-1 | Only 30% of traces get feedback (random selection) |
| `coverage=1.0` | 0-1 | All traces get feedback |
| `detail_level=0.3, variance=0.1` | 0-1 | Most samples < 0.5 → mostly rating-only feedback |
| `detail_level=0.7, variance=0.2` | 0-1 | Most samples ≥ 0.5 → mostly textual feedback |
| `detail_level=0.9, variance=0.05` | 0-1 | Consistently detailed textual feedback |

### Detail Score Mechanics

```python
detail_score = np.random.normal(detail_level, detail_variance)
detail_score = np.clip(detail_score, 0.0, 1.0)

if detail_score < 0.5:
    rating_detail = None  # Rating only
elif detail_score < 0.7:
    # Terse: "Wrong answer" / "Too slow" / "Missed emails"
    rating_detail = generate_terse_feedback(...)
else:
    # Verbose: Full explanation with specifics
    rating_detail = generate_detailed_feedback(...)
```

## Evaluation Rubric

Editable text prompt that guides LLM evaluation:

```python
EVALUATION_RUBRIC = """
You are evaluating an AI agent's performance on an email search task.

## Ground Truth
- **Expected Answer**: {expected_answer}
- **Expected Emails**: {expected_email_ids}
- **Query Date**: {query_date}
- **Inbox**: {inbox_address}

## Agent Execution
- **Agent's Answer**: {agent_answer}
- **Emails Retrieved**: {retrieved_email_ids}
- **Tool Calls Made**: {tool_call_count}
- **Execution Time**: {execution_time_ms}ms
- **Detected Issues**: {detected_issues}

## Evaluation Criteria

### Answer Correctness (Primary)
- Does the agent's answer match the expected answer in meaning?
- Is the information factually correct based on the emails?

### Email Retrieval
- Did the agent find the relevant emails?
- Did it miss critical emails from the expected set?

### Efficiency
- Reasonable: 1-5 tool calls
- Concerning: 6-10 tool calls
- Inefficient: 10+ tool calls

### Behavioral Issues
- Stuck in loops (repeated similar queries)
- Hallucinated information not in emails
- Searched outside the query date range

## Output
Rate as: positive, neutral, or negative
Provide brief reasoning for your rating.
"""
```

## Comparison Data Extraction

```python
def extract_comparison_data(trace: dict, art_e_task: dict) -> dict:
    """Extract all signals needed for LLM evaluation."""

    spans = trace.get('spans', [])

    # Agent's final answer
    agent_answer = extract_final_response(spans)

    # Retrieved emails (from tool calls)
    retrieved_email_ids = extract_email_ids_from_tool_calls(spans)

    # Tool call analysis
    tool_calls = [s for s in spans if s.get('span_kind') == 'TOOL']
    tool_call_count = len(tool_calls)

    # Timing
    execution_time_ms = trace.get('totalDurationMs', 0)

    # Detect behavioral issues
    detected_issues = []
    if has_repeated_queries(tool_calls):
        detected_issues.append("Repeated similar queries (possible loop)")
    if has_out_of_range_searches(tool_calls, art_e_task['query_date']):
        detected_issues.append("Searched outside query date range")

    return {
        'expected_answer': art_e_task['answer'],
        'expected_email_ids': art_e_task['message_ids'],
        'query_date': art_e_task['query_date'],
        'inbox_address': art_e_task['inbox_address'],
        'agent_answer': agent_answer,
        'retrieved_email_ids': retrieved_email_ids,
        'tool_call_count': tool_call_count,
        'execution_time_ms': execution_time_ms,
        'detected_issues': detected_issues or ["None detected"]
    }
```

## LLM Feedback Generation

Two-stage process:

### Stage 1: Rating Decision

```python
RATING_PROMPT = """
{rubric}

Based on the above evaluation, respond with JSON:
{{"rating": "positive" | "neutral" | "negative", "reasoning": "brief explanation"}}
"""
```

### Stage 2: Human-like Feedback

```python
FEEDBACK_PROMPT = """
You are simulating human feedback on an AI agent's response.
The human reviewer rated this as: {rating}
Reasoning: {reasoning}

Write feedback as a human would - {verbosity_instruction}

Examples of human feedback:
- "Wrong answer, the meeting was on Tuesday not Wednesday"
- "Way too many searches, should have found it in 2-3 queries"
- "Good job finding the right emails but missed the attachment mention"
- "Kept searching the same thing over and over"

Write natural, varied feedback (not robotic or templated):
"""

VERBOSITY_INSTRUCTIONS = {
    (0.5, 0.7): "Be terse. 3-8 words. e.g., 'Wrong answer' or 'Too slow'",
    (0.7, 0.85): "Be brief. 1 sentence with the main issue.",
    (0.85, 1.0): "Be detailed. 2-3 sentences explaining what went wrong/right."
}
```

## File Structure

```
notebooks/
├── 01_eval_experimentation.ipynb    # Existing
├── 02_simulated_feedback.ipynb      # NEW - main notebook
├── db_utils.py                      # Existing - extend with new functions
└── feedback_simulator.py            # NEW - core logic
```

## Notebook Usage

```python
# Cell 1: Setup & Config
from feedback_simulator import generate_simulated_feedback, EVALUATION_RUBRIC
from db_utils import get_recent_taskset_runs

# Cell 2: View Available Taskset Runs
runs = get_recent_taskset_runs(limit=10)
display(runs)  # Shows job_id, agent, task_count, avg_score, created_at

# Cell 3: Configure & Preview
job_id = "job_abc123"
rubric = EVALUATION_RUBRIC  # Edit this cell to customize

preview = generate_simulated_feedback(
    job_id=job_id,
    coverage=0.8,
    detail_level=0.6,
    detail_variance=0.2,
    rubric=rubric,
    dry_run=True  # Preview only
)
display(preview)

# Cell 4: Execute (Write to DB)
results = generate_simulated_feedback(
    job_id=job_id,
    coverage=0.8,
    detail_level=0.6,
    detail_variance=0.2,
    rubric=rubric,
    dry_run=False
)
print(f"Inserted {len(results)} feedback records")

# Cell 5: Analyze Results
display(results.groupby('rating').count())
display(results[results['rating_detail'].notna()].sample(5))
```

## Return DataFrame Schema

| Column | Type | Description |
|--------|------|-------------|
| `trace_id` | str | Trace that received feedback |
| `task_id` | int | ART-E task ID |
| `rating` | str | positive/neutral/negative |
| `rating_detail` | str/None | Textual feedback if generated |
| `detail_score` | float | Sampled detail score |
| `was_inserted` | bool | True if written to DB |

## Storage

Feedback is written to the existing `feedback` table:
- `traceId` (FK, unique per trace)
- `rating` (positive/negative/neutral)
- `ratingDetail` (text, nullable)
- `agentId` (optional)

Simulated feedback is indistinguishable from real human feedback by design.

## Comparison Dimensions

| Dimension | Ground Truth Source | Feedback Examples |
|-----------|---------------------|-------------------|
| Answer correctness | `art_e_tasks.answer` | "Wrong answer", "Incorrect information" |
| Email retrieval | `art_e_tasks.message_ids` | "Missed some emails" |
| Tool efficiency | Baseline comparison | "Too many tool calls" |
| Execution time | Threshold | "Too slow" |
| Behavioral patterns | Loop detection | "Stuck in a loop" |
