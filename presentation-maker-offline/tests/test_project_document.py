import pytest
from presentation_maker_offline.project_document import new_project_document
from presentation_maker_offline.workflow import ImageStrategy, Operation, ProjectStore, Workflow

def test_document_saves_and_reopens_with_revision_guard(tmp_path):
    path = tmp_path / "projects.sqlite3"
    store = ProjectStore(path)
    project_id = Workflow(store).start("example://demo", Operation.KEEP, ImageStrategy.NONE)
    document = new_project_document("範例")
    document["project_id"] = project_id
    document["slides"] = [{"id": "slide-1", "elements": []}]
    document["annotations"] = [{"id": "mark-1", "slide_id": "slide-1", "rect": [0.1, 0.2, 0.7, 0.8], "comment": "保留人物", "status": "待處理"}]
    document["sources"] = [{"id": "source-1", "path": "/local/reference.pdf", "role": "supplement", "version": 1}]
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
    assert loaded["settings"]["target_pages"] == 12
    with pytest.raises(RuntimeError, match="revision conflict"):
        reopened.save_document(project_id, loaded, expected_revision=0)
