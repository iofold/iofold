"""
Serialization utilities for trace data.

Provides functions to convert between trace representations
for use in eval functions and other processing.
"""

import json
from typing import Union, Dict, Any, List

from ..models import Trace


def trace_to_dict_for_eval(trace: Union[Trace, dict]) -> Dict[str, Any]:
    """
    Convert trace to dict format expected by eval functions.

    Ensures JSON fields are parsed and the dict contains all fields
    needed by Python eval functions.

    Args:
        trace: A Trace object or dict containing trace data

    Returns:
        Dict with parsed JSON fields, ready for eval function consumption

    Example:
        >>> trace_dict = trace_to_dict_for_eval(trace)
        >>> result = eval_function(trace_dict)
    """
    if isinstance(trace, Trace):
        return {
            "id": trace.id,
            "trace_id": trace.trace_id,
            "workspace_id": trace.workspace_id,
            "integration_id": trace.integration_id,
            "source": trace.source,
            "timestamp": trace.timestamp,
            "imported_at": trace.imported_at,
            "steps": trace.steps,
            "raw_data": trace.raw_data,
            "metadata": trace.metadata,
            "input_preview": trace.input_preview,
            "output_preview": trace.output_preview,
            "step_count": trace.step_count,
            "has_errors": trace.has_errors,
            "agent_version_id": trace.agent_version_id,
            "assignment_status": trace.assignment_status,
        }

    # Already a dict - parse JSON fields if needed
    result = dict(trace)

    # Parse steps if it's a JSON string
    if isinstance(result.get("steps"), str):
        try:
            result["steps"] = json.loads(result["steps"])
        except json.JSONDecodeError:
            result["steps"] = []

    # Parse raw_data if it's a JSON string
    if isinstance(result.get("raw_data"), str):
        try:
            result["raw_data"] = json.loads(result["raw_data"]) if result["raw_data"] else None
        except json.JSONDecodeError:
            result["raw_data"] = None

    # Parse metadata if it's a JSON string
    if isinstance(result.get("metadata"), str):
        try:
            result["metadata"] = json.loads(result["metadata"]) if result["metadata"] else None
        except json.JSONDecodeError:
            result["metadata"] = None

    return result


def dict_to_trace(data: Dict[str, Any]) -> Trace:
    """
    Convert a dict to a Trace object.

    Args:
        data: Dict containing trace data

    Returns:
        Trace object

    Example:
        >>> trace = dict_to_trace(trace_dict)
        >>> print(trace.id)
    """
    # First ensure JSON fields are parsed
    parsed = trace_to_dict_for_eval(data)
    return Trace.from_dict(parsed)


def serialize_for_storage(trace: Union[Trace, dict]) -> Dict[str, str]:
    """
    Serialize trace for database storage.

    Converts nested objects to JSON strings suitable for SQLite storage.

    Args:
        trace: A Trace object or dict containing trace data

    Returns:
        Dict with JSON-encoded fields (steps, raw_data, metadata as strings)
    """
    trace_dict = trace_to_dict_for_eval(trace)

    result = dict(trace_dict)

    # Serialize nested fields as JSON strings
    if result.get("steps") is not None:
        result["steps"] = json.dumps(result["steps"])

    if result.get("raw_data") is not None:
        result["raw_data"] = json.dumps(result["raw_data"])

    if result.get("metadata") is not None:
        result["metadata"] = json.dumps(result["metadata"])

    return result


def normalize_trace(trace: Union[Trace, dict]) -> Dict[str, Any]:
    """
    Normalize trace to a consistent dict format.

    Ensures all expected fields exist with appropriate defaults.

    Args:
        trace: A Trace object or dict containing trace data

    Returns:
        Normalized dict with all fields present
    """
    trace_dict = trace_to_dict_for_eval(trace)

    # Ensure all expected fields exist
    defaults = {
        "id": "",
        "trace_id": "",
        "workspace_id": "",
        "integration_id": "",
        "source": "",
        "timestamp": "",
        "imported_at": "",
        "steps": [],
        "raw_data": None,
        "metadata": None,
        "input_preview": None,
        "output_preview": None,
        "step_count": 0,
        "has_errors": False,
        "agent_version_id": None,
        "assignment_status": "unassigned",
    }

    for key, default in defaults.items():
        if key not in trace_dict or trace_dict[key] is None:
            # Don't override None if the field explicitly allows None
            if key not in ["raw_data", "metadata", "input_preview", "output_preview", "agent_version_id"]:
                trace_dict[key] = default

    # Calculate step_count if not present
    if trace_dict.get("step_count", 0) == 0 and trace_dict.get("steps"):
        trace_dict["step_count"] = len(trace_dict["steps"])

    return trace_dict


def extract_eval_context(trace: Union[Trace, dict]) -> Dict[str, Any]:
    """
    Extract a minimal context dict for eval functions.

    Returns only the fields typically needed by eval functions,
    reducing memory usage for batch processing.

    Args:
        trace: A Trace object or dict containing trace data

    Returns:
        Minimal dict with essential fields for eval
    """
    trace_dict = trace_to_dict_for_eval(trace)

    return {
        "id": trace_dict.get("id", ""),
        "trace_id": trace_dict.get("trace_id", ""),
        "source": trace_dict.get("source", ""),
        "timestamp": trace_dict.get("timestamp", ""),
        "steps": trace_dict.get("steps", []),
        "metadata": trace_dict.get("metadata"),
        "has_errors": trace_dict.get("has_errors", False),
    }
