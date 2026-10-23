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
