# notebooks/iofold_eval_core/generation/trace_formatter.py
"""
Trace formatter for LLM-friendly representation.

Converts raw JSON traces to human-readable narrative format
that's easier for LLMs to analyze and reason about.
"""

import json
from typing import Optional, Dict, Any, List


def _extract_user_question(trace: Dict[str, Any]) -> str:
    """Extract the user's question from trace steps."""
    for step in trace.get('steps', []):
        for msg in step.get('messages_added', []):
            if msg.get('role') == 'user':
                return msg.get('content', '')[:500]
    return trace.get('input_preview', '')[:200]


def _format_tool_calls(trace: Dict[str, Any]) -> str:
    """Format tool calls in a readable way."""
    lines = []
    call_num = 1

    for step in trace.get('steps', []):
        for tc in step.get('tool_calls', []):
            tool_name = tc.get('tool_name', 'unknown')
            args = tc.get('arguments', {})
            result = tc.get('result', {}).get('kwargs', {})
            status = result.get('status', 'unknown')
            content = result.get('content', '')

            # Parse result summary
            result_summary = ''
            if status == 'error':
                result_summary = 'ERROR'
            elif status == 'success':
                try:
                    data = json.loads(content)
                    if 'total' in data:
                        total = data['total']
                        result_summary = f'Found {total} email(s)' if total > 0 else 'No emails found'
                    elif 'message_id' in data:
                        result_summary = 'Retrieved email content'
                    else:
                        result_summary = 'Success'
                except:
                    if '"total": 0' in content or '"emails": []' in content:
                        result_summary = 'No emails found'
                    elif 'Error' in content:
                        result_summary = 'ERROR'
                    else:
                        result_summary = 'Success'

            # Format arguments
            args_str = ', '.join(f'{k}={repr(v)[:50]}' for k, v in args.items())

            lines.append(f"  {call_num}. {tool_name}({args_str}) -> {result_summary}")
            call_num += 1

    return '\n'.join(lines) if lines else '  (no tool calls)'


def format_trace_for_llm(
    trace: Dict[str, Any],
    rating: str,
    rating_detail: Optional[str] = None,
    include_full_steps: bool = False,
) -> str:
    """
    Format a trace for LLM analysis.

    Args:
        trace: Raw trace dict with steps, output_preview, etc.
        rating: Human rating ('positive', 'negative', 'neutral')
        rating_detail: Optional explanation of the rating
        include_full_steps: If True, include raw step data

    Returns:
        Formatted string suitable for LLM prompts
    """
    trace_id = trace.get('id', trace.get('trace_id', 'unknown'))
    user_question = _extract_user_question(trace)
    agent_answer = trace.get('output_preview', '')
    tool_usage = _format_tool_calls(trace)
    has_errors = trace.get('has_errors', False)
    step_count = trace.get('step_count', len(trace.get('steps', [])))

    parts = [
        f"=== TRACE: {trace_id} ===",
        "",
        "USER QUESTION:",
        user_question,
        "",
        f"TOOL USAGE ({step_count} steps, errors={has_errors}):",
        tool_usage,
        "",
        "AGENT ANSWER:",
        agent_answer,
        "",
        f"HUMAN RATING: {rating}",
    ]

    if rating_detail:
        parts.append(f"FEEDBACK: {rating_detail}")

    if include_full_steps:
        parts.extend([
            "",
            "RAW STEPS:",
            json.dumps(trace.get('steps', [])[:3], indent=2, default=str)[:2000],
        ])

    return '\n'.join(parts)


def format_trace_pair(
    pos_trace: Dict[str, Any],
    pos_rating: str,
    pos_detail: Optional[str],
    neg_trace: Dict[str, Any],
    neg_rating: str,
    neg_detail: Optional[str],
) -> str:
    """
    Format a contrastive pair of traces for analysis.

    Args:
        pos_trace: Positive-rated trace
        pos_rating, pos_detail: Rating info for positive trace
        neg_trace: Negative-rated trace
        neg_rating, neg_detail: Rating info for negative trace

    Returns:
        Formatted comparison suitable for contrastive analysis
    """
    parts = [
        "=== POSITIVE TRACE ===",
        format_trace_for_llm(pos_trace, pos_rating, pos_detail),
        "",
        "=== NEGATIVE TRACE ===",
        format_trace_for_llm(neg_trace, neg_rating, neg_detail),
        "",
        "CONTRAST: What specific differences caused the different ratings?",
    ]

    return '\n'.join(parts)


def format_traces_batch(
    traces: List[Dict[str, Any]],
    ratings: List[str],
    details: List[Optional[str]],
    max_traces: int = 10,
) -> str:
    """Format multiple traces for batch analysis."""
    parts = []
    for i, (trace, rating, detail) in enumerate(zip(traces[:max_traces], ratings[:max_traces], details[:max_traces])):
        parts.append(f"### Example {i+1}")
        parts.append(format_trace_for_llm(trace, rating, detail))
        parts.append("")
    return '\n'.join(parts)
