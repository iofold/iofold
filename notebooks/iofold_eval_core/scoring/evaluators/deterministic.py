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
