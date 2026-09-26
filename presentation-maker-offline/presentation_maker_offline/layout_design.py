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
    """Choose image composition from each page's content, not its position in the deck."""
    if index == 0:
        return "右圖左文"
    body = "\n".join(
        item.get("text", "") for item in slide.get("elements", [])
        if item.get("type", "text") == "text"
    )
    lines = [line.strip() for line in body.splitlines() if line.strip()]
    visual_terms = ("視覺建議", "位置圖", "示意圖", "流程圖", "圖像", "圖示")
    if len(lines) <= 3 and any(term in body for term in visual_terms):
        return "上圖下文"
    if len(lines) >= 6 or len(body) >= 180:
        return "右圖左文"
    if "→" in body or "流程" in slide.get("title", ""):
        return "上圖下文"
    return "左圖右文" if any(term in slide.get("title", "") for term in ("什麼", "哪裡", "功能", "治療")) else "右圖左文"


def content_layout_kind(slide: dict, *, cover: bool = False, has_image: bool = False) -> str:
    if cover:
        return "封面主視覺"
    body = "\n".join(item.get("text", "") for item in slide.get("elements", [])
                     if item.get("type") == "text")
    lines = [line.strip() for line in body.splitlines() if line.strip()]
    if has_image:
        return "圖文搭配"
    if sum("迷思：" in line for line in lines) >= 2 and sum("正確觀念：" in line for line in lines) >= 2:
        return "迷思對照"
    if any("→" in line for line in lines):
        return "流程步驟"
    if len(lines) >= 5:
        return "雙欄重點"
    return "重點敘述"


def auto_design_slide(slide: dict, index: int) -> str:
    """Apply a repeatable content-aware layout; manual overrides remain possible."""
    if slide.get('editorial_scene', {}).get('generated_by') == 'semantic-comparison':
        slide.pop('editorial_scene')
    name = suggest_slide_layout(slide, index)
    apply_slide_layout(slide, name, cover=index == 0)
    slide["auto_layout"] = True
    slide["content_layout"] = content_layout_kind(
        slide, cover=index == 0,
        has_image=any(item.get("type") == "image" for item in slide.get("elements", [])),
    )
    if slide['content_layout'] == '迷思對照':
        from .editorial_scene import attach_scene, comparison_scene, scene_image
        lines = [line.strip() for item in slide.get('elements', [])
                 if item.get('type', 'text') == 'text'
                 for line in item.get('text', '').splitlines() if line.strip()]
        paired = [line for line in lines if line.startswith(('迷思：', '正確觀念：'))]
        other = [line for line in lines if not line.startswith(('迷思：', '正確觀念：'))]
        if (2 <= len(paired) <= 10 and len(paired) % 2 == 0
                and all(line.startswith('迷思：' if i % 2 == 0 else '正確觀念：')
                        for i, line in enumerate(paired))):
            scene = comparison_scene(slide['title'], '\n'.join(other), list(zip(paired[::2], paired[1::2])))
            try:
                scene_image(scene)
            except ValueError:
                pass  # Longer content remains on the existing adaptive text path.
            else:
                scene['generated_by'] = 'semantic-comparison'
                attach_scene(slide, scene)
    return slide["content_layout"]


def render_text_blocks(slide: dict, *, cover: bool = False) -> list[dict]:
    """Visual blocks for preview and PPTX; source text in the document stays editable."""
    texts = [item for item in slide.get("elements", []) if item.get("type") == "text"]
    if not slide.get("auto_layout") or cover or any(item.get("type") == "image" for item in slide.get("elements", [])):
        return texts
    if len(texts) != 1:
        return texts
    text = texts[0].get("text", "")
    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        return texts
    kind = content_layout_kind(slide)
    if kind == "迷思對照":
        myths = [line for line in lines if "迷思：" in line]
        facts = [line for line in lines if "正確觀念：" in line]
        other = [line for line in lines if "迷思：" not in line and "正確觀念：" not in line]
        if len(myths) == len(facts):
            return [dict(texts[0], text="\n".join(["常見迷思", *myths, *other]),
                         x=.08, y=.24, width=.39, height=.60, card=True),
                    dict(texts[0], text="\n".join(["正確觀念", *facts]),
                         x=.53, y=.24, width=.39, height=.60, card=True)]
    if kind == "流程步驟":
        flow_index = next((index for index, line in enumerate(lines) if "→" in line), None)
        if flow_index is not None:
            flow_line = lines[flow_index]
            steps = [part.strip() for part in flow_line.split("→") if part.strip()]
            if 2 <= len(steps) <= 5:
                gap = .018
                width = (.84 - gap * (len(steps) - 1)) / len(steps)
                blocks = [dict(texts[0], text=step, x=.08 + i * (width + gap), y=.29,
                               width=width, height=.27, card=True) for i, step in enumerate(steps)]
                remaining = [line for index, line in enumerate(lines) if index != flow_index]
                if remaining:
                    blocks.append(dict(texts[0], text="\n".join(remaining), x=.08, y=.61,
                                       width=.84, height=.22))
                return blocks
    if kind == "雙欄重點":
        midpoint = math.ceil(len(lines) / 2)
        return [dict(texts[0], text="\n".join(lines[:midpoint]), x=.08, y=.24, width=.39, height=.60, card=True),
                dict(texts[0], text="\n".join(lines[midpoint:]), x=.53, y=.24, width=.39, height=.60, card=True)]
    return texts


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
    if slide.get('editorial_scene', {}).get('generated_by') == 'semantic-comparison':
        slide.pop('editorial_scene')
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
