"""
K-fold cross-validation for eval candidates.

This module provides the CrossValidator class for running k-fold
cross-validation to assess the stability and generalization of
eval candidates across different data splits.
"""

import random
from typing import List, Optional

from ..models import LabeledTrace, FoldResult, CrossValidationResult
from .tester import CandidateTester


class CrossValidator:
    """
    K-fold cross-validation for eval candidates.

    Splits labeled traces into k folds and evaluates the candidate
    on each fold, aggregating metrics to assess stability.

    Example usage:
        tester = CandidateTester()
        validator = CrossValidator(tester)

        result = validator.cross_validate(
            code=eval_code,
            labeled_traces=traces,
            k=5,
            seed=42
        )

        print(f"Mean accuracy: {result.mean_accuracy:.3f} +/- {result.std_accuracy:.3f}")
        print(f"Is stable: {result.is_stable}")
    """

    def __init__(
        self,
        tester: CandidateTester,
        stability_threshold: float = 0.1,
    ):
        """
        Initialize the CrossValidator.

        Args:
            tester: CandidateTester instance for running evaluations
            stability_threshold: Maximum standard deviation for is_stable=True
        """
        self.tester = tester
        self.stability_threshold = stability_threshold

    def _create_folds(
        self,
        labeled_traces: List[LabeledTrace],
        k: int,
        seed: Optional[int] = None,
    ) -> List[List[LabeledTrace]]:
        """
        Split traces into k folds.

        Args:
            labeled_traces: List of labeled traces to split
            k: Number of folds
            seed: Random seed for reproducibility

        Returns:
            List of k folds, each containing a subset of traces
        """
        if seed is not None:
            random.seed(seed)

        # Shuffle indices
        indices = list(range(len(labeled_traces)))
        random.shuffle(indices)

        # Create folds
        folds: List[List[LabeledTrace]] = [[] for _ in range(k)]
        for i, idx in enumerate(indices):
            fold_idx = i % k
            folds[fold_idx].append(labeled_traces[idx])

        return folds

    def cross_validate(
        self,
        code: str,
        labeled_traces: List[LabeledTrace],
        k: int = 5,
        seed: Optional[int] = None,
        threshold: float = 0.5,
        candidate_id: Optional[str] = None,
    ) -> CrossValidationResult:
        """
        Run k-fold cross-validation.

        For each fold:
        1. Use that fold as the validation set
        2. Use all other folds as training set (not used for code-based evals)
        3. Test the candidate on the validation fold

        Note: For code-based eval candidates, we don't actually train on the
        training set - we just evaluate on the validation set. The training
        set size is tracked for informational purposes.

        Args:
            code: Python code containing an eval_* or reward_* function
            labeled_traces: List of LabeledTrace objects
            k: Number of folds (default: 5)
            seed: Random seed for reproducibility
            threshold: Threshold for binary classification
            candidate_id: Optional identifier for the candidate

        Returns:
            CrossValidationResult with mean/std metrics and is_stable flag
        """
        if not labeled_traces:
            return CrossValidationResult(
                candidate_id=candidate_id or "unknown",
                mean_accuracy=0.0,
                mean_kappa=0.0,
                mean_f1=0.0,
                std_accuracy=0.0,
                std_kappa=0.0,
                is_stable=False,
                fold_results=[],
            )

        # Adjust k if we don't have enough samples
        effective_k = min(k, len(labeled_traces))
        if effective_k < 2:
            # Can't do CV with less than 2 folds
            effective_k = 1

        # Create folds
        folds = self._create_folds(labeled_traces, effective_k, seed)

        # Run cross-validation
        fold_results: List[FoldResult] = []

        for fold_idx in range(effective_k):
            # Validation set is the current fold
            val_set = folds[fold_idx]

            # Training set is all other folds (for info only)
            train_set = []
            for i, fold in enumerate(folds):
                if i != fold_idx:
                    train_set.extend(fold)

            # Test on validation set
            test_result = self.tester.test_candidate(
                code=code,
                labeled_traces=val_set,
                threshold=threshold,
            )

            # Create fold result
            fold_result = FoldResult(
                fold_index=fold_idx,
                accuracy=test_result.accuracy,
                kappa=test_result.cohen_kappa,
                f1=test_result.f1_score,
                train_size=len(train_set),
                val_size=len(val_set),
            )
            fold_results.append(fold_result)

        # Aggregate results using the model's factory method
        return CrossValidationResult.from_fold_results(
            candidate_id=candidate_id or "unknown",
            fold_results=fold_results,
            stability_threshold=self.stability_threshold,
        )

    def cross_validate_multiple(
        self,
        candidates: List[tuple],  # (candidate_id, code) pairs
        labeled_traces: List[LabeledTrace],
        k: int = 5,
        seed: Optional[int] = None,
        threshold: float = 0.5,
    ) -> List[CrossValidationResult]:
        """
        Run cross-validation on multiple candidates.

        Args:
            candidates: List of (candidate_id, code) tuples
            labeled_traces: List of LabeledTrace objects
            k: Number of folds
            seed: Random seed (same seed used for all candidates for fairness)
            threshold: Threshold for binary classification

        Returns:
            List of CrossValidationResult objects, one per candidate
        """
        results = []
        for candidate_id, code in candidates:
            result = self.cross_validate(
                code=code,
                labeled_traces=labeled_traces,
                k=k,
                seed=seed,
                threshold=threshold,
                candidate_id=candidate_id,
            )
            results.append(result)
        return results


def cross_validate_candidate(
    code: str,
    labeled_traces: List[LabeledTrace],
    k: int = 5,
    seed: Optional[int] = None,
    threshold: float = 0.5,
    candidate_id: Optional[str] = None,
    stability_threshold: float = 0.1,
) -> CrossValidationResult:
    """
    Convenience function for k-fold cross-validation.

    Args:
        code: Python code containing an eval_* or reward_* function
        labeled_traces: List of LabeledTrace objects
        k: Number of folds
        seed: Random seed for reproducibility
        threshold: Threshold for binary classification
        candidate_id: Optional identifier for the candidate
        stability_threshold: Maximum std_accuracy for is_stable=True

    Returns:
        CrossValidationResult with mean/std metrics
    """
    tester = CandidateTester()
    validator = CrossValidator(tester, stability_threshold=stability_threshold)
    return validator.cross_validate(
        code=code,
        labeled_traces=labeled_traces,
        k=k,
        seed=seed,
        threshold=threshold,
        candidate_id=candidate_id,
    )


__all__ = [
    "CrossValidator",
    "cross_validate_candidate",
]
