"""
Simulated Human Feedback Generator for ART-E Tasksets.

Generates realistic human-like feedback on agent traces by comparing
execution results with ground truth data from the ART-E benchmark.
"""

import json
import os
import sqlite3
import random
import re
from dataclasses import dataclass
from typing import Optional, Any
from datetime import datetime
import numpy as np
from pathlib import Path

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    # Look for .env in project root (parent of notebooks/)
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        # Fallback to current directory
        load_dotenv()
except ImportError:
    pass  # dotenv not installed, rely on environment variables

# Optional imports
try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False
    pd = None

try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    genai = None

try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    OpenAI = None

try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False
    anthropic = None

import db_utils


# ---------------------------------------------------------------------------
# Default Evaluation Rubric
# ---------------------------------------------------------------------------

EVALUATION_RUBRIC = """
You are evaluating an AI agent's performance on an email search task.

## Ground Truth
- **Expected Answer**: {expected_answer}
- **Expected Emails**: {expected_email_ids}
- **Query Date**: {query_date}
- **Inbox**: {inbox_address}

## Agent Execution
- **Agent's Answer**: {agent_answer}
- **Emails Retrieved**: {retrieved_email_ids}
- **Tool Calls Made**: {tool_call_count}
- **Execution Time**: {execution_time_ms}ms
- **Detected Issues**: {detected_issues}

## Evaluation Criteria

### Answer Correctness (Primary)
- Does the agent's answer match the expected answer in meaning?
- Is the information factually correct based on the emails?

### Email Retrieval
- Did the agent find the relevant emails?
- Did it miss critical emails from the expected set?

### Efficiency
- Reasonable: 1-5 tool calls
- Concerning: 6-10 tool calls
- Inefficient: 10+ tool calls

### Behavioral Issues
- Stuck in loops (repeated similar queries)
- Hallucinated information not in emails
- Searched outside the query date range

## Output
Rate as: positive, neutral, or negative
Provide brief reasoning for your rating.
"""


# ---------------------------------------------------------------------------
# LLM Client Wrapper (with Cloudflare AI Gateway support)
# ---------------------------------------------------------------------------

# Cloudflare AI Gateway configuration
CF_ACCOUNT_ID = os.getenv("CF_ACCOUNT_ID", "b26e4af8b7631a2c8d99476fd7bce974")
CF_GATEWAY_ID = os.getenv("CF_GATEWAY_ID", "iofold-ai-gw")
CF_GATEWAY_URL = f"https://gateway.ai.cloudflare.com/v1/{CF_ACCOUNT_ID}/{CF_GATEWAY_ID}/compat"

# Model mapping to Cloudflare gateway format
MODEL_GATEWAY_MAP = {
    "gemini-2.5-flash": "google-ai-studio/gemini-2.5-flash",
    "gemini-2.5-pro": "google-ai-studio/gemini-2.5-pro",
    "gpt-4o-mini": "openai/gpt-4o-mini",
    "gpt-4o": "openai/gpt-4o",
    "gpt-5-nano": "openai/gpt-5-nano",
    "claude-3-haiku-20240307": "anthropic/claude-3-haiku-20240307",
    "claude-sonnet-4-5": "anthropic/claude-sonnet-4-5-20250929",
}


class LLMClient:
    """Unified LLM client supporting Cloudflare AI Gateway and direct providers."""

    def __init__(self, model: str = "gemini-2.5-flash", api_key: Optional[str] = None, use_gateway: bool = True):
        self.model = model
        self.api_key = api_key
        self.use_gateway = use_gateway and bool(CF_ACCOUNT_ID)
        self._client = None
        self._setup_client()

    def _setup_client(self):
        """Initialize the appropriate client based on model name."""
        if self.use_gateway:
            # Use Cloudflare AI Gateway with OpenAI SDK
            if not OPENAI_AVAILABLE:
                raise ImportError("openai not installed. Run: pip install openai")
            # Try multiple API key sources
            api_key = (
                self.api_key or
                os.getenv("CF_AI_GATEWAY_TOKEN") or
                os.getenv("OPENAI_API_KEY") or
                os.getenv("CF_API_KEY", "")
            )
            self._client = OpenAI(
                api_key=api_key,
                base_url=CF_GATEWAY_URL
            )
            # Map model to gateway format
            self._gateway_model = MODEL_GATEWAY_MAP.get(self.model, f"openai/{self.model}")
            print(f"Using Cloudflare AI Gateway: {self._gateway_model}")
        elif "gemini" in self.model.lower():
            if not GEMINI_AVAILABLE:
                raise ImportError("google-generativeai not installed. Run: pip install google-generativeai")
            if self.api_key:
                genai.configure(api_key=self.api_key)
            self._client = genai.GenerativeModel(self.model)
        elif "gpt" in self.model.lower():
            if not OPENAI_AVAILABLE:
                raise ImportError("openai not installed. Run: pip install openai")
            self._client = OpenAI(api_key=self.api_key) if self.api_key else OpenAI()
        elif "claude" in self.model.lower():
            if not ANTHROPIC_AVAILABLE:
                raise ImportError("anthropic not installed. Run: pip install anthropic")
            self._client = anthropic.Anthropic(api_key=self.api_key) if self.api_key else anthropic.Anthropic()
        else:
            raise ValueError(f"Unknown model: {self.model}. Supported: gemini, gpt, claude")

    def generate(self, prompt: str, temperature: float = 0.3) -> str:
        """Generate a response from the LLM."""
        if self.use_gateway:
            # All models go through OpenAI-compatible gateway
            response = self._client.chat.completions.create(
                model=self._gateway_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=temperature,
                max_tokens=1000
            )
            return response.choices[0].message.content
        elif "gemini" in self.model.lower():
            response = self._client.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(temperature=temperature)
            )
            return response.text
        elif "gpt" in self.model.lower():
            response = self._client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=temperature
            )
            return response.choices[0].message.content
        elif "claude" in self.model.lower():
            response = self._client.messages.create(
                model=self.model,
                max_tokens=1000,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.content[0].text
        else:
            raise ValueError(f"Unknown model: {self.model}")


# ---------------------------------------------------------------------------
# Data Extraction Functions
# ---------------------------------------------------------------------------

def extract_final_response(trace: dict) -> str:
    """Extract the agent's final response from trace spans/steps."""
    # Try spans first (OpenInference format)
    spans = trace.get("spans", [])
    if isinstance(spans, str):
        spans = json.loads(spans) if spans else []

    if spans:
        # Find the last LLM span with output
        for span in reversed(spans):
            if span.get("span_kind") == "LLM":
                output_msgs = span.get("output", {})
                if isinstance(output_msgs, dict) and output_msgs.get("messages"):
                    for msg in reversed(output_msgs["messages"]):
                        if msg.get("role") == "assistant":
                            return msg.get("content", "")

    # Fallback to steps (LangGraph format)
    steps = trace.get("steps", [])
    if isinstance(steps, str):
        steps = json.loads(steps) if steps else []

    for step in reversed(steps):
        messages = step.get("messages_added", [])
        for msg in reversed(messages):
            if msg.get("role") == "assistant":
                content = msg.get("content", "")
                if content and not content.startswith("["):  # Skip tool call markers
                    return content

        output = step.get("output")
        if output and isinstance(output, str):
            return output

    return trace.get("output_preview", "") or ""


def extract_email_ids_from_tool_calls(trace: dict) -> list[str]:
    """Extract email message IDs that the agent retrieved."""
    email_ids = set()

    # Check spans
    spans = trace.get("spans", [])
    if isinstance(spans, str):
        spans = json.loads(spans) if spans else []

    for span in spans:
        if span.get("span_kind") == "TOOL":
            tool_name = span.get("name", "").lower()
            if "email" in tool_name or "search" in tool_name:
                output = span.get("output", {})
                if isinstance(output, str):
                    try:
                        output = json.loads(output)
                    except:
                        pass

                # Look for message_id patterns in output
                output_str = str(output)
                # Match RFC 2822 Message-ID patterns
                matches = re.findall(r'<[^>]+@[^>]+>', output_str)
                email_ids.update(matches)

    # Check steps
    steps = trace.get("steps", [])
    if isinstance(steps, str):
        steps = json.loads(steps) if steps else []

    for step in steps:
        for tc in step.get("tool_calls", []):
            tool_name = tc.get("tool_name", "").lower()
            if "email" in tool_name or "search" in tool_name:
                result = tc.get("result", "")
                result_str = str(result)
                matches = re.findall(r'<[^>]+@[^>]+>', result_str)
                email_ids.update(matches)

    return list(email_ids)


def count_tool_calls(trace: dict) -> int:
    """Count total tool calls in the trace."""
    count = 0

    # Count from spans
    spans = trace.get("spans", [])
    if isinstance(spans, str):
        spans = json.loads(spans) if spans else []
    count += sum(1 for s in spans if s.get("span_kind") == "TOOL")

    # Count from steps if no spans
    if count == 0:
        steps = trace.get("steps", [])
        if isinstance(steps, str):
            steps = json.loads(steps) if steps else []
        for step in steps:
            count += len(step.get("tool_calls", []))

    return count


def detect_issues(trace: dict, query_date: Optional[str] = None) -> list[str]:
    """Detect behavioral issues in the trace."""
    issues = []

    spans = trace.get("spans", [])
    if isinstance(spans, str):
        spans = json.loads(spans) if spans else []

    steps = trace.get("steps", [])
    if isinstance(steps, str):
        steps = json.loads(steps) if steps else []

    # Check for repeated queries (loop detection)
    tool_inputs = []
    for span in spans:
        if span.get("span_kind") == "TOOL":
            input_str = str(span.get("input", ""))[:100]
            tool_inputs.append(input_str)

    for step in steps:
        for tc in step.get("tool_calls", []):
            input_str = str(tc.get("arguments", ""))[:100]
            tool_inputs.append(input_str)

    # Count duplicates
    if len(tool_inputs) > 0:
        unique_ratio = len(set(tool_inputs)) / len(tool_inputs)
        if unique_ratio < 0.6 and len(tool_inputs) > 3:
            issues.append("Repeated similar queries (possible loop)")

    # Check for errors
    has_errors = trace.get("has_errors", False)
    if has_errors:
        issues.append("Execution errors occurred")

    return issues if issues else ["None detected"]


def extract_comparison_data(trace: dict, art_e_task: dict) -> dict:
    """Extract all signals needed for LLM evaluation."""

    agent_answer = extract_final_response(trace)
    retrieved_email_ids = extract_email_ids_from_tool_calls(trace)
    tool_call_count = count_tool_calls(trace)
    execution_time_ms = trace.get("total_duration_ms") or trace.get("totalDurationMs", 0)
    detected_issues = detect_issues(trace, art_e_task.get("query_date"))

    # Parse expected email IDs
    expected_email_ids = art_e_task.get("message_ids", [])
    if isinstance(expected_email_ids, str):
        try:
            expected_email_ids = json.loads(expected_email_ids)
        except:
            expected_email_ids = []

    return {
        # Ground truth
        "expected_answer": art_e_task.get("answer", ""),
        "expected_email_ids": expected_email_ids,
        "query_date": art_e_task.get("query_date", ""),
        "inbox_address": art_e_task.get("inbox_address", ""),

        # Agent execution
        "agent_answer": agent_answer,
        "retrieved_email_ids": retrieved_email_ids,
        "tool_call_count": tool_call_count,
        "execution_time_ms": execution_time_ms,
        "detected_issues": detected_issues
    }


# ---------------------------------------------------------------------------
# Feedback Generation
# ---------------------------------------------------------------------------

RATING_PROMPT = """
{rubric}

Based on the above evaluation, respond with ONLY a JSON object (no markdown):
{{"rating": "positive" or "neutral" or "negative", "reasoning": "brief explanation"}}
"""

FEEDBACK_PROMPT = """
You are simulating human feedback on an AI agent's response.
The human reviewer rated this as: {rating}
Reasoning: {reasoning}

Write feedback as a human would - {verbosity_instruction}

Examples of human feedback:
- "Wrong answer, the meeting was on Tuesday not Wednesday"
- "Way too many searches, should have found it in 2-3 queries"
- "Good job finding the right emails but missed the attachment mention"
- "Kept searching the same thing over and over"
- "Correct answer but took too long"
- "Perfect, found exactly what was needed"

Write natural, varied feedback (not robotic or templated). Just the feedback text, no quotes:
"""

VERBOSITY_INSTRUCTIONS = {
    "terse": "Be terse. 3-8 words. e.g., 'Wrong answer' or 'Too slow'",
    "brief": "Be brief. 1 sentence with the main issue.",
    "detailed": "Be detailed. 2-3 sentences explaining what went wrong/right."
}


def get_verbosity_instruction(detail_score: float) -> str:
    """Map detail score to verbosity instruction."""
    if detail_score < 0.7:
        return VERBOSITY_INSTRUCTIONS["terse"]
    elif detail_score < 0.85:
        return VERBOSITY_INSTRUCTIONS["brief"]
    else:
        return VERBOSITY_INSTRUCTIONS["detailed"]


def generate_feedback_for_trace(
    comparison_data: dict,
    detail_score: float,
    rubric: str,
    llm: LLMClient
) -> tuple[str, Optional[str]]:
    """
    Generate rating and optional textual feedback for a trace.

    Returns: (rating, rating_detail or None)
    """
    # Format the rubric with comparison data
    formatted_rubric = rubric.format(
        expected_answer=comparison_data["expected_answer"][:500],
        expected_email_ids=str(comparison_data["expected_email_ids"][:5]),
        query_date=comparison_data["query_date"],
        inbox_address=comparison_data["inbox_address"],
        agent_answer=comparison_data["agent_answer"][:500],
        retrieved_email_ids=str(comparison_data["retrieved_email_ids"][:5]),
        tool_call_count=comparison_data["tool_call_count"],
        execution_time_ms=comparison_data["execution_time_ms"],
        detected_issues=", ".join(comparison_data["detected_issues"])
    )

    # Stage 1: Get rating
    rating_prompt = RATING_PROMPT.format(rubric=formatted_rubric)
    rating_response = llm.generate(rating_prompt, temperature=0.1)

    # Parse JSON response
    try:
        # Clean up response (remove markdown code blocks if present)
        clean_response = rating_response.strip()
        if clean_response.startswith("```"):
            clean_response = clean_response.split("```")[1]
            if clean_response.startswith("json"):
                clean_response = clean_response[4:]
        clean_response = clean_response.strip()

        result = json.loads(clean_response)
        rating = result.get("rating", "neutral")
        reasoning = result.get("reasoning", "")
    except json.JSONDecodeError:
        # Fallback: try to extract rating from text
        response_lower = rating_response.lower()
        if "positive" in response_lower:
            rating = "positive"
        elif "negative" in response_lower:
            rating = "negative"
        else:
            rating = "neutral"
        reasoning = rating_response[:200]

    # Validate rating
    if rating not in ["positive", "negative", "neutral"]:
        rating = "neutral"

    # Stage 2: Generate textual feedback if detail_score >= 0.5
    if detail_score < 0.5:
        return rating, None

    verbosity = get_verbosity_instruction(detail_score)
    feedback_prompt = FEEDBACK_PROMPT.format(
        rating=rating,
        reasoning=reasoning,
        verbosity_instruction=verbosity
    )

    feedback_text = llm.generate(feedback_prompt, temperature=0.7)

    # Clean up feedback text
    feedback_text = feedback_text.strip().strip('"').strip("'")

    return rating, feedback_text


# ---------------------------------------------------------------------------
# Main Functions
# ---------------------------------------------------------------------------

def get_traces_for_job(job_id: str) -> list[dict]:
    """Fetch all traces from a taskset job with their ground truth data."""

    # First get traces from the main database, joining with agent_versions to get agent_id
    traces_sql = """
    SELECT t.*, av.agent_id
    FROM traces t
    LEFT JOIN agent_versions av ON t.agent_version_id = av.id
    WHERE json_extract(t.metadata, '$.jobId') = ?
       OR json_extract(t.metadata, '$.job_id') = ?
    ORDER BY t.imported_at
    """
    traces = db_utils.query(traces_sql, (job_id, job_id))

    if not traces:
        # Try alternate metadata field
        traces_sql = """
        SELECT t.*, av.agent_id
        FROM traces t
        LEFT JOIN agent_versions av ON t.agent_version_id = av.id
        WHERE t.metadata LIKE ?
        ORDER BY t.imported_at
        """
        traces = db_utils.query(traces_sql, (f'%{job_id}%',))

    return traces


def get_art_e_task(task_id: int) -> Optional[dict]:
    """Fetch ART-E task from benchmarks database."""
    try:
        benchmarks_db = db_utils.find_benchmarks_database()
        conn = sqlite3.connect(f"file:{benchmarks_db}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row

        cursor = conn.execute(
            "SELECT * FROM art_e_tasks WHERE id = ?",
            (task_id,)
        )
        row = cursor.fetchone()
        conn.close()

        if row:
            return dict(row)
        return None
    except Exception as e:
        print(f"Warning: Could not fetch ART-E task {task_id}: {e}")
        return None


def get_taskset_task(task_id: str) -> Optional[dict]:
    """Fetch taskset task from main database (for expected_output)."""
    try:
        rows = db_utils.query(
            "SELECT * FROM taskset_tasks WHERE id = ?",
            (task_id,)
        )
        if rows:
            task = rows[0]
            # Convert to format expected by extract_comparison_data
            return {
                "id": task["id"],
                "answer": task.get("expected_output", ""),
                "user_message": task.get("user_message", ""),
                "query_date": "",  # Not available in taskset_tasks
                "inbox_address": "",  # Not available
                "message_ids": [],  # Not available
            }
        return None
    except Exception as e:
        print(f"Warning: Could not fetch taskset task {task_id}: {e}")
        return None


def generate_simulated_feedback(
    job_id: str,
    coverage: float = 0.8,
    detail_level: float = 0.6,
    detail_variance: float = 0.2,
    rubric: str = EVALUATION_RUBRIC,
    model: str = "gemini-2.5-flash",
    api_key: Optional[str] = None,
    dry_run: bool = False,
    seed: Optional[int] = None,
    backend_url: str = "http://localhost:8787",
    workspace_id: str = "workspace_default"
) -> "pd.DataFrame":
    """
    Generate simulated human feedback for traces from a taskset run.

    Args:
        job_id: The job ID from a taskset run
        coverage: Fraction of traces to generate feedback for (0.0-1.0)
        detail_level: Mean of the detail score distribution (0.0-1.0)
        detail_variance: Std dev of the detail score distribution
        rubric: Text rubric guiding LLM evaluation (editable)
        model: LLM model to use (gemini-2.5-flash, gpt-4o-mini, claude-3-haiku)
        api_key: Optional API key for the model
        dry_run: If True, don't call API, just preview
        seed: Random seed for reproducibility
        backend_url: Backend API URL (default: http://localhost:8787)
        workspace_id: Workspace ID for API calls (default: workspace_default)

    Returns:
        DataFrame with columns: trace_id, task_id, rating, rating_detail,
                               detail_score, was_inserted
    """
    if not PANDAS_AVAILABLE:
        raise ImportError("pandas is required. Run: pip install pandas")

    if seed is not None:
        random.seed(seed)
        np.random.seed(seed)

    # Initialize LLM client
    llm = LLMClient(model=model, api_key=api_key)

    # Fetch traces for the job
    traces = get_traces_for_job(job_id)
    if not traces:
        print(f"No traces found for job_id: {job_id}")
        return pd.DataFrame()

    print(f"Found {len(traces)} traces for job {job_id}")

    results = []

    for trace in traces:
        trace_id = trace["id"]

        # Sample for coverage
        if random.random() > coverage:
            continue

        # Get task ID and agent ID from trace/metadata
        metadata = trace.get("metadata", {})
        if isinstance(metadata, str):
            metadata = json.loads(metadata) if metadata else {}

        task_id = metadata.get("taskId") or metadata.get("task_id")
        agent_id = trace.get("agent_id") or metadata.get("agentId") or metadata.get("agent_id")

        if not task_id:
            print(f"Warning: No task_id in trace {trace_id}, skipping")
            continue

        # Get ground truth - try taskset_tasks first (string IDs), then ART-E (numeric IDs)
        if isinstance(task_id, str) and task_id.startswith("task_"):
            # Taskset task ID format
            ground_truth = get_taskset_task(task_id)
        else:
            # Try as numeric ART-E task ID
            try:
                ground_truth = get_art_e_task(int(task_id))
            except (ValueError, TypeError):
                ground_truth = get_taskset_task(str(task_id))

        if not ground_truth:
            print(f"Warning: Could not find task {task_id}, skipping")
            continue

        # Alias for compatibility
        art_e_task = ground_truth

        # Extract comparison data
        trace_dict = db_utils.trace_to_dict_for_eval(trace)
        comparison_data = extract_comparison_data(trace_dict, art_e_task)

        # Sample detail score
        detail_score = np.random.normal(detail_level, detail_variance)
        detail_score = np.clip(detail_score, 0.0, 1.0)

        # Generate feedback
        try:
            rating, rating_detail = generate_feedback_for_trace(
                comparison_data, detail_score, rubric, llm
            )
        except Exception as e:
            print(f"Error generating feedback for trace {trace_id}: {e}")
            rating = "neutral"
            rating_detail = None

        # Insert via API (unless dry_run)
        was_inserted = False
        if not dry_run:
            try:
                was_inserted = _insert_feedback(
                    trace_id, rating, rating_detail,
                    agent_id=agent_id,
                    backend_url=backend_url, workspace_id=workspace_id
                )
            except Exception as e:
                print(f"Error inserting feedback for trace {trace_id}: {e}")

        results.append({
            "trace_id": trace_id,
            "task_id": task_id,
            "rating": rating,
            "rating_detail": rating_detail,
            "detail_score": detail_score,
            "was_inserted": was_inserted,
            "expected_answer": comparison_data["expected_answer"][:100],
            "agent_answer": comparison_data["agent_answer"][:100],
        })

        print(f"  [{rating}] {trace_id[:20]}... - {rating_detail or '(no detail)'}")

    df = pd.DataFrame(results)

    # Summary
    if len(df) > 0:
        print(f"\n{'='*50}")
        print(f"Generated feedback for {len(df)} traces")
        print(f"Rating distribution: {df['rating'].value_counts().to_dict()}")
        print(f"With textual detail: {(df['rating_detail'].notna()).sum()}")
        if dry_run:
            print("(DRY RUN - no data written to database)")

    return df


def _insert_feedback(trace_id: str, rating: str, rating_detail: Optional[str],
                     agent_id: Optional[str] = None,
                     backend_url: str = "http://localhost:8787",
                     workspace_id: str = "workspace_default") -> bool:
    """Insert or update feedback via the API (not direct DB writes)."""
    import requests

    url = f"{backend_url}/api/feedback"
    headers = {
        "Content-Type": "application/json",
        "X-Workspace-Id": workspace_id
    }
    payload = {
        "trace_id": trace_id,
        "rating": rating,
        "notes": rating_detail  # API uses 'notes', stored as 'rating_detail'
    }
    # agent_id is required for feedback to appear in list queries
    if agent_id:
        payload["agent_id"] = agent_id

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        return True
    except requests.exceptions.RequestException as e:
        print(f"API error for trace {trace_id}: {e}")
        return False


def get_recent_taskset_runs(limit: int = 10) -> "pd.DataFrame":
    """Get recent taskset runs from the jobs table."""
    if not PANDAS_AVAILABLE:
        raise ImportError("pandas is required. Run: pip install pandas")

    sql = """
    SELECT
        j.id as job_id,
        j.status,
        j.agent_id,
        json_extract(j.metadata, '$.taskset_id') as taskset_id,
        json_extract(j.result, '$.task_count') as task_count,
        json_extract(j.result, '$.average_score') as avg_score,
        j.created_at,
        j.completed_at
    FROM jobs j
    WHERE j.type = 'taskset_run'
    ORDER BY j.created_at DESC
    LIMIT ?
    """

    results = db_utils.query(sql, (limit,))
    return pd.DataFrame(results)


def clear_feedback_for_job(job_id: str) -> int:
    """Delete all feedback for traces from a specific job (useful for re-running)."""
    traces = get_traces_for_job(job_id)
    trace_ids = [t["id"] for t in traces]

    if not trace_ids:
        return 0

    db_path = db_utils.find_d1_database()
    conn = sqlite3.connect(db_path)

    try:
        placeholders = ",".join("?" * len(trace_ids))
        cursor = conn.execute(
            f"DELETE FROM feedback WHERE trace_id IN ({placeholders})",
            trace_ids
        )
        deleted = cursor.rowcount
        conn.commit()
        return deleted
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Example Usage
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("Feedback Simulator Module")
    print("="*50)

    # Show recent taskset runs
    try:
        runs = get_recent_taskset_runs(limit=5)
        if len(runs) > 0:
            print("\nRecent Taskset Runs:")
            print(runs.to_string(index=False))
        else:
            print("\nNo taskset runs found.")
    except Exception as e:
        print(f"Error fetching taskset runs: {e}")

    print("\nUsage:")
    print("  from feedback_simulator import generate_simulated_feedback, EVALUATION_RUBRIC")
    print("  results = generate_simulated_feedback(job_id='...', dry_run=True)")
