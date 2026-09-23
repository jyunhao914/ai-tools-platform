from presentation_maker_offline.storage import qwen_image21_readiness
import json

def test_incomplete_image_model_is_not_ready(tmp_path):
    for name in ["processor", "text_encoder", "transformer", "vae"]: (tmp_path / name).mkdir()
    (tmp_path / "model_index.json").write_text("{}")
    (tmp_path / "download.incomplete").write_text("partial")
    assert qwen_image21_readiness(tmp_path)["ready"] is False
    assert qwen_image21_readiness(tmp_path)["incomplete"]

def test_complete_indexed_image_model_is_ready(tmp_path):
    (tmp_path / "model_index.json").write_text(json.dumps({"_class_name": "QwenImage21Pipeline"}))
    for component in ["processor", "text_encoder", "transformer", "vae"]:
        (tmp_path / component).mkdir()
    for component, filename in [("processor", "tokenizer.json"), ("text_encoder", "config.json"), ("transformer", "config.json"), ("vae", "config.json")]:
        (tmp_path / component / filename).write_text("{}")
    for component, weight_name in [("text_encoder", "text.safetensors"), ("transformer", "transformer.safetensors")]:
        (tmp_path / component / "model.index.json").write_text(json.dumps({"weight_map": {"weight": weight_name}}))
        (tmp_path / component / weight_name).write_bytes(b"weight")
    (tmp_path / "vae" / "diffusion_pytorch_model.safetensors").write_bytes(b"vae")
    assert qwen_image21_readiness(tmp_path)["ready"] is True

def test_missing_indexed_shard_prevents_ready(tmp_path):
    result = qwen_image21_readiness(tmp_path)
    assert result["ready"] is False
