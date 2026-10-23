"""
Generation module for iofold-eval-core.

This module provides utilities for generating reward/eval function candidates:

- **prompts**: Prompt templates for LLM-based generation
- **pattern_analyzer**: Analyze patterns in labeled traces
- **candidate_generator**: Generate eval function candidates
- **deep_agent**: Orchestrate iterative generation workflow

Example usage:
    from iofold_eval_core.generation import (
        DeepAgent,
        PatternAnalyzer,
        CandidateGenerator,
    )
    from iofold_eval_core.llm import create_llm_client

    # Create LLM client
    llm = create_llm_client()

    # Analyze patterns in traces
    analyzer = PatternAnalyzer(llm)
    patterns = analyzer.analyze(positive_traces, negative_traces)

    # Generate candidates
    generator = CandidateGenerator(llm)
    candidates = generator.generate(
        training_summary="Dataset of email traces...",
        num_candidates=5,
    )

    # Or use DeepAgent for full workflow
    agent = DeepAgent(
        llm_client=llm,
        embedding_client=embeddings,
        train_traces=train_data,
        val_traces=val_data,
    )
    best = agent.run_iterations(max_iterations=5)
"""

from .prompts import (
    # Prompt templates
    PATTERN_ANALYSIS_PROMPT,
    GENERATION_PROMPT,
    TRACE_SUMMARY_PROMPT,
    CLUSTER_ANALYSIS_PROMPT,
    PAIRWISE_COMPARISON_PROMPT,
    ERROR_ANALYSIS_PROMPT,
    REFINEMENT_PROMPT,
    TRAINING_SUMMARY_PROMPT,
    # Formatting utilities
    format_trace_for_prompt,
    format_labeled_trace,
    format_candidates_for_prompt,
)

from .pattern_analyzer import (
    PatternAnalyzer,
)

from .candidate_generator import (
    CandidateGenerator,
)

from .deep_agent import (
    DeepAgent,
)

__all__ = [
    # Main classes
    "DeepAgent",
    "PatternAnalyzer",
    "CandidateGenerator",
    # Prompt templates
    "PATTERN_ANALYSIS_PROMPT",
    "GENERATION_PROMPT",
    "TRACE_SUMMARY_PROMPT",
    "CLUSTER_ANALYSIS_PROMPT",
    "PAIRWISE_COMPARISON_PROMPT",
    "ERROR_ANALYSIS_PROMPT",
    "REFINEMENT_PROMPT",
    "TRAINING_SUMMARY_PROMPT",
    # Formatting utilities
    "format_trace_for_prompt",
    "format_labeled_trace",
    "format_candidates_for_prompt",
]
