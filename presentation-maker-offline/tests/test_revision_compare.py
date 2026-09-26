from presentation_maker_offline.revision_compare import compare_documents


def test_compare_uses_stable_slide_identity_and_reports_text_and_image_change():
    old = {"slides": [{"id": "a", "title": "原始", "elements": [
        {"id": "t", "type": "text", "text": "原文"},
        {"id": "i", "type": "image", "asset_path": "before.png"}]}]}
    new = {"slides": [{"id": "a", "title": "修改後", "elements": [
        {"id": "t", "type": "text", "text": "新文"},
        {"id": "i", "type": "image", "asset_path": "after.png"}]}]}
    change = compare_documents(old, new)[0]
    assert change["slide_id"] == "a"
    assert change["old_text"] == "原始\n原文"
    assert change["new_images"] == ["after.png"]
