# iofold Notebooks - Eval Experimentation

This directory contains Jupyter notebooks for experimenting with eval strategies on trace data from the iofold database.

## Quick Start

```bash
# 1. Create a virtual environment (recommended)
python3 -m venv .venv
source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Make sure the backend is running (in project root)
# pnpm run dev

# 4. Start Jupyter Lab
jupyter lab
```

## Directory Structure

```
notebooks/
├── README.md              # This file
├── requirements.txt       # Python dependencies
├── db_utils.py           # Database utilities and helpers
├── 01_eval_experimentation.ipynb  # Main experimentation notebook
└── .venv/                # Virtual environment (gitignored)
```

## Notebooks

### 01_eval_experimentation.ipynb

Main notebook for eval experimentation:
- **Database exploration**: View tables, schemas, trace statistics
- **Trace analysis**: Explore trace structure, extract data
- **Eval function testing**: Write and test custom eval functions
- **Metrics comparison**: Compare eval strategies with statistical metrics

## Database Connection

The notebooks connect directly to the local D1 SQLite database stored in `.wrangler/state/v3/d1/`. This gives you read access to:

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

## Tips

1. **Start with heuristics**: Simple rules (response length, error count) can be surprisingly effective
2. **Combine signals**: Ensemble approaches often outperform single metrics
3. **Use labeled data**: The more human feedback you have, the better you can test
4. **LLM-as-judge**: For semantic evaluation, use the mock context with API keys

## Troubleshooting

**"D1 database directory not found"**
- Run `pnpm run dev` in the project root first to initialize the local database

**"No labeled traces available"**
- Add feedback to traces using the iofold UI before testing evals

**"Module not found: db_utils"**
- Make sure you're running Jupyter from the notebooks directory
