#!/usr/bin/env python3
"""
Experiment 7: Failure Mode Clustering

Hypothesis: Different question types have different failure modes.
Specialized evaluators per question type will outperform general ones.

Key insight:
- Variance questions: Often hallucinate specific numbers
- Meeting questions: Often get time/location wrong
- Existence questions: Often over-claim or under-claim

Approach:
1. Group traces by question type
2. For each group, identify common failure modes
3. Generate specialized eval functions per group
4. Combine into ensemble

Success Criteria: >80% accuracy, >0.6 Cohen's kappa
"""

import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

NOTEBOOKS_DIR = Path(__file__).parent.parent.parent
sys.path.insert(0, str(NOTEBOOKS_DIR))

from dotenv import load_dotenv
PROJECT_ROOT = NOTEBOOKS_DIR.parent
load_dotenv(PROJECT_ROOT / ".env")

from openai import OpenAI

from experiments.eval_reward_functions.experiment_base import (
    ExperimentRunner,
    ExperimentResult,
    LabeledTrace,
)
from experiments.eval_reward_functions.config import (
    JOB_ID,
    MODELS,
    CLASSIFICATION_THRESHOLD,
)
from iofold_eval_core.generation.pair_generator import group_traces_by_question_type
from iofold_eval_core.sandbox import execute_reward_function


@dataclass
class Exp7Config:
    model_key: str = "gemini-3-flash-preview"
    temperature: float = 0.3
    max_tokens: int = 16384
    max_iterations: int = 10
    candidates_per_iteration: int = 5
    target_accuracy: float = 0.80


FAILURE_MODE_PROMPT = """Analyze failure modes for this question type: {question_type}

## Positive Examples (good answers)
{positive_examples}

## Negative Examples (bad answers)
{negative_examples}

Identify:
1. What makes answers FAIL for this question type?
2. What specific patterns lead to negative ratings?
3. What distinguishes good from bad answers for {question_type} questions?

Return JSON:
{{
    "question_type": "{question_type}",
    "failure_modes": ["mode1", "mode2", ...],
    "success_patterns": ["pattern1", "pattern2", ...],
    "detection_rules": ["rule1", "rule2", ...]
}}
"""

GENERATION_PROMPT = """Based on failure mode analysis for different question types:

{analysis}

## Trace Schema
- trace['input_preview']: str - user's question
- trace['output_preview']: str - agent's answer
- trace['has_errors']: bool
- trace['step_count']: int
- trace['steps']: list with tool_calls

Generate {num_candidates} eval functions that:
1. First detect the question type
2. Apply type-specific checks for failure modes
3. Return appropriate score

Requirements:
- Function: def eval_*(trace: dict, ctx=None) -> Tuple[float, str]
- Return (score 0-1, feedback)
- Include question type detection
- Apply type-specific failure mode checks
- Use only: json, re, math, datetime, difflib

Output {num_candidates} JSON objects, one per line:
{{"code": "def eval_...(trace, ctx=None):\\n    import re\\n    ...", "strategy": "...", "reasoning": "..."}}
"""


class Exp7FailureModes(ExperimentRunner):
    def __init__(self, config: Exp7Config = None, job_id: str = JOB_ID):
        self.config = config or Exp7Config()
        super().__init__(
            experiment_id="exp7-failure-modes",
            experiment_name="Failure Mode Clustering",
            model=self.config.model_key,
            job_id=job_id,
        )
        self.client = None
        self.best_candidate = None
        self.analysis = None

    def _init_client(self):
        model_config = MODELS.get(self.config.model_key)
        if not model_config:
            raise ValueError(f"Unknown model: {self.config.model_key}")

        self.client = OpenAI(
            api_key=os.environ.get("CF_AI_GATEWAY_TOKEN"),
            base_url=f"https://gateway.ai.cloudflare.com/v1/{os.environ.get('CF_ACCOUNT_ID')}/{os.environ.get('CF_AI_GATEWAY_ID')}/compat"
        )
        self.model_id = f"{model_config.provider}/{model_config.model_id}"

    def _generate(self, prompt: str, max_tokens: int = None) -> str:
        max_tokens = max_tokens or self.config.max_tokens
        response = self.client.chat.completions.create(
            model=self.model_id,
            messages=[{"role": "user", "content": prompt}],
            temperature=self.config.temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""

    def _analyze_failure_modes(self, traces: List[LabeledTrace]) -> Dict[str, Any]:
        self._log("  Grouping traces by question type...")

        trace_dicts = [{
            'id': t.id,
            'input_preview': t.input_preview,
            'output_preview': t.output_preview,
            'steps': t.steps,
            'has_errors': t.has_errors,
            'step_count': t.step_count,
            'rating': t.rating,
            'rating_detail': t.rating_detail,
        } for t in traces]

        groups = group_traces_by_question_type(trace_dicts)
        self._log(f"  Found {len(groups)} question types")

        # Analyze top groups
        all_analyses = []
        for group in groups[:5]:  # Top 5 question types
            qtype = group['type']
            positives = [t for t in group['traces'] if t.get('rating') == 'positive'][:10]
            negatives = [t for t in group['traces'] if t.get('rating') == 'negative'][:10]

            if not positives or not negatives:
                continue

            pos_examples = '\n'.join([
                f"- Q: {t.get('input_preview', '')[:80]}\n  A: {t.get('output_preview', '')[:100]}"
                for t in positives[:5]
            ])
            neg_examples = '\n'.join([
                f"- Q: {t.get('input_preview', '')[:80]}\n  A: {t.get('output_preview', '')[:100]}\n  Feedback: {t.get('rating_detail', '')[:80]}"
                for t in negatives[:5]
            ])

            prompt = FAILURE_MODE_PROMPT.format(
                question_type=qtype,
                positive_examples=pos_examples,
                negative_examples=neg_examples,
            )

            response = self._generate(prompt, max_tokens=2048)

            try:
                # Strip markdown code blocks
                cleaned = re.sub(r'```(?:json|python)?\s*', '', response)
                cleaned = re.sub(r'```\s*', '', cleaned)
                json_match = re.search(r'\{[\s\S]*\}', cleaned)
                if json_match:
                    analysis = json.loads(json_match.group())
                    analysis['trace_count'] = len(group['traces'])
                    all_analyses.append(analysis)
            except:
                pass

        return {
            'question_types': [g['type'] for g in groups],
            'type_analyses': all_analyses,
            'type_counts': {g['type']: len(g['traces']) for g in groups},
        }

    def _generate_candidates(self, analysis: Dict[str, Any], num: int) -> List[Dict]:
        prompt = GENERATION_PROMPT.format(
            analysis=json.dumps(analysis, indent=2),
            num_candidates=num,
        )
        response = self._generate(prompt)

        candidates = []
        for line in response.split('\n'):
            line = line.strip()
            if line.startswith('{') and '"code"' in line:
                try:
                    candidates.append(json.loads(line))
                except:
                    pass

        if not candidates:
            json_matches = re.findall(r'\{[^{}]*"code"[^{}]*\}', response, re.DOTALL)
            for match in json_matches:
                try:
                    candidates.append(json.loads(match))
                except:
                    pass

        return candidates

    def _test_candidate(self, code: str, traces: List[LabeledTrace]) -> float:
        correct = 0
        total = 0
        for trace in traces:
            trace_dict = trace.to_dict()
            try:
                score, _ = execute_reward_function(code, trace_dict, None)
                predicted = 'positive' if score >= CLASSIFICATION_THRESHOLD else 'negative'
                if predicted == trace.rating or trace.rating == 'neutral':
                    correct += 1
                total += 1
            except:
                total += 1
        return correct / total if total > 0 else 0.0

    def _create_eval_function(self) -> Callable:
        if not self.best_candidate:
            return lambda t, ctx: (0.5, "No candidate")
        code = self.best_candidate.get('code', '')
        return lambda t, ctx: execute_reward_function(code, t, ctx)

    def run(self) -> ExperimentResult:
        start_time = datetime.now()
        self._log("=" * 60)
        self._log(f"Experiment 7: {self.experiment_name}")
        self._log("=" * 60)

        self._init_client()
        train_traces, val_traces, test_traces = self._split_traces()
        self._log(f"Train: {len(train_traces)}, Val: {len(val_traces)}, Test: {len(test_traces)}")

        self._log("\n[1/3] Analyzing failure modes by question type...")
        self.analysis = self._analyze_failure_modes(train_traces)
        self._log(f"  Question types: {self.analysis.get('question_types', [])}")

        self._log("\n[2/3] Generating and testing candidates...")
        best_accuracy = 0.0

        for iteration in range(self.config.max_iterations):
            candidates = self._generate_candidates(self.analysis, self.config.candidates_per_iteration)
            if not candidates:
                continue

            for cand in candidates:
                code = cand.get('code', '')
                if not code:
                    continue

                accuracy = self._test_candidate(code, val_traces)
                self._log(f"  Iteration {iteration+1}: accuracy={accuracy:.1%}")

                if accuracy > best_accuracy:
                    best_accuracy = accuracy
                    self.best_candidate = cand

                    if accuracy >= self.config.target_accuracy:
                        break

            if best_accuracy >= self.config.target_accuracy:
                break

        self._log("\n[3/3] Final evaluation...")
        val_metrics = test_metrics = None
        test_results = []

        if self.best_candidate:
            code = self.best_candidate['code']
            eval_fn = lambda t, ctx: execute_reward_function(code, t, ctx)

            val_results = self.evaluate_traces(eval_fn, val_traces)
            val_metrics = self.compute_metrics(val_results)

            test_results = self.evaluate_traces(eval_fn, test_traces)
            test_metrics = self.compute_metrics(test_results)

            self._log(f"Test Accuracy: {test_metrics.accuracy:.1%}")
            self._log(f"Test F1: {test_metrics.f1_score:.3f}")

        end_time = datetime.now()

        return ExperimentResult(
            experiment_id=self.experiment_id,
            experiment_name=self.experiment_name,
            model=self.config.model_key,
            started_at=start_time.isoformat(),
            completed_at=end_time.isoformat(),
            duration_seconds=(end_time - start_time).total_seconds(),
            validation_metrics=val_metrics,
            test_metrics=test_metrics,
            test_results=test_results,
            eval_code=self.best_candidate['code'] if self.best_candidate else "",
            config=self.config.__dict__,
            notes=f"Analysis: {json.dumps(self.analysis)[:500]}",
        )


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="gemini-3-flash-preview")
    parser.add_argument("--save", action="store_true")
    args = parser.parse_args()

    config = Exp7Config(model_key=args.model)
    experiment = Exp7FailureModes(config=config)
    result = experiment.run()

    if args.save:
        path = experiment.save_result(result)
        print(f"Saved to: {path}")

    return 0 if result.test_metrics and result.test_metrics.accuracy >= 0.8 else 1


if __name__ == "__main__":
    sys.exit(main())
