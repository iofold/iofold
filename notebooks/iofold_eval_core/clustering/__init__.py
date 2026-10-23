"""
Clustering utilities for iofold-eval-core.

Provides functions for:
- Clustering traces by task similarity, execution pattern, or tool usage
- Finding similar traces using embedding-based similarity
- Comparing traces using LLM-as-judge evaluation

Example usage:
    >>> from iofold_eval_core.clustering import cluster_traces, find_similar_traces
    >>> from iofold_eval_core.embeddings import EmbeddingClient
    >>>
    >>> # Cluster traces by first user message
    >>> result = cluster_traces(traces, strategy='first_message', n_clusters=5)
    >>> print(f"Silhouette score: {result.silhouette:.3f}")
    >>>
    >>> # Find similar traces
    >>> similar = find_similar_traces(target, candidates, EmbeddingClient())
    >>> for trace, score in similar:
    ...     print(f"Similarity: {score:.3f}")
"""

from .strategies import (
    extract_first_message,
    extract_full_trace_text,
    extract_tool_pattern,
    get_strategy_function,
)

from .cluster import (
    cluster_traces,
    get_cluster_traces,
    get_cluster_representatives,
)

from .similarity import (
    find_similar_traces,
    find_most_similar,
    compare_traces,
    compute_pairwise_similarities,
    COMPARISON_PROMPT,
)

__all__ = [
    # Extraction strategies
    "extract_first_message",
    "extract_full_trace_text",
    "extract_tool_pattern",
    "get_strategy_function",
    # Clustering
    "cluster_traces",
    "get_cluster_traces",
    "get_cluster_representatives",
    # Similarity
    "find_similar_traces",
    "find_most_similar",
    "compare_traces",
    "compute_pairwise_similarities",
    "COMPARISON_PROMPT",
]
