"""
Testing utilities for iofold-eval-core.

This module provides tools for testing and validating eval candidates:

- CandidateTester: Test eval functions against labeled traces
- CrossValidator: K-fold cross-validation for stability assessment
- WinnerSelector: Select best candidate from multiple options

Example usage:
    from iofold_eval_core.testing import (
        CandidateTester,
        CrossValidator,
        WinnerSelector,
        test_eval_function,
        cross_validate_candidate,
        select_best_candidate,
    )

    # Test a single candidate
    tester = CandidateTester()
    result = tester.test_candidate(code, labeled_traces)
    print(f"Accuracy: {result.accuracy}, Kappa: {result.cohen_kappa}")

    # Cross-validate for stability
    validator = CrossValidator(tester)
    cv_result = validator.cross_validate(code, labeled_traces, k=5)
    print(f"Mean accuracy: {cv_result.mean_accuracy} +/- {cv_result.std_accuracy}")

    # Select best from multiple candidates
    selector = WinnerSelector()
    winner = selector.select_winner(candidates, min_accuracy=0.7, min_kappa=0.4)
"""

from .tester import (
    CandidateTester,
    test_eval_function,
)

from .cross_validator import (
    CrossValidator,
    cross_validate_candidate,
)

from .winner_selector import (
    WinnerSelector,
    select_best_candidate,
    DEFAULT_WEIGHTS,
)

__all__ = [
    # Tester
    "CandidateTester",
    "test_eval_function",
    # Cross-validator
    "CrossValidator",
    "cross_validate_candidate",
    # Winner selector
    "WinnerSelector",
    "select_best_candidate",
    "DEFAULT_WEIGHTS",
]
