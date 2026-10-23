#!/usr/bin/env python3
"""
Experiment 6: Tool Usage & Grounding Patterns

Hypothesis: Hallucination can be detected by comparing tool results
with agent answer specificity.

Key patterns to detect:
- GROUNDED_POSITIVE: Tool found data, answer summarizes it
- GROUNDED_NEGATIVE: Tool found nothing, answer says "not found"
- HALLUCINATION: Tool found nothing, answer claims specific facts
- CONTRADICTION: Tool found X, answer says Y

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
from iofold_eval_core.sandbox import execute_reward_function


@dataclass
class Exp6Config:
    model_key: str = "gemini-3-flash-preview"
    temperature: float = 0.3
    max_tokens: int = 16384
    max_iterations: int = 10
    candidates_per_iteration: int = 5
    target_accuracy: float = 0.80


def _extract_tool_results(trace: Dict[str, Any]) -> List[Dict]:
    """Extract all tool call results from a trace."""
    results = []
    for step in trace.get('steps', []):
        for tc in step.get('tool_calls', []):
            tool_name = tc.get('tool_name', '')
            result = tc.get('result', {}).get('kwargs', {})
            status = result.get('status', '')
            content = result.get('content', '')

            # Parse content if JSON
            try:
                content_data = json.loads(content) if content else {}
            except:
                content_data = {'raw': content}

            results.append({
                'tool_name': tool_name,
                'status': status,
                'content': content_data,
                'has_data': bool(content_data.get('total', 0) > 0 or content_data.get('emails', [])),
            })
    return results


def _analyze_grounding(trace: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze grounding between tool results and answer."""
    tool_results = _extract_tool_results(trace)
    answer = trace.get('output_preview', '')

    # Check tool results
    has_tool_data = any(r['has_data'] for r in tool_results)
    has_errors = any(r['status'] == 'error' for r in tool_results)
    empty_results = all(not r['has_data'] for r in tool_results) if tool_results else True

    # Check answer specificity
    has_specific_claims = bool(re.search(r'\d+|specific|exactly|at \d|on \d', answer, re.I))
    says_not_found = bool(re.search(r'not found|no (email|result|data)|couldn\'t find|unable to', answer, re.I))

    # Classify grounding
    if has_tool_data and not says_not_found:
        grounding = 'GROUNDED_POSITIVE'
    elif empty_results and says_not_found:
        grounding = 'GROUNDED_NEGATIVE'
    elif empty_results and has_specific_claims:
        grounding = 'HALLUCINATION'
    elif has_tool_data and says_not_found:
        grounding = 'CONTRADICTION'
    else:
        grounding = 'UNKNOWN'

    return {
        'grounding': grounding,
        'has_tool_data': has_tool_data,
        'empty_results': empty_results,
        'has_specific_claims': has_specific_claims,
        'says_not_found': says_not_found,
        'has_errors': has_errors,
    }


GROUNDING_ANALYSIS_PROMPT = """Analyze these traces for grounding patterns (tool results vs answer claims).

## Trace Grounding Analysis

{trace_analyses}

## Grounding Distribution
{grounding_counts}

Based on this:
1. What patterns indicate HALLUCINATION (claims without tool support)?
2. What patterns indicate GROUNDED answers (claims match tool results)?
3. What specific signals can detect good vs bad grounding?

Return JSON:
{{
    "hallucination_signals": ["signal1", "signal2", ...],
    "grounded_signals": ["signal1", "signal2", ...],
    "detection_rules": ["rule1", "rule2", ...]
}}
"""

GENERATION_PROMPT = """Based on this grounding analysis:

{analysis}

## Trace Schema
- trace['steps']: list with tool_calls, each having:
  - tool_calls[*]['tool_name']: str
  - tool_calls[*]['result']['kwargs']['status']: str
  - tool_calls[*]['result']['kwargs']['content']: str (JSON)
- trace['output_preview']: str - agent's answer
- trace['has_errors']: bool

Generate {num_candidates} eval functions that detect hallucination vs grounded answers.

Requirements:
- Function: def eval_*(trace: dict, ctx=None) -> Tuple[float, str]
- Return (score 0-1, feedback)
- Check tool results vs answer claims
- Penalize hallucination (specific claims with no tool support)
- Use only: json, re, math, datetime, difflib

Output {num_candidates} JSON objects, one per line:
{{"code": "def eval_...(trace, ctx=None):\\n    import json\\n    import re\\n    ...", "strategy": "...", "reasoning": "..."}}
"""


class Exp6ToolGrounding(ExperimentRunner):
    def __init__(self, config: Exp6Config = None, job_id: str = JOB_ID):
        self.config = config or Exp6Config()
        super().__init__(
            experiment_id="exp6-tool-grounding",
            experiment_name="Tool Usage & Grounding Patterns",
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

    def _analyze_grounding_patterns(self, traces: List[LabeledTrace]) -> Dict[str, Any]:
        self._log("  Analyzing grounding patterns...")

        analyses = []
        grounding_counts = {}

        for t in traces[:100]:  # Sample for analysis
            trace_dict = t.to_dict()
            grounding = _analyze_grounding(trace_dict)
            grounding['rating'] = t.rating
            grounding['trace_id'] = t.id
            grounding['answer_preview'] = (t.output_preview or '')[:100]
            analyses.append(grounding)

            g_type = grounding['grounding']
            grounding_counts[g_type] = grounding_counts.get(g_type, 0) + 1

        # Format for prompt
        trace_analyses = []
        for a in analyses[:30]:
            trace_analyses.append(
                f"- {a['trace_id']}: grounding={a['grounding']}, rating={a['rating']}, "
                f"tool_data={a['has_tool_data']}, claims={a['has_specific_claims']}"
            )

        prompt = GROUNDING_ANALYSIS_PROMPT.format(
            trace_analyses='\n'.join(trace_analyses),
            grounding_counts=json.dumps(grounding_counts, indent=2),
        )

        response = self._generate(prompt, max_tokens=4096)

        try:
            # Strip markdown code blocks
            cleaned = re.sub(r'```(?:json|python)?\s*', '', response)
            cleaned = re.sub(r'```\s*', '', cleaned)
            json_match = re.search(r'\{[\s\S]*\}', cleaned)
            if json_match:
                result = json.loads(json_match.group())
                result['grounding_distribution'] = grounding_counts
                return result
        except:
            pass
        return {"raw_response": response, "grounding_distribution": grounding_counts}

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
        self._log(f"Experiment 6: {self.experiment_name}")
        self._log("=" * 60)

        self._init_client()
        train_traces, val_traces, test_traces = self._split_traces()
        self._log(f"Train: {len(train_traces)}, Val: {len(val_traces)}, Test: {len(test_traces)}")

        self._log("\n[1/3] Analyzing grounding patterns...")
        self.analysis = self._analyze_grounding_patterns(train_traces)
        self._log(f"  Grounding distribution: {self.analysis.get('grounding_distribution', {})}")

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

    config = Exp6Config(model_key=args.model)
    experiment = Exp6ToolGrounding(config=config)
    result = experiment.run()

    if args.save:
        path = experiment.save_result(result)
        print(f"Saved to: {path}")

    return 0 if result.test_metrics and result.test_metrics.accuracy >= 0.8 else 1


if __name__ == "__main__":
    sys.exit(main())
