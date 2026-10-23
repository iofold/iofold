# notebooks/iofold_eval_core/scoring/base.py
"""Base classes for evaluators in the composite scoring system."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

@dataclass
class EvalResult:
    """Result from a single evaluator."""
    score: float  # 0-1, where 0=bad, 1=good
    feedback: str  # Human-readable explanation
    confidence: float = 1.0  # How confident is this score
    metadata: Optional[Dict[str, Any]] = None  # Extra info for debugging

class BaseEvaluator(ABC):
    """Base class for all evaluators."""

    name: str = "base"
    description: str = "Base evaluator"
    default_weight: float = 0.2

    @abstractmethod
    def evaluate(self, trace: Dict[str, Any], ctx: Optional[Any] = None) -> EvalResult:
        """
        Evaluate a trace and return a score.

        Args:
            trace: Trace dict with steps, output_preview, etc.
            ctx: Optional context (e.g., expected output)

        Returns:
            EvalResult with score in [0, 1]
        """
        pass

    def __call__(self, trace: Dict[str, Any], ctx: Optional[Any] = None) -> EvalResult:
        return self.evaluate(trace, ctx)
