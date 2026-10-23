# notebooks/iofold_eval_core/generation/test_pair_generator.py
import pytest
from .pair_generator import generate_contrastive_pairs, group_traces_by_question_type


def test_group_traces_by_question_type():
    traces = [
        {'id': '1', 'input_preview': 'Were there variances for hour 15?', 'rating': 'positive'},
        {'id': '2', 'input_preview': 'What variances occurred on 3/6?', 'rating': 'negative'},
        {'id': '3', 'input_preview': 'When is the meeting?', 'rating': 'positive'},
        {'id': '4', 'input_preview': 'What time is the meeting scheduled?', 'rating': 'negative'},
    ]

    groups = group_traces_by_question_type(traces)

    # Should group variance questions together, meeting questions together
    assert len(groups) >= 2
    variance_group = [g for g in groups if 'variance' in g['type'].lower()][0]
    assert len(variance_group['traces']) == 2


def test_generate_contrastive_pairs():
    traces = [
        {'id': '1', 'input_preview': 'variance question', 'rating': 'positive', 'rating_detail': 'correct'},
        {'id': '2', 'input_preview': 'variance question', 'rating': 'negative', 'rating_detail': 'wrong'},
    ]

    pairs = generate_contrastive_pairs(traces, max_pairs=5)

    assert len(pairs) >= 1
    assert pairs[0]['positive']['id'] == '1'
    assert pairs[0]['negative']['id'] == '2'
