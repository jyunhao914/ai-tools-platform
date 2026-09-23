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
    assert store.save_document(project_id, document, expected_revision=0) == 1
    store.db.close()

    reopened = ProjectStore(path)
    revision, loaded = reopened.load_document(project_id)
    assert revision == loaded["revision"] == 1
    assert loaded["slides"][0]["id"] == "slide-1"
    with pytest.raises(RuntimeError, match="revision conflict"):
        reopened.save_document(project_id, loaded, expected_revision=0)
