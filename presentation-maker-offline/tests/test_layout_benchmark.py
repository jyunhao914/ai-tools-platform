import json
from pathlib import Path
import pytest

from presentation_maker_offline.layout_benchmark import run


class Backend:
    def __init__(self, fail=False):
        self.fail = fail
    def plan(self, prompt, **kwargs):
        if self.fail:
            return {'text': '[]'}
        blocks = json.loads(prompt)
        return {'text': json.dumps(dict(background='#FFFFFF', texts=[
            dict(source_id=key, rect=[100,100+i*200,1700,150], size=38)
            for i, key in enumerate(blocks)]))}


def test_benchmark_records_real_attempt_metadata_without_claiming_acceptance(tmp_path):
    fixture = Path(__file__).parent/'fixtures'/'colorectal_21_user_outline.md'
    output = tmp_path/'valid'
    result = run(fixture, output, '/local/model', [17], Backend())
    assert result[0]['status'] == 'layout_validated'
    record = json.loads((output/'page-17.json').read_text())
    assert len(record['attempts']) == 1
    assert record['attempts'][0]['system_prompt']
    assert record['review']['verdict'] == 'pending'
    assert not record['visuals_generated'] and not record['product_accepted']
    assert (output/'page-17.png').exists()
    with pytest.raises(FileExistsError):
        run(fixture, output, '/local/model', [17], Backend())


def test_benchmark_keeps_failed_attempts_and_does_not_emit_a_slide(tmp_path):
    fixture = Path(__file__).parent/'fixtures'/'colorectal_21_user_outline.md'
    output = tmp_path/'failed'
    result = run(fixture, output, '/local/model', [17], Backend(fail=True))
    assert result[0]['status'] == 'failed'
    record = json.loads((output/'page-17.json').read_text())
    assert len(record['attempts']) == 3
    assert '三次' in record['error']
    assert not (output/'page-17.png').exists()
