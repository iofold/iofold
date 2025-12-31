# iofold Notebooks - Eval Experimentation

This directory contains Marimo notebooks for experimenting with eval strategies on trace data from the iofold database.

## Why Marimo?

- **Git-friendly**: Notebooks are pure Python files, making diffs and code review easy
- **Reproducible**: Reactive execution eliminates hidden state bugs common in Jupyter
- **Modern DX**: Built-in autocomplete, AI assistance, and modern editor features

## Quick Start

```bash
# 1. Create a virtual environment (recommended)
python3 -m venv .venv
source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Make sure the backend is running (in project root)
# pnpm run dev

# 4a. Start Marimo editor (interactive)
marimo edit 01_eval_experimentation.py

# 4b. Or run notebooks as scripts
marimo run 01_eval_experimentation.py
```

## CLI Usage

Marimo notebooks are regular Python files and can be run directly:

```bash
# Interactive editor mode
.venv/bin/marimo edit 01_eval_experimentation.py
.venv/bin/marimo edit 02_simulated_feedback.py
.venv/bin/marimo edit 03_deep_agent_eval.py

# Run as script (non-interactive)
.venv/bin/marimo run 01_eval_experimentation.py
.venv/bin/marimo run 02_simulated_feedback.py

# Run as web app (shareable)
.venv/bin/marimo run 02_simulated_feedback.py --host 0.0.0.0 --port 8080

# Export to HTML (static snapshot)
.venv/bin/marimo export html 01_eval_experimentation.py -o output.html

# Export back to Jupyter if needed
.venv/bin/marimo export ipynb 01_eval_experimentation.py -o output.ipynb
```

## Directory Structure

```
notebooks/
├── README.md                       # This file
├── requirements.txt                # Python dependencies
├── db_utils.py                     # Database utilities and helpers
├── feedback_simulator.py           # Simulated feedback generation
├── 01_eval_experimentation.py      # Eval testing notebook
├── 02_simulated_feedback.py        # Feedback generation notebook
├── 03_deep_agent_eval.py           # Deep Agent Eval Generation experiment
├── DAEG_EXPERIMENT_DESIGN.md       # DAEG experiment design document
├── outputs/                        # Executed notebook outputs (gitignored)
└── .venv/                          # Virtual environment (gitignored)
```

## Notebooks

### 01_eval_experimentation.py

Main notebook for eval experimentation:
- **Database exploration**: View tables, schemas, trace statistics
- **Trace analysis**: Explore trace structure, extract data
- **Eval function testing**: Write and test custom eval functions
- **Metrics comparison**: Compare eval strategies with statistical metrics

### 02_simulated_feedback.py

Generate simulated human feedback on agent traces:
- **LLM-as-judge**: Compare agent output with ground truth
- **Configurable distribution**: Control coverage, detail level, skew
- **Database integration**: Write feedback to D1 database

### 03_deep_agent_eval.py (DAEG Experiment)

Deep Agent Eval Generation experiment:
- **Clustering tools**: Group traces by first message, full trace, or tool pattern
- **Comparative evaluation**: Ruler-inspired pairwise comparison
- **Multi-candidate generation**: Generate 5+ reward functions, iterate until 80% accuracy
- **Train/val/test split**: Hidden holdout for unbiased evaluation

See `DAEG_EXPERIMENT_DESIGN.md` for full design details.

## Database Connection

The notebooks connect to a **SQLite snapshot** stored under `notebooks/data/` (copied out of the Docker dev backend's D1 volume). This gives you read access to:

- **traces**: Agent execution traces with steps, tool calls, messages
- **feedback**: Human ratings on traces (positive/negative/neutral)
- **eval_candidates**: Generated eval functions with test metrics
- **agents**: Agent configurations and active evals

## Writing Eval Functions

Eval functions follow this signature:

```python
def eval_function(task: dict, task_metadata: dict, trace: dict, ctx) -> tuple[float, str]:
    """
    Args:
        task: {"user_message": "the user's request"}
        task_metadata: Additional context (expected_output, success_criteria, etc.)
        trace: Agent execution trace with steps, tool_calls, messages
        ctx: EvalContext with LLM access and utilities

    Returns:
        (score, feedback) where:
            score: float between 0.0 and 1.0
            feedback: string explaining the score
    """
    # Your evaluation logic here
    return (score, feedback)
```

## Available Metrics

When testing eval functions, these metrics are computed:

| Metric | Description | Good Value |
|--------|-------------|------------|
| Pearson r | Correlation with human scores | > 0.5 |
| Accuracy | Binary classification accuracy | > 0.7 |
| Cohen's Kappa | Agreement accounting for chance | > 0.4 |
| F1 Score | Harmonic mean of precision/recall | > 0.7 |

## Marimo Tips

1. **Reactive execution**: When you change a cell, all dependent cells automatically re-run
2. **No variable redefinition**: Each variable can only be defined in one cell (use `_temp` for throwaway vars)
3. **UI widgets**: Use `mo.ui.slider()`, `mo.ui.dropdown()`, etc. for interactive controls
4. **Markdown**: Use `mo.md("# Title")` for formatted text output

## Troubleshooting

**"Missing D1 snapshot"**
- Refresh the notebook snapshot from Docker:
  - `./scripts/snapshot-d1-to-notebooks-data.sh`

**"No labeled traces available"**
- Add feedback to traces using the iofold UI before testing evals

**"Module not found: db_utils"**
- Make sure you're running Marimo from the notebooks directory

**"Variable defined in multiple cells"**
- Marimo enforces single-definition. Merge cells or rename variables.
