from presentation_maker_offline.content_fidelity import compare_copy


def test_missing_recognition_is_not_success():
    assert compare_copy('原文', None)['status'] == 'unverified'
    assert compare_copy('', '')['status'] == 'needs_review'


def test_layout_whitespace_is_ignored_but_punctuation_is_not():
    assert compare_copy('早期發現、早期治療', '早期發現、\n早期治療')['status'] == 'text_match'
    result = compare_copy('早期發現、早期治療', '早期發現・早期治療')
    assert result['status'] == 'needs_review'
    assert not result['automatic_approval']


def test_policy_digits_cannot_be_silently_changed():
    result = compare_copy('45至74歲，每2年1次', '45至75歲，每2年1次，另補助300元')
    assert result['missing_numbers'] == ['74']
    assert result['extra_numbers'] == ['75', '300']


def test_duplicate_numbers_and_extra_words_are_detected():
    result = compare_copy('第1組', '第1組第1組額外內容')
    assert result['extra_numbers'] == ['1']
    assert result['changes']
    assert not compare_copy('正確', '正確')['automatic_approval']
