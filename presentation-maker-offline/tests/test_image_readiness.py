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


def test_model_index_declares_each_component_weight_file(tmp_path):
    index = {
        "_class_name": "QwenImage21Pipeline",
        "processor": ["transformers", "Qwen3VLProcessor"],
        "scheduler": ["diffusers", "FlowMatchEulerDiscreteScheduler"],
        "text_encoder": ["transformers", "Qwen3VLForConditionalGeneration"],
        "transformer": ["diffusers", "QwenImage21Transformer2DModel"],
        "vae": ["diffusers", "AutoencoderKLQwenImage21"],
        "components": {
            "processor": {"config": "tokenizer.json", "weights": "*.json"},
            "scheduler": {"config": "scheduler_config.json", "weights": "*.json"},
            "text_encoder": {"config": "config.json", "index": "model.safetensors.index.json"},
            "transformer": {"config": "config.json", "index": "model.safetensors.index.json"},
            "vae": {"config": "config.json", "weights": "*.safetensors"},
        },
    }
    (tmp_path / "model_index.json").write_text(json.dumps(index))
    for component, config in (("processor", "tokenizer.json"), ("scheduler", "scheduler_config.json"), ("text_encoder", "config.json"), ("transformer", "config.json"), ("vae", "config.json")):
        (tmp_path / component).mkdir()
        (tmp_path / component / config).write_text("{}")
    for component, file in (("text_encoder", "text.safetensors"), ("transformer", "transformer.safetensors")):
        (tmp_path / component / "model.safetensors.index.json").write_text(json.dumps({"weight_map": {"w": file}}))
        (tmp_path / component / file).write_bytes(b"weights")
    (tmp_path / "vae" / "weights.safetensors").write_bytes(b"vae")
    assert qwen_image21_readiness(tmp_path)["ready"] is True


def test_model_index_component_missing_weight_fails_readiness(tmp_path):
    index = {
        "_class_name": "QwenImage21Pipeline",
        "components": {"transformer": {"config": "config.json", "weights": "*.safetensors"}},
    }
    (tmp_path / "model_index.json").write_text(json.dumps(index))
    (tmp_path / "transformer").mkdir()
    (tmp_path / "transformer" / "config.json").write_text("{}")
    status = qwen_image21_readiness(tmp_path)
    assert status["ready"] is False
    assert "transformer/*.safetensors" in status["missing"]
