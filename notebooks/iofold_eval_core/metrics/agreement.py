"""
Inter-rater agreement metrics for measuring agreement between raters.

This module provides functions to calculate agreement coefficients
that account for chance agreement, unlike simple accuracy.

All functions are pure Python with no external dependencies.
"""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .classification import ConfusionMatrix


def cohen_kappa(cm: "ConfusionMatrix", n: int) -> float:
    """
    Calculate Cohen's Kappa coefficient from confusion matrix.

    Cohen's Kappa measures inter-rater agreement while accounting for
    the possibility of agreement occurring by chance. It is more robust
    than simple accuracy when class distributions are imbalanced.

    Formula:
        kappa = (Po - Pe) / (1 - Pe)

        where:
        - Po = observed agreement = (TP + TN) / n
        - Pe = expected agreement by chance
             = (eval_positive * human_positive + eval_negative * human_negative) / n^2

    Interpretation:
        - < 0.00: No agreement (worse than chance)
        - 0.00 - 0.20: Slight agreement
        - 0.21 - 0.40: Fair agreement
        - 0.41 - 0.60: Moderate agreement
        - 0.61 - 0.80: Substantial agreement
        - 0.81 - 1.00: Almost perfect agreement

    Args:
        cm: Confusion matrix with true_positive, true_negative,
            false_positive, and false_negative counts
        n: Total number of observations (should equal sum of matrix values)

    Returns:
        Cohen's Kappa coefficient, typically in [-1, 1].
        Returns 0.0 if n is 0.
        Returns 1.0 if Pe equals 1 (perfect chance agreement).

    Example:
        >>> cm = {'true_positive': 20, 'true_negative': 15, 'false_positive': 10, 'false_negative': 5}
        >>> cohen_kappa(cm, 50)
        0.4

    Note:
        The n parameter is provided separately to allow for cases where
        the caller has already computed the total, matching the TypeScript
        implementation. Typically n = TP + TN + FP + FN.
    """
    if n == 0:
        return 0.0

    # Observed agreement (same as accuracy)
    po = (cm['true_positive'] + cm['true_negative']) / n

    # Marginal totals
    # eval_positive: times the eval predicted positive
    eval_positive = cm['true_positive'] + cm['false_positive']
    # eval_negative: times the eval predicted negative
    eval_negative = cm['true_negative'] + cm['false_negative']
    # human_positive: times the human labeled positive
    human_positive = cm['true_positive'] + cm['false_negative']
    # human_negative: times the human labeled negative
    human_negative = cm['true_negative'] + cm['false_positive']

    # Expected agreement by chance
    # This is the probability that both raters would agree by random chance
    # given their marginal distributions
    pe = (eval_positive * human_positive + eval_negative * human_negative) / (n * n)

    # Edge case: if Pe equals 1, both raters always agree by chance
    # Return 1.0 to indicate perfect agreement
    if pe == 1:
        return 1.0

    # Calculate kappa
    return (po - pe) / (1 - pe)


def fleiss_kappa(ratings_matrix: list[list[int]], n_raters: int) -> float:
    """
    Calculate Fleiss' Kappa for multiple raters.

    This is an extension of Cohen's Kappa for more than two raters.
    Each row represents a subject and each column represents a category.
    The values are the number of raters who assigned that category.

    Formula:
        kappa = (P_bar - P_e_bar) / (1 - P_e_bar)

    Args:
        ratings_matrix: Matrix where ratings_matrix[i][j] is the number of
                        raters who assigned category j to subject i
        n_raters: Number of raters per subject (must be consistent)

    Returns:
        Fleiss' Kappa coefficient in [-1, 1].
        Returns 0.0 for edge cases (empty matrix, single category).

    Note:
        This is a more advanced metric. For binary eval agreement,
        cohen_kappa is typically sufficient.
    """
    if not ratings_matrix or not ratings_matrix[0]:
        return 0.0

    n_subjects = len(ratings_matrix)
    n_categories = len(ratings_matrix[0])

    if n_categories <= 1 or n_subjects == 0 or n_raters <= 1:
        return 0.0

    # Calculate P_j: proportion of assignments to each category
    p_j = []
    total_assignments = n_subjects * n_raters

    for j in range(n_categories):
        category_sum = sum(ratings_matrix[i][j] for i in range(n_subjects))
        p_j.append(category_sum / total_assignments)

    # Calculate P_i: agreement for each subject
    p_i = []
    for i in range(n_subjects):
        row = ratings_matrix[i]
        # Sum of n_ij * (n_ij - 1) for all categories
        agreement_sum = sum(n_ij * (n_ij - 1) for n_ij in row)
        p_i.append(agreement_sum / (n_raters * (n_raters - 1)))

    # P_bar: mean agreement across subjects
    p_bar = sum(p_i) / n_subjects

    # P_e_bar: expected agreement by chance
    p_e_bar = sum(pj * pj for pj in p_j)

    # Edge case: perfect expected agreement
    if p_e_bar == 1:
        return 1.0

    return (p_bar - p_e_bar) / (1 - p_e_bar)
