"""
IofoldGEPAAdapter - GEPA adapter for iofold platform.

This adapter enables GEPA optimization to use iofold's agent execution
infrastructure via HTTP APIs, while running evaluations locally in the
Python sandbox for performance.

Architecture:
- Agent execution: Platform APIs (TypeScript worker)
- Eval execution: Local (Python sandbox)
- LLM for reflection: AI Gateway (via OpenAI SDK)
"""

import httpx
import time
from typing import List, Dict, Any, Optional, Tuple, Callable
from dataclasses import dataclass


@dataclass
class DataInst:
    """
    GEPA test case data structure.

    Attributes:
        task: The task payload (e.g., {"user_message": "...", "context": {...}})
        task_metadata: Additional metadata about the task (e.g., expected output)
    """
    task: Dict[str, Any]
    task_metadata: Dict[str, Any]


@dataclass
class EvaluationBatch:
    """
    Results from evaluating a batch of tasks.

    Attributes:
        outputs: List of output dictionaries from each task
        scores: List of evaluation scores (0.0-1.0) for each task
        trajectories: Optional detailed execution traces for each task
    """
    outputs: List[Any]
    scores: List[float]
    trajectories: Optional[List[Dict]] = None


class IofoldGEPAAdapter:
    """
    GEPA adapter that uses iofold platform APIs for agent execution
    and runs evals locally in the sandbox.

    This adapter implements GEPA's required interface:
    1. evaluate() - Execute agent on batch with candidate prompt, return scores
    2. make_reflective_dataset() - Build feedback dataset for reflection LLM

    Agent execution flow:
    1. POST /api/internal/rollouts/batch - Submit batch of tasks
    2. GET /api/internal/rollouts/batch/{batch_id} - Poll for completion
    3. Run eval_function locally on returned traces
    4. Return EvaluationBatch with scores
    """

    def __init__(
        self,
        api_base_url: str,
        session_token: str,
        agent_id: str,
        eval_code: str,
        parallelism: int = 5,
        poll_timeout_seconds: int = 600,  # 10 minutes
        poll_interval_seconds: float = 1.0,
        timeout_per_task_ms: int = 30000,  # 30 seconds
    ):
        """
        Initialize the iofold GEPA adapter.

        Args:
            api_base_url: Base URL for iofold API (e.g., "https://api.iofold.com")
            session_token: Authentication token (passed through to internal APIs)
            agent_id: ID of the agent to run rollouts with
            eval_code: Python code string defining 'eval_function'
            parallelism: Number of concurrent rollout executions (default: 5)
            poll_timeout_seconds: Max time to wait for batch completion (default: 600)
            poll_interval_seconds: Polling interval in seconds (default: 1.0)
            timeout_per_task_ms: Timeout per individual task in milliseconds (default: 30000)

        Raises:
            ValueError: If eval_code doesn't define 'eval_function'
        """
        self.api_base_url = api_base_url.rstrip('/')
        self.agent_id = agent_id
        self.parallelism = parallelism
        self.poll_timeout_seconds = poll_timeout_seconds
        self.poll_interval_seconds = poll_interval_seconds
        self.timeout_per_task_ms = timeout_per_task_ms

        # HTTP client with auth
        self.client = httpx.Client(
            base_url=self.api_base_url,
            headers={"Authorization": f"Bearer {session_token}"},
            timeout=30.0,
        )

        # Compile eval function
        self._eval_globals: Dict[str, Any] = {}
        exec(eval_code, self._eval_globals)
        if 'eval_function' not in self._eval_globals:
            raise ValueError("eval_code must define 'eval_function'")

        self.eval_function: Callable = self._eval_globals['eval_function']

    def evaluate(
        self,
        batch: List[DataInst],
        candidate: Dict[str, str],
        capture_traces: bool = False,
    ) -> EvaluationBatch:
        """
        Execute agent with candidate prompt on batch, run eval locally.

        This is the main method called by GEPA during optimization:
        1. Request rollouts from iofold platform (parallel execution)
        2. Poll for completion (with timeout)
        3. Run evals locally in sandbox
        4. Return EvaluationBatch with scores

        Args:
            batch: List of DataInst test cases to evaluate
            candidate: Dictionary containing the candidate prompt (e.g., {"system_prompt": "..."})
            capture_traces: If True, include detailed traces in result

        Returns:
            EvaluationBatch containing outputs, scores, and optional trajectories

        Raises:
            RuntimeError: If API requests fail (HTTP errors, timeouts, network errors)
        """
        # 1. Request rollouts from platform
        tasks_payload = [
            {
                "task_id": f"task_{i}",
                "user_message": inst.task.get("user_message", ""),
                "context": inst.task.get("context", {}),
            }
            for i, inst in enumerate(batch)
        ]

        try:
            response = self.client.post(
                "/api/internal/rollouts/batch",
                json={
                    "agent_id": self.agent_id,
                    "system_prompt": candidate.get("system_prompt", ""),
                    "tasks": tasks_payload,
                    "config": {
                        "parallelism": self.parallelism,
                        "timeout_per_task_ms": self.timeout_per_task_ms,
                    },
                },
            )
            response.raise_for_status()
            batch_id = response.json()["batch_id"]
        except httpx.HTTPStatusError as e:
            # Handle HTTP errors (4xx, 5xx)
            raise RuntimeError(f"API request failed: {e.response.status_code} - {e.response.text}")
        except httpx.TimeoutException:
            raise RuntimeError("API request timed out")
        except httpx.RequestError as e:
            raise RuntimeError(f"Network error: {str(e)}")

        # 2. Poll for completion
        results = self._poll_for_completion(batch_id)

        # 3. Run evals locally
        outputs = []
        scores = []
        trajectories = [] if capture_traces else None

        for i, inst in enumerate(batch):
            task_id = f"task_{i}"
            result = next((r for r in results if r["task_id"] == task_id), None)

            if result is None or result["status"] != "completed":
                # Task failed or timed out
                error_msg = result.get("error", "Task not completed") if result else "Task not found"
                outputs.append({"error": error_msg})
                scores.append(0.0)
                if capture_traces:
                    trajectories.append({
                        "task": inst.task,
                        "task_metadata": inst.task_metadata,
                        "error": error_msg,
                        "status": result.get("status") if result else "not_found",
                    })
                continue

            trace = result.get("trace", [])

            # Run eval locally
            try:
                score, feedback = self._run_eval(inst, trace)
            except Exception as e:
                score, feedback = 0.0, f"Eval error: {str(e)}"

            outputs.append({"trace": trace, "feedback": feedback})
            scores.append(score)

            if capture_traces:
                trajectories.append({
                    "task": inst.task,
                    "task_metadata": inst.task_metadata,
                    "trace": trace,
                    "score": score,
                    "feedback": feedback,
                    "execution_time_ms": result.get("execution_time_ms"),
                })

        return EvaluationBatch(
            outputs=outputs,
            scores=scores,
            trajectories=trajectories,
        )

    def _poll_for_completion(self, batch_id: str) -> List[Dict]:
        """
        Poll until batch completes or timeout.

        Args:
            batch_id: ID of the rollout batch to poll

        Returns:
            List of result dictionaries for each task

        Raises:
            RuntimeError: If API requests fail
        """
        start_time = time.time()

        while time.time() - start_time < self.poll_timeout_seconds:
            try:
                response = self.client.get(f"/api/internal/rollouts/batch/{batch_id}")
                response.raise_for_status()
                data = response.json()

                status = data.get("status")
                if status in ("completed", "partial", "failed"):
                    return data.get("results", [])

                time.sleep(self.poll_interval_seconds)
            except httpx.HTTPStatusError as e:
                # Handle HTTP errors (4xx, 5xx)
                raise RuntimeError(f"API request failed: {e.response.status_code} - {e.response.text}")
            except httpx.TimeoutException:
                raise RuntimeError("API request timed out")
            except httpx.RequestError as e:
                raise RuntimeError(f"Network error: {str(e)}")

        # Timeout - fetch whatever results we have
        try:
            response = self.client.get(f"/api/internal/rollouts/batch/{batch_id}")
            response.raise_for_status()
            data = response.json()

            # Return whatever results are available
            # Tasks that didn't complete will be handled by evaluate() method
            return data.get("results", [])
        except httpx.HTTPStatusError as e:
            # Handle HTTP errors (4xx, 5xx)
            raise RuntimeError(f"API request failed: {e.response.status_code} - {e.response.text}")
        except httpx.TimeoutException:
            raise RuntimeError("API request timed out")
        except httpx.RequestError as e:
            raise RuntimeError(f"Network error: {str(e)}")

    def _run_eval(self, inst: DataInst, trace: List[Dict]) -> Tuple[float, str]:
        """
        Execute eval function locally in sandbox.

        Args:
            inst: Test case data instance
            trace: LangGraphExecutionStep array from agent execution

        Returns:
            Tuple of (score, feedback) where score is 0.0-1.0

        Raises:
            Exception: If eval function execution fails
        """
        # Build trace dict in expected format for eval function
        trace_dict = {
            "steps": trace,
            "agent_response": self._extract_agent_response(trace),
        }

        # Call eval function with expected signature:
        # eval_function(task, task_metadata, trace, ctx) -> float | Tuple[float, str]
        result = self.eval_function(
            inst.task,
            inst.task_metadata,
            trace_dict,
            None,  # ctx - not needed for local eval
        )

        # Handle both return types: float or (float, str)
        if isinstance(result, tuple):
            return float(result[0]), str(result[1])
        return float(result), ""

    def _extract_agent_response(self, trace: List[Dict]) -> str:
        """
        Extract final agent response from trace steps.

        Walks backwards through trace to find the last assistant message.

        Args:
            trace: LangGraphExecutionStep array

        Returns:
            Final agent response text, or empty string if not found
        """
        for step in reversed(trace):
            messages = step.get("messages_added", [])
            for msg in reversed(messages):
                if msg.get("role") == "assistant":
                    content = msg.get("content", "")
                    # Handle both string content and array content
                    if isinstance(content, list):
                        # Extract text from content blocks
                        text_parts = [
                            block.get("text", "")
                            for block in content
                            if isinstance(block, dict) and block.get("type") == "text"
                        ]
                        return "".join(text_parts)
                    return str(content)
        return ""

    def make_reflective_dataset(
        self,
        candidate: Dict[str, str],
        eval_batch: EvaluationBatch,
        components_to_update: List[str],
    ) -> Dict[str, List[Dict]]:
        """
        Build feedback dataset for GEPA's reflection LLM.

        This method is called by GEPA to prepare data for the reflection step,
        where the LLM analyzes failures and suggests improvements.

        Args:
            candidate: Current candidate prompt being evaluated
            eval_batch: Results from evaluating this candidate
            components_to_update: List of component keys to update (e.g., ["system_prompt"])

        Returns:
            Dictionary mapping component names to lists of feedback items.
            Each feedback item contains task, output, score, and current_text.
        """
        reflective_data = {comp: [] for comp in components_to_update}

        for i, (output, score) in enumerate(zip(eval_batch.outputs, eval_batch.scores)):
            # Include failures and partial successes for reflection
            if score < 1.0:
                trajectory = eval_batch.trajectories[i] if eval_batch.trajectories else {}

                for comp in components_to_update:
                    reflective_data[comp].append({
                        "task": trajectory.get("task", {}),
                        "task_metadata": trajectory.get("task_metadata", {}),
                        "output": output,
                        "score": score,
                        "current_text": candidate.get(comp, ""),
                        "feedback": output.get("feedback", "") if isinstance(output, dict) else "",
                    })

        return reflective_data

    def close(self):
        """Close the HTTP client connection."""
        self.client.close()

    def __enter__(self):
        """Context manager support."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager cleanup."""
        self.close()
