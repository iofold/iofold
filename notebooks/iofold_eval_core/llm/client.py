"""
LLM client module for iofold-eval-core.

Provides OpenAI-compatible client that works with Cloudflare AI Gateway.
Uses lazy initialization to avoid importing openai until needed.
"""

from typing import Optional, Protocol, List, Dict, Any
import os


class LLMClient(Protocol):
    """Protocol for LLM clients."""

    def generate(
        self, prompt: str, temperature: float = 0.3, max_tokens: int = 4096
    ) -> str:
        """Generate text completion from a prompt."""
        ...

    def generate_with_messages(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> str:
        """Generate text completion from a list of messages."""
        ...


class OpenAIClient:
    """
    OpenAI-compatible client (works with Cloudflare AI Gateway).

    Supports lazy initialization - the OpenAI client is only created
    when first needed, avoiding import errors if openai is not installed.

    Args:
        model: Model identifier (default: gpt-4o-mini)
        api_key: OpenAI API key (falls back to OPENAI_API_KEY env var)
        base_url: Base URL for API (falls back to OPENAI_BASE_URL env var)
                  Use this for Cloudflare AI Gateway compatibility.

    Example:
        >>> client = OpenAIClient(model="gpt-4o-mini")
        >>> response = client.generate("Explain Python in one sentence.")

        # With Cloudflare AI Gateway:
        >>> client = OpenAIClient(
        ...     model="gpt-4o-mini",
        ...     base_url="https://gateway.ai.cloudflare.com/v1/..."
        ... )
    """

    def __init__(
        self,
        model: str = "gpt-4o-mini",
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        self.model = model
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.base_url = base_url or os.getenv("OPENAI_BASE_URL")
        self._client = None

    def _get_client(self):
        """Lazy initialization of OpenAI client."""
        if self._client is None:
            try:
                from openai import OpenAI
            except ImportError:
                raise ImportError(
                    "openai package is required for OpenAIClient. "
                    "Install with: pip install openai"
                )

            kwargs = {"api_key": self.api_key}
            if self.base_url:
                kwargs["base_url"] = self.base_url

            self._client = OpenAI(**kwargs)
        return self._client

    def generate(
        self, prompt: str, temperature: float = 0.3, max_tokens: int = 4096
    ) -> str:
        """
        Generate text completion from a prompt.

        Args:
            prompt: The prompt to generate from
            temperature: Sampling temperature (0.0 to 2.0)
            max_tokens: Maximum tokens to generate

        Returns:
            Generated text response

        Raises:
            ImportError: If openai package is not installed
            openai.APIError: If the API request fails
        """
        messages = [{"role": "user", "content": prompt}]
        return self.generate_with_messages(
            messages, temperature=temperature, max_tokens=max_tokens
        )

    def generate_with_messages(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> str:
        """
        Generate text completion from a list of messages.

        Args:
            messages: List of message dicts with 'role' and 'content' keys
            temperature: Sampling temperature (0.0 to 2.0)
            max_tokens: Maximum tokens to generate

        Returns:
            Generated text response

        Raises:
            ImportError: If openai package is not installed
            openai.APIError: If the API request fails
        """
        client = self._get_client()
        response = client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""

    def generate_json(
        self,
        prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> Any:
        """
        Generate JSON response from a prompt.

        Uses JSON response format when supported by the model.

        Args:
            prompt: The prompt to generate from (should ask for JSON)
            temperature: Sampling temperature (0.0 to 2.0)
            max_tokens: Maximum tokens to generate

        Returns:
            Parsed JSON response

        Raises:
            ImportError: If openai package is not installed
            json.JSONDecodeError: If response is not valid JSON
        """
        import json

        client = self._get_client()
        response = client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content or "{}"
        return json.loads(content)


def create_llm_client(
    model: str = "gpt-4o-mini",
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
) -> LLMClient:
    """
    Factory function to create LLM client.

    Creates an OpenAI-compatible client that can be used with:
    - OpenAI API directly
    - Cloudflare AI Gateway (via base_url)
    - Any OpenAI-compatible API

    Args:
        model: Model identifier (default: gpt-4o-mini)
        api_key: API key (falls back to OPENAI_API_KEY env var)
        base_url: Base URL for API (falls back to OPENAI_BASE_URL env var)

    Returns:
        LLMClient instance

    Example:
        >>> client = create_llm_client()
        >>> response = client.generate("Hello!")

        # With explicit configuration:
        >>> client = create_llm_client(
        ...     model="gpt-4o",
        ...     api_key="sk-...",
        ...     base_url="https://gateway.ai.cloudflare.com/v1/..."
        ... )
    """
    return OpenAIClient(model=model, api_key=api_key, base_url=base_url)
