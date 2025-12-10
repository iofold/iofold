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


def report_progress(data: Dict[str, Any]) -> None:
    """
    Write progress update to stderr as NDJSON.

    Args:
        data: Progress data dictionary to serialize
    """
    print(json.dumps({"progress": data}), file=sys.stderr, flush=True)


def run_gepa_optimization(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main entry point for GEPA optimization.

    Args:
        config: Dict with keys: api_base_url, session_token, agent_id, eval_code,
                seed_prompt, trainset, valset, ai_gateway_url, ai_gateway_token,
                max_metric_calls, parallelism

    Returns:
        Dict with keys: success, result (or error)
        On success: {"success": True, "result": {"best_prompt": "...", "best_score": 0.85, ...}}
        On error: {"success": False, "error": "message", "error_type": "ValueError"}
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
        error_msg = f"Missing required config fields: {', '.join(missing_fields)}"
        report_progress({
            "type": "error",
            "message": error_msg,
        })
        return {
            "success": False,
            "error": error_msg,
            "error_type": "ValueError",
        }

    report_progress({
        "type": "start",
        "message": "Initializing GEPA optimization",
        "max_metric_calls": config.get("max_metric_calls", 50),
        "parallelism": config.get("parallelism", 5),
        "train_set_size": len(config["trainset"]),
        "val_set_size": len(config["valset"]),
    })

    # Create adapter
    report_progress({
        "type": "init",
        "message": "Creating iofold adapter",
    })

    try:
        adapter = IofoldGEPAAdapter(
            api_base_url=config["api_base_url"],
            session_token=config["session_token"],
            agent_id=config["agent_id"],
            eval_code=config["eval_code"],
            parallelism=config.get("parallelism", 5),
        )
    except ValueError as e:
        error_msg = f"Adapter initialization failed: {str(e)}"
        report_progress({
            "type": "error",
            "message": error_msg,
        })
        return {
            "success": False,
            "error": error_msg,
            "error_type": "ValueError",
        }
    except Exception as e:
        error_msg = f"Unexpected error during adapter initialization: {str(e)}"
        report_progress({
            "type": "error",
            "message": error_msg,
        })
        return {
            "success": False,
            "error": error_msg,
            "error_type": type(e).__name__,
        }

    # Create reflection LLM client pointing to AI Gateway
    report_progress({
        "type": "init",
        "message": "Configuring reflection LLM via AI Gateway",
    })

    try:
        reflection_lm = OpenAI(
            api_key=config["ai_gateway_token"],
            base_url=config["ai_gateway_url"],
        )
    except Exception as e:
        error_msg = f"Failed to initialize OpenAI client: {str(e)}"
        report_progress({
            "type": "error",
            "message": error_msg,
        })
        try:
            adapter.close()
        except Exception:
            pass
        return {
            "success": False,
            "error": error_msg,
            "error_type": type(e).__name__,
        }

    # Convert trainset/valset to DataInst
    report_progress({
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
        error_msg = "GEPA library not installed. This is expected in development. The runner is ready to use once GEPA is installed."
        report_progress({
            "type": "error",
            "message": error_msg,
        })
        try:
            adapter.close()
        except Exception:
            pass
        return {
            "success": False,
            "error": error_msg,
            "error_type": "ImportError",
        }

    # Run GEPA optimization
    report_progress({
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

        report_progress({
            "type": "optimize_complete",
            "message": "GEPA optimization completed",
            "best_score": result.best_validation_score,
            "total_candidates": len(result.all_candidates),
            "total_metric_calls": result.total_metric_calls,
        })

        # Build response
        return {
            "success": True,
            "result": {
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
            },
        }

    except Exception as e:
        error_msg = f"GEPA optimization failed: {str(e)}"
        error_trace = traceback.format_exc()
        report_progress({
            "type": "error",
            "message": error_msg,
            "error_type": type(e).__name__,
            "traceback": error_trace,
        })
        return {
            "success": False,
            "error": error_msg,
            "error_type": type(e).__name__,
            "traceback": error_trace,
        }

    finally:
        # Clean up adapter
        try:
            adapter.close()
        except Exception as e:
            report_progress({
                "type": "warning",
                "message": f"Error closing adapter: {str(e)}",
            })


def main() -> None:
    """
    Main entry point for CLI usage.

    Reads config from stdin, runs optimization, writes result to stdout.
    Progress updates are written to stderr as NDJSON.

    This function is kept for CLI testing but run_gepa_optimization()
    is the primary interface for programmatic use.
    """
    try:
        # Read config from stdin
        report_progress({
            "type": "input",
            "message": "Reading configuration from stdin",
        })

        config_text = sys.stdin.read()
        if not config_text.strip():
            output = {
                "success": False,
                "error": "No input received on stdin",
                "error_type": "ValueError",
            }
            print(json.dumps(output, indent=2))
            return

        config = json.loads(config_text)

    except json.JSONDecodeError as e:
        error_msg = f"Invalid JSON input: {str(e)}"
        report_progress({
            "type": "error",
            "message": error_msg,
        })

        output = {
            "success": False,
            "error": error_msg,
            "error_type": "JSONDecodeError",
        }
        print(json.dumps(output, indent=2))
        return

    except Exception as e:
        error_msg = f"Error reading input: {str(e)}"
        report_progress({
            "type": "error",
            "message": error_msg,
        })

        output = {
            "success": False,
            "error": error_msg,
            "error_type": type(e).__name__,
        }
        print(json.dumps(output, indent=2))
        return

    # Run optimization - returns a dict with success/error
    result = run_gepa_optimization(config)

    # Write result to stdout
    print(json.dumps(result, indent=2))

    if result.get("success"):
        report_progress({
            "type": "complete",
            "message": "GEPA runner completed successfully",
        })


if __name__ == "__main__":
    main()
