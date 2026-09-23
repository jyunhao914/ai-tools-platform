from pathlib import Path
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.util import Inches, Pt
from .project_document import validate_project_document

def export_demo_pptx(path: str | Path, title: str, outline: list[str], style: str = "清爽藍") -> Path:
    out = Path(path); out.parent.mkdir(parents=True, exist_ok=True)
    prs = Presentation(); prs.slide_width = Inches(13.333); prs.slide_height = Inches(7.5)
    for index, heading in enumerate([title, *outline]):
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        bg = slide.background.fill; bg.solid(); bg.fore_color.rgb = RGBColor(245, 248, 252)
        box = slide.shapes.add_textbox(Inches(0.9), Inches(1.1), Inches(11.5), Inches(1.2))
        tf = box.text_frame; tf.text = heading; tf.paragraphs[0].font.size = Pt(34 if index == 0 else 28); tf.paragraphs[0].font.bold = True
        sub = slide.shapes.add_textbox(Inches(0.95), Inches(6.65), Inches(11), Inches(.35))
        sub.text_frame.text = f"{style}  ·  離線簡報製作器  ·  {index + 1}/{len(outline)+1}"
        sub.text_frame.paragraphs[0].font.size = Pt(11)
    prs.save(out); return out


def export_project_pptx(path: str | Path, document: dict, style: str = "清爽藍") -> Path:
    """Export project text as native editable PowerPoint objects."""
    validate_project_document(document)
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    presentation = Presentation()
    presentation.slide_width = Inches(13.333)
    presentation.slide_height = Inches(7.5)
    accent = RGBColor(37, 87, 166) if style == "清爽藍" else RGBColor(47, 75, 93)
    for slide_doc in document["slides"]:
        slide = presentation.slides.add_slide(presentation.slide_layouts[6])
        slide.background.fill.solid()
        slide.background.fill.fore_color.rgb = RGBColor(250, 251, 253)
        title_box = slide.shapes.add_textbox(Inches(.7), Inches(.45), Inches(11.9), Inches(.9))
        title_box.text_frame.text = slide_doc.get("title", "")
        if title_box.text_frame.paragraphs[0].runs:
            title_run = title_box.text_frame.paragraphs[0].runs[0]
            title_run.font.size = Pt(30)
            title_run.font.bold = True
            title_run.font.color.rgb = accent
        for element in slide_doc.get("elements", []):
            if element.get("type", "text") != "text":
                continue
            x = max(0, min(.98, float(element.get("x", .08))))
            y = max(0, min(.95, float(element.get("y", .24))))
            width = max(.02, min(1-x, float(element.get("width", .84))))
            height = max(.02, min(1-y, float(element.get("height", .58))))
            box = slide.shapes.add_textbox(
                Inches(x * 13.333), Inches(y * 7.5), Inches(width * 13.333), Inches(height * 7.5),
            )
            box.text_frame.text = element.get("text", "")
            for paragraph in box.text_frame.paragraphs:
                for run in paragraph.runs:
                    run.font.size = Pt(20)
        footer = slide.shapes.add_textbox(Inches(.7), Inches(7.02), Inches(11.9), Inches(.25))
        footer.text_frame.text = f"{style} · {slide_doc.get('order', 0) + 1}/{len(document['slides'])}"
        footer.text_frame.paragraphs[0].runs[0].font.size = Pt(9)
    presentation.save(out)
    return out
