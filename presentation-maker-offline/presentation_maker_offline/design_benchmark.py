"""Local whole-slide benchmark; output is a candidate, never auto-approved."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import time
from pathlib import Path
from types import SimpleNamespace

from .backends import LocalQwenImageBackend


def record_review(record_path: Path, *, accepted: bool, notes: str) -> Path:
    """Bind a review to exact image bytes; generating a file never approves it."""
    if not notes.strip():
        raise ValueError('Review notes are required')
    record = json.loads(record_path.read_text())
    image_path = record_path.with_suffix('.png')
    if record.get('status') != 'generated' or not image_path.is_file():
        raise ValueError('Only a completed candidate can be reviewed')
    digest = hashlib.sha256(image_path.read_bytes()).hexdigest()
    if digest != record.get('image_sha256'):
        raise ValueError('Image changed since generation; review refused')
    review = dict(image_sha256=digest, verdict='accepted' if accepted else 'rejected',
                  notes=notes.strip(), reviewed_at=time.time())
    history = record.setdefault('review_history', [])
    history.append(review)
    record['review'] = review['verdict']
    staging = record_path.with_suffix('.json.review-tmp')
    with staging.open('x', encoding='utf-8') as stream:
        stream.write(json.dumps(record, ensure_ascii=False, indent=2))
    staging.replace(record_path)
    return record_path


def page_source(outline: str, page: int) -> str:
    match = re.search(rf'^# 第{page}頁｜.*?(?=^# 第\d+頁｜|\Z)', outline, re.M | re.S)
    if not match:
        raise ValueError(f"找不到第 {page} 頁")
    return match.group(0).strip()


def build_prompt(source: str) -> str:
    """Keep layout instructions specific to the source's actual structure."""
    lines = source.splitlines()
    title = re.sub(r'^# 第\d+頁｜', '', lines[0]).strip()
    content = []
    for line in lines[1:]:
        line = line.replace('**', '').strip()
        if not line or '視覺建議：' in line:
            continue
        if re.fullmatch(r'[|\s:-]+', line):
            continue
        content.append(re.sub(r'^-\s+', '', line))
    if any(line.startswith('|') for line in content):
        layout = '標題下方為兩欄對照表。每列左右內容必須一一對應，不新增列欄。'
    elif '→' in source:
        layout = '標題下方為橫向流程，各階段以箭頭連接，說明文字置底。不要使用表格。'
    else:
        layout = '標題下方依內容分組，以清楚文字層級與留白呈現重點。不要使用表格。'
    return (
        '設計完整16:9繁體中文健康衛教投影片，藍白配色。不是投影片的照片。'
        + layout + '所有文字必須清晰、精確，不遮擋、不裁切。'
        '只呈現以下標題和正文；不新增文字、數字或事實，不改寫，不使用簡體字。\n'
        f'標題（逐字）：{title}\n正文（逐字）：\n' + '\n'.join(content)
    )


def visual_prompt(source: str, visual_brief: str) -> str:
    """Generate visual narrative only; exact copy belongs to the renderer."""
    if not visual_brief.strip():
        raise ValueError('A reviewed visual brief is required; never send slide copy as image instructions')
    if '→' in source:
        composition = ('A single coherent horizontal visual journey with exactly four distinct '
                       'illustrated stages in the middle third, connected left to right. '
                       'Reserve the top fifth for a title, clear space under each stage for labels, '
                       'and the bottom fifth for one explanatory sentence. No extra stages.')
    elif '|' in '\n'.join(source.splitlines()[1:]):
        composition = ('An editorial comparison composition with two clearly differentiated sides '
                       'and five aligned pairs of quiet text areas. Small meaningful visual accents '
                       'support the contrast, never compete with the text areas.')
    else:
        composition = ('One prominent conceptual illustration, balanced with generous quiet space '
                       'for a title and the supplied content. Use a clear focal point and reading path.')
    return ('Create a polished 16:9 editorial infographic visual layer for a health presentation. '
            'Warm ivory, deep navy and restrained teal accents; cohesive illustration style, '
            'intentional whitespace, strong hierarchy. No generic dashboard, spreadsheet, bullet '
            'list, blue gradient frame or decorative card grid. '
            + composition + ' Absolutely no text, letters, numerals, labels or watermarks. '
            'Do not draw captions or pseudo-writing anywhere. Visual subject: '
            + visual_brief.strip())


def run(outline_path: Path, output: Path, model: Path, pages: list[int],
        *, route: str = 'whole-slide', width: int = 1024, height: int = 576,
        visual_brief: str = '', design_brief: str = '', reference_image: Path | None = None) -> None:
    if route not in {'whole-slide', 'visual-layer'}:
        raise ValueError('Unknown benchmark route')
    if width < 16 or height < 16 or width % 16 or height % 16:
        raise ValueError('Dimensions must be positive multiples of 16')
    if route == 'visual-layer' and (not visual_brief.strip() or len(pages) != 1):
        raise ValueError('Visual-layer benchmark needs one page and its reviewed visual brief')
    reference = None
    if reference_image is not None:
        from PIL import Image
        reference_image = Path(reference_image).resolve(strict=True)
        with Image.open(reference_image) as image:
            image.verify()
        reference = dict(path=str(reference_image),
                         sha256=hashlib.sha256(reference_image.read_bytes()).hexdigest(),
                         role='style_reference')
    outline = outline_path.read_text(encoding="utf-8")
    output.mkdir(parents=True, exist_ok=True)
    backend = LocalQwenImageBackend(SimpleNamespace(path=str(model)),
                                   width=width, height=height, num_inference_steps=40)
    for page in pages:
        source = page_source(outline, page)
        prompt = build_prompt(source) if route == 'whole-slide' else visual_prompt(source, visual_brief)
        if design_brief.strip():
            # Do not silently force the old blue-white palette over a supplied design direction.
            prompt = prompt.replace('藍白配色。', '').replace(
                'Warm ivory, deep navy and restrained teal accents; ', '')
            prompt += '\n指定視覺設計方向（不得改動來源內容）：\n' + design_brief.strip()
        if reference:
            prompt += ('\n附圖僅作視覺風格與構圖品質參考，不是內容來源。'
                       '依本頁內容重新組織資訊與配圖；不要複製參考圖的文字、標誌、數字或主題。'
                       '仍須遵守本路線的文字要求。')
        signature = hashlib.sha256((str(model) + prompt + f'{width}x{height}/40/{route}').encode()).hexdigest()
        if reference:
            signature = hashlib.sha256((signature + reference['sha256']).encode()).hexdigest()
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
                      model=str(model), width=width, height=height, steps=40,
                      status='running', review='pending', route=route)
        if design_brief.strip():
            record['design_brief'] = design_brief.strip()
        if reference:
            record['reference_image'] = reference
        record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2))
        start = time.monotonic()
        try:
            kwargs = dict(progress_callback=lambda n, total:
                          print(f"PAGE {page} STEP {n}/{total}", flush=True))
            if reference:
                if hashlib.sha256(reference_image.read_bytes()).hexdigest() != reference['sha256']:
                    raise ValueError('Reference image changed before inference')
                kwargs['edit_image'] = str(reference_image)
            result = backend.generate(prompt, **kwargs)
            if reference and hashlib.sha256(reference_image.read_bytes()).hexdigest() != reference['sha256']:
                raise ValueError('Reference image changed during inference; candidate not accepted')
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
    parser.add_argument('--route', choices=['whole-slide', 'visual-layer'], default='whole-slide')
    parser.add_argument('--width', type=int, default=1024)
    parser.add_argument('--height', type=int, default=576)
    parser.add_argument('--visual-brief', default='')
    parser.add_argument('--design-brief', default='')
    parser.add_argument('--reference-image', type=Path)
    args = parser.parse_args()
    run(args.outline, args.output, args.model, args.pages,
        route=args.route, width=args.width, height=args.height, visual_brief=args.visual_brief,
        design_brief=args.design_brief, reference_image=args.reference_image)
