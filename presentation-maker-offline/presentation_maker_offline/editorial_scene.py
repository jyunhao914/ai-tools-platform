"""Exact-text editorial canvas prototype, independent of image model spelling."""
from pathlib import Path
from PySide6.QtCore import QRectF, Qt
from PySide6.QtGui import QColor, QFont, QFontMetricsF, QImage, QPainter
from PySide6.QtWidgets import QApplication


def render_scene(scene: dict, output: Path, *, width=1920, height=1080):
    app = QApplication.instance() or QApplication([])
    image = QImage(width, height, QImage.Format.Format_ARGB32)
    image.fill(QColor(scene['background']))
    painter = QPainter(image)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    painter.scale(width / 1920, height / 1080)
    try:
        for item in scene['texts']:
            rect = QRectF(*item['rect'])
            if not QRectF(0, 0, 1920, 1080).contains(rect):
                raise ValueError('Text outside canvas')
            font = QFont('PingFang TC')
            font.setPixelSize(item['size'])
            font.setBold(item.get('bold', False))
            flags = Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop | Qt.TextFlag.TextWordWrap
            bounds = QFontMetricsF(font).boundingRect(rect, int(flags), item['text'])
            if bounds.height() > rect.height() or bounds.width() > rect.width():
                raise ValueError(f"Text does not fit: {item['text']}")
            painter.setFont(font)
            painter.setPen(QColor(item.get('color', '#132E37')))
            painter.drawText(rect, int(flags), item['text'])
    finally:
        painter.end()
    if output.exists():
        raise FileExistsError(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    if not image.save(str(output)):
        raise OSError('Cannot save scene')
    return output


def eligibility_scene(title: str, lines: list[str]) -> dict:
    """Preserve supplied wording; use scale and whitespace, not repeated cards."""
    if len(lines) != 3:
        raise ValueError('This composition requires exactly three statements')
    import re
    matches = [re.fullmatch(r'(\d+至\d+歲[，,]?)(.*)', line) for line in lines[:2]]
    if not all(matches):
        raise ValueError('Statements must begin with an age range')
    texts = [dict(text=title, rect=[110, 95, 1680, 115], size=66, bold=True)]
    for index, match in enumerate(matches):
        x = 110 + index * 920
        texts.extend([
            dict(text=match[1], rect=[x, 300, 790, 200], size=100, bold=True, color='#167B7B'),
            dict(text=match[2], rect=[x, 510, 760, 250], size=38),
        ])
    texts.append(dict(text=lines[2], rect=[110, 855, 1660, 115], size=58, bold=True))
    return dict(background='#FFF9EF', texts=texts)
