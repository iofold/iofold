#!/usr/bin/env python3
"""
Experiment 5: Human Feedback Pattern Mining

Hypothesis: The rating_detail field contains human explanations that
directly tell us what to check for in eval functions.

Approach:
1. Extract and analyze rating_detail text from all traces
2. Cluster feedback by keywords (hallucination, correct, wrong, etc.)
3. Generate eval functions for each feedback cluster

Success Criteria: >80% accuracy, >0.6 Cohen's kappa
"""

import json
import os
import re
import sys
from collections import Counter
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
from iofold_eval_core.sandbox import execute_reward_function


@dataclass
class Exp5Config:
    model_key: str = "gemini-3-flash-preview"
    temperature: float = 0.3
    max_tokens: int = 16384
    max_iterations: int = 10
    candidates_per_iteration: int = 5
    target_accuracy: float = 0.80


# Feedback patterns to look for
FEEDBACK_KEYWORDS = {
    'positive': ['correct', 'accurate', 'found', 'matches', 'right', 'good', 'proper', 'valid'],
    'negative': ['wrong', 'incorrect', 'hallucin', 'made up', 'fabricat', 'error', 'fail', 'missing', 'not found'],
    'neutral': ['partial', 'unclear', 'some', 'maybe', 'uncertain'],
}


FEEDBACK_MINING_PROMPT = """Analyze these human feedback patterns from trace evaluations.

## Feedback by Rating

### Positive Feedback Examples:
{positive_feedback}

### Negative Feedback Examples:
{negative_feedback}

### Neutral Feedback Examples:
{neutral_feedback}

## Keyword Frequency
{keyword_counts}

Based on this analysis:
1. What specific phrases indicate a POSITIVE trace?
2. What specific phrases indicate a NEGATIVE trace?
3. What patterns can be detected programmatically?

Return JSON:
{{
    "positive_indicators": ["indicator1", "indicator2", ...],
    "negative_indicators": ["indicator1", "indicator2", ...],
    "detectable_patterns": ["pattern1", "pattern2", ...],
    "rules": ["if X then positive", "if Y then negative", ...]
}}
"""

GENERATION_PROMPT = """Based on this human feedback analysis:

{analysis}

## Trace Schema
- trace['id']: str
- trace['input_preview']: str - user's question
- trace['output_preview']: str - agent's answer
- trace['has_errors']: bool
- trace['step_count']: int
- trace['steps']: list with tool_calls

Generate {num_candidates} eval functions that detect the patterns humans use.

Requirements:
- Function: def eval_*(trace: dict, ctx=None) -> Tuple[float, str]
- Return (score 0-1, feedback)
- Check for indicators identified in analysis
- Use only: json, re, math, datetime, difflib

Output {num_candidates} JSON objects, one per line:
{{"code": "def eval_...(trace, ctx=None):\\n    ...", "strategy": "...", "reasoning": "..."}}
"""


class Exp5FeedbackMining(ExperimentRunner):
    def __init__(self, config: Exp5Config = None, job_id: str = JOB_ID):
        self.config = config or Exp5Config()
        super().__init__(
            experiment_id="exp5-feedback-mining",
            experiment_name="Human Feedback Pattern Mining",
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

    def _mine_feedback_patterns(self, traces: List[LabeledTrace]) -> Dict[str, Any]:
        self._log("  Mining feedback patterns...")

        # Group feedback by rating
        positive_feedback = []
        negative_feedback = []
        neutral_feedback = []

        for t in traces:
            if t.rating_detail:
                if t.rating == 'positive':
                    positive_feedback.append(t.rating_detail)
                elif t.rating == 'negative':
                    negative_feedback.append(t.rating_detail)
                else:
                    neutral_feedback.append(t.rating_detail)

        # Count keywords
        all_feedback = ' '.join(positive_feedback + negative_feedback + neutral_feedback).lower()
        word_counts = Counter(re.findall(r'\b\w+\b', all_feedback))
        top_keywords = word_counts.most_common(50)

        # Format for prompt
        prompt = FEEDBACK_MINING_PROMPT.format(
            positive_feedback='\n'.join(f"- {f}" for f in positive_feedback[:30]),
            negative_feedback='\n'.join(f"- {f}" for f in negative_feedback[:30]),
            neutral_feedback='\n'.join(f"- {f}" for f in neutral_feedback[:15]),
            keyword_counts='\n'.join(f"- {w}: {c}" for w, c in top_keywords[:30]),
        )

        response = self._generate(prompt, max_tokens=4096)

        try:
            # Strip markdown code blocks
            cleaned = re.sub(r'```(?:json|python)?\s*', '', response)
            cleaned = re.sub(r'```\s*', '', cleaned)
            json_match = re.search(r'\{[\s\S]*\}', cleaned)
            if json_match:
                return json.loads(json_match.group())
        except:
            pass
        return {"raw_response": response}

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
        self._log(f"Experiment 5: {self.experiment_name}")
        self._log("=" * 60)

        self._init_client()
        train_traces, val_traces, test_traces = self._split_traces()
        self._log(f"Train: {len(train_traces)}, Val: {len(val_traces)}, Test: {len(test_traces)}")

        self._log("\n[1/3] Mining feedback patterns...")
        self.analysis = self._mine_feedback_patterns(train_traces)

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

    config = Exp5Config(model_key=args.model)
    experiment = Exp5FeedbackMining(config=config)
    result = experiment.run()

    if args.save:
        path = experiment.save_result(result)
        print(f"Saved to: {path}")

    return 0 if result.test_metrics and result.test_metrics.accuracy >= 0.8 else 1


if __name__ == "__main__":
    sys.exit(main())
