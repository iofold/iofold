# notebooks/iofold_eval_core/scoring/evaluators/llm_judge.py
"""LLM-as-Judge evaluator using structured outputs."""

from typing import Any, Dict, Optional

from ..base import BaseEvaluator, EvalResult
from ...llm import StructuredLLMClient, EvalScore
from ...generation.trace_formatter import format_trace_for_llm


LLM_JUDGE_PROMPT = """Evaluate the quality of this AI agent's response to an email search task.

{formatted_trace}
{expected_output_section}

Score the response from 0.0 to 1.0 where:
- 0.0-0.33: Bad response (wrong info, doesn't match expected, hallucinated)
- 0.33-0.66: Acceptable but flawed (partially matches expected, incomplete)
- 0.67-1.0: Good response (matches expected output, correct, helpful)

IMPORTANT: If an EXPECTED OUTPUT is provided, compare the agent's answer against it.
The answer should convey the same information as the expected output to score highly.

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

        # Extract expected output from metadata if available
        expected_output = None
        metadata = trace.get('metadata', {})
        if isinstance(metadata, dict):
            expected_output = metadata.get('expectedOutput')

        expected_output_section = ""
        if expected_output:
            expected_output_section = f"\n\nEXPECTED OUTPUT (ground truth):\n{expected_output}"

        prompt = LLM_JUDGE_PROMPT.format(
            formatted_trace=formatted,
            expected_output_section=expected_output_section
        )

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
