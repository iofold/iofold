# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "marimo",
#     "pyzmq",
# ]
# ///

import marimo

__generated_with = "0.18.4"
app = marimo.App()


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    # iofold Eval Experimentation Notebook

    This notebook provides a sandbox for experimenting with different eval strategies on trace data from the iofold database.

    ## Setup

    1. Make sure the backend is running (from project root):
       ```bash
       docker compose up -d
       curl http://localhost:8787/health  # Verify backend is running
       ```
    2. Install dependencies: `pip install -r requirements.txt`
    3. Run cells in order

    ## What you can do here:
    - Explore trace data structure
    - Write custom eval functions in Python
    - Test eval functions against labeled traces
    - Compare eval strategies with statistical metrics
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
    import json
    import sqlite3
    from pathlib import Path
    from typing import Optional, Any

    # Data analysis
    import pandas as pd
    import numpy as np

    # Visualization
    import matplotlib.pyplot as plt
    import seaborn as sns

    # iofold-eval-core package imports
    from iofold_eval_core import (
        # Extraction utilities
        extract_user_message,
        extract_assistant_response,
        extract_tool_calls,
        has_errors,
        detect_issues,
        # Metrics utilities
        calculate_confusion_matrix,
        accuracy as calc_accuracy,
        precision as calc_precision,
        recall as calc_recall,
        f1_score as calc_f1_score,
        pearson_correlation,
        cohen_kappa,
        # LLM utilities
        OpenAIClient,
        create_llm_client,
        # Serialization utilities
        trace_to_dict_for_eval,
    )

    # LLM clients (optional, for LLM-as-judge evals)
    try:
        from openai import OpenAI
        OPENAI_AVAILABLE = True
    except ImportError:
        OPENAI_AVAILABLE = False

    try:
        import anthropic
        ANTHROPIC_AVAILABLE = True
    except ImportError:
        ANTHROPIC_AVAILABLE = False

    # Local utilities (for database queries - notebook-specific)
    import db_utils

    # Display settings
    pd.set_option('display.max_columns', None)
    pd.set_option('display.max_colwidth', 100)
    plt.style.use('seaborn-v0_8-whitegrid')

    print("Setup complete!")
    print(f"OpenAI available: {OPENAI_AVAILABLE}")
    print(f"Anthropic available: {ANTHROPIC_AVAILABLE}")
    return (
        OPENAI_AVAILABLE,
        calc_accuracy,
        calc_f1_score,
        calc_precision,
        calc_recall,
        calculate_confusion_matrix,
        cohen_kappa,
        db_utils,
        detect_issues,
        extract_assistant_response,
        extract_tool_calls,
        extract_user_message,
        has_errors,
        json,
        np,
        pd,
        pearson_correlation,
        plt,
        trace_to_dict_for_eval,
    )


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 2. Database Connection & Exploration
    """)
    return


@app.cell
def _(db_utils):
    # List all tables in the database
    tables = db_utils.list_tables()
    print("Database Tables:")
    for table in tables:
        print(f"  - {table}")
    return


@app.cell
def _(db_utils):
    # Get trace statistics
    trace_stats = db_utils.get_trace_statistics()
    print("\nTrace Statistics:")
    for key, value in trace_stats.items():
        print(f"  {key}: {value}")
    return


@app.cell
def _(db_utils, mo):
    # View traces table schema
    _schema_df = db_utils.get_table_schema('traces')
    mo.md(f"### Traces Table Schema\n\n{_schema_df.to_markdown() if hasattr(_schema_df, 'to_markdown') else str(_schema_df)}")
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 3. Exploring Traces
    """)
    return


@app.cell
def _(db_utils, mo):
    # Fetch recent traces
    traces_df = db_utils.query("""
        SELECT
            t.id,
            t.trace_id,
            t.source,
            t.timestamp,
            t.step_count,
            t.has_errors,
            t.input_preview,
            t.output_preview,
            f.rating as feedback_rating,
            f.rating_detail
        FROM traces t
        LEFT JOIN feedback f ON f.trace_id = t.id
        ORDER BY t.imported_at DESC
        LIMIT 20
    """, as_df=True)

    mo.md(f"Found {len(traces_df)} traces")
    mo.ui.table(traces_df)
    return (traces_df,)


@app.cell
def _(db_utils, extract_tool_calls, has_errors, traces_df):
    # Examine a single trace in detail
    if len(traces_df) > 0:
        sample_trace_id = traces_df.iloc[0]['id']
        trace = db_utils.get_trace_by_id(sample_trace_id)

        if trace:
            print("Sample Trace Details:")
            db_utils.print_trace_summary(trace)

            print("\n--- Steps Structure ---")
            for i, step in enumerate(trace.steps[:3]):  # First 3 steps
                print(f"\nStep {i}:")
                print(f"  Messages: {len(step.get('messages_added', []))}")
                print(f"  Tool Calls: {len(step.get('tool_calls', []))}")
                if step.get('error'):
                    print(f"  Error: {step['error']}")
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 4. Working with Labeled Traces

    Labeled traces have human feedback (positive/negative rating) that we can use to train and test eval functions.
    """)
    return


@app.cell
def _(db_utils, pd):
    # Get labeled traces
    labeled_traces = db_utils.get_labeled_traces(limit=100)
    print(f"Found {len(labeled_traces)} labeled traces")

    if labeled_traces:
        labeled_df = pd.DataFrame(labeled_traces)
        print("\nRating distribution:")
        print(labeled_df['rating'].value_counts())

        print("\nHuman score distribution:")
        print(labeled_df['human_score'].describe())
    return (labeled_traces,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 5. Writing Custom Eval Functions

    Eval functions follow this signature:
    ```python
    def eval_function(task: dict, task_metadata: dict, trace: dict, ctx) -> tuple[float, str]:
        # Returns: (score between 0.0 and 1.0, feedback string)
        return (score, feedback)
    ```

    For notebook experimentation, we'll use a simplified version without the ctx parameter.
    """)
    return


@app.cell
def _():
    # Mock context for eval functions (simplified version)
    class MockEvalContext:
        """Mock context for testing eval functions in notebooks."""

        def __init__(self, openai_client=None, anthropic_client=None):
            self.openai = openai_client
            self.anthropic = anthropic_client
            self._cost = 0.0
            self._cache = {}

        def call_llm(self, prompt: str, model: str='gpt-4o-mini', temperature: float=0.0, max_tokens: int=500, cache_key: str=None) -> str:
            """Call LLM for semantic evaluation (optional)."""
            if cache_key and cache_key in self._cache:
                return self._cache[cache_key]
            if self.openai and 'gpt' in model.lower():  # Check cache first
                response = self.openai.chat.completions.create(model=model, messages=[{'role': 'user', 'content': prompt}], temperature=temperature, max_tokens=max_tokens)
                _result = response.choices[0].message.content
            elif self.anthropic and 'claude' in model.lower():
                response = self.anthropic.messages.create(model=model, max_tokens=max_tokens, messages=[{'role': 'user', 'content': prompt}])
                _result = response.content[0].text
            else:
                raise ValueError(f'No client available for model: {model}')
            if cache_key:
                self._cache[cache_key] = _result
            return _result

        def get_cost_so_far(self) -> float:
            return self._cost

        def get_remaining_budget(self) -> float:
            return 0.05 - self._cost
    ctx = MockEvalContext()
    # Initialize context (optional - add your API keys if needed)
    print('Mock context created. Add API clients if you need LLM-based evals.')  # Cache result
    return (ctx,)


@app.cell
def _(extract_assistant_response):
    # Example Eval Function 1: Simple heuristic-based eval
    def eval_response_length(task: dict, task_metadata: dict, trace: dict, ctx) -> tuple[float, str]:
        """
        Simple eval: Score based on response length.
        Longer responses get higher scores (up to a point).
        """
        # Use iofold_eval_core extraction function
        response = extract_assistant_response(trace)

        if not response:
            return (0.0, "No assistant response found")

        length = len(response)

        # Score based on length brackets
        if length < 50:
            score = 0.2
            feedback = "Response too short"
        elif length < 200:
            score = 0.5
            feedback = "Response is brief"
        elif length < 500:
            score = 0.8
            feedback = "Response is well-developed"
        else:
            score = 1.0
            feedback = "Response is comprehensive"

        return (score, f"{feedback} ({length} chars)")

    print("Eval function 'eval_response_length' defined.")
    return (eval_response_length,)


@app.cell
def _(has_errors, json):
    # Example Eval Function 2: Error detection
    def eval_no_errors(task: dict, task_metadata: dict, trace: dict, ctx) -> tuple[float, str]:
        """
        Eval: Penalize traces with errors.
        Uses iofold_eval_core has_errors for initial check.
        """
        # Quick check using iofold_eval_core
        if not has_errors(trace):
            return (1.0, "No errors detected")

        # If errors exist, count them for detailed feedback
        steps = trace.get('steps', [])
        if isinstance(steps, str):
            steps = json.loads(steps)

        error_count = 0
        error_messages = []

        for step in steps:
            if step.get('error'):
                error_count += 1
                error_messages.append(step['error'][:50])

            for tc in step.get('tool_calls', []):
                if tc.get('error'):
                    error_count += 1
                    error_messages.append(tc['error'][:50])

        if error_count <= 2:
            return (0.5, f"Minor errors: {'; '.join(error_messages[:2])}")
        else:
            return (0.0, f"Multiple errors ({error_count}): {'; '.join(error_messages[:3])}")

    print("Eval function 'eval_no_errors' defined.")
    return (eval_no_errors,)


@app.cell
def _(extract_tool_calls):
    # Example Eval Function 3: Tool usage efficiency
    def eval_tool_efficiency(task: dict, task_metadata: dict, trace: dict, ctx) -> tuple[float, str]:
        """
        Eval: Score based on reasonable tool usage.
        Penalize too few or too many tool calls.
        Uses iofold_eval_core extraction function.
        """
        # Use iofold_eval_core extraction function
        tool_calls = extract_tool_calls(trace)
        num_tools = len(tool_calls)

        if num_tools == 0:
            # No tools - might be okay for simple tasks
            return (0.6, "No tool calls - may be appropriate for simple queries")
        elif num_tools <= 3:
            return (1.0, f"Efficient tool usage ({num_tools} calls)")
        elif num_tools <= 7:
            return (0.7, f"Moderate tool usage ({num_tools} calls)")
        else:
            return (0.4, f"Excessive tool usage ({num_tools} calls) - may indicate inefficiency")

    print("Eval function 'eval_tool_efficiency' defined.")
    return (eval_tool_efficiency,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 6. Testing Eval Functions Against Labeled Data
    """)
    return


@app.cell
def _(
    calc_accuracy,
    calc_f1_score,
    calculate_confusion_matrix,
    cohen_kappa,
    ctx,
    extract_user_message,
    pearson_correlation,
    trace_to_dict_for_eval,
):
    def test_eval_function(eval_fn, labeled_traces: list[dict]) -> dict:
        """
        Test an eval function against labeled traces and compute metrics.

        Uses iofold_eval_core metrics for calculations.

        Returns dict with:
        - predictions: list of (trace_id, predicted_score, human_score)
        - pearson_r: Pearson correlation coefficient
        - accuracy: Binary accuracy at 0.5 threshold
        - cohen_kappa: Cohen's kappa statistic
        - f1: F1 score
        - confusion_matrix: dict with tp, tn, fp, fn
        """
        predictions = []
        pred_scores = []
        human_scores = []

        for trace_row in labeled_traces:
            # Prepare trace dict using iofold_eval_core utility
            trace_dict = trace_to_dict_for_eval(trace_row)

            # Prepare task dict using iofold_eval_core extraction
            task = {"user_message": extract_user_message(trace_dict) or ""}

            # Empty task_metadata for now
            task_metadata = {}

            try:
                score, feedback = eval_fn(task, task_metadata, trace_dict, ctx)
                predictions.append({
                    "trace_id": trace_row["id"],
                    "predicted_score": score,
                    "human_score": trace_row["human_score"],
                    "feedback": feedback,
                    "human_rating": trace_row["rating"]
                })
                pred_scores.append(score)
                human_scores.append(trace_row["human_score"])
            except Exception as e:
                print(f"Error evaluating trace {trace_row['id']}: {e}")
                predictions.append({
                    "trace_id": trace_row["id"],
                    "predicted_score": 0.5,
                    "human_score": trace_row["human_score"],
                    "feedback": f"Error: {e}",
                    "human_rating": trace_row["rating"]
                })
                pred_scores.append(0.5)
                human_scores.append(trace_row["human_score"])

        if not predictions:
            return {"error": "No predictions made"}

        # Calculate metrics using iofold_eval_core metrics module
        # Pearson correlation
        pearson_r = pearson_correlation(pred_scores, human_scores)

        # Confusion matrix and derived metrics
        cm = calculate_confusion_matrix(pred_scores, human_scores, threshold=0.5)
        acc = calc_accuracy(cm)
        f1 = calc_f1_score(cm)

        # Cohen's kappa
        total = len(labeled_traces)
        kappa = cohen_kappa(cm, total)

        return {
            "predictions": predictions,
            "pearson_r": pearson_r,
            "pearson_p": 0.0,  # Not computed by iofold_eval_core (use scipy if needed)
            "accuracy": acc,
            "cohen_kappa": kappa,
            "f1_score": f1,
            "confusion_matrix": {
                "tp": cm["true_positive"],
                "tn": cm["true_negative"],
                "fp": cm["false_positive"],
                "fn": cm["false_negative"]
            }
        }

    print("Test function defined.")
    return (test_eval_function,)


@app.cell
def _(
    eval_no_errors,
    eval_response_length,
    eval_tool_efficiency,
    labeled_traces,
    test_eval_function,
):
    # Test all eval functions (if we have labeled data)
    results = []  # Initialize results before conditional
    if labeled_traces:
        eval_functions = [('Response Length', eval_response_length), ('No Errors', eval_no_errors), ('Tool Efficiency', eval_tool_efficiency)]
        for name, eval_fn in eval_functions:
            print(f'\nTesting: {name}')
            _result = test_eval_function(eval_fn, labeled_traces)
            _result['name'] = name
            results.append(_result)
            print(f"  Pearson r: {_result['pearson_r']:.3f}")
            print(f"  Accuracy:  {_result['accuracy']:.3f}")
            print(f"  Cohen's k: {_result['cohen_kappa']:.3f}")
            print(f"  F1 Score:  {_result['f1_score']:.3f}")
            print(f"  Confusion: {_result['confusion_matrix']}")
    else:
        print('No labeled traces available. Add feedback to traces first.')
    return (results,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 7. Comparing Eval Strategies
    """)
    return


@app.cell
def _(mo, pd, plt, results):
    # Create comparison DataFrame
    _output = None
    if results:
        comparison_df = pd.DataFrame([
            {
                "Eval Function": r["name"],
                "Pearson r": r["pearson_r"],
                "Accuracy": r["accuracy"],
                "Cohen's Kappa": r["cohen_kappa"],
                "F1 Score": r["f1_score"],
                "TP": r["confusion_matrix"]["tp"],
                "TN": r["confusion_matrix"]["tn"],
                "FP": r["confusion_matrix"]["fp"],
                "FN": r["confusion_matrix"]["fn"],
            }
            for r in results
        ])

        # Plot comparison
        fig, axes = plt.subplots(1, 3, figsize=(15, 4))

        metrics = ["Accuracy", "Cohen's Kappa", "F1 Score"]
        colors = ['steelblue', 'coral', 'forestgreen']

        for ax, metric, color in zip(axes, metrics, colors):
            comparison_df.plot(kind='bar', x='Eval Function', y=metric, ax=ax,
                              color=color, legend=False)
            ax.set_title(metric)
            ax.set_ylabel(metric)
            ax.set_ylim(0, 1)
            ax.axhline(y=0.5, color='gray', linestyle='--', alpha=0.5)
            ax.set_xticklabels(ax.get_xticklabels(), rotation=45, ha='right')

        plt.tight_layout()
        _output = mo.vstack([mo.ui.table(comparison_df), fig])
    else:
        _output = mo.md("No results to compare. Run the eval tests first.")
    _output
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 8. Write Your Own Eval Function

    Use this template to experiment with your own eval strategies:
    """)
    return


@app.cell
def _(extract_assistant_response, extract_tool_calls, labeled_traces, test_eval_function):
    # Template for custom eval function
    def my_custom_eval(task: dict, task_metadata: dict, trace: dict, ctx) -> tuple[float, str]:
        """
        Your custom eval function.

        Args:
            task: {"user_message": "the user's request"}
            task_metadata: Additional context (expected_output, success_criteria, etc.)
            trace: The agent's execution trace with steps, tool_calls, etc.
            ctx: EvalContext with LLM access (ctx.call_llm()) and utilities

        Returns:
            (score, feedback) where score is 0.0-1.0 and feedback explains the score
        """
        # Extract useful data using iofold_eval_core functions
        user_message = task.get('user_message', '')
        assistant_response = extract_assistant_response(trace)
        tool_calls = extract_tool_calls(trace)

        # Your evaluation logic here
        # TODO: Implement your custom logic
        # For example:
        # - Check response relevance to user message
        # - Verify tool usage is appropriate
        # - Check for specific patterns or content
        # - Use ctx.call_llm() for semantic evaluation

        score = 0.5
        feedback = 'Default evaluation'
        return (score, feedback)

    # Test your custom eval
    if labeled_traces:
        print('Testing custom eval...')
        _result = test_eval_function(my_custom_eval, labeled_traces[:10])  # Test on first 10
        print(f"Accuracy: {_result['accuracy']:.3f}")
        print(f"Cohen's Kappa: {_result['cohen_kappa']:.3f}")
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 9. LLM-as-Judge Eval (Advanced)

    If you have API keys set up, you can use LLMs for semantic evaluation.
    """)
    return


@app.cell
def _(OPENAI_AVAILABLE, extract_assistant_response, json, labeled_traces):
    # LLM-as-Judge eval function (requires API keys)
    def eval_llm_judge(task: dict, task_metadata: dict, trace: dict, ctx) -> tuple[float, str]:
        """
        Use an LLM to evaluate the trace quality.
        Uses iofold_eval_core extraction for response extraction.
        """
        user_message = task.get('user_message', '')
        # Use iofold_eval_core extraction function
        assistant_response = extract_assistant_response(trace)

        if not assistant_response:
            return (0.0, 'No response to evaluate')

        prompt = f"""Evaluate this AI assistant response on a scale of 0-10.

User Request: {user_message[:500]}

Assistant Response: {assistant_response[:1000]}

Rate the response based on:
1. Relevance: Does it address the user's request?
2. Completeness: Is it thorough?
3. Accuracy: Is the information correct?
4. Clarity: Is it well-written?

Respond with ONLY a JSON object:
{{"score": <0-10>, "reasoning": "<brief explanation>"}}"""

        try:
            response = ctx.call_llm(prompt, model='gpt-4o-mini', temperature=0)
            _result = json.loads(response)
            score = _result.get('score', 5) / 10.0  # Normalize to 0-1
            reasoning = _result.get('reasoning', 'No reasoning provided')
            return (score, reasoning)
        except Exception as e:
            return (0.5, f'LLM evaluation failed: {e}')

    # Test LLM judge (only if API is available)
    if OPENAI_AVAILABLE and labeled_traces:
        print('LLM-as-Judge eval defined. Set ctx.openai to test.')
        # Initialize OpenAI client (add your API key)
        # ctx.openai = OpenAI(api_key="your-api-key")
    else:
        print('OpenAI not available or no labeled traces. Skipping LLM eval test.')
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 10. Export Results

    Save your best eval function for use in the main system.
    """)
    return


@app.cell
def _():
    # Export an eval function to a Python file
    def export_eval_function(eval_fn, filepath: str):
        """Export an eval function to a standalone Python file."""
        import inspect
        source = inspect.getsource(eval_fn)

        template = '''"""Auto-generated eval function from notebook experimentation."""
import json
from typing import Any, Optional

# iofold-eval-core imports for extraction utilities
from iofold_eval_core import (
    extract_user_message,
    extract_assistant_response,
    extract_tool_calls,
    has_errors,
    detect_issues,
)

{source}

# Main function that will be called by the eval runner
eval_function = {fn_name}
'''.format(source=source, fn_name=eval_fn.__name__)

        with open(filepath, 'w') as f:
            f.write(template)

        print(f"Exported to {filepath}")

    # Example: export_eval_function(eval_response_length, "my_eval.py")
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ---

    ## Next Steps

    1. **Add more labeled traces**: Label traces in the iofold UI to get more training data
    2. **Experiment with different strategies**: Try combining multiple signals
    3. **Test LLM-as-judge**: Set up API keys and try semantic evaluation
    4. **Export successful evals**: Use the export function to save good eval functions
    5. **Integrate with main system**: Use the exported eval in the iofold UI
    """)
    return


@app.cell
def _():
    import marimo as mo
    return (mo,)


if __name__ == "__main__":
    app.run()
