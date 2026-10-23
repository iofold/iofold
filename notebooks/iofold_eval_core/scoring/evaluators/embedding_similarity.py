# notebooks/iofold_eval_core/scoring/evaluators/embedding_similarity.py
"""Embedding similarity evaluator - compares output using semantic embeddings."""

from typing import Any, Dict, Optional

from ..base import BaseEvaluator, EvalResult
from ...embeddings import EmbeddingClient


class EmbeddingSimilarityEvaluator(BaseEvaluator):
    """
    Evaluator that uses semantic embeddings to compare actual vs expected output.

    Computes cosine similarity between embeddings of the agent's output_preview
    and the expected output from metadata. This provides a semantic similarity
    score that captures meaning rather than exact text matching.

    Args:
        embedding_client: Optional EmbeddingClient instance. If not provided,
                         creates a new client with default settings.

    Example:
        >>> evaluator = EmbeddingSimilarityEvaluator()
        >>> trace = {
        ...     'output_preview': 'The meeting is at 3pm',
        ...     'metadata': {'expectedOutput': 'Meeting scheduled for 3:00 PM'}
        ... }
        >>> result = evaluator.evaluate(trace)
        >>> print(f"Score: {result.score}, Similarity: {result.metadata['similarity']}")
    """

    name = "embedding_similarity"
    description = "Semantic similarity between output and expected output using embeddings"
    default_weight = 0.25

    def __init__(self, embedding_client: Optional[EmbeddingClient] = None):
        """
        Initialize the embedding similarity evaluator.

        Args:
            embedding_client: Optional EmbeddingClient instance. If None,
                            creates a default client.
        """
        self.embedding_client = embedding_client or EmbeddingClient()

    def _compute_cosine_similarity(self, emb1: list[float], emb2: list[float]) -> float:
        """
        Compute cosine similarity between two embedding vectors.

        Args:
            emb1: First embedding vector
            emb2: Second embedding vector

        Returns:
            Cosine similarity score between -1 and 1 (typically 0 to 1 for text)
        """
        try:
            import numpy as np
        except ImportError:
            raise ImportError(
                "numpy is required for cosine similarity computation. "
                "Install with: pip install numpy"
            )

        # Convert to numpy arrays
        a = np.array(emb1)
        b = np.array(emb2)

        # Compute cosine similarity
        dot_product = np.dot(a, b)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)

        # Handle zero vectors
        if norm_a == 0 or norm_b == 0:
            return 0.0

        similarity = dot_product / (norm_a * norm_b)

        # Handle potential NaN
        if np.isnan(similarity):
            return 0.0

        return float(similarity)

    def _map_similarity_to_score(self, similarity: float) -> tuple[float, str]:
        """
        Map cosine similarity (0-1) to evaluation score (0-1) with feedback.

        Uses a mapping where high similarity (0.8+) maps to high scores,
        and low similarity maps to low scores. The relationship is roughly linear
        but with some amplification at the high end.

        Args:
            similarity: Cosine similarity between 0 and 1

        Returns:
            Tuple of (score, feedback_message)
        """
        # Map similarity to score
        # Similarity >= 0.9: Excellent match (score: 0.95-1.0)
        # Similarity >= 0.8: Good match (score: 0.8-0.95)
        # Similarity >= 0.6: Moderate match (score: 0.5-0.8)
        # Similarity >= 0.4: Weak match (score: 0.3-0.5)
        # Similarity < 0.4: Poor match (score: 0.0-0.3)

        if similarity >= 0.9:
            score = 0.95 + (similarity - 0.9) * 0.5  # Maps 0.9-1.0 to 0.95-1.0
            feedback = f"Excellent semantic match (similarity: {similarity:.3f})"
        elif similarity >= 0.8:
            score = 0.8 + (similarity - 0.8) * 1.5  # Maps 0.8-0.9 to 0.8-0.95
            feedback = f"Good semantic match (similarity: {similarity:.3f})"
        elif similarity >= 0.6:
            score = 0.5 + (similarity - 0.6) * 1.5  # Maps 0.6-0.8 to 0.5-0.8
            feedback = f"Moderate semantic similarity (similarity: {similarity:.3f})"
        elif similarity >= 0.4:
            score = 0.3 + (similarity - 0.4) * 1.0  # Maps 0.4-0.6 to 0.3-0.5
            feedback = f"Weak semantic similarity (similarity: {similarity:.3f})"
        else:
            score = similarity * 0.75  # Maps 0.0-0.4 to 0.0-0.3
            feedback = f"Poor semantic match (similarity: {similarity:.3f})"

        return score, feedback

    def evaluate(self, trace: Dict[str, Any], ctx: Optional[Any] = None) -> EvalResult:
        """
        Evaluate trace by comparing output_preview to expected output using embeddings.

        Args:
            trace: Trace dict with 'output_preview' and optionally
                  'metadata.expectedOutput'
            ctx: Optional context (not used by this evaluator)

        Returns:
            EvalResult with:
                - score: 0-1 score based on semantic similarity
                - feedback: Human-readable explanation
                - confidence: 0.75 for valid comparisons, 0.2 for missing data
                - metadata: Contains raw similarity score and embedding info
        """
        # Extract actual output
        actual_output = trace.get('output_preview', '') or ''

        # Extract expected output from metadata
        expected_output = None
        metadata = trace.get('metadata', {})
        if isinstance(metadata, dict):
            expected_output = metadata.get('expectedOutput', '') or ''

        # Handle missing data cases
        if not actual_output and not expected_output:
            return EvalResult(
                score=0.5,
                feedback="Both actual and expected outputs are empty",
                confidence=0.2,
                metadata={'similarity': None, 'reason': 'both_empty'}
            )

        if not expected_output:
            return EvalResult(
                score=0.5,
                feedback="No expected output provided for comparison",
                confidence=0.2,
                metadata={'similarity': None, 'reason': 'no_expected'}
            )

        if not actual_output:
            return EvalResult(
                score=0.0,
                feedback="No actual output provided",
                confidence=0.2,
                metadata={'similarity': 0.0, 'reason': 'no_actual'}
            )

        # Compute embeddings for both texts
        try:
            embeddings = self.embedding_client.embed([actual_output, expected_output])
            actual_emb = embeddings[0]
            expected_emb = embeddings[1]

            # Compute cosine similarity
            similarity = self._compute_cosine_similarity(actual_emb, expected_emb)

            # Map similarity to score
            score, feedback = self._map_similarity_to_score(similarity)

            return EvalResult(
                score=score,
                feedback=feedback,
                confidence=0.75,
                metadata={
                    'similarity': similarity,
                    'actual_length': len(actual_output),
                    'expected_length': len(expected_output),
                    'embedding_model': self.embedding_client.model,
                }
            )

        except Exception as e:
            # Handle embedding errors gracefully
            return EvalResult(
                score=0.3,
                feedback=f"Error computing embeddings: {str(e)[:100]}",
                confidence=0.1,
                metadata={'similarity': None, 'error': str(e)[:200]}
            )
