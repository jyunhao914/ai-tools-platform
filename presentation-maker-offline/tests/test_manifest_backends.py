import hashlib
from types import SimpleNamespace
from pathlib import Path

import pytest
from PIL import Image

from presentation_maker_offline.manifest import CheckpointManifest
from presentation_maker_offline.backends import LocalQwenImageBackend

def test_manifest_hash_and_image_backend_fallback(tmp_path):
    model = tmp_path / "model.bin"; model.write_bytes(b"model")
    m = CheckpointManifest("demo", str(model), hashlib.sha256(b"model").hexdigest(), "local-import", "abc123", "Qwen Research License", "diffusers")
    assert m.validate() == []
    backend = LocalQwenImageBackend(m, runtime="diffusers", vae_device="auto")
    assert backend.selected_vae_device(editing=True) in {"cpu", "mps"}

def test_manifest_rejects_bad_hash(tmp_path):
    model = tmp_path / "model.bin"; model.write_bytes(b"model")
    m = CheckpointManifest("demo", str(model), "0" * 64, "local-import", "abc123", "license", "diffusers")
    assert any("mismatch" in e for e in m.validate())


def test_qwen_image_backend_uses_condition_image_with_same_local_pipeline(tmp_path, monkeypatch):
    import diffusers

    model = tmp_path / "model"; model.mkdir()
    source = tmp_path / "source.png"; Image.new("RGB", (64, 48), "blue").save(source)
    calls = {}

    class FakeVae:
        device = "cpu"
        def to(self, device): self.device = device; return self

    class FakePipeline:
        vae = FakeVae()
        @classmethod
        def from_pretrained(cls, path, **kwargs):
            calls["loaded_from"] = path; calls["load_options"] = kwargs; return cls()
        def to(self, device): self.vae.to(device); return self
        def __call__(self, **kwargs):
            calls.update(kwargs)
            generated = Image.new("RGB", (kwargs["width"], kwargs["height"]), "green")
            generated.putpixel((0, 0), (255, 0, 0))
            return SimpleNamespace(images=[generated])

    monkeypatch.setattr(diffusers, "QwenImage21Pipeline", FakePipeline)
    monkeypatch.setattr(Path, "home", classmethod(lambda _cls: tmp_path))
    manifest = CheckpointManifest("demo", str(model), "0"*64, "local", "rev", "license", "diffusers")
    backend = LocalQwenImageBackend(manifest, vae_device="mps")
    result = backend.generate("改成森林背景", edit_image=str(source))
    assert isinstance(calls["image"], Image.Image)
    assert calls["image"].size == (64, 48)
    assert calls["load_options"]["local_files_only"] is True
    assert Path(result["image_path"]).is_file()


def test_qwen_image_rejects_one_step_scheduler_nan_case(tmp_path):
    model = tmp_path / "model"; model.mkdir()
    manifest = CheckpointManifest("demo", str(model), "0"*64, "local", "rev", "license", "diffusers")
    backend = LocalQwenImageBackend(manifest, num_inference_steps=1)
    with pytest.raises(ValueError, match="at least 2"):
        backend.generate("test")


def test_qwen_image_reports_unavailable_cpu_only_vae_offload(tmp_path):
    model = tmp_path / "model"; model.mkdir()
    manifest = CheckpointManifest("demo", str(model), "0"*64, "local", "rev", "license", "diffusers")
    backend = LocalQwenImageBackend(manifest, vae_device="cpu")
    assert any("CPU-only VAE offload" in error for error in backend.health()["errors"])
