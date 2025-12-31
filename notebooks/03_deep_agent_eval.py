import marimo

__generated_with = "0.18.4"
app = marimo.App()


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    # Deep Agent Eval Generation (DAEG) Experiment

    This notebook implements an experiment for automated reward function generation using a deep agent with clustering and comparative evaluation tools.

    ## Experiment Overview

    1. **Generate Traces**: Run a weak agent (GPT-4o-mini) on ART-E tasks
    2. **Simulate Feedback**: Label traces using simulated human feedback
    3. **Deep Agent**: Generate reward functions using clustering and comparison tools
    4. **Evaluate**: Test on hidden holdout set

    See `DAEG_EXPERIMENT_DESIGN.md` for full design details.
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 1. Setup & Configuration
    """)
    return


@app.cell
def _():
    # Core imports
    import json
    import hashlib
    import os
    from pathlib import Path
    from dataclasses import dataclass, field
    from typing import Optional, List, Dict, Any, Tuple
    from datetime import datetime

    # Data manipulation
    import pandas as pd
    import numpy as np

    # Visualization
    import matplotlib.pyplot as plt
    import seaborn as sns

    # ML / Clustering
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score
    from scipy import stats
    from scipy.spatial.distance import cosine

    # Local modules
    import db_utils
    from feedback_simulator import (
        generate_simulated_feedback,
        get_recent_taskset_runs,
        LLMClient,
        EVALUATION_RUBRIC,
    )

    # Display settings
    pd.set_option('display.max_columns', None)
    pd.set_option('display.max_colwidth', 100)
    plt.style.use('seaborn-v0_8-whitegrid')

    print("Setup complete!")
    return (
        Any,
        Dict,
        KMeans,
        LLMClient,
        List,
        Optional,
        Tuple,
        cosine,
        dataclass,
        db_utils,
        hashlib,
        json,
        np,
        os,
        pd,
        silhouette_score,
        stats,
    )


@app.cell
def _(os):
    # Cell tags: parameters
    # ========================================
    # EXPERIMENT PARAMETERS (papermill injectable)
    # ========================================

    # Trace generation
    TASK_LIMIT = 1000
    AGENT_MODEL = "gpt-4o-mini"

    # Feedback simulation
    FEEDBACK_COUNT = 100
    FEEDBACK_SKEW = 0.6

    # Deep agent configuration
    DEEP_AGENT_MODEL = "gemini-2.5-flash"
    MIN_CANDIDATES = 5
    MAX_ITERATIONS = 5
    TARGET_ACCURACY = 0.80

    # Train/Val/Test split
    TRAIN_RATIO = 0.64
    VAL_RATIO = 0.16
    TEST_RATIO = 0.20

    # Clustering configuration
    N_CLUSTERS = 5
    EMBEDDING_MODEL = "text-embedding-3-small"

    # Reproducibility
    SEED = 42

    # API keys
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

    # Execution mode
    DRY_RUN = True

    print("Configuration:")
    print(f"  Tasks: {TASK_LIMIT}")
    print(f"  Feedback traces: {FEEDBACK_COUNT}")
    print(f"  Agent model: {AGENT_MODEL}")
    print(f"  Deep agent model: {DEEP_AGENT_MODEL}")
    print(f"  Split: {TRAIN_RATIO:.0%} train / {VAL_RATIO:.0%} val / {TEST_RATIO:.0%} test")
    print(f"  Dry run: {DRY_RUN}")
    return (
        AGENT_MODEL,
        DEEP_AGENT_MODEL,
        DRY_RUN,
        EMBEDDING_MODEL,
        GOOGLE_API_KEY,
        MAX_ITERATIONS,
        MIN_CANDIDATES,
        N_CLUSTERS,
        OPENAI_API_KEY,
        SEED,
        TARGET_ACCURACY,
        TASK_LIMIT,
    )


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 2. Train/Validation/Test Split Implementation
    """)
    return


@app.cell
def _(List, hashlib, pd):
    def get_split(trace_id: str, train_ratio: float = 0.64, val_ratio: float = 0.16) -> str:
        """Deterministic train/val/test split based on trace ID hash."""
        hash_val = int(hashlib.md5(trace_id.encode()).hexdigest(), 16) % 100
        train_threshold = int(train_ratio * 100)
        val_threshold = train_threshold + int(val_ratio * 100)
    
        if hash_val < train_threshold:
            return 'train'
        elif hash_val < val_threshold:
            return 'val'
        else:
            return 'test'


    def filter_by_split(traces: List[dict], split: str) -> List[dict]:
        """Filter traces to a specific split."""
        return [t for t in traces if get_split(t['id']) == split]


    # Test the split distribution
    _test_ids = [f"trace_{i}" for i in range(1000)]
    _split_dist = pd.Series([get_split(tid) for tid in _test_ids]).value_counts(normalize=True)
    print("Split distribution (expected ~64/16/20):")
    print(_split_dist)
    return filter_by_split, get_split


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 3. Embedding & Clustering Tools
    """)
    return


@app.cell
def _(List, Optional, json, np):
    # Try to import OpenAI for embeddings
    try:
        from openai import OpenAI
        OPENAI_AVAILABLE = True
    except ImportError:
        OPENAI_AVAILABLE = False
        print("Warning: openai not installed. Embedding features disabled.")


    class EmbeddingClient:
        """Client for generating text embeddings."""
    
        def __init__(self, model: str = "text-embedding-3-small", api_key: Optional[str] = None):
            self.model = model
            if OPENAI_AVAILABLE:
                self.client = OpenAI(api_key=api_key) if api_key else OpenAI()
            else:
                self.client = None
    
        def embed(self, texts: List[str]) -> np.ndarray:
            """Generate embeddings for a list of texts."""
            if not self.client:
                return self._simple_embed(texts)
            response = self.client.embeddings.create(model=self.model, input=texts)
            return np.array([e.embedding for e in response.data])
    
        def _simple_embed(self, texts: List[str]) -> np.ndarray:
            """Simple TF-IDF-like embedding fallback."""
            from sklearn.feature_extraction.text import TfidfVectorizer
            vectorizer = TfidfVectorizer(max_features=256)
            return vectorizer.fit_transform(texts).toarray()


    def extract_first_message(trace: dict) -> str:
        """Extract the first user message from a trace."""
        steps = trace.get('steps', [])
        if isinstance(steps, str):
            steps = json.loads(steps) if steps else []
        for step in steps:
            messages = step.get('messages_added', [])
            for msg in messages:
                if msg.get('role') == 'user':
                    return msg.get('content', '')[:500]
        return trace.get('input_preview', '')[:500]


    def extract_full_trace_text(trace: dict) -> str:
        """Extract all text content from a trace."""
        steps = trace.get('steps', [])
        if isinstance(steps, str):
            steps = json.loads(steps) if steps else []
        texts = []
        for step in steps:
            for msg in step.get('messages_added', []):
                content = msg.get('content', '')
                if content:
                    texts.append(content[:200])
        return ' '.join(texts)[:2000]


    def extract_tool_pattern(trace: dict) -> str:
        """Extract the sequence of tool calls as a string."""
        steps = trace.get('steps', [])
        if isinstance(steps, str):
            steps = json.loads(steps) if steps else []
        tools = []
        for step in steps:
            for tc in step.get('tool_calls', []):
                tool_name = tc.get('tool_name', tc.get('name', 'unknown'))
                tools.append(tool_name)
        return ' -> '.join(tools) if tools else 'no_tools'


    print("Embedding tools ready.")
    return (
        EmbeddingClient,
        extract_first_message,
        extract_full_trace_text,
        extract_tool_pattern,
    )


@app.cell
def _(
    Dict,
    EmbeddingClient,
    KMeans,
    List,
    Optional,
    SEED,
    dataclass,
    extract_first_message,
    extract_full_trace_text,
    extract_tool_pattern,
    np,
    pd,
    silhouette_score,
):
    @dataclass
    class ClusterResult:
        """Result of clustering traces."""
        labels: np.ndarray
        centroids: np.ndarray
        strategy: str
        silhouette: float
        cluster_sizes: Dict[int, int]

    def cluster_traces(traces: List[dict], strategy: str='first_message', n_clusters: int=5, embedding_client: Optional[EmbeddingClient]=None) -> ClusterResult:
        """Cluster traces using the specified strategy."""
        _emb_client = embedding_client if embedding_client is not None else EmbeddingClient()
        if strategy == 'first_message':
            texts = [extract_first_message(t) for t in traces]
        elif strategy == 'full_trace':
            texts = [extract_full_trace_text(t) for t in traces]
        elif strategy == 'tool_pattern':
            texts = [extract_tool_pattern(t) for t in traces]
        else:
            raise ValueError(f'Unknown strategy: {strategy}')
        texts = [t if t else 'empty' for t in texts]
        embeddings = _emb_client.embed(texts)
        n_clusters = min(n_clusters, len(traces))
        kmeans = KMeans(n_clusters=n_clusters, random_state=SEED, n_init=10)
        labels = kmeans.fit_predict(embeddings)
        sil_score = silhouette_score(embeddings, labels) if len(set(labels)) > 1 else 0.0
        cluster_sizes = dict(pd.Series(labels).value_counts())
        return ClusterResult(labels=labels, centroids=kmeans.cluster_centers_, strategy=strategy, silhouette=sil_score, cluster_sizes=cluster_sizes)
    print('Clustering tools ready.')
    return (cluster_traces,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 4. Comparative Evaluation (Ruler-Inspired)
    """)
    return


@app.cell
def _(
    EmbeddingClient,
    LLMClient,
    List,
    Tuple,
    cosine,
    dataclass,
    extract_first_message,
    extract_full_trace_text,
    json,
):
    @dataclass
    class PairwiseComparison:
        """Result of comparing two traces."""
        trace_a_id: str
        trace_b_id: str
        winner: str
        reasoning: str
        similarity: float
    COMPARISON_PROMPT = 'You are comparing two AI agent executions on similar tasks.\n\n## Task A\n{task_a}\n\n## Execution A\n{execution_a}\n\n## Task B (similar to Task A)\n{task_b}\n\n## Execution B\n{execution_b}\n\nWhich execution was better quality? Consider correctness, efficiency, and edge case handling.\nRespond with JSON: {{"winner": "a" or "b" or "tie", "reasoning": "brief explanation"}}\n'

    def find_similar_traces(target_trace: dict, candidate_traces: List[dict], embedding_client: EmbeddingClient, top_k: int=3) -> List[Tuple[dict, float]]:
        """Find traces with similar tasks by first message similarity."""
        target_text = extract_first_message(target_trace)
        candidate_texts = [extract_first_message(t) for t in candidate_traces]
        all_texts = [target_text] + candidate_texts
        embeddings = embedding_client.embed(all_texts)
        target_emb = embeddings[0]
        candidate_embs = embeddings[1:]
        similarities = []
        for i, emb in enumerate(candidate_embs):
            sim = 1 - cosine(target_emb, emb)
            similarities.append((candidate_traces[i], sim))
        similarities.sort(key=lambda x: x[1], reverse=True)
        return similarities[:top_k]

    def compare_traces(trace_a: dict, trace_b: dict, llm: LLMClient, similarity: float=0.0) -> PairwiseComparison:
        """Compare two traces using LLM-as-judge."""
        prompt = COMPARISON_PROMPT.format(task_a=extract_first_message(trace_a), task_b=extract_first_message(trace_b), execution_a=extract_full_trace_text(trace_a)[:1000], execution_b=extract_full_trace_text(trace_b)[:1000])
        response = llm.generate(prompt, temperature=0.1)
        try:
            clean = response.strip()
            if clean.startswith('```'):
                clean = clean.split('```')[1]
                if clean.startswith('json'):
                    clean = clean[4:]
            result = json.loads(clean.strip())
            winner = result.get('winner', 'tie')
            reasoning = result.get('reasoning', '')
        except:
            winner = 'tie'
            reasoning = response[:200]
        return PairwiseComparison(trace_a_id=trace_a['id'], trace_b_id=trace_b['id'], winner=winner, reasoning=reasoning, similarity=similarity)
    print('Comparison tools ready.')
    return compare_traces, find_similar_traces


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 5. Reward Function Testing Infrastructure
    """)
    return


@app.cell
def _(Any, Dict, List, Tuple, dataclass, json, stats):
    @dataclass
    class RewardTestResult:
        """Result of testing a reward function."""
        accuracy: float
        pearson_r: float
        cohen_kappa: float
        total: int
        correct: int
        incorrect: int
        errors: int
        predictions: List[Dict[str, Any]]


    def execute_reward_function(code: str, trace: dict, timeout: float = 5.0) -> Tuple[float, str]:
        """Execute a reward function on a trace."""
        allowed_modules = {
            'json': __import__('json'),
            're': __import__('re'),
            'math': __import__('math'),
            'datetime': __import__('datetime'),
            'difflib': __import__('difflib'),
        }
    
        trace_copy = dict(trace)
        if isinstance(trace_copy.get('steps'), str):
            trace_copy['steps'] = json.loads(trace_copy['steps']) if trace_copy['steps'] else []
        if isinstance(trace_copy.get('spans'), str):
            trace_copy['spans'] = json.loads(trace_copy['spans']) if trace_copy['spans'] else []
    
        local_vars = {'trace': trace_copy, **allowed_modules}
        exec(code, local_vars)
    
        eval_fn = None
        for name, obj in local_vars.items():
            if callable(obj) and name.startswith('eval_'):
                eval_fn = obj
                break
    
        if eval_fn is None:
            raise ValueError("No eval function found in code")
    
        result = eval_fn(trace_copy, None)
    
        if isinstance(result, tuple) and len(result) == 2:
            return float(result[0]), str(result[1])
        else:
            return float(result), ""


    def test_reward_function(
        code: str,
        traces: List[dict],
        labels: Dict[str, str]
    ) -> RewardTestResult:
        """Test a reward function against labeled traces."""
        predictions = []
        y_true = []
        y_pred = []
        correct = 0
        incorrect = 0
        errors = 0
    
        for trace in traces:
            trace_id = trace['id']
            true_label = labels.get(trace_id, 'neutral')
            true_score = 1.0 if true_label == 'positive' else 0.0
        
            try:
                pred_score, feedback = execute_reward_function(code, trace)
                pred_label = 'positive' if pred_score >= 0.5 else 'negative'
            
                is_correct = (pred_label == true_label) or (
                    true_label == 'neutral' and 0.3 <= pred_score <= 0.7
                )
            
                if is_correct:
                    correct += 1
                else:
                    incorrect += 1
            
                y_true.append(true_score)
                y_pred.append(pred_score)
            
                predictions.append({
                    'trace_id': trace_id,
                    'true_label': true_label,
                    'pred_score': pred_score,
                    'pred_label': pred_label,
                    'feedback': feedback,
                    'correct': is_correct,
                    'error': None
                })
            except Exception as e:
                errors += 1
                predictions.append({
                    'trace_id': trace_id,
                    'true_label': true_label,
                    'pred_score': None,
                    'pred_label': None,
                    'feedback': None,
                    'correct': False,
                    'error': str(e)
                })
    
        total = len(traces)
        accuracy = correct / total if total > 0 else 0.0
    
        if len(y_true) >= 2 and len(set(y_true)) > 1:
            pearson_r, _ = stats.pearsonr(y_true, y_pred)
        else:
            pearson_r = 0.0
    
        if len(y_true) >= 2:
            from sklearn.metrics import cohen_kappa_score
            y_true_binary = [1 if y >= 0.5 else 0 for y in y_true]
            y_pred_binary = [1 if y >= 0.5 else 0 for y in y_pred]
            try:
                kappa = cohen_kappa_score(y_true_binary, y_pred_binary)
            except:
                kappa = 0.0
        else:
            kappa = 0.0
    
        return RewardTestResult(
            accuracy=accuracy,
            pearson_r=pearson_r,
            cohen_kappa=kappa,
            total=total,
            correct=correct,
            incorrect=incorrect,
            errors=errors,
            predictions=predictions
        )


    print("Reward function testing ready.")
    return execute_reward_function, test_reward_function


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 6. Deep Agent Implementation
    """)
    return


@app.cell
def _(
    List,
    cluster_traces,
    compare_traces,
    dataclass,
    extract_first_message,
    extract_tool_pattern,
    find_similar_traces,
    json,
    test_reward_function,
):
    @dataclass
    class RewardCandidate:
        """A candidate reward function."""
        code: str
        iteration: int
        val_accuracy: float
        val_pearson: float
        strategy: str
        reasoning: str
    DEEP_AGENT_SYSTEM_PROMPT = 'You are a reward function generator. Write Python functions that evaluate agent trace quality.\n\n## Reward Function Specification\ndef eval_NAME(trace: dict, ctx=None) -> tuple[float, str]:\n    # trace has keys: id, trace_id, steps, spans, metadata\n    # steps is a list with messages_added and tool_calls\n    # Return (score in [0,1], feedback string)\n    # score >= 0.5 = positive, < 0.5 = negative\n\nAllowed imports: json, re, math, datetime, difflib\n\n## Guidelines\n1. Write SEMANTIC patterns, not exact string matches\n2. Check structural patterns (step count, tool usage, errors)\n3. Look for outcome indicators (completion, error types)\n4. Avoid overfitting to specific training examples\n\n## Output Format\nFor each candidate, provide a JSON object on a single line:\n{"strategy": "pattern_name", "reasoning": "why it works", "code": "full function code"}\n'
    GENERATION_PROMPT = '## Training Data Summary\n{training_summary}\n\n## Cluster Analysis\n{cluster_analysis}\n\n## Pairwise Comparison Insights\n{comparison_insights}\n\n## Previous Attempts\n{previous_attempts}\n\n## Task\nGenerate {num_candidates} diverse reward function candidates.\nEach should use different signals or strategies.\nOutput {num_candidates} JSON objects, one per line.\n'

    class DeepAgent:
        """Deep agent for reward function generation."""

        def __init__(self, llm, embedding_client, train_traces, val_traces, labels, n_clusters=5):
            self.llm = llm
            self.embedding_client = embedding_client
            self.train_traces = train_traces
            self.val_traces = val_traces
            self.labels = labels
            self.n_clusters = n_clusters
            self.candidates = []
            self.iteration = 0

        def analyze_training_data(self) -> str:
            """Generate summary of training data."""
            pos_traces = [t for t in self.train_traces if self.labels.get(t['id']) == 'positive']
            neg_traces = [t for t in self.train_traces if self.labels.get(t['id']) == 'negative']
            summary = f'Total: {len(self.train_traces)} (Positive: {len(pos_traces)}, Negative: {len(neg_traces)})\n'
            summary += '\nPositive patterns:\n'
            for i, t in enumerate(pos_traces[:3]):
                summary += f'  {i + 1}. Task: {extract_first_message(t)[:80]}...\n'
                summary += f'     Tools: {extract_tool_pattern(t)}\n'
            summary += '\nNegative patterns:\n'
            for i, t in enumerate(neg_traces[:3]):
                summary += f'  {i + 1}. Task: {extract_first_message(t)[:80]}...\n'
                summary += f'     Tools: {extract_tool_pattern(t)}\n'
            return summary

        def analyze_clusters(self) -> str:
            """Analyze trace clusters."""
            analysis = ''
            for strategy in ['first_message', 'tool_pattern']:
                try:
                    result = cluster_traces(self.train_traces, strategy=strategy, n_clusters=self.n_clusters, embedding_client=self.embedding_client)
                    analysis += f'\n{strategy} (silhouette={result.silhouette:.2f}):\n'
                    for cluster_id in range(self.n_clusters):
                        cluster_traces_list = [t for i, t in enumerate(self.train_traces) if result.labels[i] == cluster_id]
                        if not cluster_traces_list:
                            continue
                        pos_count = sum((1 for t in cluster_traces_list if self.labels.get(t['id']) == 'positive'))
                        neg_count = sum((1 for t in cluster_traces_list if self.labels.get(t['id']) == 'negative'))
                        analysis += f'  Cluster {cluster_id}: {len(cluster_traces_list)} ({pos_count} pos, {neg_count} neg)\n'
                except Exception as e:
                    analysis += f'\n{strategy}: Error - {e}\n'
            return analysis

        def analyze_comparisons(self, n_comparisons: int=3) -> str:
            """Generate pairwise comparison insights."""
            pos_traces = [t for t in self.train_traces if self.labels.get(t['id']) == 'positive']
            neg_traces = [t for t in self.train_traces if self.labels.get(t['id']) == 'negative']
            if not pos_traces or not neg_traces:
                return 'Insufficient traces for comparison.\n'
            analysis = ''
            for pos_trace in pos_traces[:n_comparisons]:
                try:
                    similar = find_similar_traces(pos_trace, neg_traces, self.embedding_client, top_k=1)
                    if similar:
                        neg_trace, similarity = similar[0]
                        if similarity > 0.5:
                            comparison = compare_traces(pos_trace, neg_trace, self.llm, similarity)
                            analysis += f'\nComparison (sim={similarity:.2f}): Winner={comparison.winner}\n'
                            analysis += f'  Reason: {comparison.reasoning[:150]}\n'
                except:
                    pass
            return analysis if analysis else 'No similar pairs found.\n'

        def generate_candidates(self, num_candidates: int=5) -> List[RewardCandidate]:
            """Generate reward function candidates."""
            self.iteration += 1
            training_summary = self.analyze_training_data()
            cluster_analysis = self.analyze_clusters()
            comparison_insights = self.analyze_comparisons() if self.iteration == 1 else '(skipped)\n'
            if self.candidates:
                previous = '\n'.join([f'  - {c.strategy}: accuracy={c.val_accuracy:.1%}' for c in self.candidates[-3:]])
            else:
                previous = 'None yet.'
            prompt = GENERATION_PROMPT.format(training_summary=training_summary, cluster_analysis=cluster_analysis, comparison_insights=comparison_insights, previous_attempts=previous, num_candidates=num_candidates)
            response = self.llm.generate(DEEP_AGENT_SYSTEM_PROMPT + '\n\n' + prompt, temperature=0.7)
            new_candidates = []
            for line in response.split('\n'):
                line = line.strip()
                if not line or not line.startswith('{'):
                    continue
                try:
                    obj = json.loads(line)
                    if 'code' in obj:
                        result = test_reward_function(obj['code'], self.val_traces, self.labels)
                        candidate = RewardCandidate(code=obj['code'], iteration=self.iteration, val_accuracy=result.accuracy, val_pearson=result.pearson_r, strategy=obj.get('strategy', 'unknown'), reasoning=obj.get('reasoning', ''))
                        new_candidates.append(candidate)
                        self.candidates.append(candidate)
                except Exception as e:
                    print(f'Failed to parse candidate: {e}')
            return new_candidates

        def get_best_candidate(self):
            """Get the best candidate by validation accuracy."""
            if not self.candidates:
                return None
            return max(self.candidates, key=lambda c: c.val_accuracy)
    print('Deep agent ready.')
    return (DeepAgent,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 7. Run Experiment
    """)
    return


@app.cell
def _(db_utils, filter_by_split, pd):
    # Load labeled traces
    print("Loading labeled traces...")

    labeled_traces = db_utils.get_labeled_traces(limit=500)
    print(f"Found {len(labeled_traces)} labeled traces")

    if len(labeled_traces) < 20:
        print("\nWarning: Not enough labeled traces for experiment.")
        print("Run the feedback simulator first to generate labels.")
        _traces = []
        labels = {}
        train_traces = []
        val_traces = []
        test_traces = []
    else:
        _traces = []
        labels = {}

        for _row in labeled_traces:
            _trace = db_utils.trace_to_dict_for_eval(_row)
            _traces.append(_trace)
            labels[_trace['id']] = _row.get('rating', 'neutral')

        train_traces = filter_by_split(_traces, 'train')
        val_traces = filter_by_split(_traces, 'val')
        test_traces = filter_by_split(_traces, 'test')

        print(f"\nSplit distribution:")
        print(f"  Train: {len(train_traces)} traces")
        print(f"  Val: {len(val_traces)} traces")
        print(f"  Test: {len(test_traces)} traces (hidden)")

        for _split_name, _split_traces in [('Train', train_traces), ('Val', val_traces), ('Test', test_traces)]:
            _dist = pd.Series([labels.get(t['id'], 'unknown') for t in _split_traces]).value_counts()
            print(f"  {_split_name} labels: {dict(_dist)}")
    return labeled_traces, labels, test_traces, train_traces, val_traces


@app.cell
def _(
    DEEP_AGENT_MODEL,
    DRY_RUN,
    DeepAgent,
    EMBEDDING_MODEL,
    EmbeddingClient,
    GOOGLE_API_KEY,
    LLMClient,
    MAX_ITERATIONS,
    MIN_CANDIDATES,
    N_CLUSTERS,
    OPENAI_API_KEY,
    TARGET_ACCURACY,
    labeled_traces,
    labels,
    train_traces,
    val_traces,
):
    # Run the deep agent
    best_candidate = None
    agent = None
    if len(labeled_traces) >= 20 and (not DRY_RUN):
        print('\n' + '=' * 60)
        print('RUNNING DEEP AGENT EXPERIMENT')
        print('=' * 60)
        _llm = LLMClient(model=DEEP_AGENT_MODEL, api_key=GOOGLE_API_KEY)
        _emb_client_main = EmbeddingClient(model=EMBEDDING_MODEL, api_key=OPENAI_API_KEY)
        agent = DeepAgent(llm=_llm, embedding_client=_emb_client_main, train_traces=train_traces, val_traces=val_traces, labels=labels, n_clusters=N_CLUSTERS)
        for _iteration in range(MAX_ITERATIONS):
            print(f'\n--- Iteration {_iteration + 1} ---')
            _new_candidates = agent.generate_candidates(num_candidates=MIN_CANDIDATES)
            print(f'Generated {len(_new_candidates)} candidates')
            for _c in _new_candidates:
                print(f'  - {_c.strategy}: accuracy={_c.val_accuracy:.1%}')
            _current_best = agent.get_best_candidate()
            if _current_best and _current_best.val_accuracy >= TARGET_ACCURACY:
                print(f'\nTarget accuracy reached! ({_current_best.val_accuracy:.1%})')
                break
        best_candidate = agent.get_best_candidate()
        if best_candidate:
            print(f'\n' + '=' * 60)
            print('BEST CANDIDATE')
            print('=' * 60)
            print(f'Strategy: {best_candidate.strategy}')
            print(f'Validation Accuracy: {best_candidate.val_accuracy:.1%}')
            print(f'\nCode:\n{best_candidate.code}')
    elif DRY_RUN:
        print('\n[DRY RUN] Skipping deep agent execution.')
        print('Set DRY_RUN = False to run the experiment.')
    else:
        print('\nInsufficient data. Need at least 20 labeled traces.')
    return agent, best_candidate


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 8. Final Evaluation on Hidden Test Set
    """)
    return


@app.cell
def _(best_candidate, labels, test_reward_function, test_traces):
    # Evaluate best candidate on hidden test set
    test_result = None

    if best_candidate and len(test_traces) > 0:
        print("\n" + "="*60)
        print("FINAL EVALUATION ON HIDDEN TEST SET")
        print("="*60)
    
        test_result = test_reward_function(
            best_candidate.code,
            test_traces,
            labels
        )
    
        print(f"Test Accuracy: {test_result.accuracy:.1%}")
        print(f"Test Pearson r: {test_result.pearson_r:.2f}")
        print(f"Test Cohen's Kappa: {test_result.cohen_kappa:.2f}")
        print(f"\nResults: {test_result.correct} correct, {test_result.incorrect} incorrect, {test_result.errors} errors")
    else:
        print("\nNo best candidate to evaluate (run the experiment first).")
    return (test_result,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 9. Ablation Studies
    """)
    return


@app.cell
def _(
    EmbeddingClient,
    N_CLUSTERS,
    OPENAI_API_KEY,
    cluster_traces,
    train_traces,
):
    # Compare clustering strategies
    if len(train_traces) >= 10:
        print('\n' + '=' * 60)
        print('CLUSTERING STRATEGY COMPARISON')
        print('=' * 60)
        try:
            _emb_client_ablation = EmbeddingClient(api_key=OPENAI_API_KEY)
            for _strategy in ['first_message', 'full_trace', 'tool_pattern']:
                try:
                    _cluster_result = cluster_traces(train_traces, strategy=_strategy, n_clusters=min(N_CLUSTERS, len(train_traces)), embedding_client=_emb_client_ablation)
                    print(f'\n{_strategy}:')
                    print(f'  Silhouette score: {_cluster_result.silhouette:.3f}')
                    print(f'  Cluster sizes: {_cluster_result.cluster_sizes}')
                except Exception as _e:
                    print(f'\n{_strategy}: Error - {_e}')
        except Exception as _e:
            print(f'\nClustering skipped: {_e}')
            print('Set OPENAI_API_KEY to enable clustering analysis.')
    else:
        print('Insufficient data for ablation studies.')
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 10. Summary & Next Steps
    """)
    return


@app.cell
def _(
    AGENT_MODEL,
    DEEP_AGENT_MODEL,
    DRY_RUN,
    TASK_LIMIT,
    agent,
    labeled_traces,
    test_result,
):
    print('\n' + '=' * 60)
    print('EXPERIMENT SUMMARY')
    print('=' * 60)
    print(f'\nConfiguration:')
    print(f'  Tasks: {TASK_LIMIT}')
    print(f'  Labeled traces: {len(labeled_traces)}')
    print(f'  Agent model: {AGENT_MODEL}')
    print(f'  Deep agent model: {DEEP_AGENT_MODEL}')
    print(f'  Dry run: {DRY_RUN}')
    if agent:
        print(f'\nDeep Agent Results:')
        print(f'  Total iterations: {agent.iteration}')
        print(f'  Total candidates: {len(agent.candidates)}')
        if agent.candidates:
            _summary_best = agent.get_best_candidate()
            print(f'  Best validation accuracy: {_summary_best.val_accuracy:.1%}')
    if test_result:
        print(f'\nFinal Test Results:')
        print(f'  Test accuracy: {test_result.accuracy:.1%}')
        print(f'  Test Pearson r: {test_result.pearson_r:.2f}')
        print(f"  Test Cohen's kappa: {test_result.cohen_kappa:.2f}")
    print(f'\nNext Steps:')
    print('  1. Run more ART-E tasks to generate traces')
    print('  2. Simulate more feedback with different distributions')
    print('  3. Compare with baseline (no clustering) approach')
    print('  4. Test on different agent models')
    print('  5. Deploy best reward function to production')
    return


@app.cell
def _():
    import marimo as mo
    return (mo,)


if __name__ == "__main__":
    app.run()
