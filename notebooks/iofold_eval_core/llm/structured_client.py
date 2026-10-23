"""
Structured LLM client using response_format for reliable JSON outputs.

Supports:
- Google AI Studio (Gemini) via Cloudflare AI Gateway
- OpenAI (GPT) via Cloudflare AI Gateway
- Anthropic (Claude) via Cloudflare AI Gateway
"""

import os
import json
from typing import Type, TypeVar, Optional
from pydantic import BaseModel
from openai import OpenAI

T = TypeVar('T', bound=BaseModel)

class StructuredLLMClient:
    """LLM client that returns structured Pydantic objects."""

    def __init__(
        self,
        model: str = "gemini-2.5-flash",
        temperature: float = 0.3,
    ):
        self.model = model
        self.temperature = temperature

        # Gateway config
        account_id = os.environ.get("CF_ACCOUNT_ID")
        gateway_id = os.environ.get("CF_AI_GATEWAY_ID")
        api_key = os.environ.get("CF_AI_GATEWAY_TOKEN")

        self.client = OpenAI(
            api_key=api_key,
            base_url=f"https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/compat"
        )

        # Model mapping - use same names as experiments/config.py
        self.model_map = {
            "gemini-2.5-flash": "google-ai-studio/gemini-2.5-flash",
            "gemini-2.5-pro": "google-ai-studio/gemini-2.5-pro",
            "gemini-3-flash-preview": "google-ai-studio/gemini-3-flash-preview",
            "gpt-4o": "openai/gpt-4o",
            "gpt-4o-mini": "openai/gpt-4o-mini",
            "gpt-5-nano": "openai/gpt-5-nano",
            "gpt-5.1": "openai/gpt-5.1",
        }
        self.gateway_model = self.model_map.get(model, f"google-ai-studio/{model}")

    def generate(
        self,
        prompt: str,
        response_schema: Type[T],
        max_tokens: int = 4096,
    ) -> T:
        """Generate structured output matching the schema."""

        # Build JSON schema from Pydantic model
        schema = response_schema.model_json_schema()

        response = self.client.chat.completions.create(
            model=self.gateway_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=self.temperature,
            max_tokens=max_tokens,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": response_schema.__name__,
                    "schema": schema,
                    "strict": True,
                }
            }
        )

        content = response.choices[0].message.content
        return response_schema.model_validate_json(content)

    def generate_text(self, prompt: str, max_tokens: int = 4096) -> str:
        """Generate unstructured text (for code generation)."""
        response = self.client.chat.completions.create(
            model=self.gateway_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=self.temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""
