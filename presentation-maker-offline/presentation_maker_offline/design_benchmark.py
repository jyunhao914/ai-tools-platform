"""Local whole-slide benchmark; output is a candidate, never auto-approved."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import time
from pathlib import Path
from types import SimpleNamespace

from .backends import LocalQwenImageBackend


def page_source(outline: str, page: int) -> str:
    import re
    match = re.search(rf'^# 第{page}頁｜.*?(?=^# 第\d+頁｜|\Z)', outline, re.M | re.S)
    if not match:
        raise ValueError(f"找不到第 {page} 頁")
    return match.group(0).strip()


def run(outline_path: Path, output: Path, model: Path, pages: list[int]) -> None:
    outline = outline_path.read_text(encoding="utf-8")
    output.mkdir(parents=True, exist_ok=True)
    backend = LocalQwenImageBackend(SimpleNamespace(path=str(model)),
                                   width=1024, height=576, num_inference_steps=40)
    for page in pages:
        source = page_source(outline, page)
        prompt = (
            "設計完整16:9繁體中文健康衛教投影片，藍白配色，清楚字級層次與留白。"
            "依內容自行設計流程、重點或對照表，不是投影片的照片。"
            "以下為來源大綱，Markdown為格式指示。視覺建議不用印在頁上。"
            "正文、數字、標點必須精確保留，不新增事實，不使用簡體字。"
            "表格每列兩欄必須正確對應，不遮擋、不裁切文字。\n" + source
        )
        signature = hashlib.sha256((str(model) + prompt + '1024x576/40').encode()).hexdigest()
        record_path = output / f"page-{page:02d}.json"
        image_path = output / f"page-{page:02d}.png"
        if record_path.exists():
            record = json.loads(record_path.read_text())
            if (record.get('signature') == signature and record.get('status') == 'generated'
                    and image_path.exists()
                    and hashlib.sha256(image_path.read_bytes()).hexdigest() == record.get('image_sha256')):
                print(f"SKIP page {page}: verified existing candidate", flush=True)
                continue
            raise RuntimeError(f"已有不同或未完成的記錄，請使用新的輸出目錄：{record_path}")
        if image_path.exists():
            raise RuntimeError(f"不覆寫已有圖片：{image_path}")
        record = dict(page=page, signature=signature, prompt=prompt, source=source,
                      model=str(model), width=1024, height=576, steps=40,
                      status='running', review='pending', route='whole-slide')
        record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2))
        start = time.monotonic()
        try:
            result = backend.generate(prompt, progress_callback=lambda n, total:
                                      print(f"PAGE {page} STEP {n}/{total}", flush=True))
            shutil.copy2(result['image_path'], image_path)
            record.update(status='generated', image_sha256=hashlib.sha256(image_path.read_bytes()).hexdigest())
        except Exception as exc:
            record.update(status='failed', error=f'{type(exc).__name__}: {exc}')
            raise
        finally:
            record['seconds'] = round(time.monotonic() - start, 2)
            record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2))
        print(f"DONE page {page}: {image_path}", flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--outline', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--pages', type=int, nargs='+', default=[6, 17, 20])
    args = parser.parse_args()
    run(args.outline, args.output, args.model, args.pages)
