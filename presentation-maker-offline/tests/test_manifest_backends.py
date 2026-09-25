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


def test_mlx_text_backend_checks_runtime_and_local_checkpoint(tmp_path, monkeypatch):
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
    backend = LocalQwenTextBackend(CheckpointManifest("demo", str(model), "0" * 64, "local", "rev", "license", "mlx"))
    backend._runtime_path = lambda: None

    health = backend.health()
    assert health["weights_ready"] is True
    assert health["ok"] is False
    assert any("找不到 mlx-serve" in error for error in health["errors"])
    assert not health["inference_verified"]


def test_mlx_text_backend_discovers_runtime_bundled_in_macos_app(tmp_path, monkeypatch):
    from presentation_maker_offline import backends

    executable = tmp_path / "OfflinePresentationStudio.app/Contents/MacOS/OfflinePresentationStudio"
    executable.parent.mkdir(parents=True)
    executable.touch()
    bundled_runtime = tmp_path / "OfflinePresentationStudio.app/Contents/Resources/mlx-serve-macos-arm64/mlx-serve"
    bundled_runtime.parent.mkdir(parents=True)
    bundled_runtime.touch()
    bundled_runtime.chmod(0o755)
    monkeypatch.setattr(backends.sys, "executable", str(executable))
    monkeypatch.setattr(backends.shutil, "which", lambda _name: None)
    monkeypatch.setattr(backends.Path, "home", lambda: tmp_path / "empty-home")

    backend = LocalQwenTextBackend(CheckpointManifest("demo", str(tmp_path), "0" * 64, "local", "rev", "license", "mlx"))
    assert backend._runtime_path() == str(bundled_runtime)


def test_mlx_text_backend_uses_loopback_server_and_stops_after_generation(tmp_path, monkeypatch):
    import json
    from types import SimpleNamespace
    import presentation_maker_offline.backends as backends

    model = tmp_path / "model"
    model.mkdir()
    (model / "config.json").write_text(json.dumps({"model_type": "qwen3_5"}))
    (model / "model.safetensors.index.json").write_text(json.dumps({"weight_map": {"layer": "model-00001.safetensors"}}))
    (model / "model-00001.safetensors").write_bytes(b"weights")
    calls = {"requests": []}

    class FakeProcess:
        def __init__(self, command, **kwargs):
            calls["command"] = command
            calls["popen_options"] = kwargs
            self.returncode = None
        def poll(self): return self.returncode
        def terminate(self): self.returncode = 0
        def wait(self, timeout=None): return self.returncode
        def kill(self): self.returncode = -9

    def fake_urlopen(request, timeout=None):
        from contextlib import closing
        calls["requests"].append((request.full_url, json.loads(request.data) if request.data else None))
        payload = {"data": [{"id": "qwen-local"}]} if request.full_url.endswith("/v1/models") else {
            "choices": [{"message": {"content": "# 健康衛教\n## 認識大腸癌\n說明篩檢方式"}}],
        }
        class Response:
            def __enter__(self): return self
            def __exit__(self, *_args): return None
            def read(self): return json.dumps(payload).encode()
        return Response()

    monkeypatch.setattr(backends.subprocess, "Popen", FakeProcess)
    monkeypatch.setattr(backends, "urlopen", fake_urlopen)
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    backend = LocalQwenTextBackend(CheckpointManifest("demo", str(model), "0" * 64, "local", "rev", "license", "mlx"))
    backend.health = lambda: {"ok": True, "runtime_version": "mlx-serve 26.9.2"}
    backend._runtime_path = lambda: "/trusted/mlx-serve"

    result = backend.plan("請整理成三頁簡報")
    assert result["text"] == "# 健康衛教\n## 認識大腸癌\n說明篩檢方式"
    assert result["runtime"] == "mlx-serve 26.9.2"
    assert calls["command"][calls["command"].index("--host") + 1] == "127.0.0.1"
    assert calls["command"][calls["command"].index("--model") + 1] == str(model)
    assert "shell" not in calls["popen_options"]
    api_calls = [item for item in calls["requests"] if item[0].endswith("/v1/chat/completions")]
    assert api_calls[0][1]["model"] == "qwen-local"
    assert api_calls[0][1]["messages"][-1]["content"] == "請整理成三頁簡報"
    assert api_calls[0][1]["reasoning_budget"] == 0
    assert api_calls[0][1]["max_tokens"] == 4096
    evidence_path = tmp_path / "Library/Application Support/PresentationMaker/text-runtime-verification.json"
    assert json.loads(evidence_path.read_text())["runtime_version"] == "mlx-serve 26.9.2"
    monkeypatch.setattr(backends.subprocess, "run", lambda *_args, **_kwargs: SimpleNamespace(returncode=0, stdout="mlx-serve 26.9.2\n", stderr=""))
    verified_backend = LocalQwenTextBackend(CheckpointManifest("demo", str(model), "0" * 64, "local", "rev", "license", "mlx"))
    verified_backend._runtime_path = lambda: "/trusted/mlx-serve"
    assert verified_backend.health()["inference_verified"] is True


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
