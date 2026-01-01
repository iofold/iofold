"""
Trace extraction utilities for iofold-eval-core.

Provides functions to extract messages, tool calls, and quality signals
from agent execution traces.
"""

from .messages import (
    extract_user_message,
    extract_assistant_response,
    extract_all_messages,
    extract_system_message,
)

from .tools import (
    extract_tool_calls,
    extract_tool_pattern,
    extract_unique_tools,
    count_tool_calls,
    extract_tool_results,
    get_tool_call_count,
    has_tool_errors,
)

from .signals import (
    has_errors,
    extract_errors,
    detect_issues,
    get_step_count,
    get_trace_duration_ms,
    compute_quality_signals,
)

__all__ = [
    # Message extraction
    "extract_user_message",
    "extract_assistant_response",
    "extract_all_messages",
    "extract_system_message",
    # Tool extraction
    "extract_tool_calls",
    "extract_tool_pattern",
    "extract_unique_tools",
    "count_tool_calls",
    "extract_tool_results",
    "get_tool_call_count",
    "has_tool_errors",
    # Signal extraction
    "has_errors",
    "extract_errors",
    "detect_issues",
    "get_step_count",
    "get_trace_duration_ms",
    "compute_quality_signals",
]
