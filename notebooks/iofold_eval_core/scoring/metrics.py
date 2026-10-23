# notebooks/iofold_eval_core/scoring/metrics.py
"""Metrics for evaluating continuous reward functions."""

import numpy as np
from typing import List, Dict, Any, Tuple
from dataclasses import dataclass

# Score thresholds for 3-class classification
NEGATIVE_THRESHOLD = 0.33
POSITIVE_THRESHOLD = 0.67

# Target scores for each rating
RATING_TARGETS = {
    'negative': 0.17,  # Middle of 0-0.33
    'neutral': 0.50,   # Middle of 0.33-0.67
    'positive': 0.83,  # Middle of 0.67-1.0
}

def rating_to_target(rating: str) -> float:
    """Convert rating string to target score."""
    return RATING_TARGETS.get(rating, 0.5)

def score_to_rating(score: float) -> str:
    """Convert continuous score to rating."""
    if score < NEGATIVE_THRESHOLD:
        return 'negative'
    elif score >= POSITIVE_THRESHOLD:
        return 'positive'
    else:
        return 'neutral'

@dataclass
class ContinuousMetrics:
    """Metrics for continuous scoring."""
    # Regression metrics
    mae: float  # Mean Absolute Error
    mse: float  # Mean Squared Error
    rmse: float  # Root Mean Squared Error
    correlation: float  # Pearson correlation

    # Classification metrics (using thresholds)
    accuracy_3class: float
    accuracy_binary: float  # positive vs not-positive

    # Per-class metrics
    precision_positive: float
    recall_positive: float
    precision_negative: float
    recall_negative: float

    # Calibration
    mean_predicted: float
    mean_actual: float

    n_samples: int

def compute_continuous_metrics(
    predictions: List[float],
    targets: List[float],  # 0.17, 0.5, or 0.83
    ratings: List[str],    # 'positive', 'neutral', 'negative'
) -> ContinuousMetrics:
    """Compute comprehensive metrics for continuous predictions."""

    predictions = np.array(predictions)
    targets = np.array(targets)
    n = len(predictions)

    # Regression metrics
    errors = predictions - targets
    mae = np.mean(np.abs(errors))
    mse = np.mean(errors ** 2)
    rmse = np.sqrt(mse)

    # Correlation
    if np.std(predictions) > 0 and np.std(targets) > 0:
        correlation = np.corrcoef(predictions, targets)[0, 1]
    else:
        correlation = 0.0

    # Classification metrics
    pred_ratings = [score_to_rating(p) for p in predictions]

    # 3-class accuracy
    correct_3class = sum(1 for pr, ar in zip(pred_ratings, ratings) if pr == ar)
    accuracy_3class = correct_3class / n if n > 0 else 0

    # Binary accuracy (positive vs not)
    pred_positive = [1 if p >= POSITIVE_THRESHOLD else 0 for p in predictions]
    actual_positive = [1 if r == 'positive' else 0 for r in ratings]
    correct_binary = sum(1 for pp, ap in zip(pred_positive, actual_positive) if pp == ap)
    accuracy_binary = correct_binary / n if n > 0 else 0

    # Per-class precision/recall
    tp_pos = sum(1 for pr, ar in zip(pred_ratings, ratings) if pr == 'positive' and ar == 'positive')
    fp_pos = sum(1 for pr, ar in zip(pred_ratings, ratings) if pr == 'positive' and ar != 'positive')
    fn_pos = sum(1 for pr, ar in zip(pred_ratings, ratings) if pr != 'positive' and ar == 'positive')

    tp_neg = sum(1 for pr, ar in zip(pred_ratings, ratings) if pr == 'negative' and ar == 'negative')
    fp_neg = sum(1 for pr, ar in zip(pred_ratings, ratings) if pr == 'negative' and ar != 'negative')
    fn_neg = sum(1 for pr, ar in zip(pred_ratings, ratings) if pr != 'negative' and ar == 'negative')

    precision_positive = tp_pos / (tp_pos + fp_pos) if (tp_pos + fp_pos) > 0 else 0
    recall_positive = tp_pos / (tp_pos + fn_pos) if (tp_pos + fn_pos) > 0 else 0
    precision_negative = tp_neg / (tp_neg + fp_neg) if (tp_neg + fp_neg) > 0 else 0
    recall_negative = tp_neg / (tp_neg + fn_neg) if (tp_neg + fn_neg) > 0 else 0

    return ContinuousMetrics(
        mae=mae,
        mse=mse,
        rmse=rmse,
        correlation=correlation,
        accuracy_3class=accuracy_3class,
        accuracy_binary=accuracy_binary,
        precision_positive=precision_positive,
        recall_positive=recall_positive,
        precision_negative=precision_negative,
        recall_negative=recall_negative,
        mean_predicted=np.mean(predictions),
        mean_actual=np.mean(targets),
        n_samples=n,
    )
