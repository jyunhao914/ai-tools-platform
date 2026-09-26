import hashlib

import pytest

from presentation_maker_offline.project_document import new_project_document, validate_project_document
from presentation_maker_offline.source_library import add_file_source, add_text_source, append_fragment_to_slide, source_preview


def test_file_source_is_managed_versioned_and_does_not_modify_slides(tmp_path):
    original = tmp_path / "notes.txt"
    original.write_text("第一點\n第二點", encoding="utf-8")
    project = tmp_path / "project"
    first = add_file_source(original, project, [])
    assert first["role"] == "補充資料"
    assert first["version"] == 1
    assert first["fragments"][0]["text"] == "第二點"
    managed = project / "sources" / first["managed_path"]
    assert managed.read_bytes() == original.read_bytes()
    assert first["content_sha256"] == hashlib.sha256(managed.read_bytes()).hexdigest()
    original.write_text("更新後內容\n第二點", encoding="utf-8")
    second = add_file_source(original, project, [first])
    assert second["version"] == 2
    assert second["id"] != first["id"]
    assert managed.read_text(encoding="utf-8") == "第一點\n第二點"


def test_pasted_source_keeps_text_and_versions():
    first = add_text_source("  重要來源內容  ", [], name="指南")
    second = add_text_source("新版內容", [first], name="指南", role="修改依據", scope="頁 3")
    assert first["fragments"][0]["text"] == "重要來源內容"
    assert second["version"] == 2
    assert "頁 3" in source_preview(second)


def test_explicit_source_insert_preserves_citation_and_rejects_stale_source():
    source = add_text_source("可追溯內容", [], name="指南")
    document = new_project_document("簡報")
    document["sources"].append(source)
    slide = {"id": "slide-1", "title": "現有頁", "elements": []}
    document["slides"].append(slide)
    element = append_fragment_to_slide(slide, source, source["fragments"][0]["id"])
    validate_project_document(document)
    assert element["source_ref"]["source_id"] == source["id"]
    source["version"] = 2
    with pytest.raises(ValueError, match="資料引用"):
        validate_project_document(document)


def test_style_reference_cannot_be_inserted_as_slide_text():
    source = add_text_source("柔和配色", [], role="風格參考")
    with pytest.raises(ValueError, match="風格參考"):
        append_fragment_to_slide({"elements": []}, source, source["fragments"][0]["id"])
