from __future__ import annotations
import os, shutil
from dataclasses import dataclass
from pathlib import Path

SAFETY_MARGIN_BYTES = 20 * 1024**3

@dataclass(frozen=True)
class StorageConfig:
    root: Path
    model_dir: Path
    generation_cache: Path
    projects: Path
    @classmethod
    def from_root(cls, root: str | Path) -> "StorageConfig":
        root = Path(root).expanduser().resolve()
        return cls(root, root / "models", root / "generation-cache", root / "projects")
    def create(self) -> None:
        for path in (self.model_dir, self.generation_cache, self.projects): path.mkdir(parents=True, exist_ok=True)
    def environment(self) -> dict[str, str]:
        return {"MODEL_HOME": str(self.model_dir), "HF_HOME": str(self.model_dir / "huggingface")}
    def check_space(self, required_bytes: int, location: str | Path | None = None) -> tuple[bool, int]:
        target = Path(location or self.root); target.mkdir(parents=True, exist_ok=True)
        free = shutil.disk_usage(target).free
        return free >= required_bytes + SAFETY_MARGIN_BYTES, free
    def safe_clear_generation_cache(self) -> int:
        if self.generation_cache in (self.root, self.model_dir): raise ValueError("protected storage root")
        if not self.generation_cache.exists(): return 0
        removed = sum(p.stat().st_size for p in self.generation_cache.rglob("*") if p.is_file())
        for child in self.generation_cache.iterdir():
            if child.is_dir() and not child.is_symlink(): shutil.rmtree(child)
            else: child.unlink()
        return removed
def selected_model_home() -> Path:
    return Path(os.environ.get("MODEL_HOME", os.environ.get("HF_HOME", "~/.cache/huggingface"))).expanduser()
