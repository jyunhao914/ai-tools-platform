from presentation_maker_offline.storage import StorageConfig, discover_qwen38_mlx
import sys
from types import SimpleNamespace
import pytest
from presentation_maker_offline import storage

@pytest.mark.parametrize("capacity,error,expected", [(124, None, 124), (None, None, 14), (124, 'error', 14), (-1, None, 14), (5, None, 14)])
def test_apple_reclaimable_capacity(monkeypatch, tmp_path, capacity, error, expected):
    monkeypatch.setattr(storage.sys, 'platform', 'darwin')
    monkeypatch.setattr(storage.shutil, 'disk_usage', lambda path: SimpleNamespace(free=14))
    url = SimpleNamespace(resourceValuesForKeys_error_=lambda keys, err: ({'important': capacity}, error))
    monkeypatch.setitem(sys.modules, 'Foundation', SimpleNamespace(
        NSURL=SimpleNamespace(fileURLWithPath_=lambda path: url),
        NSURLVolumeAvailableCapacityForImportantUsageKey='important'))
    assert storage.available_capacity(tmp_path) == expected

def test_space_margin_uses_effective_capacity(monkeypatch, tmp_path):
    monkeypatch.setattr(storage, 'available_capacity', lambda path: storage.SAFETY_MARGIN_BYTES + 10)
    config = StorageConfig.from_root(tmp_path)
    assert config.check_space(10)[0]
    assert not config.check_space(11)[0]
    with pytest.raises(ValueError):
        config.check_space(-1)
def test_storage_is_separated(tmp_path):
    c = StorageConfig.from_root(tmp_path / "external-ssd"); c.create()
    assert c.model_dir != c.generation_cache != c.projects
    assert c.environment()["MODEL_HOME"].endswith("models")
def test_clear_cache_preserves_models(tmp_path):
    c = StorageConfig.from_root(tmp_path); c.create()
    (c.generation_cache / "result.png").write_bytes(b"image"); (c.model_dir / "weights.bin").write_bytes(b"keep")
    assert c.safe_clear_generation_cache() == 5
    assert (c.model_dir / "weights.bin").exists()

def test_discovery_prefers_existing_lm_studio_path(monkeypatch, tmp_path):
    model = tmp_path / "Qwen3.8-27B-Uncensored-MLX-8bit"; model.mkdir(); (model / "model-00001.safetensors").write_bytes(b"x")
    (model / "config.json").write_text("{}")
    (model / "tokenizer.json").write_text("{}")
    (model / "tokenizer_config.json").write_text("{}")
    (model / "model.safetensors.index.json").write_text('{"weight_map":{"x":"model-00001.safetensors"}}')
    monkeypatch.setenv("MODEL_HOME", str(model))
    assert discover_qwen38_mlx() == model
