"""
Metrics module for iofold-eval-core.

Provides pure Python implementations of statistical metrics for evaluating
agreement between eval candidates and human scores.

Classification Metrics:
    calculate_confusion_matrix - Convert scores to binary and compute TP/TN/FP/FN
    accuracy - Overall correctness
    precision - Positive predictive value
    recall - True positive rate (sensitivity)
    f1_score - Harmonic mean of precision and recall

Correlation Metrics:
    pearson_correlation - Linear correlation coefficient

Agreement Metrics:
    cohen_kappa - Inter-rater agreement accounting for chance
    fleiss_kappa - Multi-rater agreement

Composite Metrics:
    composite_score - Weighted combination of metrics
    normalize_metrics - Min-max normalization to [0, 1]
    meets_thresholds - Check if metrics meet minimum requirements

All functions handle edge cases (empty inputs, division by zero) gracefully.
No external dependencies (sklearn, numpy, etc.) are required.
"""

# Classification metrics
from .classification import (
    ConfusionMatrix,
    calculate_confusion_matrix,
    accuracy,
    precision,
    recall,
    f1_score,
)

# Correlation metrics
from .correlation import (
    pearson_correlation,
)

# Agreement metrics
from .agreement import (
    cohen_kappa,
    fleiss_kappa,
)

# Composite metrics
from .composite import (
    composite_score,
    normalize_metrics,
    meets_thresholds,
)

__all__ = [
    # Types
    "ConfusionMatrix",
    # Classification
    "calculate_confusion_matrix",
    "accuracy",
    "precision",
    "recall",
    "f1_score",
    # Correlation
    "pearson_correlation",
    # Agreement
    "cohen_kappa",
    "fleiss_kappa",
    # Composite
    "composite_score",
    "normalize_metrics",
    "meets_thresholds",
]
