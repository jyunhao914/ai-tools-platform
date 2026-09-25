from __future__ import annotations

from copy import deepcopy
from uuid import uuid4


PROJECT_FORMAT_VERSION = 1


def new_project_document(title: str) -> dict:
    return {
        "format_version": PROJECT_FORMAT_VERSION,
        "project_id": str(uuid4()),
        "revision": 0,
        "title": title,
        "canvas": {"width": 1920, "height": 1080},
        "sources": [],
        "slides": [],
        "outline": [],
        "annotations": [],
        "styles": {"selected": "清爽藍"},
    }


def update_slide_text_element(slide: dict, text: str, element_id: str | None = None) -> str:
    """Update one editable text object, or add a new object without flattening its peers."""
    content = text.rstrip()
    if not content.strip():
        raise ValueError("文字內容不可空白。")
    elements = slide.setdefault("elements", [])
    if element_id:
        for element in elements:
            if element.get("id") == element_id and element.get("type", "text") == "text":
                element["text"] = content
                return element_id
        raise ValueError("找不到要修改的文字物件，內容未變更。")

    text_count = sum(1 for element in elements if element.get("type", "text") == "text")
    new_id = str(uuid4())
    elements.append({
        "id": new_id,
        "type": "text",
        "text": content,
        "x": 0.08,
        "y": min(0.24 + text_count * 0.14, 0.78),
        "width": 0.84,
        "height": 0.14,
    })
    return new_id


def validate_project_document(document: dict) -> None:
    if document.get("format_version") != PROJECT_FORMAT_VERSION:
        raise ValueError("unsupported project format version")
    if not document.get("project_id") or not isinstance(document.get("title"), str):
        raise ValueError("project id and title are required")
    slides = document.get("slides")
    if not isinstance(slides, list):
        raise ValueError("slides must be a list")
    slide_ids = [slide.get("id") for slide in slides]
    if any(not slide_id for slide_id in slide_ids) or len(set(slide_ids)) != len(slide_ids):
        raise ValueError("each slide must have a unique stable id")
    for slide in slides:
        elements = slide.get("elements", [])
        element_ids = [element.get("id") for element in elements]
        if any(not element_id for element_id in element_ids) or len(set(element_ids)) != len(element_ids):
            raise ValueError(f"slide {slide['id']} has missing or duplicate element ids")


def copy_document(document: dict) -> dict:
    validate_project_document(document)
    return deepcopy(document)
