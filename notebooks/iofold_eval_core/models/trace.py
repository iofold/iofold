"""
Trace data models for iofold-eval-core.

These models represent agent execution traces and their components.
"""

from dataclasses import dataclass, field
from typing import Optional, Any, TypedDict, List, Dict
import json


class Message(TypedDict, total=False):
    """A message in an execution trace."""
    role: str  # 'user' | 'assistant' | 'system'
    content: str
    metadata: Optional[Dict[str, Any]]


class ToolCall(TypedDict, total=False):
    """A tool call within an execution step."""
    tool_name: str
    arguments: Dict[str, Any]
    result: Optional[Any]
    error: Optional[str]


class ExecutionStep(TypedDict, total=False):
    """A single execution step in a trace."""
    step_id: str
    timestamp: str
    messages_added: List[Message]
    tool_calls: List[ToolCall]
    input: Any
    output: Any
    error: Optional[str]
    metadata: Dict[str, Any]


@dataclass
class Trace:
    """Represents an agent execution trace."""
    id: str
    trace_id: str
    workspace_id: str
    integration_id: str
    source: str
    timestamp: str
    imported_at: str
    steps: List[ExecutionStep]
    raw_data: Optional[Dict[str, Any]]
    metadata: Optional[Dict[str, Any]]
    input_preview: Optional[str]
    output_preview: Optional[str]
    step_count: int
    has_errors: bool
    agent_version_id: Optional[str]
    assignment_status: str

    @classmethod
    def from_row(cls, row: Dict[str, Any]) -> "Trace":
        """Create Trace from database row (with JSON string parsing)."""
        return cls(
            id=row["id"],
            trace_id=row["trace_id"],
            workspace_id=row["workspace_id"],
            integration_id=row["integration_id"],
            source=row["source"],
            timestamp=row["timestamp"],
            imported_at=row["imported_at"],
            steps=json.loads(row["steps"]) if isinstance(row.get("steps"), str) else (row.get("steps") or []),
            raw_data=json.loads(row["raw_data"]) if isinstance(row.get("raw_data"), str) and row["raw_data"] else row.get("raw_data"),
            metadata=json.loads(row["metadata"]) if isinstance(row.get("metadata"), str) and row["metadata"] else row.get("metadata"),
            input_preview=row.get("input_preview"),
            output_preview=row.get("output_preview"),
            step_count=row.get("step_count", 0),
            has_errors=bool(row.get("has_errors", False)),
            agent_version_id=row.get("agent_version_id"),
            assignment_status=row.get("assignment_status", "unassigned"),
        )

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Trace":
        """Create Trace from a dictionary (no JSON parsing, values already deserialized)."""
        return cls(
            id=data["id"],
            trace_id=data.get("trace_id", data["id"]),
            workspace_id=data.get("workspace_id", ""),
            integration_id=data.get("integration_id", ""),
            source=data.get("source", ""),
            timestamp=data.get("timestamp", ""),
            imported_at=data.get("imported_at", ""),
            steps=data.get("steps", []),
            raw_data=data.get("raw_data"),
            metadata=data.get("metadata"),
            input_preview=data.get("input_preview"),
            output_preview=data.get("output_preview"),
            step_count=data.get("step_count", len(data.get("steps", []))),
            has_errors=bool(data.get("has_errors", False)),
            agent_version_id=data.get("agent_version_id"),
            assignment_status=data.get("assignment_status", "unassigned"),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert Trace to dictionary."""
        return {
            "id": self.id,
            "trace_id": self.trace_id,
            "workspace_id": self.workspace_id,
            "integration_id": self.integration_id,
            "source": self.source,
            "timestamp": self.timestamp,
            "imported_at": self.imported_at,
            "steps": self.steps,
            "raw_data": self.raw_data,
            "metadata": self.metadata,
            "input_preview": self.input_preview,
            "output_preview": self.output_preview,
            "step_count": self.step_count,
            "has_errors": self.has_errors,
            "agent_version_id": self.agent_version_id,
            "assignment_status": self.assignment_status,
        }
