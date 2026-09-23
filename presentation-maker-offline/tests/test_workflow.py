from presentation_maker_offline.workflow import ImageStrategy, Operation, ProjectStore, Workflow

class BrokenBackend:
    name = "user-checkpoint"
    def generate(self, prompt):
        raise MemoryError("out of memory; retry after freeing memory")

def test_photorealistic_falls_back_and_records_evidence(tmp_path):
    store = ProjectStore(tmp_path / "state.sqlite3")
    workflow = Workflow(store)
    project = workflow.start("deck.pptx", Operation.KEEP, ImageStrategy.PHOTOREALISTIC, "editorial")
    result = workflow.image(project, 3, "a mountain", ImageStrategy.PHOTOREALISTIC, photorealistic_ok=False, generate_ok=True)
    assert result.source == "free_generate"
    assert result.attempt == 2
    assert len(store.attempts(project)) == 1

def test_failed_generation_reuses_original(tmp_path):
    store = ProjectStore(tmp_path / "state.sqlite3")
    workflow = Workflow(store)
    project = workflow.start("deck.pptx", Operation.EXPAND, ImageStrategy.GENERATE)
    result = workflow.image(project, 1, "x", ImageStrategy.GENERATE, generate_ok=False)
    assert result.status == "reused"
    assert result.source == "original"

def test_backend_failure_is_resumable_technical_state(tmp_path):
    store = ProjectStore(tmp_path / "state.sqlite3")
    workflow = Workflow(store)
    project = workflow.start("deck.pptx", Operation.KEEP, ImageStrategy.GENERATE)
    result = workflow.image(project, 1, "x", ImageStrategy.GENERATE, backend=BrokenBackend())
    assert result.status == "technical_failure"
    assert result.evidence["resumable"] is True
    assert result.evidence["error"] == "out of memory; retry after freeing memory"
    assert store.db.execute("SELECT state FROM projects WHERE id = ?", (project,)).fetchone()[0] == "paused_technical_failure"


def test_failed_page_does_not_block_later_page_work(tmp_path):
    store = ProjectStore(tmp_path / "state.sqlite3")
    workflow = Workflow(store)
    project = workflow.start("deck.pptx", Operation.KEEP, ImageStrategy.GENERATE)
    failed = workflow.image(project, 1, "first", ImageStrategy.GENERATE, backend=BrokenBackend())
    next_page = workflow.image(project, 2, "second", ImageStrategy.NONE)
    assert failed.status == "technical_failure"
    assert next_page.status == "skipped"
    assert len(store.attempts(project)) == 2
