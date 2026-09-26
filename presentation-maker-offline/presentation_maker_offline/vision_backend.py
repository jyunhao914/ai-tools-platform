"""Isolated offline Qwen vision reader; does not rewrite source documents."""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import hashlib
import json
import time

from .content_fidelity import compare_copy


def discover_vision_python() -> Path | None:
    """Prefer explicit configuration, then app-managed runtime, never resolve symlinks."""
    candidates = [os.environ.get('PRESENTATION_VISION_PYTHON'),
                  Path.home() / 'Library/Application Support/PresentationMaker/vision-runtime/bin/python',
                  Path.home() / 'Documents/Codex/2026-09-22/presentation-maker-offline-qwen/work/vision-runtime/bin/python']
    for candidate in candidates:
        if candidate:
            path = Path(candidate).expanduser().absolute()
            if path.is_file() and os.access(path, os.X_OK):
                return path
    return None

def read_slide_text(image: str | Path, *, python: str | Path, model: str | Path,
                    expected: str | None = None, timeout: float = 180) -> dict:
    image, model = (Path(p).expanduser().resolve() for p in (image, model))
    # Resolving a venv executable symlink bypasses its pyvenv.cfg and packages.
    python = Path(python).expanduser().absolute()
    if not image.is_file():
        raise FileNotFoundError(image)
    if not python.is_file():
        raise FileNotFoundError(python)
    if not model.is_dir():
        raise FileNotFoundError(model)
    if timeout <= 0:
        raise ValueError('timeout must be positive')
    from PIL import Image
    with Image.open(image) as candidate:
        candidate.verify()
    env = dict(os.environ, HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1',
               HF_HUB_DISABLE_TELEMETRY='1', TOKENIZERS_PARALLELISM='false')
    command = [str(python), '-m', 'mlx_vlm.generate', '--model', str(model),
               '--image', str(image), '--prompt',
               '請逐字抄錄圖片中所有可見文字，依閱讀順序輸出。不要補字、改寫或解釋。看不清楚標記[不清楚]。',
               '--max-tokens', '2048', '--temperature', '0']
    try:
        result = subprocess.run(command, env=env, capture_output=True, text=True,
                                timeout=timeout, check=False)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError('本機圖片辨識逾時；來源未修改') from exc
    if result.returncode:
        raise RuntimeError(f'本機圖片辨識失敗（{result.returncode}）：{result.stderr[-1500:]}')
    text = result.stdout.strip()
    if not text:
        raise RuntimeError('本機圖片辨識未回傳文字；不能視為空白頁')
    return {'engine': 'qwen-vl-local', 'image': str(image), 'model': str(model),
            'text': text, 'review': 'pending', 'coordinates': None,
            'fidelity': compare_copy(expected, text) if expected is not None else None}


def save_recognition_report(image: Path, output: Path, *, python: Path,
                            model: Path, expected: str | None = None) -> dict:
    """Persist actual recognition evidence without overwriting a previous run."""
    if output.exists():
        raise FileExistsError(output)
    started = time.monotonic()
    digest = hashlib.sha256(image.read_bytes()).hexdigest()
    result = read_slide_text(image, python=python, model=model, expected=expected)
    if hashlib.sha256(image.read_bytes()).hexdigest() != digest:
        raise RuntimeError('辨識期間圖片已變更，結果不保存')
    result.update(image_sha256=digest, seconds=round(time.monotonic() - started, 2))
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('x', encoding='utf-8') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
    return result
