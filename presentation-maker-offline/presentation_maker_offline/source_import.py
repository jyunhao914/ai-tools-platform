from __future__ import annotations

from pathlib import Path
from uuid import uuid4


def import_source(path: str | Path) -> tuple[list[dict], dict]:
    """Extract editable text and geometry from supported local source files."""
    source = Path(path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"找不到來源檔案：{source}")
    suffix = source.suffix.lower()
    warnings = []
    if suffix == ".pptx":
        slides = _pptx_slides(source)
    elif suffix == ".txt":
        slides = _text_slides(source.read_text(encoding="utf-8-sig"))
    elif suffix == ".docx":
        try:
            from docx import Document
        except ImportError as exc:
            raise RuntimeError("匯入 DOCX 需要安裝 python-docx") from exc
        doc = Document(str(source))
        slides = _text_slides("\n".join(p.text for p in doc.paragraphs if p.text.strip()))
    elif suffix == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise RuntimeError("匯入 PDF 需要安裝 pypdf；掃描頁需另行設定本機 OCR") from exc
        reader = PdfReader(str(source))
        slides = []
        for index, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            if not text.strip():
                warnings.append(f"PDF 第 {index + 1} 頁沒有可擷取文字；可能需要本機 OCR")
            slides.append(_slide_from_text(text, index, page_label=f"PDF 第 {index + 1} 頁"))
    elif suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        slides = [{"id": str(uuid4()), "order": 0, "title": source.stem, "elements": [], "source_page": 1}]
    else:
        raise ValueError(f"目前不支援此檔案格式：{suffix or '無副檔名'}")
    if not slides:
        raise ValueError("來源檔案沒有可匯入的頁面或文字")
    record = {"id": str(uuid4()), "path": str(source), "role": "primary", "scope": "project", "version": 1, "format": suffix[1:]}
    if warnings:
        record["warnings"] = warnings
    return slides, record


def _text_slides(text: str) -> list[dict]:
    sections = [section.strip() for section in text.split("\f") if section.strip()]
    if len(sections) == 1:
        paragraphs = [line.strip() for line in sections[0].splitlines() if line.strip()]
        sections = ["\n".join(paragraphs[i:i + 5]) for i in range(0, len(paragraphs), 5)]
    return [_slide_from_text(section, i) for i, section in enumerate(sections)]


def _slide_from_text(text: str, index: int, page_label: str | None = None) -> dict:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    title = lines[0][:120] if lines else (page_label or f"第 {index + 1} 頁")
    body = "\n".join(lines[1:])
    elements = []
    if body:
        elements.append({"id": str(uuid4()), "type": "text", "text": body, "x": 0.08, "y": 0.24, "width": 0.84, "height": 0.58})
    return {"id": str(uuid4()), "order": index, "title": title, "elements": elements, "source_page": index + 1}


def _pptx_slides(path: Path) -> list[dict]:
    from pptx import Presentation

    presentation = Presentation(path)
    slides = []
    width, height = presentation.slide_width, presentation.slide_height
    for index, source_slide in enumerate(presentation.slides):
        title_shape = source_slide.shapes.title
        title = title_shape.text.strip() if title_shape and title_shape.text.strip() else f"第 {index + 1} 頁"
        title_shape_id = title_shape.shape_id if title_shape else None
        elements = []
        for shape in source_slide.shapes:
            if not getattr(shape, "has_text_frame", False):
                continue
            text = shape.text.strip()
            if not text or shape.shape_id == title_shape_id:
                continue
            elements.append({
                "id": str(uuid4()), "type": "text", "text": text,
                "x": shape.left / width, "y": shape.top / height,
                "width": shape.width / width, "height": shape.height / height,
                "source_shape": shape.name,
            })
        slides.append({"id": str(uuid4()), "order": index, "title": title, "elements": elements, "source_page": index + 1})
    return slides
