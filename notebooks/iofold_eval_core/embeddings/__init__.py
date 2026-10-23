"""
Embeddings module for iofold-eval-core.

Provides text embedding clients including:
- EmbeddingClient: OpenAI-compatible embeddings (with Cloudflare AI Gateway support)
- TFIDFEmbedding: Pure Python TF-IDF embeddings (no API needed)
"""

from .client import (
    EmbeddingClientProtocol,
    EmbeddingClient,
    create_embedding_client,
)
from .tfidf import (
    TFIDFEmbedding,
    create_tfidf_embedding,
)

__all__ = [
    # OpenAI embeddings
    "EmbeddingClientProtocol",
    "EmbeddingClient",
    "create_embedding_client",
    # TF-IDF embeddings
    "TFIDFEmbedding",
    "create_tfidf_embedding",
]
