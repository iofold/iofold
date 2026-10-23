"""
Configuration for eval/reward function experiments.

Contains constants and model configurations for the experiment suite.
"""

from typing import TypedDict, Optional, List
from dataclasses import dataclass, field

# =============================================================================
# Job Configuration
# =============================================================================

# Primary job ID for the ART-E email task traces with feedback
JOB_ID = "fe33feb1-c6bb-494d-a227-333d83c64f1d"

# Expected trace counts (for validation)
EXPECTED_TRACE_COUNT = 1015
EXPECTED_FEEDBACK_COVERAGE = 1.0  # 100%


# =============================================================================
# Data Split Configuration
# =============================================================================

# Split ratios (must sum to 1.0)
TRAIN_RATIO = 0.60  # ~609 traces
VALIDATION_RATIO = 0.20  # ~203 traces
TEST_RATIO = 0.20  # ~203 traces (hold-out, never seen during development)


def get_split(trace_id: str) -> str:
    """
    Deterministic train/validation/test split based on trace_id hash.

    Uses simple character sum hash (as specified in research plan) for
    reproducibility across Python versions without external dependencies.

    Args:
        trace_id: Unique identifier for the trace

    Returns:
        'train', 'validation', or 'test'

    Note: This uses 60/20/20 split as specified in the research plan.
    """
    hash_val = sum(ord(c) for c in trace_id) % 100
    if hash_val < 60:
        return "train"
    elif hash_val < 80:
        return "validation"
    else:
        return "test"


# =============================================================================
# Model Configurations
# =============================================================================

@dataclass
class ModelConfig:
    """Configuration for an LLM model."""
    name: str
    provider: str
    model_id: str
    cost_per_1k_input: float  # USD
    cost_per_1k_output: float  # USD
    max_tokens: int = 4096
    temperature: float = 0.0
    supports_json_mode: bool = True
    supports_tools: bool = True

    @property
    def gateway_model_id(self) -> str:
        """Model ID formatted for Cloudflare AI Gateway."""
        return f"{self.provider}/{self.model_id}"


# Pre-configured models (2025-2026)
# Reference: ~/.claude/plugins/cache/iofold-marketplace/iofold/1.9.1/skills/ai-models-gateway
MODELS = {
    # Google Models (via Cloudflare AI Gateway)
    # Gateway format: google-ai-studio/model-name
    # Good for long context (1M tokens), cheap
    "gemini-3-flash-preview": ModelConfig(
        name="Gemini 3 Flash Preview",
        provider="google-ai-studio",
        model_id="gemini-3-flash-preview",
        cost_per_1k_input=0.0002,
        cost_per_1k_output=0.0008,
        max_tokens=64000,  # Large output for code generation
    ),
    "gemini-2.5-flash": ModelConfig(
        name="Gemini 2.5 Flash",
        provider="google-ai-studio",
        model_id="gemini-2.5-flash",
        cost_per_1k_input=0.00015,
        cost_per_1k_output=0.0006,
        max_tokens=16384,  # Increased for code generation
    ),
    "gemini-2.5-pro": ModelConfig(
        name="Gemini 2.5 Pro",
        provider="google-ai-studio",
        model_id="gemini-2.5-pro",
        cost_per_1k_input=0.00125,
        cost_per_1k_output=0.005,
        max_tokens=16384,  # Increased for code generation
    ),

    # Anthropic Models (via Cloudflare AI Gateway)
    # Gateway format: anthropic/model-name
    "claude-sonnet-4-5": ModelConfig(
        name="Claude Sonnet 4.5",
        provider="anthropic",
        model_id="claude-sonnet-4-5-20250929",
        cost_per_1k_input=0.003,
        cost_per_1k_output=0.015,
        max_tokens=8192,
    ),

    # OpenAI Models (via Cloudflare AI Gateway)
    # Gateway format: openai/model-name
    # Use max_completion_tokens for OpenAI (not max_tokens)
    "gpt-5-nano": ModelConfig(
        name="GPT-5 Nano",
        provider="openai",
        model_id="gpt-5-nano",
        cost_per_1k_input=0.0001,
        cost_per_1k_output=0.0004,
        max_tokens=8192,
    ),
    "gpt-5.1": ModelConfig(
        name="GPT-5.1",
        provider="openai",
        model_id="gpt-5.1",
        cost_per_1k_input=0.0003,
        cost_per_1k_output=0.0012,
        max_tokens=8192,
    ),
}


# Default model for experiments
DEFAULT_MODEL = "gemini-3-flash-preview"


# =============================================================================
# Cloudflare AI Gateway Configuration
# =============================================================================

# AI Gateway endpoint pattern
# Format: https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_name}/{provider}
AI_GATEWAY_BASE_URL = "https://gateway.ai.cloudflare.com/v1"

# These should be set via environment variables
# CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")
# CLOUDFLARE_GATEWAY_NAME = os.getenv("CLOUDFLARE_GATEWAY_NAME", "iofold-gateway")


def get_ai_gateway_url(
    account_id: str,
    gateway_name: str,
    provider: str
) -> str:
    """
    Build the full AI Gateway URL for a provider.

    Args:
        account_id: Cloudflare account ID
        gateway_name: AI Gateway name
        provider: LLM provider (openai, anthropic, google-ai-studio)

    Returns:
        Full AI Gateway URL
    """
    return f"{AI_GATEWAY_BASE_URL}/{account_id}/{gateway_name}/{provider}"


# =============================================================================
# Experiment Configuration
# =============================================================================

@dataclass
class ExperimentConfig:
    """Configuration for an experiment run."""
    experiment_id: str
    experiment_name: str
    model: str = DEFAULT_MODEL
    max_iterations: int = 25

    # Evaluation settings
    eval_batch_size: int = 50
    validation_interval: int = 5  # Test on validation set every N iterations
    early_stopping_patience: int = 3  # Stop if no improvement for N validations

    # Success thresholds
    min_accuracy: float = 0.70
    min_f1: float = 0.65
    max_cost_per_trace: float = 0.01  # USD

    # Output settings
    save_intermediate: bool = True
    verbose: bool = True


# Experiment IDs (for tracking)
EXPERIMENT_IDS = {
    "exp1_baseline_single_shot": "exp1-baseline-single-shot",
    "exp2_deep_agent_standard": "exp2-deep-agent-standard",
    "exp3_deterministic_first": "exp3-deterministic-first",
    "exp4_ensemble": "exp4-ensemble",
    "exp5_self_improving": "exp5-self-improving",
    "exp6_constraint_solving": "exp6-constraint-solving",
    "exp7_multi_model": "exp7-multi-model",
    "exp8_embedding_similarity": "exp8-embedding-similarity",
    "exp9_cot_judge": "exp9-cot-judge",
    "exp10_augmented_tools": "exp10-augmented-tools",
}


# =============================================================================
# Metrics Configuration
# =============================================================================

# Classification threshold for binary evaluation
CLASSIFICATION_THRESHOLD = 0.5

# Metric weights for composite scoring
METRIC_WEIGHTS = {
    "accuracy": 0.25,
    "f1_score": 0.25,
    "precision": 0.15,
    "recall": 0.15,
    "cohen_kappa": 0.10,
    "cost_efficiency": 0.05,
    "latency_efficiency": 0.05,
}


# =============================================================================
# File Paths
# =============================================================================

# Results directory (relative to notebooks/)
RESULTS_DIR = "experiments/eval_reward_functions/results"

# Cache directory for intermediate results
CACHE_DIR = "experiments/eval_reward_functions/.cache"
