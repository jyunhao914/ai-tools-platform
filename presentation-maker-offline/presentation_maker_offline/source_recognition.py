"""Reviewable image-source recognition; never silently overwrites extracted text."""
from __future__ import annotations

from copy import deepcopy
import hashlib
from pathlib import Path
from uuid import uuid4

from .vision_backend import read_slide_text


def recognize_image_source(source: dict, project_root: str | Path, *,
                           python: str | Path, model: str | Path) -> dict:
    if source.get('format') not in {'png', 'jpg', 'jpeg', 'webp'}:
        raise ValueError('此辨識入口僅支援圖片來源')
    root = (Path(project_root) / 'sources').resolve()
    image = (root / source['managed_path']).resolve()
    if not image.is_relative_to(root):
        raise ValueError('來源路徑超出專案資料區')
    digest = hashlib.sha256(image.read_bytes()).hexdigest()
    if digest != source.get('content_sha256'):
        raise ValueError('來源檔案已變更，請重新匯入')
    result = read_slide_text(image, python=python, model=model)
    return {'id': str(uuid4()), 'source_id': source['id'],
            'source_version': source['version'], 'content_sha256': digest,
            'status': 'pending', 'text': result['text'], 'engine': result['engine'],
            'model': result['model'], 'coordinates': result['coordinates']}


def accept_recognition(source: dict, candidate: dict) -> dict:
    if candidate.get('status') != 'pending':
        raise ValueError('辨識候選已處理')
    if (source['id'], source['version'], source['content_sha256']) != (
            candidate['source_id'], candidate['source_version'], candidate['content_sha256']):
        raise ValueError('資料版本已變更，不能套用舊辨識結果')
    if not candidate.get('text', '').strip():
        raise ValueError('辨識內容不可為空')
    updated = deepcopy(source)
    updated.setdefault('recognition_history', []).append({
        'candidate': deepcopy(candidate), 'previous_fragments': deepcopy(source.get('fragments', []))})
    updated['version'] += 1
    updated['fragments'] = [{'id': str(uuid4()), 'page': 1,
                             'title': source.get('display_name', ''), 'text': candidate['text']}]
    updated['recognition'] = dict(candidate, status='accepted')
    updated['warnings'] = list(source.get('warnings', [])) + [
        '本機模型文字辨識；未提供文字座標，表格與圖表語意尚未驗證。']
    return updated
