from presentation_maker_offline.workflow import ImageStrategy, Operation, ProjectStore, Workflow

class BrokenBackend:
    name = "user-checkpoint"
    def generate(self, prompt):
        raise MemoryError("out of memory")

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
    assert store.db.execute("SELECT state FROM projects WHERE id = ?", (project,)).fetchone()[0] == "paused_technical_failure"
