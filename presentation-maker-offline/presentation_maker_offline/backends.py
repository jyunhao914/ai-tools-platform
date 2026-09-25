from __future__ import annotations
import importlib, json, os, platform, tempfile
from pathlib import Path
from dataclasses import dataclass
from PIL import Image
from .manifest import CheckpointManifest
from .storage import qwen_image21_readiness

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
        path = Path(self.manifest.path)
        if path.is_dir() and not any(path.iterdir()): errors.append("selected model folder is empty")
        if self.format == "mlx":
            config_path = path / "config.json"
            index_path = path / "model.safetensors.index.json"
            try:
                config = json.loads(config_path.read_text())
                index = json.loads(index_path.read_text())
                shards = set(index.get("weight_map", {}).values())
                if not shards or any(not (path / shard).is_file() for shard in shards):
                    errors.append("MLX model index references missing weight shards")
                model_type = config.get("model_type")
                if not model_type:
                    errors.append("MLX model config does not declare model_type")
                else:
                    try:
                        importlib.import_module(f"mlx_lm.models.{model_type}")
                    except ImportError:
                        errors.append(f"MLX-LM does not support model architecture: {model_type}")
            except (OSError, ValueError, TypeError) as exc:
                errors.append(f"MLX model metadata is unreadable: {type(exc).__name__}")

            runtime_path = path / "RUNTIME-REQUIREMENTS.json"
            if runtime_path.is_file():
                try:
                    runtime = json.loads(runtime_path.read_text())
                    inference = runtime.get("inference", {})
                    runtime_id = str(inference.get("revision", "") or inference.get("runtime", "")).lower()
                    if "mlx-lm" not in runtime_id and "mlx_lm" not in runtime_id:
                        errors.append("checkpoint runtime evidence does not validate the app's MLX-LM backend")
                    if runtime.get("runtime_evidence_pending_at_packaging"):
                        errors.append("checkpoint package records required runtime evidence as pending")
                except (OSError, ValueError, TypeError) as exc:
                    errors.append(f"checkpoint runtime requirements are unreadable: {type(exc).__name__}")
        runtime = "mlx_lm" if self.format == "mlx" else "llama_cpp"
        try:
            __import__(runtime)
        except ImportError:
            errors.append(f"local inference runtime unavailable: {runtime}")
        return {"ok": not errors, "weights_ready": not self.manifest.validate(verify_hash=False), "backend": self.name, "format": self.format, "runtime": runtime, "errors": errors}
    def plan(self, prompt: str) -> dict:
        health = self.health()
        if not health["ok"]:
            raise RuntimeError("本機文字模型未通過執行環境檢查：" + "; ".join(health["errors"]))
        path = Path(self.manifest.path)
        if self.format == "mlx":
            try:
                import mlx_lm
            except ImportError as exc:
                raise RuntimeError("請安裝 MLX-LM，才能在本機執行文字模型") from exc
            if self._model is None:
                self._model, self._tokenizer = mlx_lm.load(str(path))
            messages = [
                {"role": "system", "content": "你是繁體中文簡報助理。忠實保留來源內容，不添加無依據的事實。"},
                {"role": "user", "content": prompt},
            ]
            try:
                formatted_prompt = self._tokenizer.apply_chat_template(
                    messages, tokenize=False, add_generation_prompt=True, enable_thinking=False,
                )
            except TypeError:
                formatted_prompt = self._tokenizer.apply_chat_template(
                    messages, tokenize=False, add_generation_prompt=True,
                )
            generated = mlx_lm.generate(self._model, self._tokenizer, prompt=formatted_prompt, max_tokens=2048, verbose=False)
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
    num_inference_steps: int = 40
    width: int = 1024
    height: int = 576
    name: str = "qwen-image-2.1-local"
    _pipeline: object | None = None
    def selected_vae_device(self, editing: bool) -> str:
        if self.vae_device == "cpu": return "cpu"
        try:
            import torch
            mps_available = platform.system() == "Darwin" and torch.backends.mps.is_available()
        except (ImportError, AttributeError):
            mps_available = False
        if self.vae_device == "mps": return "mps" if mps_available else "cpu"
        return "mps" if mps_available else "cpu"
    def health(self) -> dict:
        errors = self.manifest.validate(verify_hash=False)
        readiness = qwen_image21_readiness(self.manifest.path)
        errors.extend(readiness["missing"])
        if readiness["incomplete"]:
            errors.append("checkpoint contains incomplete download files")
        if self.runtime != "diffusers": errors.append("the desktop image engine must use diffusers")
        if self.vae_device == "cpu": errors.append("CPU-only VAE offload is not enabled; use auto/MPS or full CPU inference")
        try:
            import torch
            from diffusers import QwenImage21Pipeline  # noqa: F401
        except Exception as exc:
            errors.append(f"local image runtime unavailable: {type(exc).__name__}")
        else:
            if platform.system() == "Darwin" and platform.machine() == "arm64" and not torch.backends.mps.is_available():
                errors.append("PyTorch MPS is unavailable")
        return {"ok": not errors, "weights_ready": readiness["ready"], "backend": self.name, "runtime": self.runtime, "vae_device": self.selected_vae_device(False), "errors": errors}
    def generate(self, prompt: str, *, edit_image: str | None = None) -> dict:
        if self.num_inference_steps < 2:
            raise ValueError("Qwen-Image generation requires at least 2 inference steps")
        if self.width < 16 or self.height < 16:
            raise ValueError("image width and height must each be at least 16 pixels")
        try:
            import torch
            from diffusers import QwenImage21Pipeline
            device = "mps" if torch.backends.mps.is_available() else "cpu"
            vae_device = self.selected_vae_device(edit_image is not None)
            if vae_device == "cpu" and device == "mps":
                raise RuntimeError("CPU-only VAE offload is not enabled yet; select auto/MPS to keep inference on the accelerator")
            readiness = qwen_image21_readiness(self.manifest.path)
            if not readiness["ready"]:
                raise RuntimeError("本機 Qwen-Image 權重未通過完整性檢查：" + "; ".join(readiness["missing"] + readiness["incomplete"]))
            if self._pipeline is None:
                self._pipeline = QwenImage21Pipeline.from_pretrained(
                    self.manifest.path,
                    dtype=torch.float16 if device == "mps" else torch.float32,
                    local_files_only=True,
                    low_cpu_mem_usage=True,
                ).to(device)
            pipeline = self._pipeline
            if str(pipeline.vae.device) != device:
                pipeline.vae.to(device)
            image_input = Image.open(edit_image).convert("RGB") if edit_image else None
            call = {"prompt": prompt, "num_inference_steps": self.num_inference_steps, "width": self.width, "height": self.height}
            if image_input is not None:
                call["image"] = image_input
            try:
                result = pipeline(**call)
            except Exception:
                self._pipeline = None
                raise
            images = result.images
            candidate = images[0].convert("RGB")
            extrema = candidate.getextrema()
            color_count = len(set(candidate.get_flattened_data()))
            if all(low == high for low, high in extrema) or color_count < 8:
                self._pipeline = None
                raise RuntimeError("Qwen-Image produced a flat/invalid image; no output was saved")
            output_dir = Path.home() / "Library" / "Caches" / "PresentationMaker" / "generated"
            output_dir.mkdir(parents=True, exist_ok=True)
            descriptor, filename = tempfile.mkstemp(suffix=".png", dir=output_dir)
            os.close(descriptor)
            output_path = Path(filename)
            candidate.save(output_path)
            return {"device": device, "vae_device": vae_device, "image_path": str(output_path)}
        except ImportError as exc:
            raise RuntimeError("內建影像引擎尚未安裝 Diffusers/PyTorch") from exc
