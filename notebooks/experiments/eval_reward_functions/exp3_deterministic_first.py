#!/usr/bin/env python3
"""
Experiment 3: Deterministic-First Eval/Reward Function

This experiment implements a hybrid evaluation approach that:
1. Analyzes training data to discover strong deterministic signals
2. Builds a decision tree of deterministic rules with measured precision/recall
3. Uses LLM only for edge cases that fall through the rules
4. Measures coverage, accuracy, and cost savings

Dataset: Job fe33feb1-c6bb-494d-a227-333d83c64f1d with 1,015 traces
"""

import sys
import os
import json
import sqlite3
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, Tuple, List, Dict, Any, Callable
from collections import defaultdict
import statistics
from difflib import SequenceMatcher
from datetime import datetime
import hashlib

# Add parent directories to path for imports
NOTEBOOK_DIR = Path(__file__).parent.parent.parent
sys.path.insert(0, str(NOTEBOOK_DIR))

# ============================================================================
# Configuration
# ============================================================================

JOB_ID = "fe33feb1-c6bb-494d-a227-333d83c64f1d"
DB_PATH = NOTEBOOK_DIR / "data" / "iofold_d1_main.sqlite"

# Rating to numeric score mapping
RATING_TO_SCORE = {
    "positive": 1.0,
    "neutral": 0.5,
    "negative": 0.0,
}


# ============================================================================
# Data Split Function
# ============================================================================

def get_split(trace_id: str) -> str:
    """
    Deterministic split based on trace_id hash.

    Uses MD5 hash to ensure reproducibility:
    - train: 60% (hash_val < 60)
    - validation: 20% (60 <= hash_val < 80)
    - test: 20% (hash_val >= 80)
    """
    hash_val = int(hashlib.md5(trace_id.encode()).hexdigest(), 16) % 100
    if hash_val < 60:
        return "train"
    elif hash_val < 80:
        return "validation"
    else:
        return "test"


# ============================================================================
# Data Loading
# ============================================================================

@dataclass
class TraceWithFeedback:
    """A trace with its feedback and computed features."""
    id: str
    output_preview: str
    expected_output: str
    rating: str  # 'positive', 'neutral', 'negative'
    score: float  # metadata score from the job
    step_count: int
    has_errors: bool
    split: str  # 'train', 'validation', 'test'

    # Computed features
    similarity: float = 0.0
    keyword_overlap: float = 0.0
    has_negation: bool = False
    has_success_indicator: bool = False
    output_length: int = 0


def load_traces_for_job(job_id: str, db_path: Path) -> List[TraceWithFeedback]:
    """Load all traces for a job with their feedback."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    cursor = conn.execute('''
        SELECT
            t.id,
            t.output_preview,
            json_extract(t.metadata, '$.expectedOutput') as expectedOutput,
            json_extract(t.metadata, '$.score') as score,
            json_extract(t.metadata, '$.hasErrors') as metadataHasErrors,
            t.has_errors,
            t.step_count,
            f.rating
        FROM traces t
        LEFT JOIN feedback f ON f.trace_id = t.id
        WHERE json_extract(t.metadata, '$.jobId') = ?
           OR json_extract(t.metadata, '$.job_id') = ?
    ''', (job_id, job_id))

    traces = []
    for row in cursor.fetchall():
        trace = TraceWithFeedback(
            id=row['id'],
            output_preview=row['output_preview'] or '',
            expected_output=row['expectedOutput'] or '',
            rating=row['rating'] or 'unknown',
            score=float(row['score']) if row['score'] else 0.0,
            step_count=row['step_count'] or 0,
            has_errors=bool(row['has_errors'] or row['metadataHasErrors']),
            split=get_split(row['id']),
        )
        traces.append(trace)

    conn.close()
    return traces


# ============================================================================
# Feature Extraction
# ============================================================================

def compute_similarity(s1: str, s2: str) -> float:
    """Compute sequence similarity between two strings."""
    if not s1 or not s2:
        return 0.0
    s1 = s1.lower().strip()
    s2 = s2.lower().strip()
    return SequenceMatcher(None, s1, s2).ratio()


def compute_keyword_overlap(output: str, expected: str) -> float:
    """Compute percentage of expected keywords found in output."""
    if not expected or not output:
        return 0.0

    # Extract significant words (length > 3)
    expected_words = set(w.lower() for w in expected.split() if len(w) > 3)
    output_lower = output.lower()

    if not expected_words:
        return 0.0

    found = sum(1 for w in expected_words if w in output_lower)
    return found / len(expected_words)


def contains_negation(output: str) -> bool:
    """Check for negation patterns indicating failure."""
    output_lower = output.lower()
    negations = [
        'unable to', 'could not', "couldn't", "can't", 'cannot',
        'no results', 'not found', 'no emails', "didn't find",
        'did not find', "wasn't able", 'was not able', 'failed to',
        'i was unable', 'no relevant', 'no matching'
    ]
    return any(neg in output_lower for neg in negations)


def contains_success_indicator(output: str) -> bool:
    """Check for success indicators in output."""
    output_lower = output.lower()
    indicators = [
        'i found', 'based on', 'according to', 'the email',
        'the answer is', 'yes,', 'no,', 'the result', 'found that',
        'shows that', 'indicates that'
    ]
    return any(ind in output_lower for ind in indicators)


def compute_features(trace: TraceWithFeedback) -> None:
    """Compute all features for a trace (modifies in place)."""
    trace.similarity = compute_similarity(trace.output_preview, trace.expected_output)
    trace.keyword_overlap = compute_keyword_overlap(trace.output_preview, trace.expected_output)
    trace.has_negation = contains_negation(trace.output_preview)
    trace.has_success_indicator = contains_success_indicator(trace.output_preview)
    trace.output_length = len(trace.output_preview)


# ============================================================================
# Deterministic Rules
# ============================================================================

@dataclass
class Rule:
    """A deterministic rule for classification."""
    name: str
    predicate: Callable[[TraceWithFeedback], bool]
    predicted_rating: str  # 'positive' or 'negative'
    predicted_score: float  # Score to assign if rule matches
    reason_template: str
    priority: int = 0  # Lower = higher priority


def exact_match(trace: TraceWithFeedback) -> bool:
    """Check for exact string match."""
    if not trace.output_preview or not trace.expected_output:
        return False
    return trace.output_preview.strip().lower() == trace.expected_output.strip().lower()


def strong_similarity_match(trace: TraceWithFeedback) -> bool:
    """High similarity with no negation."""
    return trace.similarity > 0.5 and not trace.has_negation


def keyword_match(trace: TraceWithFeedback) -> bool:
    """High keyword overlap with no negation."""
    return trace.keyword_overlap > 0.5 and not trace.has_negation


def high_score_match(trace: TraceWithFeedback) -> bool:
    """High metadata score."""
    return trace.score >= 0.7


def negation_low_similarity(trace: TraceWithFeedback) -> bool:
    """Negation pattern with low similarity."""
    return trace.has_negation and trace.similarity < 0.35


def negation_low_keyword(trace: TraceWithFeedback) -> bool:
    """Negation pattern with low keyword overlap."""
    return trace.has_negation and trace.keyword_overlap < 0.3


def low_everything(trace: TraceWithFeedback) -> bool:
    """Low similarity and low keyword overlap."""
    return trace.similarity < 0.2 and trace.keyword_overlap < 0.2


def high_step_count(trace: TraceWithFeedback) -> bool:
    """Excessive steps (likely stuck in loop)."""
    return trace.step_count > 10


# Additional predicates for more nuanced rules
def very_high_similarity_match(trace: TraceWithFeedback) -> bool:
    """Very high similarity (strong signal)."""
    return trace.similarity > 0.7 and not trace.has_negation


def moderate_similarity_with_success(trace: TraceWithFeedback) -> bool:
    """Moderate similarity with explicit success indicators."""
    return trace.similarity > 0.4 and trace.has_success_indicator and not trace.has_negation


def very_high_keyword_overlap(trace: TraceWithFeedback) -> bool:
    """Very high keyword overlap."""
    return trace.keyword_overlap > 0.6 and not trace.has_negation


def negation_only(trace: TraceWithFeedback) -> bool:
    """Just negation pattern (weaker signal)."""
    return trace.has_negation and trace.similarity < 0.5


def very_low_similarity(trace: TraceWithFeedback) -> bool:
    """Very low similarity."""
    return trace.similarity < 0.15 and trace.keyword_overlap < 0.25


def moderate_with_negation(trace: TraceWithFeedback) -> bool:
    """Moderate metrics but with negation."""
    return trace.has_negation and 0.3 <= trace.similarity <= 0.5


# Define the rule cascade (order matters - higher priority first)
DETERMINISTIC_RULES: List[Rule] = [
    # HIGH PRECISION POSITIVE RULES (most confident first)
    Rule(
        name="exact_match",
        predicate=exact_match,
        predicted_rating="positive",
        predicted_score=0.95,
        reason_template="Exact match with expected output",
        priority=0,
    ),
    Rule(
        name="high_metadata_score",
        predicate=high_score_match,
        predicted_rating="positive",
        predicted_score=0.85,
        reason_template="High metadata score ({score:.2f})",
        priority=1,
    ),
    Rule(
        name="very_high_similarity",
        predicate=very_high_similarity_match,
        predicted_rating="positive",
        predicted_score=0.85,
        reason_template="Very high semantic match ({similarity:.2f} similarity)",
        priority=2,
    ),
    Rule(
        name="very_high_keyword_overlap",
        predicate=very_high_keyword_overlap,
        predicted_rating="positive",
        predicted_score=0.80,
        reason_template="Very high keyword overlap ({keyword_overlap:.2f})",
        priority=3,
    ),

    # HIGH PRECISION NEGATIVE RULES
    Rule(
        name="high_step_count",
        predicate=high_step_count,
        predicted_rating="negative",
        predicted_score=0.15,
        reason_template="Excessive steps ({step_count}) - likely stuck in loop",
        priority=4,
    ),
    Rule(
        name="very_low_similarity",
        predicate=very_low_similarity,
        predicted_rating="negative",
        predicted_score=0.15,
        reason_template="Very low similarity ({similarity:.2f}) and keyword overlap ({keyword_overlap:.2f})",
        priority=5,
    ),
    Rule(
        name="negation_low_similarity",
        predicate=negation_low_similarity,
        predicted_rating="negative",
        predicted_score=0.20,
        reason_template="Negation pattern with low similarity ({similarity:.2f})",
        priority=6,
    ),
    Rule(
        name="negation_low_keyword",
        predicate=negation_low_keyword,
        predicted_rating="negative",
        predicted_score=0.20,
        reason_template="Negation pattern with low keyword overlap ({keyword_overlap:.2f})",
        priority=7,
    ),

    # MODERATE PRECISION POSITIVE RULES
    Rule(
        name="moderate_similarity_success",
        predicate=moderate_similarity_with_success,
        predicted_rating="positive",
        predicted_score=0.70,
        reason_template="Moderate similarity ({similarity:.2f}) with success indicators",
        priority=8,
    ),
    Rule(
        name="strong_similarity",
        predicate=strong_similarity_match,
        predicted_rating="positive",
        predicted_score=0.75,
        reason_template="Strong semantic match ({similarity:.2f} similarity, no negation)",
        priority=9,
    ),
    Rule(
        name="keyword_overlap",
        predicate=keyword_match,
        predicted_rating="positive",
        predicted_score=0.70,
        reason_template="Good keyword overlap ({keyword_overlap:.2f}, no negation)",
        priority=10,
    ),

    # MODERATE PRECISION NEGATIVE RULES
    Rule(
        name="low_everything",
        predicate=low_everything,
        predicted_rating="negative",
        predicted_score=0.25,
        reason_template="Low similarity ({similarity:.2f}) and keyword overlap ({keyword_overlap:.2f})",
        priority=11,
    ),
    Rule(
        name="moderate_with_negation",
        predicate=moderate_with_negation,
        predicted_rating="negative",
        predicted_score=0.35,
        reason_template="Moderate metrics but with negation pattern ({similarity:.2f})",
        priority=12,
    ),
]


# ============================================================================
# Rule Analysis
# ============================================================================

@dataclass
class RuleStats:
    """Statistics for a single rule."""
    name: str
    predicted_rating: str
    matches: int = 0
    correct: int = 0
    false_positives: int = 0
    false_negatives: int = 0

    @property
    def precision(self) -> float:
        return self.correct / self.matches if self.matches > 0 else 0.0

    @property
    def recall(self) -> float:
        # This would need total positives/negatives from the dataset
        return 0.0  # Computed separately


def analyze_rules_on_training(
    traces: List[TraceWithFeedback],
    rules: List[Rule]
) -> Dict[str, RuleStats]:
    """Analyze rule performance on training data."""
    stats = {}

    for rule in rules:
        rule_stats = RuleStats(name=rule.name, predicted_rating=rule.predicted_rating)

        for trace in traces:
            if rule.predicate(trace):
                rule_stats.matches += 1
                if trace.rating == rule.predicted_rating:
                    rule_stats.correct += 1
                else:
                    if rule.predicted_rating == "positive":
                        rule_stats.false_positives += 1
                    else:
                        rule_stats.false_negatives += 1

        stats[rule.name] = rule_stats

    return stats


def print_rule_analysis(stats: Dict[str, RuleStats], total_traces: int) -> None:
    """Print rule analysis results."""
    print("\n" + "=" * 70)
    print("RULE ANALYSIS (Training Set)")
    print("=" * 70)
    print(f"{'Rule':<30} {'Matches':>8} {'Precision':>10} {'Predicted':>10}")
    print("-" * 70)

    for name, rule_stats in stats.items():
        coverage = rule_stats.matches / total_traces if total_traces > 0 else 0
        print(f"{name:<30} {rule_stats.matches:>8} {rule_stats.precision:>9.1%} {rule_stats.predicted_rating:>10}")

    print("-" * 70)


# ============================================================================
# Cascading Evaluation
# ============================================================================

@dataclass
class EvalResult:
    """Result from evaluating a single trace."""
    trace_id: str
    predicted_score: float
    predicted_rating: str
    reason: str
    rule_used: Optional[str]  # None if LLM was used
    actual_rating: str


def apply_cascade(
    trace: TraceWithFeedback,
    rules: List[Rule],
    llm_fallback: Optional[Callable[[TraceWithFeedback], Tuple[float, str]]] = None
) -> EvalResult:
    """Apply rules in cascade, falling through to LLM if no rule matches."""
    # Sort rules by priority
    sorted_rules = sorted(rules, key=lambda r: r.priority)

    for rule in sorted_rules:
        if rule.predicate(trace):
            # Format reason with trace data
            reason = rule.reason_template.format(
                score=trace.score,
                similarity=trace.similarity,
                keyword_overlap=trace.keyword_overlap,
                step_count=trace.step_count,
            )

            return EvalResult(
                trace_id=trace.id,
                predicted_score=rule.predicted_score,
                predicted_rating=rule.predicted_rating,
                reason=reason,
                rule_used=rule.name,
                actual_rating=trace.rating,
            )

    # No rule matched - use LLM fallback or default
    if llm_fallback:
        score, reason = llm_fallback(trace)
        predicted_rating = "positive" if score >= 0.5 else "negative"
        return EvalResult(
            trace_id=trace.id,
            predicted_score=score,
            predicted_rating=predicted_rating,
            reason=reason,
            rule_used=None,  # LLM was used
            actual_rating=trace.rating,
        )
    else:
        # Default fallback: use similarity as score
        score = trace.similarity * 0.6 + trace.keyword_overlap * 0.4
        return EvalResult(
            trace_id=trace.id,
            predicted_score=score,
            predicted_rating="neutral" if 0.4 <= score <= 0.6 else ("positive" if score > 0.6 else "negative"),
            reason=f"No rule matched, using combined similarity ({score:.2f})",
            rule_used="fallback",
            actual_rating=trace.rating,
        )


# ============================================================================
# Main Eval Function
# ============================================================================

def eval_deterministic_first(
    trace: dict,
    expected_output: str,
    ctx: Optional[Any] = None
) -> Tuple[float, str]:
    """
    Evaluate a trace using deterministic-first approach.

    This is the main eval function that can be used in production.

    Args:
        trace: Trace dict with output_preview, step_count, etc.
        expected_output: Ground truth expected answer
        ctx: Optional context for LLM calls (contains llm client)

    Returns:
        Tuple of (score: float, reason: str)
    """
    # Convert to TraceWithFeedback for processing
    trace_obj = TraceWithFeedback(
        id=trace.get("id", ""),
        output_preview=trace.get("output_preview", ""),
        expected_output=expected_output,
        rating="unknown",  # We don't know the actual rating
        score=trace.get("metadata", {}).get("score", 0.0) if isinstance(trace.get("metadata"), dict) else 0.0,
        step_count=trace.get("step_count", 0),
        has_errors=trace.get("has_errors", False),
        split="unknown",
    )

    # Compute features
    compute_features(trace_obj)

    # Define LLM fallback if context is provided
    def llm_fallback(t: TraceWithFeedback) -> Tuple[float, str]:
        if ctx is None:
            return (0.5, "No LLM available, defaulting to neutral")

        # Use LLM for edge cases
        prompt = f"""Evaluate this agent response against the expected output.

Expected Output: {t.expected_output[:500]}

Agent Output: {t.output_preview[:500]}

Step Count: {t.step_count}
Has Errors: {t.has_errors}

Rate the agent's response:
- Consider if the answer is correct or contains the key information
- Consider efficiency (step count)
- Consider any errors or issues

Respond with a JSON object:
{{"score": <0.0-1.0>, "reason": "<brief explanation>"}}"""

        try:
            response = ctx.llm.generate_json(prompt, temperature=0.1)
            return (float(response.get("score", 0.5)), response.get("reason", "LLM evaluation"))
        except Exception as e:
            return (0.5, f"LLM error: {str(e)}")

    # Apply cascade
    result = apply_cascade(
        trace_obj,
        DETERMINISTIC_RULES,
        llm_fallback=llm_fallback if ctx else None
    )

    return (result.predicted_score, result.reason)


# ============================================================================
# Evaluation Metrics
# ============================================================================

@dataclass
class CascadeMetrics:
    """Metrics for cascade evaluation."""
    total_traces: int = 0
    deterministic_handled: int = 0
    llm_handled: int = 0

    # Accuracy metrics
    correct_predictions: int = 0
    correct_deterministic: int = 0
    correct_llm: int = 0

    # Per-rating metrics
    true_positives: int = 0
    false_positives: int = 0
    true_negatives: int = 0
    false_negatives: int = 0

    # Rule usage
    rule_counts: Dict[str, int] = field(default_factory=dict)
    rule_correct: Dict[str, int] = field(default_factory=dict)

    @property
    def deterministic_coverage(self) -> float:
        return self.deterministic_handled / self.total_traces if self.total_traces > 0 else 0.0

    @property
    def overall_accuracy(self) -> float:
        return self.correct_predictions / self.total_traces if self.total_traces > 0 else 0.0

    @property
    def deterministic_accuracy(self) -> float:
        return self.correct_deterministic / self.deterministic_handled if self.deterministic_handled > 0 else 0.0

    @property
    def llm_accuracy(self) -> float:
        return self.correct_llm / self.llm_handled if self.llm_handled > 0 else 0.0

    @property
    def precision(self) -> float:
        return self.true_positives / (self.true_positives + self.false_positives) if (self.true_positives + self.false_positives) > 0 else 0.0

    @property
    def recall(self) -> float:
        return self.true_positives / (self.true_positives + self.false_negatives) if (self.true_positives + self.false_negatives) > 0 else 0.0

    @property
    def f1_score(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if (p + r) > 0 else 0.0


def evaluate_cascade(
    traces: List[TraceWithFeedback],
    rules: List[Rule],
    use_llm: bool = False
) -> Tuple[List[EvalResult], CascadeMetrics]:
    """Evaluate the cascade on a set of traces."""
    results = []
    metrics = CascadeMetrics()
    metrics.total_traces = len(traces)

    for trace in traces:
        result = apply_cascade(trace, rules, llm_fallback=None)
        results.append(result)

        # Update metrics
        if result.rule_used and result.rule_used != "fallback":
            metrics.deterministic_handled += 1
            metrics.rule_counts[result.rule_used] = metrics.rule_counts.get(result.rule_used, 0) + 1

            if result.predicted_rating == result.actual_rating:
                metrics.correct_deterministic += 1
                metrics.correct_predictions += 1
                metrics.rule_correct[result.rule_used] = metrics.rule_correct.get(result.rule_used, 0) + 1
        else:
            metrics.llm_handled += 1
            if result.predicted_rating == result.actual_rating:
                metrics.correct_llm += 1
                metrics.correct_predictions += 1

        # Confusion matrix (treating positive vs non-positive as binary)
        actual_positive = result.actual_rating == "positive"
        predicted_positive = result.predicted_rating == "positive"

        if predicted_positive and actual_positive:
            metrics.true_positives += 1
        elif predicted_positive and not actual_positive:
            metrics.false_positives += 1
        elif not predicted_positive and not actual_positive:
            metrics.true_negatives += 1
        else:
            metrics.false_negatives += 1

    return results, metrics


def print_metrics(metrics: CascadeMetrics, split_name: str = "Dataset") -> None:
    """Print evaluation metrics."""
    print(f"\n{'=' * 70}")
    print(f"CASCADE METRICS ({split_name})")
    print("=" * 70)
    print(f"Total traces: {metrics.total_traces}")
    print(f"\n--- Coverage ---")
    print(f"Deterministic handled: {metrics.deterministic_handled} ({metrics.deterministic_coverage:.1%})")
    print(f"LLM/Fallback handled: {metrics.llm_handled} ({1 - metrics.deterministic_coverage:.1%})")
    print(f"\n--- Accuracy ---")
    print(f"Overall accuracy: {metrics.overall_accuracy:.1%}")
    print(f"Deterministic accuracy: {metrics.deterministic_accuracy:.1%}")
    print(f"LLM/Fallback accuracy: {metrics.llm_accuracy:.1%}")
    print(f"\n--- Binary Classification (Positive vs Rest) ---")
    print(f"Precision: {metrics.precision:.1%}")
    print(f"Recall: {metrics.recall:.1%}")
    print(f"F1 Score: {metrics.f1_score:.1%}")

    if metrics.rule_counts:
        print(f"\n--- Rule Usage ---")
        for rule_name, count in sorted(metrics.rule_counts.items(), key=lambda x: -x[1]):
            correct = metrics.rule_correct.get(rule_name, 0)
            precision = correct / count if count > 0 else 0
            print(f"  {rule_name}: {count} traces, {precision:.1%} precision")


# ============================================================================
# Cost Analysis
# ============================================================================

def estimate_cost_savings(
    metrics: CascadeMetrics,
    llm_cost_per_call: float = 0.001  # $0.001 per LLM call (approximate for gemini-flash)
) -> Dict[str, float]:
    """Estimate cost savings from deterministic rules."""
    # Without cascade: all traces need LLM
    baseline_cost = metrics.total_traces * llm_cost_per_call

    # With cascade: only non-deterministic traces need LLM
    cascade_cost = metrics.llm_handled * llm_cost_per_call

    savings = baseline_cost - cascade_cost
    savings_percent = savings / baseline_cost if baseline_cost > 0 else 0

    return {
        "baseline_cost_usd": baseline_cost,
        "cascade_cost_usd": cascade_cost,
        "savings_usd": savings,
        "savings_percent": savings_percent,
        "llm_calls_saved": metrics.deterministic_handled,
    }


# ============================================================================
# Main Experiment
# ============================================================================

def analyze_features_by_rating(traces: List[TraceWithFeedback]) -> None:
    """Analyze feature distributions by rating."""
    print("\n--- Feature Analysis by Rating ---")

    features_by_rating = defaultdict(lambda: {
        'similarity': [],
        'keyword_overlap': [],
        'step_count': [],
        'has_negation': [],
        'has_success': [],
    })

    for trace in traces:
        features_by_rating[trace.rating]['similarity'].append(trace.similarity)
        features_by_rating[trace.rating]['keyword_overlap'].append(trace.keyword_overlap)
        features_by_rating[trace.rating]['step_count'].append(trace.step_count)
        features_by_rating[trace.rating]['has_negation'].append(1 if trace.has_negation else 0)
        features_by_rating[trace.rating]['has_success'].append(1 if trace.has_success_indicator else 0)

    for rating in ['positive', 'neutral', 'negative']:
        if rating not in features_by_rating:
            continue
        feats = features_by_rating[rating]
        print(f"\n{rating.upper()} (n={len(feats['similarity'])}):")
        print(f"  Similarity:     mean={statistics.mean(feats['similarity']):.3f}, median={statistics.median(feats['similarity']):.3f}")
        print(f"  Keyword Overlap: mean={statistics.mean(feats['keyword_overlap']):.3f}, median={statistics.median(feats['keyword_overlap']):.3f}")
        print(f"  Step Count:      mean={statistics.mean(feats['step_count']):.1f}, max={max(feats['step_count'])}")
        print(f"  Has Negation:    {sum(feats['has_negation'])}/{len(feats['has_negation'])} ({100*sum(feats['has_negation'])/len(feats['has_negation']):.1f}%)")
        print(f"  Has Success:     {sum(feats['has_success'])}/{len(feats['has_success'])} ({100*sum(feats['has_success'])/len(feats['has_success']):.1f}%)")


def run_experiment() -> None:
    """Run the complete experiment."""
    print("=" * 70)
    print("EXPERIMENT 3: DETERMINISTIC-FIRST EVAL/REWARD FUNCTION")
    print("=" * 70)
    print(f"\nJob ID: {JOB_ID}")
    print(f"Database: {DB_PATH}")

    # Load data
    print("\n--- Loading Data ---")
    all_traces = load_traces_for_job(JOB_ID, DB_PATH)
    print(f"Loaded {len(all_traces)} traces")

    # Compute features for all traces
    print("Computing features...")
    for trace in all_traces:
        compute_features(trace)

    # Split data
    train_traces = [t for t in all_traces if t.split == "train"]
    val_traces = [t for t in all_traces if t.split == "validation"]
    test_traces = [t for t in all_traces if t.split == "test"]

    print(f"\nData splits:")
    print(f"  Train: {len(train_traces)} traces")
    print(f"  Validation: {len(val_traces)} traces")
    print(f"  Test: {len(test_traces)} traces")

    # Rating distribution per split
    for name, traces in [("Train", train_traces), ("Validation", val_traces), ("Test", test_traces)]:
        ratings = defaultdict(int)
        for t in traces:
            ratings[t.rating] += 1
        print(f"  {name} ratings: {dict(ratings)}")

    # Feature analysis on training set
    analyze_features_by_rating(train_traces)

    # Analyze rules on training set
    print("\n--- Rule Analysis (Training Set) ---")
    rule_stats = analyze_rules_on_training(train_traces, DETERMINISTIC_RULES)
    print_rule_analysis(rule_stats, len(train_traces))

    # Evaluate cascade on training set
    print("\n--- Cascade Evaluation (Training Set) ---")
    train_results, train_metrics = evaluate_cascade(train_traces, DETERMINISTIC_RULES)
    print_metrics(train_metrics, "Training Set")

    # Evaluate cascade on validation set
    print("\n--- Cascade Evaluation (Validation Set) ---")
    val_results, val_metrics = evaluate_cascade(val_traces, DETERMINISTIC_RULES)
    print_metrics(val_metrics, "Validation Set")

    # Evaluate cascade on test set (final evaluation)
    print("\n--- Cascade Evaluation (Test Set - FINAL) ---")
    test_results, test_metrics = evaluate_cascade(test_traces, DETERMINISTIC_RULES)
    print_metrics(test_metrics, "Test Set")

    # Cost analysis
    print("\n--- Cost Analysis ---")
    cost = estimate_cost_savings(test_metrics)
    print(f"Baseline cost (all LLM): ${cost['baseline_cost_usd']:.4f}")
    print(f"Cascade cost: ${cost['cascade_cost_usd']:.4f}")
    print(f"Savings: ${cost['savings_usd']:.4f} ({cost['savings_percent']:.1%})")
    print(f"LLM calls saved: {cost['llm_calls_saved']}")

    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"Goal: >85% deterministic coverage")
    print(f"Achieved: {test_metrics.deterministic_coverage:.1%} deterministic coverage")
    print(f"\nDeterministic accuracy: {test_metrics.deterministic_accuracy:.1%}")
    print(f"Overall accuracy: {test_metrics.overall_accuracy:.1%}")
    print(f"F1 Score: {test_metrics.f1_score:.1%}")

    if test_metrics.deterministic_coverage >= 0.85:
        print("\n[SUCCESS] Goal achieved!")
    elif test_metrics.deterministic_coverage >= 0.7:
        print("\n[PARTIAL] Close to goal, consider adding more rules")
    else:
        print("\n[NEEDS WORK] Coverage below target, rules need improvement")

    # Show sample predictions
    print("\n--- Sample Predictions (Test Set) ---")
    for i, result in enumerate(test_results[:10]):
        match = "Y" if result.predicted_rating == result.actual_rating else "N"
        print(f"  [{match}] {result.predicted_rating:>8} (actual: {result.actual_rating:>8}) - {result.rule_used or 'LLM'}: {result.reason[:50]}...")

    # Show misclassifications
    print("\n--- Sample Misclassifications (Test Set) ---")
    misclassified = [r for r in test_results if r.predicted_rating != r.actual_rating][:5]
    for result in misclassified:
        print(f"  Predicted: {result.predicted_rating}, Actual: {result.actual_rating}")
        print(f"    Rule: {result.rule_used or 'LLM'}")
        print(f"    Reason: {result.reason[:70]}...")


# ============================================================================
# Export eval function for use in production
# ============================================================================

__all__ = [
    'eval_deterministic_first',
    'DETERMINISTIC_RULES',
    'TraceWithFeedback',
    'compute_features',
    'apply_cascade',
    'EvalResult',
    'CascadeMetrics',
]


if __name__ == "__main__":
    run_experiment()
