"""
Embedding client module for iofold-eval-core.

Provides OpenAI-compatible embedding client that works with Cloudflare AI Gateway.
Uses lazy initialization to avoid importing openai until needed.
"""

from typing import Optional, List, Protocol
import os


class EmbeddingClientProtocol(Protocol):
    """Protocol for embedding clients."""

    def embed(self, texts: List[str]) -> List[List[float]]:
        """Get embeddings for a list of texts."""
        ...

    def embed_single(self, text: str) -> List[float]:
        """Get embedding for a single text."""
        ...


class EmbeddingClient:
    """
    Text embedding client using OpenAI embeddings.

    Supports lazy initialization - the OpenAI client is only created
    when first needed, avoiding import errors if openai is not installed.

    Args:
        model: Embedding model identifier (default: text-embedding-3-small)
        api_key: OpenAI API key (falls back to OPENAI_API_KEY env var)
        base_url: Base URL for API (falls back to OPENAI_BASE_URL env var)
                  Use this for Cloudflare AI Gateway compatibility.
        dimensions: Optional dimension reduction (for models that support it)

    Example:
        >>> client = EmbeddingClient()
        >>> embeddings = client.embed(["Hello world", "Goodbye world"])
        >>> single = client.embed_single("Hello world")

        # With Cloudflare AI Gateway:
        >>> client = EmbeddingClient(
        ...     base_url="https://gateway.ai.cloudflare.com/v1/..."
        ... )
    """

    def __init__(
        self,
        model: str = "text-embedding-3-small",
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        dimensions: Optional[int] = None,
    ):
        self.model = model
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.base_url = base_url or os.getenv("OPENAI_BASE_URL")
        self.dimensions = dimensions
        self._client = None

    def _get_client(self):
        """Lazy initialization of OpenAI client."""
        if self._client is None:
            try:
                from openai import OpenAI
            except ImportError:
                raise ImportError(
                    "openai package is required for EmbeddingClient. "
                    "Install with: pip install openai"
                )

            kwargs = {"api_key": self.api_key}
            if self.base_url:
                kwargs["base_url"] = self.base_url

            self._client = OpenAI(**kwargs)
        return self._client

    def embed(self, texts: List[str]) -> List[List[float]]:
        """
        Get embeddings for a list of texts.

        Args:
            texts: List of texts to embed

        Returns:
            List of embedding vectors (one per input text)

        Raises:
            ImportError: If openai package is not installed
            openai.APIError: If the API request fails
            ValueError: If texts list is empty
        """
        if not texts:
            return []

        client = self._get_client()

        # Build request kwargs
        kwargs = {
            "model": self.model,
            "input": texts,
        }
        if self.dimensions is not None:
            kwargs["dimensions"] = self.dimensions

        response = client.embeddings.create(**kwargs)

        # Sort by index to ensure correct ordering
        sorted_data = sorted(response.data, key=lambda x: x.index)
        return [item.embedding for item in sorted_data]

    def embed_single(self, text: str) -> List[float]:
        """
        Get embedding for a single text.

        Args:
            text: Text to embed

        Returns:
            Embedding vector

        Raises:
            ImportError: If openai package is not installed
            openai.APIError: If the API request fails
        """
        embeddings = self.embed([text])
        return embeddings[0]

    def embed_batch(
        self, texts: List[str], batch_size: int = 100
    ) -> List[List[float]]:
        """
        Get embeddings for a large list of texts in batches.

        This is useful for embedding large datasets without hitting
        rate limits or request size limits.

        Args:
            texts: List of texts to embed
            batch_size: Number of texts per API call (default: 100)

        Returns:
            List of embedding vectors (one per input text)

        Raises:
            ImportError: If openai package is not installed
            openai.APIError: If the API request fails
        """
        if not texts:
            return []

        all_embeddings = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            batch_embeddings = self.embed(batch)
            all_embeddings.extend(batch_embeddings)

        return all_embeddings


def create_embedding_client(
    model: str = "text-embedding-3-small",
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    dimensions: Optional[int] = None,
) -> EmbeddingClient:
    """
    Factory function to create embedding client.

    Creates an OpenAI-compatible embedding client that can be used with:
    - OpenAI API directly
    - Cloudflare AI Gateway (via base_url)
    - Any OpenAI-compatible API

    Args:
        model: Embedding model identifier (default: text-embedding-3-small)
        api_key: API key (falls back to OPENAI_API_KEY env var)
        base_url: Base URL for API (falls back to OPENAI_BASE_URL env var)
        dimensions: Optional dimension reduction

    Returns:
        EmbeddingClient instance

    Example:
        >>> client = create_embedding_client()
        >>> embeddings = client.embed(["Hello!"])
    """
    return EmbeddingClient(
        model=model, api_key=api_key, base_url=base_url, dimensions=dimensions
    )
