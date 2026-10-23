#!/usr/bin/env python3
"""
Experiment 1: Single-Shot LLM Eval Generation Baseline

Hypothesis: A well-prompted LLM can generate a reasonable eval function in one shot.

Approach:
1. Load 10 positive + 10 negative examples from training set
2. Create a prompt with these examples asking LLM to generate an eval function
3. Call Cloudflare AI Gateway with gemini-2.5-flash
4. Parse the generated eval function code
5. Test it on validation set
6. Report accuracy metrics

Success Criteria: >70% accuracy on validation set
"""

import json
import os
import re
import random
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

# Add notebooks dir to path for local imports
NOTEBOOKS_DIR = Path(__file__).parent.parent.parent
sys.path.insert(0, str(NOTEBOOKS_DIR))

# Load environment variables from project root .env
from dotenv import load_dotenv
PROJECT_ROOT = NOTEBOOKS_DIR.parent
load_dotenv(PROJECT_ROOT / ".env")

from openai import OpenAI

# Use the experiment infrastructure
from experiments.eval_reward_functions.experiment_base import (
    ExperimentRunner,
    ExperimentResult,
    EvalResult,
    MetricsResult,
    LabeledTrace,
    load_traces_for_job,
    get_train_validation_test_split,
)
from experiments.eval_reward_functions.config import (
    JOB_ID,
    MODELS,
    DEFAULT_MODEL,
    CLASSIFICATION_THRESHOLD,
    EXPERIMENT_IDS,
)

# Import from iofold_eval_core for sandbox execution
from iofold_eval_core import (
    execute_reward_function,
)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass
class SingleShotConfig:
    """Configuration for single-shot experiment."""
    # Number of examples per class for prompt
    examples_per_class: int = 10

    # Model settings
    model_key: str = DEFAULT_MODEL
    temperature: float = 0.3
    max_tokens: int = 4096

    # Random seed for reproducible sampling
    seed: int = 42

    # Validation settings
    skip_neutral: bool = True  # Skip neutral traces in binary classification


# ---------------------------------------------------------------------------
# Cloudflare AI Gateway Client
# ---------------------------------------------------------------------------

def create_cf_client() -> OpenAI:
    """Create OpenAI client configured for Cloudflare AI Gateway."""
    account_id = os.environ.get("CF_ACCOUNT_ID", "b26e4af8b7631a2c8d99476fd7bce974")
    gateway_id = os.environ.get("CF_GATEWAY_ID", "iofold-ai-gw")
    api_key = os.environ.get("CF_AI_GATEWAY_TOKEN") or os.environ.get("OPENAI_API_KEY")

    if not api_key:
        raise ValueError(
            "No API key found. Set CF_AI_GATEWAY_TOKEN or OPENAI_API_KEY environment variable."
        )

    base_url = f"https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/compat"

    return OpenAI(api_key=api_key, base_url=base_url)


def llm_generate(
    client: OpenAI,
    prompt: str,
    model: str,
    temperature: float = 0.3,
    max_tokens: int = 4096
) -> str:
    """Generate text using Cloudflare AI Gateway.

    Handles provider-specific parameter differences:
    - OpenAI: max_completion_tokens (not max_tokens)
    - Anthropic: max_tokens (required)
    - Google: max_tokens works via gateway
    """
    # Determine provider from model string (format: provider/model-id)
    provider = model.split("/")[0] if "/" in model else "openai"

    # Build request parameters based on provider
    params = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": temperature,
    }

    if provider == "openai":
        # OpenAI uses max_completion_tokens
        params["max_completion_tokens"] = max_tokens
    else:
        # Anthropic and Google use max_tokens
        params["max_tokens"] = max_tokens

    response = client.chat.completions.create(**params)
    return response.choices[0].message.content or ""


# ---------------------------------------------------------------------------
# Prompt Construction
# ---------------------------------------------------------------------------

def format_example(trace: LabeledTrace, include_label: bool = True) -> str:
    """Format a single trace example for the prompt."""
    # Get expected output from metadata
    expected = ""
    if trace.metadata:
        expected = trace.metadata.get("expectedOutput", "")[:300]

    actual = (trace.output_preview or "")[:300]
    has_errors = trace.has_errors
    step_count = trace.step_count
    rating = trace.rating
    rating_detail = (trace.rating_detail or "")[:200]

    example = f"""
--- Example ---
Expected Output: {expected}
Agent Output: {actual}
Has Errors: {has_errors}
Step Count: {step_count}"""

    if include_label:
        example += f"""
Human Rating: {rating}
Human Reasoning: {rating_detail}"""

    return example


def create_generation_prompt(
    positive_examples: List[LabeledTrace],
    negative_examples: List[LabeledTrace]
) -> str:
    """Create the prompt for generating an eval function."""

    # Format positive examples
    positive_section = "\n".join([
        format_example(ex) for ex in positive_examples
    ])

    # Format negative examples
    negative_section = "\n".join([
        format_example(ex) for ex in negative_examples
    ])

    prompt = f"""You are an expert at creating evaluation functions for AI agents.

I have traces from an email search agent that retrieves emails and answers questions.
Each trace has:
- expected_output: The ground truth answer (from metadata.expectedOutput)
- output_preview: What the agent actually answered
- has_errors: Whether there were execution errors
- step_count: Number of steps the agent took
- metadata: Contains expectedOutput and other context

Human reviewers rated each trace as positive, neutral, or negative.

## POSITIVE EXAMPLES (rated as good by humans):
{positive_section}

## NEGATIVE EXAMPLES (rated as bad by humans):
{negative_section}

## YOUR TASK

Write a Python function called `eval_function` that predicts whether a trace should be rated positively or negatively.

**Function signature:** `def eval_function(trace: dict, expected_output: str) -> tuple[float, str]`

The function receives:
- `trace`: Dict with keys: output_preview (str), has_errors (bool), step_count (int), steps (list), metadata (dict)
- `expected_output`: The ground truth answer string

The function returns a tuple of (score, explanation) where score is 0.0-1.0 (0=negative, 1=positive).

## GUIDELINES

1. Score >= 0.5 means positive, < 0.5 means negative
2. Compare agent output to expected output (semantic similarity matters more than exact match)
3. Consider error flags and excessive step counts as negative signals
4. Focus on answer correctness as the primary signal
5. Keep the function simple and interpretable
6. Use only standard Python (re, json, difflib allowed)
7. Do NOT use external APIs or LLM calls in the eval function

## RESPONSE FORMAT

Return ONLY the Python code, wrapped in ```python ... ``` markers.
Include helpful comments explaining your logic.
"""

    return prompt


# ---------------------------------------------------------------------------
# Code Parsing
# ---------------------------------------------------------------------------

def parse_eval_code(response: str) -> str:
    """
    Extract Python code from LLM response.

    Handles:
    - Code in ```python ... ``` blocks
    - Code in ``` ... ``` blocks
    - Raw code without markers
    """
    # Try to find ```python ... ``` block
    python_match = re.search(r'```python\s*(.*?)\s*```', response, re.DOTALL)
    if python_match:
        return python_match.group(1).strip()

    # Try to find ``` ... ``` block
    code_match = re.search(r'```\s*(.*?)\s*```', response, re.DOTALL)
    if code_match:
        return code_match.group(1).strip()

    # Try to find def eval_function or def eval_
    func_match = re.search(r'(def eval_\w+.*)', response, re.DOTALL)
    if func_match:
        return func_match.group(1).strip()

    # Return the whole response as a fallback
    return response.strip()


def wrap_eval_code_for_executor(code: str) -> str:
    """
    Wrap the eval function code to match the expected executor interface.

    The executor expects a function named eval_* that takes (trace, ctx=None).
    Our generated function takes (trace, expected_output).
    This wrapper bridges the gap by renaming the internal function.
    """
    # Check if we need to wrap
    if "def eval_function" in code:
        # Rename only the definition, not the function calls
        # Use regex for more precise replacement
        import re
        code_renamed = re.sub(r'\bdef eval_function\b', 'def _generated_eval', code)
        # Also rename any recursive calls
        code_renamed = re.sub(r'\beval_function\s*\(', '_generated_eval(', code_renamed)

        wrapped = f"""{code_renamed}

def eval_trace(trace, ctx=None):
    \"\"\"Wrapper for executor compatibility.\"\"\"
    # Extract expected_output from trace metadata
    metadata = trace.get('metadata', {{}})
    if isinstance(metadata, str):
        import json
        metadata = json.loads(metadata) if metadata else {{}}
    expected_output = metadata.get('expectedOutput', '')

    # Handle None values gracefully
    output_preview = trace.get('output_preview') or ''
    expected_output = expected_output or ''

    # Create a copy of trace with guaranteed string output
    trace_copy = dict(trace)
    trace_copy['output_preview'] = output_preview

    return _generated_eval(trace_copy, expected_output)
"""
        return wrapped

    # If it's already named eval_*, use as-is
    return code


# ---------------------------------------------------------------------------
# Single-Shot Experiment Runner
# ---------------------------------------------------------------------------

class SingleShotExperiment(ExperimentRunner):
    """
    Experiment 1: Single-Shot LLM Eval Generation.

    Generates an eval function from a small set of examples in a single LLM call,
    then tests it on the validation set.
    """

    def __init__(
        self,
        config: Optional[SingleShotConfig] = None,
        verbose: bool = True,
    ):
        """
        Initialize the single-shot experiment.

        Args:
            config: Experiment configuration (uses defaults if None)
            verbose: Whether to print progress
        """
        super().__init__(
            experiment_id=EXPERIMENT_IDS["exp1_baseline_single_shot"],
            experiment_name="Single-Shot LLM Eval Generation",
            job_id=JOB_ID,
            model=config.model_key if config else DEFAULT_MODEL,
            verbose=verbose,
        )

        self.config = config or SingleShotConfig()
        self.generated_code: Optional[str] = None
        self._llm_client: Optional[OpenAI] = None

    def _get_model_gateway_id(self) -> str:
        """Get the full model ID for the AI Gateway."""
        model_config = MODELS.get(self.config.model_key)
        if model_config:
            return model_config.gateway_model_id
        # Fallback to raw model key
        return f"google-ai-studio/{self.config.model_key}"

    def _sample_examples(
        self,
        traces: List[LabeledTrace],
        n: int,
        rating: str,
        seed: int
    ) -> List[LabeledTrace]:
        """Sample n traces with a specific rating."""
        matching = [t for t in traces if t.rating == rating]

        if len(matching) < n:
            self._log(f"Warning: Only {len(matching)} {rating} traces available (need {n})")
            n = len(matching)

        random.seed(seed)
        return random.sample(matching, n)

    def run(self) -> ExperimentResult:
        """
        Execute the single-shot experiment.

        Steps:
        1. Load traces and split
        2. Sample examples from training set
        3. Generate eval function via LLM
        4. Parse generated code
        5. Test on validation set
        6. Report metrics
        """
        started_at = datetime.now()

        self._log("=" * 60)
        self._log("Experiment 1: Single-Shot LLM Eval Generation")
        self._log("=" * 60)
        self._log(f"Model: {self.config.model_key}")
        self._log(f"Examples per class: {self.config.examples_per_class}")

        # Step 1: Load and split data
        self._log("\n[1/6] Loading and splitting traces...")
        train_traces = self.get_train_traces()
        val_traces = self.get_validation_traces()

        stats = self.get_split_statistics()
        self._log(f"  Train: {stats['train']['count']} ({stats['train']['positive']} pos, {stats['train']['negative']} neg)")
        self._log(f"  Val: {stats['validation']['count']} ({stats['validation']['positive']} pos, {stats['validation']['negative']} neg)")

        # Step 2: Sample examples
        self._log(f"\n[2/6] Sampling {self.config.examples_per_class} examples per class...")
        positive_examples = self._sample_examples(
            train_traces, self.config.examples_per_class, "positive", self.config.seed
        )
        negative_examples = self._sample_examples(
            train_traces, self.config.examples_per_class, "negative", self.config.seed + 1
        )
        self._log(f"  Sampled {len(positive_examples)} positive, {len(negative_examples)} negative")

        # Check we have enough
        if len(positive_examples) < self.config.examples_per_class or \
           len(negative_examples) < self.config.examples_per_class:
            return ExperimentResult(
                experiment_id=self.experiment_id,
                experiment_name=self.experiment_name,
                model=self.config.model_key,
                started_at=started_at.isoformat(),
                completed_at=datetime.now().isoformat(),
                duration_seconds=(datetime.now() - started_at).total_seconds(),
                notes="Error: Not enough training examples",
            )

        # Step 3: Generate eval function
        self._log(f"\n[3/6] Generating eval function with {self.config.model_key}...")
        prompt = create_generation_prompt(positive_examples, negative_examples)
        self._log(f"  Prompt length: {len(prompt)} chars")

        try:
            self._llm_client = create_cf_client()
            model_id = self._get_model_gateway_id()
            response = llm_generate(
                self._llm_client,
                prompt,
                model=model_id,
                temperature=self.config.temperature,
                max_tokens=self.config.max_tokens,
            )
            self._log(f"  Response length: {len(response)} chars")

        except Exception as e:
            self._log(f"  Error: {e}")
            return ExperimentResult(
                experiment_id=self.experiment_id,
                experiment_name=self.experiment_name,
                model=self.config.model_key,
                started_at=started_at.isoformat(),
                completed_at=datetime.now().isoformat(),
                duration_seconds=(datetime.now() - started_at).total_seconds(),
                notes=f"Error: LLM generation failed - {e}",
            )

        # Step 4: Parse code
        self._log("\n[4/6] Parsing generated code...")
        self.generated_code = parse_eval_code(response)
        self._log(f"  Extracted {len(self.generated_code)} chars of Python code")

        if self.verbose:
            self._log("\n--- Generated Code Preview ---")
            preview = self.generated_code[:1000]
            print(preview)
            if len(self.generated_code) > 1000:
                print("... (truncated)")
            self._log("--- End Preview ---")

        # Step 5: Test on validation set
        self._log("\n[5/6] Evaluating on validation set...")
        eval_fn = self._create_eval_function()
        val_results = self.evaluate_traces(eval_fn, val_traces)

        # Step 6: Compute metrics
        self._log("\n[6/6] Computing metrics...")
        val_metrics = self.compute_metrics(val_results)

        # Print results
        self._log("\n" + "=" * 60)
        self._log("RESULTS")
        self._log("=" * 60)
        self._log(f"\nValidation Set Metrics (n={val_metrics.total_traces}):")
        self._log(f"  Accuracy:     {val_metrics.accuracy:.3f}")
        self._log(f"  Precision:    {val_metrics.precision:.3f}")
        self._log(f"  Recall:       {val_metrics.recall:.3f}")
        self._log(f"  F1 Score:     {val_metrics.f1_score:.3f}")
        self._log(f"  Cohen's Kappa: {val_metrics.cohen_kappa:.3f}")

        self._log(f"\nConfusion Matrix:")
        self._log(f"                  Predicted")
        self._log(f"                  Neg   Pos")
        self._log(f"  Actual Neg      {val_metrics.true_negatives:4d}  {val_metrics.false_positives:4d}")
        self._log(f"  Actual Pos      {val_metrics.false_negatives:4d}  {val_metrics.true_positives:4d}")

        if val_metrics.errors > 0:
            self._log(f"\nExecution errors: {val_metrics.errors}/{val_metrics.total_traces}")

        # Success criteria check
        success = val_metrics.accuracy >= 0.70
        self._log(f"\n{'SUCCESS' if success else 'BELOW TARGET'}: "
                  f"Accuracy {val_metrics.accuracy:.1%} vs target 70%")

        # Create result
        completed_at = datetime.now()
        result = ExperimentResult(
            experiment_id=self.experiment_id,
            experiment_name=self.experiment_name,
            model=self.config.model_key,
            started_at=started_at.isoformat(),
            completed_at=completed_at.isoformat(),
            duration_seconds=(completed_at - started_at).total_seconds(),
            validation_metrics=val_metrics,
            validation_results=val_results,
            eval_code=self.generated_code,
            config={
                "examples_per_class": self.config.examples_per_class,
                "temperature": self.config.temperature,
                "max_tokens": self.config.max_tokens,
                "seed": self.config.seed,
                "skip_neutral": self.config.skip_neutral,
            },
            notes=f"Success: {success}, Target: 70% accuracy",
        )

        return result

    def _create_eval_function(self) -> Callable[[Dict[str, Any], Optional[Any]], Tuple[float, str]]:
        """
        Create the eval function from generated code.

        Returns a function that uses the sandbox executor to run the generated code.
        """
        if not self.generated_code:
            raise ValueError("No generated code available. Run the experiment first.")

        wrapped_code = wrap_eval_code_for_executor(self.generated_code)

        def eval_fn(trace: Dict[str, Any], ctx: Optional[Any] = None) -> Tuple[float, str]:
            """Execute the generated eval function."""
            try:
                score, reasoning = execute_reward_function(wrapped_code, trace, ctx)
                return score, reasoning
            except Exception as e:
                # Return neutral score on error
                return 0.5, f"Error: {e}"

        return eval_fn

    def evaluate_traces(
        self,
        eval_fn: Callable[[Dict[str, Any], Optional[Any]], Tuple[float, str]],
        traces: List[LabeledTrace],
        ctx: Optional[Any] = None,
    ) -> List[EvalResult]:
        """
        Run an eval function on traces, optionally filtering neutral traces.

        Overrides base class to support skip_neutral option.
        """
        # Filter traces if needed
        if self.config.skip_neutral:
            traces = [t for t in traces if t.rating != "neutral"]

        return super().evaluate_traces(eval_fn, traces, ctx)


# ---------------------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------------------

def main():
    """Main entry point for CLI execution."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Experiment 1: Single-Shot LLM Eval Generation"
    )
    parser.add_argument(
        "--examples",
        type=int,
        default=10,
        help="Number of examples per class (default: 10)"
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"Model to use for generation (default: {DEFAULT_MODEL})"
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.3,
        help="Generation temperature (default: 0.3)"
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for sampling (default: 42)"
    )
    parser.add_argument(
        "--save",
        action="store_true",
        help="Save results to JSON file"
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress verbose output"
    )

    args = parser.parse_args()

    # Create config
    config = SingleShotConfig(
        examples_per_class=args.examples,
        model_key=args.model,
        temperature=args.temperature,
        seed=args.seed,
    )

    # Run experiment
    experiment = SingleShotExperiment(config=config, verbose=not args.quiet)
    result = experiment.run()

    # Save results if requested
    if args.save:
        filepath = experiment.save_result(result)
        if not args.quiet:
            print(f"\nResults saved to: {filepath}")

    # Return exit code based on success criteria
    if result.validation_metrics:
        return 0 if result.validation_metrics.accuracy >= 0.70 else 1
    return 1


if __name__ == "__main__":
    sys.exit(main())
