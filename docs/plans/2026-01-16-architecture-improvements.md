# Architecture Improvements: expectedOutput-Focused Scoring

## Goal
Improve eval accuracy from ~58% to 80% by better leveraging `expectedOutput` ground truth.

## Key Gaps Identified
1. **No deterministic expectedOutput comparison** - only LLMJudge uses it passively
2. **No embedding similarity scoring** - infrastructure exists but unused in eval
3. **No entity extraction/matching** - keywords checked but not semantic entities

## Implementation Plan

### Task 1: DirectComparisonEvaluator
**File**: `notebooks/iofold_eval_core/scoring/evaluators/direct_comparison.py`

```python
class DirectComparisonEvaluator(BaseEvaluator):
    """Deterministic comparison of output vs expectedOutput"""

    def evaluate(self, trace, ctx=None):
        expected = trace.get('metadata', {}).get('expectedOutput', '')
        actual = trace.get('output_preview', '')

        # 1. String similarity (difflib)
        ratio = SequenceMatcher(None, actual.lower(), expected.lower()).ratio()

        # 2. Token overlap (Jaccard)
        actual_tokens = set(actual.lower().split())
        expected_tokens = set(expected.lower().split())
        jaccard = len(actual_tokens & expected_tokens) / max(len(actual_tokens | expected_tokens), 1)

        # 3. Negation alignment
        actual_neg = has_negation(actual)
        expected_neg = has_negation(expected) or expected.strip() == ''
        neg_match = 1.0 if actual_neg == expected_neg else 0.0

        # Combined score
        score = 0.4 * ratio + 0.4 * jaccard + 0.2 * neg_match

        return EvalResult(
            score=score,
            feedback=f"String sim: {ratio:.2f}, Token overlap: {jaccard:.2f}, Negation: {'match' if neg_match else 'mismatch'}",
            confidence=0.8 if expected else 0.3
        )
```

**Weight**: 0.25 (high - direct ground truth comparison)

### Task 2: EmbeddingSimilarityEvaluator
**File**: `notebooks/iofold_eval_core/scoring/evaluators/embedding_similarity.py`

```python
class EmbeddingSimilarityEvaluator(BaseEvaluator):
    """Semantic similarity using embeddings"""

    def __init__(self, embedding_client=None):
        self.client = embedding_client or EmbeddingClient()

    def evaluate(self, trace, ctx=None):
        expected = trace.get('metadata', {}).get('expectedOutput', '')
        actual = trace.get('output_preview', '')

        if not expected or not actual:
            return EvalResult(score=0.5, feedback="Missing expected/actual", confidence=0.2)

        # Get embeddings
        embeddings = self.client.embed([expected, actual])

        # Cosine similarity
        similarity = 1 - cosine(embeddings[0], embeddings[1])

        # Map to score (similarity 0.8+ is likely correct)
        score = min(1.0, similarity * 1.1)  # Slight boost for high similarity

        return EvalResult(
            score=score,
            feedback=f"Semantic similarity: {similarity:.3f}",
            confidence=0.75
        )
```

**Weight**: 0.20 (semantic understanding)

### Task 3: EntityMatchEvaluator
**File**: `notebooks/iofold_eval_core/scoring/evaluators/entity_match.py`

```python
class EntityMatchEvaluator(BaseEvaluator):
    """Extract and compare key entities (numbers, names, dates)"""

    def evaluate(self, trace, ctx=None):
        expected = trace.get('metadata', {}).get('expectedOutput', '')
        actual = trace.get('output_preview', '')

        # Extract entities
        expected_nums = extract_numbers(expected)
        actual_nums = extract_numbers(actual)

        expected_names = extract_names(expected)  # Capitalized words
        actual_names = extract_names(actual)

        # Calculate overlap
        num_overlap = len(expected_nums & actual_nums) / max(len(expected_nums), 1)
        name_overlap = len(expected_names & actual_names) / max(len(expected_names), 1)

        # Penalty for hallucinated entities
        hallucinated_nums = actual_nums - expected_nums
        hallucination_penalty = min(0.3, len(hallucinated_nums) * 0.1)

        score = 0.5 * num_overlap + 0.3 * name_overlap + 0.2 - hallucination_penalty

        return EvalResult(
            score=max(0, score),
            feedback=f"Numbers: {num_overlap:.0%}, Names: {name_overlap:.0%}, Hallucinations: {len(hallucinated_nums)}",
            confidence=0.7 if expected_nums or expected_names else 0.3
        )
```

**Weight**: 0.15 (factual precision)

### Task 4: Update Presets
**File**: `notebooks/iofold_eval_core/scoring/presets.py`

Add new preset `create_expected_output_scorer()`:
```python
def create_expected_output_scorer(embedding_client=None):
    """Scorer optimized for traces with expectedOutput ground truth"""
    scorer = CompositeScorer()

    # High-value expectedOutput evaluators (60%)
    scorer.add_evaluator(DirectComparisonEvaluator(), weight=0.25)
    scorer.add_evaluator(EmbeddingSimilarityEvaluator(embedding_client), weight=0.20)
    scorer.add_evaluator(EntityMatchEvaluator(), weight=0.15)

    # Supporting evaluators (40%)
    scorer.add_evaluator(ErrorCheckEvaluator(), weight=0.10)
    scorer.add_evaluator(ToolUsageEvaluator(), weight=0.10)
    scorer.add_evaluator(NegationPatternEvaluator(), weight=0.10)
    scorer.add_evaluator(LLMJudgeEvaluator(), weight=0.10)  # Reduced weight

    return scorer
```

### Task 5: Comparison Experiment
**File**: `notebooks/experiments/eval_reward_functions/exp_architecture_comparison.py`

Compare:
- Old: `create_semantic_scorer()` (LLM-dominant)
- New: `create_expected_output_scorer()` (expectedOutput-focused)

Metrics: Accuracy, F1, Cohen's Kappa on validation set

## Expected Improvements

| Evaluator | Gap Addressed | Expected Gain |
|-----------|---------------|---------------|
| DirectComparison | No deterministic ground truth check | +10-15% |
| EmbeddingSimilarity | No semantic similarity | +5-10% |
| EntityMatch | Factual precision | +3-5% |

**Target**: 58% → 75-80% accuracy
