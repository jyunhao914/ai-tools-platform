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
    candidates = [os.environ.get("MODEL_HOME"), os.environ.get("HF_HOME"), "~/.cache/lm-studio/models/orcarouter/Qwen3.8-27B-Uncensored-MLX-8bit", "~/.cache/huggingface"]
    for candidate in candidates:
        if candidate and Path(candidate).expanduser().exists(): return Path(candidate).expanduser()
    return Path("~/.cache/lm-studio/models/orcarouter/Qwen3.8-27B-Uncensored-MLX-8bit").expanduser()

def discover_qwen38_mlx() -> Path | None:
    path = selected_model_home()
    return path if path.is_dir() and len(list(path.glob("*.safetensors"))) >= 1 else None

def qwen_image21_readiness(path: str | Path = "~/.cache/lm-studio/models/Qwen/Qwen-Image-2.1") -> dict:
    root = Path(path).expanduser()
    required = [root / "model_index.json", root / "processor", root / "text_encoder", root / "transformer", root / "vae"]
    incomplete = list(root.rglob("*.incomplete")) if root.exists() else []
    missing = [str(p.relative_to(root)) for p in required if not p.exists()]
    safetensors = list(root.rglob("*.safetensors")) if root.exists() else []
    if not safetensors: missing.append("core *.safetensors")
    return {"ready": bool(root.is_dir() and not missing and not incomplete), "path": str(root), "missing": missing, "incomplete": [str(p.relative_to(root)) for p in incomplete], "safetensors": len(safetensors)}
