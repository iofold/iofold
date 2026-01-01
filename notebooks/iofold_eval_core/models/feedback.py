"""
Feedback data models for iofold-eval-core.

These models represent human feedback and labeled traces.
"""

from dataclasses import dataclass
from typing import Optional, Any, Dict

from .trace import Trace


@dataclass
class Feedback:
    """Represents human feedback on a trace."""
    id: str
    trace_id: str
    agent_id: Optional[str]
    rating: str  # 'positive' | 'negative' | 'neutral'
    rating_detail: Optional[str]
    created_at: str

    @classmethod
    def from_row(cls, row: Dict[str, Any]) -> "Feedback":
        """Create Feedback from database row."""
        return cls(
            id=row["id"],
            trace_id=row["trace_id"],
            agent_id=row.get("agent_id"),
            rating=row["rating"],
            rating_detail=row.get("rating_detail"),
            created_at=row["created_at"],
        )

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Feedback":
        """Create Feedback from a dictionary."""
        return cls(
            id=data["id"],
            trace_id=data["trace_id"],
            agent_id=data.get("agent_id"),
            rating=data.get("rating", "neutral"),
            rating_detail=data.get("rating_detail"),
            created_at=data.get("created_at", ""),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert Feedback to dictionary."""
        return {
            "id": self.id,
            "trace_id": self.trace_id,
            "agent_id": self.agent_id,
            "rating": self.rating,
            "rating_detail": self.rating_detail,
            "created_at": self.created_at,
        }


@dataclass
class LabeledTrace:
    """
    A trace combined with human feedback score.

    Used for training and evaluating reward functions.
    """
    trace: Trace
    human_score: float  # 0.0 to 1.0 (0=negative, 0.5=neutral, 1=positive)
    feedback_text: Optional[str] = None
    feedback_id: Optional[str] = None

    @classmethod
    def from_trace_and_feedback(
        cls,
        trace: Trace,
        feedback: Optional[Feedback] = None,
        human_score: Optional[float] = None,
    ) -> "LabeledTrace":
        """
        Create LabeledTrace from a Trace and optional Feedback.

        If human_score is not provided, it's derived from the feedback rating.
        """
        if human_score is not None:
            score = human_score
        elif feedback is not None:
            # Map rating to score
            rating_to_score = {
                "positive": 1.0,
                "negative": 0.0,
                "neutral": 0.5,
            }
            score = rating_to_score.get(feedback.rating, 0.5)
        else:
            score = 0.5  # Default to neutral

        return cls(
            trace=trace,
            human_score=score,
            feedback_text=feedback.rating_detail if feedback else None,
            feedback_id=feedback.id if feedback else None,
        )

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "LabeledTrace":
        """Create LabeledTrace from a dictionary."""
        trace_data = data.get("trace", data)
        trace = Trace.from_dict(trace_data) if isinstance(trace_data, dict) else trace_data

        return cls(
            trace=trace,
            human_score=float(data.get("human_score", 0.5)),
            feedback_text=data.get("feedback_text") or data.get("rating_detail"),
            feedback_id=data.get("feedback_id"),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert LabeledTrace to dictionary."""
        return {
            "trace": self.trace.to_dict() if hasattr(self.trace, "to_dict") else self.trace,
            "human_score": self.human_score,
            "feedback_text": self.feedback_text,
            "feedback_id": self.feedback_id,
        }

    @property
    def trace_id(self) -> str:
        """Get the trace ID for convenience."""
        return self.trace.id

    @property
    def rating(self) -> str:
        """Get the rating label derived from human_score."""
        if self.human_score >= 0.7:
            return "positive"
        elif self.human_score <= 0.3:
            return "negative"
        else:
            return "neutral"
