# notebooks/iofold_eval_core/scoring/presets.py
"""Preset composite scorer configurations."""

from .composite import CompositeScorer
from .evaluators.deterministic import (
    ErrorCheckEvaluator,
    StepCountEvaluator,
    AnswerCompletenessEvaluator,
    ToolUsageEvaluator,
    KeywordMatchEvaluator,
    NegationPatternEvaluator,
)
from .evaluators.llm_judge import LLMJudgeEvaluator
from .evaluators.grounding import GroundingEvaluator
from .evaluators.direct_comparison import DirectComparisonEvaluator
from .evaluators.embedding_similarity import EmbeddingSimilarityEvaluator
from .evaluators.entity_match import EntityMatchEvaluator


def create_fast_scorer() -> CompositeScorer:
    """Fast scorer using only deterministic evaluators."""
    scorer = CompositeScorer()

    scorer.add_evaluator(ErrorCheckEvaluator(), weight=0.20)
    scorer.add_evaluator(StepCountEvaluator(), weight=0.10)
    scorer.add_evaluator(AnswerCompletenessEvaluator(), weight=0.15)
    scorer.add_evaluator(ToolUsageEvaluator(), weight=0.20)
    scorer.add_evaluator(KeywordMatchEvaluator(), weight=0.15)
    scorer.add_evaluator(NegationPatternEvaluator(), weight=0.10)
    scorer.add_evaluator(GroundingEvaluator(use_llm=False), weight=0.10)

    return scorer


def create_balanced_scorer(model: str = "gemini-2.5-flash") -> CompositeScorer:
    """Balanced scorer with deterministic + LLM evaluators."""
    scorer = CompositeScorer()

    # Deterministic (fast, reliable)
    scorer.add_evaluator(ErrorCheckEvaluator(), weight=0.15)
    scorer.add_evaluator(AnswerCompletenessEvaluator(), weight=0.10)
    scorer.add_evaluator(ToolUsageEvaluator(), weight=0.15)
    scorer.add_evaluator(NegationPatternEvaluator(), weight=0.10)

    # LLM-based (slower, more nuanced)
    scorer.add_evaluator(LLMJudgeEvaluator(model=model), weight=0.30)
    scorer.add_evaluator(GroundingEvaluator(model=model, use_llm=True), weight=0.20)

    return scorer


def create_full_scorer(model: str = "gemini-2.5-flash") -> CompositeScorer:
    """Full scorer with all evaluators."""
    scorer = CompositeScorer()

    # Deterministic
    scorer.add_evaluator(ErrorCheckEvaluator(), weight=0.10)
    scorer.add_evaluator(StepCountEvaluator(), weight=0.05)
    scorer.add_evaluator(AnswerCompletenessEvaluator(), weight=0.10)
    scorer.add_evaluator(ToolUsageEvaluator(), weight=0.10)
    scorer.add_evaluator(KeywordMatchEvaluator(), weight=0.05)
    scorer.add_evaluator(NegationPatternEvaluator(), weight=0.10)

    # LLM-based
    scorer.add_evaluator(LLMJudgeEvaluator(model=model), weight=0.25)
    scorer.add_evaluator(GroundingEvaluator(model=model, use_llm=True), weight=0.25)

    return scorer


def create_semantic_scorer(model: str = "gemini-2.5-flash") -> CompositeScorer:
    """Semantic scorer - prioritizes LLM judgment over deterministic checks.

    Use this when you have expected outputs and want semantic accuracy.
    LLM judge has dominant weight (0.60) to ensure semantic correctness drives the score.
    """
    scorer = CompositeScorer()

    # Minimal deterministic sanity checks (total 0.20)
    scorer.add_evaluator(ErrorCheckEvaluator(), weight=0.10)
    scorer.add_evaluator(AnswerCompletenessEvaluator(), weight=0.10)

    # LLM-based semantic evaluation (total 0.80)
    scorer.add_evaluator(LLMJudgeEvaluator(model=model), weight=0.60)
    scorer.add_evaluator(GroundingEvaluator(model=model, use_llm=True), weight=0.20)

    return scorer


def create_expected_output_scorer(
    model: str = "gemini-2.5-flash",
    embedding_client=None,
) -> CompositeScorer:
    """Scorer optimized for traces with expectedOutput ground truth.

    Prioritizes direct comparison with expectedOutput using multiple signals:
    - Direct string/token comparison (deterministic)
    - Semantic embedding similarity
    - Entity extraction and matching

    Use this when traces have metadata.expectedOutput available.
    Expected to achieve higher accuracy than semantic_scorer on labeled data.
    """
    scorer = CompositeScorer()

    # High-value expectedOutput evaluators (60% total)
    scorer.add_evaluator(DirectComparisonEvaluator(), weight=0.25)
    scorer.add_evaluator(EmbeddingSimilarityEvaluator(embedding_client), weight=0.20)
    scorer.add_evaluator(EntityMatchEvaluator(), weight=0.15)

    # Supporting deterministic evaluators (25% total)
    scorer.add_evaluator(ErrorCheckEvaluator(), weight=0.10)
    scorer.add_evaluator(ToolUsageEvaluator(), weight=0.10)
    scorer.add_evaluator(NegationPatternEvaluator(), weight=0.05)

    # LLM fallback for edge cases (15% total - reduced from semantic_scorer)
    scorer.add_evaluator(LLMJudgeEvaluator(model=model), weight=0.15)

    return scorer


def create_deterministic_expected_output_scorer() -> CompositeScorer:
    """Pure deterministic scorer with expectedOutput focus.

    No LLM calls - useful for fast iteration and cost-free evaluation.
    Uses DirectComparison and EntityMatch which leverage expectedOutput.
    """
    scorer = CompositeScorer()

    # ExpectedOutput-focused (60%)
    scorer.add_evaluator(DirectComparisonEvaluator(), weight=0.35)
    scorer.add_evaluator(EntityMatchEvaluator(), weight=0.25)

    # Supporting signals (40%)
    scorer.add_evaluator(ErrorCheckEvaluator(), weight=0.15)
    scorer.add_evaluator(ToolUsageEvaluator(), weight=0.10)
    scorer.add_evaluator(NegationPatternEvaluator(), weight=0.10)
    scorer.add_evaluator(AnswerCompletenessEvaluator(), weight=0.05)

    return scorer
