"""
Composite metrics for combining multiple individual metrics.

This module provides functions to calculate weighted combinations
of metrics for overall quality assessment.

All functions are pure Python with no external dependencies.
"""

from typing import Optional


def composite_score(
    metrics: dict[str, float],
    weights: Optional[dict[str, float]] = None
) -> float:
    """
    Calculate weighted composite score from multiple metrics.

    Computes a weighted average of multiple metrics. If weights are not
    provided, all metrics are weighted equally.

    Formula:
        composite = sum(metric_i * weight_i) / sum(weight_i)

    Args:
        metrics: Dictionary of metric names to values.
                 Values should typically be in [0, 1] for meaningful results.
        weights: Optional dictionary of metric names to weights.
                 Missing weights default to 1.0.
                 Weights are normalized internally.

    Returns:
        Weighted composite score.
        Returns 0.0 if metrics is empty or all weights are 0.

    Example:
        >>> metrics = {'accuracy': 0.85, 'f1_score': 0.80, 'cohen_kappa': 0.65}
        >>> composite_score(metrics)  # equal weights
        0.766...
        >>> composite_score(metrics, {'accuracy': 2.0, 'f1_score': 1.0, 'cohen_kappa': 1.0})
        0.787...
    """
    if not metrics:
        return 0.0

    if weights is None:
        weights = {}

    total_weighted = 0.0
    total_weight = 0.0

    for name, value in metrics.items():
        weight = weights.get(name, 1.0)
        total_weighted += value * weight
        total_weight += weight

    if total_weight == 0:
        return 0.0

    return total_weighted / total_weight


def normalize_metrics(
    metrics: dict[str, float],
    ranges: Optional[dict[str, tuple[float, float]]] = None
) -> dict[str, float]:
    """
    Normalize metrics to [0, 1] range using min-max normalization.

    Useful for combining metrics that have different natural ranges.
    For example, correlation can be in [-1, 1] while accuracy is in [0, 1].

    Formula:
        normalized = (value - min) / (max - min)

    Args:
        metrics: Dictionary of metric names to values
        ranges: Optional dictionary of metric names to (min, max) tuples.
                If not provided, assumes [0, 1] range for all metrics.

    Returns:
        Dictionary of normalized metric values in [0, 1].

    Example:
        >>> metrics = {'correlation': -0.5, 'accuracy': 0.8}
        >>> ranges = {'correlation': (-1.0, 1.0), 'accuracy': (0.0, 1.0)}
        >>> normalize_metrics(metrics, ranges)
        {'correlation': 0.25, 'accuracy': 0.8}
    """
    if ranges is None:
        ranges = {}

    normalized = {}

    for name, value in metrics.items():
        min_val, max_val = ranges.get(name, (0.0, 1.0))

        # Avoid division by zero
        if max_val == min_val:
            normalized[name] = 0.5  # Midpoint if range is zero
        else:
            # Clamp to range then normalize
            clamped = max(min_val, min(max_val, value))
            normalized[name] = (clamped - min_val) / (max_val - min_val)

    return normalized


def meets_thresholds(
    metrics: dict[str, float],
    thresholds: dict[str, float]
) -> tuple[bool, dict[str, bool]]:
    """
    Check if metrics meet specified thresholds.

    Used for winner selection: all specified thresholds must be met.
    Default thresholds for iofold eval candidates:
    - accuracy >= 0.70
    - cohen_kappa >= 0.40

    Args:
        metrics: Dictionary of metric names to values
        thresholds: Dictionary of metric names to minimum required values

    Returns:
        Tuple of:
        - bool: True if all thresholds are met
        - dict: Per-metric pass/fail results

    Example:
        >>> metrics = {'accuracy': 0.75, 'cohen_kappa': 0.45}
        >>> thresholds = {'accuracy': 0.70, 'cohen_kappa': 0.40}
        >>> meets_thresholds(metrics, thresholds)
        (True, {'accuracy': True, 'cohen_kappa': True})
    """
    results = {}
    all_passed = True

    for name, threshold in thresholds.items():
        value = metrics.get(name, 0.0)
        passed = value >= threshold
        results[name] = passed
        if not passed:
            all_passed = False

    return all_passed, results
