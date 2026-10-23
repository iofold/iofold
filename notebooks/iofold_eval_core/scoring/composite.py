# notebooks/iofold_eval_core/scoring/composite.py
"""Composite reward function that combines multiple evaluators."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
from .base import BaseEvaluator, EvalResult

@dataclass
class CompositeResult:
    """Result from composite scoring."""
    final_score: float  # 0-1 bounded
    feedback: str  # Combined feedback
    component_scores: Dict[str, EvalResult]  # Per-evaluator results
    weights_used: Dict[str, float]  # Actual weights applied

class CompositeScorer:
    """
    Combines multiple evaluators into a single reward function.

    Final score = clamp(Σ(score_i * weight_i) + adjustments, 0, 1)
    """

    def __init__(self):
        self.evaluators: List[Tuple[BaseEvaluator, float]] = []
        self.adjustments: List[callable] = []

    def add_evaluator(self, evaluator: BaseEvaluator, weight: float = None):
        """Add an evaluator with optional custom weight."""
        w = weight if weight is not None else evaluator.default_weight
        self.evaluators.append((evaluator, w))
        return self  # Allow chaining

    def add_adjustment(self, fn: callable):
        """
        Add an adjustment function.

        fn(trace, component_scores) -> float adjustment (-1 to +1)
        """
        self.adjustments.append(fn)
        return self

    def normalize_weights(self):
        """Normalize weights to sum to 1."""
        total = sum(w for _, w in self.evaluators)
        if total > 0:
            self.evaluators = [(e, w/total) for e, w in self.evaluators]

    def evaluate(self, trace: Dict[str, Any], ctx: Optional[Any] = None) -> CompositeResult:
        """Run all evaluators and combine scores."""

        component_scores = {}
        weights_used = {}

        # Run each evaluator
        weighted_sum = 0.0
        total_weight = 0.0
        feedback_parts = []

        for evaluator, weight in self.evaluators:
            try:
                result = evaluator.evaluate(trace, ctx)
                component_scores[evaluator.name] = result
                weights_used[evaluator.name] = weight

                # Weight by both configured weight and confidence
                effective_weight = weight * result.confidence
                weighted_sum += result.score * effective_weight
                total_weight += effective_weight

                feedback_parts.append(f"{evaluator.name}: {result.score:.2f} ({result.feedback[:50]})")
            except Exception as e:
                # On error, skip this evaluator
                component_scores[evaluator.name] = EvalResult(
                    score=0.5, feedback=f"Error: {str(e)}", confidence=0.0
                )

        # Calculate base score
        if total_weight > 0:
            base_score = weighted_sum / total_weight
        else:
            base_score = 0.5  # Default neutral

        # Apply adjustments
        adjustment = 0.0
        for adj_fn in self.adjustments:
            try:
                adj = adj_fn(trace, component_scores)
                adjustment += adj
            except:
                pass

        # Final score, clamped to [0, 1]
        final_score = max(0.0, min(1.0, base_score + adjustment))

        return CompositeResult(
            final_score=final_score,
            feedback=" | ".join(feedback_parts),
            component_scores=component_scores,
            weights_used=weights_used,
        )

    def __call__(self, trace: Dict[str, Any], ctx: Optional[Any] = None) -> Tuple[float, str]:
        """Callable interface returning (score, feedback)."""
        result = self.evaluate(trace, ctx)
        return (result.final_score, result.feedback)
