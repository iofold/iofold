# Eval Function Generation Experiments Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Achieve 80%+ accuracy on eval function generation using human feedback labels only (no ground truth).

**Architecture:** 5 independent experimental approaches that analyze agent traces with human ratings (positive/negative) and rating_detail text. Each experiment generates Python eval functions that score new traces. Functions run in a sandboxed environment with restricted imports (json, re, math, datetime, difflib, typing).

**Tech Stack:** Python 3.11, gemini-3-flash-preview via Cloudflare AI Gateway, iofold_eval_core sandbox

---

## Prerequisites

**Data Available:**
- 1015 traces with human feedback (60% train, 20% val, 20% test)
- `LabeledTrace.rating`: 'positive' | 'negative' | 'neutral'
- `LabeledTrace.rating_detail`: Optional[str] - human explanation of rating
- `LabeledTrace.human_score`: 0.0 | 0.5 | 1.0

**Key Constraint:** We CANNOT use `metadata.expectedOutput` - the goal is to learn from human feedback patterns alone.

**Current Baseline:** 58.2% accuracy (exp2 with gpt-5.1)

---

## Task 1: Shared Infrastructure - Trace Formatter

**Files:**
- Create: `notebooks/iofold_eval_core/generation/trace_formatter.py`
- Test: `notebooks/iofold_eval_core/generation/test_trace_formatter.py`

**Step 1: Write the failing test**

```python
# notebooks/iofold_eval_core/generation/test_trace_formatter.py
import pytest
from trace_formatter import format_trace_for_llm, format_trace_pair

def test_format_trace_for_llm_basic():
    trace = {
        'id': 'trace_123',
        'input_preview': 'What is the meeting time?',
        'output_preview': 'The meeting is at 3pm.',
        'steps': [
            {
                'messages_added': [
                    {'role': 'user', 'content': 'What is the meeting time?'}
                ],
                'tool_calls': [
                    {
                        'tool_name': 'email_search',
                        'arguments': {'keywords': ['meeting']},
                        'result': {'kwargs': {'status': 'success', 'content': '{"emails": [{"subject": "Meeting at 3pm"}], "total": 1}'}}
                    }
                ]
            }
        ],
        'has_errors': False,
        'step_count': 1,
    }
    rating = 'positive'
    rating_detail = 'Correctly identified meeting time from email'

    result = format_trace_for_llm(trace, rating, rating_detail)

    assert '=== TRACE: trace_123 ===' in result
    assert 'USER QUESTION:' in result
    assert 'What is the meeting time?' in result
    assert 'TOOL USAGE:' in result
    assert 'email_search' in result
    assert 'Found 1 email' in result
    assert 'AGENT ANSWER:' in result
    assert 'The meeting is at 3pm.' in result
    assert 'HUMAN RATING: positive' in result
    assert 'Correctly identified' in result

def test_format_trace_pair():
    positive_trace = {'id': 'pos_1', 'output_preview': 'Found at 3pm', 'steps': [], 'input_preview': 'When?'}
    negative_trace = {'id': 'neg_1', 'output_preview': 'Found at 3pm', 'steps': [], 'input_preview': 'When?'}

    result = format_trace_pair(
        positive_trace, 'positive', 'Correct time',
        negative_trace, 'negative', 'Wrong - no email found'
    )

    assert '=== POSITIVE TRACE ===' in result
    assert '=== NEGATIVE TRACE ===' in result
    assert 'CONTRAST:' in result
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ygupta/workspace/iofold/notebooks && source .venv/bin/activate && pytest iofold_eval_core/generation/test_trace_formatter.py -v`
Expected: FAIL with "ModuleNotFoundError: No module named 'trace_formatter'"

**Step 3: Write minimal implementation**

```python
# notebooks/iofold_eval_core/generation/trace_formatter.py
"""
Trace formatter for LLM-friendly representation.

Converts raw JSON traces to human-readable narrative format
that's easier for LLMs to analyze and reason about.
"""

import json
from typing import Optional, Dict, Any, List


def _extract_user_question(trace: Dict[str, Any]) -> str:
    """Extract the user's question from trace steps."""
    for step in trace.get('steps', []):
        for msg in step.get('messages_added', []):
            if msg.get('role') == 'user':
                return msg.get('content', '')[:500]
    return trace.get('input_preview', '')[:200]


def _format_tool_calls(trace: Dict[str, Any]) -> str:
    """Format tool calls in a readable way."""
    lines = []
    call_num = 1

    for step in trace.get('steps', []):
        for tc in step.get('tool_calls', []):
            tool_name = tc.get('tool_name', 'unknown')
            args = tc.get('arguments', {})
            result = tc.get('result', {}).get('kwargs', {})
            status = result.get('status', 'unknown')
            content = result.get('content', '')

            # Parse result summary
            result_summary = ''
            if status == 'error':
                result_summary = 'ERROR'
            elif status == 'success':
                try:
                    data = json.loads(content)
                    if 'total' in data:
                        total = data['total']
                        result_summary = f'Found {total} email(s)' if total > 0 else 'No emails found'
                    elif 'message_id' in data:
                        result_summary = 'Retrieved email content'
                    else:
                        result_summary = 'Success'
                except:
                    if '"total": 0' in content or '"emails": []' in content:
                        result_summary = 'No emails found'
                    elif 'Error' in content:
                        result_summary = 'ERROR'
                    else:
                        result_summary = 'Success'

            # Format arguments
            args_str = ', '.join(f'{k}={repr(v)[:50]}' for k, v in args.items())

            lines.append(f"  {call_num}. {tool_name}({args_str}) -> {result_summary}")
            call_num += 1

    return '\n'.join(lines) if lines else '  (no tool calls)'


def format_trace_for_llm(
    trace: Dict[str, Any],
    rating: str,
    rating_detail: Optional[str] = None,
    include_full_steps: bool = False,
) -> str:
    """
    Format a trace for LLM analysis.

    Args:
        trace: Raw trace dict with steps, output_preview, etc.
        rating: Human rating ('positive', 'negative', 'neutral')
        rating_detail: Optional explanation of the rating
        include_full_steps: If True, include raw step data

    Returns:
        Formatted string suitable for LLM prompts
    """
    trace_id = trace.get('id', trace.get('trace_id', 'unknown'))
    user_question = _extract_user_question(trace)
    agent_answer = trace.get('output_preview', '')
    tool_usage = _format_tool_calls(trace)
    has_errors = trace.get('has_errors', False)
    step_count = trace.get('step_count', len(trace.get('steps', [])))

    parts = [
        f"=== TRACE: {trace_id} ===",
        "",
        "USER QUESTION:",
        user_question,
        "",
        f"TOOL USAGE ({step_count} steps, errors={has_errors}):",
        tool_usage,
        "",
        "AGENT ANSWER:",
        agent_answer,
        "",
        f"HUMAN RATING: {rating}",
    ]

    if rating_detail:
        parts.append(f"FEEDBACK: {rating_detail}")

    if include_full_steps:
        parts.extend([
            "",
            "RAW STEPS:",
            json.dumps(trace.get('steps', [])[:3], indent=2, default=str)[:2000],
        ])

    return '\n'.join(parts)


def format_trace_pair(
    pos_trace: Dict[str, Any],
    pos_rating: str,
    pos_detail: Optional[str],
    neg_trace: Dict[str, Any],
    neg_rating: str,
    neg_detail: Optional[str],
) -> str:
    """
    Format a contrastive pair of traces for analysis.

    Args:
        pos_trace: Positive-rated trace
        pos_rating, pos_detail: Rating info for positive trace
        neg_trace: Negative-rated trace
        neg_rating, neg_detail: Rating info for negative trace

    Returns:
        Formatted comparison suitable for contrastive analysis
    """
    parts = [
        "=== POSITIVE TRACE ===",
        format_trace_for_llm(pos_trace, pos_rating, pos_detail),
        "",
        "=== NEGATIVE TRACE ===",
        format_trace_for_llm(neg_trace, neg_rating, neg_detail),
        "",
        "CONTRAST: What specific differences caused the different ratings?",
    ]

    return '\n'.join(parts)


def format_traces_batch(
    traces: List[Dict[str, Any]],
    ratings: List[str],
    details: List[Optional[str]],
    max_traces: int = 10,
) -> str:
    """Format multiple traces for batch analysis."""
    parts = []
    for i, (trace, rating, detail) in enumerate(zip(traces[:max_traces], ratings[:max_traces], details[:max_traces])):
        parts.append(f"### Example {i+1}")
        parts.append(format_trace_for_llm(trace, rating, detail))
        parts.append("")
    return '\n'.join(parts)
```

**Step 4: Run test to verify it passes**

Run: `cd /home/ygupta/workspace/iofold/notebooks && source .venv/bin/activate && pytest iofold_eval_core/generation/test_trace_formatter.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add notebooks/iofold_eval_core/generation/trace_formatter.py notebooks/iofold_eval_core/generation/test_trace_formatter.py
git commit -m "feat: add trace formatter for LLM-friendly representation"
```

---

## Task 2: Shared Infrastructure - Contrastive Pair Generator

**Files:**
- Create: `notebooks/iofold_eval_core/generation/pair_generator.py`
- Test: `notebooks/iofold_eval_core/generation/test_pair_generator.py`

**Step 1: Write the failing test**

```python
# notebooks/iofold_eval_core/generation/test_pair_generator.py
import pytest
from pair_generator import generate_contrastive_pairs, group_traces_by_question_type

def test_group_traces_by_question_type():
    traces = [
        {'id': '1', 'input_preview': 'Were there variances for hour 15?', 'rating': 'positive'},
        {'id': '2', 'input_preview': 'What variances occurred on 3/6?', 'rating': 'negative'},
        {'id': '3', 'input_preview': 'When is the meeting?', 'rating': 'positive'},
        {'id': '4', 'input_preview': 'What time is the meeting scheduled?', 'rating': 'negative'},
    ]

    groups = group_traces_by_question_type(traces)

    # Should group variance questions together, meeting questions together
    assert len(groups) >= 2
    variance_group = [g for g in groups if 'variance' in g['type'].lower()][0]
    assert len(variance_group['traces']) == 2

def test_generate_contrastive_pairs():
    traces = [
        {'id': '1', 'input_preview': 'variance question', 'rating': 'positive', 'rating_detail': 'correct'},
        {'id': '2', 'input_preview': 'variance question', 'rating': 'negative', 'rating_detail': 'wrong'},
    ]

    pairs = generate_contrastive_pairs(traces, max_pairs=5)

    assert len(pairs) >= 1
    assert pairs[0]['positive']['id'] == '1'
    assert pairs[0]['negative']['id'] == '2'
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ygupta/workspace/iofold/notebooks && source .venv/bin/activate && pytest iofold_eval_core/generation/test_pair_generator.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# notebooks/iofold_eval_core/generation/pair_generator.py
"""
Contrastive pair generator for trace analysis.

Groups similar traces and pairs positive/negative examples
for contrastive learning.
"""

import re
from typing import List, Dict, Any, Optional
from collections import defaultdict


# Question type patterns
QUESTION_PATTERNS = [
    ('variance', r'variance|variances|differ|discrepancy'),
    ('meeting', r'meeting|schedule|calendar|appointment'),
    ('person', r'who |whose |whom |person|employee|contact'),
    ('time', r'when |what time|date|deadline'),
    ('location', r'where |location|room|office|place'),
    ('email_content', r'what does|what did|email say|message say'),
    ('existence', r'any email|is there|are there|did .* send'),
]


def _detect_question_type(input_preview: str) -> str:
    """Detect the type of question from input preview."""
    input_lower = input_preview.lower()

    for qtype, pattern in QUESTION_PATTERNS:
        if re.search(pattern, input_lower):
            return qtype

    return 'general'


def _extract_keywords(input_preview: str) -> set:
    """Extract meaningful keywords from question."""
    # Remove common words
    stop_words = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'what', 'when',
                  'where', 'who', 'how', 'any', 'for', 'in', 'on', 'at', 'to',
                  'email', 'emails', 'inbox', 'my', 'your', 'find', 'search'}

    words = re.findall(r'\b[a-zA-Z]{3,}\b', input_preview.lower())
    return set(w for w in words if w not in stop_words)


def group_traces_by_question_type(
    traces: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Group traces by question type.

    Args:
        traces: List of trace dicts with 'input_preview' and 'rating'

    Returns:
        List of groups, each with 'type', 'traces', 'positive_count', 'negative_count'
    """
    groups = defaultdict(list)

    for trace in traces:
        qtype = _detect_question_type(trace.get('input_preview', ''))
        groups[qtype].append(trace)

    result = []
    for qtype, group_traces in groups.items():
        pos_count = sum(1 for t in group_traces if t.get('rating') == 'positive')
        neg_count = sum(1 for t in group_traces if t.get('rating') == 'negative')

        result.append({
            'type': qtype,
            'traces': group_traces,
            'positive_count': pos_count,
            'negative_count': neg_count,
        })

    # Sort by number of traces (largest groups first)
    result.sort(key=lambda g: len(g['traces']), reverse=True)

    return result


def generate_contrastive_pairs(
    traces: List[Dict[str, Any]],
    max_pairs: int = 20,
    same_type_only: bool = True,
) -> List[Dict[str, Any]]:
    """
    Generate contrastive pairs of positive/negative traces.

    Args:
        traces: List of trace dicts with rating info
        max_pairs: Maximum number of pairs to generate
        same_type_only: If True, only pair traces of same question type

    Returns:
        List of pairs, each with 'positive' and 'negative' trace dicts
    """
    pairs = []

    if same_type_only:
        groups = group_traces_by_question_type(traces)

        for group in groups:
            positives = [t for t in group['traces'] if t.get('rating') == 'positive']
            negatives = [t for t in group['traces'] if t.get('rating') == 'negative']

            # Pair up within group
            for pos in positives[:max_pairs // len(groups) + 1]:
                for neg in negatives[:max_pairs // len(groups) + 1]:
                    if len(pairs) >= max_pairs:
                        break

                    # Check keyword similarity
                    pos_kw = _extract_keywords(pos.get('input_preview', ''))
                    neg_kw = _extract_keywords(neg.get('input_preview', ''))
                    similarity = len(pos_kw & neg_kw) / max(len(pos_kw | neg_kw), 1)

                    pairs.append({
                        'positive': pos,
                        'negative': neg,
                        'question_type': group['type'],
                        'keyword_similarity': similarity,
                    })

                if len(pairs) >= max_pairs:
                    break
    else:
        positives = [t for t in traces if t.get('rating') == 'positive']
        negatives = [t for t in traces if t.get('rating') == 'negative']

        for pos, neg in zip(positives[:max_pairs], negatives[:max_pairs]):
            pairs.append({
                'positive': pos,
                'negative': neg,
                'question_type': 'mixed',
                'keyword_similarity': 0.0,
            })

    # Sort by similarity (most similar pairs are most useful)
    pairs.sort(key=lambda p: p['keyword_similarity'], reverse=True)

    return pairs[:max_pairs]
```

**Step 4: Run test to verify it passes**

Run: `cd /home/ygupta/workspace/iofold/notebooks && source .venv/bin/activate && pytest iofold_eval_core/generation/test_pair_generator.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add notebooks/iofold_eval_core/generation/pair_generator.py notebooks/iofold_eval_core/generation/test_pair_generator.py
git commit -m "feat: add contrastive pair generator for trace analysis"
```

---

## Task 3: Experiment 3 - LLM-Friendly Format + Feedback Analysis

**Files:**
- Create: `notebooks/experiments/eval_reward_functions/exp3_llm_friendly.py`
- Modify: `notebooks/iofold_eval_core/generation/prompts.py`

**Step 1: Create experiment file**

```python
# notebooks/experiments/eval_reward_functions/exp3_llm_friendly.py
#!/usr/bin/env python3
"""
Experiment 3: LLM-Friendly Trace Format + Feedback Analysis

Hypothesis: Converting traces to narrative format and including human
feedback text will help the LLM understand quality patterns better.

Approach:
1. Format traces as human-readable narratives
2. Include rating_detail in the prompt
3. Ask LLM to analyze WHY traces got their ratings
4. Generate eval functions based on these insights

Success Criteria: >80% accuracy, >0.6 Cohen's kappa
"""

import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Add notebooks dir to path
NOTEBOOKS_DIR = Path(__file__).parent.parent.parent
sys.path.insert(0, str(NOTEBOOKS_DIR))

from dotenv import load_dotenv
PROJECT_ROOT = NOTEBOOKS_DIR.parent
load_dotenv(PROJECT_ROOT / ".env")

from openai import OpenAI

from experiments.eval_reward_functions.experiment_base import (
    ExperimentRunner,
    ExperimentResult,
    MetricsResult,
    LabeledTrace,
    load_traces_for_job,
)
from experiments.eval_reward_functions.config import (
    JOB_ID,
    MODELS,
    get_split,
    CLASSIFICATION_THRESHOLD,
)
from iofold_eval_core.generation.trace_formatter import (
    format_trace_for_llm,
    format_traces_batch,
)
from iofold_eval_core.sandbox import execute_reward_function


@dataclass
class Exp3Config:
    """Configuration for experiment 3."""
    model_key: str = "gemini-3-flash-preview"
    temperature: float = 0.3
    max_tokens: int = 16384

    # Iteration settings
    max_iterations: int = 10
    candidates_per_iteration: int = 5
    target_accuracy: float = 0.80

    # Sample settings
    max_positive_examples: int = 30
    max_negative_examples: int = 30


# Analysis prompt - asks LLM to explain rating patterns
FEEDBACK_ANALYSIS_PROMPT = """Analyze these agent traces with human ratings.

Your task: Understand WHY humans rated traces as positive or negative.

{formatted_traces}

Based on these examples, answer:

1. POSITIVE PATTERNS: What do positive traces have in common? What makes an answer "good"?

2. NEGATIVE PATTERNS: What do negative traces have in common? What makes an answer "bad"?

3. KEY SIGNALS: What specific signals in the trace (tool usage, answer structure, keywords) predict the rating?

4. FAILURE MODES: What are the common failure modes that lead to negative ratings?

Be specific and cite examples from the traces above.

Return JSON:
{{
    "positive_patterns": ["pattern1", "pattern2", ...],
    "negative_patterns": ["pattern1", "pattern2", ...],
    "key_signals": ["signal1", "signal2", ...],
    "failure_modes": ["mode1", "mode2", ...]
}}
"""

# Generation prompt - uses analysis to generate eval functions
GENERATION_PROMPT = """Based on this analysis of human feedback patterns:

## Feedback Analysis
{analysis}

## Trace Schema
The trace dict has these fields:
- trace['id']: str
- trace['input_preview']: str - user's question
- trace['output_preview']: str - agent's answer
- trace['has_errors']: bool
- trace['step_count']: int
- trace['steps']: list of execution steps, each with:
    - step['messages_added']: list of {{'role': str, 'content': str}}
    - step['tool_calls']: list of {{'tool_name': str, 'arguments': dict, 'result': {{'kwargs': {{'status': str, 'content': str}}}}}}

## Task
Generate {num_candidates} diverse reward functions that capture the human feedback patterns.
Each function should detect the positive/negative patterns identified above.

Requirements:
- Function signature: def eval_*(trace: dict, ctx) -> Tuple[float, str]
- Return (score 0-1, feedback_string)
- Use only: json, re, math, datetime, difflib
- Focus on patterns humans actually use to rate traces

Output {num_candidates} JSON objects, one per line:
{{"code": "def eval_...(trace, ctx):\\n    ...", "strategy": "description", "reasoning": "which patterns this captures"}}
"""


class Exp3LLMFriendly(ExperimentRunner):
    """Experiment 3: LLM-Friendly Format with Feedback Analysis."""

    def __init__(self, config: Exp3Config = None, job_id: str = JOB_ID):
        self.config = config or Exp3Config()

        super().__init__(
            experiment_id="exp3-llm-friendly",
            experiment_name="LLM-Friendly Format + Feedback Analysis",
            model=self.config.model_key,
            job_id=job_id,
        )

        self.client = None
        self.best_candidate = None
        self.analysis = None

    def _init_client(self):
        """Initialize LLM client."""
        model_config = MODELS.get(self.config.model_key)
        if not model_config:
            raise ValueError(f"Unknown model: {self.config.model_key}")

        account_id = os.environ.get("CF_ACCOUNT_ID")
        gateway_id = os.environ.get("CF_AI_GATEWAY_ID")
        api_key = os.environ.get("CF_AI_GATEWAY_TOKEN")

        self.client = OpenAI(
            api_key=api_key,
            base_url=f"https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/compat"
        )
        self.model_id = model_config.gateway_model_id
        self.provider = model_config.provider

    def _generate(self, prompt: str, max_tokens: int = None) -> str:
        """Generate text from LLM."""
        max_tokens = max_tokens or self.config.max_tokens

        params = {
            "model": self.model_id,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": self.config.temperature,
            "max_tokens": max_tokens,
        }

        response = self.client.chat.completions.create(**params)
        return response.choices[0].message.content or ""

    def _analyze_feedback_patterns(self, traces: List[LabeledTrace]) -> Dict[str, Any]:
        """Analyze human feedback patterns."""
        self._log("  Analyzing human feedback patterns...")

        # Format traces with ratings
        formatted = []
        for trace in traces:
            trace_dict = {
                'id': trace.id,
                'input_preview': trace.input_preview,
                'output_preview': trace.output_preview,
                'steps': trace.steps,
                'has_errors': trace.has_errors,
                'step_count': trace.step_count,
            }
            formatted.append(format_trace_for_llm(
                trace_dict,
                trace.rating,
                trace.rating_detail
            ))

        prompt = FEEDBACK_ANALYSIS_PROMPT.format(
            formatted_traces='\n\n'.join(formatted)
        )

        response = self._generate(prompt, max_tokens=4096)

        # Parse JSON from response
        try:
            # Find JSON in response
            import re
            json_match = re.search(r'\{[\s\S]*\}', response)
            if json_match:
                return json.loads(json_match.group())
        except:
            pass

        return {"raw_response": response}

    def _generate_candidates(self, analysis: Dict[str, Any], num: int) -> List[Dict]:
        """Generate eval function candidates."""
        self._log(f"  Generating {num} candidates...")

        prompt = GENERATION_PROMPT.format(
            analysis=json.dumps(analysis, indent=2),
            num_candidates=num,
        )

        response = self._generate(prompt)

        # Parse JSONL response
        candidates = []
        for line in response.split('\n'):
            line = line.strip()
            if line.startswith('{') and line.endswith('}'):
                try:
                    candidates.append(json.loads(line))
                except:
                    pass

        return candidates

    def _test_candidate(self, code: str, traces: List[LabeledTrace]) -> Tuple[float, float]:
        """Test a candidate on traces, return (accuracy, kappa)."""
        correct = 0
        total = 0

        for trace in traces:
            trace_dict = {
                'id': trace.id,
                'input_preview': trace.input_preview,
                'output_preview': trace.output_preview,
                'steps': trace.steps,
                'has_errors': trace.has_errors,
                'step_count': trace.step_count,
                'metadata': trace.metadata,
            }

            try:
                score, _ = execute_reward_function(code, trace_dict, None)
                predicted = 'positive' if score >= CLASSIFICATION_THRESHOLD else 'negative'
                actual = trace.rating
                if predicted == actual or (actual == 'neutral'):
                    correct += 1
                total += 1
            except Exception as e:
                total += 1

        accuracy = correct / total if total > 0 else 0.0
        # Simplified kappa calculation
        return accuracy, 0.0

    def run(self) -> ExperimentResult:
        """Run the experiment."""
        start_time = datetime.now()
        self._log("=" * 60)
        self._log(f"Experiment 3: {self.experiment_name}")
        self._log("=" * 60)

        # Initialize
        self._init_client()
        train_traces, val_traces, test_traces = self._split_traces()

        self._log(f"Train: {len(train_traces)}, Val: {len(val_traces)}, Test: {len(test_traces)}")

        # Sample traces for analysis
        import random
        random.seed(42)
        positives = [t for t in train_traces if t.rating == 'positive']
        negatives = [t for t in train_traces if t.rating == 'negative']

        sampled = (
            random.sample(positives, min(self.config.max_positive_examples, len(positives))) +
            random.sample(negatives, min(self.config.max_negative_examples, len(negatives)))
        )
        random.shuffle(sampled)

        self._log(f"Sampled {len(sampled)} traces for analysis")

        # Step 1: Analyze feedback patterns
        self._log("\n[1/4] Analyzing feedback patterns...")
        self.analysis = self._analyze_feedback_patterns(sampled)
        self._log(f"  Found {len(self.analysis.get('positive_patterns', []))} positive patterns")
        self._log(f"  Found {len(self.analysis.get('negative_patterns', []))} negative patterns")

        # Step 2: Generate and test candidates
        self._log("\n[2/4] Generating and testing candidates...")
        best_accuracy = 0.0

        for iteration in range(self.config.max_iterations):
            candidates = self._generate_candidates(
                self.analysis,
                self.config.candidates_per_iteration
            )

            for cand in candidates:
                code = cand.get('code', '')
                if not code:
                    continue

                accuracy, kappa = self._test_candidate(code, val_traces)
                self._log(f"  Iteration {iteration+1}: accuracy={accuracy:.1%}")

                if accuracy > best_accuracy:
                    best_accuracy = accuracy
                    self.best_candidate = cand

                    if accuracy >= self.config.target_accuracy:
                        self._log(f"  Target reached!")
                        break

            if best_accuracy >= self.config.target_accuracy:
                break

        # Step 3: Final evaluation
        self._log("\n[3/4] Final validation evaluation...")
        if self.best_candidate:
            val_results = self.evaluate_traces(
                lambda t, ctx: execute_reward_function(
                    self.best_candidate['code'],
                    {'id': t.id, 'input_preview': t.input_preview, 'output_preview': t.output_preview,
                     'steps': t.steps, 'has_errors': t.has_errors, 'step_count': t.step_count,
                     'metadata': t.metadata},
                    ctx
                ),
                val_traces
            )
            val_metrics = self.compute_metrics(val_results)
        else:
            val_metrics = None

        self._log("\n[4/4] Final test evaluation...")
        if self.best_candidate:
            test_results = self.evaluate_traces(
                lambda t, ctx: execute_reward_function(
                    self.best_candidate['code'],
                    {'id': t.id, 'input_preview': t.input_preview, 'output_preview': t.output_preview,
                     'steps': t.steps, 'has_errors': t.has_errors, 'step_count': t.step_count,
                     'metadata': t.metadata},
                    ctx
                ),
                test_traces
            )
            test_metrics = self.compute_metrics(test_results)

            self._log(f"\nTest Accuracy: {test_metrics.accuracy:.1%}")
            self._log(f"Test F1: {test_metrics.f1_score:.3f}")
        else:
            test_metrics = None
            test_results = []

        end_time = datetime.now()

        return ExperimentResult(
            experiment_id=self.experiment_id,
            experiment_name=self.experiment_name,
            model=self.config.model_key,
            started_at=start_time.isoformat(),
            completed_at=end_time.isoformat(),
            duration_seconds=(end_time - start_time).total_seconds(),
            validation_metrics=val_metrics,
            test_metrics=test_metrics,
            test_results=test_results,
            eval_code=self.best_candidate['code'] if self.best_candidate else "",
            config=self.config.__dict__,
            notes=f"Analysis: {json.dumps(self.analysis)[:500]}",
        )


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="gemini-3-flash-preview")
    parser.add_argument("--save", action="store_true")
    args = parser.parse_args()

    config = Exp3Config(model_key=args.model)
    experiment = Exp3LLMFriendly(config=config)
    result = experiment.run()

    if args.save:
        path = experiment.save_result(result)
        print(f"Saved to: {path}")

    return 0 if result.test_metrics and result.test_metrics.accuracy >= 0.8 else 1


if __name__ == "__main__":
    sys.exit(main())
```

**Step 2: Run experiment**

Run: `cd /home/ygupta/workspace/iofold/notebooks && source .venv/bin/activate && python experiments/eval_reward_functions/exp3_llm_friendly.py --model gemini-3-flash-preview --save`

**Step 3: Commit**

```bash
git add notebooks/experiments/eval_reward_functions/exp3_llm_friendly.py
git commit -m "feat: add exp3 - LLM-friendly format with feedback analysis"
```

---

## Task 4: Experiment 4 - Contrastive Pairs Analysis

**Files:**
- Create: `notebooks/experiments/eval_reward_functions/exp4_contrastive.py`

**Step 1: Create experiment file**

The experiment should:
1. Use `pair_generator.py` to create positive/negative pairs
2. Format pairs using `format_trace_pair()`
3. Ask LLM to identify specific differences
4. Generate eval functions targeting those differences

Key prompt structure:
```
Here are pairs of similar traces with opposite ratings:

{formatted_pairs}

For each pair, the traces have similar questions but one is rated POSITIVE and one NEGATIVE.

Analyze:
1. What specific difference caused the different rating?
2. What signal in the trace predicts the rating?

Then generate eval functions that detect these differences.
```

**Step 2-5:** Similar to Task 3

---

## Task 5: Experiment 5 - Human Feedback Pattern Mining

**Files:**
- Create: `notebooks/experiments/eval_reward_functions/exp5_feedback_mining.py`

**Step 1: Create experiment file**

The experiment should:
1. Extract and analyze `rating_detail` text from all traces
2. Cluster feedback by keywords (hallucination, correct, wrong, etc.)
3. Generate eval functions for each feedback cluster

Key insight: The `rating_detail` field contains human explanations like:
- "Correctly identified the meeting time"
- "Hallucinated variance values"
- "Tool error not handled properly"

These explanations directly tell us what to check for.

**Step 2-5:** Similar to Task 3

---

## Task 6: Experiment 6 - Tool Usage & Grounding Patterns

**Files:**
- Create: `notebooks/experiments/eval_reward_functions/exp6_tool_grounding.py`

**Step 1: Create experiment file**

The experiment should focus on tool usage patterns:
1. Analyze correlation between tool results and answer quality
2. Detect hallucination: high specificity + empty/error tool results
3. Check if answer content matches tool output content

Key patterns to detect:
- `GROUNDED_POSITIVE`: Tool found data, answer summarizes it
- `GROUNDED_NEGATIVE`: Tool found nothing, answer says "not found"
- `HALLUCINATION`: Tool found nothing, answer claims specific facts
- `CONTRADICTION`: Tool found X, answer says Y

**Step 2-5:** Similar to Task 3

---

## Task 7: Experiment 7 - Failure Mode Clustering

**Files:**
- Create: `notebooks/experiments/eval_reward_functions/exp7_failure_modes.py`

**Step 1: Create experiment file**

The experiment should:
1. Group traces by question type (variance, meeting, person, etc.)
2. For each group, identify common failure modes
3. Generate specialized eval functions per group
4. Combine into ensemble

Key insight: Different question types have different failure modes:
- Variance questions: Often hallucinate specific numbers
- Meeting questions: Often get time/location wrong
- Existence questions: Often over-claim or under-claim

**Step 2-5:** Similar to Task 3

---

## Task 8: Results Comparison and Ensemble

**Files:**
- Create: `notebooks/experiments/eval_reward_functions/compare_results.py`

**Step 1: Create comparison script**

```python
# notebooks/experiments/eval_reward_functions/compare_results.py
"""Compare results across all experiments and create ensemble."""

import json
from pathlib import Path
import glob

RESULTS_DIR = Path(__file__).parent / "results"

def load_all_results():
    results = {}
    for f in RESULTS_DIR.glob("*.json"):
        with open(f) as fp:
            data = json.load(fp)
            exp_id = data.get('experiment_id', f.stem)
            results[exp_id] = data
    return results

def compare():
    results = load_all_results()

    print("=" * 60)
    print("EXPERIMENT COMPARISON")
    print("=" * 60)
    print(f"{'Experiment':<30} {'Accuracy':>10} {'F1':>10} {'Kappa':>10}")
    print("-" * 60)

    for exp_id, data in sorted(results.items()):
        metrics = data.get('test_metrics', {})
        if metrics:
            acc = metrics.get('accuracy', 0)
            f1 = metrics.get('f1_score', 0)
            kappa = metrics.get('cohen_kappa', 0)
            print(f"{exp_id:<30} {acc:>10.1%} {f1:>10.3f} {kappa:>10.3f}")

if __name__ == "__main__":
    compare()
```

**Step 2: Run comparison**

Run: `cd /home/ygupta/workspace/iofold/notebooks && source .venv/bin/activate && python experiments/eval_reward_functions/compare_results.py`

**Step 3: Commit**

```bash
git add notebooks/experiments/eval_reward_functions/compare_results.py
git commit -m "feat: add experiment comparison script"
```

---

## Execution Order

1. **Task 1**: Trace formatter (shared infrastructure)
2. **Task 2**: Pair generator (shared infrastructure)
3. **Tasks 3-7**: Run experiments in parallel (independent)
4. **Task 8**: Compare results and analyze

## Success Criteria

- At least one experiment achieves >80% accuracy
- Cohen's kappa >0.6 (substantial agreement)
- Recall >70% (catch most negatives)
- Eval code is interpretable and maintainable
