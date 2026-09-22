import hashlib
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
