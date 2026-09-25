import hashlib
from types import SimpleNamespace
from pathlib import Path

import pytest
from PIL import Image

from presentation_maker_offline.manifest import CheckpointManifest
from presentation_maker_offline.backends import LocalQwenImageBackend, LocalQwenTextBackend

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


def test_mlx_text_backend_rejects_checkpoint_not_validated_for_mlx_lm(tmp_path, monkeypatch):
    import builtins
    import json
    import presentation_maker_offline.backends as backends

    model = tmp_path / "model"
    model.mkdir()
    (model / "config.json").write_text(json.dumps({"model_type": "qwen3_5"}))
    (model / "model.safetensors.index.json").write_text(json.dumps({"weight_map": {"layer": "model-00001.safetensors"}}))
    (model / "model-00001.safetensors").write_bytes(b"weights")
    (model / "RUNTIME-REQUIREMENTS.json").write_text(json.dumps({
        "inference": {"revision": "mlx-serve-26.8.7|mlx-0.32.0"},
        "runtime_evidence_pending_at_packaging": True,
    }))
    monkeypatch.setattr(backends.importlib, "import_module", lambda _name: object())
    original_import = builtins.__import__
    monkeypatch.setattr(builtins, "__import__", lambda name, *args, **kwargs: object() if name == "mlx_lm" else original_import(name, *args, **kwargs))
    backend = LocalQwenTextBackend(CheckpointManifest("demo", str(model), "0" * 64, "local", "rev", "license", "mlx"))

    health = backend.health()
    assert health["weights_ready"] is True
    assert health["ok"] is False
    assert any("does not validate the app's MLX-LM backend" in error for error in health["errors"])
    with pytest.raises(RuntimeError, match="未通過執行環境檢查"):
        backend.plan("請建立大綱")


def test_mlx_text_backend_uses_chat_template_and_bounded_generation(tmp_path, monkeypatch):
    import json
    import sys
    from types import SimpleNamespace
    import presentation_maker_offline.backends as backends

    model = tmp_path / "model"
    model.mkdir()
    (model / "config.json").write_text(json.dumps({"model_type": "qwen3_5"}))
    (model / "model.safetensors.index.json").write_text(json.dumps({"weight_map": {"layer": "model-00001.safetensors"}}))
    (model / "model-00001.safetensors").write_bytes(b"weights")
    calls = {}

    class Tokenizer:
        def apply_chat_template(self, messages, **kwargs):
            calls["messages"] = messages
            calls["template_options"] = kwargs
            return "formatted conversation"

    runtime = SimpleNamespace(
        load=lambda _path: (object(), Tokenizer()),
        generate=lambda _model, _tokenizer, **kwargs: calls.update(kwargs) or "draft",
    )
    monkeypatch.setitem(sys.modules, "mlx_lm", runtime)
    monkeypatch.setattr(backends.importlib, "import_module", lambda _name: object())
    backend = LocalQwenTextBackend(CheckpointManifest("demo", str(model), "0" * 64, "local", "rev", "license", "mlx"))

    result = backend.plan("請整理成三頁簡報")
    assert result["text"] == "draft"
    assert calls["messages"][-1] == {"role": "user", "content": "請整理成三頁簡報"}
    assert calls["template_options"]["add_generation_prompt"] is True
    assert calls["template_options"]["enable_thinking"] is False
    assert calls["prompt"] == "formatted conversation"
    assert calls["max_tokens"] == 2048


def test_qwen_image_backend_uses_condition_image_with_same_local_pipeline(tmp_path, monkeypatch):
    import diffusers
    import json

    model = tmp_path / "model"; model.mkdir()
    (model / "model_index.json").write_text(json.dumps({"_class_name": "QwenImage21Pipeline"}))
    for component in ("processor", "scheduler", "text_encoder", "transformer", "vae"):
        (model / component).mkdir()
    for component, filename in (("processor", "tokenizer.json"), ("text_encoder", "config.json"), ("transformer", "config.json"), ("vae", "config.json")):
        (model / component / filename).write_text("{}")
    for component, index_name, weight_name in (("text_encoder", "model.safetensors.index.json", "text.safetensors"), ("transformer", "model.safetensors.index.json", "transformer.safetensors")):
        (model / component / index_name).write_text(json.dumps({"weight_map": {"w": weight_name}}))
        (model / component / weight_name).write_bytes(b"weight")
    (model / "vae" / "weights.safetensors").write_bytes(b"vae")
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
            callback = kwargs.get("callback_on_step_end")
            if callback:
                callback(self, 3, None, {})
            generated = Image.new("RGB", (kwargs["width"], kwargs["height"]), "green")
            for x in range(8): generated.putpixel((x, 0), (x * 30, 0, 0))
            return SimpleNamespace(images=[generated])

    monkeypatch.setattr(diffusers, "QwenImage21Pipeline", FakePipeline)
    monkeypatch.setattr(Path, "home", classmethod(lambda _cls: tmp_path))
    manifest = CheckpointManifest("demo", str(model), "0"*64, "local", "rev", "license", "diffusers")
    backend = LocalQwenImageBackend(manifest, vae_device="mps")
    progress = []
    result = backend.generate("改成森林背景", edit_image=str(source), progress_callback=lambda step, total: progress.append((step, total)))
    assert isinstance(calls["image"], Image.Image)
    assert calls["image"].size == (64, 48)
    assert calls["load_options"]["local_files_only"] is True
    assert Path(result["image_path"]).is_file()
    assert progress == [(4, 40)]

    import threading
    cancel = threading.Event(); cancel.set()
    with pytest.raises(InterruptedError, match="已取消"):
        backend.generate("取消測試", cancel_event=cancel)
    assert getattr(backend._pipeline, "_interrupt", False) is True
    retry = backend.generate("取消後重試")
    assert Path(retry["image_path"]).is_file()
    assert backend._pipeline._interrupt is False


def test_qwen_image_validates_component_indexes_before_loading(tmp_path):
    model = tmp_path / "model"; model.mkdir()
    manifest = CheckpointManifest("demo", str(model), "0"*64, "local", "rev", "license", "diffusers")
    backend = LocalQwenImageBackend(manifest)
    health = backend.health()
    assert not health["ok"]
    assert health["weights_ready"] is False
    with pytest.raises(RuntimeError, match="權重未通過完整性檢查"):
        backend.generate("test")


def test_qwen_image_discards_pipeline_after_flat_output(tmp_path, monkeypatch):
    import diffusers

    model = tmp_path / "model"; model.mkdir()
    # A minimal valid indexed model tree lets the fake pipeline reach image validation.
    import json
    (model / "model_index.json").write_text(json.dumps({"_class_name": "QwenImage21Pipeline"}))
    for component in ("processor", "scheduler", "text_encoder", "transformer", "vae"):
        (model / component).mkdir()
    for component, filename in (("processor", "tokenizer.json"), ("text_encoder", "config.json"), ("transformer", "config.json"), ("vae", "config.json")):
        (model / component / filename).write_text("{}")
    for component, index_name, weight_name in (("text_encoder", "model.safetensors.index.json", "text.safetensors"), ("transformer", "model.safetensors.index.json", "transformer.safetensors")):
        (model / component / index_name).write_text(json.dumps({"weight_map": {"w": weight_name}}))
        (model / component / weight_name).write_bytes(b"weight")
    (model / "vae" / "weights.safetensors").write_bytes(b"vae")

    class FakeVae:
        device = "cpu"
        def to(self, device): self.device = device; return self
    class FakePipeline:
        vae = FakeVae()
        @classmethod
        def from_pretrained(cls, *args, **kwargs): return cls()
        def to(self, device): return self
        def __call__(self, **kwargs): return SimpleNamespace(images=[Image.new("RGB", (32, 32), "black")])
    monkeypatch.setattr(diffusers, "QwenImage21Pipeline", FakePipeline)
    backend = LocalQwenImageBackend(CheckpointManifest("demo", str(model), "0"*64, "local", "rev", "license", "diffusers"))
    with pytest.raises(RuntimeError, match="flat/invalid"):
        backend.generate("test")
    assert backend._pipeline is None


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
