from __future__ import annotations
import platform, urllib.request
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
    name: str = "qwen3-8b-local"
    def health(self) -> dict:
        errors = self.manifest.validate(verify_hash=False)
        if self.endpoint:
            try:
                urllib.request.urlopen(self.endpoint.rstrip("/") + "/health", timeout=2)
            except Exception as exc: errors.append(f"service unavailable: {type(exc).__name__}")
        return {"ok": not errors, "backend": self.name, "errors": errors}
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
        if self.runtime not in {"diffusers", "comfyui"}: errors.append("runtime must be diffusers or comfyui")
        return {"ok": not errors, "backend": self.name, "runtime": self.runtime, "vae_device": self.selected_vae_device(False), "errors": errors}
    def generate(self, prompt: str, *, edit_image: str | None = None) -> dict:
        raise RuntimeError("local image runtime adapter is not connected; install/configure the selected runtime")

