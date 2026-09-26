from __future__ import annotations

import math
import unicodedata


LAYOUT_NAMES = ("右圖左文", "左圖右文", "上圖下文")
DEFAULT_LAYOUT = LAYOUT_NAMES[0]


def layout_rects(name: str, *, cover: bool, has_image: bool) -> dict[str, tuple[float, float, float, float]]:
    """Shared 16:9 positions for preview, generated assets, and editable PPTX."""
    if name not in LAYOUT_NAMES:
        raise ValueError(f"未知的投影片排版：{name}")
    if not has_image:
        if cover:
            return {
                "title": (.08, .22, .84, .20),
                "body": (.08, .50, .84, .28),
                "image": (.58, .22, .36, .60),
            }
        return {
            "title": (.08, .07, .84, .12),
            "body": (.08, .24, .84, .58),
            "image": (.58, .22, .36, .60),
        }
    if name == "右圖左文":
        return {
            "title": (.07, .21, .47, .20) if cover else (.08, .07, .84, .12),
            "body": (.07, .47, .47, .28) if cover else (.08, .24, .45, .58),
            "image": (.58, .20, .36, .62) if cover else (.58, .22, .36, .60),
        }
    if name == "左圖右文":
        return {
            "title": (.52, .21, .42, .20) if cover else (.08, .07, .84, .12),
            "body": (.52, .47, .42, .28) if cover else (.54, .24, .40, .58),
            "image": (.06, .20, .40, .62) if cover else (.06, .22, .42, .60),
        }
    return {
        "title": (.08, .05, .84, .12),
        "body": (.08, .60, .84, .28),
        "image": (.08, .20, .84, .35),
    }


def suggest_slide_layout(slide: dict, index: int) -> str:
    """Give new outlines varied layouts while avoiding a shallow text region on dense pages."""
    if index == 0:
        return "右圖左文"
    body = "\n".join(
        item.get("text", "") for item in slide.get("elements", [])
        if item.get("type", "text") == "text"
    )
    if len(body) < 100 and index % 4 == 3:
        return "上圖下文"
    return "左圖右文" if index % 2 else "右圖左文"


def fit_body_font(text: str, rect: tuple[float, float, float, float], *, cover: bool) -> tuple[int, bool]:
    """Choose a conservative CJK font size for a normalized slide text region."""
    width_px = rect[2] * 1280 - 16
    height_px = rect[3] * 720 - 16
    for size in range(24 if cover else 20, 11, -1):
        half_character_px = size * 1.333 * .55
        capacity = max(1, math.floor(width_px / half_character_px))
        required_lines = 0
        for line in text.splitlines() or [text]:
            units = sum(2 if unicodedata.east_asian_width(char) in {"W", "F"} else 1 for char in line)
            required_lines += max(1, math.ceil(units / capacity))
        if required_lines * size * 1.333 * 1.35 <= height_px:
            return size, True
    return 12, False


def apply_slide_layout(slide: dict, name: str, *, cover: bool) -> None:
    """Reflow existing editable objects after the user selects a design."""
    images = [item for item in slide.get("elements", []) if item.get("type") == "image"]
    texts = [item for item in slide.get("elements", []) if item.get("type", "text") == "text"]
    rects = layout_rects(name, cover=cover, has_image=bool(images))
    bx, by, bw, bh = rects["body"]
    gap = .018 if len(texts) > 1 else 0
    text_height = (bh - gap * max(0, len(texts) - 1)) / max(1, len(texts))
    for index, item in enumerate(texts):
        item.update(x=bx, y=by + index * (text_height + gap), width=bw, height=text_height)
    ix, iy, iw, ih = rects["image"]
    image_gap = .018 if len(images) > 1 else 0
    image_height = (ih - image_gap * max(0, len(images) - 1)) / max(1, len(images))
    for index, item in enumerate(images):
        item.update(x=ix, y=iy + index * (image_height + image_gap), width=iw, height=image_height,
                    fit="crop" if name == "上圖下文" else "contain")
    slide["layout"] = name
