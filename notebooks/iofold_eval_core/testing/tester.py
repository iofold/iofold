"""
Candidate tester for evaluating reward/eval functions against labeled traces.

This module provides the CandidateTester class for running eval candidates
against labeled traces and computing quality metrics.
"""

import logging
from typing import Any, Dict, List, Optional

from ..models import LabeledTrace, TestResult
from ..sandbox import execute_reward_function
from ..metrics import (
    calculate_confusion_matrix,
    accuracy,
    precision,
    recall,
    f1_score,
    pearson_correlation,
    cohen_kappa,
)

logger = logging.getLogger(__name__)


class CandidateTester:
    """
    Tests eval candidates against labeled traces.

    Executes eval functions in a sandboxed environment and computes
    quality metrics by comparing predictions to human labels.

    Example usage:
        tester = CandidateTester()
        result = tester.test_candidate(
            code='''
            def eval_quality(trace, ctx=None):
                if trace.get('has_errors'):
                    return 0.0, "Has errors"
                return 1.0, "No errors"
            ''',
            labeled_traces=traces,
            threshold=0.5
        )
        print(f"Accuracy: {result.accuracy}")
        print(f"Cohen's Kappa: {result.cohen_kappa}")
    """

    def __init__(
        self,
        timeout: float = 5.0,
        ctx: Optional[Any] = None,
    ):
        """
        Initialize the CandidateTester.

        Args:
            timeout: Execution timeout per trace in seconds
            ctx: Optional context object for eval functions
        """
        self.timeout = timeout
        self.ctx = ctx

    def test_candidate(
        self,
        code: str,
        labeled_traces: List[LabeledTrace],
        threshold: float = 0.5,
    ) -> TestResult:
        """
        Test an eval function against labeled traces.

        Executes the eval function on each trace and computes quality metrics
        by comparing predicted scores to human labels.

        Args:
            code: Python code containing an eval_* or reward_* function
            labeled_traces: List of LabeledTrace objects with human scores
            threshold: Threshold for binary classification (default: 0.5)

        Returns:
            TestResult with:
            - accuracy: Binary accuracy at threshold
            - pearson_r: Pearson correlation between predicted and human scores
            - cohen_kappa: Cohen's kappa statistic
            - f1_score: F1 score for binary classification
            - total: Total number of traces
            - correct: Number of correct predictions
            - incorrect: Number of incorrect predictions
            - errors: Number of execution errors
            - predictions: List of per-trace prediction dicts
        """
        if not labeled_traces:
            return TestResult(
                accuracy=0.0,
                pearson_r=0.0,
                cohen_kappa=0.0,
                f1_score=0.0,
                total=0,
                correct=0,
                incorrect=0,
                errors=0,
                predictions=[],
            )

        predictions: List[Dict[str, Any]] = []
        pred_scores: List[float] = []
        human_scores: List[float] = []
        error_count = 0

        for labeled_trace in labeled_traces:
            trace = labeled_trace.trace
            human_score = labeled_trace.human_score

            # Convert trace to dict for execution
            trace_dict = trace.to_dict() if hasattr(trace, "to_dict") else dict(trace)

            prediction_entry: Dict[str, Any] = {
                "trace_id": trace.id if hasattr(trace, "id") else trace_dict.get("id", "unknown"),
                "human_score": human_score,
                "predicted_score": None,
                "feedback": None,
                "error": None,
                "correct": False,
            }

            try:
                score, feedback = execute_reward_function(
                    code=code,
                    trace=trace_dict,
                    ctx=self.ctx,
                    timeout=self.timeout,
                )

                prediction_entry["predicted_score"] = score
                prediction_entry["feedback"] = feedback

                # Determine if prediction is correct
                pred_positive = score >= threshold
                human_positive = human_score >= threshold
                is_correct = pred_positive == human_positive

                prediction_entry["correct"] = is_correct

                pred_scores.append(score)
                human_scores.append(human_score)

            except Exception as e:
                error_count += 1
                prediction_entry["error"] = str(e)
                logger.warning(
                    f"Error evaluating trace {prediction_entry['trace_id']}: {e}"
                )
                # Count errors as incorrect predictions
                # Use default score of 0.0 for metrics calculation
                pred_scores.append(0.0)
                human_scores.append(human_score)

            predictions.append(prediction_entry)

        # Calculate metrics using the metrics module interface
        total = len(labeled_traces)
        correct = sum(1 for p in predictions if p.get("correct", False))
        incorrect = total - correct - error_count

        # Calculate confusion matrix (metrics module uses float lists with threshold)
        cm = calculate_confusion_matrix(
            y_pred=pred_scores,
            y_true=human_scores,
            threshold=threshold,
        )

        # Calculate all metrics
        acc = accuracy(cm)
        pearson_r = pearson_correlation(pred_scores, human_scores)
        kappa = cohen_kappa(cm, total)
        f1 = f1_score(cm)

        # Build confusion matrix dict for compatibility
        confusion = {
            "tp": cm["true_positive"],
            "tn": cm["true_negative"],
            "fp": cm["false_positive"],
            "fn": cm["false_negative"],
        }

        # Create result
        result = TestResult(
            accuracy=acc,
            pearson_r=pearson_r,
            cohen_kappa=kappa,
            f1_score=f1,
            total=total,
            correct=correct,
            incorrect=incorrect,
            errors=error_count,
            predictions=predictions,
        )

        # Store confusion matrix as additional data in predictions
        if predictions:
            predictions.append({"_confusion_matrix": confusion})

        return result

    def test_multiple(
        self,
        candidates: List[str],
        labeled_traces: List[LabeledTrace],
        threshold: float = 0.5,
    ) -> List[TestResult]:
        """
        Test multiple eval candidates against the same labeled traces.

        Args:
            candidates: List of Python code strings
            labeled_traces: List of LabeledTrace objects
            threshold: Threshold for binary classification

        Returns:
            List of TestResult objects, one per candidate
        """
        results = []
        for code in candidates:
            result = self.test_candidate(code, labeled_traces, threshold)
            results.append(result)
        return results


def test_eval_function(
    code: str,
    labeled_traces: List[LabeledTrace],
    threshold: float = 0.5,
    timeout: float = 5.0,
    ctx: Optional[Any] = None,
) -> TestResult:
    """
    Convenience function to test an eval function.

    Args:
        code: Python code containing an eval_* or reward_* function
        labeled_traces: List of LabeledTrace objects
        threshold: Threshold for binary classification
        timeout: Execution timeout per trace
        ctx: Optional context object

    Returns:
        TestResult with quality metrics
    """
    tester = CandidateTester(timeout=timeout, ctx=ctx)
    return tester.test_candidate(code, labeled_traces, threshold)


__all__ = [
    "CandidateTester",
    "test_eval_function",
]
