"""
Database utilities for iofold notebook experimentation.

Provides direct SQLite access to the local D1 database for trace analysis
and eval experimentation without modifying the main system.
"""

import sqlite3
import json
import os
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, Any, TypedDict
from datetime import datetime

# Optional pandas import
try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False
    pd = None


# ---------------------------------------------------------------------------
# Database Connection
# ---------------------------------------------------------------------------

def get_project_root() -> Path:
    """Get the project root directory."""
    notebook_dir = Path(__file__).parent
    return notebook_dir.parent


def find_d1_database(required_table: str = "traces") -> Path:
    """
    Find the main D1 SQLite database file that contains application data.

    The D1 database is stored by Miniflare in .wrangler/state/v3/d1/
    The main database has traces, agents, evals tables.

    Args:
        required_table: Table name that must exist in the database (default: "traces")
    """
    project_root = get_project_root()
    d1_dir = project_root / ".wrangler" / "state" / "v3" / "d1" / "miniflare-D1DatabaseObject"

    if not d1_dir.exists():
        raise FileNotFoundError(
            f"D1 database directory not found at {d1_dir}. "
            "Run 'pnpm run dev' first to initialize the local database."
        )

    sqlite_files = list(d1_dir.glob("*.sqlite"))
    if not sqlite_files:
        raise FileNotFoundError(f"No SQLite files found in {d1_dir}")

    # Find the database that contains the required table
    for db_path in sqlite_files:
        try:
            conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                (required_table,)
            )
            if cursor.fetchone():
                conn.close()
                return db_path
            conn.close()
        except Exception:
            continue

    # Fallback: return the database with most tables (likely the main one)
    max_tables = 0
    best_db = sqlite_files[0]
    for db_path in sqlite_files:
        try:
            conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
            cursor = conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'")
            count = cursor.fetchone()[0]
            if count > max_tables:
                max_tables = count
                best_db = db_path
            conn.close()
        except Exception:
            continue

    return best_db


def find_benchmarks_database() -> Path:
    """
    Find the benchmarks D1 database (with Enron emails, ART-E tasks).
    """
    return find_d1_database(required_table="emails")


def get_connection(readonly: bool = True) -> sqlite3.Connection:
    """
    Get a connection to the local D1 database.

    Args:
        readonly: If True, open in read-only mode (safer for experimentation)

    Returns:
        SQLite connection with row_factory for dict-like access
    """
    db_path = find_d1_database()

    if readonly:
        # Read-only connection via URI
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    else:
        conn = sqlite3.connect(db_path)

    # Enable dict-like row access
    conn.row_factory = sqlite3.Row
    return conn


def query(sql: str, params: tuple = (), as_df: bool = False):
    """
    Execute a query and return results.

    Args:
        sql: SQL query string
        params: Query parameters
        as_df: If True, return a pandas DataFrame (requires pandas)

    Returns:
        List of dicts or DataFrame
    """
    conn = get_connection()
    try:
        cursor = conn.execute(sql, params)
        rows = cursor.fetchall()
        results = [dict(row) for row in rows]

        if as_df:
            if not PANDAS_AVAILABLE:
                raise ImportError("pandas is required for as_df=True. Install with: pip install pandas")
            return pd.DataFrame(results)
        return results
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Trace Data Types (matching TypeScript interfaces)
# ---------------------------------------------------------------------------

class Message(TypedDict):
    role: str  # 'user' | 'assistant' | 'system'
    content: str
    metadata: Optional[dict]


class ToolCall(TypedDict):
    tool_name: str
    arguments: dict
    result: Optional[Any]
    error: Optional[str]


class ExecutionStep(TypedDict):
    step_id: str
    timestamp: str
    messages_added: list[Message]
    tool_calls: list[ToolCall]
    input: Any
    output: Any
    error: Optional[str]
    metadata: dict


@dataclass
class Trace:
    """Represents a trace from the database."""
    id: str
    trace_id: str
    workspace_id: str
    integration_id: str
    source: str
    timestamp: str
    imported_at: str
    steps: list[ExecutionStep]
    raw_data: Optional[dict]
    metadata: Optional[dict]
    input_preview: Optional[str]
    output_preview: Optional[str]
    step_count: int
    has_errors: bool
    agent_version_id: Optional[str]
    assignment_status: str

    @classmethod
    def from_row(cls, row: dict) -> "Trace":
        """Create Trace from database row."""
        return cls(
            id=row["id"],
            trace_id=row["trace_id"],
            workspace_id=row["workspace_id"],
            integration_id=row["integration_id"],
            source=row["source"],
            timestamp=row["timestamp"],
            imported_at=row["imported_at"],
            steps=json.loads(row["steps"]) if row["steps"] else [],
            raw_data=json.loads(row["raw_data"]) if row.get("raw_data") else None,
            metadata=json.loads(row["metadata"]) if row.get("metadata") else None,
            input_preview=row.get("input_preview"),
            output_preview=row.get("output_preview"),
            step_count=row.get("step_count", 0),
            has_errors=bool(row.get("has_errors", False)),
            agent_version_id=row.get("agent_version_id"),
            assignment_status=row.get("assignment_status", "unassigned"),
        )


@dataclass
class Feedback:
    """Represents feedback on a trace."""
    id: str
    trace_id: str
    agent_id: Optional[str]
    rating: str  # 'positive' | 'negative' | 'neutral'
    rating_detail: Optional[str]
    created_at: str

    @classmethod
    def from_row(cls, row: dict) -> "Feedback":
        return cls(
            id=row["id"],
            trace_id=row["trace_id"],
            agent_id=row.get("agent_id"),
            rating=row["rating"],
            rating_detail=row.get("rating_detail"),
            created_at=row["created_at"],
        )


@dataclass
class EvalCandidate:
    """Represents an eval candidate from the database."""
    id: str
    agent_id: str
    code: str
    variation: str
    status: str
    agreement_rate: Optional[float]
    accuracy: Optional[float]
    cohen_kappa: Optional[float]
    f1_score: Optional[float]
    confusion_matrix: Optional[dict]
    per_trace_results: Optional[list]
    total_cost_usd: Optional[float]
    avg_duration_ms: Optional[float]
    created_at: str
    activated_at: Optional[str]

    @classmethod
    def from_row(cls, row: dict) -> "EvalCandidate":
        return cls(
            id=row["id"],
            agent_id=row["agent_id"],
            code=row["code"],
            variation=row.get("variation", ""),
            status=row.get("status", "candidate"),
            agreement_rate=row.get("agreement_rate"),
            accuracy=row.get("accuracy"),
            cohen_kappa=row.get("cohen_kappa"),
            f1_score=row.get("f1_score"),
            confusion_matrix=json.loads(row["confusion_matrix"]) if row.get("confusion_matrix") else None,
            per_trace_results=json.loads(row["per_trace_results"]) if row.get("per_trace_results") else None,
            total_cost_usd=row.get("total_cost_usd"),
            avg_duration_ms=row.get("avg_duration_ms"),
            created_at=row.get("created_at", ""),
            activated_at=row.get("activated_at"),
        )


# ---------------------------------------------------------------------------
# High-level Query Functions
# ---------------------------------------------------------------------------

def list_tables() -> list[str]:
    """List all tables in the database."""
    rows = query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    return [row["name"] for row in rows]


def get_table_schema(table_name: str, as_df: bool = True):
    """Get schema for a table."""
    return query(f"PRAGMA table_info({table_name})", as_df=as_df)


def get_traces(
    limit: int = 100,
    agent_id: Optional[str] = None,
    has_feedback: Optional[bool] = None,
    source: Optional[str] = None,
    as_objects: bool = False
) -> list[dict] | list[Trace]:
    """
    Fetch traces from the database.

    Args:
        limit: Maximum number of traces to return
        agent_id: Filter by agent ID
        has_feedback: Filter by whether trace has feedback
        source: Filter by source ('langfuse', 'langsmith', 'openai', 'playground')
        as_objects: If True, return Trace objects instead of dicts

    Returns:
        List of traces
    """
    sql = """
    SELECT t.*, f.id as feedback_id, f.rating, f.rating_detail
    FROM traces t
    LEFT JOIN feedback f ON f.trace_id = t.id
    WHERE 1=1
    """
    params = []

    if agent_id:
        sql += " AND t.agent_version_id IN (SELECT id FROM agent_versions WHERE agent_id = ?)"
        params.append(agent_id)

    if has_feedback is not None:
        if has_feedback:
            sql += " AND f.id IS NOT NULL"
        else:
            sql += " AND f.id IS NULL"

    if source:
        sql += " AND t.source = ?"
        params.append(source)

    sql += " ORDER BY t.imported_at DESC LIMIT ?"
    params.append(limit)

    rows = query(sql, tuple(params))

    if as_objects:
        return [Trace.from_row(row) for row in rows]
    return rows


def get_trace_by_id(trace_id: str) -> Optional[Trace]:
    """Fetch a single trace by ID."""
    rows = query("SELECT * FROM traces WHERE id = ?", (trace_id,))
    if rows:
        return Trace.from_row(rows[0])
    return None


def get_labeled_traces(
    agent_id: Optional[str] = None,
    limit: int = 100
) -> list[dict]:
    """
    Fetch traces with human feedback (labeled traces).

    Returns traces with their feedback rating, which can be used for
    eval generation and testing.
    """
    sql = """
    SELECT
        t.*,
        f.rating,
        f.rating_detail,
        CASE
            WHEN f.rating = 'positive' THEN 1.0
            WHEN f.rating = 'negative' THEN 0.0
            ELSE 0.5
        END as human_score
    FROM traces t
    INNER JOIN feedback f ON f.trace_id = t.id
    WHERE 1=1
    """
    params = []

    if agent_id:
        sql += " AND f.agent_id = ?"
        params.append(agent_id)

    sql += " ORDER BY t.imported_at DESC LIMIT ?"
    params.append(limit)

    return query(sql, tuple(params))


def get_agents() -> list[dict]:
    """Fetch all agents."""
    return query("""
        SELECT a.*,
               COUNT(DISTINCT av.id) as version_count,
               a.active_eval_id
        FROM agents a
        LEFT JOIN agent_versions av ON av.agent_id = a.id
        GROUP BY a.id
        ORDER BY a.created_at DESC
    """)


def get_eval_candidates(agent_id: Optional[str] = None) -> list[EvalCandidate]:
    """Fetch eval candidates, optionally filtered by agent."""
    sql = "SELECT * FROM eval_candidates"
    params = []

    if agent_id:
        sql += " WHERE agent_id = ?"
        params.append(agent_id)

    sql += " ORDER BY created_at DESC"

    rows = query(sql, tuple(params))
    return [EvalCandidate.from_row(row) for row in rows]


def get_trace_statistics() -> dict:
    """Get statistics about traces in the database."""
    stats = {}

    # Total traces
    rows = query("SELECT COUNT(*) as count FROM traces")
    stats["total_traces"] = rows[0]["count"]

    # Traces by source
    rows = query("SELECT source, COUNT(*) as count FROM traces GROUP BY source")
    stats["by_source"] = {row["source"]: row["count"] for row in rows}

    # Traces with feedback
    rows = query("""
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN f.id IS NOT NULL THEN 1 ELSE 0 END) as with_feedback
        FROM traces t
        LEFT JOIN feedback f ON f.trace_id = t.id
    """)
    stats["with_feedback"] = rows[0]["with_feedback"]
    stats["without_feedback"] = stats["total_traces"] - stats["with_feedback"]

    # Feedback distribution
    rows = query("SELECT rating, COUNT(*) as count FROM feedback GROUP BY rating")
    stats["feedback_distribution"] = {row["rating"]: row["count"] for row in rows}

    return stats


# ---------------------------------------------------------------------------
# Trace Analysis Utilities
# ---------------------------------------------------------------------------

def extract_user_message(trace: Trace | dict) -> Optional[str]:
    """Extract the user message from a trace."""
    if isinstance(trace, dict):
        steps = trace.get("steps", [])
        if isinstance(steps, str):
            steps = json.loads(steps)
    else:
        steps = trace.steps

    for step in steps:
        messages = step.get("messages_added", [])
        for msg in messages:
            if msg.get("role") == "user":
                return msg.get("content", "")

    return None


def extract_assistant_response(trace: Trace | dict) -> Optional[str]:
    """Extract the final assistant response from a trace."""
    if isinstance(trace, dict):
        steps = trace.get("steps", [])
        if isinstance(steps, str):
            steps = json.loads(steps)
    else:
        steps = trace.steps

    # Look for the last assistant message
    for step in reversed(steps):
        messages = step.get("messages_added", [])
        for msg in reversed(messages):
            if msg.get("role") == "assistant":
                return msg.get("content", "")

        # Also check output
        output = step.get("output")
        if output and isinstance(output, str):
            return output

    return None


def extract_tool_calls(trace: Trace | dict) -> list[dict]:
    """Extract all tool calls from a trace."""
    if isinstance(trace, dict):
        steps = trace.get("steps", [])
        if isinstance(steps, str):
            steps = json.loads(steps)
    else:
        steps = trace.steps

    tool_calls = []
    for step in steps:
        calls = step.get("tool_calls", [])
        tool_calls.extend(calls)

    return tool_calls


def has_errors(trace: Trace | dict) -> bool:
    """Check if a trace has any errors."""
    if isinstance(trace, dict):
        if trace.get("has_errors"):
            return True
        steps = trace.get("steps", [])
        if isinstance(steps, str):
            steps = json.loads(steps)
    else:
        if trace.has_errors:
            return True
        steps = trace.steps

    for step in steps:
        if step.get("error"):
            return True
        for tool_call in step.get("tool_calls", []):
            if tool_call.get("error"):
                return True

    return False


def trace_to_dict_for_eval(trace: Trace | dict) -> dict:
    """
    Convert a trace to the dict format expected by eval functions.

    This matches the `trace` parameter passed to Python eval functions.
    """
    if isinstance(trace, Trace):
        return {
            "id": trace.id,
            "trace_id": trace.trace_id,
            "source": trace.source,
            "timestamp": trace.timestamp,
            "steps": trace.steps,
            "raw_data": trace.raw_data,
            "metadata": trace.metadata,
        }

    # Already a dict, parse JSON fields if needed
    result = dict(trace)
    if isinstance(result.get("steps"), str):
        result["steps"] = json.loads(result["steps"])
    if isinstance(result.get("raw_data"), str):
        result["raw_data"] = json.loads(result["raw_data"]) if result["raw_data"] else None
    if isinstance(result.get("metadata"), str):
        result["metadata"] = json.loads(result["metadata"]) if result["metadata"] else None
    return result


# ---------------------------------------------------------------------------
# Display Utilities
# ---------------------------------------------------------------------------

def print_trace_summary(trace: Trace | dict):
    """Print a human-readable summary of a trace."""
    if isinstance(trace, dict):
        trace_obj = Trace.from_row(trace) if "id" in trace else None
        data = trace
    else:
        trace_obj = trace
        data = {"id": trace.id, "trace_id": trace.trace_id}

    print(f"Trace: {data.get('id', 'N/A')}")
    print(f"  External ID: {data.get('trace_id', 'N/A')}")
    print(f"  Source: {data.get('source', 'N/A')}")
    print(f"  Timestamp: {data.get('timestamp', 'N/A')}")
    print(f"  Steps: {data.get('step_count', len(trace_obj.steps if trace_obj else []))}")
    print(f"  Has Errors: {has_errors(trace)}")

    user_msg = extract_user_message(trace)
    if user_msg:
        print(f"  User Message: {user_msg[:100]}...")

    response = extract_assistant_response(trace)
    if response:
        print(f"  Assistant Response: {response[:100]}...")

    tool_calls = extract_tool_calls(trace)
    if tool_calls:
        print(f"  Tool Calls: {len(tool_calls)}")
        for tc in tool_calls[:3]:
            print(f"    - {tc.get('tool_name', 'unknown')}")
        if len(tool_calls) > 3:
            print(f"    ... and {len(tool_calls) - 3} more")


# ---------------------------------------------------------------------------
# Example Usage
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Quick test
    print("Database Tables:")
    for table in list_tables():
        print(f"  - {table}")

    print("\nTrace Statistics:")
    stats = get_trace_statistics()
    for key, value in stats.items():
        print(f"  {key}: {value}")

    print("\nFirst 3 traces:")
    traces = get_traces(limit=3)
    for trace in traces:
        print_trace_summary(trace)
        print()
