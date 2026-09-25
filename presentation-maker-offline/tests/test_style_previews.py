from presentation_maker_offline.ui import STYLE_PALETTES


def test_style_preview_palette_set_is_complete_and_distinct():
    assert list(STYLE_PALETTES) == ["清爽藍", "雜誌編輯", "自然療癒", "高科技"]
    assert all(set(palette) == {"paper", "accent", "text", "rule"} for palette in STYLE_PALETTES.values())
    assert len({palette["accent"] for palette in STYLE_PALETTES.values()}) == 4
    assert STYLE_PALETTES["高科技"]["paper"] == "#111827"
