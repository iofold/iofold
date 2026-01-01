"""
Trace splitting utilities for iofold-eval-core.

Provides deterministic splitting of traces into train/val/test sets
using hash-based assignment for reproducibility.
"""

from .deterministic import (
    get_split,
    filter_by_split,
    split_traces,
    SplitName,
)

__all__ = [
    "get_split",
    "filter_by_split",
    "split_traces",
    "SplitName",
]
