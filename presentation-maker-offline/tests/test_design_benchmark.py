import json
from pathlib import Path
import pytest
from presentation_maker_offline import design_benchmark as benchmark


def test_source_keeps_numbers_and_table():
    text = (Path(__file__).parent / 'fixtures/colorectal_21_user_outline.md').read_text()
    assert '45至74歲' in benchmark.page_source(text, 17)
    assert '每2年' in benchmark.page_source(text, 17)
    assert '血便一定是痔瘡' in benchmark.page_source(text, 20)
    assert '第21頁' not in benchmark.page_source(text, 20)
    with pytest.raises(ValueError):
        benchmark.page_source(text, 22)


def test_resume_checks_candidate_hash(monkeypatch, tmp_path):
    outline = tmp_path / 'outline.md'
    outline.write_text('# 第6頁｜流程\n正常 → 瘜肉')
    image = tmp_path / 'candidate.png'
    image.write_bytes(b'test candidate')
    calls = []
    class Backend:
        def __init__(self, *args, **kwargs): pass
        def generate(self, prompt, **kwargs):
            calls.append(prompt)
            return {'image_path': str(image)}
    monkeypatch.setattr(benchmark, 'LocalQwenImageBackend', Backend)
    output = tmp_path / 'output'
    benchmark.run(outline, output, tmp_path, [6])
    benchmark.run(outline, output, tmp_path, [6])
    assert len(calls) == 1
    assert json.loads((output / 'page-06.json').read_text())['review'] == 'pending'
    (output / 'page-06.png').write_bytes(b'changed')
    with pytest.raises(RuntimeError):
        benchmark.run(outline, output, tmp_path, [6])
