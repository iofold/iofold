# Composite Reward Function Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## Problem Statement

Current approach treats eval as binary classification (positive/negative). This is wrong because:
1. Human ratings are actually 3-class (thumbs up/neutral/thumbs down)
2. We need continuous scores (0-1 float) for gradient-based optimization
3. Single evaluators can't capture all quality dimensions
4. JSON parsing hacks are fragile - should use structured outputs

## New Architecture: Composite Reward Function

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CompositeRewardFunction                          │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Deterministic │  │  LLM Judge   │  │  Grounding   │  ...more     │
│  │   Evaluator   │  │  Evaluator   │  │  Evaluator   │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                 │                       │
│         ▼                 ▼                 ▼                       │
│     score: 0.7        score: 0.6        score: 0.8                 │
│     weight: 0.3       weight: 0.4       weight: 0.3                │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │          Weighted Sum + Clamp to [0, 1]                     │   │
│  │  final_score = clamp(Σ(score_i * weight_i) + adjustments)   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│                    (0.67, "Good answer with minor issues")          │
└─────────────────────────────────────────────────────────────────────┘
```

## Score Mapping

| Human Rating | Score Range | Threshold |
|--------------|-------------|-----------|
| Thumbs Down  | 0.00 - 0.33 | < 0.33    |
| Neutral      | 0.33 - 0.66 | 0.33-0.66 |
| Thumbs Up    | 0.67 - 1.00 | >= 0.67   |

Human scores for training:
- `rating == 'negative'` → target = 0.17 (middle of 0-0.33)
- `rating == 'neutral'` → target = 0.50 (middle of 0.33-0.66)
- `rating == 'positive'` → target = 0.83 (middle of 0.67-1.0)

## Metrics

**Primary Metrics:**
- **MAE** (Mean Absolute Error): |predicted - target|
- **Correlation**: Pearson/Spearman between predicted and target scores
- **Classification Accuracy**: Using 0.33/0.67 thresholds for 3-class

**Secondary Metrics:**
- Per-class precision/recall
- Score calibration (predicted 0.8 should be correct ~80% of time)

---

## Task 1: Core Infrastructure - Structured LLM Client

**Files:**
- Create: `notebooks/iofold_eval_core/llm/structured_client.py`
- Create: `notebooks/iofold_eval_core/llm/schemas.py`

### Step 1: Define Pydantic schemas for structured outputs

```python
# notebooks/iofold_eval_core/llm/schemas.py
from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum

class EvalScore(BaseModel):
    """Structured output for LLM judge evaluation."""
    score: float = Field(..., ge=0, le=1, description="Quality score from 0 (bad) to 1 (good)")
    reasoning: str = Field(..., description="Brief explanation for the score")
    confidence: float = Field(0.8, ge=0, le=1, description="Confidence in this assessment")

class PatternAnalysis(BaseModel):
    """Structured output for pattern analysis."""
    positive_patterns: List[str] = Field(default_factory=list)
    negative_patterns: List[str] = Field(default_factory=list)
    key_signals: List[str] = Field(default_factory=list)
    failure_modes: List[str] = Field(default_factory=list)

class GroundingAnalysis(BaseModel):
    """Structured output for grounding check."""
    has_tool_support: bool = Field(..., description="Whether answer has tool result support")
    specificity_level: str = Field(..., description="none/low/medium/high")
    hallucination_risk: float = Field(..., ge=0, le=1, description="Risk of hallucination 0-1")
    grounding_score: float = Field(..., ge=0, le=1, description="How well grounded the answer is")
    explanation: str

class CandidateFunction(BaseModel):
    """Structured output for generated eval function."""
    code: str = Field(..., description="Python function code")
    strategy: str = Field(..., description="What this function checks")
    expected_weight: float = Field(0.2, ge=0, le=1, description="Suggested weight in ensemble")
```

### Step 2: Create structured LLM client

```python
# notebooks/iofold_eval_core/llm/structured_client.py
"""
Structured LLM client using response_format for reliable JSON outputs.

Supports:
- Google AI Studio (Gemini) via Cloudflare AI Gateway
- OpenAI (GPT) via Cloudflare AI Gateway
- Anthropic (Claude) via Cloudflare AI Gateway
"""

import os
import json
from typing import Type, TypeVar, Optional
from pydantic import BaseModel
from openai import OpenAI

T = TypeVar('T', bound=BaseModel)

class StructuredLLMClient:
    """LLM client that returns structured Pydantic objects."""

    def __init__(
        self,
        model: str = "gemini-2.5-flash",
        temperature: float = 0.3,
    ):
        self.model = model
        self.temperature = temperature

        # Gateway config
        account_id = os.environ.get("CF_ACCOUNT_ID")
        gateway_id = os.environ.get("CF_AI_GATEWAY_ID")
        api_key = os.environ.get("CF_AI_GATEWAY_TOKEN")

        self.client = OpenAI(
            api_key=api_key,
            base_url=f"https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/compat"
        )

        # Model mapping
        self.model_map = {
            "gemini-2.5-flash": "google-ai-studio/gemini-2.5-flash",
            "gemini-2.5-pro": "google-ai-studio/gemini-2.5-pro",
            "gpt-5.1": "openai/gpt-5.1",
            "gpt-5-nano": "openai/gpt-5-nano",
            "claude-sonnet-4-5": "anthropic/claude-sonnet-4-5-20250929",
        }
        self.gateway_model = self.model_map.get(model, f"openai/{model}")

    def generate(
        self,
        prompt: str,
        response_schema: Type[T],
        max_tokens: int = 4096,
    ) -> T:
        """Generate structured output matching the schema."""

        # Build JSON schema from Pydantic model
        schema = response_schema.model_json_schema()

        response = self.client.chat.completions.create(
            model=self.gateway_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=self.temperature,
            max_tokens=max_tokens,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": response_schema.__name__,
                    "schema": schema,
                    "strict": True,
                }
            }
        )

        content = response.choices[0].message.content
        return response_schema.model_validate_json(content)

    def generate_text(self, prompt: str, max_tokens: int = 4096) -> str:
        """Generate unstructured text (for code generation)."""
        response = self.client.chat.completions.create(
            model=self.gateway_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=self.temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""
```

### Step 3: Create __init__.py exports

```python
# notebooks/iofold_eval_core/llm/__init__.py
from .schemas import (
    EvalScore,
    PatternAnalysis,
    GroundingAnalysis,
    CandidateFunction,
)
from .structured_client import StructuredLLMClient

__all__ = [
    "EvalScore",
    "PatternAnalysis",
    "GroundingAnalysis",
    "CandidateFunction",
    "StructuredLLMClient",
]
```

### Step 4: Verify with test

```bash
cd /home/ygupta/workspace/iofold/notebooks && source .venv/bin/activate
python -c "
from iofold_eval_core.llm import StructuredLLMClient, EvalScore
client = StructuredLLMClient('gemini-2.5-flash')
result = client.generate('Rate this answer quality: The meeting is at 3pm. Score 0-1.', EvalScore)
print(f'Score: {result.score}, Reasoning: {result.reasoning}')
"
```

---

## Task 2: Core Infrastructure - Composite Scorer Base

**Files:**
- Create: `notebooks/iofold_eval_core/scoring/base.py`
- Create: `notebooks/iofold_eval_core/scoring/composite.py`

### Step 1: Define base evaluator interface

```python
# notebooks/iofold_eval_core/scoring/base.py
"""Base classes for evaluators in the composite scoring system."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

@dataclass
class EvalResult:
    """Result from a single evaluator."""
    score: float  # 0-1, where 0=bad, 1=good
    feedback: str  # Human-readable explanation
    confidence: float = 1.0  # How confident is this score
    metadata: Optional[Dict[str, Any]] = None  # Extra info for debugging

class BaseEvaluator(ABC):
    """Base class for all evaluators."""

    name: str = "base"
    description: str = "Base evaluator"
    default_weight: float = 0.2

    @abstractmethod
    def evaluate(self, trace: Dict[str, Any], ctx: Optional[Any] = None) -> EvalResult:
        """
        Evaluate a trace and return a score.

        Args:
            trace: Trace dict with steps, output_preview, etc.
            ctx: Optional context (e.g., expected output)

        Returns:
            EvalResult with score in [0, 1]
        """
        pass

    def __call__(self, trace: Dict[str, Any], ctx: Optional[Any] = None) -> EvalResult:
        return self.evaluate(trace, ctx)
```

### Step 2: Create composite scorer

```python
# notebooks/iofold_eval_core/scoring/composite.py
"""Composite reward function that combines multiple evaluators."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
from .base import BaseEvaluator, EvalResult

@dataclass
class CompositeResult:
    """Result from composite scoring."""
    final_score: float  # 0-1 bounded
    feedback: str  # Combined feedback
    component_scores: Dict[str, EvalResult]  # Per-evaluator results
    weights_used: Dict[str, float]  # Actual weights applied

class CompositeScorer:
    """
    Combines multiple evaluators into a single reward function.

    Final score = clamp(Σ(score_i * weight_i) + adjustments, 0, 1)
    """

    def __init__(self):
        self.evaluators: List[Tuple[BaseEvaluator, float]] = []
        self.adjustments: List[callable] = []

    def add_evaluator(self, evaluator: BaseEvaluator, weight: float = None):
        """Add an evaluator with optional custom weight."""
        w = weight if weight is not None else evaluator.default_weight
        self.evaluators.append((evaluator, w))
        return self  # Allow chaining

    def add_adjustment(self, fn: callable):
        """
        Add an adjustment function.

        fn(trace, component_scores) -> float adjustment (-1 to +1)
        """
        self.adjustments.append(fn)
        return self

    def normalize_weights(self):
        """Normalize weights to sum to 1."""
        total = sum(w for _, w in self.evaluators)
        if total > 0:
            self.evaluators = [(e, w/total) for e, w in self.evaluators]

    def evaluate(self, trace: Dict[str, Any], ctx: Optional[Any] = None) -> CompositeResult:
        """Run all evaluators and combine scores."""

        component_scores = {}
        weights_used = {}

        # Run each evaluator
        weighted_sum = 0.0
        total_weight = 0.0
        feedback_parts = []

        for evaluator, weight in self.evaluators:
            try:
                result = evaluator.evaluate(trace, ctx)
                component_scores[evaluator.name] = result
                weights_used[evaluator.name] = weight

                # Weight by both configured weight and confidence
                effective_weight = weight * result.confidence
                weighted_sum += result.score * effective_weight
                total_weight += effective_weight

                feedback_parts.append(f"{evaluator.name}: {result.score:.2f} ({result.feedback[:50]})")
            except Exception as e:
                # On error, skip this evaluator
                component_scores[evaluator.name] = EvalResult(
                    score=0.5, feedback=f"Error: {str(e)}", confidence=0.0
                )

        # Calculate base score
        if total_weight > 0:
            base_score = weighted_sum / total_weight
        else:
            base_score = 0.5  # Default neutral

        # Apply adjustments
        adjustment = 0.0
        for adj_fn in self.adjustments:
            try:
                adj = adj_fn(trace, component_scores)
                adjustment += adj
            except:
                pass

        # Final score, clamped to [0, 1]
        final_score = max(0.0, min(1.0, base_score + adjustment))

        return CompositeResult(
            final_score=final_score,
            feedback=" | ".join(feedback_parts),
            component_scores=component_scores,
            weights_used=weights_used,
        )

    def __call__(self, trace: Dict[str, Any], ctx: Optional[Any] = None) -> Tuple[float, str]:
        """Callable interface returning (score, feedback)."""
        result = self.evaluate(trace, ctx)
        return (result.final_score, result.feedback)
```

---

## Task 3: Deterministic Evaluators

**Files:**
- Create: `notebooks/iofold_eval_core/scoring/evaluators/deterministic.py`

### Step 1: Implement deterministic evaluators

```python
# notebooks/iofold_eval_core/scoring/evaluators/deterministic.py
"""Deterministic evaluators that don't require LLM calls."""

import re
import json
from difflib import SequenceMatcher
from typing import Any, Dict, Optional

from ..base import BaseEvaluator, EvalResult


class ErrorCheckEvaluator(BaseEvaluator):
    """Check for execution errors."""

    name = "error_check"
    description = "Penalizes traces with execution errors"
    default_weight = 0.15

    def evaluate(self, trace: Dict[str, Any], ctx: Optional[Any] = None) -> EvalResult:
        has_errors = trace.get('has_errors', False)

        if has_errors:
            return EvalResult(
                score=0.1,
                feedback="Execution errors detected",
                confidence=0.95,
            )
        return EvalResult(
            score=0.9,
            feedback="No execution errors",
            confidence=0.9,
        )


class StepCountEvaluator(BaseEvaluator):
    """Evaluate based on step count (too many = stuck, too few = incomplete)."""

    name = "step_count"
    description = "Penalizes excessive or insufficient steps"
    default_weight = 0.1

    def evaluate(self, trace: Dict[str, Any], ctx: Optional[Any] = None) -> EvalResult:
        step_count = trace.get('step_count', 0)

        if step_count == 0:
            return EvalResult(score=0.2, feedback="No steps taken", confidence=0.8)
        elif step_count > 15:
            return EvalResult(score=0.2, feedback=f"Excessive steps ({step_count})", confidence=0.8)
        elif step_count > 10:
            return EvalResult(score=0.5, feedback=f"Many steps ({step_count})", confidence=0.7)
        elif step_count <= 3:
            return EvalResult(score=0.8, feedback=f"Efficient ({step_count} steps)", confidence=0.7)
        else:
            return EvalResult(score=0.7, feedback=f"Normal step count ({step_count})", confidence=0.6)


class AnswerCompletenessEvaluator(BaseEvaluator):
    """Check if answer appears complete vs truncated/empty."""

    name = "answer_completeness"
    description = "Checks if answer is complete and not empty"
    default_weight = 0.15

    def evaluate(self, trace: Dict[str, Any], ctx: Optional[Any] = None) -> EvalResult:
        output = trace.get('output_preview', '') or ''

        if not output.strip():
            return EvalResult(score=0.0, feedback="Empty answer", confidence=0.95)

        if len(output) < 10:
            return EvalResult(score=0.2, feedback="Very short answer", confidence=0.8)

        # Check for truncation markers
        if output.rstrip().endswith('...') or output.rstrip().endswith('…'):
            return EvalResult(score=0.5, feedback="Possibly truncated", confidence=0.6)

        # Check for complete sentences
        if output.rstrip()[-1] in '.!?)"':
            return EvalResult(score=0.85, feedback="Appears complete", confidence=0.7)

        return EvalResult(score=0.7, feedback="Answer present", confidence=0.6)


class ToolUsageEvaluator(BaseEvaluator):
    """Evaluate tool usage patterns."""

    name = "tool_usage"
    description = "Checks for appropriate tool usage"
    default_weight = 0.15

    def evaluate(self, trace: Dict[str, Any], ctx: Optional[Any] = None) -> EvalResult:
        steps = trace.get('steps', [])

        tool_calls = []
        for step in steps:
            for tc in step.get('tool_calls', []):
                tool_calls.append(tc)

        if not tool_calls:
            return EvalResult(score=0.3, feedback="No tools used", confidence=0.6)

        # Check for errors in tool calls
        error_count = 0
        success_count = 0
        for tc in tool_calls:
            status = tc.get('result', {}).get('kwargs', {}).get('status', '')
            if status == 'error':
                error_count += 1
            elif status == 'success':
                success_count += 1

        total = error_count + success_count
        if total == 0:
            return EvalResult(score=0.5, feedback="Unknown tool status", confidence=0.4)

        success_rate = success_count / total

        if success_rate >= 0.8:
            return EvalResult(score=0.85, feedback=f"Good tool usage ({success_count}/{total} success)", confidence=0.8)
        elif success_rate >= 0.5:
            return EvalResult(score=0.6, feedback=f"Mixed tool results ({success_count}/{total} success)", confidence=0.7)
        else:
            return EvalResult(score=0.3, feedback=f"Many tool errors ({error_count}/{total} failed)", confidence=0.8)


class KeywordMatchEvaluator(BaseEvaluator):
    """Check keyword overlap between question and answer."""

    name = "keyword_match"
    description = "Checks if answer addresses the question"
    default_weight = 0.1

    def _extract_keywords(self, text: str) -> set:
        stop_words = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'what', 'when',
                      'where', 'who', 'how', 'any', 'for', 'in', 'on', 'at', 'to',
                      'email', 'emails', 'inbox', 'my', 'your', 'find', 'search',
                      'please', 'can', 'you', 'help', 'me', 'with', 'this', 'that'}
        words = re.findall(r'\b[a-zA-Z]{3,}\b', text.lower())
        return set(w for w in words if w not in stop_words)

    def evaluate(self, trace: Dict[str, Any], ctx: Optional[Any] = None) -> EvalResult:
        question = trace.get('input_preview', '') or ''
        answer = trace.get('output_preview', '') or ''

        q_keywords = self._extract_keywords(question)
        a_keywords = self._extract_keywords(answer)

        if not q_keywords:
            return EvalResult(score=0.5, feedback="No question keywords", confidence=0.3)

        overlap = len(q_keywords & a_keywords)
        overlap_ratio = overlap / len(q_keywords)

        if overlap_ratio >= 0.5:
            return EvalResult(score=0.8, feedback=f"Good keyword overlap ({overlap_ratio:.0%})", confidence=0.7)
        elif overlap_ratio >= 0.2:
            return EvalResult(score=0.6, feedback=f"Some keyword overlap ({overlap_ratio:.0%})", confidence=0.6)
        else:
            return EvalResult(score=0.4, feedback=f"Low keyword overlap ({overlap_ratio:.0%})", confidence=0.5)


class NegationPatternEvaluator(BaseEvaluator):
    """Detect and evaluate negation patterns (not found, no results)."""

    name = "negation_pattern"
    description = "Evaluates 'not found' type answers appropriately"
    default_weight = 0.1

    def evaluate(self, trace: Dict[str, Any], ctx: Optional[Any] = None) -> EvalResult:
        answer = trace.get('output_preview', '') or ''

        # Negation patterns
        negation_patterns = [
            r'not found', r'no (email|result|data|match)',
            r"couldn't find", r'unable to (find|locate)',
            r'no .* (found|available|exist)',
        ]

        has_negation = any(re.search(p, answer, re.I) for p in negation_patterns)

        if not has_negation:
            # No negation - neutral, depends on other factors
            return EvalResult(score=0.5, feedback="No negation pattern", confidence=0.3)

        # Check if tool results support the negation
        steps = trace.get('steps', [])
        empty_results = True

        for step in steps:
            for tc in step.get('tool_calls', []):
                content = tc.get('result', {}).get('kwargs', {}).get('content', '')
                try:
                    data = json.loads(content) if content else {}
                    if data.get('total', 0) > 0 or data.get('emails', []):
                        empty_results = False
                        break
                except:
                    if content and 'email' in content.lower():
                        empty_results = False

        if has_negation and empty_results:
            # Correct: says not found when results are empty
            return EvalResult(score=0.85, feedback="Correct 'not found' response", confidence=0.8)
        elif has_negation and not empty_results:
            # Suspicious: says not found but there were results
            return EvalResult(score=0.3, feedback="Says 'not found' but tool had results", confidence=0.7)

        return EvalResult(score=0.5, feedback="Negation pattern detected", confidence=0.5)
```

---

## Task 4: LLM-as-Judge Evaluator

**Files:**
- Create: `notebooks/iofold_eval_core/scoring/evaluators/llm_judge.py`

### Step 1: Implement LLM judge with structured output

```python
# notebooks/iofold_eval_core/scoring/evaluators/llm_judge.py
"""LLM-as-Judge evaluator using structured outputs."""

from typing import Any, Dict, Optional

from ..base import BaseEvaluator, EvalResult
from ...llm import StructuredLLMClient, EvalScore
from ...generation.trace_formatter import format_trace_for_llm


LLM_JUDGE_PROMPT = """Evaluate the quality of this AI agent's response to an email search task.

{formatted_trace}

Score the response from 0.0 to 1.0 where:
- 0.0-0.33: Bad response (wrong info, hallucinated, unhelpful)
- 0.33-0.66: Acceptable but flawed (partially correct, incomplete)
- 0.67-1.0: Good response (correct, helpful, well-grounded)

Consider:
1. Did the agent answer the user's question?
2. Is the information accurate based on tool results?
3. Is the answer clear and helpful?

Provide your score and brief reasoning.
"""


class LLMJudgeEvaluator(BaseEvaluator):
    """Use an LLM to judge trace quality."""

    name = "llm_judge"
    description = "LLM-based quality assessment"
    default_weight = 0.3

    def __init__(self, model: str = "gemini-2.5-flash"):
        self.client = StructuredLLMClient(model=model)

    def evaluate(self, trace: Dict[str, Any], ctx: Optional[Any] = None) -> EvalResult:
        # Format trace for LLM
        formatted = format_trace_for_llm(
            trace,
            rating="unknown",  # We're predicting this
            rating_detail=None,
        )

        prompt = LLM_JUDGE_PROMPT.format(formatted_trace=formatted)

        try:
            result = self.client.generate(prompt, EvalScore, max_tokens=512)

            return EvalResult(
                score=result.score,
                feedback=result.reasoning,
                confidence=result.confidence,
            )
        except Exception as e:
            return EvalResult(
                score=0.5,
                feedback=f"LLM error: {str(e)[:50]}",
                confidence=0.1,
            )
```

---

## Task 5: Grounding Evaluator

**Files:**
- Create: `notebooks/iofold_eval_core/scoring/evaluators/grounding.py`

### Step 1: Implement grounding check with structured output

```python
# notebooks/iofold_eval_core/scoring/evaluators/grounding.py
"""Grounding evaluator - checks if answer is supported by tool results."""

import json
import re
from typing import Any, Dict, List, Optional

from ..base import BaseEvaluator, EvalResult
from ...llm import StructuredLLMClient, GroundingAnalysis


GROUNDING_PROMPT = """Analyze if this agent answer is grounded in the tool results.

QUESTION: {question}

TOOL RESULTS:
{tool_results}

AGENT ANSWER: {answer}

Assess:
1. Does the answer have support from tool results? (has_tool_support)
2. How specific are the claims? (specificity_level: none/low/medium/high)
3. What's the risk the answer contains hallucinated info? (hallucination_risk: 0-1)
4. Overall, how well grounded is the answer? (grounding_score: 0-1)

A good answer either:
- Correctly summarizes tool results, OR
- Correctly says "not found" when tools returned empty
"""


class GroundingEvaluator(BaseEvaluator):
    """Check if answer is grounded in tool results."""

    name = "grounding"
    description = "Checks if answer is supported by tool results"
    default_weight = 0.25

    def __init__(self, model: str = "gemini-2.5-flash", use_llm: bool = True):
        self.use_llm = use_llm
        if use_llm:
            self.client = StructuredLLMClient(model=model)

    def _extract_tool_results_summary(self, trace: Dict[str, Any]) -> str:
        """Extract tool results for analysis."""
        summaries = []
        for step in trace.get('steps', []):
            for tc in step.get('tool_calls', []):
                tool_name = tc.get('tool_name', 'unknown')
                result = tc.get('result', {}).get('kwargs', {})
                status = result.get('status', 'unknown')
                content = result.get('content', '')

                # Parse and summarize
                try:
                    data = json.loads(content) if content else {}
                    total = data.get('total', 0)
                    summaries.append(f"- {tool_name}: {status}, found {total} results")
                except:
                    summaries.append(f"- {tool_name}: {status}")

        return '\n'.join(summaries) if summaries else "(no tool calls)"

    def _deterministic_grounding_check(self, trace: Dict[str, Any]) -> EvalResult:
        """Fast deterministic grounding check."""
        answer = trace.get('output_preview', '') or ''

        # Extract tool results
        has_results = False
        for step in trace.get('steps', []):
            for tc in step.get('tool_calls', []):
                content = tc.get('result', {}).get('kwargs', {}).get('content', '')
                try:
                    data = json.loads(content) if content else {}
                    if data.get('total', 0) > 0:
                        has_results = True
                        break
                except:
                    pass

        # Check answer patterns
        says_not_found = bool(re.search(r'not found|no (email|result)|couldn\'t find', answer, re.I))
        has_specific_claims = bool(re.search(r'\d{1,2}[:/]\d{2}|\d{1,2}(st|nd|rd|th)|january|february|march|april|may|june|july|august|september|october|november|december', answer, re.I))

        if has_results and not says_not_found:
            return EvalResult(score=0.75, feedback="Has results and gives answer", confidence=0.6)
        elif not has_results and says_not_found:
            return EvalResult(score=0.85, feedback="No results and correctly says not found", confidence=0.8)
        elif not has_results and has_specific_claims:
            return EvalResult(score=0.2, feedback="No results but makes specific claims - possible hallucination", confidence=0.7)
        elif has_results and says_not_found:
            return EvalResult(score=0.3, feedback="Has results but says not found", confidence=0.7)
        else:
            return EvalResult(score=0.5, feedback="Grounding unclear", confidence=0.4)

    def evaluate(self, trace: Dict[str, Any], ctx: Optional[Any] = None) -> EvalResult:
        # Fast path: deterministic check
        if not self.use_llm:
            return self._deterministic_grounding_check(trace)

        # Slow path: LLM analysis
        question = trace.get('input_preview', '')
        answer = trace.get('output_preview', '')
        tool_results = self._extract_tool_results_summary(trace)

        prompt = GROUNDING_PROMPT.format(
            question=question,
            tool_results=tool_results,
            answer=answer,
        )

        try:
            result = self.client.generate(prompt, GroundingAnalysis, max_tokens=512)

            return EvalResult(
                score=result.grounding_score,
                feedback=result.explanation,
                confidence=0.8 if not result.hallucination_risk else 0.6,
                metadata={
                    "has_tool_support": result.has_tool_support,
                    "specificity": result.specificity_level,
                    "hallucination_risk": result.hallucination_risk,
                }
            )
        except Exception as e:
            # Fallback to deterministic
            return self._deterministic_grounding_check(trace)
```

---

## Task 6: Updated Experiment Framework

**Files:**
- Create: `notebooks/iofold_eval_core/scoring/metrics.py`
- Modify: `notebooks/experiments/eval_reward_functions/experiment_base.py`

### Step 1: Create metrics for continuous scoring

```python
# notebooks/iofold_eval_core/scoring/metrics.py
"""Metrics for evaluating continuous reward functions."""

import numpy as np
from typing import List, Dict, Any, Tuple
from dataclasses import dataclass

# Score thresholds for 3-class classification
NEGATIVE_THRESHOLD = 0.33
POSITIVE_THRESHOLD = 0.67

# Target scores for each rating
RATING_TARGETS = {
    'negative': 0.17,  # Middle of 0-0.33
    'neutral': 0.50,   # Middle of 0.33-0.67
    'positive': 0.83,  # Middle of 0.67-1.0
}

def rating_to_target(rating: str) -> float:
    """Convert rating string to target score."""
    return RATING_TARGETS.get(rating, 0.5)

def score_to_rating(score: float) -> str:
    """Convert continuous score to rating."""
    if score < NEGATIVE_THRESHOLD:
        return 'negative'
    elif score >= POSITIVE_THRESHOLD:
        return 'positive'
    else:
        return 'neutral'

@dataclass
class ContinuousMetrics:
    """Metrics for continuous scoring."""
    # Regression metrics
    mae: float  # Mean Absolute Error
    mse: float  # Mean Squared Error
    rmse: float  # Root Mean Squared Error
    correlation: float  # Pearson correlation

    # Classification metrics (using thresholds)
    accuracy_3class: float
    accuracy_binary: float  # positive vs not-positive

    # Per-class metrics
    precision_positive: float
    recall_positive: float
    precision_negative: float
    recall_negative: float

    # Calibration
    mean_predicted: float
    mean_actual: float

    n_samples: int

def compute_continuous_metrics(
    predictions: List[float],
    targets: List[float],  # 0.17, 0.5, or 0.83
    ratings: List[str],    # 'positive', 'neutral', 'negative'
) -> ContinuousMetrics:
    """Compute comprehensive metrics for continuous predictions."""

    predictions = np.array(predictions)
    targets = np.array(targets)
    n = len(predictions)

    # Regression metrics
    errors = predictions - targets
    mae = np.mean(np.abs(errors))
    mse = np.mean(errors ** 2)
    rmse = np.sqrt(mse)

    # Correlation
    if np.std(predictions) > 0 and np.std(targets) > 0:
        correlation = np.corrcoef(predictions, targets)[0, 1]
    else:
        correlation = 0.0

    # Classification metrics
    pred_ratings = [score_to_rating(p) for p in predictions]

    # 3-class accuracy
    correct_3class = sum(1 for pr, ar in zip(pred_ratings, ratings) if pr == ar)
    accuracy_3class = correct_3class / n if n > 0 else 0

    # Binary accuracy (positive vs not)
    pred_positive = [1 if p >= POSITIVE_THRESHOLD else 0 for p in predictions]
    actual_positive = [1 if r == 'positive' else 0 for r in ratings]
    correct_binary = sum(1 for pp, ap in zip(pred_positive, actual_positive) if pp == ap)
    accuracy_binary = correct_binary / n if n > 0 else 0

    # Per-class precision/recall
    tp_pos = sum(1 for pr, ar in zip(pred_ratings, ratings) if pr == 'positive' and ar == 'positive')
    fp_pos = sum(1 for pr, ar in zip(pred_ratings, ratings) if pr == 'positive' and ar != 'positive')
    fn_pos = sum(1 for pr, ar in zip(pred_ratings, ratings) if pr != 'positive' and ar == 'positive')

    tp_neg = sum(1 for pr, ar in zip(pred_ratings, ratings) if pr == 'negative' and ar == 'negative')
    fp_neg = sum(1 for pr, ar in zip(pred_ratings, ratings) if pr == 'negative' and ar != 'negative')
    fn_neg = sum(1 for pr, ar in zip(pred_ratings, ratings) if pr != 'negative' and ar == 'negative')

    precision_positive = tp_pos / (tp_pos + fp_pos) if (tp_pos + fp_pos) > 0 else 0
    recall_positive = tp_pos / (tp_pos + fn_pos) if (tp_pos + fn_pos) > 0 else 0
    precision_negative = tp_neg / (tp_neg + fp_neg) if (tp_neg + fp_neg) > 0 else 0
    recall_negative = tp_neg / (tp_neg + fn_neg) if (tp_neg + fn_neg) > 0 else 0

    return ContinuousMetrics(
        mae=mae,
        mse=mse,
        rmse=rmse,
        correlation=correlation,
        accuracy_3class=accuracy_3class,
        accuracy_binary=accuracy_binary,
        precision_positive=precision_positive,
        recall_positive=recall_positive,
        precision_negative=precision_negative,
        recall_negative=recall_negative,
        mean_predicted=np.mean(predictions),
        mean_actual=np.mean(targets),
        n_samples=n,
    )
```

---

## Task 7: Build Default Composite Scorer

**Files:**
- Create: `notebooks/iofold_eval_core/scoring/presets.py`

### Step 1: Create preset configurations

```python
# notebooks/iofold_eval_core/scoring/presets.py
"""Preset composite scorer configurations."""

from .composite import CompositeScorer
from .evaluators.deterministic import (
    ErrorCheckEvaluator,
    StepCountEvaluator,
    AnswerCompletenessEvaluator,
    ToolUsageEvaluator,
    KeywordMatchEvaluator,
    NegationPatternEvaluator,
)
from .evaluators.llm_judge import LLMJudgeEvaluator
from .evaluators.grounding import GroundingEvaluator


def create_fast_scorer() -> CompositeScorer:
    """Fast scorer using only deterministic evaluators."""
    scorer = CompositeScorer()

    scorer.add_evaluator(ErrorCheckEvaluator(), weight=0.20)
    scorer.add_evaluator(StepCountEvaluator(), weight=0.10)
    scorer.add_evaluator(AnswerCompletenessEvaluator(), weight=0.15)
    scorer.add_evaluator(ToolUsageEvaluator(), weight=0.20)
    scorer.add_evaluator(KeywordMatchEvaluator(), weight=0.15)
    scorer.add_evaluator(NegationPatternEvaluator(), weight=0.10)
    scorer.add_evaluator(GroundingEvaluator(use_llm=False), weight=0.10)

    return scorer


def create_balanced_scorer(model: str = "gemini-2.5-flash") -> CompositeScorer:
    """Balanced scorer with deterministic + LLM evaluators."""
    scorer = CompositeScorer()

    # Deterministic (fast, reliable)
    scorer.add_evaluator(ErrorCheckEvaluator(), weight=0.15)
    scorer.add_evaluator(AnswerCompletenessEvaluator(), weight=0.10)
    scorer.add_evaluator(ToolUsageEvaluator(), weight=0.15)
    scorer.add_evaluator(NegationPatternEvaluator(), weight=0.10)

    # LLM-based (slower, more nuanced)
    scorer.add_evaluator(LLMJudgeEvaluator(model=model), weight=0.30)
    scorer.add_evaluator(GroundingEvaluator(model=model, use_llm=True), weight=0.20)

    return scorer


def create_full_scorer(model: str = "gemini-2.5-flash") -> CompositeScorer:
    """Full scorer with all evaluators."""
    scorer = CompositeScorer()

    # Deterministic
    scorer.add_evaluator(ErrorCheckEvaluator(), weight=0.10)
    scorer.add_evaluator(StepCountEvaluator(), weight=0.05)
    scorer.add_evaluator(AnswerCompletenessEvaluator(), weight=0.10)
    scorer.add_evaluator(ToolUsageEvaluator(), weight=0.10)
    scorer.add_evaluator(KeywordMatchEvaluator(), weight=0.05)
    scorer.add_evaluator(NegationPatternEvaluator(), weight=0.10)

    # LLM-based
    scorer.add_evaluator(LLMJudgeEvaluator(model=model), weight=0.25)
    scorer.add_evaluator(GroundingEvaluator(model=model, use_llm=True), weight=0.25)

    return scorer
```

---

## Task 8: New Experiment - Composite Scorer Evaluation

**Files:**
- Create: `notebooks/experiments/eval_reward_functions/exp_composite.py`

### Step 1: Implement composite scorer experiment

```python
#!/usr/bin/env python3
"""
Composite Reward Function Experiment

Evaluates the composite scoring approach with:
- Multiple deterministic evaluators
- LLM-as-judge
- Grounding checks
- Weighted combination

Metrics: MAE, Correlation, 3-class accuracy
"""

import sys
from pathlib import Path
from datetime import datetime
from typing import List

NOTEBOOKS_DIR = Path(__file__).parent.parent.parent
sys.path.insert(0, str(NOTEBOOKS_DIR))

from dotenv import load_dotenv
PROJECT_ROOT = NOTEBOOKS_DIR.parent
load_dotenv(PROJECT_ROOT / ".env")

from experiments.eval_reward_functions.experiment_base import (
    ExperimentRunner,
    ExperimentResult,
    LabeledTrace,
)
from experiments.eval_reward_functions.config import JOB_ID
from iofold_eval_core.scoring.presets import (
    create_fast_scorer,
    create_balanced_scorer,
    create_full_scorer,
)
from iofold_eval_core.scoring.metrics import (
    compute_continuous_metrics,
    rating_to_target,
    ContinuousMetrics,
)


class CompositeExperiment(ExperimentRunner):
    """Experiment evaluating composite reward functions."""

    def __init__(self, scorer_type: str = "balanced", model: str = "gemini-2.5-flash"):
        super().__init__(
            experiment_id=f"exp-composite-{scorer_type}",
            experiment_name=f"Composite Scorer ({scorer_type})",
            model=model,
            job_id=JOB_ID,
        )
        self.scorer_type = scorer_type

        if scorer_type == "fast":
            self.scorer = create_fast_scorer()
        elif scorer_type == "balanced":
            self.scorer = create_balanced_scorer(model)
        else:
            self.scorer = create_full_scorer(model)

    def _create_eval_function(self):
        return self.scorer

    def run(self) -> ExperimentResult:
        start_time = datetime.now()
        self._log("=" * 60)
        self._log(f"Composite Scorer Experiment: {self.scorer_type}")
        self._log("=" * 60)

        train, val, test = self._split_traces()
        self._log(f"Train: {len(train)}, Val: {len(val)}, Test: {len(test)}")

        # Evaluate on validation
        self._log("\nEvaluating on validation set...")
        val_preds, val_targets, val_ratings = self._evaluate_traces(val)
        val_metrics = compute_continuous_metrics(val_preds, val_targets, val_ratings)
        self._log_metrics("Validation", val_metrics)

        # Evaluate on test
        self._log("\nEvaluating on test set...")
        test_preds, test_targets, test_ratings = self._evaluate_traces(test)
        test_metrics = compute_continuous_metrics(test_preds, test_targets, test_ratings)
        self._log_metrics("Test", test_metrics)

        end_time = datetime.now()

        return ExperimentResult(
            experiment_id=self.experiment_id,
            experiment_name=self.experiment_name,
            model=self.model,
            started_at=start_time.isoformat(),
            completed_at=end_time.isoformat(),
            duration_seconds=(end_time - start_time).total_seconds(),
            validation_metrics=self._metrics_to_dict(val_metrics),
            test_metrics=self._metrics_to_dict(test_metrics),
            config={
                "scorer_type": self.scorer_type,
                "evaluators": [e.name for e, _ in self.scorer.evaluators],
            },
        )

    def _evaluate_traces(self, traces: List[LabeledTrace]):
        predictions = []
        targets = []
        ratings = []

        for i, trace in enumerate(traces):
            if i % 50 == 0:
                self._log(f"  Processing {i}/{len(traces)}...")

            trace_dict = trace.to_dict()
            try:
                score, _ = self.scorer(trace_dict, None)
            except Exception as e:
                score = 0.5

            predictions.append(score)
            targets.append(rating_to_target(trace.rating))
            ratings.append(trace.rating)

        return predictions, targets, ratings

    def _log_metrics(self, split: str, m: ContinuousMetrics):
        self._log(f"\n{split} Metrics:")
        self._log(f"  MAE: {m.mae:.4f}")
        self._log(f"  Correlation: {m.correlation:.4f}")
        self._log(f"  3-Class Accuracy: {m.accuracy_3class:.1%}")
        self._log(f"  Binary Accuracy: {m.accuracy_binary:.1%}")
        self._log(f"  Positive P/R: {m.precision_positive:.2f}/{m.recall_positive:.2f}")
        self._log(f"  Negative P/R: {m.precision_negative:.2f}/{m.recall_negative:.2f}")

    def _metrics_to_dict(self, m: ContinuousMetrics) -> dict:
        return {
            "mae": m.mae,
            "correlation": m.correlation,
            "accuracy_3class": m.accuracy_3class,
            "accuracy_binary": m.accuracy_binary,
            "precision_positive": m.precision_positive,
            "recall_positive": m.recall_positive,
            "precision_negative": m.precision_negative,
            "recall_negative": m.recall_negative,
        }


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--type", choices=["fast", "balanced", "full"], default="balanced")
    parser.add_argument("--model", default="gemini-2.5-flash")
    parser.add_argument("--save", action="store_true")
    args = parser.parse_args()

    exp = CompositeExperiment(scorer_type=args.type, model=args.model)
    result = exp.run()

    if args.save:
        path = exp.save_result(result)
        print(f"Saved to: {path}")


if __name__ == "__main__":
    main()
```

---

## Task 9: Package Structure Updates

**Files:**
- Update: `notebooks/iofold_eval_core/__init__.py`
- Create: `notebooks/iofold_eval_core/scoring/__init__.py`
- Create: `notebooks/iofold_eval_core/scoring/evaluators/__init__.py`

### Step 1: Update package exports

```python
# notebooks/iofold_eval_core/scoring/__init__.py
from .base import BaseEvaluator, EvalResult
from .composite import CompositeScorer, CompositeResult
from .metrics import (
    compute_continuous_metrics,
    rating_to_target,
    score_to_rating,
    NEGATIVE_THRESHOLD,
    POSITIVE_THRESHOLD,
    ContinuousMetrics,
)
from .presets import (
    create_fast_scorer,
    create_balanced_scorer,
    create_full_scorer,
)

__all__ = [
    "BaseEvaluator",
    "EvalResult",
    "CompositeScorer",
    "CompositeResult",
    "compute_continuous_metrics",
    "rating_to_target",
    "score_to_rating",
    "ContinuousMetrics",
    "create_fast_scorer",
    "create_balanced_scorer",
    "create_full_scorer",
]
```

```python
# notebooks/iofold_eval_core/scoring/evaluators/__init__.py
from .deterministic import (
    ErrorCheckEvaluator,
    StepCountEvaluator,
    AnswerCompletenessEvaluator,
    ToolUsageEvaluator,
    KeywordMatchEvaluator,
    NegationPatternEvaluator,
)
from .llm_judge import LLMJudgeEvaluator
from .grounding import GroundingEvaluator

__all__ = [
    "ErrorCheckEvaluator",
    "StepCountEvaluator",
    "AnswerCompletenessEvaluator",
    "ToolUsageEvaluator",
    "KeywordMatchEvaluator",
    "NegationPatternEvaluator",
    "LLMJudgeEvaluator",
    "GroundingEvaluator",
]
```

---

## Execution Order

1. **Task 1**: Structured LLM Client (fixes JSON parsing properly)
2. **Task 2**: Composite Scorer Base
3. **Task 3**: Deterministic Evaluators
4. **Task 4**: LLM Judge Evaluator
5. **Task 5**: Grounding Evaluator
6. **Task 6**: Continuous Metrics
7. **Task 7**: Preset Configurations
8. **Task 8**: Composite Experiment
9. **Task 9**: Package Structure

## Success Criteria

- **MAE < 0.15** on test set (predictions within 0.15 of target)
- **Correlation > 0.6** between predictions and targets
- **3-Class Accuracy > 70%** (correctly classify pos/neu/neg)
- **Structured outputs work** - no JSON parsing failures
- **Fast scorer** < 50ms per trace (deterministic only)
- **Balanced scorer** < 2s per trace (with LLM calls)

## Key Improvements Over Previous Approach

1. **Continuous scores** instead of binary classification
2. **Proper 3-class handling** with appropriate thresholds
3. **Structured outputs** from LLMs - no JSON parsing hacks
4. **Modular evaluators** that can be mixed and matched
5. **Weighted combination** with confidence-adjusted weights
6. **Adjustment functions** for custom bonuses/penalties
7. **Better metrics** - MAE, correlation, per-class P/R
