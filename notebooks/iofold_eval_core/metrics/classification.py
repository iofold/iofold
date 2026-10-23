"""
Classification metrics for evaluating binary predictions.

This module provides functions to calculate confusion matrices and
derived classification metrics (accuracy, precision, recall, F1 score)
for comparing eval scores against human scores.

All functions are pure Python with no external dependencies.
"""

from typing import TypedDict


class ConfusionMatrix(TypedDict):
    """Confusion matrix for binary classification."""
    true_positive: int
    true_negative: int
    false_positive: int
    false_negative: int


def calculate_confusion_matrix(
    y_pred: list[float],
    y_true: list[float],
    threshold: float = 0.5
) -> ConfusionMatrix:
    """
    Calculate confusion matrix from continuous scores.

    Converts continuous scores (0-1) to binary (positive/negative) using
    the threshold, then calculates true positives, true negatives,
    false positives, and false negatives.

    Args:
        y_pred: Predicted scores (e.g., from eval function), values in [0, 1]
        y_true: Ground truth scores (e.g., from human judgment), values in [0, 1]
        threshold: Threshold for binarization. Scores >= threshold are positive.
                   Default: 0.5

    Returns:
        ConfusionMatrix with counts for TP, TN, FP, FN

    Raises:
        ValueError: If y_pred and y_true have different lengths

    Example:
        >>> cm = calculate_confusion_matrix([0.8, 0.3, 0.6], [1.0, 0.0, 0.7])
        >>> cm['true_positive']
        2
    """
    if len(y_pred) != len(y_true):
        raise ValueError(
            f"Array lengths must match: y_pred={len(y_pred)}, y_true={len(y_true)}"
        )

    tp = tn = fp = fn = 0

    for pred, true in zip(y_pred, y_true):
        pred_positive = pred >= threshold
        true_positive = true >= threshold

        if pred_positive and true_positive:
            tp += 1
        elif not pred_positive and not true_positive:
            tn += 1
        elif pred_positive and not true_positive:
            fp += 1
        else:  # not pred_positive and true_positive
            fn += 1

    return ConfusionMatrix(
        true_positive=tp,
        true_negative=tn,
        false_positive=fp,
        false_negative=fn
    )


def accuracy(cm: ConfusionMatrix) -> float:
    """
    Calculate accuracy from confusion matrix.

    Accuracy measures overall correctness: the proportion of predictions
    that match the ground truth.

    Formula:
        accuracy = (TP + TN) / (TP + TN + FP + FN)

    Args:
        cm: Confusion matrix with TP, TN, FP, FN counts

    Returns:
        Accuracy as a float in [0, 1]. Returns 0.0 if total is 0.

    Example:
        >>> cm = {'true_positive': 5, 'true_negative': 3, 'false_positive': 1, 'false_negative': 1}
        >>> accuracy(cm)
        0.8
    """
    total = cm['true_positive'] + cm['true_negative'] + cm['false_positive'] + cm['false_negative']

    if total == 0:
        return 0.0

    return (cm['true_positive'] + cm['true_negative']) / total


def precision(cm: ConfusionMatrix) -> float:
    """
    Calculate precision from confusion matrix.

    Precision measures how many of the predicted positives are actually positive.
    Also known as Positive Predictive Value (PPV).

    Formula:
        precision = TP / (TP + FP)

    Args:
        cm: Confusion matrix with TP, TN, FP, FN counts

    Returns:
        Precision as a float in [0, 1]. Returns 0.0 if no positive predictions.

    Example:
        >>> cm = {'true_positive': 5, 'true_negative': 3, 'false_positive': 2, 'false_negative': 0}
        >>> precision(cm)
        0.714...
    """
    predicted_positive = cm['true_positive'] + cm['false_positive']

    if predicted_positive == 0:
        return 0.0

    return cm['true_positive'] / predicted_positive


def recall(cm: ConfusionMatrix) -> float:
    """
    Calculate recall from confusion matrix.

    Recall measures how many of the actual positives were correctly identified.
    Also known as Sensitivity or True Positive Rate (TPR).

    Formula:
        recall = TP / (TP + FN)

    Args:
        cm: Confusion matrix with TP, TN, FP, FN counts

    Returns:
        Recall as a float in [0, 1]. Returns 0.0 if no actual positives.

    Example:
        >>> cm = {'true_positive': 5, 'true_negative': 3, 'false_positive': 1, 'false_negative': 1}
        >>> recall(cm)
        0.833...
    """
    actual_positive = cm['true_positive'] + cm['false_negative']

    if actual_positive == 0:
        return 0.0

    return cm['true_positive'] / actual_positive


def f1_score(cm: ConfusionMatrix) -> float:
    """
    Calculate F1 score from confusion matrix.

    F1 score is the harmonic mean of precision and recall, providing a
    balanced measure that accounts for both false positives and false negatives.

    Formula:
        F1 = 2 * (precision * recall) / (precision + recall)

    Args:
        cm: Confusion matrix with TP, TN, FP, FN counts

    Returns:
        F1 score as a float in [0, 1]. Returns 0.0 if precision + recall is 0.

    Example:
        >>> cm = {'true_positive': 5, 'true_negative': 3, 'false_positive': 1, 'false_negative': 1}
        >>> f1_score(cm)
        0.833...
    """
    p = precision(cm)
    r = recall(cm)

    if p + r == 0:
        return 0.0

    return 2 * (p * r) / (p + r)
