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
    import os
    from pathlib import Path
    from datetime import datetime

    # Data manipulation
    import pandas as pd
    import numpy as np

    # Visualization
    import matplotlib.pyplot as plt
    import seaborn as sns

    # Local modules (database utilities and feedback simulator)
    import db_utils
    from feedback_simulator import (
        generate_simulated_feedback,
        get_recent_taskset_runs,
        EVALUATION_RUBRIC,
    )

    # iofold-eval-core package imports
    from iofold_eval_core import (
        # Models
        ClusterResult,
        PairwiseComparison,
        RewardCandidate,
        TestResult,
        LabeledTrace,
        # Splitting
        get_split,
        filter_by_split,
        # Extraction
        extract_tool_pattern,
        # Clustering
        cluster_traces,
        find_similar_traces,
        compare_traces,
        extract_first_message,
        extract_full_trace_text,
        # Embeddings
        EmbeddingClient,
        # Sandbox
        execute_reward_function,
        # Testing
        CandidateTester,
        test_eval_function,
        # LLM
        LLMClient,
        create_llm_client,
        # Generation
        DeepAgent,
    )

    # Display settings
    pd.set_option('display.max_columns', None)
    pd.set_option('display.max_colwidth', 100)
    plt.style.use('seaborn-v0_8-whitegrid')

    print("Setup complete!")
    print("Using iofold-eval-core package for core utilities.")
    return (
        ClusterResult,
        CandidateTester,
        DeepAgent,
        EmbeddingClient,
        LabeledTrace,
        LLMClient,
        PairwiseComparison,
        RewardCandidate,
        TestResult,
        cluster_traces,
        compare_traces,
        create_llm_client,
        db_utils,
        execute_reward_function,
        extract_first_message,
        extract_full_trace_text,
        extract_tool_pattern,
        filter_by_split,
        find_similar_traces,
        get_split,
        json,
        np,
        os,
        pd,
        test_eval_function,
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
        TRAIN_RATIO,
        VAL_RATIO,
    )


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 2. Train/Validation/Test Split Implementation

    Using the iofold-eval-core package for deterministic splitting.
    """)
    return


@app.cell
def _(TRAIN_RATIO, VAL_RATIO, get_split, pd):
    # Test the split distribution using package functions
    _test_ids = [f"trace_{i}" for i in range(1000)]
    _split_dist = pd.Series([get_split(tid, TRAIN_RATIO, VAL_RATIO) for tid in _test_ids]).value_counts(normalize=True)
    print("Split distribution (expected ~64/16/20):")
    print(_split_dist)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 3. Embedding & Clustering Tools

    Using the iofold-eval-core package for embeddings and clustering.
    The package provides:
    - `EmbeddingClient`: OpenAI-compatible embeddings with TF-IDF fallback
    - `cluster_traces`: K-means clustering with multiple strategies
    - `extract_first_message`, `extract_full_trace_text`, `extract_tool_pattern`: Text extraction
    """)
    return


@app.cell
def _():
    print("Embedding and clustering tools imported from iofold-eval-core package.")
    print("Available strategies: first_message, full_trace, tool_pattern")
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 4. Comparative Evaluation (Ruler-Inspired)

    Using the iofold-eval-core package for trace comparison:
    - `find_similar_traces`: Find traces with similar tasks by embedding similarity
    - `compare_traces`: Compare two traces using LLM-as-judge
    """)
    return


@app.cell
def _():
    print("Comparison tools imported from iofold-eval-core package.")
    print("Uses COMPARISON_PROMPT for LLM-as-judge evaluation.")
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 5. Reward Function Testing Infrastructure

    Using the iofold-eval-core package for testing:
    - `execute_reward_function`: Safe sandbox execution
    - `CandidateTester` / `test_eval_function`: Test against labeled traces
    - `TestResult`: Comprehensive metrics (accuracy, Pearson r, Cohen's kappa, F1)
    """)
    return


@app.cell
def _():
    print("Reward function testing infrastructure imported from iofold-eval-core package.")
    print("Supports: accuracy, Pearson r, Cohen's kappa, F1 score")
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 6. Deep Agent Implementation

    Using the iofold-eval-core package `DeepAgent` class which provides:
    - `analyze_training_data()`: Generate summary of training data
    - `analyze_clusters()`: Cluster analysis using embeddings
    - `analyze_patterns()`: Pattern analysis for positive/negative traces
    - `generate_candidates()`: Generate and test reward function candidates
    - `get_best_candidate()`: Get best candidate by validation accuracy
    - `run_iterations()`: Run multiple iterations until target or max reached
    """)
    return


@app.cell
def _():
    print("DeepAgent imported from iofold-eval-core.generation package.")
    print("Supports iterative generation with pattern analysis and refinement.")
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 7. Run Experiment
    """)
    return


@app.cell
def _(LabeledTrace, TRAIN_RATIO, VAL_RATIO, db_utils, get_split, pd):
    # Load labeled traces
    print("Loading labeled traces...")

    labeled_traces_raw = db_utils.get_labeled_traces(limit=500)
    print(f"Found {len(labeled_traces_raw)} labeled traces")

    if len(labeled_traces_raw) < 20:
        print("\nWarning: Not enough labeled traces for experiment.")
        print("Run the feedback simulator first to generate labels.")
        traces_list = []
        labels = {}
        train_traces = []
        val_traces = []
        test_traces = []
        train_labeled = []
        val_labeled = []
    else:
        traces_list = []
        labels = {}

        for _row in labeled_traces_raw:
            _trace = db_utils.trace_to_dict_for_eval(_row)
            traces_list.append(_trace)
            labels[_trace['id']] = _row.get('rating', 'neutral')

        # Use package filter_by_split with custom ratios
        def _filter_by_split_custom(traces, split):
            return [t for t in traces if get_split(t['id'], TRAIN_RATIO, VAL_RATIO) == split]

        train_traces = _filter_by_split_custom(traces_list, 'train')
        val_traces = _filter_by_split_custom(traces_list, 'val')
        test_traces = _filter_by_split_custom(traces_list, 'test')

        # Create LabeledTrace objects for DeepAgent
        def _to_labeled_trace(trace_dict, labels_dict):
            rating = labels_dict.get(trace_dict['id'], 'neutral')
            human_score = 1.0 if rating == 'positive' else (0.0 if rating == 'negative' else 0.5)
            return LabeledTrace(
                trace=trace_dict,
                human_score=human_score,
                feedback_text=rating,
            )

        train_labeled = [_to_labeled_trace(t, labels) for t in train_traces]
        val_labeled = [_to_labeled_trace(t, labels) for t in val_traces]

        print(f"\nSplit distribution:")
        print(f"  Train: {len(train_traces)} traces")
        print(f"  Val: {len(val_traces)} traces")
        print(f"  Test: {len(test_traces)} traces (hidden)")

        for _split_name, _split_traces in [('Train', train_traces), ('Val', val_traces), ('Test', test_traces)]:
            _dist = pd.Series([labels.get(t['id'], 'unknown') for t in _split_traces]).value_counts()
            print(f"  {_split_name} labels: {dict(_dist)}")
    return (
        labels,
        labeled_traces_raw,
        test_traces,
        train_labeled,
        train_traces,
        traces_list,
        val_labeled,
        val_traces,
    )


@app.cell
def _(
    DEEP_AGENT_MODEL,
    DRY_RUN,
    DeepAgent,
    EMBEDDING_MODEL,
    EmbeddingClient,
    GOOGLE_API_KEY,
    MAX_ITERATIONS,
    MIN_CANDIDATES,
    N_CLUSTERS,
    OPENAI_API_KEY,
    TARGET_ACCURACY,
    create_llm_client,
    labeled_traces_raw,
    train_labeled,
    val_labeled,
):
    # Run the deep agent using the package DeepAgent class
    best_candidate = None
    agent = None

    if len(labeled_traces_raw) >= 20 and (not DRY_RUN):
        print('\n' + '=' * 60)
        print('RUNNING DEEP AGENT EXPERIMENT')
        print('=' * 60)

        # Create LLM client using package factory
        _llm = create_llm_client(
            model=DEEP_AGENT_MODEL,
            api_key=GOOGLE_API_KEY,
        )

        # Create embedding client using package class
        _emb_client_main = EmbeddingClient(
            model=EMBEDDING_MODEL,
            api_key=OPENAI_API_KEY,
        )

        # Create DeepAgent using package class
        agent = DeepAgent(
            llm_client=_llm,
            embedding_client=_emb_client_main,
            train_traces=train_labeled,
            val_traces=val_labeled,
            n_clusters=N_CLUSTERS,
        )

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
def _(
    LabeledTrace,
    best_candidate,
    labels,
    test_eval_function,
    test_traces,
):
    # Evaluate best candidate on hidden test set using package tester
    test_result = None

    if best_candidate and len(test_traces) > 0:
        print("\n" + "="*60)
        print("FINAL EVALUATION ON HIDDEN TEST SET")
        print("="*60)

        # Create LabeledTrace objects for test set
        def _to_labeled_trace_test(trace_dict, labels_dict):
            rating = labels_dict.get(trace_dict['id'], 'neutral')
            human_score = 1.0 if rating == 'positive' else (0.0 if rating == 'negative' else 0.5)
            return LabeledTrace(
                trace=trace_dict,
                human_score=human_score,
                feedback_text=rating,
            )

        test_labeled = [_to_labeled_trace_test(t, labels) for t in test_traces]

        # Use package test_eval_function
        test_result = test_eval_function(
            code=best_candidate.code,
            labeled_traces=test_labeled,
            threshold=0.5,
        )

        print(f"Test Accuracy: {test_result.accuracy:.1%}")
        print(f"Test Pearson r: {test_result.pearson_r:.2f}")
        print(f"Test Cohen's Kappa: {test_result.cohen_kappa:.2f}")
        print(f"Test F1 Score: {test_result.f1_score:.2f}")
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
    # Compare clustering strategies using package functions
    if len(train_traces) >= 10:
        print('\n' + '=' * 60)
        print('CLUSTERING STRATEGY COMPARISON')
        print('=' * 60)
        try:
            _emb_client_ablation = EmbeddingClient(api_key=OPENAI_API_KEY)
            for _strategy in ['first_message', 'full_trace', 'tool_pattern']:
                try:
                    _cluster_result = cluster_traces(
                        train_traces,
                        strategy=_strategy,
                        n_clusters=min(N_CLUSTERS, len(train_traces)),
                        embedding_client=_emb_client_ablation,
                    )
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
    labeled_traces_raw,
    test_result,
):
    print('\n' + '=' * 60)
    print('EXPERIMENT SUMMARY')
    print('=' * 60)
    print(f'\nConfiguration:')
    print(f'  Tasks: {TASK_LIMIT}')
    print(f'  Labeled traces: {len(labeled_traces_raw)}')
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
        print(f"  Test F1 score: {test_result.f1_score:.2f}")
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
