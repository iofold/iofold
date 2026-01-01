"""
Signal extraction utilities for agent traces.

Provides functions to detect errors, issues, and quality signals
from trace data, handling both Trace objects and raw dicts.
"""

import json
from typing import List, Union, Dict, Any, Set

from ..models import Trace


def _parse_steps(trace: Union[Trace, dict]) -> List[Dict[str, Any]]:
    """
    Parse steps from a trace, handling both Trace objects and dicts.

    Handles the case where steps might be a JSON string (from DB row).
    """
    if isinstance(trace, dict):
        steps = trace.get("steps", [])
        if isinstance(steps, str):
            try:
                steps = json.loads(steps)
            except json.JSONDecodeError:
                return []
    else:
        steps = trace.steps

    return steps if isinstance(steps, list) else []


def has_errors(trace: Union[Trace, dict]) -> bool:
    """
    Check if a trace has any errors.

    Checks the trace-level has_errors flag, step-level errors,
    and tool call errors.

    Args:
        trace: A Trace object or dict containing trace data

    Returns:
        True if any errors are found, False otherwise

    Example:
        >>> if has_errors(trace):
        ...     print("Trace contains errors")
    """
    # Check trace-level flag first
    if isinstance(trace, dict):
        if trace.get("has_errors"):
            return True
    else:
        if trace.has_errors:
            return True

    # Check steps for errors
    steps = _parse_steps(trace)

    for step in steps:
        # Step-level error
        if step.get("error"):
            return True

        # Tool call errors
        for tool_call in step.get("tool_calls", []):
            if tool_call.get("error"):
                return True

    return False


def extract_errors(trace: Union[Trace, dict]) -> List[Dict[str, Any]]:
    """
    Extract all errors from a trace.

    Args:
        trace: A Trace object or dict containing trace data

    Returns:
        List of error dicts with 'source', 'step_id', 'error' keys
    """
    errors = []
    steps = _parse_steps(trace)

    for step in steps:
        step_id = step.get("step_id", "unknown")

        # Step-level error
        if step.get("error"):
            errors.append({
                "source": "step",
                "step_id": step_id,
                "error": step["error"],
            })

        # Tool call errors
        for tool_call in step.get("tool_calls", []):
            if tool_call.get("error"):
                errors.append({
                    "source": "tool_call",
                    "step_id": step_id,
                    "tool_name": tool_call.get("tool_name", "unknown"),
                    "error": tool_call["error"],
                })

    return errors


def detect_issues(trace: Union[Trace, dict]) -> List[str]:
    """
    Detect common issues in a trace.

    Analyzes the trace for patterns that indicate problems:
    - errors: Any error occurred during execution
    - loops: Same tool called repeatedly with same arguments
    - inefficiency: Excessive tool calls or retries
    - empty_response: No meaningful assistant response
    - tool_failures: Multiple tool call failures

    Args:
        trace: A Trace object or dict containing trace data

    Returns:
        List of issue identifiers found

    Example:
        >>> issues = detect_issues(trace)
        >>> if 'loops' in issues:
        ...     print("Trace contains repetitive patterns")
    """
    issues: List[str] = []

    # Check for errors
    if has_errors(trace):
        issues.append("errors")

    steps = _parse_steps(trace)

    # Check for empty/missing response
    if not _has_assistant_response(steps):
        issues.append("empty_response")

    # Collect all tool calls for analysis
    all_tool_calls = []
    for step in steps:
        all_tool_calls.extend(step.get("tool_calls", []))

    # Check for loops (same tool with same args called multiple times)
    if _detect_loops(all_tool_calls):
        issues.append("loops")

    # Check for inefficiency (excessive tool calls)
    if len(all_tool_calls) > 20:
        issues.append("inefficiency")

    # Check for multiple tool failures
    failure_count = sum(1 for tc in all_tool_calls if tc.get("error"))
    if failure_count >= 3:
        issues.append("tool_failures")

    # Check for excessive retries of same tool
    if _detect_excessive_retries(all_tool_calls):
        issues.append("excessive_retries")

    return issues


def _has_assistant_response(steps: List[Dict[str, Any]]) -> bool:
    """Check if there's a meaningful assistant response in the steps."""
    for step in reversed(steps):
        messages = step.get("messages_added", [])
        for msg in reversed(messages):
            if msg.get("role") == "assistant":
                content = msg.get("content", "")
                if content and len(content.strip()) > 0:
                    return True

        # Also check output
        output = step.get("output")
        if output and isinstance(output, str) and len(output.strip()) > 0:
            return True

    return False


def _detect_loops(tool_calls: List[Dict[str, Any]]) -> bool:
    """
    Detect if the same tool is called repeatedly with identical arguments.

    Returns True if a tool is called 3+ times with the same arguments.
    """
    # Create fingerprints for each tool call
    fingerprints: Dict[str, int] = {}

    for tc in tool_calls:
        tool_name = tc.get("tool_name", "")
        args = tc.get("arguments", {})

        # Create a fingerprint from tool name and sorted arguments
        try:
            args_str = json.dumps(args, sort_keys=True)
        except (TypeError, ValueError):
            args_str = str(args)

        fingerprint = f"{tool_name}:{args_str}"
        fingerprints[fingerprint] = fingerprints.get(fingerprint, 0) + 1

        if fingerprints[fingerprint] >= 3:
            return True

    return False


def _detect_excessive_retries(tool_calls: List[Dict[str, Any]]) -> bool:
    """
    Detect if any tool is called excessively (more than 5 times).
    """
    tool_counts: Dict[str, int] = {}

    for tc in tool_calls:
        tool_name = tc.get("tool_name", "")
        tool_counts[tool_name] = tool_counts.get(tool_name, 0) + 1

        if tool_counts[tool_name] > 5:
            return True

    return False


def get_step_count(trace: Union[Trace, dict]) -> int:
    """
    Get the number of execution steps in a trace.

    Args:
        trace: A Trace object or dict containing trace data

    Returns:
        Number of steps
    """
    if isinstance(trace, dict):
        count = trace.get("step_count")
        if count is not None:
            return count

    steps = _parse_steps(trace)
    return len(steps)


def get_trace_duration_ms(trace: Union[Trace, dict]) -> int:
    """
    Estimate trace duration from step timestamps.

    Args:
        trace: A Trace object or dict containing trace data

    Returns:
        Duration in milliseconds, or 0 if cannot be determined
    """
    steps = _parse_steps(trace)

    if len(steps) < 2:
        return 0

    try:
        from datetime import datetime

        first_ts = steps[0].get("timestamp")
        last_ts = steps[-1].get("timestamp")

        if first_ts and last_ts:
            # Try parsing ISO format
            first_dt = datetime.fromisoformat(first_ts.replace("Z", "+00:00"))
            last_dt = datetime.fromisoformat(last_ts.replace("Z", "+00:00"))
            delta = last_dt - first_dt
            return int(delta.total_seconds() * 1000)
    except (ValueError, TypeError):
        pass

    return 0


def compute_quality_signals(trace: Union[Trace, dict]) -> Dict[str, Any]:
    """
    Compute a comprehensive set of quality signals for a trace.

    Returns a dict with various metrics useful for eval generation
    and quality analysis.

    Args:
        trace: A Trace object or dict containing trace data

    Returns:
        Dict with quality signals
    """
    steps = _parse_steps(trace)
    all_tool_calls = []
    for step in steps:
        all_tool_calls.extend(step.get("tool_calls", []))

    issues = detect_issues(trace)

    return {
        "has_errors": has_errors(trace),
        "step_count": len(steps),
        "tool_call_count": len(all_tool_calls),
        "unique_tools": len(set(tc.get("tool_name", "") for tc in all_tool_calls)),
        "tool_error_count": sum(1 for tc in all_tool_calls if tc.get("error")),
        "issues": issues,
        "issue_count": len(issues),
        "has_response": _has_assistant_response(steps),
        "duration_ms": get_trace_duration_ms(trace),
    }
