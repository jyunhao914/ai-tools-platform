from __future__ import annotations
import json, os, shutil, sys
from dataclasses import dataclass
from pathlib import Path

SAFETY_MARGIN_BYTES = 20 * 1024**3

def available_capacity(location: str | Path) -> int:
    """Use macOS important-use capacity, including OS-reclaimable space.

    This is an estimate, not a reservation: writes must still handle ENOSPC.
    Never delete snapshots or user files to realize the estimate.
    """
    target = Path(location).resolve()
    free = shutil.disk_usage(target).free
    if sys.platform == "darwin":
        try:
            from Foundation import NSURL, NSURLVolumeAvailableCapacityForImportantUsageKey
            values, error = NSURL.fileURLWithPath_(str(target)).resourceValuesForKeys_error_(
                [NSURLVolumeAvailableCapacityForImportantUsageKey], None)
            if error is None and values is not None:
                capacity = values.get(NSURLVolumeAvailableCapacityForImportantUsageKey)
                if capacity is not None and int(capacity) >= 0:
                    return max(free, int(capacity))
        except (ImportError, AttributeError, TypeError, ValueError, OSError):
            pass
    return free

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
        if required_bytes < 0:
            raise ValueError("required_bytes must be non-negative")
        free = available_capacity(target)
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
    candidates = [
        os.environ.get("TEXT_MODEL_HOME"),
        os.environ.get("MODEL_HOME"),
        "/Users/jyunhao/.cache/lm-studio/models/orcarouter/Qwen3.8-27B-Uncensored-MLX-8bit",
    ]
    for candidate in candidates:
        if not candidate:
            continue
        path = Path(candidate).expanduser()
        if not path.is_dir():
            continue
        index = path / "model.safetensors.index.json"
        required = ["config.json", "tokenizer.json", "tokenizer_config.json", index]
        if any(not (path / name).is_file() for name in required):
            continue
        try:
            weight_map = json.loads(index.read_text()).get("weight_map", {})
            shards = set(weight_map.values())
            if not shards or any(not (path / name).is_file() for name in shards):
                continue
        except (OSError, ValueError, TypeError):
            continue
        if any(path.rglob("*.incomplete")):
            continue
        return path
    return None

def qwen_image21_readiness(path: str | Path = "~/.cache/lm-studio/models/Qwen/Qwen-Image-2.1") -> dict:
    root = Path(path).expanduser()
    required = [root / "model_index.json", root / "processor", root / "text_encoder", root / "transformer", root / "vae"]
    incomplete = list(root.rglob("*.incomplete")) if root.exists() else []
    missing = [p.name if p.parent == root else str(p.relative_to(root)) for p in required if not p.exists()]
    safetensors = list(root.rglob("*.safetensors")) if root.exists() else []
    expected_shards: set[str] = set()
    try:
        model_index = json.loads((root / "model_index.json").read_text())
        if model_index.get("_class_name") != "QwenImage21Pipeline":
            missing.append("model_index.json (_class_name=QwenImage21Pipeline)")
        components = model_index.get("components", {})
        if not components:
            components = {
                name: tuple(spec)
                for name, spec in model_index.items()
                if isinstance(spec, list) and len(spec) == 2 and isinstance(spec[1], str)
            }
        if components:
            for component, entry in components.items():
                component_path = root / component
                if not component_path.is_dir():
                    missing.append(f"{component}/")
                    continue
                subfolder = entry.get("subfolder", "") if isinstance(entry, dict) else ""
                component_root = component_path / subfolder
                if isinstance(entry, dict):
                    config_name = entry.get("config", "config.json")
                    index_name = entry.get("index", "model.safetensors.index.json")
                    weight_glob = entry.get("weights", "*.safetensors")
                elif isinstance(entry, tuple):
                    config_name = "tokenizer.json" if component == "processor" else "scheduler_config.json" if component == "scheduler" else "config.json"
                    index_name = "model.safetensors.index.json"
                    weight_glob = "*.json" if component in {"processor", "scheduler"} else "*.safetensors"
                else:
                    config_name = "tokenizer.json" if component == "processor" else "scheduler_config.json" if component == "scheduler" else "config.json"
                    index_name = "model.safetensors.index.json"
                    weight_glob = "*.safetensors"
                if not (component_root / config_name).is_file():
                    missing.append(str((component_root / config_name).relative_to(root)))
                index_paths = [component_root / index_name] if isinstance(entry, dict) else list(component_root.glob("*.index.json"))
                index_paths = [index_path for index_path in index_paths if index_path.is_file()]
                if index_paths:
                    for index_path in index_paths:
                        try:
                            index_data = json.loads(index_path.read_text())
                            shards = set(index_data.get("weight_map", {}).values())
                            if not shards:
                                missing.append(str(index_path.relative_to(root)) + " (empty weight_map)")
                            for shard in shards:
                                expected_shards.add(str((component_root / shard).relative_to(root)))
                                if not (component_root / shard).is_file():
                                    missing.append(str((component_root / shard).relative_to(root)))
                        except (OSError, ValueError, TypeError):
                            missing.append(str(index_path.relative_to(root)) + " (unreadable)")
                else:
                    if not list(component_root.glob(weight_glob)):
                        missing.append(str(component_root.relative_to(root) / weight_glob))
        else:
            for component in ("text_encoder", "transformer"):
                indexes = list((root / component).glob("*.index.json"))
                if not indexes:
                    missing.append(f"{component}/*.index.json")
                for index_path in indexes:
                    index_data = json.loads(index_path.read_text())
                    shards = set(index_data.get("weight_map", {}).values())
                    if not shards:
                        missing.append(str(index_path.relative_to(root)) + " (empty weight_map)")
                    for shard in shards:
                        expected_shards.add(str((index_path.parent / shard).relative_to(root)))
                        if not (index_path.parent / shard).is_file():
                            missing.append(str((index_path.parent / shard).relative_to(root)))
            for component, filename in (("transformer", "config.json"), ("text_encoder", "config.json"), ("vae", "config.json"), ("processor", "tokenizer.json")):
                if not (root / component / filename).is_file():
                    missing.append(f"{component}/{filename}")
            if not list((root / "vae").glob("*.safetensors")):
                missing.append("vae/*.safetensors")
    except (OSError, ValueError, TypeError) as exc:
        missing.append(f"model metadata unreadable: {type(exc).__name__}")
    if not expected_shards and not safetensors:
        missing.append("core *.safetensors")
    ready = bool(root.is_dir() and not missing and not incomplete)
    return {
        "ready": ready,
        "status": "weights_ready_runtime_unverified" if ready else "incomplete",
        "path": str(root),
        "missing": sorted(set(missing)),
        "incomplete": [str(p.relative_to(root)) for p in incomplete],
        "safetensors": len(safetensors),
        "indexed_shards": len(expected_shards),
    }
