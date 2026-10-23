import marimo

__generated_with = "0.18.4"
app = marimo.App()


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    # Simulated Human Feedback Generator

    This notebook generates simulated human feedback on ART-E taskset runs by comparing agent execution with ground truth data.

    ## Use Cases
    - Generate labeled data for eval training without manual labeling
    - Experiment with different feedback distributions
    - Test eval sensitivity to feedback patterns

    ## Prerequisites
    1. Backend running (from project root):
       ```bash
       docker compose up -d
       curl http://localhost:8787/health  # Verify backend is running
       ```
    2. At least one taskset run completed
    3. ART-E tasks loaded in benchmarks database
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 1. Setup & Imports
    """)
    return


@app.cell
def _():
    # Core imports
    import json
    import pandas as pd
    import numpy as np

    # Visualization
    import matplotlib.pyplot as plt
    import seaborn as sns

    # iofold-eval-core package - models and utilities
    from iofold_eval_core import (
        # Models for type annotations
        Feedback,
        Trace,
        LabeledTrace,
        # LLM utilities (can be used as alternative to feedback_simulator's LLMClient)
        create_llm_client,
        LLMClient as CoreLLMClient,
        # Extraction utilities
        extract_user_message,
        extract_assistant_response,
        extract_tool_calls,
        count_tool_calls,
        has_errors,
        detect_issues,
    )

    # Local modules (notebook-specific logic)
    import db_utils
    from feedback_simulator import (
        generate_simulated_feedback,
        get_recent_taskset_runs,
        clear_feedback_for_job,
        EVALUATION_RUBRIC,
    )

    # Display settings
    pd.set_option('display.max_columns', None)
    pd.set_option('display.max_colwidth', 100)
    plt.style.use('seaborn-v0_8-whitegrid')

    # API helper for triggering taskset runs
    import requests
    import time
    import os

    BACKEND_URL = os.getenv("IOFOLD_BACKEND_URL", "http://localhost:8787")
    WORKSPACE_ID = os.getenv("IOFOLD_WORKSPACE_ID", "workspace_default")

    def api_get(endpoint: str) -> dict:
        """Make GET request to backend API."""
        resp = requests.get(
            f"{BACKEND_URL}{endpoint}",
            headers={"X-Workspace-Id": WORKSPACE_ID}
        )
        resp.raise_for_status()
        return resp.json()

    def api_post(endpoint: str, data: dict = None) -> dict:
        """Make POST request to backend API."""
        resp = requests.post(
            f"{BACKEND_URL}{endpoint}",
            json=data or {},
            headers={"X-Workspace-Id": WORKSPACE_ID, "Content-Type": "application/json"}
        )
        resp.raise_for_status()
        return resp.json()

    def list_agents() -> list[dict]:
        """List available agents from backend."""
        try:
            return api_get("/v1/api/agents").get("agents", [])
        except Exception as e:
            print(f"Warning: Could not fetch agents: {e}")
            return []

    def list_tasksets(agent_id: str) -> list[dict]:
        """List tasksets for an agent."""
        try:
            return api_get(f"/v1/api/agents/{agent_id}/tasksets").get("tasksets", [])
        except Exception as e:
            print(f"Warning: Could not fetch tasksets: {e}")
            return []

    def trigger_taskset_run(agent_id: str, taskset_id: str) -> dict:
        """Trigger a taskset run and return job info."""
        return api_post(f"/v1/api/agents/{agent_id}/tasksets/{taskset_id}/run")

    def get_job_status(agent_id: str, taskset_id: str, job_id: str) -> dict:
        """Get status of a taskset run job."""
        return api_get(f"/v1/api/agents/{agent_id}/tasksets/{taskset_id}/runs/{job_id}")

    def wait_for_job(agent_id: str, taskset_id: str, job_id: str, timeout: int = 300) -> dict:
        """Wait for a job to complete, with progress updates."""
        start = time.time()
        while time.time() - start < timeout:
            status = get_job_status(agent_id, taskset_id, job_id)
            job_status = status.get("status", "unknown")
            print(f"  Job {job_id[:20]}... status: {job_status}")
            if job_status in ["completed", "failed", "partial", "cancelled"]:
                return status
            time.sleep(5)
        raise TimeoutError(f"Job {job_id} did not complete within {timeout}s")

    print("Setup complete!")
    print(f"  - iofold_eval_core models: Feedback, Trace, LabeledTrace")
    print(f"  - iofold_eval_core utils: extract_*, count_tool_calls, has_errors, detect_issues")
    print(f"  - LLM clients available: create_llm_client (core), feedback_simulator.LLMClient")
    print(f"  - Backend API: {BACKEND_URL}")
    return (
        BACKEND_URL,
        CoreLLMClient,
        EVALUATION_RUBRIC,
        Feedback,
        LabeledTrace,
        Trace,
        WORKSPACE_ID,
        api_get,
        api_post,
        count_tool_calls,
        create_llm_client,
        db_utils,
        detect_issues,
        extract_assistant_response,
        extract_tool_calls,
        extract_user_message,
        generate_simulated_feedback,
        get_job_status,
        get_recent_taskset_runs,
        has_errors,
        list_agents,
        list_tasksets,
        pd,
        plt,
        trigger_taskset_run,
        wait_for_job,
    )


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 2. View Available Taskset Runs

    Find a taskset run to generate feedback for.
    """)
    return


@app.cell
def _(get_recent_taskset_runs, list_agents, list_tasksets, mo, pd):
    # Get recent taskset runs
    runs = get_recent_taskset_runs(limit=10)

    if len(runs) > 0:
        # Create dropdown for job selection
        job_options = {
            f"{r['job_id'][:20]}... ({r['status']}, {r.get('task_count', '?')} tasks)": r['job_id']
            for _, r in runs.iterrows()
        }
        # Note: marimo dropdown value must be a key (display label), not the actual value
        first_key = list(job_options.keys())[0] if job_options else None
        job_dropdown = mo.ui.dropdown(
            options=job_options,
            value=first_key,
            label="Select Taskset Run"
        )
        agent_dropdown = None
        taskset_dropdown = None
        _output = mo.vstack([
            mo.md(f"Found {len(runs)} taskset runs. Select one:"),
            job_dropdown,
            mo.ui.table(runs)
        ])
    else:
        job_dropdown = None
        # No runs - show available agents and tasksets
        agents = list_agents()
        if agents:
            agent_options = {a.get('name', a['id']): a['id'] for a in agents}
            first_agent_key = list(agent_options.keys())[0] if agent_options else None
            agent_dropdown = mo.ui.dropdown(
                options=agent_options,
                value=first_agent_key,
                label="Select Agent"
            )
            # Get tasksets for first agent
            first_agent_id = list(agent_options.values())[0] if agent_options else None
            tasksets_list = list_tasksets(first_agent_id) if first_agent_id else []
            if tasksets_list:
                taskset_options = {
                    f"{t['name']} ({t.get('task_count', 0)} tasks)": t['id']
                    for t in tasksets_list
                }
                first_taskset_key = list(taskset_options.keys())[0] if taskset_options else None
                taskset_dropdown = mo.ui.dropdown(
                    options=taskset_options,
                    value=first_taskset_key,
                    label="Select Taskset"
                )
            else:
                taskset_dropdown = None
            _output = mo.vstack([
                mo.md("**No taskset runs found.** Select an agent and taskset to trigger a new run:"),
                agent_dropdown,
                taskset_dropdown if taskset_dropdown else mo.md("*No tasksets available for this agent*"),
            ])
        else:
            agent_dropdown = None
            taskset_dropdown = None
            _output = mo.md("No agents found. Create an agent first using the iofold UI.")
    _output
    return agent_dropdown, job_dropdown, runs, taskset_dropdown


@app.cell
def _(agent_dropdown, db_utils, mo, runs, taskset_dropdown, trigger_taskset_run, wait_for_job):
    # Cell: Check traces and optionally trigger taskset run
    trigger_button = None
    run_status = None

    if len(runs) == 0 and agent_dropdown and taskset_dropdown:
        # No runs exist - offer to trigger one
        trigger_button = mo.ui.button(label="🚀 Trigger Taskset Run", kind="success")

        if trigger_button.value:
            # Button was clicked - trigger the run
            try:
                agent_id = agent_dropdown.value
                taskset_id = taskset_dropdown.value
                print(f"Triggering taskset run for agent={agent_id}, taskset={taskset_id}...")
                result = trigger_taskset_run(agent_id, taskset_id)
                job_id = result.get("job_id")
                print(f"Job created: {job_id}")

                # Wait for completion
                print("Waiting for job to complete...")
                final_status = wait_for_job(agent_id, taskset_id, job_id, timeout=600)
                run_status = mo.md(f"✅ **Taskset run completed!** Job: `{job_id}` Status: `{final_status.get('status')}`\n\nRefresh the notebook to see traces.")
            except Exception as e:
                run_status = mo.md(f"❌ **Error triggering run:** {e}")

        _output = mo.vstack([
            mo.md("### Trigger Taskset Run"),
            mo.md(f"No existing runs. Click below to execute taskset `{taskset_dropdown.value}`:"),
            trigger_button,
            run_status if run_status else mo.md(""),
        ])
    elif len(runs) > 0:
        # Check trace count for first run
        first_job = runs.iloc[0]
        traces = db_utils.get_traces_for_job(first_job['job_id'])
        _output = mo.md(f"✅ Found **{len(traces)} traces** for selected job `{first_job['job_id'][:20]}...`")
    else:
        _output = mo.md("*Select an agent and taskset above to trigger a run*")

    _output
    return run_status, trigger_button


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 3. Configure Feedback Generation

    ### Knobs

    | Knob | Description | Range |
    |------|-------------|-------|
    | `coverage` | % of traces receiving feedback | 0.0-1.0 |
    | `detail_level` | Mean detail score (higher = more textual feedback) | 0.0-1.0 |
    | `detail_variance` | Variance in detail scores | 0.0-0.5 |

    ### Detail Score Behavior
    - `< 0.5`: Rating only (no text)
    - `0.5-0.7`: Terse feedback (3-8 words)
    - `0.7-0.85`: Brief feedback (1 sentence)
    - `> 0.85`: Detailed feedback (2-3 sentences)
    """)
    return


@app.cell
def _(job_dropdown, runs):
    # Cell tags: parameters
    # Parameters (papermill will inject values here)
    # ========================================

    # Auto-select job_id from dropdown, or use first available run
    if job_dropdown and job_dropdown.value:
        JOB_ID = job_dropdown.value
    elif len(runs) > 0:
        JOB_ID = runs.iloc[0]['job_id']
    else:
        JOB_ID = None

    # Knobs
    COVERAGE = 0.8           # 80% of traces get feedback
    DETAIL_LEVEL = 0.6       # Moderate detail on average
    DETAIL_VARIANCE = 0.2    # Some variance

    # Model (gemini-2.5-flash, gpt-4o-mini, claude-3-haiku-20240307)
    MODEL = "gemini-2.5-flash"

    # Optional: API key (if not set via environment)
    API_KEY = None  # Or set explicitly: "your-api-key"

    # Reproducibility
    SEED = 42

    # Execution mode
    DRY_RUN = True  # Set to False to write to database

    print(f"Configuration:")
    print(f"  Job ID: {JOB_ID or '(none available)'}")
    print(f"  Coverage: {COVERAGE*100:.0f}%")
    print(f"  Detail Level: {DETAIL_LEVEL}")
    print(f"  Detail Variance: {DETAIL_VARIANCE}")
    print(f"  Model: {MODEL}")
    print(f"  Dry Run: {DRY_RUN}")
    return (
        API_KEY,
        COVERAGE,
        DETAIL_LEVEL,
        DETAIL_VARIANCE,
        DRY_RUN,
        JOB_ID,
        MODEL,
        SEED,
    )


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 4. Customize Evaluation Rubric (Optional)

    The rubric guides the LLM's evaluation. Edit it to change how feedback is generated.
    """)
    return


@app.cell
def _(EVALUATION_RUBRIC):
    # View the default rubric
    print("Default Evaluation Rubric:")
    print("="*50)
    print(EVALUATION_RUBRIC)
    return


@app.cell
def _(EVALUATION_RUBRIC):
    # Optional: Customize the rubric
    # Uncomment and modify to use a custom rubric

    # CUSTOM_RUBRIC = """
    # Your custom rubric here...
    # """

    # Use default rubric
    RUBRIC = EVALUATION_RUBRIC

    # Or use custom:
    # RUBRIC = CUSTOM_RUBRIC
    return (RUBRIC,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 5. Preview (Dry Run)

    Generate feedback without writing to the database.
    """)
    return


@app.cell
def _(
    API_KEY,
    COVERAGE,
    DETAIL_LEVEL,
    DETAIL_VARIANCE,
    JOB_ID,
    MODEL,
    RUBRIC,
    SEED,
    generate_simulated_feedback,
    mo,
):
    # Dry run - preview feedback without writing to DB
    preview_results = generate_simulated_feedback(
        job_id=JOB_ID,
        coverage=COVERAGE,
        detail_level=DETAIL_LEVEL,
        detail_variance=DETAIL_VARIANCE,
        rubric=RUBRIC,
        model=MODEL,
        api_key=API_KEY,
        dry_run=True,  # Don't write to DB
        seed=SEED
    )

    if len(preview_results) > 0:
        _output = mo.vstack([
            mo.md(f"Preview of {len(preview_results)} feedback records:"),
            mo.ui.table(preview_results[["trace_id", "task_id", "rating", "rating_detail", "detail_score"]])
        ])
    else:
        _output = mo.md("No feedback generated. Check job_id and trace data.")
    _output
    return (preview_results,)


@app.cell
def _(preview_results):
    # Analyze preview results
    if len(preview_results) > 0:
        print('Rating Distribution:')
        print(preview_results['rating'].value_counts())
        print(f"\nWith textual detail: {preview_results['rating_detail'].notna().sum()} / {len(preview_results)}")
        print(f'\nDetail Score Stats:')
        print(preview_results['detail_score'].describe())
        print('\n' + '=' * 50)
        print('Sample Feedback:')
        print('=' * 50)
        samples = preview_results[preview_results['rating_detail'].notna()].head(5)  # Show sample feedback
        for _, _row in samples.iterrows():
            print(f"\n[{_row['rating'].upper()}] {_row['rating_detail']}")
            print(f"  Expected: {_row['expected_answer'][:80]}...")
            print(f"  Got: {_row['agent_answer'][:80]}...")
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 6. Execute (Write to Database)

    **Warning**: This will insert feedback records into the database.
    """)
    return


@app.cell
def _(
    API_KEY,
    COVERAGE,
    DETAIL_LEVEL,
    DETAIL_VARIANCE,
    DRY_RUN,
    JOB_ID,
    MODEL,
    RUBRIC,
    SEED,
    generate_simulated_feedback,
):
    # Execute - write feedback to database (controlled by DRY_RUN parameter)
    results = generate_simulated_feedback(
        job_id=JOB_ID,
        coverage=COVERAGE,
        detail_level=DETAIL_LEVEL,
        detail_variance=DETAIL_VARIANCE,
        rubric=RUBRIC,
        model=MODEL,
        api_key=API_KEY,
        dry_run=DRY_RUN,
        seed=SEED
    )

    if len(results) > 0:
        if DRY_RUN:
            print(f"\n[DRY RUN] Would insert {len(results)} feedback records")
        else:
            inserted_count = results['was_inserted'].sum()
            print(f"\nInserted {inserted_count} feedback records into database")
    else:
        print("No feedback generated.")
    return (results,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 7. Analyze Results
    """)
    return


@app.cell
def _(plt, results):
    if len(results) > 0:
        fig, axes = plt.subplots(1, 3, figsize=(15, 4))

        # Rating distribution
        rating_counts = results['rating'].value_counts()
        colors = {'positive': 'forestgreen', 'neutral': 'steelblue', 'negative': 'coral'}
        rating_counts.plot(kind='bar', ax=axes[0], color=[colors.get(r, 'gray') for r in rating_counts.index])
        axes[0].set_title('Rating Distribution')
        axes[0].set_ylabel('Count')
        axes[0].set_xticklabels(axes[0].get_xticklabels(), rotation=0)

        # Detail score distribution
        results['detail_score'].hist(ax=axes[1], bins=20, color='steelblue', edgecolor='white')
        axes[1].axvline(x=0.5, color='red', linestyle='--', label='Threshold')
        axes[1].set_title('Detail Score Distribution')
        axes[1].set_xlabel('Detail Score')
        axes[1].legend()

        # With vs without textual detail
        has_detail = results['rating_detail'].notna().value_counts()
        # Rename index safely based on actual values present
        label_map = {True: 'With Text', False: 'Rating Only'}
        has_detail.index = [label_map.get(idx, str(idx)) for idx in has_detail.index]
        colors = ['forestgreen' if 'With' in str(idx) else 'lightgray' for idx in has_detail.index]
        has_detail.plot(kind='pie', ax=axes[2], autopct='%1.1f%%', colors=colors)
        axes[2].set_title('Textual Feedback Coverage')
        axes[2].set_ylabel('')

        plt.tight_layout()
        plt.show()
    return


@app.cell
def _(results):
    # Sample feedback by rating
    if len(results) > 0:
        for rating in ['positive', 'neutral', 'negative']:
            subset = results[(results['rating'] == rating) & results['rating_detail'].notna()]
            if len(subset) > 0:
                print(f"\n{'=' * 50}")
                print(f'{rating.upper()} FEEDBACK SAMPLES')
                print('=' * 50)
                for _, _row in subset.head(3).iterrows():
                    print(f"\n> {_row['rating_detail']}")
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 8. Verify in Database
    """)
    return


@app.cell
def _(db_utils):
    # Check feedback in database
    feedback_stats = db_utils.get_trace_statistics()
    print("Database Feedback Statistics:")
    print(f"  Total with feedback: {feedback_stats.get('with_feedback', 0)}")
    print(f"  Distribution: {feedback_stats.get('feedback_distribution', {})}")
    return


@app.cell
def _(db_utils, results):
    # Verify feedback for specific traces
    if len(results) > 0:
        trace_ids = results['trace_id'].tolist()[:5]
        feedback_map = db_utils.get_feedback_for_traces(trace_ids)

        print("Feedback in database:")
        for trace_id, feedback in feedback_map.items():
            detail = feedback.get('rating_detail') or '(none)'
            print(f"  {trace_id[:20]}... -> {feedback['rating']} | {detail[:50]}")
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 9. Experimentation Ideas

    Try different knob settings to generate varied feedback distributions:

    | Experiment | coverage | detail_level | detail_variance | Result |
    |------------|----------|--------------|-----------------|--------|
    | Sparse, terse | 0.3 | 0.3 | 0.1 | Few feedback, mostly ratings |
    | Dense, detailed | 1.0 | 0.9 | 0.05 | All traces, rich text |
    | Noisy | 0.8 | 0.6 | 0.4 | Varied detail levels |
    | Realistic | 0.5 | 0.5 | 0.2 | Half coverage, mixed detail |
    """)
    return


@app.cell
def _(
    API_KEY,
    JOB_ID,
    MODEL,
    RUBRIC,
    SEED,
    generate_simulated_feedback,
    mo,
    pd,
):
    # Compare different configurations (dry run)
    _configs = [
        {"name": "Sparse/Terse", "coverage": 0.3, "detail_level": 0.3, "detail_variance": 0.1},
        {"name": "Dense/Detailed", "coverage": 1.0, "detail_level": 0.9, "detail_variance": 0.05},
        {"name": "Noisy", "coverage": 0.8, "detail_level": 0.6, "detail_variance": 0.4},
        {"name": "Realistic", "coverage": 0.5, "detail_level": 0.5, "detail_variance": 0.2},
    ]

    _comparison_results = []

    for _config in _configs:
        print(f"\nTesting: {_config['name']}...")
        try:
            _r = generate_simulated_feedback(
                job_id=JOB_ID,
                coverage=_config["coverage"],
                detail_level=_config["detail_level"],
                detail_variance=_config["detail_variance"],
                rubric=RUBRIC,
                model=MODEL,
                api_key=API_KEY,
                dry_run=True,
                seed=SEED
            )
            if len(_r) > 0:
                _comparison_results.append({
                    "Config": _config["name"],
                    "Traces": len(_r),
                    "With Text": _r['rating_detail'].notna().sum(),
                    "Positive": (_r['rating'] == 'positive').sum(),
                    "Neutral": (_r['rating'] == 'neutral').sum(),
                    "Negative": (_r['rating'] == 'negative').sum(),
                })
        except Exception as e:
            print(f"  Error: {e}")

    if _comparison_results:
        _output = mo.vstack([
            mo.md("## COMPARISON RESULTS"),
            mo.ui.table(pd.DataFrame(_comparison_results))
        ])
    else:
        _output = mo.md("No comparison results generated.")
    _output
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 10. Next Steps

    After generating feedback:

    1. **Run eval experimentation** - Use `01_eval_experimentation.ipynb` to test eval functions against the labeled traces
    2. **Generate evals** - Use the iofold UI to auto-generate evals from the labeled traces
    3. **Compare eval accuracy** - See how well evals predict the simulated feedback
    4. **Iterate** - Adjust rubric or knobs and regenerate to test different scenarios
    """)
    return


@app.cell
def _():
    import marimo as mo
    return (mo,)


if __name__ == "__main__":
    app.run()
