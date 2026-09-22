from pathlib import Path
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.util import Inches, Pt

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
