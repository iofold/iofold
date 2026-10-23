#!/usr/bin/env python3
"""
Compare results across all experiments and create ensemble.

Usage:
    python compare_results.py          # Show comparison table
    python compare_results.py --best   # Show best result details
"""

import json
import sys
from pathlib import Path
from typing import Dict, Any, List, Optional

RESULTS_DIR = Path(__file__).parent / "results"


def load_all_results() -> Dict[str, Dict[str, Any]]:
    """Load all experiment results from JSON files."""
    results = {}

    if not RESULTS_DIR.exists():
        print(f"Results directory not found: {RESULTS_DIR}")
        return results

    for f in sorted(RESULTS_DIR.glob("*.json")):
        try:
            with open(f) as fp:
                data = json.load(fp)
                exp_id = data.get('experiment_id', f.stem)
                # Keep most recent result per experiment
                if exp_id not in results:
                    results[exp_id] = data
                else:
                    # Compare timestamps, keep newer
                    existing_time = results[exp_id].get('completed_at', '')
                    new_time = data.get('completed_at', '')
                    if new_time > existing_time:
                        results[exp_id] = data
        except Exception as e:
            print(f"Error loading {f}: {e}")

    return results


def format_metric(value: Optional[float], fmt: str = ".1%") -> str:
    """Format a metric value for display."""
    if value is None:
        return "N/A"
    if fmt == ".1%":
        return f"{value:.1%}"
    elif fmt == ".3f":
        return f"{value:.3f}"
    return str(value)


def compare() -> None:
    """Print comparison table of all experiments."""
    results = load_all_results()

    if not results:
        print("No results found. Run experiments first:")
        print("  python exp3_llm_friendly.py --save")
        print("  python exp4_contrastive.py --save")
        print("  python exp5_feedback_mining.py --save")
        print("  python exp6_tool_grounding.py --save")
        print("  python exp7_failure_modes.py --save")
        return

    print("=" * 80)
    print("EXPERIMENT COMPARISON")
    print("=" * 80)
    print(f"{'Experiment':<35} {'Accuracy':>10} {'F1':>10} {'Kappa':>10} {'Prec':>8} {'Recall':>8}")
    print("-" * 80)

    sorted_results = []
    for exp_id, data in results.items():
        test_metrics = data.get('test_metrics', {})
        if test_metrics:
            acc = test_metrics.get('accuracy', 0)
            f1 = test_metrics.get('f1_score', 0)
            kappa = test_metrics.get('cohen_kappa', 0)
            prec = test_metrics.get('precision', 0)
            recall = test_metrics.get('recall', 0)

            sorted_results.append({
                'exp_id': exp_id,
                'name': data.get('experiment_name', exp_id),
                'accuracy': acc,
                'f1': f1,
                'kappa': kappa,
                'precision': prec,
                'recall': recall,
                'model': data.get('model', 'unknown'),
                'duration': data.get('duration_seconds', 0),
            })

    # Sort by accuracy (descending)
    sorted_results.sort(key=lambda x: x['accuracy'], reverse=True)

    for r in sorted_results:
        acc_str = format_metric(r['accuracy'])
        f1_str = format_metric(r['f1'], ".3f")
        kappa_str = format_metric(r['kappa'], ".3f")
        prec_str = format_metric(r['precision'], ".3f")
        recall_str = format_metric(r['recall'], ".3f")

        # Highlight if meets target
        marker = " *" if r['accuracy'] >= 0.80 else ""

        print(f"{r['exp_id']:<35} {acc_str:>10} {f1_str:>10} {kappa_str:>10} {prec_str:>8} {recall_str:>8}{marker}")

    print("-" * 80)
    print("* = meets 80% accuracy target")

    # Summary statistics
    if sorted_results:
        best = sorted_results[0]
        avg_acc = sum(r['accuracy'] for r in sorted_results) / len(sorted_results)

        print(f"\nBest: {best['exp_id']} ({best['accuracy']:.1%} accuracy)")
        print(f"Average accuracy: {avg_acc:.1%}")
        print(f"Experiments run: {len(sorted_results)}")


def show_best() -> None:
    """Show details of the best performing experiment."""
    results = load_all_results()

    if not results:
        print("No results found.")
        return

    best_exp = None
    best_acc = 0

    for exp_id, data in results.items():
        test_metrics = data.get('test_metrics', {})
        if test_metrics:
            acc = test_metrics.get('accuracy', 0)
            if acc > best_acc:
                best_acc = acc
                best_exp = data

    if not best_exp:
        print("No valid results found.")
        return

    print("=" * 80)
    print("BEST EXPERIMENT DETAILS")
    print("=" * 80)

    print(f"Experiment: {best_exp.get('experiment_name')}")
    print(f"ID: {best_exp.get('experiment_id')}")
    print(f"Model: {best_exp.get('model')}")
    print(f"Duration: {best_exp.get('duration_seconds', 0):.1f}s")

    test_metrics = best_exp.get('test_metrics', {})
    print(f"\nTest Metrics:")
    print(f"  Accuracy:  {test_metrics.get('accuracy', 0):.1%}")
    print(f"  F1 Score:  {test_metrics.get('f1_score', 0):.3f}")
    print(f"  Precision: {test_metrics.get('precision', 0):.3f}")
    print(f"  Recall:    {test_metrics.get('recall', 0):.3f}")
    print(f"  Kappa:     {test_metrics.get('cohen_kappa', 0):.3f}")
    print(f"  TP/TN/FP/FN: {test_metrics.get('true_positives', 0)}/{test_metrics.get('true_negatives', 0)}/{test_metrics.get('false_positives', 0)}/{test_metrics.get('false_negatives', 0)}")

    eval_code = best_exp.get('eval_code', '')
    if eval_code:
        print(f"\nGenerated Eval Code:")
        print("-" * 40)
        print(eval_code[:2000])
        if len(eval_code) > 2000:
            print("... (truncated)")


def run_all_experiments() -> Dict[str, Any]:
    """Run all experiments and return results."""
    from experiments.eval_reward_functions.exp3_llm_friendly import Exp3LLMFriendly, Exp3Config
    from experiments.eval_reward_functions.exp4_contrastive import Exp4Contrastive, Exp4Config
    from experiments.eval_reward_functions.exp5_feedback_mining import Exp5FeedbackMining, Exp5Config
    from experiments.eval_reward_functions.exp6_tool_grounding import Exp6ToolGrounding, Exp6Config
    from experiments.eval_reward_functions.exp7_failure_modes import Exp7FailureModes, Exp7Config

    experiments = [
        (Exp3LLMFriendly, Exp3Config),
        (Exp4Contrastive, Exp4Config),
        (Exp5FeedbackMining, Exp5Config),
        (Exp6ToolGrounding, Exp6Config),
        (Exp7FailureModes, Exp7Config),
    ]

    all_results = {}

    for ExpClass, ConfigClass in experiments:
        try:
            config = ConfigClass()
            exp = ExpClass(config=config)
            result = exp.run()
            exp.save_result(result)
            all_results[result.experiment_id] = result
        except Exception as e:
            print(f"Error running {ExpClass.__name__}: {e}")

    return all_results


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Compare experiment results")
    parser.add_argument("--best", action="store_true", help="Show best result details")
    parser.add_argument("--run-all", action="store_true", help="Run all experiments")
    args = parser.parse_args()

    if args.run_all:
        print("Running all experiments...")
        run_all_experiments()

    if args.best:
        show_best()
    else:
        compare()


if __name__ == "__main__":
    main()
