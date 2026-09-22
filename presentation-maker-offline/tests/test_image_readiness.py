from presentation_maker_offline.storage import qwen_image21_readiness
def test_incomplete_image_model_is_not_ready(tmp_path):
    for name in ["processor", "text_encoder", "transformer", "vae"]: (tmp_path / name).mkdir()
    (tmp_path / "model_index.json").write_text("{}")
    (tmp_path / "download.incomplete").write_text("partial")
    assert qwen_image21_readiness(tmp_path)["ready"] is False
    assert qwen_image21_readiness(tmp_path)["incomplete"]
