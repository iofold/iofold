#!/usr/bin/env python3
"""
Composite Reward Function Experiment

Evaluates the composite scoring approach with:
- Multiple deterministic evaluators
- LLM-as-judge
- Grounding checks
- Weighted combination

Metrics: MAE, Correlation, 3-class accuracy
"""

import sys
from pathlib import Path
from datetime import datetime
from typing import List
from dataclasses import asdict

NOTEBOOKS_DIR = Path(__file__).parent.parent.parent
sys.path.insert(0, str(NOTEBOOKS_DIR))

from dotenv import load_dotenv
PROJECT_ROOT = NOTEBOOKS_DIR.parent
load_dotenv(PROJECT_ROOT / ".env")

from experiments.eval_reward_functions.experiment_base import (
    ExperimentRunner,
    ExperimentResult,
    LabeledTrace,
)
from experiments.eval_reward_functions.config import JOB_ID
from iofold_eval_core.scoring.presets import (
    create_fast_scorer,
    create_balanced_scorer,
    create_full_scorer,
    create_semantic_scorer,
)
from iofold_eval_core.scoring.metrics import (
    compute_continuous_metrics,
    rating_to_target,
    ContinuousMetrics,
)


class CompositeExperiment(ExperimentRunner):
    """Experiment evaluating composite reward functions."""

    def __init__(self, scorer_type: str = "balanced", model: str = "gemini-2.5-flash"):
        super().__init__(
            experiment_id=f"exp-composite-{scorer_type}",
            experiment_name=f"Composite Scorer ({scorer_type})",
            model=model,
            job_id=JOB_ID,
        )
        self.scorer_type = scorer_type

        if scorer_type == "fast":
            self.scorer = create_fast_scorer()
        elif scorer_type == "balanced":
            self.scorer = create_balanced_scorer(model)
        elif scorer_type == "semantic":
            self.scorer = create_semantic_scorer(model)
        else:
            self.scorer = create_full_scorer(model)

    def _create_eval_function(self):
        return self.scorer

    def run(self) -> ExperimentResult:
        start_time = datetime.now()
        self._log("=" * 60)
        self._log(f"Composite Scorer Experiment: {self.scorer_type}")
        self._log("=" * 60)

        train, val, test = self._split_traces()
        self._log(f"Train: {len(train)}, Val: {len(val)}, Test: {len(test)}")

        # Evaluate on validation
        self._log("\nEvaluating on validation set...")
        val_preds, val_targets, val_ratings = self._evaluate_traces(val)
        val_metrics = compute_continuous_metrics(val_preds, val_targets, val_ratings)
        self._log_metrics("Validation", val_metrics)

        # Evaluate on test
        self._log("\nEvaluating on test set...")
        test_preds, test_targets, test_ratings = self._evaluate_traces(test)
        test_metrics = compute_continuous_metrics(test_preds, test_targets, test_ratings)
        self._log_metrics("Test", test_metrics)

        end_time = datetime.now()

        return ExperimentResult(
            experiment_id=self.experiment_id,
            experiment_name=self.experiment_name,
            model=self.model,
            started_at=start_time.isoformat(),
            completed_at=end_time.isoformat(),
            duration_seconds=(end_time - start_time).total_seconds(),
            validation_metrics=self._metrics_to_dict(val_metrics),
            test_metrics=self._metrics_to_dict(test_metrics),
            config={
                "scorer_type": self.scorer_type,
                "evaluators": [e.name for e, _ in self.scorer.evaluators],
            },
        )

    def _evaluate_traces(self, traces: List[LabeledTrace]):
        predictions = []
        targets = []
        ratings = []

        for i, trace in enumerate(traces):
            if i % 50 == 0:
                self._log(f"  Processing {i}/{len(traces)}...")

            trace_dict = trace.to_dict()
            try:
                score, _ = self.scorer(trace_dict, None)
            except Exception as e:
                self._log(f"  Error on trace {trace.id}: {str(e)[:50]}")
                score = 0.5

            predictions.append(score)
            targets.append(rating_to_target(trace.rating))
            ratings.append(trace.rating)

        return predictions, targets, ratings

    def _log_metrics(self, split: str, m: ContinuousMetrics):
        self._log(f"\n{split} Metrics:")
        self._log(f"  MAE: {m.mae:.4f}")
        self._log(f"  Correlation: {m.correlation:.4f}")
        self._log(f"  3-Class Accuracy: {m.accuracy_3class:.1%}")
        self._log(f"  Binary Accuracy: {m.accuracy_binary:.1%}")
        self._log(f"  Positive P/R: {m.precision_positive:.2f}/{m.recall_positive:.2f}")
        self._log(f"  Negative P/R: {m.precision_negative:.2f}/{m.recall_negative:.2f}")

    def _metrics_to_dict(self, m: ContinuousMetrics) -> dict:
        return {
            "mae": m.mae,
            "correlation": m.correlation,
            "accuracy_3class": m.accuracy_3class,
            "accuracy_binary": m.accuracy_binary,
            "precision_positive": m.precision_positive,
            "recall_positive": m.recall_positive,
            "precision_negative": m.precision_negative,
            "recall_negative": m.recall_negative,
        }


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--type", choices=["fast", "balanced", "full", "semantic"], default="fast")
    parser.add_argument("--model", default="gemini-2.5-flash")
    parser.add_argument("--save", action="store_true")
    args = parser.parse_args()

    exp = CompositeExperiment(scorer_type=args.type, model=args.model)
    result = exp.run()

    if args.save:
        path = exp.save_result(result)
        print(f"Saved to: {path}")


if __name__ == "__main__":
    main()
