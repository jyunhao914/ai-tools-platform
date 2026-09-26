"""Conservative diagnostics for recognized slide copy, not medical validation."""
from __future__ import annotations

from collections import Counter
from difflib import SequenceMatcher
import re
import unicodedata


def _normalize(text: str) -> str:
    # Whitespace can change with layout. Do not erase punctuation or digits.
    return re.sub(r'\s+', '', unicodedata.normalize('NFC', text))


def compare_copy(expected: str, recognized: str | None) -> dict:
    """Unknown OCR and approximate matches must not approve a generated page.

    Callers supply visible copy only (no Markdown or visual instructions).
    Reordering and OCR mistakes require review, not automatic source rewriting.
    """
    if recognized is None:
        return {'status': 'unverified', 'reason': 'recognition_not_available',
                'automatic_approval': False}
    source, actual = _normalize(expected), _normalize(recognized)
    pattern = r'\d+(?:[.,]\d+)*'
    source_numbers = Counter(re.findall(pattern, source))
    actual_numbers = Counter(re.findall(pattern, actual))
    changes = []
    for operation, a, b, c, d in SequenceMatcher(None, source, actual, autojunk=False).get_opcodes():
        if operation != 'equal':
            changes.append({'operation': operation, 'expected': source[a:b],
                            'recognized': actual[c:d]})
    return {'status': 'text_match' if source and source == actual else 'needs_review',
            'missing_numbers': list((source_numbers - actual_numbers).elements()),
            'extra_numbers': list((actual_numbers - source_numbers).elements()),
            'changes': changes, 'automatic_approval': False}
