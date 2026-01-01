"""
Data models for iofold-eval-core.

This module provides dataclass models for:
- Traces and execution steps
- Feedback and labeled traces
- Reward and eval candidates
- Test results and cross-validation
"""

from .trace import (
    Message,
    ToolCall,
    ExecutionStep,
    Trace,
)

from .feedback import (
    Feedback,
    LabeledTrace,
)

from .candidate import (
    RewardCandidate,
    EvalCandidate,
)

from .results import (
    TestResult,
    ClusterResult,
    PairwiseComparison,
    FoldResult,
    CrossValidationResult,
)

__all__ = [
    # Trace models
    "Message",
    "ToolCall",
    "ExecutionStep",
    "Trace",
    # Feedback models
    "Feedback",
    "LabeledTrace",
    # Candidate models
    "RewardCandidate",
    "EvalCandidate",
    # Result models
    "TestResult",
    "ClusterResult",
    "PairwiseComparison",
    "FoldResult",
    "CrossValidationResult",
]
