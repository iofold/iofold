# iofold-eval-core

Platform-agnostic evaluation generation from labeled agent traces via meta-prompting.

## Overview

`iofold-eval-core` is a Python library for automatically generating evaluation functions (reward functions) from human-labeled agent execution traces. It provides tools for:

- **Trace processing**: Parse, split, and extract information from agent traces
- **Pattern analysis**: Identify patterns distinguishing good from poor executions
- **Candidate generation**: Use LLMs to generate eval function candidates
- **Testing and validation**: Test candidates against labeled data with comprehensive metrics
- **Clustering**: Group similar traces for analysis and sampling

## Installation

### Basic Installation

```bash
pip install iofold-eval-core
```

### With Optional Dependencies

```bash
# For LLM-based generation (OpenAI API)
pip install iofold-eval-core[llm]

# For embedding-based clustering
pip install iofold-eval-core[embeddings]

# For notebook development
pip install iofold-eval-core[notebooks]

# All optional dependencies
pip install iofold-eval-core[all]

# Development dependencies
pip install iofold-eval-core[dev]
```

### From Source

```bash
cd notebooks/iofold_eval_core
pip install -e .
```

## Quick Start

```python
from iofold_eval_core import (
    Trace, LabeledTrace,
    split_traces,
    extract_user_message,
    execute_reward_function,
    CandidateTester,
    create_llm_client,
    DeepAgent,
)

# 1. Load and split your traces
train_traces, val_traces, test_traces = split_traces(all_traces)

# 2. Create labeled traces from feedback
labeled_traces = [
    LabeledTrace.from_trace_and_feedback(trace, feedback)
    for trace, feedback in zip(traces, feedbacks)
]

# 3. Generate eval candidates using DeepAgent
llm = create_llm_client(model="gpt-4o-mini")
agent = DeepAgent(
    llm_client=llm,
    embedding_client=None,  # Optional
    train_traces=train_traces,
    val_traces=val_traces,
)

# Run iterative generation
best_candidate = agent.run_iterations(
    max_iterations=5,
    target_accuracy=0.85,
)

# 4. Test the best candidate
tester = CandidateTester()
result = tester.test_candidate(best_candidate.code, test_traces)
print(f"Test accuracy: {result.accuracy:.2%}")
print(f"Cohen's Kappa: {result.cohen_kappa:.3f}")
```

## Module Documentation

### models/ - Data Types

Core data models for traces, feedback, candidates, and results.

```python
from iofold_eval_core import (
    Message,           # TypedDict for trace messages
    ToolCall,          # TypedDict for tool calls
    ExecutionStep,     # TypedDict for execution steps
    Trace,             # Agent execution trace
    Feedback,          # Human feedback on a trace
    LabeledTrace,      # Trace + human score
    RewardCandidate,   # Generated reward function
    EvalCandidate,     # Database eval candidate
    TestResult,        # Testing results
    ClusterResult,     # Clustering results
    FoldResult,        # Single CV fold result
    CrossValidationResult,  # Cross-validation results
)

# Create a Trace from dict
trace = Trace.from_dict({
    "id": "trace_123",
    "trace_id": "trace_123",
    "steps": [...],
    "has_errors": False,
    ...
})

# Create LabeledTrace from Trace and Feedback
labeled = LabeledTrace.from_trace_and_feedback(
    trace=trace,
    feedback=feedback,  # Maps rating to score: positive=1.0, negative=0.0
)

# Access derived properties
print(labeled.rating)  # 'positive', 'negative', or 'neutral'
print(labeled.human_score)  # 0.0 to 1.0
```

### splitting/ - Train/Val/Test Splitting

Deterministic hash-based splitting for reproducibility.

```python
from iofold_eval_core import (
    get_split,       # Get split name for single trace
    filter_by_split, # Filter traces by split
    split_traces,    # Split into (train, val, test)
    SplitName,       # Type alias: 'train' | 'val' | 'test'
)

# Deterministic split based on trace ID (always same result)
split = get_split("trace_abc123")  # Returns 'train', 'val', or 'test'

# Custom ratios (default: 64% train, 16% val, 20% test)
split = get_split("trace_xyz", train_ratio=0.8, val_ratio=0.1)

# Split all traces at once
train, val, test = split_traces(all_traces)

# Filter to specific split
val_only = filter_by_split(all_traces, "val")
```

### extraction/ - Message and Tool Extraction

Extract information from trace data.

```python
from iofold_eval_core import (
    # Message extraction
    extract_user_message,      # First user message
    extract_assistant_response, # Final assistant response
    extract_all_messages,      # All messages in order
    extract_system_message,    # System prompt

    # Tool extraction
    extract_tool_calls,        # All tool calls
    extract_tool_pattern,      # Tool sequence string (e.g., 'search->read->write')
    extract_unique_tools,      # Unique tool names
    count_tool_calls,          # Tool call counts
    extract_tool_results,      # Tool calls with results
    get_tool_call_count,       # Total tool call count
    has_tool_errors,           # Any tool errors?

    # Quality signals
    has_errors,                # Any errors in trace?
    extract_errors,            # List of error details
    detect_issues,             # Detect common issues
    get_step_count,            # Number of steps
    get_trace_duration_ms,     # Estimated duration
    compute_quality_signals,   # Comprehensive quality dict
)

# Extract user's request
user_msg = extract_user_message(trace)
print(f"User asked: {user_msg}")

# Analyze tool usage
pattern = extract_tool_pattern(trace)  # 'search->read->edit->save'
counts = count_tool_calls(trace)       # {'search': 2, 'read': 5}

# Detect issues
issues = detect_issues(trace)
# Returns list: ['errors', 'loops', 'inefficiency', 'tool_failures', etc.]

# Get comprehensive signals
signals = compute_quality_signals(trace)
# {
#     'has_errors': False,
#     'step_count': 10,
#     'tool_call_count': 15,
#     'unique_tools': 4,
#     'issues': [],
#     'has_response': True,
#     'duration_ms': 5000,
# }
```

### sandbox/ - Safe Code Execution

Execute generated eval functions safely.

```python
from iofold_eval_core import (
    ALLOWED_MODULES,          # Safe modules: json, re, math, datetime, difflib
    execute_reward_function,  # Execute single trace
    execute_batch,            # Execute multiple traces
    FORBIDDEN_IMPORTS,        # Blocked imports
    FORBIDDEN_CALLS,          # Blocked function calls
    CodeValidator,            # AST-based validator
    validate_eval_code,       # Validate code safety
    get_validation_warnings,  # Get non-fatal warnings
    quick_check,              # Fast regex pre-check
)

# Define eval function code
code = '''
def eval_quality(trace, ctx=None):
    """Evaluate trace quality based on errors and tool usage."""
    steps = trace.get('steps', [])

    # Check for errors
    for step in steps:
        if step.get('error'):
            return 0.0, "Error found in trace"

    # Check tool count
    tool_count = sum(len(s.get('tool_calls', [])) for s in steps)
    if tool_count > 20:
        return 0.3, "Excessive tool calls"

    return 1.0, "No issues detected"
'''

# Validate before execution
is_valid, errors = validate_eval_code(code)
if not is_valid:
    print(f"Validation errors: {errors}")

# Execute on single trace
score, feedback = execute_reward_function(code, trace_dict)
print(f"Score: {score}, Feedback: {feedback}")

# Execute on batch
results = execute_batch(code, traces, stop_on_error=False)
for r in results:
    if r['error']:
        print(f"Error on {r['trace_id']}: {r['error']}")
    else:
        print(f"{r['trace_id']}: {r['score']}")
```

### metrics/ - Classification, Correlation, Agreement Metrics

Pure Python implementations of evaluation metrics.

```python
from iofold_eval_core import (
    # Classification
    ConfusionMatrix,
    calculate_confusion_matrix,
    accuracy,
    precision,
    recall,
    f1_score,

    # Correlation
    pearson_correlation,

    # Agreement
    cohen_kappa,
    fleiss_kappa,

    # Composite
    composite_score,
    normalize_metrics,
    meets_thresholds,
)

# Calculate confusion matrix from scores
pred_scores = [0.8, 0.3, 0.6, 0.9]
human_scores = [1.0, 0.0, 0.7, 1.0]
cm = calculate_confusion_matrix(pred_scores, human_scores, threshold=0.5)

# Get individual metrics
print(f"Accuracy: {accuracy(cm):.2%}")
print(f"Precision: {precision(cm):.2%}")
print(f"Recall: {recall(cm):.2%}")
print(f"F1: {f1_score(cm):.2%}")

# Correlation between predictions and ground truth
r = pearson_correlation(pred_scores, human_scores)
print(f"Pearson r: {r:.3f}")

# Agreement accounting for chance
kappa = cohen_kappa(cm, n=len(pred_scores))
print(f"Cohen's Kappa: {kappa:.3f}")

# Composite scoring
metrics = {'accuracy': 0.85, 'f1_score': 0.80, 'cohen_kappa': 0.65}
weights = {'accuracy': 0.3, 'f1_score': 0.3, 'cohen_kappa': 0.4}
score = composite_score(metrics, weights)

# Check thresholds
thresholds = {'accuracy': 0.7, 'cohen_kappa': 0.4}
passed, details = meets_thresholds(metrics, thresholds)
print(f"Passed: {passed}, Details: {details}")
```

### testing/ - CandidateTester, CrossValidator, WinnerSelector

Test and validate eval candidates.

```python
from iofold_eval_core import (
    CandidateTester,
    test_eval_function,
    CrossValidator,
    cross_validate_candidate,
    WinnerSelector,
    select_best_candidate,
    DEFAULT_WEIGHTS,
)

# Test a single candidate
tester = CandidateTester(timeout=5.0)
result = tester.test_candidate(
    code=eval_code,
    labeled_traces=labeled_traces,
    threshold=0.5,
)
print(f"Accuracy: {result.accuracy:.2%}")
print(f"Cohen's Kappa: {result.cohen_kappa:.3f}")
print(f"F1 Score: {result.f1_score:.2%}")
print(f"Errors: {result.errors}/{result.total}")

# Cross-validation for stability assessment
cv_result = cross_validate_candidate(
    code=eval_code,
    labeled_traces=labeled_traces,
    k=5,
    seed=42,
)
print(f"Mean accuracy: {cv_result.mean_accuracy:.2%} +/- {cv_result.std_accuracy:.2%}")
print(f"Is stable: {cv_result.is_stable}")

# Select best from multiple candidates
candidates = [
    (code1, result1),
    (code2, result2),
    (code3, result3),
]

selector = WinnerSelector()
winner = selector.select_winner(
    candidates=candidates,
    min_accuracy=0.7,
    min_kappa=0.4,
)
if winner:
    best_code, best_result = winner
    print(f"Best candidate accuracy: {best_result.accuracy:.2%}")

# Rank all candidates by composite score
ranked = selector.rank_candidates(candidates, weights=DEFAULT_WEIGHTS)
for code, result, score in ranked:
    print(f"Score: {score:.3f}, Accuracy: {result.accuracy:.2%}")
```

### llm/ - LLM Client

OpenAI-compatible client with Cloudflare AI Gateway support.

```python
from iofold_eval_core import (
    LLMClient,          # Protocol for LLM clients
    OpenAIClient,       # OpenAI implementation
    create_llm_client,  # Factory function
)

# Create client (uses OPENAI_API_KEY env var by default)
client = create_llm_client(model="gpt-4o-mini")

# Or with explicit configuration
client = create_llm_client(
    model="gpt-4o",
    api_key="sk-...",
    base_url="https://gateway.ai.cloudflare.com/v1/...",  # Optional
)

# Generate text
response = client.generate(
    prompt="Explain Python in one sentence.",
    temperature=0.3,
    max_tokens=100,
)

# Generate with messages
response = client.generate_with_messages(
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"},
    ],
    temperature=0.3,
)

# Generate JSON response (uses JSON mode)
result = client.generate_json(
    prompt="List 3 programming languages as JSON: {\"languages\": [...]}",
)
```

### embeddings/ - Embedding Utilities

Text embeddings for clustering and similarity.

```python
from iofold_eval_core import (
    EmbeddingClientProtocol,  # Protocol
    EmbeddingClient,          # OpenAI embeddings
    create_embedding_client,  # Factory
    TFIDFEmbedding,          # Local TF-IDF (no API)
    create_tfidf_embedding,  # Factory
)

# OpenAI embeddings
client = create_embedding_client(
    model="text-embedding-3-small",
    dimensions=256,  # Optional dimension reduction
)
embeddings = client.embed(["Hello world", "Goodbye world"])
single = client.embed_single("Hello world")

# Batch embedding for large datasets
all_embeddings = client.embed_batch(texts, batch_size=100)

# TF-IDF embeddings (no API needed)
tfidf = create_tfidf_embedding(vocab_size=500, ngram_range=(1, 2))
tfidf.fit(corpus)  # Learn vocabulary
embeddings = tfidf.embed(["new document"])

# Or fit and embed in one step
embeddings = tfidf.fit_embed(corpus)
```

### clustering/ - Trace Clustering

Cluster traces by task similarity, execution pattern, or tool usage.

```python
from iofold_eval_core import (
    cluster_traces,
    get_cluster_traces,
    get_cluster_representatives,
    find_similar_traces,
    find_most_similar,
    compare_traces,
    compute_pairwise_similarities,
    extract_first_message,
    extract_full_trace_text,
)

# Cluster traces by initial user message
result = cluster_traces(
    traces=traces,
    strategy='first_message',  # or 'full_trace', 'tool_pattern'
    n_clusters=5,
    embedding_client=embedding_client,
)
print(f"Silhouette score: {result.silhouette:.3f}")
print(f"Cluster sizes: {result.cluster_sizes}")

# Get traces in a specific cluster
cluster_0_traces = get_cluster_traces(traces, result, cluster_id=0)

# Get representative traces (closest to centroids)
representatives = get_cluster_representatives(
    traces, result, embedding_client, n_per_cluster=2
)

# Find similar traces
similar = find_similar_traces(
    target_trace=target,
    candidate_traces=candidates,
    embedding_client=embedding_client,
    top_k=5,
)
for trace, similarity in similar:
    print(f"Similarity: {similarity:.3f}")

# Compare two traces using LLM-as-judge
comparison = compare_traces(trace_a, trace_b, llm_client)
print(f"Winner: {comparison.winner}")  # 'a', 'b', or 'tie'
print(f"Reasoning: {comparison.reasoning}")

# Compute pairwise similarity matrix
sim_matrix = compute_pairwise_similarities(traces, embedding_client)
```

### generation/ - DeepAgent, PatternAnalyzer, CandidateGenerator

LLM-based eval function generation.

```python
from iofold_eval_core import (
    DeepAgent,
    PatternAnalyzer,
    CandidateGenerator,
    format_trace_for_prompt,
    format_labeled_trace,
    format_candidates_for_prompt,
)

# Pattern Analyzer - identify distinguishing patterns
analyzer = PatternAnalyzer(llm_client)
patterns = analyzer.analyze(
    positive_traces=positive_traces,
    negative_traces=negative_traces,
    max_examples=5,
)
print(f"Patterns: {patterns['patterns']}")
print(f"Quality signals: {patterns['signals']}")
print(f"Suggested checks: {patterns['suggested_checks']}")

# Pairwise comparison
comparison = analyzer.compare_pair(trace_a, trace_b)
print(f"Winner: {comparison['winner']}")
print(f"Key differences: {comparison['key_differences']}")

# Candidate Generator - generate eval functions
generator = CandidateGenerator(llm_client)
candidates = generator.generate(
    training_summary="Dataset of email classification traces...",
    cluster_analysis="Cluster 1: Email queries, Cluster 2: Calendar...",
    num_candidates=5,
)
for c in candidates:
    print(f"Strategy: {c['strategy']}")
    print(f"Code: {c['code'][:100]}...")

# Refine a candidate based on errors
refined = generator.refine(
    original_candidate=candidate,
    analysis="Function misses edge cases with empty responses",
    misclassified="Example 1: ...",
)

# DeepAgent - full iterative workflow
agent = DeepAgent(
    llm_client=llm_client,
    embedding_client=embedding_client,  # Optional
    train_traces=train_traces,
    val_traces=val_traces,
    n_clusters=5,
)

# Generate candidates with analysis
new_candidates = agent.generate_candidates(
    num_candidates=5,
    include_analysis=True,
)

# Get best candidate so far
best = agent.get_best_candidate()
print(f"Best accuracy: {best.val_accuracy:.2%}")

# Run full iterative workflow
best = agent.run_iterations(
    max_iterations=5,
    candidates_per_iteration=5,
    target_accuracy=0.85,
    target_kappa=0.7,
)
```

## API Reference

### Exported Functions and Classes

```python
# Models
Message, ToolCall, ExecutionStep, Trace, Feedback, LabeledTrace
RewardCandidate, EvalCandidate, TestResult, ClusterResult
PairwiseComparison, FoldResult, CrossValidationResult

# Splitting
get_split, filter_by_split, split_traces, SplitName

# Extraction - Messages
extract_user_message, extract_assistant_response
extract_all_messages, extract_system_message

# Extraction - Tools
extract_tool_calls, extract_tool_pattern, extract_unique_tools
count_tool_calls, extract_tool_results, get_tool_call_count, has_tool_errors

# Extraction - Signals
has_errors, extract_errors, detect_issues
get_step_count, get_trace_duration_ms, compute_quality_signals

# Serialization
trace_to_dict_for_eval, dict_to_trace
serialize_for_storage, normalize_trace, extract_eval_context

# Sandbox
ALLOWED_MODULES, execute_reward_function, execute_batch
FORBIDDEN_IMPORTS, FORBIDDEN_CALLS, CodeValidator
validate_eval_code, get_validation_warnings, quick_check

# LLM
LLMClient, OpenAIClient, create_llm_client

# Embeddings
EmbeddingClientProtocol, EmbeddingClient, create_embedding_client
TFIDFEmbedding, create_tfidf_embedding

# Metrics
ConfusionMatrix, calculate_confusion_matrix
accuracy, precision, recall, f1_score
pearson_correlation, cohen_kappa, fleiss_kappa
composite_score, normalize_metrics, meets_thresholds

# Testing
CandidateTester, test_eval_function
CrossValidator, cross_validate_candidate
WinnerSelector, select_best_candidate, DEFAULT_WEIGHTS

# Clustering
cluster_traces, get_cluster_traces, get_cluster_representatives
find_similar_traces, find_most_similar, compare_traces
compute_pairwise_similarities, extract_first_message, extract_full_trace_text

# Generation
DeepAgent, PatternAnalyzer, CandidateGenerator
format_trace_for_prompt, format_labeled_trace, format_candidates_for_prompt
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key for LLM and embeddings | Required for LLM/embedding features |
| `OPENAI_BASE_URL` | Custom API base URL (for Cloudflare AI Gateway) | OpenAI default |

### Example with Cloudflare AI Gateway

```python
import os

# Set environment variables
os.environ["OPENAI_API_KEY"] = "your-api-key"
os.environ["OPENAI_BASE_URL"] = "https://gateway.ai.cloudflare.com/v1/YOUR_ACCOUNT/YOUR_GATEWAY/openai"

# Or pass directly
client = create_llm_client(
    model="gpt-4o-mini",
    base_url="https://gateway.ai.cloudflare.com/v1/...",
)
```

## Requirements

- Python >= 3.10
- Core: `numpy>=1.24.0`, `scikit-learn>=1.3.0`, `scipy>=1.10.0`
- Optional LLM: `openai>=1.0.0`
- Optional Notebooks: `marimo>=0.18.0`, `pandas>=2.0.0`, `matplotlib>=3.7.0`

## License

MIT License - see LICENSE file for details.
