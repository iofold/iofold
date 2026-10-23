# notebooks/iofold_eval_core/llm/__init__.py
"""LLM client utilities for iofold-eval-core."""

# Legacy client exports (for backwards compatibility)
from .client import (
    LLMClient,
    OpenAIClient,
    create_llm_client,
)

# Structured output schemas
from .schemas import (
    EvalScore,
    PatternAnalysis,
    GroundingAnalysis,
    CandidateFunction,
)

# Structured LLM client
from .structured_client import StructuredLLMClient

__all__ = [
    # Legacy
    "LLMClient",
    "OpenAIClient",
    "create_llm_client",
    # Schemas
    "EvalScore",
    "PatternAnalysis",
    "GroundingAnalysis",
    "CandidateFunction",
    # Structured client
    "StructuredLLMClient",
]
