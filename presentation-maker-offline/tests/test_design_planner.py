from copy import deepcopy
import pytest
from presentation_maker_offline.design_planner import compile_design


def test_multiline_source_is_addressable_without_rewriting_document():
    from presentation_maker_offline.design_planner import source_blocks
    slide = dict(title='資格', elements=[dict(id='body', type='text',
                 text='• 45至74歲民眾\n\n• 每2年補助1次糞便潛血檢查')])
    before = deepcopy(slide)
    assert source_blocks(slide) == {
        'title': '資格', 'body/line/0': '• 45至74歲民眾',
        'body/line/2': '• 每2年補助1次糞便潛血檢查'}
    assert slide == before
    slide['elements'].append(deepcopy(slide['elements'][0]))
    with pytest.raises(ValueError, match='Duplicate'):
        source_blocks(slide)


@pytest.mark.parametrize('patch', [
    {'texts': None}, {'texts': ['invalid']}, {'background': None},
    {'texts': [{'source_id': []}]},
    {'texts': [{'source_id': 'title', 'rect': None}]},
    {'texts': [{'source_id': 'title', 'rect': [True,100,500,100], 'size': 40}]},
    {'visual_brief': []},
])
def test_malformed_model_schema_is_a_recoverable_validation_error(patch):
    plan = dict(background='#FFFFFF', texts=[dict(source_id='title',
                rect=[100,100,1000,150], size=60)])
    plan.update(patch)
    with pytest.raises(ValueError):
        compile_design(dict(title='原文', elements=[]), plan)


def test_model_design_rejects_a_single_cjk_character_on_last_line():
    plan = dict(background='#FFFFFF', texts=[dict(source_id='title',
                rect=[100,100,55,300], size=40)])
    with pytest.raises(ValueError, match='isolated CJK'):
        compile_design(dict(title='原文', elements=[]), plan)


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
