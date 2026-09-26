import pytest
import hashlib
from PIL import Image
from presentation_maker_offline.editorial_scene import eligibility_scene
from presentation_maker_offline.editorial_scene import checked_visual


def test_visual_requires_review_bound_to_image(tmp_path):
    path = tmp_path / 'visual.png'
    Image.new('RGB', (32, 32)).save(path)
    item = {'path': str(path)}
    with pytest.raises(ValueError, match='accepted'):
        checked_visual(item)
    item['review'] = dict(verdict='accepted', image_sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    assert checked_visual(item).width() == 32
    Image.new('RGB', (64, 32)).save(path)
    with pytest.raises(ValueError, match='changed'):
        checked_visual(item)


def test_exact_copy_survives_typographic_hierarchy():
    lines = ['45至74歲民眾', '40至44歲，父母、子女或兄弟姊妹曾罹患大腸癌者', '每2年補助1次糞便潛血檢查']
    scene = eligibility_scene('誰符合公費大腸癌篩檢？', lines)
    assert ''.join(item['text'] for item in scene['texts'][1:]) == ''.join(lines)
    with pytest.raises(ValueError):
        eligibility_scene('title', ['one'])
