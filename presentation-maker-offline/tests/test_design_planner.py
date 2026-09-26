from copy import deepcopy
import pytest
from presentation_maker_offline.design_planner import compile_design


def test_invalid_model_layout_gets_bounded_repair_without_changing_source():
    import json
    from presentation_maker_offline.design_planner import plan_slide_design
    slide = dict(title='原文', elements=[])
    before = deepcopy(slide)
    class Backend:
        def __init__(self):
            self.prompts = []
        def plan(self, prompt, **kwargs):
            self.prompts.append(prompt)
            if len(self.prompts) == 1:
                return dict(text='not JSON')
            return dict(text=json.dumps(dict(background='#FFFFFF', texts=[
                dict(source_id='title', rect=[100,100,1000,150], size=60)])))
    backend = Backend()
    assert plan_slide_design(slide, backend)['texts'][0]['text'] == '原文'
    assert len(backend.prompts) == 2 and slide == before
    class Invalid:
        def plan(self, *args, **kwargs):
            return dict(text='[]')
    with pytest.raises(ValueError, match='三次'):
        plan_slide_design(slide, Invalid())


def test_model_cannot_rewrite_or_drop_source_copy():
    slide = dict(title='標題', elements=[dict(id='body', type='text', text='45至74歲')])
    plan = dict(background='#FFF9EF', texts=[
        dict(source_id='title', rect=[100,100,1000,120], size=66),
        dict(source_id='body', rect=[100,400,1000,200], size=100, text='被改掉的內容')])
    result = compile_design(slide, plan)
    assert result['texts'][1]['text'] == '45至74歲'
    bad = deepcopy(plan)
    bad['texts'].pop()
    with pytest.raises(ValueError, match='omitted'):
        compile_design(slide, bad)
    bad = deepcopy(plan)
    bad['texts'][1]['rect'][0] = 1900
    with pytest.raises(ValueError, match='outside'):
        compile_design(slide, bad)
    bad = deepcopy(plan)
    bad['texts'][1]['rect'] = [100,100,1000,200]
    with pytest.raises(ValueError, match='overlap'):
        compile_design(slide, bad)
    bad = deepcopy(plan)
    bad['texts'][1]['rect'] = [100,400,50,40]
    with pytest.raises(ValueError, match='fit'):
        compile_design(slide, bad)
    bad = deepcopy(plan)
    bad['visual_brief'] = 'An illustration'
    with pytest.raises(ValueError, match='reserved'):
        compile_design(slide, bad)
    bad['visual_rect'] = [100,100,500,500]
    with pytest.raises(ValueError, match='overlaps'):
        compile_design(slide, bad)
