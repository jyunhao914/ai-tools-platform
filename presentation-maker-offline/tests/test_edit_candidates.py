import pytest

from presentation_maker_offline.edit_candidates import accept_text_candidate, reject_candidate, stage_text_candidate
from presentation_maker_offline.project_document import new_project_document, validate_project_document


def _document():
    document = new_project_document("測試")
    document["slides"] = [{"id": "slide", "title": "健康", "elements": [
        {"id": "body", "type": "text", "text": "原始重點"}]}]
    return document


def test_text_candidate_does_not_modify_until_accepted_and_survives_validation():
    document = _document()
    candidate = stage_text_candidate(document, "slide", "body", "新重點", "潤飾這一句", 1)
    assert document["slides"][0]["elements"][0]["text"] == "原始重點"
    validate_project_document(document)
    accept_text_candidate(document, candidate["id"], current_revision=2)
    assert document["slides"][0]["elements"][0]["text"] == "新重點"
    assert candidate["status"] == "accepted"


def test_stale_candidate_cannot_replace_human_edit():
    document = _document()
    candidate = stage_text_candidate(document, "slide", "body", "模型提案", "改寫", 1)
    document["slides"][0]["elements"][0]["text"] = "人工已改"
    with pytest.raises(RuntimeError, match="衝突"):
        accept_text_candidate(document, candidate["id"], current_revision=3)
    assert document["slides"][0]["elements"][0]["text"] == "人工已改"


def test_reject_keeps_original_and_prevents_reuse():
    document = _document()
    candidate = stage_text_candidate(document, "slide", "body", "待取消", "改寫", 1)
    reject_candidate(document, candidate["id"])
    with pytest.raises(ValueError):
        accept_text_candidate(document, candidate["id"], current_revision=2)
    assert document["slides"][0]["elements"][0]["text"] == "原始重點"
