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
