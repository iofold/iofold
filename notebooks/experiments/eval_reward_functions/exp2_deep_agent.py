#!/usr/bin/env python3
"""
Experiment 2: Deep Eval Agent with Iterative Refinement

Hypothesis: An iterative agent with exploration tools and error feedback
will produce more robust evals than single-shot generation.

Approach:
1. Analyze training data patterns (positive vs negative)
2. Generate multiple candidate eval functions
3. Test on validation set
4. Refine based on misclassified examples
5. Iterate until target accuracy or max iterations

Success Criteria: >80% accuracy, >0.6 Cohen's kappa
"""

import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Add notebooks dir to path for local imports
NOTEBOOKS_DIR = Path(__file__).parent.parent.parent
sys.path.insert(0, str(NOTEBOOKS_DIR))

# Load environment variables from project root .env
from dotenv import load_dotenv
PROJECT_ROOT = NOTEBOOKS_DIR.parent
load_dotenv(PROJECT_ROOT / ".env")

from openai import OpenAI

# Use experiment infrastructure
from experiments.eval_reward_functions.experiment_base import (
    ExperimentRunner,
    ExperimentResult,
    EvalResult,
    MetricsResult,
    LabeledTrace,
    load_traces_for_job,
)
from experiments.eval_reward_functions.config import (
    JOB_ID,
    MODELS,
    get_split,
    CLASSIFICATION_THRESHOLD,
)

# Import DeepAgent from iofold_eval_core
from iofold_eval_core.generation.deep_agent import DeepAgent
from iofold_eval_core.models import LabeledTrace as CoreLabeledTrace
from iofold_eval_core.sandbox import execute_reward_function

# Enable logging
import logging
logging.basicConfig(level=logging.DEBUG, format='[%(name)s] %(message)s')


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass
class DeepAgentConfig:
    """Configuration for deep agent experiment."""
    # Model settings
    model_key: str = "gpt-5.1"
    temperature: float = 0.3
    max_tokens: int = 8192

    # Iteration settings
    max_iterations: int = 5
    candidates_per_iteration: int = 3
    target_accuracy: float = 0.80
    target_kappa: float = 0.60

    # Sample settings - use MORE examples for better patterns
    max_train_examples: int = 200  # Use up to 200 examples for analysis
    max_positive_examples: int = 50
    max_negative_examples: int = 50


# ---------------------------------------------------------------------------
# LLM Client Adapter
# ---------------------------------------------------------------------------

class CloudflareLLMClient:
    """LLM client using Cloudflare AI Gateway."""

    def __init__(self, model_key: str = "gpt-5.1", max_tokens: int = 8192):
        self.model_key = model_key
        self.max_tokens = max_tokens

        # Get model config
        model_config = MODELS.get(model_key)
        if not model_config:
            raise ValueError(f"Unknown model: {model_key}")

        self.model_id = model_config.gateway_model_id
        self.provider = model_config.provider

        # Initialize OpenAI client with Cloudflare gateway
        account_id = os.environ.get("CF_ACCOUNT_ID")
        gateway_id = os.environ.get("CF_AI_GATEWAY_ID")
        api_key = os.environ.get("CF_AI_GATEWAY_TOKEN")

        if not all([account_id, gateway_id, api_key]):
            raise ValueError("Missing Cloudflare AI Gateway credentials")

        self.client = OpenAI(
            api_key=api_key,
            base_url=f"https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/compat"
        )

    def generate(
        self,
        prompt: str,
        temperature: float = 0.3,
        max_tokens: int = None,
    ) -> str:
        """Generate text using the LLM."""
        max_tokens = max_tokens or self.max_tokens

        # Build request params
        params = {
            "model": self.model_id,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
        }

        # Use provider-specific token param
        if self.provider == "openai":
            params["max_completion_tokens"] = max_tokens
        else:
            params["max_tokens"] = max_tokens

        response = self.client.chat.completions.create(**params)
        return response.choices[0].message.content or ""


# ---------------------------------------------------------------------------
# Trace Conversion
# ---------------------------------------------------------------------------

def convert_to_core_trace(trace: LabeledTrace) -> CoreLabeledTrace:
    """Convert experiment LabeledTrace to iofold_eval_core LabeledTrace."""
    from iofold_eval_core.models import Trace

    # Create a Trace object
    core_trace = Trace(
        id=trace.id,
        trace_id=trace.trace_id,
        workspace_id="",
        integration_id="",
        source=trace.source,
        timestamp=trace.timestamp,
        imported_at=trace.timestamp,
        steps=trace.steps,
        raw_data=trace.raw_data,
        metadata=trace.metadata,
        input_preview=trace.input_preview,
        output_preview=trace.output_preview,
        step_count=trace.step_count,
        has_errors=trace.has_errors,
        agent_version_id=None,
        assignment_status="assigned",
    )

    return CoreLabeledTrace(
        trace=core_trace,
        human_score=trace.human_score,
        feedback_text=trace.rating_detail,
        feedback_id=trace.id,
    )


# ---------------------------------------------------------------------------
# Deep Agent Experiment
# ---------------------------------------------------------------------------

class DeepAgentExperiment(ExperimentRunner):
    """
    Experiment 2: Deep Eval Agent with Iterative Refinement.

    Uses the DeepAgent to iteratively generate and refine eval functions
    based on validation set feedback.
    """

    def __init__(
        self,
        config: DeepAgentConfig = None,
        job_id: str = JOB_ID,
    ):
        self.config = config or DeepAgentConfig()

        super().__init__(
            experiment_id="exp2-deep-agent",
            experiment_name="Deep Eval Agent with Iterative Refinement",
            model=self.config.model_key,
            job_id=job_id,
        )

        self.llm_client = None
        self.deep_agent = None
        self.best_candidate = None
        self.all_candidates = []

    def _create_eval_function(self):
        """Create eval function from best candidate."""
        if not self.best_candidate:
            raise ValueError("No best candidate available")

        code = self.best_candidate.code

        def eval_fn(trace: Dict[str, Any], ctx=None) -> Tuple[float, str]:
            try:
                score, reasoning = execute_reward_function(code, trace, ctx)
                return score, reasoning
            except Exception as e:
                return 0.5, f"Error: {e}"

        return eval_fn

    def run(self) -> ExperimentResult:
        """Run the deep agent experiment."""
        start_time = datetime.now()
        self._log("=" * 60)
        self._log(f"Experiment 2: {self.experiment_name}")
        self._log("=" * 60)
        self._log(f"Model: {self.config.model_key}")
        self._log(f"Max iterations: {self.config.max_iterations}")
        self._log(f"Candidates per iteration: {self.config.candidates_per_iteration}")
        self._log(f"Target accuracy: {self.config.target_accuracy:.0%}")
        self._log(f"Target kappa: {self.config.target_kappa:.2f}")
        self._log("")

        # Step 1: Load and split traces
        self._log("[1/5] Loading and splitting traces...")
        train_traces, val_traces, test_traces = self._split_traces()

        self._log(f"  Train: {len(train_traces)} traces")
        self._log(f"  Val: {len(val_traces)} traces")
        self._log(f"  Test: {len(test_traces)} traces (held out)")

        # Count by rating
        train_pos = sum(1 for t in train_traces if t.rating == "positive")
        train_neg = sum(1 for t in train_traces if t.rating == "negative")
        self._log(f"  Train ratings: {train_pos} positive, {train_neg} negative")

        # Step 2: Initialize LLM client and DeepAgent
        self._log("\n[2/5] Initializing DeepAgent...")
        self.llm_client = CloudflareLLMClient(
            model_key=self.config.model_key,
            max_tokens=self.config.max_tokens,
        )

        # Sample training data for agent (use more examples)
        sampled_train = self._sample_traces(
            train_traces,
            max_positive=self.config.max_positive_examples,
            max_negative=self.config.max_negative_examples,
        )
        self._log(f"  Using {len(sampled_train)} training examples for analysis")

        # Convert traces to core format
        core_train = [convert_to_core_trace(t) for t in sampled_train]
        core_val = [convert_to_core_trace(t) for t in val_traces]

        self.deep_agent = DeepAgent(
            llm_client=self.llm_client,
            embedding_client=None,  # Skip clustering for now
            train_traces=core_train,
            val_traces=core_val,
            n_clusters=5,
        )
        self._log("  DeepAgent initialized")

        # Step 3: Run iterations
        self._log("\n[3/5] Running iterative refinement...")

        try:
            self.best_candidate = self.deep_agent.run_iterations(
                max_iterations=self.config.max_iterations,
                candidates_per_iteration=self.config.candidates_per_iteration,
                target_accuracy=self.config.target_accuracy,
                target_kappa=self.config.target_kappa,
            )

            self.all_candidates = self.deep_agent.candidates

            self._log(f"\n  Generated {len(self.all_candidates)} total candidates")
            self._log(f"  Best candidate accuracy: {self.best_candidate.val_accuracy:.1%}")
            self._log(f"  Best candidate kappa: {self.best_candidate.val_kappa:.3f}")
            self._log(f"  Best candidate F1: {self.best_candidate.val_f1:.3f}")

        except Exception as e:
            self._log(f"  Error during iterations: {e}")
            import traceback
            traceback.print_exc()

            # Create a basic result on failure
            end_time = datetime.now()
            return ExperimentResult(
                experiment_id=self.experiment_id,
                experiment_name=self.experiment_name,
                model=self.config.model_key,
                started_at=start_time.isoformat(),
                completed_at=end_time.isoformat(),
                duration_seconds=(end_time - start_time).total_seconds(),
                eval_code="",
                config=self.config.__dict__,
                notes=f"Failed: {e}",
            )

        # Step 4: Evaluate on validation set
        self._log("\n[4/5] Final evaluation on validation set...")
        eval_fn = self._create_eval_function()
        val_results = self.evaluate_traces(eval_fn, val_traces)
        val_metrics = self.compute_metrics(val_results)

        self._print_metrics(val_metrics, "Validation")

        # Step 5: Evaluate on test set (final, held out)
        self._log("\n[5/5] Final evaluation on test set (held out)...")
        test_results = self.evaluate_traces(eval_fn, test_traces)
        test_metrics = self.compute_metrics(test_results)

        self._print_metrics(test_metrics, "Test (Held Out)")

        # Check success
        success = test_metrics.accuracy >= self.config.target_accuracy
        if success:
            self._log(f"\n✓ SUCCESS: Test accuracy {test_metrics.accuracy:.1%} >= {self.config.target_accuracy:.0%}")
        else:
            self._log(f"\n✗ BELOW TARGET: Test accuracy {test_metrics.accuracy:.1%} < {self.config.target_accuracy:.0%}")

        # Build result
        end_time = datetime.now()
        result = ExperimentResult(
            experiment_id=self.experiment_id,
            experiment_name=self.experiment_name,
            model=self.config.model_key,
            started_at=start_time.isoformat(),
            completed_at=end_time.isoformat(),
            duration_seconds=(end_time - start_time).total_seconds(),
            validation_metrics=val_metrics,
            test_metrics=test_metrics,
            validation_results=val_results,
            test_results=test_results,
            eval_code=self.best_candidate.code if self.best_candidate else "",
            config={
                **self.config.__dict__,
                "total_candidates": len(self.all_candidates),
                "iterations_run": self.deep_agent.iteration if self.deep_agent else 0,
            },
            notes=f"Success: {success}, Target: {self.config.target_accuracy:.0%} accuracy",
        )

        return result

    def _sample_traces(
        self,
        traces: List[LabeledTrace],
        max_positive: int = 50,
        max_negative: int = 50,
    ) -> List[LabeledTrace]:
        """Sample traces for analysis, prioritizing positive and negative."""
        import random
        random.seed(42)

        positive = [t for t in traces if t.rating == "positive"]
        negative = [t for t in traces if t.rating == "negative"]
        neutral = [t for t in traces if t.rating == "neutral"]

        # Sample from each category
        sampled = []
        sampled.extend(random.sample(positive, min(max_positive, len(positive))))
        sampled.extend(random.sample(negative, min(max_negative, len(negative))))

        # Add some neutral if space
        remaining = self.config.max_train_examples - len(sampled)
        if remaining > 0 and neutral:
            sampled.extend(random.sample(neutral, min(remaining, len(neutral))))

        random.shuffle(sampled)
        return sampled

    def _print_metrics(self, metrics: MetricsResult, name: str):
        """Print metrics summary."""
        self._log(f"\n{name} Set Metrics (n={metrics.total_traces}):")
        self._log(f"  Accuracy:     {metrics.accuracy:.3f}")
        self._log(f"  Precision:    {metrics.precision:.3f}")
        self._log(f"  Recall:       {metrics.recall:.3f}")
        self._log(f"  F1 Score:     {metrics.f1_score:.3f}")
        self._log(f"  Cohen's Kappa: {metrics.cohen_kappa:.3f}")

        # Confusion matrix
        self._log("\nConfusion Matrix:")
        self._log("                  Predicted")
        self._log("                  Neg   Pos")
        self._log(f"  Actual Neg    {metrics.true_negatives:5d} {metrics.false_positives:5d}")
        self._log(f"  Actual Pos    {metrics.false_negatives:5d} {metrics.true_positives:5d}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Experiment 2: Deep Eval Agent")
    parser.add_argument("--model", default="gpt-5.1", help="Model to use")
    parser.add_argument("--max-iterations", type=int, default=5, help="Max iterations")
    parser.add_argument("--candidates", type=int, default=3, help="Candidates per iteration")
    parser.add_argument("--target-accuracy", type=float, default=0.80, help="Target accuracy")
    parser.add_argument("--max-examples", type=int, default=100, help="Max training examples")
    parser.add_argument("--save", action="store_true", help="Save results to file")
    args = parser.parse_args()

    config = DeepAgentConfig(
        model_key=args.model,
        max_iterations=args.max_iterations,
        candidates_per_iteration=args.candidates,
        target_accuracy=args.target_accuracy,
        max_train_examples=args.max_examples,
        max_positive_examples=args.max_examples // 2,
        max_negative_examples=args.max_examples // 2,
    )

    experiment = DeepAgentExperiment(config=config)
    result = experiment.run()

    if args.save:
        result_path = experiment.save_result(result)
        print(f"\nResults saved to: {result_path}")

    return 0 if result.test_metrics and result.test_metrics.accuracy >= config.target_accuracy else 1


if __name__ == "__main__":
    sys.exit(main())
