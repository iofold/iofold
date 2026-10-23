"""
Trace clustering utilities for iofold-eval-core.

Provides KMeans-based clustering of agent traces using different
text extraction strategies and embeddings.
"""

from typing import List, Optional, Union, TYPE_CHECKING

from ..models import ClusterResult, Trace
from .strategies import get_strategy_function

# Lazy imports to avoid circular dependencies
if TYPE_CHECKING:
    from ..embeddings import EmbeddingClient


def cluster_traces(
    traces: List[Union[dict, Trace]],
    strategy: str = "first_message",
    n_clusters: int = 5,
    embedding_client: Optional["EmbeddingClient"] = None,
    random_state: int = 42,
) -> ClusterResult:
    """
    Cluster traces using the specified strategy.

    Uses KMeans clustering on embeddings generated from trace text.
    The text extraction strategy determines what aspect of traces
    is used for similarity.

    Args:
        traces: List of trace dicts or Trace objects to cluster
        strategy: Text extraction strategy:
            - 'first_message': Cluster by initial user task (default)
            - 'full_trace': Cluster by entire conversation
            - 'tool_pattern': Cluster by tool usage sequence
        n_clusters: Number of clusters to create (default: 5)
        embedding_client: Optional EmbeddingClient instance.
            If None, creates a new one with default settings.
        random_state: Random seed for KMeans reproducibility (default: 42)

    Returns:
        ClusterResult with:
            - labels: Cluster assignment for each trace
            - centroids: Cluster center embeddings
            - strategy: The strategy used
            - silhouette: Silhouette score (cluster quality metric)
            - cluster_sizes: Dict mapping cluster ID to trace count

    Raises:
        ValueError: If strategy is not recognized or traces is empty

    Example:
        >>> from iofold_eval_core.clustering import cluster_traces
        >>> result = cluster_traces(traces, strategy='first_message', n_clusters=5)
        >>> print(f"Silhouette score: {result.silhouette:.3f}")
        >>> for i, size in result.cluster_sizes.items():
        ...     print(f"Cluster {i}: {size} traces")
    """
    if not traces:
        raise ValueError("Cannot cluster empty trace list")

    # Import numpy and sklearn here to allow module import without them
    try:
        import numpy as np
        from sklearn.cluster import KMeans
        from sklearn.metrics import silhouette_score
    except ImportError as e:
        raise ImportError(
            f"Clustering requires numpy and sklearn: {e}. "
            "Install with: pip install numpy scikit-learn"
        )

    # Get embedding client (lazy import to avoid circular deps)
    if embedding_client is None:
        from ..embeddings import EmbeddingClient
        embedding_client = EmbeddingClient()

    # Extract text using the specified strategy
    extract_fn = get_strategy_function(strategy)
    texts = [extract_fn(t) for t in traces]

    # Ensure no empty texts (replace with placeholder)
    texts = [t if t else "empty" for t in texts]

    # Generate embeddings
    embeddings = embedding_client.embed(texts)

    # Handle edge cases
    n_traces = len(traces)
    actual_n_clusters = min(n_clusters, n_traces)

    if actual_n_clusters < 2:
        # Can't cluster with fewer than 2 clusters
        labels = np.zeros(n_traces, dtype=int)
        centroids = embeddings.mean(axis=0, keepdims=True) if n_traces > 0 else np.array([[]])
        return ClusterResult(
            labels=labels,
            centroids=centroids,
            strategy=strategy,
            silhouette=0.0,
            cluster_sizes={0: n_traces},
        )

    # Perform KMeans clustering
    kmeans = KMeans(
        n_clusters=actual_n_clusters,
        random_state=random_state,
        n_init=10,
    )
    labels = kmeans.fit_predict(embeddings)

    # Calculate silhouette score if we have multiple clusters
    unique_labels = set(labels)
    if len(unique_labels) > 1:
        sil_score = silhouette_score(embeddings, labels)
    else:
        sil_score = 0.0

    # Calculate cluster sizes
    cluster_sizes = {}
    for i in range(actual_n_clusters):
        cluster_sizes[i] = int(np.sum(labels == i))

    return ClusterResult(
        labels=labels,
        centroids=kmeans.cluster_centers_,
        strategy=strategy,
        silhouette=sil_score,
        cluster_sizes=cluster_sizes,
    )


def get_cluster_traces(
    traces: List[Union[dict, Trace]],
    cluster_result: ClusterResult,
    cluster_id: int,
) -> List[Union[dict, Trace]]:
    """
    Get all traces belonging to a specific cluster.

    Args:
        traces: Original list of traces
        cluster_result: Result from cluster_traces()
        cluster_id: ID of the cluster to extract

    Returns:
        List of traces in the specified cluster

    Example:
        >>> result = cluster_traces(traces, n_clusters=5)
        >>> cluster_0 = get_cluster_traces(traces, result, 0)
        >>> print(f"Cluster 0 has {len(cluster_0)} traces")
    """
    try:
        import numpy as np
        labels = np.array(cluster_result.labels)
    except ImportError:
        labels = cluster_result.labels

    indices = [i for i, label in enumerate(labels) if label == cluster_id]
    return [traces[i] for i in indices]


def get_cluster_representatives(
    traces: List[Union[dict, Trace]],
    cluster_result: ClusterResult,
    embedding_client: Optional["EmbeddingClient"] = None,
    n_per_cluster: int = 1,
) -> List[Union[dict, Trace]]:
    """
    Get representative traces closest to each cluster centroid.

    Useful for understanding what each cluster represents.

    Args:
        traces: Original list of traces
        cluster_result: Result from cluster_traces()
        embedding_client: EmbeddingClient for computing embeddings
        n_per_cluster: Number of representatives per cluster (default: 1)

    Returns:
        List of representative traces (n_per_cluster * n_clusters)

    Example:
        >>> result = cluster_traces(traces, n_clusters=5)
        >>> reps = get_cluster_representatives(traces, result)
        >>> for i, rep in enumerate(reps):
        ...     print(f"Cluster {i}: {extract_first_message(rep)[:50]}...")
    """
    try:
        import numpy as np
        from scipy.spatial.distance import cdist
    except ImportError as e:
        raise ImportError(f"Requires numpy and scipy: {e}")

    if embedding_client is None:
        from ..embeddings import EmbeddingClient
        embedding_client = EmbeddingClient()

    extract_fn = get_strategy_function(cluster_result.strategy)
    texts = [extract_fn(t) for t in traces]
    texts = [t if t else "empty" for t in texts]
    embeddings = embedding_client.embed(texts)

    representatives = []
    labels = np.array(cluster_result.labels)
    centroids = np.array(cluster_result.centroids)

    for cluster_id in range(len(cluster_result.cluster_sizes)):
        # Get indices of traces in this cluster
        cluster_mask = labels == cluster_id
        cluster_indices = np.where(cluster_mask)[0]

        if len(cluster_indices) == 0:
            continue

        # Get embeddings for this cluster
        cluster_embeddings = embeddings[cluster_mask]
        centroid = centroids[cluster_id].reshape(1, -1)

        # Find traces closest to centroid
        distances = cdist(cluster_embeddings, centroid, metric="euclidean").flatten()
        sorted_indices = np.argsort(distances)

        # Get top n representatives
        for idx in sorted_indices[:n_per_cluster]:
            original_idx = cluster_indices[idx]
            representatives.append(traces[original_idx])

    return representatives
