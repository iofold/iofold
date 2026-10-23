"""
Base experiment runner class for eval/reward function experiments.

Provides infrastructure for:
- Loading traces from local D1 database
- Deterministic train/validation/test splits
- Metric tracking (accuracy, F1, precision, recall, latency, cost)
- Result persistence to JSON files
"""

import json
import os
import time
import sqlite3
from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import (
    Any,
    Callable,
    Dict,
    List,
    Literal,
    Optional,
    Tuple,
    Union,
)

from .config import (
    JOB_ID,
    TRAIN_RATIO,
    VALIDATION_RATIO,
    TEST_RATIO,
    get_split,
    CLASSIFICATION_THRESHOLD,
    RESULTS_DIR,
    CACHE_DIR,
)


# =============================================================================
# Type Definitions
# =============================================================================

SplitName = Literal["train", "validation", "test"]


@dataclass
class LabeledTrace:
    """A trace with its associated feedback label."""
    id: str
    trace_id: str
    steps: List[Dict[str, Any]]
    raw_data: Optional[Dict[str, Any]]
    metadata: Optional[Dict[str, Any]]
    input_preview: Optional[str]
    output_preview: Optional[str]
    step_count: int
    has_errors: bool
    source: str
    timestamp: str
    # Feedback fields
    rating: str  # 'positive', 'negative', 'neutral'
    rating_detail: Optional[str]
    human_score: float  # 0.0 (negative), 0.5 (neutral), 1.0 (positive)

    @classmethod
    def from_row(cls, row: Dict[str, Any]) -> "LabeledTrace":
        """Create LabeledTrace from database row."""
        # Parse JSON fields
        steps = row.get("steps", "[]")
        if isinstance(steps, str):
            steps = json.loads(steps) if steps else []

        raw_data = row.get("raw_data")
        if isinstance(raw_data, str) and raw_data:
            raw_data = json.loads(raw_data)

        metadata = row.get("metadata")
        if isinstance(metadata, str) and metadata:
            metadata = json.loads(metadata)

        # Map rating to human_score
        rating = row.get("rating", "neutral")
        human_score = {
            "positive": 1.0,
            "negative": 0.0,
            "neutral": 0.5,
        }.get(rating, 0.5)

        return cls(
            id=row["id"],
            trace_id=row.get("trace_id", row["id"]),
            steps=steps,
            raw_data=raw_data,
            metadata=metadata,
            input_preview=row.get("input_preview"),
            output_preview=row.get("output_preview"),
            step_count=row.get("step_count", 0),
            has_errors=bool(row.get("has_errors", False)),
            source=row.get("source", ""),
            timestamp=row.get("timestamp", ""),
            rating=rating,
            rating_detail=row.get("rating_detail"),
            human_score=human_score,
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for eval functions."""
        return {
            "id": self.id,
            "trace_id": self.trace_id,
            "steps": self.steps,
            "raw_data": self.raw_data,
            "metadata": self.metadata,
            "input_preview": self.input_preview,
            "output_preview": self.output_preview,
            "step_count": self.step_count,
            "has_errors": self.has_errors,
            "source": self.source,
            "timestamp": self.timestamp,
        }


@dataclass
class EvalResult:
    """Result from running an eval function on a trace."""
    trace_id: str
    predicted_score: float
    predicted_label: str  # 'positive', 'negative', 'neutral'
    human_score: float
    human_label: str
    correct: bool
    reasoning: Optional[str] = None
    latency_ms: float = 0.0
    cost_usd: float = 0.0
    error: Optional[str] = None


@dataclass
class MetricsResult:
    """Aggregated metrics from an evaluation run."""
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    cohen_kappa: float
    true_positives: int
    true_negatives: int
    false_positives: int
    false_negatives: int
    total_traces: int
    avg_latency_ms: float
    total_cost_usd: float
    errors: int

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return asdict(self)


@dataclass
class ExperimentResult:
    """Full result from an experiment run."""
    experiment_id: str
    experiment_name: str
    model: str
    started_at: str
    completed_at: str
    duration_seconds: float

    # Split metrics
    train_metrics: Optional[MetricsResult] = None
    validation_metrics: Optional[MetricsResult] = None
    test_metrics: Optional[MetricsResult] = None

    # Per-trace results (optional, can be large)
    train_results: Optional[List[EvalResult]] = None
    validation_results: Optional[List[EvalResult]] = None
    test_results: Optional[List[EvalResult]] = None

    # Generated eval code
    eval_code: Optional[str] = None

    # Additional metadata
    config: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result = {
            "experiment_id": self.experiment_id,
            "experiment_name": self.experiment_name,
            "model": self.model,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "duration_seconds": self.duration_seconds,
            "eval_code": self.eval_code,
            "config": self.config,
            "notes": self.notes,
        }

        if self.train_metrics:
            result["train_metrics"] = self.train_metrics.to_dict()
        if self.validation_metrics:
            result["validation_metrics"] = self.validation_metrics.to_dict()
        if self.test_metrics:
            result["test_metrics"] = self.test_metrics.to_dict()

        # Include per-trace results if present
        if self.train_results:
            result["train_results"] = [asdict(r) for r in self.train_results]
        if self.validation_results:
            result["validation_results"] = [asdict(r) for r in self.validation_results]
        if self.test_results:
            result["test_results"] = [asdict(r) for r in self.test_results]

        return result


# =============================================================================
# Database Utilities
# =============================================================================

def _get_project_root() -> Path:
    """Get the project root directory."""
    # This file is at notebooks/experiments/eval_reward_functions/experiment_base.py
    current_file = Path(__file__).resolve()
    notebooks_dir = current_file.parent.parent.parent  # Up 3 levels to notebooks/
    return notebooks_dir.parent  # Up to project root


def _get_db_path() -> Path:
    """
    Get the path to the D1 SQLite database.

    Uses the same pattern as db_utils.py:
    1. Check IOFOLD_D1_DB_PATH env var
    2. Fall back to notebooks/data/iofold_d1_main.sqlite
    """
    env_path = os.getenv("IOFOLD_D1_DB_PATH")
    if env_path:
        path = Path(env_path).expanduser()
        if path.exists():
            return path
        raise FileNotFoundError(f"IOFOLD_D1_DB_PATH points to missing file: {path}")

    project_root = _get_project_root()
    default_path = project_root / "notebooks" / "data" / "iofold_d1_main.sqlite"

    if default_path.exists():
        return default_path

    raise FileNotFoundError(
        f"Missing D1 snapshot.\n"
        f"- Expected: {default_path}\n"
        f"- Or set: IOFOLD_D1_DB_PATH=/path/to/*.sqlite\n\n"
        "To create/update the snapshot from Docker, run:\n"
        "  ./scripts/snapshot-d1-to-notebooks-data.sh"
    )


def _get_connection(readonly: bool = True) -> sqlite3.Connection:
    """Get a connection to the local D1 database."""
    db_path = _get_db_path()

    if readonly:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    else:
        conn = sqlite3.connect(db_path)

    conn.row_factory = sqlite3.Row
    return conn


# =============================================================================
# Metrics Calculation
# =============================================================================

def _calculate_metrics(results: List[EvalResult]) -> MetricsResult:
    """Calculate aggregated metrics from eval results."""
    if not results:
        return MetricsResult(
            accuracy=0.0,
            precision=0.0,
            recall=0.0,
            f1_score=0.0,
            cohen_kappa=0.0,
            true_positives=0,
            true_negatives=0,
            false_positives=0,
            false_negatives=0,
            total_traces=0,
            avg_latency_ms=0.0,
            total_cost_usd=0.0,
            errors=0,
        )

    # Count confusion matrix values
    tp = sum(1 for r in results if r.predicted_label == "positive" and r.human_label == "positive")
    tn = sum(1 for r in results if r.predicted_label == "negative" and r.human_label == "negative")
    fp = sum(1 for r in results if r.predicted_label == "positive" and r.human_label == "negative")
    fn = sum(1 for r in results if r.predicted_label == "negative" and r.human_label == "positive")

    total = len(results)
    errors = sum(1 for r in results if r.error is not None)

    # Calculate metrics (with safe division)
    accuracy = (tp + tn) / total if total > 0 else 0.0
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

    # Cohen's Kappa
    # p_o = observed agreement, p_e = expected agreement by chance
    p_o = accuracy
    p_yes = ((tp + fp) / total) * ((tp + fn) / total) if total > 0 else 0.0
    p_no = ((tn + fn) / total) * ((tn + fp) / total) if total > 0 else 0.0
    p_e = p_yes + p_no
    kappa = (p_o - p_e) / (1 - p_e) if (1 - p_e) > 0 else 0.0

    # Latency and cost
    latencies = [r.latency_ms for r in results if r.latency_ms > 0]
    avg_latency = sum(latencies) / len(latencies) if latencies else 0.0
    total_cost = sum(r.cost_usd for r in results)

    return MetricsResult(
        accuracy=accuracy,
        precision=precision,
        recall=recall,
        f1_score=f1,
        cohen_kappa=kappa,
        true_positives=tp,
        true_negatives=tn,
        false_positives=fp,
        false_negatives=fn,
        total_traces=total,
        avg_latency_ms=avg_latency,
        total_cost_usd=total_cost,
        errors=errors,
    )


def _score_to_label(score: float, threshold: float = CLASSIFICATION_THRESHOLD) -> str:
    """Convert a score to a label."""
    if score >= threshold:
        return "positive"
    else:
        return "negative"


# =============================================================================
# Experiment Base Class
# =============================================================================

class ExperimentRunner(ABC):
    """
    Base class for eval/reward function experiments.

    Provides infrastructure for:
    - Loading traces from local D1 database
    - Deterministic train/validation/test splits
    - Metric tracking
    - Result persistence

    Subclasses must implement:
    - run(): Execute the experiment
    - _create_eval_function(): Create the eval function to test
    """

    def __init__(
        self,
        experiment_id: str,
        experiment_name: str,
        job_id: str = JOB_ID,
        model: str = "gemini-2.5-flash",
        verbose: bool = True,
    ):
        """
        Initialize the experiment runner.

        Args:
            experiment_id: Unique identifier for this experiment
            experiment_name: Human-readable name
            job_id: ID of the job containing traces to evaluate
            model: Model to use for evaluation
            verbose: Whether to print progress
        """
        self.experiment_id = experiment_id
        self.experiment_name = experiment_name
        self.job_id = job_id
        self.model = model
        self.verbose = verbose

        # Cache for loaded traces
        self._traces_cache: Optional[List[LabeledTrace]] = None
        self._train_traces: Optional[List[LabeledTrace]] = None
        self._validation_traces: Optional[List[LabeledTrace]] = None
        self._test_traces: Optional[List[LabeledTrace]] = None

        # Results directory
        self._results_dir = self._get_results_dir()
        self._results_dir.mkdir(parents=True, exist_ok=True)

    def _get_results_dir(self) -> Path:
        """Get the results directory for this experiment."""
        project_root = _get_project_root()
        return project_root / "notebooks" / RESULTS_DIR

    def _log(self, message: str) -> None:
        """Print a log message if verbose mode is enabled."""
        if self.verbose:
            timestamp = datetime.now().strftime("%H:%M:%S")
            print(f"[{timestamp}] {message}")

    # =========================================================================
    # Trace Loading
    # =========================================================================

    def _load_traces(self) -> List[LabeledTrace]:
        """
        Load all traces with feedback for the specified job.

        Returns:
            List of LabeledTrace objects
        """
        if self._traces_cache is not None:
            return self._traces_cache

        self._log(f"Loading traces for job {self.job_id}...")

        conn = _get_connection()
        try:
            cursor = conn.execute(
                """
                SELECT
                    t.*,
                    f.rating,
                    f.rating_detail
                FROM traces t
                INNER JOIN feedback f ON f.trace_id = t.id
                WHERE json_extract(t.metadata, '$.jobId') = ?
                   OR json_extract(t.metadata, '$.job_id') = ?
                ORDER BY t.imported_at
                """,
                (self.job_id, self.job_id),
            )
            rows = cursor.fetchall()

            # If no results with jobId in metadata, try broader search
            if not rows:
                self._log("No traces found with jobId in metadata, trying alternative search...")
                cursor = conn.execute(
                    """
                    SELECT
                        t.*,
                        f.rating,
                        f.rating_detail
                    FROM traces t
                    INNER JOIN feedback f ON f.trace_id = t.id
                    WHERE t.metadata LIKE ?
                    ORDER BY t.imported_at
                    """,
                    (f'%{self.job_id}%',),
                )
                rows = cursor.fetchall()

            traces = [LabeledTrace.from_row(dict(row)) for row in rows]
            self._traces_cache = traces
            self._log(f"Loaded {len(traces)} traces with feedback")

            return traces

        finally:
            conn.close()

    def _split_traces(self) -> Tuple[List[LabeledTrace], List[LabeledTrace], List[LabeledTrace]]:
        """
        Split traces into train/validation/test sets using deterministic hashing.

        Returns:
            Tuple of (train_traces, validation_traces, test_traces)
        """
        traces = self._load_traces()

        if self._train_traces is None:
            train = []
            validation = []
            test = []

            for trace in traces:
                split = get_split(trace.id)
                if split == "train":
                    train.append(trace)
                elif split == "validation":
                    validation.append(trace)
                else:  # test
                    test.append(trace)

            self._train_traces = train
            self._validation_traces = validation
            self._test_traces = test

            self._log(f"Split: train={len(train)}, validation={len(validation)}, test={len(test)}")

        return self._train_traces, self._validation_traces, self._test_traces

    def get_train_traces(self) -> List[LabeledTrace]:
        """Get training traces."""
        train, _, _ = self._split_traces()
        return train

    def get_validation_traces(self) -> List[LabeledTrace]:
        """Get validation traces."""
        _, validation, _ = self._split_traces()
        return validation

    def get_test_traces(self) -> List[LabeledTrace]:
        """
        Get test traces.

        WARNING: Only use for final evaluation! These should not be seen
        during experiment development.
        """
        _, _, test = self._split_traces()
        return test

    def get_split_statistics(self) -> Dict[str, Dict[str, Any]]:
        """Get statistics about the data splits."""
        train, validation, test = self._split_traces()

        def compute_stats(traces: List[LabeledTrace]) -> Dict[str, Any]:
            if not traces:
                return {"count": 0, "positive": 0, "negative": 0, "neutral": 0}

            return {
                "count": len(traces),
                "positive": sum(1 for t in traces if t.rating == "positive"),
                "negative": sum(1 for t in traces if t.rating == "negative"),
                "neutral": sum(1 for t in traces if t.rating == "neutral"),
                "positive_ratio": sum(1 for t in traces if t.rating == "positive") / len(traces),
            }

        return {
            "train": compute_stats(train),
            "validation": compute_stats(validation),
            "test": compute_stats(test),
            "total": compute_stats(train + validation + test),
        }

    # =========================================================================
    # Evaluation
    # =========================================================================

    def evaluate_traces(
        self,
        eval_fn: Callable[[Dict[str, Any], Optional[Any]], Tuple[float, str]],
        traces: List[LabeledTrace],
        ctx: Optional[Any] = None,
    ) -> List[EvalResult]:
        """
        Run an eval function on a list of traces.

        Args:
            eval_fn: Function that takes (trace_dict, ctx) and returns (score, reasoning)
            traces: List of traces to evaluate
            ctx: Optional context object for the eval function

        Returns:
            List of EvalResult objects
        """
        results = []

        for trace in traces:
            trace_dict = trace.to_dict()

            start_time = time.time()
            error = None
            score = 0.5
            reasoning = None

            try:
                score, reasoning = eval_fn(trace_dict, ctx)
            except Exception as e:
                error = str(e)
                score = 0.5  # Neutral on error

            latency_ms = (time.time() - start_time) * 1000

            predicted_label = _score_to_label(score)
            human_label = _score_to_label(trace.human_score)

            results.append(
                EvalResult(
                    trace_id=trace.id,
                    predicted_score=score,
                    predicted_label=predicted_label,
                    human_score=trace.human_score,
                    human_label=human_label,
                    correct=(predicted_label == human_label),
                    reasoning=reasoning,
                    latency_ms=latency_ms,
                    cost_usd=0.0,  # Subclasses can override to track costs
                    error=error,
                )
            )

        return results

    def compute_metrics(self, results: List[EvalResult]) -> MetricsResult:
        """Compute aggregated metrics from eval results."""
        return _calculate_metrics(results)

    # =========================================================================
    # Result Persistence
    # =========================================================================

    def save_result(self, result: ExperimentResult) -> Path:
        """
        Save experiment result to a JSON file.

        Args:
            result: ExperimentResult to save

        Returns:
            Path to the saved file
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{self.experiment_id}_{timestamp}.json"
        filepath = self._results_dir / filename

        with open(filepath, "w") as f:
            json.dump(result.to_dict(), f, indent=2, default=str)

        self._log(f"Saved result to {filepath}")
        return filepath

    def load_latest_result(self) -> Optional[ExperimentResult]:
        """
        Load the most recent result for this experiment.

        Returns:
            ExperimentResult or None if no results exist
        """
        pattern = f"{self.experiment_id}_*.json"
        files = sorted(self._results_dir.glob(pattern), reverse=True)

        if not files:
            return None

        with open(files[0], "r") as f:
            data = json.load(f)

        # Reconstruct ExperimentResult (simplified, doesn't reconstruct all nested objects)
        return ExperimentResult(
            experiment_id=data["experiment_id"],
            experiment_name=data["experiment_name"],
            model=data["model"],
            started_at=data["started_at"],
            completed_at=data["completed_at"],
            duration_seconds=data["duration_seconds"],
            eval_code=data.get("eval_code"),
            config=data.get("config"),
            notes=data.get("notes"),
        )

    # =========================================================================
    # Abstract Methods
    # =========================================================================

    @abstractmethod
    def run(self) -> ExperimentResult:
        """
        Execute the experiment.

        Returns:
            ExperimentResult with all metrics and results
        """
        pass

    @abstractmethod
    def _create_eval_function(self) -> Callable[[Dict[str, Any], Optional[Any]], Tuple[float, str]]:
        """
        Create the eval function to test.

        Returns:
            Function that takes (trace_dict, ctx) and returns (score, reasoning)
        """
        pass


# =============================================================================
# Utility Functions
# =============================================================================

def load_traces_for_job(job_id: str = JOB_ID) -> List[LabeledTrace]:
    """
    Convenience function to load traces for a job.

    Args:
        job_id: ID of the job containing traces

    Returns:
        List of LabeledTrace objects
    """
    runner = _TraceLoader(job_id)
    return runner._load_traces()


def get_train_validation_test_split(
    job_id: str = JOB_ID
) -> Tuple[List[LabeledTrace], List[LabeledTrace], List[LabeledTrace]]:
    """
    Convenience function to get train/validation/test splits.

    Args:
        job_id: ID of the job containing traces

    Returns:
        Tuple of (train_traces, validation_traces, test_traces)
    """
    runner = _TraceLoader(job_id)
    return runner._split_traces()


class _TraceLoader(ExperimentRunner):
    """Internal class for using ExperimentRunner's trace loading."""

    def __init__(self, job_id: str):
        super().__init__(
            experiment_id="_loader",
            experiment_name="Trace Loader",
            job_id=job_id,
            verbose=False,
        )

    def run(self) -> ExperimentResult:
        raise NotImplementedError("This is a utility class")

    def _create_eval_function(self):
        raise NotImplementedError("This is a utility class")
