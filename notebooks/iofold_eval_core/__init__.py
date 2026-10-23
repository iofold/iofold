"""
iofold-eval-core: Core utilities for agent trace evaluation.

This package provides tools for working with agent execution traces,
including splitting, extraction, and quality signal detection.

Example usage:
    from iofold_eval_core import Trace, get_split, extract_user_message

    # Load and split traces
    train, val, test = split_traces(traces)

    # Extract data from a trace
    user_msg = extract_user_message(trace)
    tool_pattern = extract_tool_pattern(trace)

    # Check for issues
    if has_errors(trace):
        issues = detect_issues(trace)
"""

# Models
from .models import (
    Message,
    ToolCall,
    ExecutionStep,
    Trace,
    Feedback,
    LabeledTrace,
    RewardCandidate,
    EvalCandidate,
    TestResult,
    ClusterResult,
    PairwiseComparison,
    FoldResult,
    CrossValidationResult,
)

# Splitting utilities
from .splitting import (
    get_split,
    filter_by_split,
    split_traces,
    SplitName,
)

# Extraction utilities
from .extraction import (
    # Messages
    extract_user_message,
    extract_assistant_response,
    extract_all_messages,
    extract_system_message,
    # Tools
    extract_tool_calls,
    extract_tool_pattern,
    extract_unique_tools,
    count_tool_calls,
    extract_tool_results,
    get_tool_call_count,
    has_tool_errors,
    # Signals
    has_errors,
    extract_errors,
    detect_issues,
    get_step_count,
    get_trace_duration_ms,
    compute_quality_signals,
)

# Serialization utilities
from .utils import (
    trace_to_dict_for_eval,
    dict_to_trace,
    serialize_for_storage,
    normalize_trace,
    extract_eval_context,
)

# Sandbox utilities
from .sandbox import (
    ALLOWED_MODULES,
    execute_reward_function,
    execute_batch,
    FORBIDDEN_IMPORTS,
    FORBIDDEN_CALLS,
    CodeValidator,
    validate_eval_code,
    get_validation_warnings,
    quick_check,
)

# LLM utilities
from .llm import (
    LLMClient,
    OpenAIClient,
    create_llm_client,
)

# Embedding utilities
from .embeddings import (
    EmbeddingClientProtocol,
    EmbeddingClient,
    create_embedding_client,
    TFIDFEmbedding,
    create_tfidf_embedding,
)

# Metrics utilities
from .metrics import (
    ConfusionMatrix,
    calculate_confusion_matrix,
    accuracy,
    precision,
    recall,
    f1_score,
    pearson_correlation,
    cohen_kappa,
    fleiss_kappa,
    composite_score,
    normalize_metrics,
    meets_thresholds,
)

# Testing utilities
from .testing import (
    CandidateTester,
    test_eval_function,
    CrossValidator,
    cross_validate_candidate,
    WinnerSelector,
    select_best_candidate,
    DEFAULT_WEIGHTS,
)

# Clustering utilities
from .clustering import (
    cluster_traces,
    get_cluster_traces,
    get_cluster_representatives,
    find_similar_traces,
    find_most_similar,
    compare_traces,
    compute_pairwise_similarities,
    extract_first_message,
    extract_full_trace_text,
    # Note: extract_tool_pattern already exported from extraction
)

# Generation utilities
from .generation import (
    DeepAgent,
    PatternAnalyzer,
    CandidateGenerator,
    format_trace_for_prompt,
    format_labeled_trace,
    format_candidates_for_prompt,
)

__version__ = "0.1.0"

__all__ = [
    # Version
    "__version__",
    # Models
    "Message",
    "ToolCall",
    "ExecutionStep",
    "Trace",
    "Feedback",
    "LabeledTrace",
    "RewardCandidate",
    "EvalCandidate",
    "TestResult",
    "ClusterResult",
    "PairwiseComparison",
    "FoldResult",
    "CrossValidationResult",
    # Splitting
    "get_split",
    "filter_by_split",
    "split_traces",
    "SplitName",
    # Message extraction
    "extract_user_message",
    "extract_assistant_response",
    "extract_all_messages",
    "extract_system_message",
    # Tool extraction
    "extract_tool_calls",
    "extract_tool_pattern",
    "extract_unique_tools",
    "count_tool_calls",
    "extract_tool_results",
    "get_tool_call_count",
    "has_tool_errors",
    # Signal extraction
    "has_errors",
    "extract_errors",
    "detect_issues",
    "get_step_count",
    "get_trace_duration_ms",
    "compute_quality_signals",
    # Serialization
    "trace_to_dict_for_eval",
    "dict_to_trace",
    "serialize_for_storage",
    "normalize_trace",
    "extract_eval_context",
    # Sandbox
    "ALLOWED_MODULES",
    "execute_reward_function",
    "execute_batch",
    "FORBIDDEN_IMPORTS",
    "FORBIDDEN_CALLS",
    "CodeValidator",
    "validate_eval_code",
    "get_validation_warnings",
    "quick_check",
    # LLM
    "LLMClient",
    "OpenAIClient",
    "create_llm_client",
    # Embeddings
    "EmbeddingClientProtocol",
    "EmbeddingClient",
    "create_embedding_client",
    "TFIDFEmbedding",
    "create_tfidf_embedding",
    # Metrics
    "ConfusionMatrix",
    "calculate_confusion_matrix",
    "accuracy",
    "precision",
    "recall",
    "f1_score",
    "pearson_correlation",
    "cohen_kappa",
    "fleiss_kappa",
    "composite_score",
    "normalize_metrics",
    "meets_thresholds",
    # Testing
    "CandidateTester",
    "test_eval_function",
    "CrossValidator",
    "cross_validate_candidate",
    "WinnerSelector",
    "select_best_candidate",
    "DEFAULT_WEIGHTS",
    # Clustering
    "cluster_traces",
    "get_cluster_traces",
    "get_cluster_representatives",
    "find_similar_traces",
    "find_most_similar",
    "compare_traces",
    "compute_pairwise_similarities",
    "extract_first_message",
    "extract_full_trace_text",
    # Generation
    "DeepAgent",
    "PatternAnalyzer",
    "CandidateGenerator",
    "format_trace_for_prompt",
    "format_labeled_trace",
    "format_candidates_for_prompt",
]
