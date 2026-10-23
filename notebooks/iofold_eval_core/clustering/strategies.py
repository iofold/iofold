"""
Text extraction strategies for trace clustering.

Provides functions to extract text from traces in different ways,
which affects how traces are grouped during clustering.
"""

import json
from typing import Union, List, Dict, Any

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


def extract_first_message(trace: Union[Trace, dict], max_length: int = 500) -> str:
    """
    Extract the first user message from a trace for clustering.

    This is the most common strategy as it captures the task intent.

    Args:
        trace: A Trace object or dict containing trace data
        max_length: Maximum length of returned text (default: 500)

    Returns:
        The first user message content, truncated to max_length
        Returns 'empty' if no message found

    Example:
        >>> text = extract_first_message(trace)
        >>> print(text[:100])  # 'Please help me write a function...'
    """
    steps = _parse_steps(trace)

    for step in steps:
        messages = step.get("messages_added", [])
        for msg in messages:
            if msg.get("role") == "user":
                content = msg.get("content", "")
                if content:
                    return content[:max_length]

    # Fallback: check input_preview if available
    if isinstance(trace, dict):
        preview = trace.get("input_preview", "")
    else:
        preview = getattr(trace, "input_preview", "") or ""

    return preview[:max_length] if preview else "empty"


def extract_full_trace_text(trace: Union[Trace, dict], max_length: int = 2000) -> str:
    """
    Extract all text content from a trace for clustering.

    Concatenates all message content, providing a comprehensive view
    of the entire interaction. Useful for clustering by execution pattern.

    Args:
        trace: A Trace object or dict containing trace data
        max_length: Maximum length of returned text (default: 2000)

    Returns:
        Concatenated text from all messages, truncated to max_length
        Returns 'empty' if no content found

    Example:
        >>> text = extract_full_trace_text(trace)
        >>> # Contains user messages, assistant responses, etc.
    """
    steps = _parse_steps(trace)
    texts = []

    for step in steps:
        messages = step.get("messages_added", [])
        for msg in messages:
            content = msg.get("content", "")
            if content:
                # Truncate individual messages to avoid one dominating
                texts.append(content[:200])

    full_text = " ".join(texts)
    return full_text[:max_length] if full_text else "empty"


def extract_tool_pattern(trace: Union[Trace, dict]) -> str:
    """
    Extract the sequence of tool calls as a string for clustering.

    Creates a string representation of tool usage patterns,
    useful for clustering by execution behavior rather than content.

    Args:
        trace: A Trace object or dict containing trace data

    Returns:
        Tool sequence string (e.g., 'search -> read -> write')
        Returns 'no_tools' if no tool calls found

    Example:
        >>> pattern = extract_tool_pattern(trace)
        >>> print(pattern)  # 'search -> read -> edit -> write'
    """
    steps = _parse_steps(trace)
    tools = []

    for step in steps:
        tool_calls = step.get("tool_calls", [])
        if isinstance(tool_calls, list):
            for tc in tool_calls:
                # Handle different tool call formats
                tool_name = tc.get("tool_name", tc.get("name", "unknown"))
                tools.append(tool_name)

    return " -> ".join(tools) if tools else "no_tools"


def get_strategy_function(strategy: str):
    """
    Get the extraction function for a strategy name.

    Args:
        strategy: One of 'first_message', 'full_trace', 'tool_pattern'

    Returns:
        The corresponding extraction function

    Raises:
        ValueError: If strategy is not recognized
    """
    strategies = {
        "first_message": extract_first_message,
        "full_trace": extract_full_trace_text,
        "tool_pattern": extract_tool_pattern,
    }

    if strategy not in strategies:
        raise ValueError(
            f"Unknown strategy: {strategy}. "
            f"Valid options: {list(strategies.keys())}"
        )

    return strategies[strategy]
