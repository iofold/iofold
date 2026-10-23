# notebooks/iofold_eval_core/scoring/evaluators/direct_comparison.py
"""
Direct comparison evaluator for comparing output_preview against expectedOutput.

This evaluator performs deterministic comparison using multiple similarity metrics
to assess whether the agent's output matches the expected output.
"""

import re
from difflib import SequenceMatcher
from typing import Any, Dict, Optional, Set

from ..base import BaseEvaluator, EvalResult


class DirectComparisonEvaluator(BaseEvaluator):
    """
    Compare output_preview directly against metadata.expectedOutput.

    Combines multiple similarity metrics:
    - String similarity (SequenceMatcher)
    - Token overlap (Jaccard similarity)
    - Negation pattern alignment

    Final score: 0.4 * string_sim + 0.4 * token_overlap + 0.2 * negation_match
    """

    name = "direct_comparison"
    description = "Compares output against expected output using multiple similarity metrics"
    default_weight = 0.25

    # Negation patterns to detect
    NEGATION_PATTERNS = [
        r'not found',
        r'no (email|result|data|match|information|record)',
        r"couldn't find",
        r"can't find",
        r'unable to (find|locate)',
        r'no .* (found|available|exist|detected)',
        r'(found|returned) (no|zero)',
        r'empty (result|response)',
    ]

    def evaluate(self, trace: Dict[str, Any], ctx: Optional[Any] = None) -> EvalResult:
        """
        Evaluate trace by comparing output_preview to expectedOutput.

        Args:
            trace: Trace dict with output_preview and metadata
            ctx: Optional context (unused)

        Returns:
            EvalResult with combined similarity score
        """
        output = trace.get('output_preview', '') or ''
        metadata = trace.get('metadata', {}) or {}
        expected = metadata.get('expectedOutput', '') or ''

        # If no expected output, return low confidence neutral score
        if not expected.strip():
            return EvalResult(
                score=0.5,
                feedback="No expected output to compare against",
                confidence=0.3,
                metadata={"reason": "missing_expected_output"}
            )

        # If output is empty but expected exists
        if not output.strip():
            return EvalResult(
                score=0.0,
                feedback="Empty output, expected output present",
                confidence=0.8,
                metadata={"reason": "empty_output", "expected_length": len(expected)}
            )

        # Compute similarity metrics
        string_sim = self._compute_string_similarity(output, expected)
        token_overlap = self._compute_token_overlap(output, expected)
        negation_match = self._compute_negation_match(output, expected)

        # Combined score with weights
        final_score = (
            0.4 * string_sim +
            0.4 * token_overlap +
            0.2 * negation_match
        )

        # Generate feedback
        feedback = self._generate_feedback(
            final_score, string_sim, token_overlap, negation_match
        )

        return EvalResult(
            score=final_score,
            feedback=feedback,
            confidence=0.8,
            metadata={
                "string_similarity": round(string_sim, 3),
                "token_overlap": round(token_overlap, 3),
                "negation_match": round(negation_match, 3),
                "output_length": len(output),
                "expected_length": len(expected),
            }
        )

    def _compute_string_similarity(self, output: str, expected: str) -> float:
        """
        Compute string similarity using SequenceMatcher.

        Returns a score between 0 and 1.
        """
        # Normalize: lowercase and strip whitespace
        output_norm = output.lower().strip()
        expected_norm = expected.lower().strip()

        # Use SequenceMatcher for similarity
        matcher = SequenceMatcher(None, output_norm, expected_norm)
        return matcher.ratio()

    def _compute_token_overlap(self, output: str, expected: str) -> float:
        """
        Compute Jaccard similarity (token overlap).

        Returns a score between 0 and 1.
        """
        output_tokens = self._tokenize(output)
        expected_tokens = self._tokenize(expected)

        if not output_tokens or not expected_tokens:
            return 0.0

        intersection = output_tokens & expected_tokens
        union = output_tokens | expected_tokens

        # Jaccard similarity
        return len(intersection) / len(union)

    def _compute_negation_match(self, output: str, expected: str) -> float:
        """
        Check if negation patterns align between output and expected.

        Returns:
            1.0 if both have negation or both lack negation
            0.0 if one has negation and the other doesn't
        """
        output_has_negation = self._has_negation(output)
        expected_has_negation = self._has_negation(expected)

        # Both agree on negation presence
        if output_has_negation == expected_has_negation:
            return 1.0

        # Disagreement
        return 0.0

    def _tokenize(self, text: str) -> Set[str]:
        """
        Tokenize text into normalized words.

        Filters out stop words and short tokens.
        """
        # Common stop words
        stop_words = {
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
            'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
            'would', 'should', 'could', 'may', 'might', 'must', 'can',
            'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between',
            'into', 'through', 'during', 'before', 'after', 'above', 'below',
            'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over',
            'under', 'again', 'further', 'then', 'once', 'here', 'there',
            'when', 'where', 'why', 'how', 'all', 'both', 'each', 'few',
            'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
            'only', 'own', 'same', 'so', 'than', 'too', 'very', 'what',
            'which', 'who', 'whom', 'this', 'that', 'these', 'those',
            'am', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me',
            'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its',
            'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs',
        }

        # Extract words (3+ chars, alphanumeric)
        words = re.findall(r'\b[a-zA-Z0-9]{3,}\b', text.lower())

        # Filter stop words
        return {w for w in words if w not in stop_words}

    def _has_negation(self, text: str) -> bool:
        """Check if text contains negation patterns."""
        text_lower = text.lower()
        return any(
            re.search(pattern, text_lower, re.IGNORECASE)
            for pattern in self.NEGATION_PATTERNS
        )

    def _generate_feedback(
        self,
        final_score: float,
        string_sim: float,
        token_overlap: float,
        negation_match: float
    ) -> str:
        """Generate human-readable feedback based on scores."""
        if final_score >= 0.8:
            return f"Strong match with expected output (string: {string_sim:.2f}, tokens: {token_overlap:.2f})"
        elif final_score >= 0.6:
            return f"Good match with expected output (string: {string_sim:.2f}, tokens: {token_overlap:.2f})"
        elif final_score >= 0.4:
            return f"Partial match with expected output (string: {string_sim:.2f}, tokens: {token_overlap:.2f})"
        elif final_score >= 0.2:
            return f"Weak match with expected output (string: {string_sim:.2f}, tokens: {token_overlap:.2f})"
        else:
            feedback = f"Poor match with expected output (string: {string_sim:.2f}, tokens: {token_overlap:.2f})"
            if negation_match == 0.0:
                feedback += " - negation mismatch detected"
            return feedback
