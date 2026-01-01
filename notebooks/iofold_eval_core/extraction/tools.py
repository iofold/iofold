"""
Tool call extraction utilities for agent traces.

Provides functions to extract tool calls and analyze tool usage patterns
from trace data, handling both Trace objects and raw dicts.
"""

import json
from typing import List, Union, Dict, Any, Optional

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


def extract_tool_calls(trace: Union[Trace, dict]) -> List[Dict[str, Any]]:
    """
    Extract all tool calls from a trace.

    Collects tool_calls from each execution step and returns them
    in execution order.

    Args:
        trace: A Trace object or dict containing trace data

    Returns:
        List of tool call dicts with 'tool_name', 'arguments', 'result', 'error' keys

    Example:
        >>> tool_calls = extract_tool_calls(trace)
        >>> for tc in tool_calls:
        ...     print(f"Called {tc['tool_name']} with {tc['arguments']}")
    """
    steps = _parse_steps(trace)
    tool_calls = []

    for step in steps:
        calls = step.get("tool_calls", [])
        if isinstance(calls, list):
            tool_calls.extend(calls)

    return tool_calls


def extract_tool_pattern(trace: Union[Trace, dict], separator: str = "->") -> str:
    """
    Extract tool call pattern as a string.

    Creates a human-readable representation of the tool call sequence,
    useful for pattern analysis and clustering.

    Args:
        trace: A Trace object or dict containing trace data
        separator: String to use between tool names (default: '->')

    Returns:
        Tool call pattern string (e.g., 'search->read->write')
        Empty string if no tool calls found

    Example:
        >>> pattern = extract_tool_pattern(trace)
        >>> print(pattern)  # 'search->read->edit->save'
    """
    tool_calls = extract_tool_calls(trace)

    if not tool_calls:
        return ""

    tool_names = [tc.get("tool_name", "unknown") for tc in tool_calls]
    return separator.join(tool_names)


def extract_unique_tools(trace: Union[Trace, dict]) -> List[str]:
    """
    Extract unique tool names used in a trace.

    Args:
        trace: A Trace object or dict containing trace data

    Returns:
        List of unique tool names in order of first appearance

    Example:
        >>> tools = extract_unique_tools(trace)
        >>> print(tools)  # ['search', 'read', 'write']
    """
    tool_calls = extract_tool_calls(trace)
    seen = set()
    unique = []

    for tc in tool_calls:
        tool_name = tc.get("tool_name", "unknown")
        if tool_name not in seen:
            seen.add(tool_name)
            unique.append(tool_name)

    return unique


def count_tool_calls(trace: Union[Trace, dict]) -> Dict[str, int]:
    """
    Count occurrences of each tool in a trace.

    Args:
        trace: A Trace object or dict containing trace data

    Returns:
        Dict mapping tool names to call counts

    Example:
        >>> counts = count_tool_calls(trace)
        >>> print(counts)  # {'search': 3, 'read': 5, 'write': 1}
    """
    tool_calls = extract_tool_calls(trace)
    counts: Dict[str, int] = {}

    for tc in tool_calls:
        tool_name = tc.get("tool_name", "unknown")
        counts[tool_name] = counts.get(tool_name, 0) + 1

    return counts


def extract_tool_results(trace: Union[Trace, dict]) -> List[Dict[str, Any]]:
    """
    Extract tool calls with their results.

    Args:
        trace: A Trace object or dict containing trace data

    Returns:
        List of dicts with 'tool_name', 'result', 'error', and 'success' keys
    """
    tool_calls = extract_tool_calls(trace)
    results = []

    for tc in tool_calls:
        results.append({
            "tool_name": tc.get("tool_name", "unknown"),
            "arguments": tc.get("arguments", {}),
            "result": tc.get("result"),
            "error": tc.get("error"),
            "success": tc.get("error") is None,
        })

    return results


def get_tool_call_count(trace: Union[Trace, dict]) -> int:
    """
    Get total number of tool calls in a trace.

    Args:
        trace: A Trace object or dict containing trace data

    Returns:
        Total count of tool calls
    """
    return len(extract_tool_calls(trace))


def has_tool_errors(trace: Union[Trace, dict]) -> bool:
    """
    Check if any tool call in the trace resulted in an error.

    Args:
        trace: A Trace object or dict containing trace data

    Returns:
        True if any tool call has an error, False otherwise
    """
    tool_calls = extract_tool_calls(trace)

    for tc in tool_calls:
        if tc.get("error"):
            return True

    return False
