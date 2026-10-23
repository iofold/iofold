"""
TF-IDF embedding module for iofold-eval-core.

Provides TF-IDF based embeddings as a fallback when no API is available.
Pure Python implementation with no external API dependencies.
"""

from typing import List, Optional, Dict, Set
from collections import Counter
import math
import re


class TFIDFEmbedding:
    """
    TF-IDF based embeddings as fallback (no API needed).

    This provides a simple, deterministic embedding method that doesn't
    require any external API calls. Useful for:
    - Offline/local development
    - Testing without API costs
    - Baseline comparisons

    Args:
        vocab_size: Maximum vocabulary size (default: 1000)
        min_df: Minimum document frequency for a term to be included (default: 1)
        max_df_ratio: Maximum document frequency ratio (default: 0.95)
        lowercase: Whether to lowercase text (default: True)
        ngram_range: Tuple of (min_n, max_n) for n-grams (default: (1, 1))

    Example:
        >>> tfidf = TFIDFEmbedding(vocab_size=500)
        >>> tfidf.fit(["hello world", "goodbye world", "hello there"])
        >>> embeddings = tfidf.embed(["hello world", "new text"])
    """

    def __init__(
        self,
        vocab_size: int = 1000,
        min_df: int = 1,
        max_df_ratio: float = 0.95,
        lowercase: bool = True,
        ngram_range: tuple = (1, 1),
    ):
        self.vocab_size = vocab_size
        self.min_df = min_df
        self.max_df_ratio = max_df_ratio
        self.lowercase = lowercase
        self.ngram_range = ngram_range

        # Fitted attributes
        self._vocabulary: Dict[str, int] = {}
        self._idf: Dict[str, float] = {}
        self._fitted = False

    @property
    def vocabulary(self) -> Dict[str, int]:
        """Get the vocabulary mapping (term -> index)."""
        return self._vocabulary.copy()

    @property
    def is_fitted(self) -> bool:
        """Check if the model has been fitted."""
        return self._fitted

    def _tokenize(self, text: str) -> List[str]:
        """Tokenize text into words/n-grams."""
        if self.lowercase:
            text = text.lower()

        # Simple word tokenization (alphanumeric + underscores)
        words = re.findall(r"\b\w+\b", text)

        # Generate n-grams
        tokens = []
        min_n, max_n = self.ngram_range

        for n in range(min_n, max_n + 1):
            for i in range(len(words) - n + 1):
                ngram = " ".join(words[i : i + n])
                tokens.append(ngram)

        return tokens

    def fit(self, texts: List[str]) -> "TFIDFEmbedding":
        """
        Fit vocabulary from texts.

        Args:
            texts: List of documents to learn vocabulary from

        Returns:
            self (for method chaining)
        """
        if not texts:
            self._vocabulary = {}
            self._idf = {}
            self._fitted = True
            return self

        n_docs = len(texts)
        max_df = int(self.max_df_ratio * n_docs)

        # Count document frequencies
        doc_freq: Counter = Counter()
        for text in texts:
            unique_tokens = set(self._tokenize(text))
            doc_freq.update(unique_tokens)

        # Filter by document frequency thresholds
        valid_terms = [
            term
            for term, freq in doc_freq.items()
            if self.min_df <= freq <= max_df
        ]

        # Sort by frequency (descending) and take top vocab_size terms
        valid_terms.sort(key=lambda t: doc_freq[t], reverse=True)
        valid_terms = valid_terms[: self.vocab_size]

        # Build vocabulary
        self._vocabulary = {term: idx for idx, term in enumerate(valid_terms)}

        # Compute IDF values: log(N / df) + 1 (smoothed)
        self._idf = {
            term: math.log(n_docs / doc_freq[term]) + 1
            for term in self._vocabulary
        }

        self._fitted = True
        return self

    def _compute_tf(self, tokens: List[str]) -> Dict[str, float]:
        """Compute term frequency for tokens."""
        tf: Counter = Counter(tokens)
        # Normalize by document length
        doc_len = len(tokens) if tokens else 1
        return {term: count / doc_len for term, count in tf.items()}

    def embed(self, texts: List[str]) -> List[List[float]]:
        """
        Get TF-IDF vectors for texts.

        Args:
            texts: List of texts to embed

        Returns:
            List of TF-IDF vectors (one per input text)

        Raises:
            ValueError: If the model hasn't been fitted
        """
        if not self._fitted:
            raise ValueError(
                "TFIDFEmbedding must be fitted before calling embed(). "
                "Call fit() first."
            )

        if not texts:
            return []

        embeddings = []
        vocab_size = len(self._vocabulary)

        for text in texts:
            tokens = self._tokenize(text)
            tf = self._compute_tf(tokens)

            # Build TF-IDF vector
            vector = [0.0] * vocab_size
            for term, tf_value in tf.items():
                if term in self._vocabulary:
                    idx = self._vocabulary[term]
                    idf_value = self._idf[term]
                    vector[idx] = tf_value * idf_value

            # L2 normalize
            norm = math.sqrt(sum(v * v for v in vector))
            if norm > 0:
                vector = [v / norm for v in vector]

            embeddings.append(vector)

        return embeddings

    def embed_single(self, text: str) -> List[float]:
        """
        Get TF-IDF vector for a single text.

        Args:
            text: Text to embed

        Returns:
            TF-IDF vector

        Raises:
            ValueError: If the model hasn't been fitted
        """
        embeddings = self.embed([text])
        return embeddings[0] if embeddings else []

    def fit_embed(self, texts: List[str]) -> List[List[float]]:
        """
        Fit vocabulary and get embeddings in one step.

        Convenience method that combines fit() and embed().

        Args:
            texts: List of texts to fit and embed

        Returns:
            List of TF-IDF vectors (one per input text)
        """
        self.fit(texts)
        return self.embed(texts)

    def get_feature_names(self) -> List[str]:
        """
        Get feature names (vocabulary terms) in order.

        Returns:
            List of terms in vocabulary order
        """
        if not self._fitted:
            return []

        names = [""] * len(self._vocabulary)
        for term, idx in self._vocabulary.items():
            names[idx] = term
        return names


def create_tfidf_embedding(
    vocab_size: int = 1000,
    min_df: int = 1,
    max_df_ratio: float = 0.95,
    ngram_range: tuple = (1, 1),
) -> TFIDFEmbedding:
    """
    Factory function to create TF-IDF embedding.

    Args:
        vocab_size: Maximum vocabulary size (default: 1000)
        min_df: Minimum document frequency (default: 1)
        max_df_ratio: Maximum document frequency ratio (default: 0.95)
        ngram_range: Tuple of (min_n, max_n) for n-grams (default: (1, 1))

    Returns:
        TFIDFEmbedding instance

    Example:
        >>> tfidf = create_tfidf_embedding(vocab_size=500)
        >>> tfidf.fit(corpus)
        >>> embeddings = tfidf.embed(["new document"])
    """
    return TFIDFEmbedding(
        vocab_size=vocab_size,
        min_df=min_df,
        max_df_ratio=max_df_ratio,
        ngram_range=ngram_range,
    )
