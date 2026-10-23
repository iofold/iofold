"""
Sandbox executor for reward/eval functions.

Provides safe execution of dynamically generated evaluation functions
with restricted imports and timeout support.
"""

import json
from typing import Any, Optional, Tuple

# Allowed modules for sandboxed execution
# These are safe, stateless modules that don't allow filesystem/network access
ALLOWED_MODULES = {
    'json': __import__('json'),
    're': __import__('re'),
    'math': __import__('math'),
    'datetime': __import__('datetime'),
    'difflib': __import__('difflib'),
    'typing': __import__('typing'),
}


def _parse_json_fields(trace: dict) -> dict:
    """Parse JSON string fields in a trace dict.

    Handles steps, spans, metadata, and raw_data fields that may
    be stored as JSON strings instead of Python objects.

    Args:
        trace: Trace dict with potentially stringified JSON fields

    Returns:
        New trace dict with parsed JSON fields
    """
    trace_copy = dict(trace)

    # Fields that may be JSON strings
    json_fields = ['steps', 'spans', 'metadata', 'raw_data']

    for field in json_fields:
        value = trace_copy.get(field)
        if isinstance(value, str):
            if value.strip():
                try:
                    trace_copy[field] = json.loads(value)
                except json.JSONDecodeError:
                    # Keep as string if not valid JSON
                    pass
            else:
                # Empty string -> empty list/dict depending on field
                trace_copy[field] = [] if field in ('steps', 'spans') else {}

    return trace_copy


def _find_eval_function(namespace: dict) -> Optional[callable]:
    """Find an eval_* or reward_* function in the namespace.

    Args:
        namespace: Execution namespace to search

    Returns:
        The callable eval/reward function, or None if not found
    """
    for name, obj in namespace.items():
        if callable(obj) and (name.startswith('eval_') or name.startswith('reward_')):
            return obj
    return None


def _normalize_result(result: Any) -> Tuple[float, str]:
    """Normalize an eval function result to (score, feedback) tuple.

    Args:
        result: Raw result from eval function

    Returns:
        Tuple of (score in [0,1], feedback string)

    Raises:
        ValueError: If result cannot be normalized
    """
    if isinstance(result, tuple):
        if len(result) >= 2:
            score = float(result[0])
            feedback = str(result[1])
            return (max(0.0, min(1.0, score)), feedback)
        elif len(result) == 1:
            score = float(result[0])
            return (max(0.0, min(1.0, score)), "")
        else:
            raise ValueError("Empty tuple returned from eval function")
    elif isinstance(result, (int, float)):
        score = float(result)
        return (max(0.0, min(1.0, score)), "")
    elif isinstance(result, bool):
        return (1.0 if result else 0.0, "")
    elif isinstance(result, dict):
        # Support dict format: {"score": 0.8, "feedback": "..."}
        score = float(result.get('score', 0.0))
        feedback = str(result.get('feedback', ''))
        return (max(0.0, min(1.0, score)), feedback)
    else:
        raise ValueError(
            f"Unsupported result type: {type(result).__name__}. "
            f"Expected tuple[float, str], float, or dict."
        )


def execute_reward_function(
    code: str,
    trace: dict,
    ctx: Optional[Any] = None,
    timeout: float = 5.0,
) -> Tuple[float, str]:
    """Execute a reward/eval function in a sandboxed environment.

    The code should define a function named `eval_*` or `reward_*` that
    takes a trace dict and optional context, returning either:
    - A tuple of (score, feedback) where score is 0-1
    - A float score in [0, 1]
    - A bool (True -> 1.0, False -> 0.0)
    - A dict with 'score' and optional 'feedback' keys

    Args:
        code: Python code containing an eval_* or reward_* function
        trace: Trace dict to evaluate (may contain JSON string fields)
        ctx: Optional context object (reserved for future LLM calls)
        timeout: Execution timeout in seconds (not enforced in basic impl)

    Returns:
        Tuple of (score in [0,1], feedback string)

    Raises:
        ValueError: If no eval function found in code
        RuntimeError: If execution fails

    Example:
        >>> code = '''
        ... def eval_has_errors(trace, ctx=None):
        ...     for step in trace.get('steps', []):
        ...         if 'error' in str(step).lower():
        ...             return 0.0, "Found error in trace"
        ...     return 1.0, "No errors detected"
        ... '''
        >>> execute_reward_function(code, {'steps': []})
        (1.0, 'No errors detected')
    """
    # Parse JSON string fields
    trace_parsed = _parse_json_fields(trace)

    # Build restricted execution namespace
    local_vars = {
        'trace': trace_parsed,
        'ctx': ctx,
        **ALLOWED_MODULES,
    }

    # Execute the code in the restricted namespace
    try:
        exec(code, local_vars)
    except SyntaxError as e:
        raise RuntimeError(f"Syntax error in eval code: {e}")
    except Exception as e:
        raise RuntimeError(f"Error executing eval code: {e}")

    # Find the eval function
    eval_fn = _find_eval_function(local_vars)
    if eval_fn is None:
        raise ValueError(
            "No eval_* or reward_* function found in code. "
            "Define a function like: def eval_quality(trace, ctx=None): ..."
        )

    # Call the eval function
    try:
        result = eval_fn(trace_parsed, ctx)
    except Exception as e:
        raise RuntimeError(f"Error calling eval function: {e}")

    # Normalize and return the result
    try:
        return _normalize_result(result)
    except Exception as e:
        raise RuntimeError(f"Error normalizing result: {e}")


def execute_batch(
    code: str,
    traces: list,
    ctx: Optional[Any] = None,
    timeout_per_trace: float = 5.0,
    stop_on_error: bool = False,
) -> list:
    """Execute a reward function on multiple traces.

    Args:
        code: Python code containing an eval_* or reward_* function
        traces: List of trace dicts to evaluate
        ctx: Optional context object
        timeout_per_trace: Timeout per trace in seconds
        stop_on_error: If True, stop on first error; if False, continue

    Returns:
        List of result dicts with keys:
        - 'trace_id': ID of the trace
        - 'score': Score (0-1) or None if error
        - 'feedback': Feedback string or None if error
        - 'error': Error message or None if success
    """
    results = []

    for trace in traces:
        trace_id = trace.get('id', trace.get('trace_id', 'unknown'))

        try:
            score, feedback = execute_reward_function(
                code, trace, ctx, timeout_per_trace
            )
            results.append({
                'trace_id': trace_id,
                'score': score,
                'feedback': feedback,
                'error': None,
            })
        except Exception as e:
            if stop_on_error:
                raise
            results.append({
                'trace_id': trace_id,
                'score': None,
                'feedback': None,
                'error': str(e),
            })

    return results
