"""
Message extraction utilities for agent traces.

Provides functions to extract user messages and assistant responses
from trace data, handling both Trace objects and raw dicts.
"""

import json
from typing import Optional, Union, List, Any, Dict

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


def extract_user_message(trace: Union[Trace, dict]) -> Optional[str]:
    """
    Extract the first user message from a trace.

    Searches through execution steps to find the first message with role='user'.

    Args:
        trace: A Trace object or dict containing trace data

    Returns:
        The user message content, or None if not found

    Example:
        >>> user_msg = extract_user_message(trace)
        >>> if user_msg:
        ...     print(f"User asked: {user_msg[:100]}...")
    """
    steps = _parse_steps(trace)

    for step in steps:
        messages = step.get("messages_added", [])
        for msg in messages:
            if msg.get("role") == "user":
                content = msg.get("content", "")
                if content:
                    return content

    # Fallback: check input_preview if available
    if isinstance(trace, dict):
        preview = trace.get("input_preview")
    else:
        preview = trace.input_preview

    return preview if preview else None


def extract_assistant_response(trace: Union[Trace, dict]) -> Optional[str]:
    """
    Extract the final assistant response from a trace.

    Searches through execution steps in reverse order to find the last
    assistant message or output.

    Args:
        trace: A Trace object or dict containing trace data

    Returns:
        The assistant response content, or None if not found

    Example:
        >>> response = extract_assistant_response(trace)
        >>> if response:
        ...     print(f"Assistant replied: {response[:100]}...")
    """
    steps = _parse_steps(trace)

    # Look for the last assistant message
    for step in reversed(steps):
        messages = step.get("messages_added", [])
        for msg in reversed(messages):
            if msg.get("role") == "assistant":
                content = msg.get("content", "")
                if content:
                    return content

        # Also check step output
        output = step.get("output")
        if output and isinstance(output, str):
            return output

    # Fallback: check output_preview if available
    if isinstance(trace, dict):
        preview = trace.get("output_preview")
    else:
        preview = trace.output_preview

    return preview if preview else None


def extract_all_messages(trace: Union[Trace, dict]) -> List[Dict[str, Any]]:
    """
    Extract all messages from a trace in order.

    Args:
        trace: A Trace object or dict containing trace data

    Returns:
        List of message dicts with 'role' and 'content' keys

    Example:
        >>> messages = extract_all_messages(trace)
        >>> for msg in messages:
        ...     print(f"{msg['role']}: {msg['content'][:50]}...")
    """
    steps = _parse_steps(trace)
    all_messages = []

    for step in steps:
        messages = step.get("messages_added", [])
        all_messages.extend(messages)

    return all_messages


def extract_system_message(trace: Union[Trace, dict]) -> Optional[str]:
    """
    Extract the system message (prompt) from a trace.

    Args:
        trace: A Trace object or dict containing trace data

    Returns:
        The system message content, or None if not found
    """
    steps = _parse_steps(trace)

    for step in steps:
        messages = step.get("messages_added", [])
        for msg in messages:
            if msg.get("role") == "system":
                content = msg.get("content", "")
                if content:
                    return content

    return None
