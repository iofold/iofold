"""
Utility functions for iofold-eval-core.

Provides serialization, normalization, and conversion utilities
for working with trace data.
"""

from .serialization import (
    trace_to_dict_for_eval,
    dict_to_trace,
    serialize_for_storage,
    normalize_trace,
    extract_eval_context,
)

__all__ = [
    "trace_to_dict_for_eval",
    "dict_to_trace",
    "serialize_for_storage",
    "normalize_trace",
    "extract_eval_context",
]
