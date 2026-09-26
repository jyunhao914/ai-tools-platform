from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
import threading
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

from PySide6.QtCore import QThread, QTimer, Qt, Signal, QPointF, QRectF, QSize
from PySide6.QtGui import QAction, QBrush, QColor, QFont, QIcon, QImage, QKeySequence, QPainter, QPen, QPixmap
from PySide6.QtWidgets import (
    QApplication, QComboBox, QDialog, QDialogButtonBox, QFileDialog, QFrame,
    QGraphicsScene, QGraphicsView, QHBoxLayout, QLabel, QLineEdit, QListWidget,
    QMainWindow, QMessageBox, QPushButton, QPlainTextEdit, QSplitter, QStackedWidget,
    QTabWidget, QVBoxLayout, QWidget,
)

from .backends import LocalQwenImageBackend, LocalQwenTextBackend
from .export import THEMES, export_project_pptx
from .edit_candidates import accept_text_candidate, reject_candidate, stage_text_candidate
from .layout_design import DEFAULT_LAYOUT, LAYOUT_NAMES, apply_slide_layout, auto_design_slide, fit_body_font, layout_rects, render_text_blocks
from .manifest import CheckpointManifest
from .project_document import new_project_document, update_slide_text_element
from .revision_compare import compare_documents
from .source_import import import_source, parse_outline_text
from .source_library import SOURCE_ROLES, add_file_source, add_text_source, append_fragment_to_slide, source_preview
from .source_recognition import recognize_image_source, accept_recognition
from .vision_backend import discover_vision_python
from .storage import discover_qwen38_mlx, qwen_image21_readiness
from .workflow import ProjectStore


APP_STYLE = """
QMainWindow, QWidget { background: #f5f7fa; color: #172033; font-family: -apple-system, sans-serif; }
QLabel#title { font-size: 28px; font-weight: 700; }
QLabel#subtitle { color: #64748b; font-size: 14px; }
QFrame#card { background: white; border: 1px solid #dbe2ea; border-radius: 12px; }
QPushButton { background: #fff; border: 1px solid #cbd5e1; border-radius: 7px; padding: 9px 14px; }
QPushButton:hover { background: #eef4ff; border-color: #7aa2e8; }
QPushButton#primary { color: white; background: #2459a6; border-color: #2459a6; font-weight: 600; }
QPushButton#primary:disabled { background: #aab7c9; border-color: #aab7c9; }
QLineEdit, QPlainTextEdit, QComboBox, QListWidget { background: white; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px; }
QListWidget::item { padding: 7px; }
"""


def _design_icon(layout_name: str, theme_name: str = "清爽藍") -> QIcon:
    theme = THEMES.get(theme_name, THEMES["清爽藍"])
    rects = layout_rects(layout_name, cover=False, has_image=True)
    pixmap = QPixmap(96, 54)
    pixmap.fill(QColor("#" + theme["paper"]))
    painter = QPainter(pixmap)
    try:
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QColor("#" + theme["accent"]))
        tx, ty, tw, th = rects["title"]
        painter.drawRoundedRect(QRectF(tx * 96, ty * 54, tw * 96, max(3, th * 54 * .45)), 2, 2)
        bx, by, bw, bh = rects["body"]
        painter.setBrush(QColor("#" + theme["text"]))
        for line in range(4):
            painter.drawRoundedRect(QRectF(bx * 96, (by + line * bh / 6) * 54,
                                           bw * 96 * (.85 if line == 3 else 1), 2), 1, 1)
        ix, iy, iw, ih = rects["image"]
        painter.setBrush(QColor("#" + theme["rule"]))
        painter.drawRoundedRect(QRectF(ix * 96, iy * 54, iw * 96, ih * 54), 3, 3)
    finally:
        painter.end()
    return QIcon(pixmap)


class SourceRecognitionWorker(QThread):
    completed = Signal(object)
    failed = Signal(str)

    def __init__(self, source, root, python, model, parent=None):
        super().__init__(parent)
        self.source, self.root = deepcopy(source), root
        self.python, self.model = python, model

    def cancel(self):
        # Suppress late UI updates; the bounded child process may finish first.
        self.requestInterruption()

    def run(self):
        try:
            result = recognize_image_source(self.source, self.root, python=self.python, model=self.model)
            if not self.isInterruptionRequested():
                self.completed.emit(result)
        except Exception as exc:
            if not self.isInterruptionRequested():
                self.failed.emit(str(exc))


class TextPlanningWorker(QThread):
    completed = Signal(object)
    failed = Signal(str)

    def __init__(self, prompt: str, model_path: Path):
        super().__init__()
        self.prompt = prompt
        self.model_path = model_path
        self.backend: LocalQwenTextBackend | None = None
        self._cancel_requested = threading.Event()

    def cancel(self) -> None:
        self._cancel_requested.set()
        if self.backend:
            self.backend.cancel()

    def run(self) -> None:
        try:
            self.backend = LocalQwenTextBackend(CheckpointManifest(
                "Qwen3.8-27B local", str(self.model_path), "0" * 64,
                "local model directory", "local", "see checkpoint license", "mlx", format="mlx",
            ))
            if self._cancel_requested.is_set():
                return
            result = self.backend.plan(self.prompt)
            title, slides, source = parse_outline_text(result["text"])
            source.update({"display_name": "本機 AI 大綱候選稿", "origin": "model_generated_outline", "runtime": result.get("runtime")})
            self.completed.emit({"title": title, "slides": slides, "source": source, "runtime": result.get("runtime")})
        except InterruptedError:
            return
        except Exception as exc:
            self.failed.emit(str(exc))


class TextEditWorker(QThread):
    completed = Signal(object)
    failed = Signal(str)

    def __init__(self, prompt: str, model_path: Path, target: dict):
        super().__init__()
        self.prompt, self.model_path, self.target = prompt, model_path, target
        self.backend: LocalQwenTextBackend | None = None

    def cancel(self) -> None:
        if self.backend:
            self.backend.cancel()

    def run(self) -> None:
        try:
            self.backend = LocalQwenTextBackend(CheckpointManifest(
                "Qwen3.8-27B local", str(self.model_path), "0" * 64,
                "local model directory", "local", "see checkpoint license", "mlx", format="mlx",
            ))
            result = self.backend.plan(self.prompt, system_prompt=(
                "你是繁體中文簡報編輯。只回傳修改後的單一文字物件內容，保留原有事實與數字。"
                "不要輸出投影片大綱、前言、Markdown 標題或解釋。"
            ))
            proposed = result.get("text", "").strip()
            if not proposed:
                raise ValueError("本機模型沒有產生可檢視的候選文字")
            self.completed.emit({**self.target, "proposed_text": proposed, "runtime": result.get("runtime")})
        except InterruptedError:
            return
        except Exception as exc:
            self.failed.emit(str(exc))


class ImageGenerationWorker(QThread):
    progress = Signal(int, int, str)
    image_ready = Signal(str, str, str)
    failed = Signal(str, str)
    cancelled = Signal()

    def __init__(self, model_path: Path, slides: list[dict], *, steps: int = 20):
        super().__init__()
        self.model_path = model_path
        self.slides = slides
        self.steps = steps
        self.cancel_event = threading.Event()
        self.backend: LocalQwenImageBackend | None = None
        self.dispatch_token = str(uuid4())

    def cancel(self) -> None:
        self.cancel_event.set()

    def run(self) -> None:
        try:
            self.backend = LocalQwenImageBackend(CheckpointManifest(
                "Qwen-Image-2.1 local", str(self.model_path), "0" * 64,
                "local model directory", "2.1", "see checkpoint license", "diffusers",
            ), num_inference_steps=self.steps, width=768, height=512)
            health = self.backend.health()
            if not health["ok"]:
                raise RuntimeError("本機圖片引擎未通過檢查：" + "; ".join(health["errors"]))
            for index, slide in enumerate(self.slides, 1):
                if self.cancel_event.is_set():
                    self.cancelled.emit()
                    return
                self.backend.width, self.backend.height = slide["image_size"]
                label = f"第 {index}/{len(self.slides)} 頁｜{slide['title']}"
                self.progress.emit(index, len(self.slides), label + "：載入／生成中")
                result = self.backend.generate(
                    slide["prompt"], cancel_event=self.cancel_event,
                    progress_callback=lambda step, total, i=index, n=len(self.slides), title=slide["title"]:
                        self.progress.emit(i, n, f"第 {i}/{n} 頁｜{title}：{step}/{total} 步"),
                )
                self.image_ready.emit(slide["id"], result["image_path"], slide["prompt"])
            self.progress.emit(len(self.slides), len(self.slides), "所有配圖已生成，正在保存專案…")
        except InterruptedError:
            self.cancelled.emit()
        except Exception as exc:
            self.failed.emit(slide.get("id", "") if "slide" in locals() else "", str(exc))


class SlidePreview(QGraphicsView):
    """16:9 live slide canvas matching the visual hierarchy of PPTX export."""

    area_selected = Signal(object)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.scene = QGraphicsScene(self)
        self.scene.setSceneRect(0, 0, 1280, 720)
        self.setScene(self.scene)
        self.setRenderHint(QPainter.RenderHint.Antialiasing)
        self.setBackgroundBrush(QColor("#e7ebf0"))
        self.setFrameShape(QFrame.Shape.NoFrame)
        self._slide = None
        self._images: list[dict] = []
        self._annotations: list[dict] = []
        self._mark_mode = False
        self._mark_start: QPointF | None = None
        self._mark_item = None

    def set_slide(self, title: str, body: str, number: int, total: int, theme_name: str, *, cover: bool = False,
                  images: list[dict] | None = None, annotations: list[dict] | None = None,
                  layout_name: str = DEFAULT_LAYOUT, text_blocks: list[dict] | None = None):
        self._slide = (title, body, number, total, theme_name, cover, layout_name)
        self._images = images or []
        self._annotations = annotations or []
        self._text_blocks = text_blocks
        self._draw_slide()

    def set_mark_mode(self, enabled: bool) -> None:
        self._mark_mode = enabled
        self._mark_start = None
        self._mark_item = None
        self.setCursor(Qt.CursorShape.CrossCursor if enabled else Qt.CursorShape.ArrowCursor)

    def _draw_slide(self):
        if not self._slide:
            return
        title, body, number, total, theme_name, cover, layout_name = self._slide
        theme = THEMES.get(theme_name, THEMES["清爽藍"])
        positions = layout_rects(layout_name, cover=cover, has_image=bool(self._images))
        self.scene.clear()
        self.scene.addRect(0, 0, 1280, 720, QPen(Qt.PenStyle.NoPen), QBrush(QColor("#" + theme["paper"])))
        self.scene.addRect(0, 0, 12, 720, QPen(Qt.PenStyle.NoPen), QBrush(QColor("#" + theme["accent"])))
        title_item = self.scene.addText(title, QFont("Arial", 43 if cover else 31, QFont.Weight.Bold))
        title_item.setDefaultTextColor(QColor("#" + theme["accent"]))
        tx, ty, tw, _th = positions["title"]
        title_item.setTextWidth(tw * 1280)
        title_item.setPos(tx * 1280, ty * 720)
        if not cover:
            self.scene.addRect(80, 126, 1120, 3, QPen(Qt.PenStyle.NoPen), QBrush(QColor("#" + theme["rule"])))
        blocks = self._text_blocks if self._text_blocks is not None else [dict(
            text=body, x=positions["body"][0], y=positions["body"][1],
            width=positions["body"][2], height=positions["body"][3])]
        for block in blocks:
            rect = tuple(float(block.get(key, default)) for key, default in
                         (("x", .08), ("y", .24), ("width", .84), ("height", .58)))
            if block.get("card"):
                self.scene.addRect(QRectF(rect[0] * 1280, rect[1] * 720,
                                         rect[2] * 1280, rect[3] * 720),
                                   QPen(QColor("#" + theme["rule"]), 2),
                                   QBrush(QColor("#" + theme["rule"])))
                rect = (rect[0] + .018, rect[1] + .024, rect[2] - .036, rect[3] - .048)
            body_font, _fits = fit_body_font(block.get("text", ""), rect, cover=cover)
            content = self.scene.addText(block.get("text", ""), QFont("Arial", body_font))
            content.setDefaultTextColor(QColor("#" + theme["text"]))
            content.setTextWidth(rect[2] * 1280)
            content.setPos(rect[0] * 1280, rect[1] * 720)
        for image in self._images:
            pixmap = QPixmap(image["path"])
            if pixmap.isNull():
                continue
            x, y, width, height = image["rect"]
            target_width, target_height = max(1, round(width * 1280)), max(1, round(height * 720))
            if image.get("fit") == "crop":
                expanded = pixmap.scaled(target_width, target_height,
                                         Qt.AspectRatioMode.KeepAspectRatioByExpanding,
                                         Qt.TransformationMode.SmoothTransformation)
                fitted = expanded.copy((expanded.width() - target_width) // 2,
                                       (expanded.height() - target_height) // 2,
                                       target_width, target_height)
                self.scene.addPixmap(fitted).setPos(x * 1280, y * 720)
            else:
                fitted = pixmap.scaled(target_width, target_height,
                                      Qt.AspectRatioMode.KeepAspectRatio,
                                      Qt.TransformationMode.SmoothTransformation)
                self.scene.addPixmap(fitted).setPos(x * 1280 + (width * 1280 - fitted.width()) / 2,
                                                    y * 720 + (height * 720 - fitted.height()) / 2)
        for mark_number, mark in enumerate(self._annotations, 1):
            x1, y1, x2, y2 = mark["rect"]
            rect = QRectF(min(x1, x2) * 1280, min(y1, y2) * 720,
                          abs(x2 - x1) * 1280, abs(y2 - y1) * 720)
            self.scene.addRect(rect, QPen(QColor("#e05252"), 3), QBrush(Qt.BrushStyle.NoBrush))
            label = self.scene.addText(str(mark_number), QFont("Arial", 15, QFont.Weight.Bold))
            label.setDefaultTextColor(QColor("#ffffff"))
            label.setPos(rect.topLeft() + QPointF(8, 6))
        footer = self.scene.addText(f"{theme_name}　·　{number:02d} / {total:02d}", QFont("Arial", 12))
        footer.setDefaultTextColor(QColor("#" + theme["muted"]))
        footer.setPos(930, 670)
        self.fitInView(self.scene.sceneRect(), Qt.AspectRatioMode.KeepAspectRatio)

    def save_slide_image(self, path: str | Path) -> None:
        image = QImage(1920, 1080, QImage.Format.Format_ARGB32_Premultiplied)
        image.fill(Qt.GlobalColor.white)
        painter = QPainter(image)
        try:
            painter.setRenderHint(QPainter.RenderHint.Antialiasing)
            painter.setRenderHint(QPainter.RenderHint.TextAntialiasing)
            self.scene.render(painter, QRectF(0, 0, 1920, 1080), self.scene.sceneRect())
        finally:
            painter.end()
        if not image.save(str(path), "PNG"):
            raise OSError(f"投影片圖片未能寫入：{path}")

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.fitInView(self.scene.sceneRect(), Qt.AspectRatioMode.KeepAspectRatio)

    def mousePressEvent(self, event):
        if self._mark_mode and event.button() == Qt.MouseButton.LeftButton:
            point = self.mapToScene(event.position().toPoint())
            bounds = self.scene.sceneRect()
            self._mark_start = QPointF(min(max(point.x(), 0), bounds.width()), min(max(point.y(), 0), bounds.height()))
            self._mark_item = self.scene.addRect(QRectF(self._mark_start, self._mark_start), QPen(QColor("#e05252"), 3, Qt.PenStyle.DashLine))
            event.accept()
            return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self._mark_start is not None and self._mark_item is not None:
            point = self.mapToScene(event.position().toPoint())
            bounds = self.scene.sceneRect()
            point = QPointF(min(max(point.x(), 0), bounds.width()), min(max(point.y(), 0), bounds.height()))
            self._mark_item.setRect(QRectF(self._mark_start, point).normalized())
            event.accept()
            return
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        if self._mark_start is not None and self._mark_item is not None:
            point = self.mapToScene(event.position().toPoint())
            bounds = self.scene.sceneRect()
            point = QPointF(min(max(point.x(), 0), bounds.width()), min(max(point.y(), 0), bounds.height()))
            rect = QRectF(self._mark_start, point).normalized()
            if rect.width() >= 18 and rect.height() >= 18:
                self.area_selected.emit((rect.left() / bounds.width(), rect.top() / bounds.height(),
                                         rect.right() / bounds.width(), rect.bottom() / bounds.height()))
            else:
                self.scene.removeItem(self._mark_item)
            self._mark_start = None
            self._mark_item = None
            self.set_mark_mode(False)
            event.accept()
            return
        super().mouseReleaseEvent(event)


def slide_preview_payload(document: dict, index: int, asset_root: str | Path, *,
                          include_annotations: bool = False, strict_assets: bool = False) -> dict:
    slide = document["slides"][index]
    root = Path(asset_root).resolve()
    images = []
    for element in slide.get("elements", []):
        if element.get("type") != "image":
            continue
        relative_path = element.get("asset_path")
        if not relative_path:
            if strict_assets:
                raise FileNotFoundError(f"第 {index + 1} 頁有圖片物件但沒有素材路徑")
            continue
        image_path = (root / relative_path).resolve()
        if root not in image_path.parents:
            raise ValueError("圖片素材必須位於此專案的 assets 資料夾內")
        if not image_path.is_file():
            if strict_assets:
                raise FileNotFoundError(f"找不到第 {index + 1} 頁圖片素材：{relative_path}")
            continue
        images.append({
            "path": str(image_path),
            "fit": element.get("fit", "contain"),
            "rect": tuple(float(element.get(key, default)) for key, default in
                          (("x", .58), ("y", .22), ("width", .36), ("height", .60))),
        })
    body = "\n".join(
        element.get("text", "") for element in slide.get("elements", [])
        if element.get("type", "text") == "text"
    )
    return {
        "title": slide.get("title", ""), "body": body,
        "number": index + 1, "total": len(document["slides"]),
        "theme_name": document.get("settings", {}).get("style", "清爽藍"),
        "cover": index == 0, "images": images,
        "layout_name": slide.get("layout", DEFAULT_LAYOUT),
        "text_blocks": render_text_blocks(slide, cover=index == 0),
        "annotations": ([mark for mark in document.get("annotations", [])
                         if mark.get("slide_id") == slide["id"]] if include_annotations else []),
    }


class PresentationStudio(QMainWindow):
    """Task-oriented Qt workflow: paste, confirm, edit, then export."""

    def __init__(self, app_support: Path | None = None):
        super().__init__()
        self.setWindowTitle("離線簡報工作室")
        self.resize(1180, 780)
        self.setMinimumSize(900, 620)
        self.app_support = app_support or Path.home() / "Library" / "Application Support" / "PresentationMaker"
        self.app_support.mkdir(parents=True, exist_ok=True)
        self.store = ProjectStore(self.app_support / "projects.sqlite3")
        self.project_id: str | None = None
        self.revision = 0
        self.document: dict | None = None
        self.parsed: dict | None = None
        self.original_outline_source: dict | None = None
        self.model_outline_source: dict | None = None
        self._adopting_ai_candidate = False
        self._plan_worker: TextPlanningWorker | None = None
        self._edit_worker: TextEditWorker | None = None
        self._edit_annotation_id: str | None = None
        self._image_worker: ImageGenerationWorker | None = None
        self._image_dialog: QDialog | None = None
        self._image_cancel_button: QPushButton | None = None
        self._pending_annotation: tuple[float, float, float, float] | None = None
        self._selected_annotation_id: str | None = None
        self.image_model_path = Path.home() / ".cache/lm-studio/models/Qwen/Qwen-Image-2.1"
        self._text_element_id: str | None = None
        self._autosave_timer = QTimer(self)
        self._autosave_timer.setSingleShot(True)
        self._autosave_timer.setInterval(700)
        self._autosave_timer.timeout.connect(self.save_project)

        self.stack = QStackedWidget()
        self.setCentralWidget(self.stack)
        self.home_page = self._build_home()
        self.outline_page = self._build_outline()
        self.settings_page = self._build_settings()
        self.editor_page = self._build_editor()
        for page in (self.home_page, self.outline_page, self.settings_page, self.editor_page):
            self.stack.addWidget(page)
        self.stack.setCurrentWidget(self.home_page)
        self._refresh_recent()
        self.setStyleSheet(APP_STYLE)
        save_action = QAction(self)
        save_action.setShortcut(QKeySequence.StandardKey.Save)
        save_action.triggered.connect(self.save_project)
        self.addAction(save_action)

    @staticmethod
    def _page(*, title: str = "", subtitle: str = "") -> tuple[QWidget, QVBoxLayout]:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(36, 26, 36, 24)
        layout.setSpacing(14)
        if title:
            heading = QLabel(title)
            heading.setObjectName("title")
            layout.addWidget(heading)
        if subtitle:
            description = QLabel(subtitle)
            description.setObjectName("subtitle")
            description.setWordWrap(True)
            layout.addWidget(description)
        return page, layout

    @staticmethod
    def _button(label: str, *, primary: bool = False) -> QPushButton:
        button = QPushButton(label)
        if primary:
            button.setObjectName("primary")
        return button

    def _build_home(self) -> QWidget:
        page, layout = self._page(
            title="你的簡報，從這裡開始",
            subtitle="貼上大綱或開啟已有專案。每一步都會先預覽、再確認；內容只保存在這台 Mac。",
        )
        actions = QHBoxLayout()
        new_button = self._button("貼上簡報大綱", primary=True)
        import_button = self._button("匯入 PowerPoint／文件…")
        new_button.clicked.connect(self._start_outline)
        import_button.clicked.connect(self._import_source)
        actions.addWidget(new_button)
        actions.addWidget(import_button)
        actions.addStretch(1)
        layout.addLayout(actions)
        card = QFrame()
        card.setObjectName("card")
        card_layout = QVBoxLayout(card)
        card_layout.addWidget(QLabel("最近的專案"))
        self.recent_list = QListWidget()
        self.recent_list.itemClicked.connect(self._open_recent)
        card_layout.addWidget(self.recent_list)
        layout.addWidget(card, 1)
        layout.addWidget(QLabel("小提示：在大綱頁直接按 ⌘V 貼上；也可用右鍵選單。"))
        return page

    def _build_outline(self) -> QWidget:
        page, layout = self._page(
            title="第 1 步｜貼上並確認大綱",
            subtitle="支援 Markdown 標題、編號頁面與一般文字。頁數與標題會即時預覽；原文不會在確認前被改動。",
        )
        top = QHBoxLayout()
        self.deck_title = QLineEdit()
        self.deck_title.setPlaceholderText("簡報名稱（可留白，會從大綱辨識）")
        paste_button = self._button("從剪貼簿貼上")
        paste_button.clicked.connect(self._paste_clipboard)
        self.ai_outline_button = self._button("AI 協助整理／擴寫…")
        self.ai_outline_button.clicked.connect(self._generate_outline_candidate)
        top.addWidget(self.deck_title, 1)
        top.addWidget(paste_button)
        top.addWidget(self.ai_outline_button)
        layout.addLayout(top)
        self.outline_input = QPlainTextEdit()
        self.outline_input.setPlaceholderText("把完整大綱貼在這裡…\n\n例如：\n# 簡報名稱\n## 第一頁標題\n- 重點一\n## 第二頁標題\n- 重點二")
        self.outline_input.setTabChangesFocus(False)
        self.outline_input.textChanged.connect(self._parse_outline)
        layout.addWidget(self.outline_input, 3)
        preview_row = QHBoxLayout()
        preview_column = QVBoxLayout()
        preview_column.addWidget(QLabel("頁面預覽"))
        self.slide_preview = QListWidget()
        preview_column.addWidget(self.slide_preview)
        preview_row.addLayout(preview_column, 2)
        self.parse_status = QLabel("貼上或輸入大綱後，這裡會顯示辨識結果。")
        self.parse_status.setWordWrap(True)
        self.parse_status.setAlignment(Qt.AlignmentFlag.AlignTop)
        preview_row.addWidget(self.parse_status, 1)
        layout.addLayout(preview_row, 2)
        footer = QHBoxLayout()
        back = self._button("返回首頁")
        self.continue_button = self._button("下一步：設定簡報", primary=True)
        self.continue_button.setEnabled(False)
        back.clicked.connect(lambda: self.stack.setCurrentWidget(self.home_page))
        self.continue_button.clicked.connect(self._continue_settings)
        footer.addWidget(back)
        footer.addStretch(1)
        footer.addWidget(self.continue_button)
        layout.addLayout(footer)
        return page

    def _build_settings(self) -> QWidget:
        page, layout = self._page(
            title="第 2 步｜確認製作設定",
            subtitle="先保留原文與頁數。風格、名稱及輸出形式之後仍可修改。",
        )
        self.settings_summary = QLabel()
        self.settings_summary.setWordWrap(True)
        self.settings_summary.setObjectName("subtitle")
        layout.addWidget(self.settings_summary)
        card = QFrame()
        card.setObjectName("card")
        form = QVBoxLayout(card)
        form.addWidget(QLabel("簡報名稱"))
        self.settings_title = QLineEdit()
        form.addWidget(self.settings_title)
        form.addWidget(QLabel("視覺風格"))
        self.style_choice = QComboBox()
        self.style_choice.setIconSize(QSize(96, 54))
        for style in THEMES:
            self.style_choice.addItem(_design_icon(DEFAULT_LAYOUT, style), style)
        form.addWidget(self.style_choice)
        form.addWidget(QLabel("PowerPoint 輸出形式"))
        self.settings_output_mode = QComboBox()
        self.settings_output_mode.addItems(["可編輯式 PPTX", "圖像式 PPTX"])
        form.addWidget(self.settings_output_mode)
        self.settings_output_description = QLabel()
        self.settings_output_description.setWordWrap(True)
        def describe_output(mode):
            self.settings_output_description.setText(
                "每頁輸出為一張完整圖片，保留設計外觀。仍可回到本軟體修改專案內容再匯出。"
                if mode == "圖像式 PPTX" else
                "文字與圖片分開輸出，可在 PowerPoint 修改文字、移動及替換圖片。圖片內的細節仍屬圖片。"
            )
        self.settings_output_mode.currentTextChanged.connect(describe_output)
        describe_output(self.settings_output_mode.currentText())
        form.addWidget(self.settings_output_description)
        form.addWidget(QLabel("內容原則：忠實保留貼入內容；生成圖片會另外保存，可在編輯器中決定是否配圖。"))
        layout.addWidget(card)
        layout.addStretch(1)
        footer = QHBoxLayout()
        back = self._button("返回修改大綱")
        create = self._button("建立專案並開始編輯", primary=True)
        back.clicked.connect(lambda: self.stack.setCurrentWidget(self.outline_page))
        create.clicked.connect(self._create_project)
        footer.addWidget(back)
        footer.addStretch(1)
        footer.addWidget(create)
        layout.addLayout(footer)
        return page

    def _build_editor(self) -> QWidget:
        page, layout = self._page(title="第 3 步｜編輯與匯出")
        header = QHBoxLayout()
        home = self._button("首頁")
        home.clicked.connect(self._return_home)
        self.editor_title = QLineEdit()
        self.editor_title.setPlaceholderText("簡報名稱")
        self.editor_title.textChanged.connect(self._schedule_save)
        self.save_button = self._button("保存")
        self.history_button = self._button("版本比較／還原…")
        self.history_button.clicked.connect(self.show_revision_history)
        self.export_button = self._button("匯出 PowerPoint…", primary=True)
        self.output_mode_choice = QComboBox()
        self.output_mode_choice.addItems(["可編輯式 PPTX", "圖像式 PPTX"])
        self.output_mode_choice.setToolTip("可編輯式保留文字物件；圖像式把每頁畫布輸出為整張圖片。")
        self.output_mode_choice.currentTextChanged.connect(self._output_mode_changed)
        self.generate_all_images_button = self._button("為尚無圖片的頁面配圖")
        self.generate_all_images_button.clicked.connect(self.generate_missing_slide_images)
        self.save_button.clicked.connect(self.save_project)
        self.export_button.clicked.connect(self.export_project)
        header.addWidget(home)
        header.addWidget(self.editor_title, 1)
        header.addWidget(self.generate_all_images_button)
        header.addWidget(self.save_button)
        header.addWidget(self.history_button)
        header.addWidget(self.output_mode_choice)
        header.addWidget(self.export_button)
        layout.addLayout(header)
        columns = QSplitter(Qt.Orientation.Horizontal)
        columns.setChildrenCollapsible(False)
        self.slide_list = QListWidget()
        self.slide_list.currentRowChanged.connect(self._select_slide)
        columns.addWidget(self.slide_list)
        center = QWidget()
        center_layout = QVBoxLayout(center)
        center_layout.setContentsMargins(0, 0, 0, 0)
        center_header = QHBoxLayout()
        center_header.addWidget(QLabel("投影片預覽"))
        center_header.addStretch(1)
        self.zoom_preview_button = self._button("放大預覽")
        self.zoom_preview_button.clicked.connect(self.show_large_preview)
        center_header.addWidget(self.zoom_preview_button)
        center_layout.addLayout(center_header)
        self.slide_canvas = SlidePreview()
        self.slide_canvas.setMinimumSize(320, 240)
        self.slide_canvas.area_selected.connect(self._area_selected)
        center_layout.addWidget(self.slide_canvas, 1)
        columns.addWidget(center)
        self.editor_tabs = QTabWidget()
        content_page = QWidget()
        editor = QVBoxLayout(content_page)
        editor.addWidget(QLabel("頁面標題"))
        self.slide_heading = QLineEdit()
        editor.addWidget(self.slide_heading)
        editor.addWidget(QLabel("依本頁內容自動排版"))
        self.auto_layout_status = QLabel("建立專案時自動設計；修改文字後可重新排版。")
        self.auto_layout_status.setWordWrap(True)
        editor.addWidget(self.auto_layout_status)
        self.auto_layout_button = self._button("依內容重新設計這一頁", primary=True)
        self.auto_layout_button.clicked.connect(self._auto_design_current_slide)
        editor.addWidget(self.auto_layout_button)
        editor.addWidget(QLabel("手動微調（可選）"))
        layout_row = QHBoxLayout()
        self.layout_choice = QComboBox()
        self.layout_choice.setIconSize(QSize(96, 54))
        for design in LAYOUT_NAMES:
            self.layout_choice.addItem(_design_icon(design), design)
        self.apply_layout_button = self._button("套用這頁排版")
        self.apply_layout_button.clicked.connect(self._apply_current_layout)
        layout_row.addWidget(self.layout_choice, 1)
        layout_row.addWidget(self.apply_layout_button)
        editor.addLayout(layout_row)
        editor.addWidget(QLabel("頁面內容"))
        self.slide_text = QPlainTextEdit()
        editor.addWidget(self.slide_text, 1)
        self.apply_slide_button = self._button("套用到這一頁")
        self.apply_slide_button.clicked.connect(self._apply_slide_text)
        editor.addWidget(self.apply_slide_button)
        self.editor_tabs.addTab(content_page, "內容")

        image_page = QWidget()
        image_layout = QVBoxLayout(image_page)
        image_layout.addWidget(QLabel("配圖描述（可自行修改；會由本機 Qwen-Image 生成）"))
        self.image_prompt = QPlainTextEdit()
        self.image_prompt.setPlaceholderText("描述這一頁需要的插圖。建議說明主體、情境、色彩與構圖；不要要求圖片內放文字。")
        self.image_prompt.setMaximumHeight(150)
        self.image_prompt.textChanged.connect(self._image_prompt_changed)
        image_layout.addWidget(self.image_prompt)
        self.generate_current_image_button = self._button("為這一頁重新生成配圖", primary=True)
        self.generate_current_image_button.clicked.connect(self.generate_current_slide_image)
        image_layout.addWidget(self.generate_current_image_button)
        self.image_status = QLabel("目前尚未生成圖片。圖片不會改寫頁面文字。")
        self.image_status.setWordWrap(True)
        image_layout.addWidget(self.image_status)
        image_layout.addStretch(1)
        self.editor_tabs.addTab(image_page, "配圖")

        annotation_page = QWidget()
        annotation_layout = QVBoxLayout(annotation_page)
        self.annotation_list = QListWidget()
        self.annotation_list.currentRowChanged.connect(self._select_annotation)
        annotation_layout.addWidget(QLabel("此頁區域標記與留言"))
        annotation_layout.addWidget(self.annotation_list, 1)
        self.annotation_comment = QLineEdit()
        self.annotation_comment.setPlaceholderText("選區說明或修改要求（可稍後補寫）")
        annotation_layout.addWidget(self.annotation_comment)
        mark_actions = QHBoxLayout()
        self.mark_area_button = self._button("在畫布框選區域")
        self.mark_area_button.clicked.connect(self.start_area_marking)
        self.save_annotation_button = self._button("保存標記／留言", primary=True)
        self.save_annotation_button.clicked.connect(self.save_annotation)
        use_mark_button = self._button("用選定標記修改文字")
        use_mark_button.clicked.connect(self.use_selected_annotation_for_text_edit)
        mark_actions.addWidget(self.mark_area_button)
        mark_actions.addWidget(self.save_annotation_button)
        mark_actions.addWidget(use_mark_button)
        annotation_layout.addLayout(mark_actions)
        self.annotation_status = QLabel("標記會跟著頁面保存；目前是待處理項目，尚未執行 AI 修改。")
        self.annotation_status.setWordWrap(True)
        annotation_layout.addWidget(self.annotation_status)
        self.editor_tabs.addTab(annotation_page, "標記與留言")

        sources_page = QWidget()
        sources_layout = QVBoxLayout(sources_page)
        sources_layout.addWidget(QLabel("專案資料（加入後不會自動改寫投影片）"))
        self.source_list = QListWidget()
        self.source_list.currentRowChanged.connect(self._select_library_source)
        sources_layout.addWidget(self.source_list, 1)
        source_actions = QHBoxLayout()
        add_file = self._button("加入檔案…")
        add_file.clicked.connect(self._add_reference_file)
        add_text = self._button("貼上文字…")
        add_text.clicked.connect(self._add_reference_text)
        source_actions.addWidget(add_file)
        source_actions.addWidget(add_text)
        self.recognize_source_button = self._button("辨識圖片文字")
        self.recognize_source_button.clicked.connect(self._recognize_library_image)
        source_actions.addWidget(self.recognize_source_button)
        sources_layout.addLayout(source_actions)
        sources_layout.addWidget(QLabel("資料用途"))
        self.source_role = QComboBox()
        self.source_role.addItems(SOURCE_ROLES)
        sources_layout.addWidget(self.source_role)
        sources_layout.addWidget(QLabel("使用範圍（整份、頁碼或標記區域）"))
        self.source_scope = QLineEdit()
        self.source_scope.setPlaceholderText("例如：整份簡報、頁 3–5、標記 ①")
        sources_layout.addWidget(self.source_scope)
        save_source = self._button("保存資料用途與範圍")
        save_source.clicked.connect(self._save_source_settings)
        sources_layout.addWidget(save_source)
        self.source_preview = QPlainTextEdit()
        self.source_preview.setReadOnly(True)
        sources_layout.addWidget(self.source_preview, 2)
        cite_button = self._button("選擇內容加入目前頁面…", primary=True)
        cite_button.clicked.connect(self._insert_selected_source_fragment)
        sources_layout.addWidget(cite_button)
        self.editor_tabs.addTab(sources_page, "資料")
        edit_page = QWidget()
        edit_layout = QVBoxLayout(edit_page)
        edit_layout.addWidget(QLabel("本機 AI 修改目前頁面的文字；接受前不會改動投影片。"))
        self.edit_instruction = QPlainTextEdit()
        self.edit_instruction.setPlaceholderText("例如：把這頁改得更易懂，但保留所有事實與數字。")
        self.edit_instruction.setMaximumHeight(100)
        edit_layout.addWidget(self.edit_instruction)
        self.propose_edit_button = self._button("產生文字修改候選稿", primary=True)
        self.propose_edit_button.clicked.connect(self.generate_text_edit_candidate)
        edit_layout.addWidget(self.propose_edit_button)
        edit_layout.addWidget(QLabel("此頁候選稿"))
        self.edit_candidate_list = QListWidget()
        self.edit_candidate_list.currentRowChanged.connect(self._select_edit_candidate)
        edit_layout.addWidget(self.edit_candidate_list, 1)
        self.edit_comparison = QPlainTextEdit()
        self.edit_comparison.setReadOnly(True)
        edit_layout.addWidget(self.edit_comparison, 2)
        edit_actions = QHBoxLayout()
        self.accept_edit_button = self._button("接受候選稿", primary=True)
        self.accept_edit_button.clicked.connect(self.accept_selected_text_edit)
        self.reject_edit_button = self._button("取消候選稿")
        self.reject_edit_button.clicked.connect(self.reject_selected_text_edit)
        edit_actions.addWidget(self.accept_edit_button)
        edit_actions.addWidget(self.reject_edit_button)
        edit_layout.addLayout(edit_actions)
        self.edit_status = QLabel("只修改目前頁面的第一個文字物件；尚未支援標記區域的精準改圖。")
        self.edit_status.setWordWrap(True)
        edit_layout.addWidget(self.edit_status)
        self.editor_tabs.addTab(edit_page, "對話修改")
        columns.addWidget(self.editor_tabs)
        columns.setStretchFactor(0, 0)
        columns.setStretchFactor(1, 1)
        columns.setStretchFactor(2, 0)
        columns.setSizes([175, 620, 350])
        layout.addWidget(columns, 1)
        self.editor_status = QLabel("專案會自動保存到本機資料庫。")
        layout.addWidget(self.editor_status)
        return page

    def _start_outline(self) -> None:
        self.outline_input.clear()
        self.deck_title.clear()
        self.parsed = None
        self.original_outline_source = None
        self.model_outline_source = None
        self._parse_outline()
        self.stack.setCurrentWidget(self.outline_page)
        self.outline_input.setFocus()

    def _paste_clipboard(self) -> None:
        self.outline_input.insertPlainText(QApplication.clipboard().text())
        self.outline_input.setFocus()

    def _parse_outline(self) -> None:
        self.slide_preview.clear()
        if not self._adopting_ai_candidate:
            self.model_outline_source = None
        try:
            title, slides, source = parse_outline_text(self.outline_input.toPlainText())
        except ValueError as exc:
            self.parsed = None
            self.parse_status.setText(str(exc))
            self.continue_button.setEnabled(False)
            return
        self.parsed = {"title": title, "slides": slides, "source": source}
        if not self.deck_title.text().strip():
            self.deck_title.setText(title)
        for index, slide in enumerate(slides, 1):
            self.slide_preview.addItem(f"{index:02d}　{slide['title']}")
        self.parse_status.setText(f"已辨識 {len(slides)} 頁。確認標題與頁序後按「下一步」。")
        self.continue_button.setEnabled(True)

    def _generate_outline_candidate(self) -> None:
        if not self.parsed:
            QMessageBox.information(self, "先貼上大綱", "請先貼上可辨識的大綱，再請本機 AI 協助整理或擴寫。")
            return
        model_path = discover_qwen38_mlx()
        if not model_path:
            QMessageBox.warning(self, "找不到本機文字模型", "沒有找到 Qwen3.8-27B MLX 模型資料夾；未呼叫網路服務，也未變更原始大綱。")
            return
        backend = LocalQwenTextBackend(CheckpointManifest(
            "Qwen3.8-27B local", str(model_path), "0" * 64,
            "local model directory", "local", "see checkpoint license", "mlx", format="mlx",
        ))
        health = backend.health()
        if not health["ok"]:
            QMessageBox.warning(self, "本機 AI 尚未就緒", "原始大綱保持不變。\n\n" + "\n".join(health["errors"]))
            return
        original = self.outline_input.toPlainText()
        prompt = (
            "請整理並改善以下繁體中文簡報大綱。保留原有頁數、順序及每項可辨識的重點；修正重複、格式與頁面銜接。"
            "不可新增來源未提供的醫療事實、數據或療效承諾。請只輸出 Markdown：第一行 # 簡報名稱，每頁以 ## 第N頁｜標題開始，"
            "頁面重點使用項目符號。即使內容很長也要逐頁保留，不可只回覆摘要。\n\n原始大綱：\n" + original
        )
        self.ai_outline_button.setEnabled(False)
        self.continue_button.setEnabled(False)
        self.parse_status.setText("正在啟動本機文字模型。首次載入可能需要數分鐘；原始大綱不會被改動。")
        self._plan_worker = TextPlanningWorker(prompt, Path(model_path))
        self._plan_worker.completed.connect(self._review_ai_candidate)
        self._plan_worker.failed.connect(self._outline_generation_failed)
        self._plan_worker.finished.connect(lambda: self.ai_outline_button.setEnabled(True))
        self._plan_worker.start()

    def _review_ai_candidate(self, candidate: dict) -> None:
        self.continue_button.setEnabled(self.parsed is not None)
        dialog = QDialog(self)
        dialog.setWindowTitle("檢視本機 AI 候選大綱")
        dialog.resize(800, 640)
        layout = QVBoxLayout(dialog)
        layout.addWidget(QLabel(
            f"本機模型提出 {len(candidate['slides'])} 頁候選稿。原始大綱尚未更動；可先編輯候選稿，再決定是否採用。"
        ))
        editor = QPlainTextEdit()
        editor.setPlainText(candidate["source"]["text"])
        layout.addWidget(editor, 1)
        buttons = QDialogButtonBox()
        keep_original = buttons.addButton("保留原始大綱", QDialogButtonBox.ButtonRole.RejectRole)
        accept_candidate = buttons.addButton("採用候選稿", QDialogButtonBox.ButtonRole.AcceptRole)
        layout.addWidget(buttons)
        keep_original.clicked.connect(dialog.reject)
        accept_candidate.clicked.connect(dialog.accept)
        if dialog.exec() != QDialog.DialogCode.Accepted:
            self.parse_status.setText("已保留原始大綱；AI 候選稿未套用。")
            return
        try:
            title, slides, source = parse_outline_text(editor.toPlainText())
        except ValueError as exc:
            QMessageBox.warning(self, "候選稿格式無法辨識", f"原始大綱仍保留。\n\n{exc}")
            return
        self.original_outline_source = self.parsed["source"]
        self.model_outline_source = candidate["source"]
        self._adopting_ai_candidate = True
        self.outline_input.setPlainText(editor.toPlainText())
        self.deck_title.setText(title)
        self._parse_outline()
        self._adopting_ai_candidate = False
        self.parsed["source"].update({
            "origin": "accepted_model_outline",
            "display_name": "使用者確認的本機 AI 大綱",
            "model_source_id": candidate["source"]["id"],
        })
        self.parse_status.setText(f"已採用並可繼續編輯 {len(slides)} 頁候選大綱；原始版本仍會一併保存。")

    def _outline_generation_failed(self, message: str) -> None:
        self.ai_outline_button.setEnabled(True)
        self.continue_button.setEnabled(self.parsed is not None)
        self.parse_status.setText("AI 草稿未完成；原始大綱未更動。")
        QMessageBox.warning(self, "AI 大綱未完成", f"沒有套用候選稿，原始內容仍在。\n\n{message}")

    def _continue_settings(self) -> None:
        if not self.parsed:
            return
        self.settings_title.setText(self.deck_title.text().strip() or self.parsed["title"])
        self.settings_summary.setText(f"將建立 {len(self.parsed['slides'])} 頁；保留大綱來源與每頁文字，可在下一步逐頁編輯。")
        self.stack.setCurrentWidget(self.settings_page)

    def _create_project(self) -> None:
        if not self.parsed:
            return
        document = new_project_document(self.settings_title.text().strip() or self.parsed["title"])
        document["slides"] = self.parsed["slides"]
        document["sources"] = [
            source for source in (self.original_outline_source, self.model_outline_source, self.parsed["source"])
            if source is not None
        ]
        document["outline"] = [
            {"id": str(uuid4()), "slide_id": slide["id"], "title": slide["title"]}
            for slide in document["slides"]
        ]
        document["settings"] = {"style": self.style_choice.currentText(), "output_format": self.settings_output_mode.currentText()}
        for index, slide in enumerate(document["slides"]):
            slide["source_id"] = self.parsed["source"]["id"]
            auto_design_slide(slide, index)
        project_id = document["project_id"]
        self.store.create(self.parsed["source"]["path"], project_id=project_id)
        self.revision = self.store.save_document(project_id, document, expected_revision=0)
        if self.model_outline_source:
            self.store.record_attempt(
                project_id, 0, "outline_generation",
                {
                    "mode": "user_reviewed_candidate",
                    "source_id": self.original_outline_source.get("id") if self.original_outline_source else None,
                    "runtime": self.model_outline_source.get("runtime"),
                },
                {
                    "status": "accepted",
                    "candidate_source_id": self.model_outline_source.get("id"),
                    "output_source_id": self.parsed["source"].get("id"),
                },
            )
        self.project_id, self.document = project_id, document
        self._show_editor()
        self._refresh_recent()

    def _show_editor(self) -> None:
        assert self.document is not None
        self.editor_title.setText(self.document.get("title", ""))
        self.output_mode_choice.blockSignals(True)
        self.output_mode_choice.setCurrentText(self.document.get("settings", {}).get("output_format", "可編輯式 PPTX"))
        self.output_mode_choice.blockSignals(False)
        self.slide_list.clear()
        for index, slide in enumerate(self.document.get("slides", []), 1):
            self.slide_list.addItem(f"{index:02d}　{slide['title']}")
        self._refresh_library_sources()
        self.stack.setCurrentWidget(self.editor_page)
        if self.slide_list.count():
            self.slide_list.setCurrentRow(0)

    def _select_slide(self, row: int) -> None:
        if not self.document or not 0 <= row < len(self.document.get("slides", [])):
            return
        slide = self.document["slides"][row]
        self.slide_heading.setText(slide.get("title", ""))
        self.layout_choice.setCurrentText(slide.get("layout", DEFAULT_LAYOUT))
        self.auto_layout_status.setText(
            f"自動設計：{slide.get('content_layout', '尚未分析')} · {slide.get('layout', DEFAULT_LAYOUT)}"
            if slide.get("auto_layout") else "目前為手動微調排版；可按上方按鈕恢復依內容自動設計。")
        text_elements = [element for element in slide.get("elements", []) if element.get("type", "text") == "text"]
        self._text_element_id = text_elements[0]["id"] if text_elements else None
        self.slide_text.setPlainText(text_elements[0].get("text", "") if text_elements else "")
        self.image_prompt.blockSignals(True)
        self.image_prompt.setPlainText(slide.get("image_prompt") or self._default_image_prompt(
            slide, self.document.get("settings", {}).get("style", "")))
        self.image_prompt.blockSignals(False)
        self._refresh_annotations(slide["id"])
        self._edit_annotation_id = None
        self._refresh_edit_candidates(slide["id"])
        self._refresh_slide_canvas(row)

    def _refresh_edit_candidates(self, slide_id: str) -> None:
        self.edit_candidate_list.clear()
        self._visible_edit_candidate_ids = []
        if not self.document:
            return
        for candidate in self.document.get("edit_candidates", []):
            if candidate.get("slide_id") == slide_id:
                self._visible_edit_candidate_ids.append(candidate["id"])
                self.edit_candidate_list.addItem(f"{candidate['status']} · {candidate['instruction'][:42]}")
        if self._visible_edit_candidate_ids:
            self.edit_candidate_list.setCurrentRow(len(self._visible_edit_candidate_ids) - 1)
        else:
            self.edit_comparison.clear()

    def _selected_edit_candidate(self) -> dict | None:
        row = self.edit_candidate_list.currentRow()
        if not self.document or not 0 <= row < len(getattr(self, "_visible_edit_candidate_ids", [])):
            return None
        candidate_id = self._visible_edit_candidate_ids[row]
        return next((item for item in self.document.get("edit_candidates", []) if item["id"] == candidate_id), None)

    def _select_edit_candidate(self, _row: int) -> None:
        candidate = self._selected_edit_candidate()
        if candidate:
            self.edit_comparison.setPlainText(
                f"目前／原始文字：\n{candidate['original_text']}\n\n候選文字：\n{candidate['proposed_text']}"
            )
        else:
            self.edit_comparison.clear()

    def generate_text_edit_candidate(self) -> None:
        row = self.slide_list.currentRow()
        if not self.document or not 0 <= row < len(self.document["slides"]):
            return
        if self._edit_worker and self._edit_worker.isRunning():
            QMessageBox.information(self, "文字修改中", "請先等待目前的候選稿完成。")
            return
        instruction = self.edit_instruction.toPlainText().strip()
        if not instruction:
            QMessageBox.information(self, "請輸入修改要求", "請先說明這頁文字要怎麼修改。")
            return
        slide = self.document["slides"][row]
        annotation = next((item for item in self.document.get("annotations", [])
                           if item.get("id") == self._edit_annotation_id and item.get("slide_id") == slide["id"]), None)
        target_id = annotation.get("element_id") if annotation else self._text_element_id
        element = next((item for item in slide.get("elements", []) if item.get("id") == target_id), None)
        if element and element.get("type") != "text":
            QMessageBox.information(self, "標記不是文字", "這個標記指向圖片；目前僅能對文字物件建立候選稿。")
            return
        current_text_element = next((item for item in slide.get("elements", [])
                                     if item.get("id") == self._text_element_id), None)
        if (self.slide_heading.text().strip() != slide["title"]
                or self.slide_text.toPlainText().strip() != (current_text_element.get("text", "").strip() if current_text_element else "")):
            QMessageBox.information(self, "先套用目前文字", "內容分頁有尚未套用的文字或標題。請先按「套用到這一頁」，再產生修改候選稿。")
            return
        if not element:
            QMessageBox.warning(self, "沒有可修改的文字", "目前頁面沒有文字物件；請先在內容分頁加入文字。")
            return
        if not self.save_project():
            return
        model_path = discover_qwen38_mlx()
        if not model_path:
            QMessageBox.warning(self, "文字模型未就緒", "找不到本機 Qwen3.8-27B MLX 模型；未送出任何修改。")
            return
        backend = LocalQwenTextBackend(CheckpointManifest(
            "Qwen3.8-27B local", str(model_path), "0" * 64,
            "local model directory", "local", "see checkpoint license", "mlx", format="mlx",
        ))
        health = backend.health()
        if not health["ok"]:
            QMessageBox.warning(self, "文字模型未就緒", "\n".join(health["errors"]))
            return
        prompt = (
            "你正在修改繁體中文簡報的單一文字物件。只輸出修改後的文字，不要前言、Markdown 程式區塊或解釋。"
            "保留原文的可驗證事實、數字與來源；不可修改其他頁、標題或圖片。若要求需要新資料但未提供，保留原文並明說無法補入，勿捏造。\n"
            f"投影片標題：{slide['title']}\n修改要求：{instruction}\n原始文字：\n{element.get('text', '')}"
        )
        target = {"slide_id": slide["id"], "element_id": element["id"],
                  "base_revision": self.revision, "instruction": instruction,
                  "original_text": element.get("text", ""),
                  "annotation_id": annotation["id"] if annotation else None}
        self.propose_edit_button.setEnabled(False)
        self.edit_status.setText("本機文字模型正在提出候選稿；原稿保持不變。")
        self._edit_worker = TextEditWorker(prompt, Path(model_path), target)
        self._edit_worker.completed.connect(self._receive_text_edit_candidate)
        self._edit_worker.failed.connect(self._text_edit_failed)
        self._edit_worker.finished.connect(lambda: self.propose_edit_button.setEnabled(True))
        self._edit_worker.start()

    def _receive_text_edit_candidate(self, result: dict) -> None:
        if not self.document or not self.project_id:
            return
        slide = next((item for item in self.document["slides"] if item["id"] == result["slide_id"]), None)
        element = next((item for item in slide.get("elements", []) if item.get("id") == result["element_id"]), None) if slide else None
        if not element or element.get("text", "") != result["original_text"]:
            self.edit_status.setText("模型執行期間原文已變更；候選稿未套用，請重新提出修改。")
            return
        candidate = stage_text_candidate(
            self.document, result["slide_id"], result["element_id"], result["proposed_text"],
            result["instruction"], result["base_revision"],
        )
        candidate["runtime"] = result.get("runtime")
        if result.get("annotation_id"):
            candidate["annotation_id"] = result["annotation_id"]
        if not self.save_project():
            self.document["edit_candidates"].remove(candidate)
            return
        self.store.record_attempt(self.project_id, slide.get("order", -1), "text_edit_candidate",
                                  {"instruction": result["instruction"], "slide_id": slide["id"],
                                   "element_id": element["id"], "base_revision": result["base_revision"]},
                                  {"status": "candidate", "candidate_id": candidate["id"],
                                   "runtime": result.get("runtime")})
        self._refresh_edit_candidates(slide["id"])
        self.edit_status.setText("候選稿已保存；請先比較，再決定接受或取消。")

    def _text_edit_failed(self, message: str) -> None:
        self.edit_status.setText("候選稿未完成，原稿未變更：" + message)

    def accept_selected_text_edit(self) -> None:
        candidate = self._selected_edit_candidate()
        if not candidate or not self.document:
            return
        before = deepcopy(self.document)
        try:
            accept_text_candidate(self.document, candidate["id"], current_revision=self.revision)
        except (RuntimeError, ValueError) as exc:
            QMessageBox.warning(self, "候選稿無法套用", str(exc))
            return
        if candidate.get("annotation_id"):
            mark = next((item for item in self.document.get("annotations", [])
                         if item["id"] == candidate["annotation_id"]), None)
            if mark:
                mark["status"] = "已處理"
        row = self.slide_list.currentRow()
        if 0 <= row < len(self.document["slides"]) and self.document["slides"][row].get("auto_layout"):
            auto_design_slide(self.document["slides"][row], row)
        if not self.save_project():
            self.document = before
            return
        self._select_slide(row)
        self.edit_status.setText("已接受候選稿並建立新版本；可從版本比較還原。")

    def reject_selected_text_edit(self) -> None:
        candidate = self._selected_edit_candidate()
        if not candidate or not self.document:
            return
        before = deepcopy(self.document)
        try:
            reject_candidate(self.document, candidate["id"])
        except ValueError as exc:
            QMessageBox.warning(self, "無法取消", str(exc))
            return
        if not self.save_project():
            self.document = before
            return
        self._refresh_edit_candidates(candidate["slide_id"])
        self.edit_status.setText("候選稿已取消；投影片原文沒有變動。")

    def _apply_slide_text(self) -> None:
        row = self.slide_list.currentRow()
        if not self.document or not 0 <= row < len(self.document["slides"]):
            return
        slide = self.document["slides"][row]
        original_slide = deepcopy(slide)
        slide["title"] = self.slide_heading.text().strip()
        text = self.slide_text.toPlainText().strip()
        if text:
            self._text_element_id = update_slide_text_element(slide, text, self._text_element_id)
        elif self._text_element_id:
            slide["elements"] = [element for element in slide.get("elements", []) if element.get("id") != self._text_element_id]
            self._text_element_id = None
        if slide.get("auto_layout"):
            auto_design_slide(slide, row)
        self.slide_list.item(row).setText(f"{row + 1:02d}　{slide['title']}")
        self._refresh_slide_canvas(row)
        if not self.save_project():
            self.document["slides"][row] = original_slide
            self._select_slide(row)
            self.slide_list.item(row).setText(f"{row + 1:02d}　{original_slide['title']}")
        elif slide.get("auto_layout"):
            self.auto_layout_status.setText(f"自動設計：{slide['content_layout']} · {slide['layout']}")

    def _apply_current_layout(self) -> None:
        row = self.slide_list.currentRow()
        if not self.document or not 0 <= row < len(self.document["slides"]):
            return
        slide = self.document["slides"][row]
        original_slide = deepcopy(slide)
        apply_slide_layout(slide, self.layout_choice.currentText(), cover=row == 0)
        slide["auto_layout"] = False
        slide["content_layout"] = "手動微調"
        if not self.save_project():
            self.document["slides"][row] = original_slide
            self._select_slide(row)
            return
        self._refresh_slide_canvas(row)
        self.editor_status.setText(f"已套用「{slide['layout']}」排版並保存。")

    def _auto_design_current_slide(self) -> None:
        row = self.slide_list.currentRow()
        if not self.document or not 0 <= row < len(self.document["slides"]):
            return
        slide = self.document["slides"][row]
        original = deepcopy(slide)
        kind = auto_design_slide(slide, row)
        if not self.save_project():
            self.document["slides"][row] = original
            return
        self._select_slide(row)
        self.editor_status.setText(f"已依本頁內容自動設計為「{kind}」，並保存。")

    def _output_mode_changed(self, mode: str) -> None:
        if self.document and mode:
            self.document.setdefault("settings", {})["output_format"] = mode
            self._schedule_save()

    def _image_prompt_changed(self) -> None:
        row = self.slide_list.currentRow()
        if self.document and 0 <= row < len(self.document["slides"]):
            self.document["slides"][row]["image_prompt"] = self.image_prompt.toPlainText()
            self._schedule_save()

    def _refresh_slide_canvas(self, row: int) -> None:
        if not self.document or not 0 <= row < len(self.document["slides"]):
            return
        assets = self.app_support / "projects" / self.project_id / "assets"
        payload = slide_preview_payload(self.document, row, assets, include_annotations=True)
        self.slide_canvas.set_slide(**payload)

    def show_large_preview(self) -> None:
        row = self.slide_list.currentRow()
        if not self.document or not 0 <= row < len(self.document["slides"]):
            return
        dialog = QDialog(self)
        dialog.setWindowTitle(f"第 {row + 1} 頁｜放大預覽")
        dialog.resize(1200, 760)
        layout = QVBoxLayout(dialog)
        canvas = SlidePreview(dialog)
        assets = self.app_support / "projects" / self.project_id / "assets"
        canvas.set_slide(**slide_preview_payload(self.document, row, assets, include_annotations=True))
        layout.addWidget(canvas, 1)
        close_button = self._button("關閉預覽")
        close_button.clicked.connect(dialog.accept)
        layout.addWidget(close_button)
        dialog.exec()

    @staticmethod
    def _default_image_prompt(slide: dict, style: str = "") -> str:
        body = "\n".join(
            element.get("text", "") for element in slide.get("elements", [])
            if element.get("type", "text") == "text"
        )
        style_hint = f"使用{style}的視覺氣氛；" if style else ""
        composition = ("採橫幅構圖，將重要主體留在中央，避免上下邊緣放關鍵內容。"
                       if slide.get("layout") == "上圖下文" else "主體清楚，留出簡報文字所需的視覺空間。")
        return (f"為繁體中文簡報頁面設計一張清楚、簡潔的配圖。{style_hint}"
                f"{composition}以視覺呈現主題，不要在圖片中加入文字、標籤或數據。\n"
                f"頁面標題：{slide.get('title', '')}\n頁面重點：\n{body}")[:1800]

    def generate_current_slide_image(self) -> None:
        if not self.document or not self.project_id:
            return
        row = self.slide_list.currentRow()
        if not 0 <= row < len(self.document["slides"]):
            return
        slide = self.document["slides"][row]
        images = [element for element in slide.get("elements", []) if element.get("type") == "image"]
        if images and QMessageBox.question(
            self, "此頁已有圖片", "仍要另外生成一張配圖嗎？原有圖片會保留。",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No,
        ) != QMessageBox.StandardButton.Yes:
            return
        prompt = self.image_prompt.toPlainText().strip()
        if not prompt:
            QMessageBox.information(self, "需要配圖描述", "請輸入這一頁要呈現的畫面內容。")
            return
        self._start_image_generation([slide], {slide["id"]: prompt})

    def generate_missing_slide_images(self) -> None:
        if not self.document or not self.project_id:
            return
        slides = [
            slide for slide in self.document["slides"]
            if not any(element.get("type") == "image" for element in slide.get("elements", []))
        ]
        if not slides:
            QMessageBox.information(self, "配圖已完成", "每一頁目前都有圖片；如需重做，請切到該頁的「配圖」分頁。")
            return
        answer = QMessageBox.question(
            self, "依序為頁面配圖",
            f"將為 {len(slides)} 頁逐頁生成本機配圖，可能需要一段時間。已完成的頁面會立即保存；可隨時取消。",
            QMessageBox.StandardButton.Ok | QMessageBox.StandardButton.Cancel,
            QMessageBox.StandardButton.Cancel,
        )
        if answer != QMessageBox.StandardButton.Ok:
            return
        prompts = {
            slide["id"]: slide.get("image_prompt") or self._default_image_prompt(
                slide, self.document.get("settings", {}).get("style", ""))
            for slide in slides
        }
        self._start_image_generation(slides, prompts)

    def _start_image_generation(self, slides: list[dict], prompts: dict[str, str]) -> None:
        if self._image_worker and self._image_worker.isRunning():
            QMessageBox.information(self, "圖片生成中", "目前的配圖工作完成或取消後，才能開始另一項工作。")
            return
        readiness = qwen_image21_readiness(self.image_model_path)
        if not readiness["ready"]:
            QMessageBox.warning(
                self, "圖片模型尚未就緒",
                "Qwen-Image-2.1 尚未通過完整性檢查；不會開始推論或變更投影片。\n\n"
                + "\n".join(readiness["missing"] + readiness["incomplete"]),
            )
            self.image_status.setText("圖片模型未通過完整性檢查。")
            return
        snapshots = []
        for slide in slides:
            snapshot = dict(slide)
            snapshot["prompt"] = prompts[slide["id"]]
            snapshot["content_fingerprint"] = self._slide_content_fingerprint(slide)
            snapshot["image_size"] = (1024, 512) if slide.get("layout") == "上圖下文" else (768, 512)
            snapshots.append(snapshot)
        self._image_cancelled = False
        self._image_success_count = 0
        self._image_error = ""
        self._image_dialog = QDialog(self)
        self._image_dialog.setWindowTitle("本機生成簡報配圖")
        self._image_dialog.resize(430, 150)
        layout = QVBoxLayout(self._image_dialog)
        self._image_progress_label = QLabel("正在啟動 Qwen-Image-2.1；首次載入需要一些時間。")
        self._image_progress_label.setWordWrap(True)
        layout.addWidget(self._image_progress_label)
        self._image_cancel_button = self._button("取消後續頁面")
        self._image_cancel_button.clicked.connect(self._cancel_image_generation)
        layout.addWidget(self._image_cancel_button)
        self._image_dialog.finished.connect(lambda *_: self._cancel_image_generation())
        self._image_dialog.show()
        self._image_worker = ImageGenerationWorker(self.image_model_path, snapshots, steps=20)
        self._image_worker.progress.connect(self._image_generation_progress)
        self._image_worker.image_ready.connect(self._attach_generated_image)
        self._image_worker.failed.connect(self._image_generation_failed)
        self._image_worker.cancelled.connect(self._image_generation_cancelled)
        self._image_worker.finished.connect(self._image_generation_finished)
        self.image_status.setText(f"本機圖片生成已開始，共 {len(slides)} 頁；已完成的配圖會逐頁保存。")
        self._image_worker.start()

    @staticmethod
    def _slide_content_fingerprint(slide: dict) -> str:
        content = {
            "id": slide.get("id"), "title": slide.get("title", ""), "layout": slide.get("layout"),
            "text": [(element.get("id"), element.get("text", "")) for element in slide.get("elements", [])
                     if element.get("type", "text") == "text"],
        }
        return hashlib.sha256(json.dumps(content, ensure_ascii=False, sort_keys=True).encode()).hexdigest()

    def _cancel_image_generation(self) -> None:
        worker = self._image_worker
        if worker and worker.isRunning():
            self._image_cancelled = True
            worker.cancel()
            if self._image_cancel_button:
                self._image_cancel_button.setEnabled(False)
                self._image_cancel_button.setText("正在停止…")

    def _image_generation_progress(self, _index: int, _total: int, message: str) -> None:
        if hasattr(self, "_image_progress_label"):
            self._image_progress_label.setText(message)
            self.image_status.setText(message)

    def _attach_generated_image(self, slide_id: str, generated_path: str, prompt: str) -> None:
        if not self.document or not self.project_id:
            return
        source_slide = next((slide for slide in self._image_worker.slides if slide["id"] == slide_id), None)
        slide = next((item for item in self.document["slides"] if item["id"] == slide_id), None)
        path = Path(generated_path)
        if not source_slide or not slide or not path.is_file():
            self._image_generation_failed(slide_id, "專案頁面已變更或生成檔不存在；圖片保留在本機生成快取中。")
            return
        if self._slide_content_fingerprint(slide) != source_slide["content_fingerprint"]:
            self._image_generation_failed(slide_id, "生成期間頁面文字已變更；為免套用到舊內容，圖片保留在本機生成快取中。")
            return
        layout_name = slide.get("layout")
        slot = (layout_rects(layout_name, cover=slide.get("order") == 0, has_image=True)["image"]
                if layout_name in LAYOUT_NAMES else self._image_slot(slide))
        source = {item.get("id"): item for item in self.document.get("sources", [])}
        is_outline = source.get(slide.get("source_id"), {}).get("origin") in {
            "pasted_text", "accepted_model_outline", "model_generated_outline",
        }
        has_existing_image = any(element.get("type") == "image" for element in slide.get("elements", []))
        if slot is None and is_outline and not has_existing_image:
            slot = (.58, .22, .36, .60)
        if slot is None:
            self._image_generation_failed(slide_id, "此頁找不到不重疊的配圖位置；已保留生成圖片，請先調整版面後再試。")
            return
        project_id = self.project_id
        assets = self.app_support / "projects" / project_id / "assets"
        assets.mkdir(parents=True, exist_ok=True)
        asset_name = f"qwen-image-{uuid4().hex}.png"
        asset_path = assets / asset_name
        shutil.copyfile(path, asset_path)
        instance_id = str(uuid4())
        output_hash = hashlib.sha256(asset_path.read_bytes()).hexdigest()
        request_hash = hashlib.sha256(json.dumps({
            "slide_id": slide_id, "prompt": prompt, "model": "Qwen-Image-2.1",
            "width": source_slide["image_size"][0], "height": source_slide["image_size"][1], "steps": 20,
        }, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        original_elements = deepcopy(slide.get("elements", []))
        original_references = deepcopy(self.document.setdefault("image_generation_ledger", []))
        try:
            if is_outline and not has_existing_image and layout_name not in LAYOUT_NAMES:
                for element in slide["elements"]:
                    if element.get("type", "text") == "text":
                        element.update(x=.06, y=.43 if slide.get("order") == 0 else .24,
                                       width=.49, height=.38 if slide.get("order") == 0 else .60)
            element = {
                "id": instance_id, "type": "image", "origin": "qwen_image21",
                "asset_path": asset_name, "prompt": prompt,
                "x": slot[0], "y": slot[1], "width": slot[2], "height": slot[3],
            }
            slide.setdefault("elements", []).append(element)
            if slide.get("auto_layout"):
                auto_design_slide(slide, slide.get("order", 0))
            elif layout_name in LAYOUT_NAMES:
                apply_slide_layout(slide, layout_name, cover=slide.get("order") == 0)
            ledger_entry = {
                "instance_id": instance_id, "slide_id": slide_id, "policy": "GENERATE",
                "model": "Qwen-Image-2.1", "request_sha256": request_hash,
                "output_sha256": output_hash, "asset_path": asset_name,
            }
            self.document["image_generation_ledger"].append(ledger_entry)
            if not self.save_project():
                raise RuntimeError("專案版本保存失敗；已撤回尚未接受的配圖。")
            self.store.record_attempt(
                project_id, slide["order"], "image_generation",
                {"prompt": prompt, "policy": "GENERATE", "model": "Qwen-Image-2.1",
                 "request_sha256": request_hash, "dispatch_token": self._image_worker.dispatch_token,
                 "slide_id": slide_id, "instance_id": instance_id},
                {"status": "accepted", "asset_path": asset_name, "output_sha256": output_hash},
            )
        except Exception as exc:
            slide["elements"] = original_elements
            self.document["image_generation_ledger"] = original_references
            asset_path.unlink(missing_ok=True)
            self._image_generation_failed(slide_id, f"配圖未能保存：{exc}")
            return
        path.unlink(missing_ok=True)
        self._image_success_count += 1
        row = next(index for index, item in enumerate(self.document["slides"]) if item["id"] == slide_id)
        self.slide_list.item(row).setText(f"{row + 1:02d}　{slide['title']}　· 有配圖")
        if self.slide_list.currentRow() == row:
            self._refresh_slide_canvas(row)
        self.image_status.setText(f"第 {row + 1} 頁配圖已生成並保存；原有文字與其他頁面未更動。")

    @staticmethod
    def _image_slot(slide: dict) -> tuple[float, float, float, float] | None:
        candidates = ((.58, .22, .36, .60), (.58, .54, .36, .30), (.06, .60, .35, .27))
        for candidate in candidates:
            if all(not (
                candidate[0] < float(element.get("x", .08)) + float(element.get("width", .84))
                and float(element.get("x", .08)) < candidate[0] + candidate[2]
                and candidate[1] < float(element.get("y", .24)) + float(element.get("height", .58))
                and float(element.get("y", .24)) < candidate[1] + candidate[3]
            ) for element in slide.get("elements", [])):
                return candidate
        return None

    def _image_generation_failed(self, slide_id: str, message: str) -> None:
        if self.project_id:
            slide = next((item for item in self.document.get("slides", []) if item["id"] == slide_id), None) if self.document else None
            self.store.record_attempt(
                self.project_id, slide.get("order", -1) if slide else -1, "image_generation",
                {"slide_id": slide_id, "dispatch_token": getattr(self._image_worker, "dispatch_token", "")},
                {"status": "resumable_error", "error": message},
            )
        self._image_error = message
        self.image_status.setText("圖片未套用；原有簡報保持不變。" + message)

    def _image_generation_cancelled(self) -> None:
        self._image_cancelled = True
        self.image_status.setText(f"已取消後續生成；已成功保存 {self._image_success_count} 頁配圖。")

    def _image_generation_finished(self) -> None:
        if self._image_dialog:
            self._image_dialog.close()
            self._image_dialog.deleteLater()
            self._image_dialog = None
        self._image_worker = None
        if self._image_cancel_button:
            self._image_cancel_button = None
        if self._image_error:
            QMessageBox.warning(self, "圖片生成中斷", self.image_status.text())
        elif self._image_success_count:
            self.image_status.setText(f"已完成並保存 {self._image_success_count} 頁配圖。")
        elif not self._image_cancelled:
            self.image_status.setText("沒有頁面配圖完成；原有專案未變更。")

    def start_area_marking(self) -> None:
        if not self.document or self.slide_list.currentRow() < 0:
            QMessageBox.information(self, "先選擇頁面", "請先選取一張投影片，再框選需要修改或備註的區域。")
            return
        self.editor_tabs.setCurrentIndex(2)
        self._pending_annotation = None
        self.annotation_status.setText("在中央投影片上按住滑鼠左鍵拖曳，框出要標記的範圍。")
        self.slide_canvas.set_mark_mode(True)

    def _area_selected(self, rect: tuple[float, float, float, float]) -> None:
        self._pending_annotation = rect
        self.annotation_status.setText("已框選區域；可補寫留言，再按「保存標記／留言」。")
        self.annotation_comment.setFocus()

    def save_annotation(self) -> None:
        if not self.document or not self.project_id or self.slide_list.currentRow() < 0:
            return
        if self._pending_annotation is None:
            row = self.annotation_list.currentRow()
            if 0 <= row < len(getattr(self, "_annotation_ids", [])):
                mark = next((item for item in self.document.get("annotations", [])
                             if item["id"] == self._annotation_ids[row]), None)
                if mark:
                    old_comment = mark.get("comment", "")
                    mark["comment"] = self.annotation_comment.text().strip()
                    if not self.save_project():
                        mark["comment"] = old_comment
                        return
                    slide = self.document["slides"][self.slide_list.currentRow()]
                    self.store.record_attempt(
                        self.project_id, slide["order"], "annotation_comment_updated",
                        {"annotation_id": mark["id"], "slide_id": mark["slide_id"], "comment": mark["comment"]},
                        {"status": mark.get("status", "待處理"), "base_revision": self.revision},
                    )
                    self._refresh_annotations(slide["id"])
                    self.annotation_list.setCurrentRow(row)
                    return
            QMessageBox.information(self, "尚未框選區域", "請先按「在畫布框選區域」，再於投影片上拖曳選取範圍。")
            return
        slide = self.document["slides"][self.slide_list.currentRow()]
        x1, y1, x2, y2 = self._pending_annotation
        center = ((x1 + x2) / 2, (y1 + y2) / 2)
        element_id = None
        for element in slide.get("elements", []):
            x, y = float(element.get("x", .08)), float(element.get("y", .24))
            width, height = float(element.get("width", .84)), float(element.get("height", .58))
            if x <= center[0] <= x + width and y <= center[1] <= y + height:
                element_id = element.get("id")
                break
        mark = {
            "id": str(uuid4()), "slide_id": slide["id"], "element_id": element_id,
            "rect": [x1, y1, x2, y2], "comment": self.annotation_comment.text().strip(),
            "status": "待處理", "base_revision": self.revision,
        }
        self.document.setdefault("annotations", []).append(mark)
        if not self.save_project():
            self.document["annotations"].remove(mark)
            return
        self.store.record_attempt(
            self.project_id, slide["order"], "annotation_created",
            {"annotation_id": mark["id"], "slide_id": slide["id"], "element_id": element_id,
             "rect": mark["rect"], "comment": mark["comment"]},
            {"status": "pending", "base_revision": mark["base_revision"]},
        )
        self._pending_annotation = None
        self.annotation_comment.clear()
        self._refresh_annotations(slide["id"])
        self._refresh_slide_canvas(self.slide_list.currentRow())
        self.annotation_status.setText("標記和留言已保存；尚未對投影片執行修改。")

    def _refresh_annotations(self, slide_id: str) -> None:
        self.annotation_list.clear()
        self._annotation_ids = []
        marks = [mark for mark in self.document.get("annotations", []) if mark.get("slide_id") == slide_id]
        for index, mark in enumerate(marks, 1):
            comment = mark.get("comment") or "尚未留言"
            self.annotation_list.addItem(f"{index:02d} · {mark.get('status', '待處理')} · {comment}")
            self._annotation_ids.append(mark["id"])
        self.annotation_status.setText(f"本頁有 {len(marks)} 個已保存標記；標記只記錄範圍，尚未執行 AI 修改。")

    def _select_annotation(self, row: int) -> None:
        if not self.document or not hasattr(self, "_annotation_ids") or not 0 <= row < len(self._annotation_ids):
            return
        annotation_id = self._annotation_ids[row]
        mark = next((item for item in self.document.get("annotations", []) if item["id"] == annotation_id), None)
        if mark:
            self._selected_annotation_id = annotation_id
            self.annotation_comment.setText(mark.get("comment", ""))
            self._refresh_slide_canvas(self.slide_list.currentRow())

    def use_selected_annotation_for_text_edit(self) -> None:
        row = self.annotation_list.currentRow()
        if not self.document or not 0 <= row < len(getattr(self, "_annotation_ids", [])):
            QMessageBox.information(self, "先選標記", "請先在標記清單選取要修改的文字區域。")
            return
        mark = next((item for item in self.document.get("annotations", [])
                     if item["id"] == self._annotation_ids[row]), None)
        slide_row = self.slide_list.currentRow()
        slide = self.document["slides"][slide_row]
        element = next((item for item in slide.get("elements", [])
                        if item.get("id") == mark.get("element_id")), None) if mark else None
        if not element or element.get("type") != "text":
            QMessageBox.information(self, "標記不是文字", "這個標記未指向文字物件；目前不能從此標記改字。")
            return
        self._edit_annotation_id = mark["id"]
        self.edit_instruction.setPlainText(mark.get("comment", ""))
        self.editor_tabs.setCurrentIndex(self.editor_tabs.count() - 1)
        self.edit_status.setText("已選定標記區域；目前會修改整個對應文字物件，不會只改框內字句。")

    def save_project(self) -> bool:
        if not self.document or not self.project_id:
            return False
        self.document["title"] = self.editor_title.text().strip() or self.document["title"]
        try:
            current = self.store.load_document(self.project_id)
            if current and current[0] == self.revision and dict(current[1], revision=0) == dict(self.document, revision=0):
                self.editor_status.setText("已保存。")
                return True
            self.revision = self.store.save_document(self.project_id, self.document, expected_revision=self.revision)
            self.editor_status.setText("已保存。")
            return True
        except (OSError, RuntimeError, ValueError) as exc:
            QMessageBox.critical(self, "保存失敗", f"專案未能保存：{exc}")
            return False

    def _schedule_save(self) -> None:
        if self.document and self.project_id:
            self.editor_status.setText("內容已變更，正在保存…")
            self._autosave_timer.start()

    def _return_home(self) -> None:
        self._autosave_timer.stop()
        if not self.save_project():
            return
        self._refresh_recent()
        self.stack.setCurrentWidget(self.home_page)

    def show_revision_history(self) -> None:
        if not self.document or not self.project_id:
            return
        if not self.save_project():
            return
        revisions = self.store.list_revisions(self.project_id)
        if len(revisions) < 2:
            QMessageBox.information(self, "版本歷史", "目前只有一個版本；修改並保存後即可比較。")
            return
        dialog = QDialog(self)
        dialog.setWindowTitle("版本比較與還原")
        dialog.resize(850, 650)
        layout = QVBoxLayout(dialog)
        layout.addWidget(QLabel("選擇舊版本，比較與目前版本的逐頁差異。還原會產生新版本，不會刪除現有歷史。"))
        picker = QComboBox()
        for revision in revisions:
            if revision["revision"] < self.revision:
                picker.addItem(f"版本 {revision['revision']} · {revision['created_at']}", revision["revision"])
        layout.addWidget(picker)
        changes_list = QListWidget()
        layout.addWidget(changes_list, 1)
        comparison = QPlainTextEdit()
        comparison.setReadOnly(True)
        layout.addWidget(comparison, 2)
        def show_selection(row: int) -> None:
            if not 0 <= row < len(getattr(dialog, "_changes", [])):
                return
            change = dialog._changes[row]
            comparison.setPlainText(
                f"修改前｜{change['old_title']}\n{change['old_text']}\n圖片：{', '.join(change['old_images']) or '無'}\n\n"
                f"修改後｜{change['new_title']}\n{change['new_text']}\n圖片：{', '.join(change['new_images']) or '無'}"
            )
        def show_revision(_index: int) -> None:
            loaded = self.store.load_revision(self.project_id, picker.currentData())
            changes_list.clear()
            comparison.clear()
            dialog._changes = compare_documents(loaded[1], self.document) if loaded else []
            for change in dialog._changes:
                changes_list.addItem(f"{change['kind']} · {change['new_title'] or change['old_title']}")
            if not dialog._changes:
                comparison.setPlainText("此版本與目前投影片內容相同。")
            else:
                changes_list.setCurrentRow(0)
        picker.currentIndexChanged.connect(show_revision)
        changes_list.currentRowChanged.connect(show_selection)
        show_revision(0)
        buttons = QDialogButtonBox()
        restore = buttons.addButton("還原所選舊版本", QDialogButtonBox.ButtonRole.ActionRole)
        close = buttons.addButton("保留目前版本", QDialogButtonBox.ButtonRole.RejectRole)
        close.clicked.connect(dialog.reject)
        def restore_revision() -> None:
            answer = QMessageBox.question(
                dialog, "確認還原版本",
                f"將整份簡報還原為版本 {picker.currentData()}，並另存為新版本。確定嗎？",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.No,
            )
            if answer != QMessageBox.StandardButton.Yes:
                return
            if self.restore_project_revision(picker.currentData()):
                dialog.accept()
        restore.clicked.connect(restore_revision)
        layout.addWidget(buttons)
        dialog.exec()

    def restore_project_revision(self, target_revision: int) -> bool:
        if not self.project_id or not self.document or target_revision >= self.revision:
            return False
        loaded = self.store.load_revision(self.project_id, target_revision)
        if not loaded:
            return False
        current_revision = self.revision
        try:
            restored = deepcopy(loaded[1])
            self.revision = self.store.save_document(
                self.project_id, restored, expected_revision=current_revision,
                parent_revision=target_revision,
            )
        except (OSError, RuntimeError, ValueError) as exc:
            QMessageBox.critical(self, "還原失敗", f"目前版本未被覆寫：{exc}")
            return False
        self.document = restored
        self._show_editor()
        self.editor_status.setText(f"已由版本 {target_revision} 建立新版本 {self.revision}；舊版本仍可比較。")
        return True

    def _refresh_library_sources(self, selected_id: str | None = None) -> None:
        self.source_list.clear()
        self._library_source_ids = []
        if not self.document:
            return
        for source in self.document.get("sources", []):
            if not source.get("library_source"):
                continue
            self._library_source_ids.append(source["id"])
            self.source_list.addItem(f"{source['display_name']} · v{source['version']} · {source['role']}")
        if self._library_source_ids:
            row = self._library_source_ids.index(selected_id) if selected_id in self._library_source_ids else 0
            self.source_list.setCurrentRow(row)
        else:
            self.source_preview.setPlainText("尚無補充資料。可加入 PPTX、PDF、Word、TXT、圖片，或貼上文字。")

    def _select_library_source(self, row: int) -> None:
        if not self.document or not 0 <= row < len(getattr(self, "_library_source_ids", [])):
            return
        source_id = self._library_source_ids[row]
        source = next(item for item in self.document["sources"] if item["id"] == source_id)
        self.source_role.setCurrentText(source.get("role", "補充資料"))
        self.source_scope.setText(source.get("scope", "整份簡報"))
        self.source_preview.setPlainText(source_preview(source))

    def _recognize_library_image(self):
        row = self.source_list.currentRow()
        if not self.document or not 0 <= row < len(getattr(self, '_library_source_ids', [])):
            return
        worker = getattr(self, '_recognition_worker', None)
        if worker and worker.isRunning():
            return
        source = next(s for s in self.document['sources'] if s['id'] == self._library_source_ids[row])
        if source.get('format') not in {'png', 'jpg', 'jpeg', 'webp'}:
            QMessageBox.information(self, '請選圖片來源', '此入口目前支援圖片；掃描 PDF 尚未接入。')
            return
        python = discover_vision_python()
        if not python:
            python, _ = QFileDialog.getOpenFileName(self, '選擇本機視覺環境的 Python 執行檔')
        if not python:
            return
        model = os.environ.get('VISION_MODEL_HOME', str(Path.home() / '.cache/lm-studio/models/mlx-community/Qwen3-VL-8B-Instruct-4bit'))
        project_id = self.project_id
        worker = SourceRecognitionWorker(source, self.app_support / 'projects' / project_id, python, model, self)
        self._recognition_worker = worker
        self.recognize_source_button.setEnabled(False)
        self.editor_status.setText('正在本機辨識圖片文字；原資料與投影片不會自動更動。')
        worker.completed.connect(lambda result: self._review_source_recognition(project_id, result))
        worker.failed.connect(lambda message: QMessageBox.warning(self, '辨識未完成', message))
        worker.finished.connect(lambda: self.recognize_source_button.setEnabled(True))
        worker.start()

    def _review_source_recognition(self, project_id, candidate):
        if self.project_id != project_id or not self.document:
            return
        source = next((s for s in self.document['sources'] if s['id'] == candidate['source_id']), None)
        if source is None:
            return
        dialog = QDialog(self)
        dialog.setWindowTitle('核對辨識文字（接受後保存為資料新版本）')
        dialog.resize(680, 500)
        layout = QVBoxLayout(dialog)
        preview = QPlainTextEdit(candidate['text'])
        preview.setReadOnly(True)
        layout.addWidget(preview)
        layout.addWidget(QLabel('請核對原圖；這次辨識不包含文字座標或圖表結構。'))
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        buttons.accepted.connect(dialog.accept)
        buttons.rejected.connect(dialog.reject)
        layout.addWidget(buttons)
        if dialog.exec() != QDialog.DialogCode.Accepted:
            return
        try:
            updated = accept_recognition(source, candidate)
            index = self.document['sources'].index(source)
            self.document['sources'][index] = updated
            if not self.save_project():
                self.document['sources'][index] = source
                return
            self._refresh_library_sources(updated['id'])
            self.editor_status.setText('辨識文字已保存；可選擇內容加入頁面，投影片尚未更動。')
        except ValueError as exc:
            QMessageBox.warning(self, '辨識結果未套用', str(exc))

    def _append_library_source(self, source: dict) -> bool:
        if not self.document:
            return False
        self.document.setdefault("sources", []).append(source)
        if not self.save_project():
            self.document["sources"].remove(source)
            return False
        self._refresh_library_sources(source["id"])
        self.editor_tabs.setCurrentIndex(3)
        self.editor_status.setText(f"已保存資料「{source['display_name']}」；投影片未更動。")
        return True

    def _add_reference_file(self) -> None:
        if not self.document or not self.project_id:
            return
        paths, _ = QFileDialog.getOpenFileNames(
            self, "加入專案資料", "", "支援的資料 (*.pptx *.pdf *.docx *.txt *.png *.jpg *.jpeg *.webp)")
        for path in paths:
            try:
                source = add_file_source(path, self.app_support / "projects" / self.project_id,
                                         self.document.get("sources", []))
                if not self._append_library_source(source):
                    (self.app_support / "projects" / self.project_id / "sources" / source["managed_path"]).unlink(missing_ok=True)
            except (OSError, UnicodeError, RuntimeError, ValueError) as exc:
                QMessageBox.warning(self, "資料未加入", f"{Path(path).name}：{exc}")

    def _add_reference_text(self) -> None:
        if not self.document:
            return
        dialog = QDialog(self)
        dialog.setWindowTitle("貼上專案資料")
        dialog.resize(620, 460)
        layout = QVBoxLayout(dialog)
        name = QLineEdit("貼上的補充資料")
        layout.addWidget(QLabel("資料名稱"))
        layout.addWidget(name)
        editor = QPlainTextEdit()
        editor.setPlaceholderText("在此貼上資料；⌘V 與右鍵貼上都可使用。")
        layout.addWidget(editor, 1)
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        buttons.accepted.connect(dialog.accept)
        buttons.rejected.connect(dialog.reject)
        layout.addWidget(buttons)
        if dialog.exec() != QDialog.DialogCode.Accepted:
            return
        try:
            source = add_text_source(editor.toPlainText(), self.document.get("sources", []),
                                     name=name.text().strip() or "貼上的補充資料")
            self._append_library_source(source)
        except ValueError as exc:
            QMessageBox.warning(self, "資料未加入", str(exc))

    def _save_source_settings(self) -> None:
        row = self.source_list.currentRow()
        if not self.document or not 0 <= row < len(getattr(self, "_library_source_ids", [])):
            return
        scope = self.source_scope.text().strip()
        if not scope:
            QMessageBox.warning(self, "請指定範圍", "請填寫整份簡報、頁碼或標記區域。")
            return
        source = next(item for item in self.document["sources"] if item["id"] == self._library_source_ids[row])
        old_role, old_scope = source["role"], source["scope"]
        source["role"], source["scope"] = self.source_role.currentText(), scope
        if not self.save_project():
            source["role"], source["scope"] = old_role, old_scope
            return
        self._refresh_library_sources(source["id"])
        self.editor_status.setText("資料用途與範圍已保存；投影片未更動。")

    def _insert_selected_source_fragment(self) -> None:
        source_row, slide_row = self.source_list.currentRow(), self.slide_list.currentRow()
        if (not self.document or not 0 <= source_row < len(getattr(self, "_library_source_ids", []))
                or not 0 <= slide_row < len(self.document["slides"])):
            QMessageBox.information(self, "先選擇資料與頁面", "請選擇一份資料和一張投影片。")
            return
        source = next(item for item in self.document["sources"] if item["id"] == self._library_source_ids[source_row])
        if source.get("role") == "風格參考":
            QMessageBox.warning(self, "用途不符", "風格參考不會自動納入文字。請先改變資料用途。")
            return
        fragments = [item for item in source.get("fragments", []) if item.get("text", "").strip()]
        if not fragments:
            QMessageBox.warning(self, "沒有可加入的文字", "此資料目前沒有可擷取的文字，請檢查預覽或先進行 OCR。")
            return
        dialog = QDialog(self)
        dialog.setWindowTitle("確認要加入的來源內容")
        dialog.resize(700, 560)
        layout = QVBoxLayout(dialog)
        layout.addWidget(QLabel(f"資料：{source['display_name']} v{source['version']}｜目標：第 {slide_row + 1} 頁。確認前不修改投影片。"))
        choices = QComboBox()
        for fragment in fragments:
            choices.addItem(f"第 {fragment['page']} 頁｜{fragment.get('title', '')}", fragment["id"])
        layout.addWidget(choices)
        preview = QPlainTextEdit()
        preview.setReadOnly(True)
        layout.addWidget(preview, 1)
        def refresh_preview(index):
            preview.setPlainText(fragments[index]["text"] if index >= 0 else "")
        choices.currentIndexChanged.connect(refresh_preview)
        refresh_preview(0)
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        buttons.accepted.connect(dialog.accept)
        buttons.rejected.connect(dialog.reject)
        layout.addWidget(buttons)
        if dialog.exec() != QDialog.DialogCode.Accepted:
            return
        slide = self.document["slides"][slide_row]
        original_slide = deepcopy(slide)
        try:
            element = append_fragment_to_slide(slide, source, choices.currentData())
        except ValueError as exc:
            QMessageBox.warning(self, "無法加入", str(exc))
            return
        if slide.get("auto_layout"):
            auto_design_slide(slide, slide_row)
        if not self.save_project():
            self.document["slides"][slide_row] = original_slide
            return
        self._refresh_slide_canvas(slide_row)
        self.editor_status.setText(f"已將「{source['display_name']}」第 {element['source_ref']['page']} 頁內容加入第 {slide_row + 1} 頁，並保存來源關聯。")

    def export_project(self) -> None:
        if not self.document:
            return
        mode = self.output_mode_choice.currentText()
        suffix = "圖像式" if mode == "圖像式 PPTX" else "可編輯式"
        path, _ = QFileDialog.getSaveFileName(self, f"匯出{mode}", f"{self.document['title']}_{suffix}.pptx", "PowerPoint (*.pptx)")
        if not path:
            return
        try:
            self.document.setdefault("settings", {})["output_format"] = mode
            if not self.save_project():
                return
            overflowing = []
            for index, slide in enumerate(self.document["slides"]):
                for element in slide.get("elements", []):
                    if element.get("type", "text") != "text":
                        continue
                    rect = tuple(float(element.get(key, default)) for key, default in
                                 (("x", .08), ("y", .24), ("width", .84), ("height", .58)))
                    if not fit_body_font(element.get("text", ""), rect, cover=index == 0)[1]:
                        overflowing.append(index + 1)
                        break
            if overflowing:
                shown = "、".join(str(page) for page in overflowing[:8])
                if len(overflowing) > 8:
                    shown += "…"
                answer = QMessageBox.question(
                    self, "文字可能超出頁面",
                    f"第 {shown} 頁文字可能放不下。建議先換排版或精簡文字；仍要匯出嗎？",
                    QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                    QMessageBox.StandardButton.No,
                )
                if answer != QMessageBox.StandardButton.Yes:
                    return
            assets = self.app_support / "projects" / self.project_id / "assets"
            if mode == "圖像式 PPTX":
                from .raster_export import export_project_image_pptx
                export_project_image_pptx(path, self.document, asset_root=assets)
            else:
                export_project_pptx(path, self.document, self.document.get("settings", {}).get("style", "清爽藍"), asset_root=assets)
        except (OSError, ValueError, RuntimeError) as exc:
            QMessageBox.critical(self, "匯出失敗", f"PPTX 未能匯出：{exc}")
            return
        self.editor_status.setText(f"已匯出{mode}：{path}")
        QMessageBox.information(self, "完成", f"已匯出 {len(self.document['slides'])} 頁（{mode}）。\n\n{path}")

    def _import_source(self) -> None:
        path, _ = QFileDialog.getOpenFileName(self, "選擇簡報或文字文件", "", "支援的文件 (*.pptx *.pdf *.docx *.txt)")
        if not path:
            return
        try:
            project_id = str(uuid4())
            asset_dir = self.app_support / "projects" / project_id / "assets"
            slides, source = import_source(path, asset_dir=asset_dir)
            document = new_project_document(Path(path).stem)
            document["project_id"] = project_id
            document["slides"] = slides
            document["sources"] = [source]
            document["outline"] = [
                {"id": str(uuid4()), "slide_id": slide["id"], "title": slide["title"]}
                for slide in slides
            ]
            document["settings"] = {"style": "清爽藍", "output_format": "可編輯式 PPTX"}
            for index, slide in enumerate(slides):
                slide["source_id"] = source["id"]
                if source.get("format") in {"txt", "docx", "pdf"}:
                    auto_design_slide(slide, index)
            self.store.create(str(Path(path).resolve()), project_id=project_id)
            self.revision = self.store.save_document(project_id, document, expected_revision=0)
            self.project_id, self.document = project_id, document
            self._show_editor()
            warnings = source.get("warnings", [])
            if warnings:
                QMessageBox.information(self, "匯入提醒", "已匯入來源；請檢查以下內容是否完整：\n\n" + "\n".join(warnings))
        except (OSError, UnicodeError, RuntimeError, ValueError) as exc:
            QMessageBox.critical(self, "匯入失敗", f"來源未能匯入：{exc}")

    def _refresh_recent(self) -> None:
        self.recent_list.clear()
        self._recent_ids = []
        for row in self.store.list_projects()[:12]:
            loaded = self.store.load_document(row["id"])
            if not loaded:
                continue
            _revision, document = loaded
            self.recent_list.addItem(f"{document.get('title', '未命名')}　·　{len(document.get('slides', []))} 頁")
            self._recent_ids.append(row["id"])

    def _open_recent(self, item) -> None:
        row = self.recent_list.row(item)
        if not 0 <= row < len(self._recent_ids):
            return
        loaded = self.store.load_document(self._recent_ids[row])
        if loaded:
            self.revision, self.document = loaded
            self.project_id = self._recent_ids[row]
            self._show_editor()

    def closeEvent(self, event) -> None:
        workers = [worker for worker in (self._plan_worker, self._image_worker, self._edit_worker, getattr(self, '_recognition_worker', None)) if worker and worker.isRunning()]
        for worker in workers:
            worker.cancel()
        if any(not worker.wait(15_000) for worker in workers):
            if hasattr(self, "parse_status"):
                self.parse_status.setText("正在停止本機模型；請稍候再關閉視窗。")
            event.ignore()
            return
        event.accept()


def main() -> None:
    app = QApplication.instance() or QApplication(sys.argv)
    window = PresentationStudio()
    window.show()
    app.exec()
