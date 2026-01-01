"""
Deterministic trace splitting utilities.

Provides hash-based splitting that ensures the same trace always ends up
in the same split, regardless of when the split is performed.
"""

import hashlib
from typing import List, Tuple, Union, Literal

from ..models import Trace


# Type alias for split names
SplitName = Literal["train", "val", "test"]


def get_split(
    trace_id: str,
    train_ratio: float = 0.64,
    val_ratio: float = 0.16
) -> SplitName:
    """
    Deterministic train/val/test split based on trace ID hash.

    Uses MD5 hash to ensure the same trace always goes to the same split,
    regardless of when or how many times this function is called.

    Args:
        trace_id: Unique identifier for the trace
        train_ratio: Fraction of data for training (default: 0.64 = 64%)
        val_ratio: Fraction of data for validation (default: 0.16 = 16%)
                   Remaining goes to test (default: 0.20 = 20%)

    Returns:
        'train', 'val', or 'test'

    Example:
        >>> get_split("trace_abc123")
        'train'
        >>> get_split("trace_xyz789", train_ratio=0.8, val_ratio=0.1)
        'test'
    """
    # Validate ratios
    if train_ratio < 0 or val_ratio < 0:
        raise ValueError("Ratios must be non-negative")
    if train_ratio + val_ratio > 1.0:
        raise ValueError("train_ratio + val_ratio must not exceed 1.0")

    # Compute hash value in range [0, 100)
    hash_val = int(hashlib.md5(trace_id.encode()).hexdigest(), 16) % 100

    # Compute thresholds
    train_threshold = int(train_ratio * 100)
    val_threshold = train_threshold + int(val_ratio * 100)

    if hash_val < train_threshold:
        return "train"
    elif hash_val < val_threshold:
        return "val"
    else:
        return "test"


def _get_trace_id(trace: Union[Trace, dict]) -> str:
    """Extract trace ID from a Trace object or dict."""
    if isinstance(trace, dict):
        # Try trace_id first, then id
        return trace.get("trace_id") or trace.get("id", "")
    return trace.trace_id


def filter_by_split(
    traces: List[Union[Trace, dict]],
    split: SplitName,
    train_ratio: float = 0.64,
    val_ratio: float = 0.16
) -> List[Union[Trace, dict]]:
    """
    Filter traces to a specific split.

    Args:
        traces: List of Trace objects or dicts
        split: Target split name ('train', 'val', or 'test')
        train_ratio: Fraction of data for training (default: 0.64)
        val_ratio: Fraction of data for validation (default: 0.16)

    Returns:
        List of traces belonging to the specified split

    Example:
        >>> train_traces = filter_by_split(all_traces, 'train')
        >>> test_traces = filter_by_split(all_traces, 'test')
    """
    return [
        trace for trace in traces
        if get_split(_get_trace_id(trace), train_ratio, val_ratio) == split
    ]


def split_traces(
    traces: List[Union[Trace, dict]],
    train_ratio: float = 0.64,
    val_ratio: float = 0.16
) -> Tuple[List[Union[Trace, dict]], List[Union[Trace, dict]], List[Union[Trace, dict]]]:
    """
    Split traces into (train, val, test) lists.

    Uses deterministic hashing so the same trace always ends up in the
    same split, making results reproducible.

    Args:
        traces: List of Trace objects or dicts to split
        train_ratio: Fraction of data for training (default: 0.64 = 64%)
        val_ratio: Fraction of data for validation (default: 0.16 = 16%)
                   Remaining goes to test (default: 0.20 = 20%)

    Returns:
        Tuple of (train_traces, val_traces, test_traces)

    Example:
        >>> train, val, test = split_traces(all_traces)
        >>> len(train) / len(all_traces)  # Approximately 0.64
    """
    train: List[Union[Trace, dict]] = []
    val: List[Union[Trace, dict]] = []
    test: List[Union[Trace, dict]] = []

    for trace in traces:
        trace_id = _get_trace_id(trace)
        split = get_split(trace_id, train_ratio, val_ratio)

        if split == "train":
            train.append(trace)
        elif split == "val":
            val.append(trace)
        else:
            test.append(trace)

    return train, val, test
