#!/usr/bin/env python3
"""
Architecture Comparison Experiment

Compares old vs new scoring architectures:

Old Architecture:
- create_fast_scorer(): Pure deterministic baseline (no expectedOutput)
- create_semantic_scorer(): LLM-dominant approach

New Architecture:
- create_deterministic_expected_output_scorer(): Deterministic with expectedOutput focus
- create_expected_output_scorer(): Full new architecture (if API available)

Metrics: Accuracy, Precision, Recall, F1, Cohen's Kappa
"""

import sys
import json
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Tuple, Optional

NOTEBOOKS_DIR = Path(__file__).parent.parent.parent
sys.path.insert(0, str(NOTEBOOKS_DIR))

# Load environment variables (optional)
try:
    from dotenv import load_dotenv
    PROJECT_ROOT = NOTEBOOKS_DIR.parent
    load_dotenv(PROJECT_ROOT / ".env")
except ImportError:
    pass  # dotenv not available, continue without it

from experiments.eval_reward_functions.experiment_base import (
    ExperimentRunner,
    LabeledTrace,
)
from experiments.eval_reward_functions.config import JOB_ID, CLASSIFICATION_THRESHOLD
from iofold_eval_core.scoring.presets import (
    create_fast_scorer,
    create_semantic_scorer,
    create_deterministic_expected_output_scorer,
    create_expected_output_scorer,
)
from iofold_eval_core.metrics import (
    calculate_confusion_matrix,
    accuracy,
    precision,
    recall,
    f1_score,
    cohen_kappa,
    ConfusionMatrix,
)


class ScorerMetrics:
    """Metrics for a single scorer."""
    def __init__(self, name: str):
        self.name = name
        self.accuracy = 0.0
        self.precision = 0.0
        self.recall = 0.0
        self.f1 = 0.0
        self.kappa = 0.0
        self.tp = 0
        self.tn = 0
        self.fp = 0
        self.fn = 0
        self.total = 0
        self.avg_latency_ms = 0.0
        self.errors = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "accuracy": self.accuracy,
            "precision": self.precision,
            "recall": self.recall,
            "f1": self.f1,
            "kappa": self.kappa,
            "confusion_matrix": {
                "true_positive": self.tp,
                "true_negative": self.tn,
                "false_positive": self.fp,
                "false_negative": self.fn,
            },
            "total_traces": self.total,
            "avg_latency_ms": self.avg_latency_ms,
            "errors": self.errors,
        }


class ArchitectureComparisonExperiment(ExperimentRunner):
    """Experiment comparing old vs new scoring architectures."""

    def __init__(
        self,
        model: str = "gemini-2.5-flash",
        skip_llm_scorers: bool = False,
    ):
        super().__init__(
            experiment_id="exp-architecture-comparison",
            experiment_name="Architecture Comparison: Old vs New Scorers",
            model=model,
            job_id=JOB_ID,
        )
        self.skip_llm_scorers = skip_llm_scorers

    def _create_eval_function(self):
        # Not used in this experiment - we create multiple scorers
        pass

    def run(self) -> Dict[str, Any]:
        start_time = datetime.now()
        self._log("=" * 80)
        self._log("Architecture Comparison Experiment")
        self._log("=" * 80)

        # Load data
        _, validation, _ = self._split_traces()
        self._log(f"\nValidation set size: {len(validation)}")

        if len(validation) == 0:
            self._log("ERROR: No validation traces found!")
            return self._create_empty_result(start_time)

        # Check if traces have feedback labels
        traces_with_labels = [t for t in validation if hasattr(t, 'rating') and t.rating]
        self._log(f"Traces with feedback labels: {len(traces_with_labels)}/{len(validation)}")

        if len(traces_with_labels) == 0:
            self._log("WARNING: No traces with feedback labels found! Cannot compute metrics.")
            return self._create_empty_result(start_time)

        # Use only traces with labels
        validation = traces_with_labels

        # Initialize scorers
        scorers = self._create_scorers()

        # Evaluate each scorer
        results = {}
        for scorer_name, scorer in scorers.items():
            self._log(f"\n{'=' * 80}")
            self._log(f"Evaluating: {scorer_name}")
            self._log(f"{'=' * 80}")

            metrics = self._evaluate_scorer(scorer_name, scorer, validation)
            results[scorer_name] = metrics

            self._log_metrics(scorer_name, metrics)

        # Print comparison table
        self._print_comparison_table(results)

        # Save results
        end_time = datetime.now()
        output = self._create_result_dict(start_time, end_time, results)
        self._save_results(output)

        return output

    def _create_scorers(self) -> Dict[str, Any]:
        """Create all scorers to evaluate."""
        scorers = {}

        # Old architecture: deterministic baseline
        self._log("\nInitializing OLD ARCHITECTURE scorers...")
        scorers["fast_scorer (old)"] = create_fast_scorer()
        self._log("  - fast_scorer: Pure deterministic baseline")

        # Old architecture: LLM-dominant (skip if requested)
        if not self.skip_llm_scorers:
            scorers["semantic_scorer (old)"] = create_semantic_scorer(self.model)
            self._log("  - semantic_scorer: LLM-dominant approach")
        else:
            self._log("  - semantic_scorer: SKIPPED (--skip-llm)")

        # New architecture: deterministic with expectedOutput
        self._log("\nInitializing NEW ARCHITECTURE scorers...")
        scorers["deterministic_expected_output (new)"] = create_deterministic_expected_output_scorer()
        self._log("  - deterministic_expected_output: Deterministic with expectedOutput focus")

        # New architecture: full (skip if requested)
        if not self.skip_llm_scorers:
            try:
                scorers["expected_output_scorer (new)"] = create_expected_output_scorer(self.model)
                self._log("  - expected_output_scorer: Full new architecture with LLM fallback")
            except Exception as e:
                self._log(f"  - expected_output_scorer: SKIPPED (error: {str(e)[:100]})")
        else:
            self._log("  - expected_output_scorer: SKIPPED (--skip-llm)")

        return scorers

    def _evaluate_scorer(
        self,
        scorer_name: str,
        scorer: Any,
        traces: List[LabeledTrace],
    ) -> ScorerMetrics:
        """Evaluate a single scorer on the validation set."""
        import time

        metrics = ScorerMetrics(scorer_name)
        predictions = []
        ground_truth = []
        latencies = []

        for i, trace in enumerate(traces):
            if i % 50 == 0:
                self._log(f"  Progress: {i}/{len(traces)}...")

            trace_dict = trace.to_dict()

            # Score the trace
            start = time.time()
            try:
                score, reasoning = scorer(trace_dict, None)
            except Exception as e:
                self._log(f"  ERROR on trace {trace.id}: {str(e)[:100]}")
                score = 0.5  # Neutral on error
                metrics.errors += 1

            latency_ms = (time.time() - start) * 1000
            latencies.append(latency_ms)

            # Store predictions and ground truth
            predictions.append(score)
            ground_truth.append(trace.human_score)

        # Calculate confusion matrix
        cm = calculate_confusion_matrix(predictions, ground_truth, CLASSIFICATION_THRESHOLD)

        # Compute metrics
        metrics.accuracy = accuracy(cm)
        metrics.precision = precision(cm)
        metrics.recall = recall(cm)
        metrics.f1 = f1_score(cm)
        metrics.kappa = cohen_kappa(cm, len(traces))
        metrics.tp = cm['true_positive']
        metrics.tn = cm['true_negative']
        metrics.fp = cm['false_positive']
        metrics.fn = cm['false_negative']
        metrics.total = len(traces)
        metrics.avg_latency_ms = sum(latencies) / len(latencies) if latencies else 0.0

        return metrics

    def _log_metrics(self, scorer_name: str, metrics: ScorerMetrics):
        """Log metrics for a scorer."""
        self._log(f"\nMetrics for {scorer_name}:")
        self._log(f"  Accuracy:  {metrics.accuracy:.4f} ({metrics.accuracy:.1%})")
        self._log(f"  Precision: {metrics.precision:.4f}")
        self._log(f"  Recall:    {metrics.recall:.4f}")
        self._log(f"  F1 Score:  {metrics.f1:.4f}")
        self._log(f"  Cohen's Kappa: {metrics.kappa:.4f}")
        self._log(f"\n  Confusion Matrix:")
        self._log(f"    TP: {metrics.tp}  FN: {metrics.fn}")
        self._log(f"    FP: {metrics.fp}  TN: {metrics.tn}")
        self._log(f"\n  Avg Latency: {metrics.avg_latency_ms:.1f}ms")
        self._log(f"  Errors: {metrics.errors}")

    def _print_comparison_table(self, results: Dict[str, ScorerMetrics]):
        """Print comparison table of all scorers."""
        self._log("\n" + "=" * 80)
        self._log("COMPARISON TABLE")
        self._log("=" * 80)

        # Header
        header = f"{'Scorer':<40} {'Accuracy':>10} {'Prec':>8} {'Rec':>8} {'F1':>8} {'Kappa':>8}"
        self._log(header)
        self._log("-" * 80)

        # Sort by accuracy (descending)
        sorted_results = sorted(
            results.items(),
            key=lambda x: x[1].accuracy,
            reverse=True
        )

        # Print rows
        for scorer_name, metrics in sorted_results:
            row = (
                f"{scorer_name:<40} "
                f"{metrics.accuracy:>10.4f} "
                f"{metrics.precision:>8.4f} "
                f"{metrics.recall:>8.4f} "
                f"{metrics.f1:>8.4f} "
                f"{metrics.kappa:>8.4f}"
            )
            self._log(row)

        self._log("=" * 80)

        # Analysis
        self._log("\nKEY FINDINGS:")
        if len(sorted_results) >= 2:
            best = sorted_results[0]
            second = sorted_results[1]
            improvement = best[1].accuracy - second[1].accuracy

            self._log(f"  Best scorer: {best[0]}")
            self._log(f"    Accuracy: {best[1].accuracy:.4f} ({best[1].accuracy:.1%})")
            self._log(f"  Improvement over second-best: {improvement:+.4f} ({improvement:+.1%})")

            # Check if new architecture is better
            new_scorers = [name for name in results.keys() if "(new)" in name]
            old_scorers = [name for name in results.keys() if "(old)" in name]

            if new_scorers and old_scorers:
                best_new = max([(name, results[name].accuracy) for name in new_scorers], key=lambda x: x[1])
                best_old = max([(name, results[name].accuracy) for name in old_scorers], key=lambda x: x[1])

                self._log(f"\n  Best OLD architecture: {best_old[0]} ({best_old[1]:.4f})")
                self._log(f"  Best NEW architecture: {best_new[0]} ({best_new[1]:.4f})")

                improvement = best_new[1] - best_old[1]
                if improvement > 0:
                    self._log(f"  NEW architecture is BETTER by {improvement:+.4f} ({improvement:+.1%})")
                else:
                    self._log(f"  OLD architecture is BETTER by {abs(improvement):+.4f} ({abs(improvement):+.1%})")

    def _create_result_dict(
        self,
        start_time: datetime,
        end_time: datetime,
        results: Dict[str, ScorerMetrics],
    ) -> Dict[str, Any]:
        """Create result dictionary for saving."""
        return {
            "experiment_id": self.experiment_id,
            "experiment_name": self.experiment_name,
            "model": self.model,
            "started_at": start_time.isoformat(),
            "completed_at": end_time.isoformat(),
            "duration_seconds": (end_time - start_time).total_seconds(),
            "config": {
                "job_id": self.job_id,
                "classification_threshold": CLASSIFICATION_THRESHOLD,
                "skip_llm_scorers": self.skip_llm_scorers,
            },
            "scorers": {
                name: metrics.to_dict()
                for name, metrics in results.items()
            },
        }

    def _create_empty_result(self, start_time: datetime) -> Dict[str, Any]:
        """Create empty result when no data available."""
        end_time = datetime.now()
        return {
            "experiment_id": self.experiment_id,
            "experiment_name": self.experiment_name,
            "model": self.model,
            "started_at": start_time.isoformat(),
            "completed_at": end_time.isoformat(),
            "duration_seconds": (end_time - start_time).total_seconds(),
            "error": "No validation traces with feedback labels found",
            "scorers": {},
        }

    def _save_results(self, result: Dict[str, Any]):
        """Save results to JSON file."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"exp_architecture_comparison_{timestamp}.json"
        filepath = self._results_dir / filename

        with open(filepath, "w") as f:
            json.dump(result, f, indent=2, default=str)

        self._log(f"\nResults saved to: {filepath}")


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Compare old vs new scoring architectures"
    )
    parser.add_argument(
        "--model",
        default="gemini-2.5-flash",
        help="Model to use for LLM-based scorers (default: gemini-2.5-flash)"
    )
    parser.add_argument(
        "--skip-llm",
        action="store_true",
        help="Skip LLM-based scorers (only run deterministic scorers for fast iteration)"
    )
    args = parser.parse_args()

    exp = ArchitectureComparisonExperiment(
        model=args.model,
        skip_llm_scorers=args.skip_llm,
    )
    exp.run()


if __name__ == "__main__":
    main()
