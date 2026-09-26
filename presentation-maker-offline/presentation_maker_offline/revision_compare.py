from __future__ import annotations


def slide_text(slide: dict) -> str:
    parts = [slide.get("title", "")]
    parts.extend(item.get("text", "") for item in slide.get("elements", []) if item.get("type") == "text")
    return "\n".join(parts)


def compare_documents(before: dict, after: dict) -> list[dict]:
    """Compare stable slide IDs; never infer identity from order or title."""
    old = {slide["id"]: slide for slide in before.get("slides", [])}
    new = {slide["id"]: slide for slide in after.get("slides", [])}
    changes = []
    for slide_id in dict.fromkeys([*old, *new]):
        previous, current = old.get(slide_id), new.get(slide_id)
        if previous == current:
            continue
        changes.append({
            "slide_id": slide_id,
            "kind": "新增" if previous is None else "刪除" if current is None else "修改",
            "old_title": previous.get("title", "") if previous else "",
            "new_title": current.get("title", "") if current else "",
            "old_text": slide_text(previous) if previous else "",
            "new_text": slide_text(current) if current else "",
            "old_images": [item.get("asset_path") for item in previous.get("elements", []) if item.get("type") == "image"] if previous else [],
            "new_images": [item.get("asset_path") for item in current.get("elements", []) if item.get("type") == "image"] if current else [],
        })
    return changes
