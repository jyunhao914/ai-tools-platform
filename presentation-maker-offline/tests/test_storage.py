from presentation_maker_offline.storage import StorageConfig
def test_storage_is_separated(tmp_path):
    c = StorageConfig.from_root(tmp_path / "external-ssd"); c.create()
    assert c.model_dir != c.generation_cache != c.projects
    assert c.environment()["MODEL_HOME"].endswith("models")
def test_clear_cache_preserves_models(tmp_path):
    c = StorageConfig.from_root(tmp_path); c.create()
    (c.generation_cache / "result.png").write_bytes(b"image"); (c.model_dir / "weights.bin").write_bytes(b"keep")
    assert c.safe_clear_generation_cache() == 5
    assert (c.model_dir / "weights.bin").exists()
