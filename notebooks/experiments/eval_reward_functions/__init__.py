"""
Eval/Reward Function Experiments

This package contains experiments for generating composite reward functions
for the ART-E email task evaluation.

Experiments:
- exp3_deterministic_first: Deterministic rules with LLM fallback
"""

from .exp3_deterministic_first import (
    eval_deterministic_first,
    DETERMINISTIC_RULES,
    TraceWithFeedback,
    compute_features,
    apply_cascade,
    EvalResult,
    CascadeMetrics,
)

__all__ = [
    'eval_deterministic_first',
    'DETERMINISTIC_RULES',
    'TraceWithFeedback',
    'compute_features',
    'apply_cascade',
    'EvalResult',
    'CascadeMetrics',
]
