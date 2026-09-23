from pptx import Presentation

from presentation_maker_offline.export import export_project_pptx
from presentation_maker_offline.project_document import new_project_document


def test_export_project_creates_editable_text_and_keeps_coordinates(tmp_path):
    document = new_project_document("季度報告")
    document["slides"] = [{
        "id": "slide-1", "order": 0, "title": "營運摘要",
        "elements": [{"id": "text-1", "type": "text", "text": "營收成長 12%", "x": .2, "y": .3, "width": .5, "height": .2}],
    }]
    output = tmp_path / "editable.pptx"
    export_project_pptx(output, document)

    imported = Presentation(output)
    assert len(imported.slides) == 1
    texts = [shape.text for shape in imported.slides[0].shapes if getattr(shape, "has_text_frame", False)]
    assert "營運摘要" in texts
    assert "營收成長 12%" in texts
    body = next(shape for shape in imported.slides[0].shapes if getattr(shape, "has_text_frame", False) and shape.text == "營收成長 12%")
    assert .19 < body.left / imported.slide_width < .21
    assert .49 < body.width / imported.slide_width < .51
