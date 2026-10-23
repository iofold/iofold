"""
Winner selection for choosing the best eval candidate.

This module provides the WinnerSelector class for selecting the best
eval candidate from multiple candidates based on quality metrics.
"""

from typing import Dict, List, Optional, Tuple

from ..models import TestResult


# Default weights for composite scoring
DEFAULT_WEIGHTS = {
    "accuracy": 0.3,
    "cohen_kappa": 0.3,
    "f1_score": 0.2,
    "pearson_r": 0.2,
}


class WinnerSelector:
    """
    Select best eval candidate from multiple candidates.

    Evaluates candidates based on multiple metrics and selects the
    one that best meets minimum thresholds and has the highest
    composite score.

    Example usage:
        selector = WinnerSelector()

        candidates = [
            (code1, result1),
            (code2, result2),
            (code3, result3),
        ]

        winner = selector.select_winner(
            candidates=candidates,
            min_accuracy=0.7,
            min_kappa=0.4
        )

        if winner:
            code, result = winner
            print(f"Best candidate with accuracy: {result.accuracy}")
    """

    def __init__(self, default_weights: Optional[Dict[str, float]] = None):
        """
        Initialize the WinnerSelector.

        Args:
            default_weights: Default weights for composite scoring.
                             Keys should be metric names (accuracy, cohen_kappa,
                             f1_score, pearson_r). Values are weights (will be normalized).
        """
        self.default_weights = default_weights or DEFAULT_WEIGHTS

    def composite_score(
        self,
        result: TestResult,
        weights: Optional[Dict[str, float]] = None,
    ) -> float:
        """
        Calculate weighted composite score for a test result.

        The composite score combines multiple metrics into a single
        value for easy comparison. Higher is better.

        Args:
            result: TestResult with quality metrics
            weights: Optional custom weights for metrics.
                     Default: accuracy=0.3, kappa=0.3, f1=0.2, pearson_r=0.2

        Returns:
            Composite score in [0, 1] (assuming input metrics are in [0, 1])
        """
        if weights is None:
            weights = self.default_weights

        # Get metric values
        metrics = {
            "accuracy": result.accuracy,
            "cohen_kappa": result.cohen_kappa,
            "f1_score": result.f1_score,
            "pearson_r": result.pearson_r,
        }

        # Calculate weighted sum
        total_weight = 0.0
        weighted_sum = 0.0

        for metric_name, weight in weights.items():
            if metric_name in metrics:
                # Handle negative values (kappa and pearson can be negative)
                # Clamp to [0, 1] for composite scoring
                value = max(0.0, min(1.0, metrics[metric_name]))
                weighted_sum += value * weight
                total_weight += weight

        if total_weight == 0:
            return 0.0

        return weighted_sum / total_weight

    def meets_thresholds(
        self,
        result: TestResult,
        min_accuracy: float = 0.7,
        min_kappa: float = 0.4,
        min_f1: Optional[float] = None,
        min_pearson_r: Optional[float] = None,
    ) -> bool:
        """
        Check if a test result meets minimum threshold requirements.

        Args:
            result: TestResult to check
            min_accuracy: Minimum required accuracy
            min_kappa: Minimum required Cohen's kappa
            min_f1: Optional minimum required F1 score
            min_pearson_r: Optional minimum required Pearson correlation

        Returns:
            True if all thresholds are met, False otherwise
        """
        if result.accuracy < min_accuracy:
            return False

        if result.cohen_kappa < min_kappa:
            return False

        if min_f1 is not None and result.f1_score < min_f1:
            return False

        if min_pearson_r is not None and result.pearson_r < min_pearson_r:
            return False

        return True

    def select_winner(
        self,
        candidates: List[Tuple[str, TestResult]],
        min_accuracy: float = 0.7,
        min_kappa: float = 0.4,
        min_f1: Optional[float] = None,
        min_pearson_r: Optional[float] = None,
        weights: Optional[Dict[str, float]] = None,
    ) -> Optional[Tuple[str, TestResult]]:
        """
        Select best candidate meeting minimum thresholds.

        Filters candidates by minimum thresholds, then selects the one
        with the highest composite score.

        Args:
            candidates: List of (code, TestResult) pairs
            min_accuracy: Minimum required accuracy (default: 0.7)
            min_kappa: Minimum required Cohen's kappa (default: 0.4)
            min_f1: Optional minimum required F1 score
            min_pearson_r: Optional minimum required Pearson correlation
            weights: Optional custom weights for composite scoring

        Returns:
            Tuple of (code, TestResult) for the best candidate,
            or None if no candidate meets thresholds
        """
        if not candidates:
            return None

        # Filter by thresholds
        qualifying = []
        for code, result in candidates:
            if self.meets_thresholds(
                result,
                min_accuracy=min_accuracy,
                min_kappa=min_kappa,
                min_f1=min_f1,
                min_pearson_r=min_pearson_r,
            ):
                score = self.composite_score(result, weights)
                qualifying.append((code, result, score))

        if not qualifying:
            return None

        # Sort by composite score (descending) and return best
        qualifying.sort(key=lambda x: x[2], reverse=True)
        best_code, best_result, _ = qualifying[0]

        return (best_code, best_result)

    def rank_candidates(
        self,
        candidates: List[Tuple[str, TestResult]],
        weights: Optional[Dict[str, float]] = None,
    ) -> List[Tuple[str, TestResult, float]]:
        """
        Rank all candidates by composite score (no threshold filtering).

        Args:
            candidates: List of (code, TestResult) pairs
            weights: Optional custom weights for composite scoring

        Returns:
            List of (code, TestResult, score) tuples, sorted by score descending
        """
        scored = []
        for code, result in candidates:
            score = self.composite_score(result, weights)
            scored.append((code, result, score))

        scored.sort(key=lambda x: x[2], reverse=True)
        return scored

    def select_top_k(
        self,
        candidates: List[Tuple[str, TestResult]],
        k: int = 3,
        min_accuracy: float = 0.0,
        min_kappa: float = -1.0,
        weights: Optional[Dict[str, float]] = None,
    ) -> List[Tuple[str, TestResult]]:
        """
        Select top k candidates by composite score.

        Args:
            candidates: List of (code, TestResult) pairs
            k: Number of candidates to return
            min_accuracy: Minimum accuracy threshold (default: 0 = no filter)
            min_kappa: Minimum kappa threshold (default: -1 = no filter)
            weights: Optional custom weights for composite scoring

        Returns:
            List of top k (code, TestResult) pairs, sorted by score descending
        """
        # Filter by thresholds
        filtered = []
        for code, result in candidates:
            if self.meets_thresholds(result, min_accuracy=min_accuracy, min_kappa=min_kappa):
                score = self.composite_score(result, weights)
                filtered.append((code, result, score))

        # Sort and return top k
        filtered.sort(key=lambda x: x[2], reverse=True)
        return [(code, result) for code, result, _ in filtered[:k]]


def select_best_candidate(
    candidates: List[Tuple[str, TestResult]],
    min_accuracy: float = 0.7,
    min_kappa: float = 0.4,
    weights: Optional[Dict[str, float]] = None,
) -> Optional[Tuple[str, TestResult]]:
    """
    Convenience function to select the best candidate.

    Args:
        candidates: List of (code, TestResult) pairs
        min_accuracy: Minimum required accuracy
        min_kappa: Minimum required Cohen's kappa
        weights: Optional custom weights for composite scoring

    Returns:
        Tuple of (code, TestResult) for the best candidate,
        or None if no candidate meets thresholds
    """
    selector = WinnerSelector()
    return selector.select_winner(
        candidates=candidates,
        min_accuracy=min_accuracy,
        min_kappa=min_kappa,
        weights=weights,
    )


__all__ = [
    "WinnerSelector",
    "select_best_candidate",
    "DEFAULT_WEIGHTS",
]
