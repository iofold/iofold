"""
Result data models for iofold-eval-core.

These models represent evaluation results, clustering results,
and cross-validation outcomes.
"""

from dataclasses import dataclass, field
from typing import Optional, Any, Dict, List

# Make numpy optional - use Any for array types if not available
try:
    import numpy as np
    ArrayType = np.ndarray
except ImportError:
    ArrayType = Any  # type: ignore


@dataclass
class TestResult:
    """
    Result of testing a reward function against labeled traces.

    Previously named RewardTestResult in notebooks.
    """
    accuracy: float
    pearson_r: float
    cohen_kappa: float
    total: int
    correct: int
    incorrect: int
    errors: int
    predictions: List[Dict[str, Any]]
    f1_score: float = 0.0

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TestResult":
        """Create TestResult from a dictionary."""
        return cls(
            accuracy=float(data.get("accuracy", 0.0)),
            pearson_r=float(data.get("pearson_r", 0.0)),
            cohen_kappa=float(data.get("cohen_kappa", 0.0)),
            total=int(data.get("total", 0)),
            correct=int(data.get("correct", 0)),
            incorrect=int(data.get("incorrect", 0)),
            errors=int(data.get("errors", 0)),
            predictions=data.get("predictions", []),
            f1_score=float(data.get("f1_score", 0.0)),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert TestResult to dictionary."""
        return {
            "accuracy": self.accuracy,
            "pearson_r": self.pearson_r,
            "cohen_kappa": self.cohen_kappa,
            "total": self.total,
            "correct": self.correct,
            "incorrect": self.incorrect,
            "errors": self.errors,
            "predictions": self.predictions,
            "f1_score": self.f1_score,
        }

    @property
    def error_rate(self) -> float:
        """Calculate the error rate (execution errors / total)."""
        return self.errors / self.total if self.total > 0 else 0.0


@dataclass
class ClusterResult:
    """Result of clustering traces."""
    labels: Any  # np.ndarray when numpy available
    centroids: Any  # np.ndarray when numpy available
    strategy: str
    silhouette: float
    cluster_sizes: Dict[int, int]

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ClusterResult":
        """Create ClusterResult from a dictionary."""
        return cls(
            labels=data.get("labels", []),
            centroids=data.get("centroids", []),
            strategy=data.get("strategy", "unknown"),
            silhouette=float(data.get("silhouette", 0.0)),
            cluster_sizes=data.get("cluster_sizes", {}),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert ClusterResult to dictionary."""
        # Convert numpy arrays to lists if needed
        labels = self.labels
        centroids = self.centroids
        try:
            import numpy as np
            if isinstance(labels, np.ndarray):
                labels = labels.tolist()
            if isinstance(centroids, np.ndarray):
                centroids = centroids.tolist()
        except ImportError:
            pass

        return {
            "labels": labels,
            "centroids": centroids,
            "strategy": self.strategy,
            "silhouette": self.silhouette,
            "cluster_sizes": self.cluster_sizes,
        }

    @property
    def n_clusters(self) -> int:
        """Get the number of clusters."""
        return len(self.cluster_sizes)


@dataclass
class PairwiseComparison:
    """Result of comparing two traces."""
    trace_a_id: str
    trace_b_id: str
    winner: str  # 'a' | 'b' | 'tie'
    reasoning: str
    similarity: float

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PairwiseComparison":
        """Create PairwiseComparison from a dictionary."""
        return cls(
            trace_a_id=data["trace_a_id"],
            trace_b_id=data["trace_b_id"],
            winner=data.get("winner", "tie"),
            reasoning=data.get("reasoning", ""),
            similarity=float(data.get("similarity", 0.0)),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert PairwiseComparison to dictionary."""
        return {
            "trace_a_id": self.trace_a_id,
            "trace_b_id": self.trace_b_id,
            "winner": self.winner,
            "reasoning": self.reasoning,
            "similarity": self.similarity,
        }


@dataclass
class FoldResult:
    """Result of a single fold in cross-validation."""
    fold_index: int
    accuracy: float
    kappa: float
    f1: float
    train_size: int
    val_size: int

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "FoldResult":
        """Create FoldResult from a dictionary."""
        return cls(
            fold_index=int(data.get("fold_index", 0)),
            accuracy=float(data.get("accuracy", 0.0)),
            kappa=float(data.get("kappa", 0.0)),
            f1=float(data.get("f1", 0.0)),
            train_size=int(data.get("train_size", 0)),
            val_size=int(data.get("val_size", 0)),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert FoldResult to dictionary."""
        return {
            "fold_index": self.fold_index,
            "accuracy": self.accuracy,
            "kappa": self.kappa,
            "f1": self.f1,
            "train_size": self.train_size,
            "val_size": self.val_size,
        }


@dataclass
class CrossValidationResult:
    """
    Result of cross-validation for a reward function candidate.

    Aggregates metrics across multiple folds to assess stability.
    """
    candidate_id: str
    mean_accuracy: float
    mean_kappa: float
    mean_f1: float
    std_accuracy: float
    std_kappa: float
    is_stable: bool  # True if std_accuracy < threshold (e.g., 0.1)
    fold_results: List[FoldResult] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CrossValidationResult":
        """Create CrossValidationResult from a dictionary."""
        fold_results_data = data.get("fold_results", [])
        fold_results = [
            FoldResult.from_dict(fr) if isinstance(fr, dict) else fr
            for fr in fold_results_data
        ]

        return cls(
            candidate_id=data["candidate_id"],
            mean_accuracy=float(data.get("mean_accuracy", 0.0)),
            mean_kappa=float(data.get("mean_kappa", 0.0)),
            mean_f1=float(data.get("mean_f1", 0.0)),
            std_accuracy=float(data.get("std_accuracy", 0.0)),
            std_kappa=float(data.get("std_kappa", 0.0)),
            is_stable=bool(data.get("is_stable", False)),
            fold_results=fold_results,
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert CrossValidationResult to dictionary."""
        return {
            "candidate_id": self.candidate_id,
            "mean_accuracy": self.mean_accuracy,
            "mean_kappa": self.mean_kappa,
            "mean_f1": self.mean_f1,
            "std_accuracy": self.std_accuracy,
            "std_kappa": self.std_kappa,
            "is_stable": self.is_stable,
            "fold_results": [fr.to_dict() for fr in self.fold_results],
        }

    @property
    def n_folds(self) -> int:
        """Get the number of folds."""
        return len(self.fold_results)

    @classmethod
    def from_fold_results(
        cls,
        candidate_id: str,
        fold_results: List[FoldResult],
        stability_threshold: float = 0.1,
    ) -> "CrossValidationResult":
        """
        Create CrossValidationResult by computing aggregates from fold results.

        Args:
            candidate_id: Identifier for the candidate
            fold_results: List of individual fold results
            stability_threshold: Max std_accuracy for is_stable=True
        """
        if not fold_results:
            return cls(
                candidate_id=candidate_id,
                mean_accuracy=0.0,
                mean_kappa=0.0,
                mean_f1=0.0,
                std_accuracy=0.0,
                std_kappa=0.0,
                is_stable=False,
                fold_results=[],
            )

        accuracies = [fr.accuracy for fr in fold_results]
        kappas = [fr.kappa for fr in fold_results]
        f1s = [fr.f1 for fr in fold_results]

        # Compute mean and std
        mean_accuracy = sum(accuracies) / len(accuracies)
        mean_kappa = sum(kappas) / len(kappas)
        mean_f1 = sum(f1s) / len(f1s)

        # Standard deviation calculation
        if len(accuracies) > 1:
            variance_acc = sum((x - mean_accuracy) ** 2 for x in accuracies) / len(accuracies)
            variance_kappa = sum((x - mean_kappa) ** 2 for x in kappas) / len(kappas)
            std_accuracy = variance_acc ** 0.5
            std_kappa = variance_kappa ** 0.5
        else:
            std_accuracy = 0.0
            std_kappa = 0.0

        is_stable = std_accuracy < stability_threshold

        return cls(
            candidate_id=candidate_id,
            mean_accuracy=mean_accuracy,
            mean_kappa=mean_kappa,
            mean_f1=mean_f1,
            std_accuracy=std_accuracy,
            std_kappa=std_kappa,
            is_stable=is_stable,
            fold_results=fold_results,
        )
