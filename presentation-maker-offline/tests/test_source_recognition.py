import hashlib
import pytest
from presentation_maker_offline import source_recognition as recognition


def test_candidate_acceptance_preserves_original(monkeypatch, tmp_path):
    folder = tmp_path / 'sources'
    folder.mkdir()
    (folder / 'image.png').write_bytes(b'image')
    source = dict(id='s', version=1, format='png', managed_path='image.png',
                  content_sha256=hashlib.sha256(b'image').hexdigest(), fragments=[])
    monkeypatch.setattr(recognition, 'read_slide_text', lambda *a, **k:
                        dict(text='辨識文字', engine='qwen-vl-local', model='local', coordinates=None))
    candidate = recognition.recognize_image_source(source, tmp_path, python='python', model='model')
    assert source['fragments'] == []
    updated = recognition.accept_recognition(source, candidate)
    assert updated['version'] == 2 and source['version'] == 1
    assert updated['fragments'][0]['text'] == '辨識文字'
    assert updated['recognition_history'][0]['previous_fragments'] == []
    with pytest.raises(ValueError):
        recognition.accept_recognition(updated, candidate)
    (folder / 'image.png').write_bytes(b'changed')
    with pytest.raises(ValueError):
        recognition.recognize_image_source(source, tmp_path, python='python', model='model')


def test_path_escape_rejected(tmp_path):
    source = dict(format='png', managed_path='../outside.png')
    with pytest.raises(ValueError, match='超出'):
        recognition.recognize_image_source(source, tmp_path, python='python', model='model')
