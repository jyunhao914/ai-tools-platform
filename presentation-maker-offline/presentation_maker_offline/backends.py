from __future__ import annotations
import platform, urllib.request
from pathlib import Path
from dataclasses import dataclass
from .manifest import CheckpointManifest

class TextBackend:
    name = "text"
    def health(self) -> dict: raise NotImplementedError
    def plan(self, prompt: str) -> dict: raise NotImplementedError

class ImageBackend:
    name = "image"
    def health(self) -> dict: raise NotImplementedError
    def generate(self, prompt: str, *, edit_image: str | None = None) -> dict: raise NotImplementedError

@dataclass
class LocalQwenTextBackend(TextBackend):
    manifest: CheckpointManifest
    endpoint: str | None = None
    name: str = "qwen3.8-27b-local"
    format: str = "mlx"
    def health(self) -> dict:
        errors = self.manifest.validate(verify_hash=False)
        if self.format not in {"mlx", "gguf"}: errors.append("text model format must be mlx or gguf")
        if Path(self.manifest.path).is_dir() and not any(Path(self.manifest.path).iterdir()): errors.append("selected model folder is empty")
        if self.format == "mlx":
            shards = list(Path(self.manifest.path).glob("*.safetensors"))
            if len(shards) < 1: errors.append("MLX model folder has no safetensors shards")
        if self.endpoint:
            try:
                urllib.request.urlopen(self.endpoint.rstrip("/") + "/health", timeout=2)
            except Exception as exc: errors.append(f"service unavailable: {type(exc).__name__}")
        return {"ok": not errors, "backend": self.name, "format": self.format, "errors": errors}
    def plan(self, prompt: str) -> dict:
        raise RuntimeError("local Qwen service adapter is not connected; configure endpoint")

@dataclass
class LocalQwenImageBackend(ImageBackend):
    manifest: CheckpointManifest
    runtime: str = "diffusers"
    vae_device: str = "auto"
    name: str = "qwen-image-2.1-local"
    def selected_vae_device(self, editing: bool) -> str:
        if self.vae_device in {"cpu", "mps"}: return self.vae_device
        return "cpu" if editing and platform.system() == "Darwin" and platform.machine() == "arm64" else "mps"
    def health(self) -> dict:
        errors = self.manifest.validate(verify_hash=False)
        if self.runtime != "diffusers": errors.append("the desktop image engine must use diffusers")
        return {"ok": not errors, "backend": self.name, "runtime": self.runtime, "vae_device": self.selected_vae_device(False), "errors": errors}
    def generate(self, prompt: str, *, edit_image: str | None = None) -> dict:
        try:
            import torch
            from diffusers import DiffusionPipeline
            device = "mps" if torch.backends.mps.is_available() else "cpu"
            pipe = DiffusionPipeline.from_pretrained(self.manifest.path, torch_dtype=torch.float16 if device == "mps" else torch.float32)
            pipe.to(device)
            if edit_image is not None and hasattr(pipe, "__call__"):
                result = pipe(prompt=prompt, image=edit_image)
            else:
                result = pipe(prompt=prompt)
            return {"device": device, "vae_device": self.selected_vae_device(edit_image is not None), "image": result.images[0]}
        except ImportError as exc:
            raise RuntimeError("內建影像引擎尚未安裝 Diffusers/PyTorch") from exc
