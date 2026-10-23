"""
Deep agent for iterative reward function generation.

Orchestrates pattern analysis, clustering, candidate generation, and testing
to iteratively improve reward function quality through multiple iterations.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Protocol, Union

from ..models import LabeledTrace, RewardCandidate
from .pattern_analyzer import PatternAnalyzer
from .candidate_generator import CandidateGenerator
from .prompts import (
    TRAINING_SUMMARY_PROMPT,
    format_trace_for_prompt,
    format_candidates_for_prompt,
)

logger = logging.getLogger(__name__)


class LLMClientProtocol(Protocol):
    """Protocol for LLM clients."""

    def generate(
        self, prompt: str, temperature: float = 0.3, max_tokens: int = 4096
    ) -> str:
        ...


class EmbeddingClientProtocol(Protocol):
    """Protocol for embedding clients."""

    def embed(self, texts: List[str]) -> List[List[float]]:
        ...

    def embed_single(self, text: str) -> List[float]:
        ...


class DeepAgent:
    """
    Deep agent for iterative reward function generation.

    Coordinates pattern analysis, clustering, candidate generation,
    and validation to progressively improve reward functions.

    Example:
        >>> from iofold_eval_core.llm import create_llm_client
        >>> llm = create_llm_client()
        >>> agent = DeepAgent(
        ...     llm_client=llm,
        ...     embedding_client=embeddings,
        ...     train_traces=train_data,
        ...     val_traces=val_data,
        ... )
        >>> candidates = agent.generate_candidates(num_candidates=5)
        >>> best = agent.get_best_candidate()
        >>> print(f"Best accuracy: {best.val_accuracy:.2%}")
    """

    def __init__(
        self,
        llm_client: LLMClientProtocol,
        embedding_client: Optional[EmbeddingClientProtocol],
        train_traces: List[LabeledTrace],
        val_traces: List[LabeledTrace],
        n_clusters: int = 5,
    ):
        """
        Initialize DeepAgent.

        Args:
            llm_client: LLM client for generation
            embedding_client: Embedding client for clustering (optional)
            train_traces: Training labeled traces
            val_traces: Validation labeled traces
            n_clusters: Number of clusters for analysis
        """
        self.llm = llm_client
        self.embeddings = embedding_client
        self.train_traces = train_traces
        self.val_traces = val_traces
        self.n_clusters = n_clusters

        self.candidates: List[RewardCandidate] = []
        self.iteration = 0

        # Initialize sub-components
        self.pattern_analyzer = PatternAnalyzer(llm_client)
        self.candidate_generator = CandidateGenerator(llm_client)

        # Cache for analysis results
        self._training_summary: Optional[str] = None
        self._cluster_analysis: Optional[str] = None
        self._pattern_analysis: Optional[Dict[str, Any]] = None

        logger.info(
            f"DeepAgent initialized with {len(train_traces)} train, "
            f"{len(val_traces)} val traces"
        )

    def analyze_training_data(self) -> str:
        """
        Generate summary of training data.

        Creates a comprehensive summary of the training traces
        for use in candidate generation prompts.

        Returns:
            Training data summary string
        """
        if self._training_summary is not None:
            return self._training_summary

        # Categorize traces by score
        positive_traces = [t for t in self.train_traces if t.human_score >= 0.7]
        negative_traces = [t for t in self.train_traces if t.human_score <= 0.3]
        neutral_traces = [
            t for t in self.train_traces if 0.3 < t.human_score < 0.7
        ]

        # Sample traces for the prompt
        positive_samples = self._format_sample_traces(positive_traces[:3])
        negative_samples = self._format_sample_traces(negative_traces[:3])

        prompt = TRAINING_SUMMARY_PROMPT.format(
            total_traces=len(self.train_traces),
            positive_count=len(positive_traces),
            negative_count=len(negative_traces),
            neutral_count=len(neutral_traces),
            positive_samples=positive_samples or "None available",
            negative_samples=negative_samples or "None available",
        )

        logger.info("Generating training data summary")
        self._training_summary = self.llm.generate(
            prompt, temperature=0.3, max_tokens=1024
        )
        return self._training_summary

    def analyze_clusters(self) -> str:
        """
        Analyze clusters in training data.

        Uses embeddings to cluster traces and analyzes each cluster
        to identify common themes and quality indicators.

        Returns:
            Cluster analysis summary string
        """
        if self._cluster_analysis is not None:
            return self._cluster_analysis

        if self.embeddings is None:
            logger.info("No embedding client, skipping cluster analysis")
            self._cluster_analysis = "Clustering not available (no embedding client)."
            return self._cluster_analysis

        try:
            # Embed all training traces
            trace_texts = []
            for labeled_trace in self.train_traces:
                trace_dict = (
                    labeled_trace.trace.to_dict()
                    if hasattr(labeled_trace.trace, "to_dict")
                    else labeled_trace.trace
                )
                trace_texts.append(format_trace_for_prompt(trace_dict, max_steps=5))

            if not trace_texts:
                self._cluster_analysis = "No traces to cluster."
                return self._cluster_analysis

            logger.info(f"Embedding {len(trace_texts)} traces for clustering")
            embeddings = self.embeddings.embed(trace_texts)

            # Try to cluster using numpy/sklearn
            clusters = self._perform_clustering(embeddings)

            if not clusters:
                self._cluster_analysis = "Clustering failed or produced no results."
                return self._cluster_analysis

            # Analyze clusters
            cluster_data = []
            for cluster_id, indices in clusters.items():
                cluster_traces = [self.train_traces[i] for i in indices]
                avg_score = sum(t.human_score for t in cluster_traces) / len(
                    cluster_traces
                )
                cluster_data.append(
                    {
                        "cluster_id": cluster_id,
                        "traces": cluster_traces,
                        "avg_score": avg_score,
                    }
                )

            analysis_result = self.pattern_analyzer.analyze_clusters(cluster_data)

            # Format for generation prompt
            lines = ["Cluster Analysis Results:"]
            for cluster_info in analysis_result.get("clusters", []):
                lines.append(f"\n## Cluster {cluster_info.get('id', '?')}")
                lines.append(f"Theme: {cluster_info.get('theme', 'Unknown')}")
                features = cluster_info.get("distinguishing_features", [])
                if features:
                    lines.append("Features: " + ", ".join(features))

            self._cluster_analysis = "\n".join(lines)
            return self._cluster_analysis

        except Exception as e:
            logger.error(f"Cluster analysis failed: {e}")
            self._cluster_analysis = f"Clustering failed: {e}"
            return self._cluster_analysis

    def analyze_patterns(self) -> Dict[str, Any]:
        """
        Analyze patterns distinguishing positive from negative traces.

        Returns:
            Pattern analysis dict with patterns, signals, suggested_checks
        """
        if self._pattern_analysis is not None:
            return self._pattern_analysis

        positive_traces = [t for t in self.train_traces if t.human_score >= 0.7]
        negative_traces = [t for t in self.train_traces if t.human_score <= 0.3]

        logger.info(
            f"Analyzing patterns: {len(positive_traces)} positive, "
            f"{len(negative_traces)} negative"
        )

        self._pattern_analysis = self.pattern_analyzer.analyze(
            positive_traces, negative_traces
        )
        return self._pattern_analysis

    def generate_candidates(
        self,
        num_candidates: int = 5,
        include_analysis: bool = True,
    ) -> List[RewardCandidate]:
        """
        Generate and test new candidates.

        Args:
            num_candidates: Number of candidates to generate
            include_analysis: Whether to run pattern/cluster analysis first

        Returns:
            List of RewardCandidate objects with validation metrics
        """
        self.iteration += 1
        logger.info(f"Starting iteration {self.iteration}")

        # Gather context for generation
        if include_analysis:
            training_summary = self.analyze_training_data()
            cluster_analysis = self.analyze_clusters()
            patterns = self.analyze_patterns()

            comparison_insights = self._format_pattern_insights(patterns)
        else:
            training_summary = self._get_basic_summary()
            cluster_analysis = ""
            comparison_insights = ""

        # Format previous attempts
        previous_attempts = format_candidates_for_prompt(
            [c.__dict__ for c in self.candidates[-5:]]  # Last 5 candidates
        )

        # Generate candidates
        raw_candidates = self.candidate_generator.generate(
            training_summary=training_summary,
            cluster_analysis=cluster_analysis,
            comparison_insights=comparison_insights,
            previous_attempts=previous_attempts,
            num_candidates=num_candidates,
        )

        # Test each candidate
        new_candidates = []
        for candidate_data in raw_candidates:
            code = candidate_data["code"]
            strategy = candidate_data.get("strategy", "")
            reasoning = candidate_data.get("reasoning", "")

            # Test on validation set
            metrics = self._test_candidate(code)

            candidate = RewardCandidate(
                code=code,
                iteration=self.iteration,
                val_accuracy=metrics.get("accuracy", 0.0),
                val_pearson=metrics.get("pearson_r", 0.0),
                val_kappa=metrics.get("cohen_kappa", 0.0),
                val_f1=metrics.get("f1_score", 0.0),
                strategy=strategy,
                reasoning=reasoning,
                created_at=datetime.now().isoformat(),
            )

            new_candidates.append(candidate)
            self.candidates.append(candidate)

            logger.info(
                f"Candidate tested: accuracy={candidate.val_accuracy:.2%}, "
                f"kappa={candidate.val_kappa:.3f}"
            )

        return new_candidates

    def get_best_candidate(self) -> Optional[RewardCandidate]:
        """
        Get best candidate by validation accuracy.

        Returns:
            Best RewardCandidate or None if no candidates
        """
        if not self.candidates:
            return None

        # Sort by accuracy, then by kappa for tie-breaking
        return max(
            self.candidates,
            key=lambda c: (c.val_accuracy, c.val_kappa),
        )

    def get_top_candidates(self, n: int = 5) -> List[RewardCandidate]:
        """
        Get top N candidates by validation accuracy.

        Args:
            n: Number of candidates to return

        Returns:
            List of top RewardCandidate objects
        """
        sorted_candidates = sorted(
            self.candidates,
            key=lambda c: (c.val_accuracy, c.val_kappa),
            reverse=True,
        )
        return sorted_candidates[:n]

    def refine_candidate(
        self,
        candidate: RewardCandidate,
        misclassified_examples: Optional[List[Dict[str, Any]]] = None,
    ) -> RewardCandidate:
        """
        Refine a candidate based on its errors.

        Args:
            candidate: Candidate to refine
            misclassified_examples: Optional list of misclassified traces

        Returns:
            Refined RewardCandidate
        """
        if misclassified_examples is None:
            misclassified_examples = self._get_misclassified(candidate)

        # Analyze errors
        test_results = {
            "accuracy": candidate.val_accuracy,
            "pearson_r": candidate.val_pearson,
            "kappa": candidate.val_kappa,
        }

        analysis_result = self.candidate_generator.analyze_errors(
            candidate.__dict__,
            test_results,
            misclassified_examples,
        )

        # Format misclassified for refinement
        misclassified_str = self._format_misclassified(misclassified_examples)

        # Generate refined version
        refined_data = self.candidate_generator.refine(
            candidate.__dict__,
            analysis=str(analysis_result),
            misclassified=misclassified_str,
        )

        # Test refined candidate
        metrics = self._test_candidate(refined_data["code"])

        self.iteration += 1
        refined_candidate = RewardCandidate(
            code=refined_data["code"],
            iteration=self.iteration,
            val_accuracy=metrics.get("accuracy", 0.0),
            val_pearson=metrics.get("pearson_r", 0.0),
            val_kappa=metrics.get("cohen_kappa", 0.0),
            val_f1=metrics.get("f1_score", 0.0),
            strategy=refined_data.get("strategy", candidate.strategy),
            reasoning=f"Refined from iteration {candidate.iteration}",
            created_at=datetime.now().isoformat(),
        )

        self.candidates.append(refined_candidate)
        return refined_candidate

    def run_iterations(
        self,
        max_iterations: int = 5,
        candidates_per_iteration: int = 5,
        target_accuracy: float = 0.85,
        target_kappa: float = 0.7,
    ) -> RewardCandidate:
        """
        Run multiple iterations until target metrics or max iterations.

        Args:
            max_iterations: Maximum number of iterations
            candidates_per_iteration: Candidates to generate per iteration
            target_accuracy: Target validation accuracy
            target_kappa: Target Cohen's kappa

        Returns:
            Best RewardCandidate found
        """
        logger.info(
            f"Running up to {max_iterations} iterations, "
            f"target: accuracy={target_accuracy:.2%}, kappa={target_kappa:.3f}"
        )

        for i in range(max_iterations):
            new_candidates = self.generate_candidates(
                num_candidates=candidates_per_iteration
            )

            best = self.get_best_candidate()
            if best and best.val_accuracy >= target_accuracy and best.val_kappa >= target_kappa:
                logger.info(
                    f"Target reached at iteration {i+1}: "
                    f"accuracy={best.val_accuracy:.2%}, kappa={best.val_kappa:.3f}"
                )
                return best

            # Try refinement on best candidate
            if best:
                refined = self.refine_candidate(best)
                if (
                    refined.val_accuracy >= target_accuracy
                    and refined.val_kappa >= target_kappa
                ):
                    logger.info(
                        f"Target reached after refinement: "
                        f"accuracy={refined.val_accuracy:.2%}, "
                        f"kappa={refined.val_kappa:.3f}"
                    )
                    return refined

        final_best = self.get_best_candidate()
        logger.info(
            f"Max iterations reached. Best: accuracy={final_best.val_accuracy:.2%}, "
            f"kappa={final_best.val_kappa:.3f}"
            if final_best
            else "No candidates generated"
        )
        return final_best

    def _test_candidate(self, code: str) -> Dict[str, float]:
        """Test a candidate on validation traces."""
        try:
            from ..sandbox import execute_reward_function
        except ImportError:
            logger.warning("Sandbox not available, returning mock metrics")
            return {
                "accuracy": 0.0,
                "pearson_r": 0.0,
                "cohen_kappa": 0.0,
                "f1_score": 0.0,
            }

        predictions = []
        correct = 0
        errors = 0

        for labeled_trace in self.val_traces:
            trace_dict = (
                labeled_trace.trace.to_dict()
                if hasattr(labeled_trace.trace, "to_dict")
                else labeled_trace.trace
            )

            try:
                score, feedback = execute_reward_function(code, trace_dict)
                predictions.append(
                    {
                        "human_score": labeled_trace.human_score,
                        "predicted_score": score,
                    }
                )

                # Check if prediction matches (binary classification)
                human_positive = labeled_trace.human_score >= 0.5
                pred_positive = score >= 0.5
                if human_positive == pred_positive:
                    correct += 1

            except Exception as e:
                errors += 1
                logger.debug(f"Execution error: {e}")

        if not predictions:
            return {
                "accuracy": 0.0,
                "pearson_r": 0.0,
                "cohen_kappa": 0.0,
                "f1_score": 0.0,
            }

        accuracy = correct / len(predictions)

        # Calculate Pearson correlation
        try:
            pearson_r = self._calculate_pearson(predictions)
        except Exception:
            pearson_r = 0.0

        # Calculate Cohen's kappa
        try:
            cohen_kappa = self._calculate_kappa(predictions)
        except Exception:
            cohen_kappa = 0.0

        # Calculate F1 score
        try:
            f1_score = self._calculate_f1(predictions)
        except Exception:
            f1_score = 0.0

        return {
            "accuracy": accuracy,
            "pearson_r": pearson_r,
            "cohen_kappa": cohen_kappa,
            "f1_score": f1_score,
        }

    def _perform_clustering(
        self, embeddings: List[List[float]]
    ) -> Dict[int, List[int]]:
        """Perform K-means clustering on embeddings."""
        try:
            import numpy as np
            from sklearn.cluster import KMeans
        except ImportError:
            logger.warning("numpy/sklearn not available for clustering")
            return {}

        if len(embeddings) < self.n_clusters:
            logger.warning(
                f"Not enough samples ({len(embeddings)}) for {self.n_clusters} clusters"
            )
            n_clusters = max(2, len(embeddings) // 2)
        else:
            n_clusters = self.n_clusters

        X = np.array(embeddings)
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = kmeans.fit_predict(X)

        clusters = {}
        for idx, label in enumerate(labels):
            if label not in clusters:
                clusters[label] = []
            clusters[label].append(idx)

        return clusters

    def _calculate_pearson(self, predictions: List[Dict[str, float]]) -> float:
        """Calculate Pearson correlation coefficient."""
        n = len(predictions)
        if n < 2:
            return 0.0

        human_scores = [p["human_score"] for p in predictions]
        pred_scores = [p["predicted_score"] for p in predictions]

        mean_h = sum(human_scores) / n
        mean_p = sum(pred_scores) / n

        numerator = sum(
            (h - mean_h) * (p - mean_p)
            for h, p in zip(human_scores, pred_scores)
        )

        var_h = sum((h - mean_h) ** 2 for h in human_scores)
        var_p = sum((p - mean_p) ** 2 for p in pred_scores)

        denominator = (var_h * var_p) ** 0.5

        if denominator == 0:
            return 0.0

        return numerator / denominator

    def _calculate_kappa(self, predictions: List[Dict[str, float]]) -> float:
        """Calculate Cohen's kappa for binary classification."""
        n = len(predictions)
        if n < 2:
            return 0.0

        # Binary classification
        tp = fp = tn = fn = 0
        for p in predictions:
            human_pos = p["human_score"] >= 0.5
            pred_pos = p["predicted_score"] >= 0.5

            if human_pos and pred_pos:
                tp += 1
            elif human_pos and not pred_pos:
                fn += 1
            elif not human_pos and pred_pos:
                fp += 1
            else:
                tn += 1

        # Observed accuracy
        po = (tp + tn) / n

        # Expected accuracy
        p_yes = ((tp + fn) / n) * ((tp + fp) / n)
        p_no = ((tn + fp) / n) * ((tn + fn) / n)
        pe = p_yes + p_no

        if pe == 1:
            return 1.0 if po == 1 else 0.0

        return (po - pe) / (1 - pe)

    def _calculate_f1(self, predictions: List[Dict[str, float]]) -> float:
        """Calculate F1 score for binary classification."""
        tp = fp = fn = 0
        for p in predictions:
            human_pos = p["human_score"] >= 0.5
            pred_pos = p["predicted_score"] >= 0.5

            if human_pos and pred_pos:
                tp += 1
            elif not human_pos and pred_pos:
                fp += 1
            elif human_pos and not pred_pos:
                fn += 1

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0

        if precision + recall == 0:
            return 0.0

        return 2 * (precision * recall) / (precision + recall)

    def _format_sample_traces(self, traces: List[LabeledTrace]) -> str:
        """Format sample traces for prompts."""
        if not traces:
            return ""

        samples = []
        for i, labeled_trace in enumerate(traces, 1):
            trace_dict = (
                labeled_trace.trace.to_dict()
                if hasattr(labeled_trace.trace, "to_dict")
                else labeled_trace.trace
            )
            samples.append(f"### Sample {i} (Score: {labeled_trace.human_score:.2f})")
            samples.append(format_trace_for_prompt(trace_dict, max_steps=5))
            samples.append("")

        return "\n".join(samples)

    def _format_pattern_insights(self, patterns: Dict[str, Any]) -> str:
        """Format pattern analysis for generation prompt."""
        lines = []

        if patterns.get("patterns"):
            lines.append("## Identified Patterns")
            for p in patterns["patterns"]:
                lines.append(f"- {p}")

        if patterns.get("signals"):
            lines.append("\n## Quality Signals")
            for s in patterns["signals"]:
                lines.append(f"- {s}")

        if patterns.get("suggested_checks"):
            lines.append("\n## Suggested Checks")
            for c in patterns["suggested_checks"]:
                lines.append(f"- {c}")

        return "\n".join(lines) if lines else "No pattern insights available."

    def _get_basic_summary(self) -> str:
        """Get basic training data summary without LLM call."""
        positive = sum(1 for t in self.train_traces if t.human_score >= 0.7)
        negative = sum(1 for t in self.train_traces if t.human_score <= 0.3)
        neutral = len(self.train_traces) - positive - negative

        return f"""Training Data:
- Total: {len(self.train_traces)} traces
- Positive: {positive}
- Negative: {negative}
- Neutral: {neutral}

Generate reward functions that can distinguish between high and low quality traces.
"""

    def _get_misclassified(
        self, candidate: RewardCandidate
    ) -> List[Dict[str, Any]]:
        """Get misclassified examples for a candidate."""
        try:
            from ..sandbox import execute_reward_function
        except ImportError:
            return []

        misclassified = []

        for labeled_trace in self.val_traces:
            trace_dict = (
                labeled_trace.trace.to_dict()
                if hasattr(labeled_trace.trace, "to_dict")
                else labeled_trace.trace
            )

            try:
                score, _ = execute_reward_function(candidate.code, trace_dict)

                human_positive = labeled_trace.human_score >= 0.5
                pred_positive = score >= 0.5

                if human_positive != pred_positive:
                    misclassified.append(
                        {
                            "trace": trace_dict,
                            "human_score": labeled_trace.human_score,
                            "predicted_score": score,
                        }
                    )
            except Exception:
                pass

        return misclassified[:10]  # Limit to 10 examples

    def _format_misclassified(
        self, examples: List[Dict[str, Any]]
    ) -> str:
        """Format misclassified examples for prompts."""
        if not examples:
            return "No misclassified examples."

        lines = []
        for i, ex in enumerate(examples[:5], 1):
            lines.append(f"\n### Example {i}")
            lines.append(
                f"Human: {ex['human_score']:.2f}, Predicted: {ex['predicted_score']:.2f}"
            )
            lines.append(format_trace_for_prompt(ex["trace"], max_steps=3))

        return "\n".join(lines)
