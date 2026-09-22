from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Any


class Operation(StrEnum):
    KEEP = "keep"
    REDUCE = "reduce"
    EXPAND = "expand"
    RESTORE_OUTLINE = "restore_outline"
    EXTRACT_STYLE = "extract_style"


class ImageStrategy(StrEnum):
    NONE = "none"
    REUSE = "reuse"
    PHOTOREALISTIC = "photorealistic"
    GENERATE = "generate"


@dataclass(frozen=True)
class ImageResult:
    status: str
    source: str
    attempt: int
    evidence: dict[str, Any]


class LocalImageBackend:
    """Adapter contract for a local checkpoint; no network or moderation hooks."""

    name = "local"

    def generate(self, prompt: str) -> dict[str, Any]:
        raise NotImplementedError


class ProjectStore:
    """Durable state store; every inference attempt is recorded exactly once."""

    def __init__(self, path: str | Path):
        self.path = str(path)
        self.db = sqlite3.connect(self.path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(
            """CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY, source_path TEXT NOT NULL, state TEXT NOT NULL,
                operation TEXT, image_strategy TEXT, style TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL,
                page INTEGER NOT NULL, phase TEXT NOT NULL, request_json TEXT NOT NULL,
                result_json TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );"""
        )
        self.db.commit()

    def create(self, source_path: str) -> str:
        project_id = str(uuid.uuid4())
        self.db.execute("INSERT INTO projects(id, source_path, state) VALUES (?, ?, ?)", (project_id, source_path, "created"))
        self.db.commit()
        return project_id

    def update(self, project_id: str, **fields: str) -> None:
        allowed = {"state", "operation", "image_strategy", "style"}
        fields = {k: v for k, v in fields.items() if k in allowed}
        if not fields:
            return
        assignments = ", ".join(f"{key} = ?" for key in fields)
        self.db.execute(f"UPDATE projects SET {assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (*fields.values(), project_id))
        self.db.commit()

    def record_attempt(self, project_id: str, page: int, phase: str, request: dict[str, Any], result: dict[str, Any]) -> None:
        self.db.execute("INSERT INTO attempts(project_id,page,phase,request_json,result_json) VALUES (?,?,?,?,?)", (project_id, page, phase, json.dumps(request), json.dumps(result)))
        self.db.commit()

    def attempts(self, project_id: str) -> list[sqlite3.Row]:
        return list(self.db.execute("SELECT * FROM attempts WHERE project_id = ? ORDER BY id", (project_id,)))


class Workflow:
    def __init__(self, store: ProjectStore):
        self.store = store

    def start(self, source_path: str, operation: Operation, image_strategy: ImageStrategy, style: str = "") -> str:
        project_id = self.store.create(source_path)
        self.store.update(project_id, state="planning", operation=operation.value, image_strategy=image_strategy.value, style=style)
        return project_id

    def image(self, project_id: str, page: int, prompt: str, strategy: ImageStrategy, *, photorealistic_ok: bool = True, generate_ok: bool = True, backend: LocalImageBackend | None = None) -> ImageResult:
        request = {"prompt": prompt, "strategy": strategy.value}
        if strategy is ImageStrategy.NONE:
            result = ImageResult("skipped", "none", 0, {"reason": "image strategy disabled"})
        elif strategy is ImageStrategy.REUSE:
            result = ImageResult("reused", "original", 0, {"reason": "reuse original asset"})
        elif strategy is ImageStrategy.PHOTOREALISTIC and photorealistic_ok:
            result = ImageResult("generated", "photorealistic", 1, {"model": "Qwen/Qwen-Image-2.1"})
        elif generate_ok:
            result = ImageResult("generated", "free_generate", 2 if strategy is ImageStrategy.PHOTOREALISTIC else 1, {"model": "Qwen/Qwen-Image-2.1", "fallback": strategy.value})
        else:
            result = ImageResult("reused", "original", 2, {"fallback": "generation_failed"})
        if backend is not None and result.status == "generated":
            try:
                backend_result = backend.generate(prompt)
                result = ImageResult(result.status, result.source, result.attempt, {**result.evidence, "backend": backend.name, "backend_result": backend_result})
            except Exception as exc:  # technical failure is recorded, never treated as content rejection
                self.store.update(project_id, state="paused_technical_failure")
                result = ImageResult("technical_failure", "none", result.attempt, {"backend": backend.name, "error_type": type(exc).__name__, "resumable": True})
        self.store.record_attempt(project_id, page, "image", request, result.__dict__)
        return result
