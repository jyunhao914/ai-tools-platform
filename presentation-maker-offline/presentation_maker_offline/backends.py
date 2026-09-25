from __future__ import annotations
import hashlib, json, os, platform, shutil, socket, subprocess, sys, tempfile, threading, time
from urllib.error import URLError
from urllib.request import Request, urlopen
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
    runtime_executable: str | None = None
    startup_timeout: float = 900
    request_timeout: float = 1800
    max_tokens: int = 4096
    _process: subprocess.Popen | None = None
    _cancel_requested: bool = False

    def cancel(self) -> None:
        self._cancel_requested = True
        process = self._process
        if process is not None and process.poll() is None:
            process.terminate()

    def _runtime_path(self) -> str | None:
        candidate = self.runtime_executable or os.environ.get("PRESENTATION_MLX_SERVE")
        if candidate:
            path = Path(candidate).expanduser()
            return str(path.resolve()) if path.is_file() and os.access(path, os.X_OK) else None
        discovered = shutil.which("mlx-serve")
        if discovered:
            return discovered
        bundled_locations = [
            Path(sys.executable).resolve().parent.parent / "Resources" / "mlx-serve-macos-arm64" / "mlx-serve",
        ]
        extraction_root = getattr(sys, "_MEIPASS", None)
        if extraction_root:
            bundled_locations.append(Path(extraction_root) / "mlx-serve-macos-arm64" / "mlx-serve")
        for candidate_path in (
            *bundled_locations,
            Path.home() / "Library/Application Support/PresentationMaker/runtime/mlx-serve-macos-arm64/mlx-serve",
            Path("/opt/homebrew/bin/mlx-serve"),
            Path("/usr/local/bin/mlx-serve"),
        ):
            if candidate_path.is_file() and os.access(candidate_path, os.X_OK):
                return str(candidate_path)
        return None

    @staticmethod
    def _model_fingerprint(path: Path) -> str:
        index_path = path / "model.safetensors.index.json"
        index_data = json.loads(index_path.read_text())
        root = path.resolve()
        shards = sorted(set(index_data.get("weight_map", {}).values()))
        shard_paths = [(path / name).resolve() for name in shards]
        if any(root not in shard.parents for shard in shard_paths):
            raise ValueError("model index references files outside the checkpoint folder")
        files = [path / "config.json", index_path, *shard_paths]
        signature = [
            (file.name, file.stat().st_size, file.stat().st_mtime_ns)
            for file in files
        ]
        return hashlib.sha256(json.dumps(signature, separators=(",", ":")).encode()).hexdigest()

    @staticmethod
    def _verification_path() -> Path:
        return Path.home() / "Library" / "Application Support" / "PresentationMaker" / "text-runtime-verification.json"

    @staticmethod
    def _request_json(url: str, *, body: dict | None = None, timeout: float = 3) -> dict:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        request = Request(url, data=data, headers={"Content-Type": "application/json"} if data else {})
        with urlopen(request, timeout=timeout) as response:
            parsed = json.loads(response.read().decode("utf-8"))
        if not isinstance(parsed, dict):
            raise RuntimeError("本機文字模型回傳格式不正確")
        return parsed

    def health(self) -> dict:
        errors = self.manifest.validate(verify_hash=False)
        if self.format not in {"mlx", "gguf"}: errors.append("text model format must be mlx or gguf")
        path = Path(self.manifest.path)
        if path.is_dir() and not any(path.iterdir()): errors.append("selected model folder is empty")
        version = None
        runtime_binary = self._runtime_path()
        if self.format == "mlx":
            config_path = path / "config.json"
            index_path = path / "model.safetensors.index.json"
            try:
                config = json.loads(config_path.read_text())
                index = json.loads(index_path.read_text())
                shards = set(index.get("weight_map", {}).values())
                root = path.resolve()
                missing_shards = []
                for shard in shards:
                    candidate = (path / shard).resolve()
                    if root not in candidate.parents or not candidate.is_file():
                        missing_shards.append(str(shard))
                if not shards or missing_shards:
                    errors.append("MLX 模型索引引用了不存在的權重分片")
                model_type = config.get("model_type")
                if not model_type:
                    errors.append("MLX 模型設定缺少 model_type")
                elif model_type not in {"qwen3_5", "qwen3_5_moe", "qwen3", "qwen3_moe"}:
                    errors.append(f"mlx-serve 尚未列入驗收的模型架構：{model_type}")
            except (OSError, ValueError, TypeError) as exc:
                errors.append(f"MLX 模型索引或設定無法讀取：{type(exc).__name__}")

            runtime_requirements_path = path / "RUNTIME-REQUIREMENTS.json"
            if runtime_requirements_path.is_file():
                try:
                    runtime = json.loads(runtime_requirements_path.read_text())
                    inference = runtime.get("inference", {})
                    runtime_id = str(inference.get("revision", "") or inference.get("runtime", "")).lower()
                    if "mlx-serve" not in runtime_id:
                        errors.append("模型隨附的執行環境資料未指定 mlx-serve")
                except (OSError, ValueError, TypeError) as exc:
                    errors.append(f"模型執行環境資料無法讀取：{type(exc).__name__}")
        if runtime_binary is None:
            errors.append("找不到 mlx-serve；請安裝本機文字推論執行環境")
        else:
            try:
                result = subprocess.run(
                    [runtime_binary, "--version"], capture_output=True, text=True,
                    timeout=5, check=False,
                )
                if result.returncode:
                    errors.append("mlx-serve 無法正常啟動")
                else:
                    version = ((result.stdout or result.stderr).strip().splitlines() or [""])[0][:120]
            except (OSError, subprocess.TimeoutExpired):
                errors.append("mlx-serve 無法正常啟動")
        verified = False
        try:
            evidence = json.loads(self._verification_path().read_text())
            verified = (
                evidence.get("runtime_version") == version
                and evidence.get("model_path") == str(path.resolve())
                and evidence.get("model_fingerprint") == self._model_fingerprint(path)
            )
        except (OSError, ValueError, TypeError, KeyError):
            pass
        return {
            "ok": not errors,
            "weights_ready": not self.manifest.validate(verify_hash=False),
            "backend": self.name,
            "format": self.format,
            "runtime": "mlx-serve",
            "runtime_version": version,
            "inference_verified": verified,
            "errors": errors,
        }

    def plan(self, prompt: str) -> dict:
        health = self.health()
        if self._cancel_requested:
            raise InterruptedError("已取消本機文字模型工作")
        if not health["ok"]:
            raise RuntimeError("本機文字模型未通過執行環境檢查：" + "; ".join(health["errors"]))
        path = Path(self.manifest.path)
        if self.format != "mlx":
            raise RuntimeError("此模型設定目前只支援 mlx-serve 的 MLX 權重")
        executable = self._runtime_path()
        if not executable:
            raise RuntimeError("找不到 mlx-serve；請先完成本機文字引擎安裝")

        # The app owns a short-lived, loopback-only runtime process. Text and
        # image checkpoints are never resident together on this 64 GB Mac.
        with socket.socket() as port_socket:
            port_socket.bind(("127.0.0.1", 0))
            port = port_socket.getsockname()[1]
        log_dir = Path.home() / "Library" / "Caches" / "PresentationMaker" / "runtime-logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_path = log_dir / f"mlx-serve-{int(time.time())}-{os.getpid()}.log"
        command = [
            executable, "--model", str(path), "--serve", "--host", "127.0.0.1",
            "--port", str(port), "--no-mtp", "--reasoning-budget", "0",
        ]
        process = None
        try:
            with log_path.open("ab") as log_file:
                process = subprocess.Popen(
                    command, stdin=subprocess.DEVNULL, stdout=log_file,
                    stderr=subprocess.STDOUT, close_fds=True,
                )
            self._process = process
            base_url = f"http://127.0.0.1:{port}"
            deadline = time.monotonic() + self.startup_timeout
            models = None
            while time.monotonic() < deadline:
                if self._cancel_requested:
                    raise InterruptedError("已取消本機文字模型工作")
                if process.poll() is not None:
                    raise RuntimeError(f"mlx-serve 啟動失敗；請檢查本機記錄：{log_path}")
                try:
                    models = self._request_json(base_url + "/v1/models", timeout=2).get("data", [])
                    if models:
                        break
                except (OSError, URLError, TimeoutError, ValueError):
                    time.sleep(.5)
            if not models:
                raise TimeoutError(f"mlx-serve 載入模型逾時；請檢查本機記錄：{log_path}")
            if self._cancel_requested:
                raise InterruptedError("已取消本機文字模型工作")
            try:
                response = self._request_json(
                    base_url + "/v1/chat/completions",
                    body={
                        "model": models[0].get("id", "mlx-serve"),
                        "messages": [
                            {"role": "system", "content": "你是繁體中文簡報助理。先忠實保留來源內容；不可捏造未提供的事實。請以可編輯的 Markdown 投影片大綱回覆，每頁以 ## 開頭。"},
                            {"role": "user", "content": prompt},
                        ],
                        "max_tokens": self.max_tokens,
                        "temperature": 0.2,
                        "stream": False,
                        "reasoning_budget": 0,
                    },
                    timeout=self.request_timeout,
                )
            except Exception:
                if self._cancel_requested:
                    raise InterruptedError("已取消本機文字模型工作")
                raise
            text = response.get("choices", [{}])[0].get("message", {}).get("content", "")
            if isinstance(text, list):
                text = "\n".join(part.get("text", "") for part in text if isinstance(part, dict))
            if not isinstance(text, str) or not text.strip():
                raise RuntimeError("本機文字模型沒有產生可用的大綱；原始內容未更動")
            result_record = {
                "text": text.strip(), "backend": self.name,
                "model_path": str(path), "runtime": health["runtime_version"],
                "runtime_log": str(log_path),
            }
            verification_path = self._verification_path()
            verification_path.parent.mkdir(parents=True, exist_ok=True)
            temporary_path = verification_path.with_suffix(".tmp")
            temporary_path.write_text(json.dumps({
                "schema": 1,
                "runtime": "mlx-serve",
                "runtime_version": health["runtime_version"],
                "model_path": str(path.resolve()),
                "model_fingerprint": self._model_fingerprint(path),
                "verified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "result_sha256": hashlib.sha256(text.strip().encode()).hexdigest(),
            }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            temporary_path.replace(verification_path)
            return result_record
        finally:
            if process is not None and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=10)
            self._process = None

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
    def generate(
        self,
        prompt: str,
        *,
        edit_image: str | None = None,
        cancel_event: threading.Event | None = None,
        progress_callback=None,
    ) -> dict:
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
            if hasattr(pipeline, "_interrupt"):
                pipeline._interrupt = False
            image_input = Image.open(edit_image).convert("RGB") if edit_image else None
            call = {"prompt": prompt, "num_inference_steps": self.num_inference_steps, "width": self.width, "height": self.height}
            if image_input is not None:
                call["image"] = image_input
            if cancel_event is not None or progress_callback is not None:
                def on_step_end(pipe, step, _timestep, callback_kwargs):
                    if progress_callback:
                        progress_callback(step + 1, self.num_inference_steps)
                    if cancel_event and cancel_event.is_set():
                        # Diffusers checks this cooperative flag between denoising steps.
                        pipe._interrupt = True
                    return callback_kwargs

                call["callback_on_step_end"] = on_step_end
            try:
                result = pipeline(**call)
            except Exception:
                self._pipeline = None
                raise
            if cancel_event and cancel_event.is_set():
                raise InterruptedError("已取消本頁圖片生成；原有投影片內容未更動")
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
