from __future__ import annotations

import hashlib
from copy import deepcopy
from uuid import uuid4


def _fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def stage_text_candidate(document: dict, slide_id: str, element_id: str, proposed_text: str,
                         instruction: str, base_revision: int) -> dict:
    """Keep proposed text separate from accepted slide objects."""
    if not proposed_text.strip() or not instruction.strip():
        raise ValueError("修改要求與候選文字不可空白")
    slide = next((item for item in document.get("slides", []) if item.get("id") == slide_id), None)
    element = next((item for item in slide.get("elements", []) if item.get("id") == element_id), None) if slide else None
    if not element or element.get("type") != "text":
        raise ValueError("候選修改必須指向現有文字物件")
    candidate = {
        "id": str(uuid4()), "kind": "text", "slide_id": slide_id, "element_id": element_id,
        "base_revision": base_revision, "base_sha256": _fingerprint(element.get("text", "")),
        "instruction": instruction.strip(), "original_text": element.get("text", ""),
        "proposed_text": proposed_text.strip(), "status": "candidate",
    }
    document.setdefault("edit_candidates", []).append(candidate)
    return candidate


def accept_text_candidate(document: dict, candidate_id: str, *, current_revision: int) -> dict:
    """Apply only if the original target is unchanged and the candidate is pending."""
    candidate = next((item for item in document.get("edit_candidates", []) if item.get("id") == candidate_id), None)
    if not candidate or candidate.get("kind") != "text" or candidate.get("status") != "candidate":
        raise ValueError("找不到可接受的文字候選稿")
    if current_revision < candidate["base_revision"]:
        raise RuntimeError("候選稿基底版本不正確")
    slide = next((item for item in document.get("slides", []) if item.get("id") == candidate["slide_id"]), None)
    element = next((item for item in slide.get("elements", []) if item.get("id") == candidate["element_id"]), None) if slide else None
    if not element or element.get("type") != "text" or _fingerprint(element.get("text", "")) != candidate["base_sha256"]:
        raise RuntimeError("候選稿已與目前文字衝突；不會覆寫人工修改")
    before = deepcopy(element)
    element["text"] = candidate["proposed_text"]
    candidate["status"] = "accepted"
    candidate["accepted_from_revision"] = current_revision
    return before


def reject_candidate(document: dict, candidate_id: str) -> None:
    candidate = next((item for item in document.get("edit_candidates", []) if item.get("id") == candidate_id), None)
    if not candidate or candidate.get("status") != "candidate":
        raise ValueError("找不到可取消的候選稿")
    candidate["status"] = "rejected"
