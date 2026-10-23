# notebooks/iofold_eval_core/generation/pair_generator.py
"""
Contrastive pair generator for trace analysis.

Groups similar traces and pairs positive/negative examples
for contrastive learning.
"""

import re
from typing import List, Dict, Any, Optional
from collections import defaultdict


# Question type patterns
QUESTION_PATTERNS = [
    ('variance', r'variance|variances|differ|discrepancy'),
    ('meeting', r'meeting|schedule|calendar|appointment'),
    ('person', r'who |whose |whom |person|employee|contact'),
    ('time', r'when |what time|date|deadline'),
    ('location', r'where |location|room|office|place'),
    ('email_content', r'what does|what did|email say|message say'),
    ('existence', r'any email|is there|are there|did .* send'),
]


def _detect_question_type(input_preview: str) -> str:
    """Detect the type of question from input preview."""
    input_lower = input_preview.lower()

    for qtype, pattern in QUESTION_PATTERNS:
        if re.search(pattern, input_lower):
            return qtype

    return 'general'


def _extract_keywords(input_preview: str) -> set:
    """Extract meaningful keywords from question."""
    # Remove common words
    stop_words = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'what', 'when',
                  'where', 'who', 'how', 'any', 'for', 'in', 'on', 'at', 'to',
                  'email', 'emails', 'inbox', 'my', 'your', 'find', 'search'}

    words = re.findall(r'\b[a-zA-Z]{3,}\b', input_preview.lower())
    return set(w for w in words if w not in stop_words)


def group_traces_by_question_type(
    traces: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Group traces by question type.

    Args:
        traces: List of trace dicts with 'input_preview' and 'rating'

    Returns:
        List of groups, each with 'type', 'traces', 'positive_count', 'negative_count'
    """
    groups = defaultdict(list)

    for trace in traces:
        qtype = _detect_question_type(trace.get('input_preview', ''))
        groups[qtype].append(trace)

    result = []
    for qtype, group_traces in groups.items():
        pos_count = sum(1 for t in group_traces if t.get('rating') == 'positive')
        neg_count = sum(1 for t in group_traces if t.get('rating') == 'negative')

        result.append({
            'type': qtype,
            'traces': group_traces,
            'positive_count': pos_count,
            'negative_count': neg_count,
        })

    # Sort by number of traces (largest groups first)
    result.sort(key=lambda g: len(g['traces']), reverse=True)

    return result


def generate_contrastive_pairs(
    traces: List[Dict[str, Any]],
    max_pairs: int = 20,
    same_type_only: bool = True,
) -> List[Dict[str, Any]]:
    """
    Generate contrastive pairs of positive/negative traces.

    Args:
        traces: List of trace dicts with rating info
        max_pairs: Maximum number of pairs to generate
        same_type_only: If True, only pair traces of same question type

    Returns:
        List of pairs, each with 'positive' and 'negative' trace dicts
    """
    pairs = []

    if same_type_only:
        groups = group_traces_by_question_type(traces)

        for group in groups:
            positives = [t for t in group['traces'] if t.get('rating') == 'positive']
            negatives = [t for t in group['traces'] if t.get('rating') == 'negative']

            # Pair up within group
            for pos in positives[:max_pairs // len(groups) + 1]:
                for neg in negatives[:max_pairs // len(groups) + 1]:
                    if len(pairs) >= max_pairs:
                        break

                    # Check keyword similarity
                    pos_kw = _extract_keywords(pos.get('input_preview', ''))
                    neg_kw = _extract_keywords(neg.get('input_preview', ''))
                    similarity = len(pos_kw & neg_kw) / max(len(pos_kw | neg_kw), 1)

                    pairs.append({
                        'positive': pos,
                        'negative': neg,
                        'question_type': group['type'],
                        'keyword_similarity': similarity,
                    })

                if len(pairs) >= max_pairs:
                    break
    else:
        positives = [t for t in traces if t.get('rating') == 'positive']
        negatives = [t for t in traces if t.get('rating') == 'negative']

        for pos, neg in zip(positives[:max_pairs], negatives[:max_pairs]):
            pairs.append({
                'positive': pos,
                'negative': neg,
                'question_type': 'mixed',
                'keyword_similarity': 0.0,
            })

    # Sort by similarity (most similar pairs are most useful)
    pairs.sort(key=lambda p: p['keyword_similarity'], reverse=True)

    return pairs[:max_pairs]
