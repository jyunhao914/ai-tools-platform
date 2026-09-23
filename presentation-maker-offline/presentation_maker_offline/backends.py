from __future__ import annotations
import os, platform, tempfile
from pathlib import Path
from dataclasses import dataclass
from PIL import Image
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
    name: str = "qwen3.8-27b-local"
    format: str = "mlx"
    _model: object | None = None
    _tokenizer: object | None = None
    def health(self) -> dict:
        errors = self.manifest.validate(verify_hash=False)
        if self.format not in {"mlx", "gguf"}: errors.append("text model format must be mlx or gguf")
        if Path(self.manifest.path).is_dir() and not any(Path(self.manifest.path).iterdir()): errors.append("selected model folder is empty")
        if self.format == "mlx":
            shards = list(Path(self.manifest.path).glob("*.safetensors"))
            if len(shards) < 1: errors.append("MLX model folder has no safetensors shards")
        runtime = "mlx_lm" if self.format == "mlx" else "llama_cpp"
        try:
            __import__(runtime)
        except ImportError:
            errors.append(f"local inference runtime unavailable: {runtime}")
        return {"ok": not errors, "weights_ready": not self.manifest.validate(verify_hash=False), "backend": self.name, "format": self.format, "runtime": runtime, "errors": errors}
    def plan(self, prompt: str) -> dict:
        path = Path(self.manifest.path)
        if self.format == "mlx":
            try:
                import mlx_lm
            except ImportError as exc:
                raise RuntimeError("請安裝 MLX-LM，才能在本機執行文字模型") from exc
            if self._model is None:
                self._model, self._tokenizer = mlx_lm.load(str(path))
            generated = mlx_lm.generate(self._model, self._tokenizer, prompt=prompt, max_tokens=2048, verbose=False)
            return {"text": generated, "backend": self.name, "model_path": str(path)}
        try:
            from llama_cpp import Llama
        except ImportError as exc:
            raise RuntimeError("請安裝 llama-cpp-python，才能載入本機 GGUF 模型") from exc
        if path.is_dir():
            raise ValueError("GGUF 模型路徑必須是單一 .gguf 檔案")
        if self._model is None:
            self._model = Llama(model_path=str(path), n_ctx=8192, verbose=False)
        response = self._model.create_chat_completion(messages=[{"role": "user", "content": prompt}], max_tokens=2048)
        return {"text": response["choices"][0]["message"]["content"], "backend": self.name, "model_path": str(path)}

@dataclass
class LocalQwenImageBackend(ImageBackend):
    manifest: CheckpointManifest
    runtime: str = "diffusers"
    vae_device: str = "auto"
    name: str = "qwen-image-2.1-local"
    _pipeline: object | None = None
    def selected_vae_device(self, editing: bool) -> str:
        if self.vae_device in {"cpu", "mps"}: return self.vae_device
        return "cpu" if editing and platform.system() == "Darwin" and platform.machine() == "arm64" else "mps"
    def health(self) -> dict:
        errors = self.manifest.validate(verify_hash=False)
        if self.runtime != "diffusers": errors.append("the desktop image engine must use diffusers")
        try:
            import torch
            from diffusers import QwenImage21Pipeline  # noqa: F401
        except Exception as exc:
            errors.append(f"local image runtime unavailable: {type(exc).__name__}")
        else:
            if platform.system() == "Darwin" and platform.machine() == "arm64" and not torch.backends.mps.is_available():
                errors.append("PyTorch MPS is unavailable")
        return {"ok": not errors, "weights_ready": not self.manifest.validate(verify_hash=False), "backend": self.name, "runtime": self.runtime, "vae_device": self.selected_vae_device(False), "errors": errors}
    def generate(self, prompt: str, *, edit_image: str | None = None) -> dict:
        try:
            import torch
            from diffusers import QwenImage21Pipeline
            device = "mps" if torch.backends.mps.is_available() else "cpu"
            if self._pipeline is None:
                self._pipeline = QwenImage21Pipeline.from_pretrained(
                    self.manifest.path,
                    torch_dtype=torch.float16 if device == "mps" else torch.float32,
                    local_files_only=True,
                    low_cpu_mem_usage=True,
                ).to(device)
            pipeline = self._pipeline
            vae_device = self.selected_vae_device(edit_image is not None)
            if edit_image is not None and vae_device == "cpu":
                pipeline.vae.to("cpu")
            image_input = Image.open(edit_image).convert("RGB") if edit_image else None
            call = {"prompt": prompt, "num_inference_steps": 40, "width": 1024, "height": 576}
            if image_input is not None:
                from diffusers import QwenImageEditPlusPipeline
                if not isinstance(pipeline, QwenImageEditPlusPipeline):
                    pipeline = QwenImageEditPlusPipeline.from_pretrained(
                        self.manifest.path,
                        torch_dtype=torch.float16 if device == "mps" else torch.float32,
                        local_files_only=True,
                        low_cpu_mem_usage=True,
                    ).to(device)
                    self._pipeline = pipeline
                call["image"] = image_input
            result = pipeline(**call)
            output_dir = Path.home() / "Library" / "Caches" / "PresentationMaker" / "generated"
            output_dir.mkdir(parents=True, exist_ok=True)
            descriptor, filename = tempfile.mkstemp(suffix=".png", dir=output_dir)
            os.close(descriptor)
            output_path = Path(filename)
            result.images[0].save(output_path)
            return {"device": device, "vae_device": vae_device, "image_path": str(output_path)}
        except ImportError as exc:
            raise RuntimeError("內建影像引擎尚未安裝 Diffusers/PyTorch") from exc
