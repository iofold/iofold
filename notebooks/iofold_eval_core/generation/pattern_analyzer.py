"""
Pattern analyzer for identifying distinguishing patterns in labeled traces.

Uses LLM to analyze differences between positive and negative traces
to inform reward function generation.
"""

import json
import logging
import re
from typing import Any, Dict, List, Optional, Protocol, Union

from ..models import LabeledTrace
from .prompts import (
    PATTERN_ANALYSIS_PROMPT,
    PAIRWISE_COMPARISON_PROMPT,
    format_trace_for_prompt,
    format_labeled_trace,
)

logger = logging.getLogger(__name__)


class LLMClientProtocol(Protocol):
    """Protocol for LLM clients."""

    def generate(
        self, prompt: str, temperature: float = 0.3, max_tokens: int = 4096
    ) -> str:
        ...


def _parse_json_response(response: str) -> Dict[str, Any]:
    """
    Parse JSON from LLM response, handling markdown code blocks.

    Args:
        response: Raw LLM response text

    Returns:
        Parsed JSON dict

    Raises:
        json.JSONDecodeError: If response is not valid JSON
    """
    # Try to extract JSON from markdown code blocks
    code_block_patterns = [
        r"```json\s*([\s\S]*?)\s*```",
        r"```\s*([\s\S]*?)\s*```",
        r"\{[\s\S]*\}",
    ]

    for pattern in code_block_patterns:
        matches = re.findall(pattern, response, re.MULTILINE)
        if matches:
            # Try each match
            for match in matches:
                text = match.strip()
                # Ensure it looks like JSON
                if text.startswith("{") or text.startswith("["):
                    try:
                        return json.loads(text)
                    except json.JSONDecodeError:
                        continue

    # Try parsing the raw response
    return json.loads(response)


class PatternAnalyzer:
    """
    Analyze patterns in labeled traces.

    Uses LLM to identify distinguishing patterns between positive
    and negative traces, informing reward function generation.

    Example:
        >>> from iofold_eval_core.llm import create_llm_client
        >>> llm = create_llm_client()
        >>> analyzer = PatternAnalyzer(llm)
        >>> result = analyzer.analyze(positive_traces, negative_traces)
        >>> print(result['patterns'])
    """

    def __init__(self, llm_client: LLMClientProtocol):
        """
        Initialize PatternAnalyzer.

        Args:
            llm_client: LLM client implementing generate() method
        """
        self.llm = llm_client

    def analyze(
        self,
        positive_traces: List[Union[LabeledTrace, dict]],
        negative_traces: List[Union[LabeledTrace, dict]],
        max_examples: int = 5,
    ) -> Dict[str, Any]:
        """
        Analyze patterns distinguishing positive from negative traces.

        Args:
            positive_traces: List of traces with positive ratings (score >= 0.7)
            negative_traces: List of traces with negative ratings (score <= 0.3)
            max_examples: Maximum examples of each type to include in prompt

        Returns:
            Dict with keys:
            - patterns: List of distinguishing pattern descriptions
            - signals: List of quality signals identified
            - suggested_checks: List of suggested check functions

        Raises:
            ValueError: If no traces provided
        """
        if not positive_traces and not negative_traces:
            raise ValueError("At least one positive or negative trace required")

        # Format examples for prompt
        positive_examples = self._format_examples(positive_traces[:max_examples], "positive")
        negative_examples = self._format_examples(negative_traces[:max_examples], "negative")

        prompt = PATTERN_ANALYSIS_PROMPT.format(
            positive_examples=positive_examples or "No positive examples available.",
            negative_examples=negative_examples or "No negative examples available.",
        )

        logger.info(
            f"Analyzing patterns with {len(positive_traces)} positive, "
            f"{len(negative_traces)} negative traces"
        )

        try:
            response = self.llm.generate(prompt, temperature=0.3, max_tokens=2048)
            result = _parse_json_response(response)

            # Ensure expected keys exist
            return {
                "patterns": result.get("patterns", []),
                "signals": result.get("signals", []),
                "suggested_checks": result.get("suggested_checks", []),
            }

        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse pattern analysis JSON: {e}")
            return {
                "patterns": [],
                "signals": [],
                "suggested_checks": [],
                "raw_response": response if 'response' in dir() else None,
            }
        except Exception as e:
            logger.error(f"Pattern analysis failed: {e}")
            raise

    def compare_pair(
        self,
        trace_a: Union[LabeledTrace, dict],
        trace_b: Union[LabeledTrace, dict],
        score_a: Optional[float] = None,
        score_b: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Compare two traces to identify quality differences.

        Args:
            trace_a: First trace
            trace_b: Second trace
            score_a: Human score for trace_a (uses trace's score if LabeledTrace)
            score_b: Human score for trace_b (uses trace's score if LabeledTrace)

        Returns:
            Dict with keys:
            - winner: 'a', 'b', or 'tie'
            - key_differences: List of identified differences
            - suggested_checks: List of suggested check functions
            - reasoning: Explanation of comparison
        """
        # Extract traces and scores
        if isinstance(trace_a, LabeledTrace):
            trace_a_dict = trace_a.trace.to_dict() if hasattr(trace_a.trace, 'to_dict') else trace_a.trace
            score_a = score_a if score_a is not None else trace_a.human_score
        else:
            trace_a_dict = trace_a
            score_a = score_a if score_a is not None else 0.5

        if isinstance(trace_b, LabeledTrace):
            trace_b_dict = trace_b.trace.to_dict() if hasattr(trace_b.trace, 'to_dict') else trace_b.trace
            score_b = score_b if score_b is not None else trace_b.human_score
        else:
            trace_b_dict = trace_b
            score_b = score_b if score_b is not None else 0.5

        prompt = PAIRWISE_COMPARISON_PROMPT.format(
            trace_a=format_trace_for_prompt(trace_a_dict),
            trace_b=format_trace_for_prompt(trace_b_dict),
            score_a=f"{score_a:.2f}",
            score_b=f"{score_b:.2f}",
        )

        try:
            response = self.llm.generate(prompt, temperature=0.3, max_tokens=1024)
            result = _parse_json_response(response)

            return {
                "winner": result.get("winner", "tie"),
                "key_differences": result.get("key_differences", []),
                "suggested_checks": result.get("suggested_checks", []),
                "reasoning": result.get("reasoning", ""),
            }

        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse comparison JSON: {e}")
            return {
                "winner": "tie",
                "key_differences": [],
                "suggested_checks": [],
                "reasoning": "Failed to parse LLM response",
            }
        except Exception as e:
            logger.error(f"Pairwise comparison failed: {e}")
            raise

    def analyze_clusters(
        self,
        cluster_data: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Analyze trace clusters to identify themes and quality indicators.

        Args:
            cluster_data: List of dicts with 'cluster_id', 'traces', 'avg_score'

        Returns:
            Dict with cluster analysis results
        """
        from .prompts import CLUSTER_ANALYSIS_PROMPT

        # Format cluster data for prompt
        cluster_summaries = []
        for cluster in cluster_data:
            cluster_id = cluster.get("cluster_id", "unknown")
            traces = cluster.get("traces", [])
            avg_score = cluster.get("avg_score", 0.5)

            summary_lines = [
                f"### Cluster {cluster_id}",
                f"Size: {len(traces)} traces",
                f"Average score: {avg_score:.2f}",
                f"Sample traces:",
            ]

            for trace in traces[:3]:  # Show up to 3 sample traces
                trace_dict = trace.trace.to_dict() if hasattr(trace, 'trace') else trace
                summary_lines.append(format_trace_for_prompt(trace_dict, max_steps=3))

            cluster_summaries.append("\n".join(summary_lines))

        prompt = CLUSTER_ANALYSIS_PROMPT.format(
            cluster_data="\n\n".join(cluster_summaries)
        )

        try:
            response = self.llm.generate(prompt, temperature=0.3, max_tokens=2048)
            return _parse_json_response(response)
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse cluster analysis JSON: {e}")
            return {"clusters": []}
        except Exception as e:
            logger.error(f"Cluster analysis failed: {e}")
            raise

    def _format_examples(
        self,
        traces: List[Union[LabeledTrace, dict]],
        label: str,
    ) -> str:
        """Format traces as examples for prompts."""
        if not traces:
            return ""

        examples = []
        for i, trace in enumerate(traces, 1):
            if isinstance(trace, LabeledTrace):
                trace_dict = trace.trace.to_dict() if hasattr(trace.trace, 'to_dict') else trace.trace
                score = trace.human_score
            else:
                trace_dict = trace
                score = 1.0 if label == "positive" else 0.0

            examples.append(f"### Example {i}")
            examples.append(format_labeled_trace(trace_dict, score))
            examples.append("")

        return "\n".join(examples)
