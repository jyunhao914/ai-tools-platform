"""Persist bounded local design attempts; successful layouts still need visual review."""
import argparse
import json
import time
from pathlib import Path

from .backends import LocalQwenTextBackend
from .manifest import CheckpointManifest
from .source_import import parse_outline_text
from .design_planner import plan_slide_design, source_blocks
from .editorial_scene import render_scene, source_fingerprint


def run(outline, output, model, pages, backend=None):
    _, slides, _ = parse_outline_text(Path(outline).read_text())
    if not pages or len(set(pages)) != len(pages) or any(p < 1 or p > len(slides) for p in pages):
        raise ValueError('Pages must be unique source page numbers')
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    backend = backend or LocalQwenTextBackend(CheckpointManifest(
        'Local Qwen layout benchmark', str(model), '0'*64,
        'local model directory', 'local', 'see checkpoint license', 'mlx', format='mlx'))
    results = []
    for number in pages:
        slide = slides[number-1]
        record = dict(page=number, source_fingerprint=source_fingerprint(slide),
                      source_blocks=source_blocks(slide), model=str(model),
                      status='running', attempts=[], review=dict(verdict='pending'))
        record_path = output / f'page-{number:02d}.json'
        def persist():
            temporary = record_path.with_suffix('.json.tmp')
            temporary.write_text(json.dumps(record, ensure_ascii=False, indent=2))
            temporary.replace(record_path)
        class RecordedBackend:
            def plan(self, prompt, **kwargs):
                attempt = dict(prompt=prompt, system_prompt=kwargs.get('system_prompt'), status='running')
                record['attempts'].append(attempt)
                persist()
                started = time.monotonic()
                try:
                    result = backend.plan(prompt, **kwargs)
                    attempt.update(status='responded', text=result.get('text', ''))
                    return result
                except Exception as exc:
                    attempt.update(status='failed', error=str(exc))
                    raise
                finally:
                    attempt['seconds'] = round(time.monotonic()-started, 3)
                    persist()
        started = time.monotonic()
        persist()
        try:
            scene = plan_slide_design(slide, RecordedBackend())
            image = render_scene(scene, output / f'page-{number:02d}.png')
            record.update(status='layout_validated', scene=scene, image_path=str(image),
                          visuals_generated=False, product_accepted=False)
        except Exception as exc:
            record.update(status='failed', error=str(exc), product_accepted=False)
        record['seconds'] = round(time.monotonic()-started, 3)
        persist()
        results.append(dict(page=number, status=record['status'], seconds=record['seconds']))
    return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--outline', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--pages', type=int, nargs='+', required=True)
    args = parser.parse_args()
    print(json.dumps(run(args.outline, args.output, args.model, args.pages), ensure_ascii=False))
