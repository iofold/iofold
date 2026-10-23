from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum


class EvalScore(BaseModel):
    """Structured output for LLM judge evaluation."""

    score: float = Field(
        ..., ge=0, le=1, description="Quality score from 0 (bad) to 1 (good)"
    )
    reasoning: str = Field(..., description="Brief explanation for the score")
    confidence: float = Field(
        0.8, ge=0, le=1, description="Confidence in this assessment"
    )


class PatternAnalysis(BaseModel):
    """Structured output for pattern analysis."""

    positive_patterns: List[str] = Field(default_factory=list)
    negative_patterns: List[str] = Field(default_factory=list)
    key_signals: List[str] = Field(default_factory=list)
    failure_modes: List[str] = Field(default_factory=list)


class GroundingAnalysis(BaseModel):
    """Structured output for grounding check."""

    has_tool_support: bool = Field(
        ..., description="Whether answer has tool result support"
    )
    specificity_level: str = Field(..., description="none/low/medium/high")
    hallucination_risk: float = Field(
        ..., ge=0, le=1, description="Risk of hallucination 0-1"
    )
    grounding_score: float = Field(
        ..., ge=0, le=1, description="How well grounded the answer is"
    )
    explanation: str


class CandidateFunction(BaseModel):
    """Structured output for generated eval function."""

    code: str = Field(..., description="Python function code")
    strategy: str = Field(..., description="What this function checks")
    expected_weight: float = Field(
        0.2, ge=0, le=1, description="Suggested weight in ensemble"
    )
