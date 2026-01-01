"""
iofold-eval-core: Core utilities for agent trace evaluation.

This package provides tools for working with agent execution traces,
including splitting, extraction, and quality signal detection.

Example usage:
    from iofold_eval_core import Trace, get_split, extract_user_message

    # Load and split traces
    train, val, test = split_traces(traces)

    # Extract data from a trace
    user_msg = extract_user_message(trace)
    tool_pattern = extract_tool_pattern(trace)

    # Check for issues
    if has_errors(trace):
        issues = detect_issues(trace)
"""

# Models
from .models import (
    Message,
    ToolCall,
    ExecutionStep,
    Trace,
    Feedback,
    LabeledTrace,
    RewardCandidate,
    EvalCandidate,
    TestResult,
    ClusterResult,
    PairwiseComparison,
    FoldResult,
    CrossValidationResult,
)

# Splitting utilities
from .splitting import (
    get_split,
    filter_by_split,
    split_traces,
    SplitName,
)

# Extraction utilities
from .extraction import (
    # Messages
    extract_user_message,
    extract_assistant_response,
    extract_all_messages,
    extract_system_message,
    # Tools
    extract_tool_calls,
    extract_tool_pattern,
    extract_unique_tools,
    count_tool_calls,
    extract_tool_results,
    get_tool_call_count,
    has_tool_errors,
    # Signals
    has_errors,
    extract_errors,
    detect_issues,
    get_step_count,
    get_trace_duration_ms,
    compute_quality_signals,
)

# Serialization utilities
from .utils import (
    trace_to_dict_for_eval,
    dict_to_trace,
    serialize_for_storage,
    normalize_trace,
    extract_eval_context,
)

__version__ = "0.1.0"

__all__ = [
    # Version
    "__version__",
    # Models
    "Message",
    "ToolCall",
    "ExecutionStep",
    "Trace",
    "Feedback",
    "LabeledTrace",
    "RewardCandidate",
    "EvalCandidate",
    "TestResult",
    "ClusterResult",
    "PairwiseComparison",
    "FoldResult",
    "CrossValidationResult",
    # Splitting
    "get_split",
    "filter_by_split",
    "split_traces",
    "SplitName",
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
    # Serialization
    "trace_to_dict_for_eval",
    "dict_to_trace",
    "serialize_for_storage",
    "normalize_trace",
    "extract_eval_context",
]
