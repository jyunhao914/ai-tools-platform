from types import SimpleNamespace
import subprocess
import pytest
from PIL import Image
from presentation_maker_offline.vision_backend import read_slide_text
from presentation_maker_offline.vision_backend import discover_vision_python
from presentation_maker_offline import vision_backend


def test_report_preserves_existing_evidence(monkeypatch, tmp_path):
    image = tmp_path / 'image.png'
    image.write_bytes(b'original')
    output = tmp_path / 'report.json'
    monkeypatch.setattr(vision_backend, 'read_slide_text', lambda *a, **k: {'text': '文字'})
    result = vision_backend.save_recognition_report(image, output, python=tmp_path, model=tmp_path)
    assert result['image_sha256']
    with pytest.raises(FileExistsError):
        vision_backend.save_recognition_report(image, output, python=tmp_path, model=tmp_path)


def test_changed_image_does_not_save_report(monkeypatch, tmp_path):
    image = tmp_path / 'image.png'
    image.write_bytes(b'original')
    def read(*a, **k):
        image.write_bytes(b'changed')
        return {'text': '文字'}
    monkeypatch.setattr(vision_backend, 'read_slide_text', read)
    output = tmp_path / 'report.json'
    with pytest.raises(RuntimeError):
        vision_backend.save_recognition_report(image, output, python=tmp_path, model=tmp_path)
    assert not output.exists()


def test_discovery_preserves_venv_symlink(monkeypatch, tmp_path):
    target = tmp_path / 'base-python'
    target.touch()
    target.chmod(0o755)
    executable = tmp_path / 'venv-python'
    executable.symlink_to(target)
    monkeypatch.setenv('PRESENTATION_VISION_PYTHON', str(executable))
    assert discover_vision_python() == executable


@pytest.fixture
def inputs(tmp_path):
    image = tmp_path / 'slide.png'
    Image.new('RGB', (32, 32)).save(image)
    python = tmp_path / 'python'
    python.touch()
    model = tmp_path / 'model'
    model.mkdir()
    return image, dict(python=python, model=model)


def test_offline_reader_does_not_supply_expected_answer(monkeypatch, inputs):
    def run(command, **kwargs):
        assert kwargs['env']['HF_HUB_OFFLINE'] == '1'
        assert kwargs['env']['TRANSFORMERS_OFFLINE'] == '1'
        assert '原稿秘密' not in ' '.join(command)
        assert isinstance(command, list)
        return SimpleNamespace(returncode=0, stdout='辨識文字', stderr='')
    monkeypatch.setattr(subprocess, 'run', run)
    image, options = inputs
    result = read_slide_text(image, **options, expected='原稿秘密')
    assert result['fidelity']['status'] == 'needs_review'
    assert result['coordinates'] is None
    assert result['review'] == 'pending'


@pytest.mark.parametrize('result', [SimpleNamespace(returncode=1, stdout='', stderr='failed'),
                                    SimpleNamespace(returncode=0, stdout='', stderr='')])
def test_failed_or_empty_is_not_success(monkeypatch, inputs, result):
    monkeypatch.setattr(subprocess, 'run', lambda *a, **k: result)
    image, options = inputs
    with pytest.raises(RuntimeError):
        read_slide_text(image, **options)


def test_timeout(monkeypatch, inputs):
    def run(*args, **kwargs):
        raise subprocess.TimeoutExpired('vision', 1)
    monkeypatch.setattr(subprocess, 'run', run)
    image, options = inputs
    with pytest.raises(RuntimeError, match='逾時'):
        read_slide_text(image, **options, timeout=1)
