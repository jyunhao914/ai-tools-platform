import pytest
import json
import sqlite3
from presentation_maker_offline.project_document import new_project_document, update_slide_text_element
from presentation_maker_offline.workflow import ImageStrategy, Operation, ProjectStore, Workflow

def test_document_saves_and_reopens_with_revision_guard(tmp_path):
    path = tmp_path / "projects.sqlite3"
    store = ProjectStore(path)
    project_id = Workflow(store).start("example://demo", Operation.KEEP, ImageStrategy.NONE)
    document = new_project_document("範例")
    document["project_id"] = project_id
    document["slides"] = [{"id": "slide-1", "elements": []}]
    document["annotations"] = [{"id": "mark-1", "slide_id": "slide-1", "rect": [0.1, 0.2, 0.7, 0.8], "comment": "保留人物", "status": "待處理"}]
    document["sources"] = [{
        "id": "source-1", "path": "/local/reference.pdf", "role": "supplement", "version": 1,
        "scope": "slide", "scope_target": "slide-1", "pages": [{"title": "參考頁", "elements": []}],
    }]
    document["settings"] = {"operation": "expand", "image_strategy": "generate", "target_pages": 12}
    assert store.save_document(project_id, document, expected_revision=0) == 1
    store.db.close()

    reopened = ProjectStore(path)
    revision, loaded = reopened.load_document(project_id)
    assert revision == loaded["revision"] == 1
    assert loaded["slides"][0]["id"] == "slide-1"
    assert loaded["annotations"][0]["rect"] == [0.1, 0.2, 0.7, 0.8]
    assert loaded["annotations"][0]["comment"] == "保留人物"
    assert loaded["sources"][0]["path"] == "/local/reference.pdf"
    assert loaded["sources"][0]["scope_target"] == "slide-1"
    assert loaded["sources"][0]["pages"][0]["title"] == "參考頁"
    assert loaded["settings"]["target_pages"] == 12
    with pytest.raises(RuntimeError, match="revision conflict"):
        reopened.save_document(project_id, loaded, expected_revision=0)


def test_revision_snapshots_survive_reopen_and_support_undo_branches(tmp_path):
    store = ProjectStore(tmp_path / "history.sqlite3")
    project_id = Workflow(store).start("example://history", Operation.KEEP, ImageStrategy.NONE)
    document = new_project_document("修訂一")
    document["project_id"] = project_id
    document["slides"] = [{"id": "slide-1", "title": "初始標題", "elements": []}]
    assert store.save_document(project_id, document, expected_revision=0) == 1
    edited = dict(document, title="修訂二")
    edited["slides"] = [{"id": "slide-1", "title": "修改後", "elements": []}]
    assert store.save_document(project_id, edited, expected_revision=1) == 2
    store.db.close()

    reopened = ProjectStore(tmp_path / "history.sqlite3")
    assert reopened.revision_parent(project_id, 2) == 1
    revision, original = reopened.load_revision(project_id, 1)
    assert revision == 1
    assert original["slides"][0]["title"] == "初始標題"
    assert reopened.save_document(project_id, original, expected_revision=2, parent_revision=0) == 3
    assert reopened.revision_parent(project_id, 3) == 0
    assert reopened.load_document(project_id)[1]["slides"][0]["title"] == "初始標題"


def test_existing_project_document_is_migrated_as_legacy_root_revision(tmp_path):
    path = tmp_path / "legacy.sqlite3"
    document = {"format_version": 1, "project_id": "legacy", "revision": 4, "title": "既有", "slides": []}
    db = sqlite3.connect(path)
    db.execute("CREATE TABLE projects(id TEXT PRIMARY KEY, source_path TEXT NOT NULL, state TEXT NOT NULL, operation TEXT, image_strategy TEXT, style TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)")
    db.execute("INSERT INTO projects(id,source_path,state) VALUES('legacy','example://legacy','created')")
    db.execute("CREATE TABLE project_documents(project_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, content_json TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)")
    db.execute("INSERT INTO project_documents(project_id,revision,content_json) VALUES(?,?,?)", ("legacy", 4, json.dumps(document)))
    db.commit(); db.close()

    migrated = ProjectStore(path)
    assert migrated.load_document("legacy")[1]["title"] == "既有"
    assert migrated.revision_parent("legacy", 4) == 0
    assert migrated.load_revision("legacy", 4)[1]["title"] == "既有"


def test_update_text_object_preserves_geometry_and_other_slide_objects():
    slide = {"id": "slide-1", "elements": [
        {"id": "text-1", "type": "text", "text": "舊內容", "x": .2, "y": .3, "width": .4, "height": .2},
        {"id": "image-1", "type": "image", "asset_path": "image.png"},
    ]}

    assert update_slide_text_element(slide, "新內容\n第二行", "text-1") == "text-1"
    assert slide["elements"][0] == {"id": "text-1", "type": "text", "text": "新內容\n第二行", "x": .2, "y": .3, "width": .4, "height": .2}
    assert slide["elements"][1]["asset_path"] == "image.png"

    created_id = update_slide_text_element(slide, "新增內容")
    assert created_id == slide["elements"][2]["id"]
    assert slide["elements"][2]["text"] == "新增內容"

    with pytest.raises(ValueError, match="不可空白"):
        update_slide_text_element(slide, " \n ", "text-1")
    assert slide["elements"][0]["text"] == "新內容\n第二行"
