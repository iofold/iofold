"""
Trace similarity and comparison utilities for iofold-eval-core.

Provides functions for finding similar traces and comparing trace pairs
using embeddings and LLM-as-judge evaluation.
"""

import json
from typing import List, Tuple, Union, Optional, TYPE_CHECKING

from ..models import PairwiseComparison, Trace
from .strategies import extract_first_message, extract_full_trace_text

if TYPE_CHECKING:
    from ..embeddings import EmbeddingClient


# Prompt template for LLM-based trace comparison
COMPARISON_PROMPT = """You are comparing two AI agent executions on similar tasks.

## Task A
{task_a}

## Execution A
{execution_a}

## Task B (similar to Task A)
{task_b}

## Execution B
{execution_b}

Which execution was better quality? Consider:
1. Correctness: Did the agent complete the task correctly?
2. Efficiency: Did the agent use appropriate tools and steps?
3. Edge case handling: Did the agent handle errors gracefully?

Respond with JSON: {{"winner": "a" or "b" or "tie", "reasoning": "brief explanation"}}
"""


def find_similar_traces(
    target_trace: Union[dict, Trace],
    candidate_traces: List[Union[dict, Trace]],
    embedding_client: "EmbeddingClient",
    top_k: int = 3,
    strategy: str = "first_message",
) -> List[Tuple[Union[dict, Trace], float]]:
    """
    Find traces with similar tasks using embedding similarity.

    Uses cosine similarity on embeddings to find the most similar traces
    to a target trace. Useful for finding comparison pairs or similar examples.

    Args:
        target_trace: The trace to find similar matches for
        candidate_traces: List of potential matching traces
        embedding_client: EmbeddingClient for generating embeddings
        top_k: Number of similar traces to return (default: 3)
        strategy: Text extraction strategy for similarity comparison
            ('first_message', 'full_trace', 'tool_pattern')

    Returns:
        List of (trace, similarity_score) tuples, sorted by similarity descending.
        Similarity scores are between 0 and 1 (1 = identical).

    Example:
        >>> similar = find_similar_traces(target, candidates, embedding_client)
        >>> for trace, score in similar:
        ...     print(f"Similarity: {score:.3f}")
        ...     print(f"Task: {extract_first_message(trace)[:50]}...")
    """
    if not candidate_traces:
        return []

    try:
        from scipy.spatial.distance import cosine
        import numpy as np
    except ImportError as e:
        raise ImportError(f"Requires scipy and numpy: {e}")

    # Get extraction function based on strategy
    from .strategies import get_strategy_function
    extract_fn = get_strategy_function(strategy)

    # Extract text from all traces
    target_text = extract_fn(target_trace)
    candidate_texts = [extract_fn(t) for t in candidate_traces]

    # Ensure no empty texts
    target_text = target_text if target_text else "empty"
    candidate_texts = [t if t else "empty" for t in candidate_texts]

    # Get embeddings for all texts at once (more efficient)
    all_texts = [target_text] + candidate_texts
    embeddings = embedding_client.embed(all_texts)

    target_emb = embeddings[0]
    candidate_embs = embeddings[1:]

    # Calculate cosine similarity for each candidate
    similarities = []
    for i, emb in enumerate(candidate_embs):
        # cosine() returns distance, so similarity = 1 - distance
        sim = 1 - cosine(target_emb, emb)
        # Handle NaN (can occur with zero vectors)
        if np.isnan(sim):
            sim = 0.0
        similarities.append((candidate_traces[i], float(sim)))

    # Sort by similarity descending
    similarities.sort(key=lambda x: x[1], reverse=True)

    return similarities[:top_k]


def find_most_similar(
    target_trace: Union[dict, Trace],
    candidate_traces: List[Union[dict, Trace]],
    embedding_client: "EmbeddingClient",
    min_similarity: float = 0.5,
) -> Optional[Tuple[Union[dict, Trace], float]]:
    """
    Find the single most similar trace above a threshold.

    Args:
        target_trace: The trace to find a match for
        candidate_traces: List of potential matching traces
        embedding_client: EmbeddingClient for generating embeddings
        min_similarity: Minimum similarity threshold (default: 0.5)

    Returns:
        (trace, similarity) tuple if found, None otherwise

    Example:
        >>> match = find_most_similar(trace, candidates, client, min_similarity=0.7)
        >>> if match:
        ...     similar_trace, score = match
        ...     print(f"Found match with similarity {score:.3f}")
    """
    similar = find_similar_traces(
        target_trace,
        candidate_traces,
        embedding_client,
        top_k=1,
    )

    if similar and similar[0][1] >= min_similarity:
        return similar[0]
    return None


def compare_traces(
    trace_a: Union[dict, Trace],
    trace_b: Union[dict, Trace],
    llm_client,
    similarity: float = 0.0,
) -> PairwiseComparison:
    """
    Compare two traces using LLM-as-judge evaluation.

    Sends both traces to an LLM to evaluate which execution was better.
    Useful for generating preference data or understanding quality differences.

    Args:
        trace_a: First trace to compare
        trace_b: Second trace to compare
        llm_client: LLM client with a generate() method
        similarity: Pre-computed similarity score (optional, for logging)

    Returns:
        PairwiseComparison with:
            - trace_a_id: ID of first trace
            - trace_b_id: ID of second trace
            - winner: 'a', 'b', or 'tie'
            - reasoning: LLM's explanation
            - similarity: The similarity score passed in

    Example:
        >>> comparison = compare_traces(trace_a, trace_b, llm_client)
        >>> print(f"Winner: {comparison.winner}")
        >>> print(f"Reason: {comparison.reasoning}")
    """
    # Extract trace IDs
    trace_a_id = trace_a.get("id", "unknown") if isinstance(trace_a, dict) else trace_a.id
    trace_b_id = trace_b.get("id", "unknown") if isinstance(trace_b, dict) else trace_b.id

    # Build the comparison prompt
    prompt = COMPARISON_PROMPT.format(
        task_a=extract_first_message(trace_a),
        task_b=extract_first_message(trace_b),
        execution_a=extract_full_trace_text(trace_a)[:1000],
        execution_b=extract_full_trace_text(trace_b)[:1000],
    )

    # Get LLM response
    response = llm_client.generate(prompt, temperature=0.1)

    # Parse the response
    winner, reasoning = _parse_comparison_response(response)

    return PairwiseComparison(
        trace_a_id=trace_a_id,
        trace_b_id=trace_b_id,
        winner=winner,
        reasoning=reasoning,
        similarity=similarity,
    )


def _parse_comparison_response(response: str) -> Tuple[str, str]:
    """
    Parse the LLM comparison response to extract winner and reasoning.

    Args:
        response: Raw LLM response text

    Returns:
        Tuple of (winner, reasoning)
    """
    try:
        clean = response.strip()

        # Handle markdown code blocks
        if clean.startswith("```"):
            # Extract content between code block markers
            lines = clean.split("```")
            if len(lines) >= 2:
                clean = lines[1]
                # Remove language identifier if present
                if clean.startswith("json"):
                    clean = clean[4:]

        clean = clean.strip()
        result = json.loads(clean)

        winner = result.get("winner", "tie")
        # Normalize winner value
        if winner.lower() in ["a", "trace_a", "execution_a"]:
            winner = "a"
        elif winner.lower() in ["b", "trace_b", "execution_b"]:
            winner = "b"
        else:
            winner = "tie"

        reasoning = result.get("reasoning", "")

        return winner, reasoning

    except (json.JSONDecodeError, AttributeError, KeyError):
        # If parsing fails, try to extract from raw text
        response_lower = response.lower()
        if "winner: a" in response_lower or "winner\":\"a" in response_lower:
            winner = "a"
        elif "winner: b" in response_lower or "winner\":\"b" in response_lower:
            winner = "b"
        else:
            winner = "tie"

        # Use first 200 chars as reasoning if we couldn't parse
        reasoning = response[:200]

        return winner, reasoning


def compute_pairwise_similarities(
    traces: List[Union[dict, Trace]],
    embedding_client: "EmbeddingClient",
    strategy: str = "first_message",
) -> List[List[float]]:
    """
    Compute pairwise similarity matrix for a list of traces.

    Args:
        traces: List of traces
        embedding_client: EmbeddingClient for generating embeddings
        strategy: Text extraction strategy

    Returns:
        n x n similarity matrix where entry [i][j] is similarity between
        trace i and trace j

    Example:
        >>> sim_matrix = compute_pairwise_similarities(traces, client)
        >>> # sim_matrix[0][1] = similarity between trace 0 and trace 1
    """
    if not traces:
        return []

    try:
        from scipy.spatial.distance import cdist
        import numpy as np
    except ImportError as e:
        raise ImportError(f"Requires scipy and numpy: {e}")

    from .strategies import get_strategy_function
    extract_fn = get_strategy_function(strategy)

    texts = [extract_fn(t) for t in traces]
    texts = [t if t else "empty" for t in texts]

    embeddings = embedding_client.embed(texts)

    # Compute cosine distances and convert to similarities
    distances = cdist(embeddings, embeddings, metric="cosine")
    similarities = 1 - distances

    # Handle NaN values
    similarities = np.nan_to_num(similarities, nan=0.0)

    return similarities.tolist()
