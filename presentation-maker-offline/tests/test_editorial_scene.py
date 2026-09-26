import pytest
from presentation_maker_offline.editorial_scene import eligibility_scene


def test_exact_copy_survives_typographic_hierarchy():
    lines = ['45至74歲民眾', '40至44歲，父母、子女或兄弟姊妹曾罹患大腸癌者', '每2年補助1次糞便潛血檢查']
    scene = eligibility_scene('誰符合公費大腸癌篩檢？', lines)
    assert ''.join(item['text'] for item in scene['texts'][1:]) == ''.join(lines)
    with pytest.raises(ValueError):
        eligibility_scene('title', ['one'])
