"""
gepa_runner.py - Entry point for GEPA optimization in iofold sandbox.

This script runs GEPA prompt optimization using the iofold platform.
It reads configuration from stdin and writes results to stdout.

Input (stdin JSON):
{
    "api_base_url": "http://localhost:8787",
    "session_token": "...",
    "agent_id": "...",
    "seed_prompt": "You are a helpful assistant...",
    "eval_code": "def eval_function(task, task_metadata, trace, ctx): ...",
    "trainset": [{"task": {...}, "task_metadata": {...}}, ...],
    "valset": [{"task": {...}, "task_metadata": {...}}, ...],
    "ai_gateway_url": "https://gateway.ai.cloudflare.com/...",
    "ai_gateway_token": "...",
    "max_metric_calls": 50,
    "parallelism": 5,
}

Output (stdout JSON):
{
    "success": true,
    "result": {
        "best_prompt": "...",
        "best_score": 0.85,
        "total_candidates": 12,
        "total_metric_calls": 48,
        "all_candidates": [...]
    }
}
OR
{
    "success": false,
    "error": "Error message"
}

Progress reporting (stderr, NDJSON):
{"progress": {"type": "start", "message": "Starting GEPA optimization..."}}
{"progress": {"type": "candidate", "candidate_num": 1, "prompt": "..."}}
{"progress": {"type": "evaluation", "candidate_num": 1, "train_score": 0.8, "val_score": 0.75}}
{"progress": {"type": "complete", "best_score": 0.85, "total_candidates": 12}}
"""

import json
import sys
import traceback
from typing import Dict, Any, List

# Try to import GEPA - if not available, create stub for development
try:
    from gepa import optimize
    GEPA_AVAILABLE = True
except ImportError:
    GEPA_AVAILABLE = False
    # Stub for development/testing
    class OptimizationResult:
        def __init__(self):
            self.best_candidate = {"system_prompt": ""}
            self.best_validation_score = 0.0
            self.all_candidates = []
            self.all_scores = []
            self.total_metric_calls = 0

    def optimize(*args, **kwargs):
        """Stub implementation when GEPA is not installed."""
        raise ImportError(
            "GEPA library not installed. "
            "Install with: pip install gepa"
        )

# Import OpenAI SDK for reflection LLM
try:
    from openai import OpenAI
except ImportError:
    raise ImportError(
        "OpenAI SDK not installed. "
        "Install with: pip install openai"
    )

# Import local adapter
try:
    from iofold_adapter import IofoldGEPAAdapter, DataInst
except ImportError:
    # Try relative import
    from .iofold_adapter import IofoldGEPAAdapter, DataInst


def log_progress(data: Dict[str, Any]) -> None:
    """
    Write progress update to stderr as NDJSON.

    Args:
        data: Progress data dictionary to serialize
    """
    print(json.dumps({"progress": data}), file=sys.stderr, flush=True)


def run_gepa_optimization(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run GEPA optimization with iofold adapter.

    Args:
        config: Configuration dictionary with required fields:
            - api_base_url: Base URL for iofold API
            - session_token: Authentication token
            - agent_id: Agent ID to optimize
            - eval_code: Python code defining eval_function
            - seed_prompt: Initial system prompt
            - trainset: List of training examples
            - valset: List of validation examples
            - ai_gateway_url: Cloudflare AI Gateway URL
            - ai_gateway_token: AI Gateway authentication token
            - max_metric_calls: Maximum number of metric evaluations
            - parallelism: Number of concurrent rollouts

    Returns:
        Dictionary containing:
            - best_prompt: Best system prompt found
            - best_score: Validation score of best prompt
            - total_candidates: Number of candidates evaluated
            - total_metric_calls: Total metric calls made
            - all_candidates: List of all candidates with scores

    Raises:
        ValueError: If required config fields are missing
        ImportError: If GEPA library is not installed
        Exception: If optimization fails
    """
    # Validate required fields
    required_fields = [
        "api_base_url",
        "session_token",
        "agent_id",
        "eval_code",
        "seed_prompt",
        "trainset",
        "valset",
        "ai_gateway_url",
        "ai_gateway_token",
    ]

    missing_fields = [f for f in required_fields if f not in config]
    if missing_fields:
        raise ValueError(f"Missing required config fields: {', '.join(missing_fields)}")

    log_progress({
        "type": "start",
        "message": "Initializing GEPA optimization",
        "max_metric_calls": config.get("max_metric_calls", 50),
        "parallelism": config.get("parallelism", 5),
        "train_set_size": len(config["trainset"]),
        "val_set_size": len(config["valset"]),
    })

    # Create adapter
    log_progress({
        "type": "init",
        "message": "Creating iofold adapter",
    })

    adapter = IofoldGEPAAdapter(
        api_base_url=config["api_base_url"],
        session_token=config["session_token"],
        agent_id=config["agent_id"],
        eval_code=config["eval_code"],
        parallelism=config.get("parallelism", 5),
    )

    # Create reflection LLM client pointing to AI Gateway
    log_progress({
        "type": "init",
        "message": "Configuring reflection LLM via AI Gateway",
    })

    reflection_lm = OpenAI(
        api_key=config["ai_gateway_token"],
        base_url=config["ai_gateway_url"],
    )

    # Convert trainset/valset to DataInst
    log_progress({
        "type": "init",
        "message": "Converting datasets to GEPA format",
    })

    trainset = [
        DataInst(
            task=item["task"],
            task_metadata=item.get("task_metadata", {})
        )
        for item in config["trainset"]
    ]

    valset = [
        DataInst(
            task=item["task"],
            task_metadata=item.get("task_metadata", {})
        )
        for item in config["valset"]
    ]

    # Check if GEPA is available
    if not GEPA_AVAILABLE:
        log_progress({
            "type": "error",
            "message": "GEPA library not installed",
        })
        raise ImportError(
            "GEPA library not installed. This is expected in development. "
            "The runner is ready to use once GEPA is installed."
        )

    # Run GEPA optimization
    log_progress({
        "type": "optimize_start",
        "message": "Starting GEPA optimization loop",
        "seed_prompt_length": len(config["seed_prompt"]),
    })

    try:
        result = optimize(
            seed_candidate={"system_prompt": config["seed_prompt"]},
            trainset=trainset,
            valset=valset,
            adapter=adapter,
            reflection_lm=reflection_lm,
            max_metric_calls=config.get("max_metric_calls", 50),
        )

        log_progress({
            "type": "optimize_complete",
            "message": "GEPA optimization completed",
            "best_score": result.best_validation_score,
            "total_candidates": len(result.all_candidates),
            "total_metric_calls": result.total_metric_calls,
        })

        # Build response
        return {
            "best_prompt": result.best_candidate.get("system_prompt", ""),
            "best_score": result.best_validation_score,
            "total_candidates": len(result.all_candidates),
            "total_metric_calls": result.total_metric_calls,
            "all_candidates": [
                {
                    "system_prompt": c.get("system_prompt", ""),
                    "score": s,
                }
                for c, s in zip(result.all_candidates, result.all_scores)
            ],
        }

    except Exception as e:
        log_progress({
            "type": "error",
            "message": f"GEPA optimization failed: {str(e)}",
            "error_type": type(e).__name__,
        })
        raise

    finally:
        # Clean up adapter
        try:
            adapter.close()
        except Exception as e:
            log_progress({
                "type": "warning",
                "message": f"Error closing adapter: {str(e)}",
            })


def main() -> None:
    """
    Main entry point for GEPA runner.

    Reads config from stdin, runs optimization, writes result to stdout.
    Progress updates are written to stderr as NDJSON.

    Exit codes:
        0: Success
        1: Error (details in JSON output)
    """
    try:
        # Read config from stdin
        log_progress({
            "type": "input",
            "message": "Reading configuration from stdin",
        })

        config_text = sys.stdin.read()
        if not config_text.strip():
            raise ValueError("No input received on stdin")

        config = json.loads(config_text)

        # Run optimization
        result = run_gepa_optimization(config)

        # Write success response to stdout
        output = {
            "success": True,
            "result": result,
        }
        print(json.dumps(output, indent=2))

        log_progress({
            "type": "complete",
            "message": "GEPA runner completed successfully",
        })

        sys.exit(0)

    except json.JSONDecodeError as e:
        error_msg = f"Invalid JSON input: {str(e)}"
        log_progress({
            "type": "error",
            "message": error_msg,
        })

        output = {
            "success": False,
            "error": error_msg,
            "error_type": "JSONDecodeError",
        }
        print(json.dumps(output, indent=2))
        sys.exit(1)

    except ValueError as e:
        error_msg = f"Configuration error: {str(e)}"
        log_progress({
            "type": "error",
            "message": error_msg,
        })

        output = {
            "success": False,
            "error": error_msg,
            "error_type": "ValueError",
        }
        print(json.dumps(output, indent=2))
        sys.exit(1)

    except ImportError as e:
        error_msg = str(e)
        log_progress({
            "type": "error",
            "message": error_msg,
        })

        output = {
            "success": False,
            "error": error_msg,
            "error_type": "ImportError",
        }
        print(json.dumps(output, indent=2))
        sys.exit(1)

    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        error_trace = traceback.format_exc()

        log_progress({
            "type": "error",
            "message": error_msg,
            "traceback": error_trace,
        })

        output = {
            "success": False,
            "error": error_msg,
            "error_type": type(e).__name__,
            "traceback": error_trace,
        }
        print(json.dumps(output, indent=2))
        sys.exit(1)


if __name__ == "__main__":
    main()
