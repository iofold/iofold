# notebooks/iofold_eval_core/scoring/evaluators/entity_match.py
"""Entity-based evaluator that extracts and compares numbers, names, and emails."""

import re
from typing import Any, Dict, Optional, Set

from ..base import BaseEvaluator, EvalResult


class EntityMatchEvaluator(BaseEvaluator):
    """
    Extract and compare key entities between output and expected output.

    Entities extracted:
    - Numbers (integers, decimals, percentages)
    - Names (capitalized words/proper nouns)
    - Email addresses

    Scoring:
    - 0.5 * number_overlap + 0.3 * name_overlap + 0.2 * email_overlap
    - Applies hallucination penalty for entities in actual but not in expected
    """

    name = "entity_match"
    description = "Compares entities (numbers, names, emails) between output and expected"
    default_weight = 0.25

    def extract_numbers(self, text: str) -> Set[str]:
        """
        Extract all numbers from text.

        Matches:
        - Integers: 42, 1000
        - Decimals: 3.14, 0.5
        - Percentages: 25%, 99.9%
        - Numbers with commas: 1,000, 1,234.56

        Returns normalized set (removes commas, lowercases).
        """
        # Pattern matches: optional negative, digits with optional commas, optional decimal, optional %
        pattern = r'-?\d{1,3}(?:,\d{3})*(?:\.\d+)?%?'
        matches = re.findall(pattern, text)
        # Normalize: remove commas, lowercase
        return set(m.replace(',', '').lower() for m in matches)

    def extract_names(self, text: str) -> Set[str]:
        """
        Extract capitalized words (proper nouns/names).

        Strategy:
        1. Extract all individual capitalized words (3+ chars, not stop words)
        2. This simple approach works well for entity matching because:
           - Both "John Smith" and "John" will match if present
           - Avoids complex multi-word extraction issues
           - More robust for overlap comparison

        Excludes common sentence-starting words and generic single words.
        """
        # Common words to exclude
        stop_words = {
            'The', 'A', 'An', 'This', 'That', 'These', 'Those',
            'Here', 'There', 'Where', 'When', 'What', 'How', 'Why',
            'Please', 'Thank', 'Thanks', 'Hello', 'Hi', 'Yes', 'No',
            'Subject', 'From', 'To', 'Cc', 'Bcc', 'Date', 'Sent',
            'Contact', 'Email', 'Phone', 'Address', 'Revenue', 'Total',
            'Message', 'Reply', 'Forward', 'Meeting', 'Report', 'Document',
            'Dear', 'Regards', 'Sincerely', 'Best', 'Attached', 'Via',
            'About', 'Regarding', 'Inc', 'Ltd', 'Corp', 'Company',
        }

        # Extract all capitalized words (3+ characters)
        pattern = r'\b[A-Z][a-z]{2,}\b'
        matches = re.findall(pattern, text)

        # Filter out stop words
        names = set(m for m in matches if m not in stop_words)

        return names

    def extract_emails(self, text: str) -> Set[str]:
        """
        Extract email addresses from text.

        Matches standard email format: user@domain.tld
        Returns normalized set (lowercased).
        """
        pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        matches = re.findall(pattern, text)
        return set(m.lower() for m in matches)

    def _calculate_overlap(self, actual: Set[str], expected: Set[str]) -> float:
        """
        Calculate overlap score between two sets.

        Returns:
        - 1.0 if both sets are empty (nothing to compare)
        - overlap / len(expected) if expected has items
        - 0.0 if expected is empty but actual has items (hallucination)
        """
        if not expected and not actual:
            return 1.0
        if not expected:
            return 0.0  # Hallucination: actual has entities but expected doesn't
        if not actual:
            return 0.0  # Missing: expected has entities but actual doesn't

        overlap = len(actual & expected)
        return overlap / len(expected)

    def _calculate_hallucination_penalty(
        self,
        actual: Set[str],
        expected: Set[str],
        severity: float = 0.1
    ) -> float:
        """
        Calculate penalty for hallucinated entities (in actual but not expected).

        Args:
            actual: Entities found in actual output
            expected: Entities found in expected output
            severity: Penalty per hallucinated entity (default 0.1)

        Returns:
            Penalty value (0 to 1)
        """
        if not expected or not actual:
            return 0.0

        hallucinated = actual - expected
        penalty = len(hallucinated) * severity
        return min(penalty, 1.0)  # Cap at 1.0

    def evaluate(self, trace: Dict[str, Any], ctx: Optional[Any] = None) -> EvalResult:
        """
        Evaluate entity match between output and expected output.

        Args:
            trace: Trace dict with output_preview and metadata
            ctx: Unused (kept for interface compatibility)

        Returns:
            EvalResult with combined entity overlap score
        """
        # Extract actual output
        actual_output = trace.get('output_preview', '') or ''

        # Extract expected output from metadata
        metadata = trace.get('metadata', {})
        expected_output = ''

        if isinstance(metadata, dict):
            expected_output = metadata.get('expectedOutput', '') or ''

        # If no expected output, return neutral score with low confidence
        if not expected_output.strip():
            return EvalResult(
                score=0.5,
                feedback="No expected output to compare entities",
                confidence=0.2,
                metadata={'reason': 'no_expected_output'}
            )

        # Extract entities from both outputs
        actual_numbers = self.extract_numbers(actual_output)
        expected_numbers = self.extract_numbers(expected_output)

        actual_names = self.extract_names(actual_output)
        expected_names = self.extract_names(expected_output)

        actual_emails = self.extract_emails(actual_output)
        expected_emails = self.extract_emails(expected_output)

        # Calculate overlaps
        num_overlap = self._calculate_overlap(actual_numbers, expected_numbers)
        name_overlap = self._calculate_overlap(actual_names, expected_names)
        email_overlap = self._calculate_overlap(actual_emails, expected_emails)

        # Calculate hallucination penalties
        num_penalty = self._calculate_hallucination_penalty(actual_numbers, expected_numbers, severity=0.1)
        name_penalty = self._calculate_hallucination_penalty(actual_names, expected_names, severity=0.05)
        email_penalty = self._calculate_hallucination_penalty(actual_emails, expected_emails, severity=0.15)

        total_penalty = num_penalty + name_penalty + email_penalty

        # Combine scores with weights
        base_score = (
            0.5 * num_overlap +
            0.3 * name_overlap +
            0.2 * email_overlap
        )

        # Apply penalty
        final_score = max(0.0, base_score - total_penalty)

        # Calculate confidence based on entity availability
        has_expected_entities = bool(expected_numbers or expected_names or expected_emails)
        confidence = 0.85 if has_expected_entities else 0.3

        # Build feedback message
        feedback_parts = []

        if expected_numbers:
            feedback_parts.append(f"numbers: {num_overlap:.0%} overlap ({len(actual_numbers & expected_numbers)}/{len(expected_numbers)})")
        if expected_names:
            feedback_parts.append(f"names: {name_overlap:.0%} overlap ({len(actual_names & expected_names)}/{len(expected_names)})")
        if expected_emails:
            feedback_parts.append(f"emails: {email_overlap:.0%} overlap ({len(actual_emails & expected_emails)}/{len(expected_emails)})")

        if total_penalty > 0:
            feedback_parts.append(f"hallucination penalty: {total_penalty:.2f}")

        feedback = ", ".join(feedback_parts) if feedback_parts else "No entities to compare"

        # Build metadata for debugging
        result_metadata = {
            'actual_numbers': list(actual_numbers),
            'expected_numbers': list(expected_numbers),
            'actual_names': list(actual_names),
            'expected_names': list(expected_names),
            'actual_emails': list(actual_emails),
            'expected_emails': list(expected_emails),
            'num_overlap': num_overlap,
            'name_overlap': name_overlap,
            'email_overlap': email_overlap,
            'total_penalty': total_penalty,
        }

        return EvalResult(
            score=final_score,
            feedback=feedback,
            confidence=confidence,
            metadata=result_metadata
        )
