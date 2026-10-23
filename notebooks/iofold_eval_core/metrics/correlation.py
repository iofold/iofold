"""
Correlation metrics for measuring linear relationships between scores.

This module provides functions to calculate correlation coefficients
for comparing eval scores against human scores.

All functions are pure Python with no external dependencies.
"""

import math


def pearson_correlation(x: list[float], y: list[float]) -> float:
    """
    Calculate Pearson correlation coefficient between two arrays.

    Measures the linear correlation between two sets of scores.

    Formula:
        r = (n * sum(xy) - sum(x) * sum(y)) /
            sqrt((n * sum(x^2) - sum(x)^2) * (n * sum(y^2) - sum(y)^2))

    Interpretation:
        - 1.0: Perfect positive correlation
        - 0.0: No correlation
        - -1.0: Perfect negative correlation

    Args:
        x: First array of values (e.g., eval scores)
        y: Second array of values (e.g., human scores)

    Returns:
        Pearson correlation coefficient in [-1, 1].
        Returns 0.0 for edge cases:
        - Empty lists
        - Lists of length 1
        - Constant values in either list (zero variance)

    Raises:
        ValueError: If x and y have different lengths

    Example:
        >>> pearson_correlation([1, 2, 3, 4, 5], [1, 2, 3, 4, 5])
        1.0
        >>> pearson_correlation([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])
        -1.0
        >>> pearson_correlation([1, 1, 1], [2, 2, 2])  # constant values
        0.0
    """
    n = len(x)

    # Edge case: empty lists
    if n == 0:
        return 0.0

    # Edge case: single element
    if n == 1:
        return 0.0

    # Validate matching lengths
    if n != len(y):
        raise ValueError(f"Array lengths must match: x={n}, y={len(y)}")

    # Calculate sums
    sum_x = sum(x)
    sum_y = sum(y)
    sum_xy = sum(xi * yi for xi, yi in zip(x, y))
    sum_x2 = sum(xi * xi for xi in x)
    sum_y2 = sum(yi * yi for yi in y)

    # Calculate correlation
    numerator = n * sum_xy - sum_x * sum_y

    # Calculate denominator components
    var_x = n * sum_x2 - sum_x * sum_x
    var_y = n * sum_y2 - sum_y * sum_y

    # Edge case: zero variance (constant values)
    if var_x <= 0 or var_y <= 0:
        return 0.0

    denominator = math.sqrt(var_x * var_y)

    # Edge case: zero denominator (should be caught by var check above)
    if denominator == 0:
        return 0.0

    return numerator / denominator
