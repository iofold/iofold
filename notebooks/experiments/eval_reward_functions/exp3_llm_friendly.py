#!/usr/bin/env python3
"""
Experiment 3: LLM-Friendly Trace Format + Feedback Analysis

Hypothesis: Converting traces to narrative format and including human
feedback text will help the LLM understand quality patterns better.

Approach:
1. Format traces as human-readable narratives
2. Include rating_detail in the prompt
3. Ask LLM to analyze WHY traces got their ratings
4. Generate eval functions based on these insights

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

# Add notebooks dir to path
NOTEBOOKS_DIR = Path(__file__).parent.parent.parent
sys.path.insert(0, str(NOTEBOOKS_DIR))

from dotenv import load_dotenv
PROJECT_ROOT = NOTEBOOKS_DIR.parent
load_dotenv(PROJECT_ROOT / ".env")

from openai import OpenAI

from experiments.eval_reward_functions.experiment_base import (
    ExperimentRunner,
    ExperimentResult,
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
from iofold_eval_core.generation.trace_formatter import (
    format_trace_for_llm,
    format_traces_batch,
)
from iofold_eval_core.sandbox import execute_reward_function


@dataclass
class Exp3Config:
    """Configuration for experiment 3."""
    model_key: str = "gemini-3-flash-preview"
    temperature: float = 0.3
    max_tokens: int = 16384

    # Iteration settings
    max_iterations: int = 10
    candidates_per_iteration: int = 5
    target_accuracy: float = 0.80

    # Sample settings
    max_positive_examples: int = 30
    max_negative_examples: int = 30


# Analysis prompt - asks LLM to explain rating patterns
FEEDBACK_ANALYSIS_PROMPT = """Analyze these agent traces with human ratings.

Your task: Understand WHY humans rated traces as positive or negative.

{formatted_traces}

Based on these examples, answer:

1. POSITIVE PATTERNS: What do positive traces have in common? What makes an answer "good"?

2. NEGATIVE PATTERNS: What do negative traces have in common? What makes an answer "bad"?

3. KEY SIGNALS: What specific signals in the trace (tool usage, answer structure, keywords) predict the rating?

4. FAILURE MODES: What are the common failure modes that lead to negative ratings?

Be specific and cite examples from the traces above.

Return JSON:
{{
    "positive_patterns": ["pattern1", "pattern2", ...],
    "negative_patterns": ["pattern1", "pattern2", ...],
    "key_signals": ["signal1", "signal2", ...],
    "failure_modes": ["mode1", "mode2", ...]
}}
"""

# Generation prompt - uses analysis to generate eval functions
GENERATION_PROMPT = """Based on this analysis of human feedback patterns:

## Feedback Analysis
{analysis}

## Trace Schema
The trace dict has these fields:
- trace['id']: str
- trace['input_preview']: str - user's question
- trace['output_preview']: str - agent's answer
- trace['has_errors']: bool
- trace['step_count']: int
- trace['steps']: list of execution steps, each with:
    - step['messages_added']: list of {{'role': str, 'content': str}}
    - step['tool_calls']: list of {{'tool_name': str, 'arguments': dict, 'result': {{'kwargs': {{'status': str, 'content': str}}}}}}

## Task
Generate {num_candidates} diverse reward functions that capture the human feedback patterns.
Each function should detect the positive/negative patterns identified above.

Requirements:
- Function signature: def eval_*(trace: dict, ctx=None) -> Tuple[float, str]
- Return (score 0-1, feedback_string)
- Use only: json, re, math, datetime, difflib
- Focus on patterns humans actually use to rate traces
- Import any needed modules at the top of the function

Output {num_candidates} JSON objects, one per line:
{{"code": "def eval_...(trace, ctx=None):\\n    import json\\n    import re\\n    ...", "strategy": "description", "reasoning": "which patterns this captures"}}
"""


class Exp3LLMFriendly(ExperimentRunner):
    """Experiment 3: LLM-Friendly Format with Feedback Analysis."""

    def __init__(self, config: Exp3Config = None, job_id: str = JOB_ID):
        self.config = config or Exp3Config()

        super().__init__(
            experiment_id="exp3-llm-friendly",
            experiment_name="LLM-Friendly Format + Feedback Analysis",
            model=self.config.model_key,
            job_id=job_id,
        )

        self.client = None
        self.best_candidate = None
        self.analysis = None

    def _init_client(self):
        """Initialize LLM client."""
        model_config = MODELS.get(self.config.model_key)
        if not model_config:
            raise ValueError(f"Unknown model: {self.config.model_key}")

        account_id = os.environ.get("CF_ACCOUNT_ID")
        gateway_id = os.environ.get("CF_AI_GATEWAY_ID")
        api_key = os.environ.get("CF_AI_GATEWAY_TOKEN")

        self.client = OpenAI(
            api_key=api_key,
            base_url=f"https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/compat"
        )
        # Use full gateway model ID: provider/model
        self.model_id = f"{model_config.provider}/{model_config.model_id}"
        self.provider = model_config.provider

    def _generate(self, prompt: str, max_tokens: int = None) -> str:
        """Generate text from LLM."""
        max_tokens = max_tokens or self.config.max_tokens

        params = {
            "model": self.model_id,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": self.config.temperature,
            "max_tokens": max_tokens,
        }

        response = self.client.chat.completions.create(**params)
        return response.choices[0].message.content or ""

    def _analyze_feedback_patterns(self, traces: List[LabeledTrace]) -> Dict[str, Any]:
        """Analyze human feedback patterns."""
        self._log("  Analyzing human feedback patterns...")

        # Format traces with ratings
        formatted = []
        for trace in traces:
            trace_dict = {
                'id': trace.id,
                'input_preview': trace.input_preview,
                'output_preview': trace.output_preview,
                'steps': trace.steps,
                'has_errors': trace.has_errors,
                'step_count': trace.step_count,
            }
            formatted.append(format_trace_for_llm(
                trace_dict,
                trace.rating,
                trace.rating_detail
            ))

        prompt = FEEDBACK_ANALYSIS_PROMPT.format(
            formatted_traces='\n\n'.join(formatted)
        )

        response = self._generate(prompt, max_tokens=4096)

        # Parse JSON from response (handle markdown code blocks)
        try:
            # Strip markdown code blocks if present
            cleaned = re.sub(r'```json\s*', '', response)
            cleaned = re.sub(r'```\s*', '', cleaned)
            # Find JSON in response
            json_match = re.search(r'\{[\s\S]*\}', cleaned)
            if json_match:
                return json.loads(json_match.group())
        except:
            pass

        return {"raw_response": response}

    def _generate_candidates(self, analysis: Dict[str, Any], num: int) -> List[Dict]:
        """Generate eval function candidates."""
        self._log(f"  Generating {num} candidates...")

        prompt = GENERATION_PROMPT.format(
            analysis=json.dumps(analysis, indent=2),
            num_candidates=num,
        )

        response = self._generate(prompt)

        # Strip markdown code blocks
        cleaned = re.sub(r'```(?:json|python)?\s*', '', response)
        cleaned = re.sub(r'```\s*', '', cleaned)

        # Parse JSONL response
        candidates = []
        for line in cleaned.split('\n'):
            line = line.strip()
            if line.startswith('{') and '"code"' in line:
                try:
                    # Handle escaped newlines in code
                    candidates.append(json.loads(line))
                except:
                    pass

        # Also try to extract JSON objects with code key
        if not candidates:
            # Match JSON objects that contain "code" key
            json_pattern = r'\{[^{}]*"code"\s*:\s*"[^"]*(?:\\.[^"]*)*"[^{}]*\}'
            json_matches = re.findall(json_pattern, cleaned, re.DOTALL)
            for match in json_matches:
                try:
                    candidates.append(json.loads(match))
                except:
                    pass

        return candidates

    def _test_candidate(self, code: str, traces: List[LabeledTrace]) -> Tuple[float, float]:
        """Test a candidate on traces, return (accuracy, kappa)."""
        correct = 0
        total = 0

        for trace in traces:
            trace_dict = {
                'id': trace.id,
                'input_preview': trace.input_preview,
                'output_preview': trace.output_preview,
                'steps': trace.steps,
                'has_errors': trace.has_errors,
                'step_count': trace.step_count,
                'metadata': trace.metadata,
            }

            try:
                score, _ = execute_reward_function(code, trace_dict, None)
                predicted = 'positive' if score >= CLASSIFICATION_THRESHOLD else 'negative'
                actual = trace.rating
                if predicted == actual or (actual == 'neutral'):
                    correct += 1
                total += 1
            except Exception as e:
                total += 1

        accuracy = correct / total if total > 0 else 0.0
        # Simplified kappa calculation
        return accuracy, 0.0

    def _create_eval_function(self) -> Callable[[Dict[str, Any], Optional[Any]], Tuple[float, str]]:
        """Create the eval function from best candidate."""
        if not self.best_candidate:
            return lambda t, ctx: (0.5, "No candidate generated")

        code = self.best_candidate.get('code', '')
        return lambda t, ctx: execute_reward_function(code, t, ctx)

    def run(self) -> ExperimentResult:
        """Run the experiment."""
        import random

        start_time = datetime.now()
        self._log("=" * 60)
        self._log(f"Experiment 3: {self.experiment_name}")
        self._log("=" * 60)

        # Initialize
        self._init_client()
        train_traces, val_traces, test_traces = self._split_traces()

        self._log(f"Train: {len(train_traces)}, Val: {len(val_traces)}, Test: {len(test_traces)}")

        # Sample traces for analysis
        random.seed(42)
        positives = [t for t in train_traces if t.rating == 'positive']
        negatives = [t for t in train_traces if t.rating == 'negative']

        sampled = (
            random.sample(positives, min(self.config.max_positive_examples, len(positives))) +
            random.sample(negatives, min(self.config.max_negative_examples, len(negatives)))
        )
        random.shuffle(sampled)

        self._log(f"Sampled {len(sampled)} traces for analysis")

        # Step 1: Analyze feedback patterns
        self._log("\n[1/4] Analyzing feedback patterns...")
        self.analysis = self._analyze_feedback_patterns(sampled)
        self._log(f"  Found {len(self.analysis.get('positive_patterns', []))} positive patterns")
        self._log(f"  Found {len(self.analysis.get('negative_patterns', []))} negative patterns")

        # Step 2: Generate and test candidates
        self._log("\n[2/4] Generating and testing candidates...")
        best_accuracy = 0.0

        for iteration in range(self.config.max_iterations):
            candidates = self._generate_candidates(
                self.analysis,
                self.config.candidates_per_iteration
            )

            if not candidates:
                self._log(f"  Iteration {iteration+1}: No valid candidates generated")
                continue

            for cand in candidates:
                code = cand.get('code', '')
                if not code:
                    continue

                accuracy, kappa = self._test_candidate(code, val_traces)
                self._log(f"  Iteration {iteration+1}: accuracy={accuracy:.1%}")

                if accuracy > best_accuracy:
                    best_accuracy = accuracy
                    self.best_candidate = cand

                    if accuracy >= self.config.target_accuracy:
                        self._log(f"  Target reached!")
                        break

            if best_accuracy >= self.config.target_accuracy:
                break

        # Step 3: Final validation evaluation
        self._log("\n[3/4] Final validation evaluation...")
        val_metrics = None
        if self.best_candidate:
            code = self.best_candidate['code']

            def eval_fn(trace_dict, ctx):
                return execute_reward_function(code, trace_dict, ctx)

            val_results = self.evaluate_traces(eval_fn, val_traces)
            val_metrics = self.compute_metrics(val_results)
            self._log(f"Validation Accuracy: {val_metrics.accuracy:.1%}")
            self._log(f"Validation F1: {val_metrics.f1_score:.3f}")

        # Step 4: Final test evaluation
        self._log("\n[4/4] Final test evaluation...")
        test_metrics = None
        test_results = []
        if self.best_candidate:
            code = self.best_candidate['code']

            def eval_fn(trace_dict, ctx):
                return execute_reward_function(code, trace_dict, ctx)

            test_results = self.evaluate_traces(eval_fn, test_traces)
            test_metrics = self.compute_metrics(test_results)

            self._log(f"\nTest Accuracy: {test_metrics.accuracy:.1%}")
            self._log(f"Test F1: {test_metrics.f1_score:.3f}")
            self._log(f"Test Cohen's Kappa: {test_metrics.cohen_kappa:.3f}")

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

    config = Exp3Config(model_key=args.model)
    experiment = Exp3LLMFriendly(config=config)
    result = experiment.run()

    if args.save:
        path = experiment.save_result(result)
        print(f"Saved to: {path}")

    return 0 if result.test_metrics and result.test_metrics.accuracy >= 0.8 else 1


if __name__ == "__main__":
    sys.exit(main())
