# notebooks/iofold_eval_core/generation/test_trace_formatter.py
import pytest
from .trace_formatter import format_trace_for_llm, format_trace_pair


def test_format_trace_for_llm_basic():
    trace = {
        'id': 'trace_123',
        'input_preview': 'What is the meeting time?',
        'output_preview': 'The meeting is at 3pm.',
        'steps': [
            {
                'messages_added': [
                    {'role': 'user', 'content': 'What is the meeting time?'}
                ],
                'tool_calls': [
                    {
                        'tool_name': 'email_search',
                        'arguments': {'keywords': ['meeting']},
                        'result': {'kwargs': {'status': 'success', 'content': '{"emails": [{"subject": "Meeting at 3pm"}], "total": 1}'}}
                    }
                ]
            }
        ],
        'has_errors': False,
        'step_count': 1,
    }
    rating = 'positive'
    rating_detail = 'Correctly identified meeting time from email'

    result = format_trace_for_llm(trace, rating, rating_detail)

    assert '=== TRACE: trace_123 ===' in result
    assert 'USER QUESTION:' in result
    assert 'What is the meeting time?' in result
    assert 'TOOL USAGE' in result  # Format includes step count
    assert 'email_search' in result
    assert 'Found 1 email' in result
    assert 'AGENT ANSWER:' in result
    assert 'The meeting is at 3pm.' in result
    assert 'HUMAN RATING: positive' in result
    assert 'Correctly identified' in result


def test_format_trace_pair():
    positive_trace = {'id': 'pos_1', 'output_preview': 'Found at 3pm', 'steps': [], 'input_preview': 'When?'}
    negative_trace = {'id': 'neg_1', 'output_preview': 'Found at 3pm', 'steps': [], 'input_preview': 'When?'}

    result = format_trace_pair(
        positive_trace, 'positive', 'Correct time',
        negative_trace, 'negative', 'Wrong - no email found'
    )

    assert '=== POSITIVE TRACE ===' in result
    assert '=== NEGATIVE TRACE ===' in result
    assert 'CONTRAST:' in result
