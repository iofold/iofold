"""
Candidate generator for creating eval/reward function candidates.

Uses LLM to generate diverse reward function candidates based on
training data analysis, clustering insights, and previous attempts.
"""

import json
import logging
import re
from typing import Any, Dict, List, Optional, Protocol

from .prompts import (
    GENERATION_PROMPT,
    REFINEMENT_PROMPT,
    ERROR_ANALYSIS_PROMPT,
    format_candidates_for_prompt,
)

logger = logging.getLogger(__name__)


class LLMClientProtocol(Protocol):
    """Protocol for LLM clients."""

    def generate(
        self, prompt: str, temperature: float = 0.3, max_tokens: int = 4096
    ) -> str:
        ...


def _parse_jsonl_response(response: str) -> List[Dict[str, Any]]:
    """
    Parse JSON Lines (one JSON object per line) from LLM response.

    Handles:
    - Multiple JSON objects on separate lines
    - JSON objects within markdown code blocks
    - Array of JSON objects

    Args:
        response: Raw LLM response text

    Returns:
        List of parsed JSON dicts
    """
    results = []

    # First, try to extract from code blocks
    code_block_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", response)
    if code_block_match:
        response = code_block_match.group(1)

    # Try parsing as a JSON array first
    try:
        parsed = json.loads(response)
        if isinstance(parsed, list):
            return parsed
        elif isinstance(parsed, dict):
            return [parsed]
    except json.JSONDecodeError:
        pass

    # Parse line by line
    for line in response.split("\n"):
        line = line.strip()
        if not line or not (line.startswith("{") or line.startswith("[")):
            continue

        try:
            obj = json.loads(line)
            if isinstance(obj, list):
                results.extend(obj)
            else:
                results.append(obj)
        except json.JSONDecodeError:
            # Try to find JSON objects in the line
            json_matches = re.findall(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", line)
            for match in json_matches:
                try:
                    results.append(json.loads(match))
                except json.JSONDecodeError:
                    continue

    return results


def _extract_code_from_candidate(candidate: Dict[str, Any]) -> str:
    """
    Extract code from a candidate dict, handling nested code blocks.

    Args:
        candidate: Dict with 'code' key

    Returns:
        Clean Python code string
    """
    code = candidate.get("code", "")

    # Remove markdown code block if present
    code_block_match = re.search(r"```(?:python)?\s*([\s\S]*?)\s*```", code)
    if code_block_match:
        code = code_block_match.group(1)

    # Unescape common escape sequences
    code = code.replace("\\n", "\n")
    code = code.replace("\\t", "\t")
    code = code.replace('\\"', '"')
    code = code.replace("\\'", "'")

    return code.strip()


class CandidateGenerator:
    """
    Generate eval function candidates.

    Uses LLM to generate diverse reward function candidates based on
    training data insights and previous attempts.

    Example:
        >>> from iofold_eval_core.llm import create_llm_client
        >>> llm = create_llm_client()
        >>> generator = CandidateGenerator(llm)
        >>> candidates = generator.generate(
        ...     training_summary="Dataset of email classification traces...",
        ...     num_candidates=5,
        ... )
        >>> for c in candidates:
        ...     print(c['strategy'])
    """

    def __init__(self, llm_client: LLMClientProtocol):
        """
        Initialize CandidateGenerator.

        Args:
            llm_client: LLM client implementing generate() method
        """
        self.llm = llm_client

    def generate(
        self,
        training_summary: str,
        cluster_analysis: str = "",
        comparison_insights: str = "",
        previous_attempts: str = "",
        num_candidates: int = 5,
        temperature: float = 0.7,
    ) -> List[Dict[str, Any]]:
        """
        Generate candidate eval functions.

        Args:
            training_summary: Summary of training data characteristics
            cluster_analysis: Optional cluster analysis results
            comparison_insights: Optional pairwise comparison insights
            previous_attempts: Optional formatted previous attempts
            num_candidates: Number of candidates to generate
            temperature: LLM temperature (higher = more diverse)

        Returns:
            List of dicts with keys:
            - code: Python code string
            - strategy: Strategy description
            - reasoning: Reasoning for approach

        Raises:
            ValueError: If training_summary is empty
        """
        if not training_summary.strip():
            raise ValueError("training_summary is required")

        prompt = GENERATION_PROMPT.format(
            training_summary=training_summary,
            cluster_analysis=cluster_analysis or "No cluster analysis available.",
            comparison_insights=comparison_insights or "No comparison insights available.",
            previous_attempts=previous_attempts or "No previous attempts.",
            num_candidates=num_candidates,
        )

        logger.info(f"Generating {num_candidates} reward function candidates")

        try:
            response = self.llm.generate(
                prompt,
                temperature=temperature,
                max_tokens=8192,  # Increased from 4096 for full code generation
            )

            logger.debug(f"Raw LLM response (first 2000 chars): {response[:2000]}")
            candidates = _parse_jsonl_response(response)
            logger.debug(f"Parsed {len(candidates)} candidate objects from response")

            # Clean up and validate candidates
            valid_candidates = []
            for i, candidate in enumerate(candidates):
                if not isinstance(candidate, dict):
                    logger.debug(f"Candidate {i}: not a dict, skipping")
                    continue

                code = _extract_code_from_candidate(candidate)
                if not code:
                    logger.debug(f"Candidate {i}: no code extracted")
                    continue

                # Validate code has required function signature
                if not self._validate_code_signature(code):
                    logger.debug(f"Candidate {i}: invalid signature, attempting fix. Code preview: {code[:200]}")
                    code = self._fix_code_signature(code)
                    if not self._validate_code_signature(code):
                        logger.debug(f"Candidate {i}: signature fix failed")
                        continue

                valid_candidates.append({
                    "code": code,
                    "strategy": candidate.get("strategy", "unknown"),
                    "reasoning": candidate.get("reasoning", ""),
                })

            logger.info(f"Generated {len(valid_candidates)} valid candidates")
            return valid_candidates

        except Exception as e:
            logger.error(f"Candidate generation failed: {e}")
            raise

    def refine(
        self,
        original_candidate: Dict[str, Any],
        analysis: str,
        misclassified: str,
    ) -> Dict[str, Any]:
        """
        Refine an existing candidate based on error analysis.

        Args:
            original_candidate: Dict with code, strategy, reasoning
            analysis: Analysis of why the candidate failed
            misclassified: Examples of misclassified traces

        Returns:
            Refined candidate dict with code, strategy, changes_made
        """
        prompt = REFINEMENT_PROMPT.format(
            original_code=original_candidate.get("code", ""),
            original_strategy=original_candidate.get("strategy", ""),
            analysis=analysis,
            misclassified=misclassified,
        )

        try:
            response = self.llm.generate(prompt, temperature=0.5, max_tokens=2048)
            candidates = _parse_jsonl_response(response)

            if candidates:
                candidate = candidates[0]
                code = _extract_code_from_candidate(candidate)
                return {
                    "code": code,
                    "strategy": candidate.get("strategy", original_candidate.get("strategy", "")),
                    "changes_made": candidate.get("changes_made", []),
                }

            logger.warning("No refined candidate parsed from response")
            return original_candidate

        except Exception as e:
            logger.error(f"Candidate refinement failed: {e}")
            raise

    def analyze_errors(
        self,
        candidate: Dict[str, Any],
        test_results: Dict[str, Any],
        misclassified_traces: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Analyze why a candidate performed poorly.

        Args:
            candidate: Dict with code, strategy
            test_results: Dict with accuracy, pearson_r, kappa
            misclassified_traces: List of misclassified trace examples

        Returns:
            Analysis dict with failure_reasons, missed_cases, improvement_suggestions
        """
        # Format misclassified examples
        misclassified_str = ""
        for i, trace in enumerate(misclassified_traces[:5], 1):
            human_score = trace.get("human_score", 0.5)
            predicted_score = trace.get("predicted_score", 0.5)
            trace_data = trace.get("trace", trace)

            misclassified_str += f"\n### Example {i}\n"
            misclassified_str += f"Human Score: {human_score:.2f}, Predicted: {predicted_score:.2f}\n"
            misclassified_str += f"Trace ID: {trace_data.get('id', 'unknown')}\n"

        prompt = ERROR_ANALYSIS_PROMPT.format(
            code=candidate.get("code", ""),
            strategy=candidate.get("strategy", ""),
            accuracy=f"{test_results.get('accuracy', 0):.2%}",
            pearson_r=f"{test_results.get('pearson_r', 0):.3f}",
            kappa=f"{test_results.get('kappa', test_results.get('cohen_kappa', 0)):.3f}",
            misclassified=misclassified_str or "No examples available.",
        )

        try:
            response = self.llm.generate(prompt, temperature=0.3, max_tokens=1024)
            result = _parse_jsonl_response(response)

            if result:
                return result[0]

            return {
                "failure_reasons": [],
                "missed_cases": [],
                "improvement_suggestions": [],
            }

        except Exception as e:
            logger.error(f"Error analysis failed: {e}")
            return {
                "failure_reasons": [str(e)],
                "missed_cases": [],
                "improvement_suggestions": [],
            }

    def generate_from_patterns(
        self,
        patterns: List[str],
        signals: List[str],
        suggested_checks: List[str],
        num_candidates: int = 3,
    ) -> List[Dict[str, Any]]:
        """
        Generate candidates directly from pattern analysis results.

        Args:
            patterns: List of distinguishing patterns
            signals: List of quality signals
            suggested_checks: List of suggested check functions
            num_candidates: Number of candidates to generate

        Returns:
            List of candidate dicts
        """
        summary = f"""
## Identified Patterns
{chr(10).join(f'- {p}' for p in patterns) if patterns else 'None identified'}

## Quality Signals
{chr(10).join(f'- {s}' for s in signals) if signals else 'None identified'}

## Suggested Checks
{chr(10).join(f'- {c}' for c in suggested_checks) if suggested_checks else 'None identified'}
"""

        return self.generate(
            training_summary=summary,
            num_candidates=num_candidates,
        )

    def _validate_code_signature(self, code: str) -> bool:
        """Check if code has valid eval/reward function signature."""
        # Look for function definition with trace and ctx parameters
        pattern = r"def\s+(eval_|reward_)\w+\s*\(\s*trace\s*(?::\s*\w+)?\s*,\s*ctx"
        return bool(re.search(pattern, code))

    def _fix_code_signature(self, code: str) -> str:
        """Attempt to fix code with incorrect signature."""
        # If code has a function but wrong name, try to rename it
        func_match = re.search(r"def\s+(\w+)\s*\(", code)
        if func_match:
            func_name = func_match.group(1)
            if not func_name.startswith(("eval_", "reward_")):
                code = code.replace(f"def {func_name}(", f"def eval_{func_name}(", 1)

        # Check parameters
        if "(trace, ctx)" not in code and "(trace, ctx=None)" not in code:
            # Try to fix parameter signature
            code = re.sub(
                r"def (eval_|reward_)(\w+)\s*\([^)]*\)",
                r"def \1\2(trace, ctx=None)",
                code,
            )

        return code
