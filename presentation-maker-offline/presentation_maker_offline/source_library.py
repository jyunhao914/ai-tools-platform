from __future__ import annotations

import hashlib
import shutil
from pathlib import Path
from uuid import uuid4

from .source_import import import_source


SOURCE_ROLES = ("補充資料", "主要內容", "修改依據", "風格參考")


def _fragments(slides: list[dict]) -> list[dict]:
    fragments = []
    for index, slide in enumerate(slides, 1):
        body = "\n".join(element.get("text", "") for element in slide.get("elements", [])
                         if element.get("type", "text") == "text").strip()
        fragments.append({"id": str(uuid4()), "page": index, "title": slide.get("title", ""), "text": body})
    return fragments


def add_file_source(path: str | Path, project_root: str | Path, existing_sources: list[dict],
                    *, role: str = "補充資料", scope: str = "整份簡報") -> dict:
    """Parse first, then preserve an immutable managed copy with a stable source/version ID."""
    if role not in SOURCE_ROLES:
        raise ValueError("不支援的資料用途")
    source_path = Path(path).expanduser().resolve()
    slides, parsed = import_source(source_path)
    digest = hashlib.sha256(source_path.read_bytes()).hexdigest()
    versions = [int(item.get("version", 1)) for item in existing_sources
                if item.get("display_name") == source_path.name and item.get("library_source")]
    version = max(versions, default=0) + 1
    source_id = str(uuid4())
    relative_path = f"{source_id}{source_path.suffix.lower()}"
    target_dir = Path(project_root) / "sources"
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / relative_path
    shutil.copyfile(source_path, target)
    if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
        target.unlink(missing_ok=True)
        raise OSError("來源副本校驗失敗")
    return {
        "id": source_id, "library_source": True, "version": version,
        "display_name": source_path.name, "path": str(source_path),
        "managed_path": relative_path, "content_sha256": digest,
        "format": parsed["format"], "role": role, "scope": scope,
        "page_count": len(slides), "fragments": _fragments(slides),
        "warnings": parsed.get("warnings", []),
    }


def add_text_source(text: str, existing_sources: list[dict], *, name: str = "貼上的補充資料",
                    role: str = "補充資料", scope: str = "整份簡報") -> dict:
    if role not in SOURCE_ROLES:
        raise ValueError("不支援的資料用途")
    content = text.strip()
    if not content:
        raise ValueError("請先貼上資料文字。")
    versions = [int(item.get("version", 1)) for item in existing_sources
                if item.get("display_name") == name and item.get("library_source")]
    return {
        "id": str(uuid4()), "library_source": True, "version": max(versions, default=0) + 1,
        "display_name": name, "path": "paste://reference", "format": "text",
        "content_sha256": hashlib.sha256(content.encode("utf-8")).hexdigest(),
        "role": role, "scope": scope, "page_count": 1,
        "fragments": [{"id": str(uuid4()), "page": 1, "title": name, "text": content}],
        "warnings": [],
    }


def source_preview(source: dict) -> str:
    parts = [f"{source.get('display_name', '未命名')} · 版本 {source.get('version', 1)}",
             f"用途：{source.get('role', '補充資料')}　範圍：{source.get('scope', '整份簡報')}",
             f"解析頁數：{source.get('page_count', 0)}"]
    parts.extend("提醒：" + warning for warning in source.get("warnings", []))
    for fragment in source.get("fragments", []):
        parts.append(f"\n第 {fragment['page']} 頁｜{fragment.get('title', '')}\n"
                     + (fragment.get("text") or "（無可擷取文字；圖片或掃描內容尚未經 OCR）"))
    return "\n".join(parts)


def append_fragment_to_slide(slide: dict, source: dict, fragment_id: str) -> dict:
    """Append explicitly chosen source text with an immutable source/version citation."""
    if source.get("role") == "風格參考":
        raise ValueError("風格參考不會自動成為投影片文字；請先改變資料用途。")
    fragment = next((item for item in source.get("fragments", []) if item.get("id") == fragment_id), None)
    if fragment is None or not fragment.get("text", "").strip():
        raise ValueError("這段資料沒有可加入的文字。")
    element = {
        "id": str(uuid4()), "type": "text", "text": fragment["text"].strip(),
        "x": .08, "y": .68, "width": .84, "height": .18,
        "source_ref": {"source_id": source["id"], "version": source["version"],
                       "fragment_id": fragment["id"], "page": fragment["page"],
                       "content_sha256": source["content_sha256"]},
    }
    slide.setdefault("elements", []).append(element)
    return element
