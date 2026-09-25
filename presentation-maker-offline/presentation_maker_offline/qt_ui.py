from __future__ import annotations

import sys
import threading
from pathlib import Path
from uuid import uuid4

from PySide6.QtCore import QThread, QTimer, Qt, Signal
from PySide6.QtGui import QAction, QBrush, QColor, QFont, QKeySequence, QPainter, QPen
from PySide6.QtWidgets import (
    QApplication, QComboBox, QDialog, QDialogButtonBox, QFileDialog, QFrame,
    QGraphicsScene, QGraphicsTextItem, QGraphicsView, QHBoxLayout, QLabel,
    QLineEdit, QListWidget, QMainWindow, QMessageBox, QPushButton,
    QPlainTextEdit, QStackedWidget, QVBoxLayout, QWidget,
)

from .backends import LocalQwenTextBackend
from .export import THEMES, export_project_pptx
from .manifest import CheckpointManifest
from .project_document import new_project_document, update_slide_text_element
from .source_import import import_source, parse_outline_text
from .storage import discover_qwen38_mlx
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


class SlidePreview(QGraphicsView):
    """16:9 live slide canvas matching the visual hierarchy of PPTX export."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.scene = QGraphicsScene(self)
        self.scene.setSceneRect(0, 0, 1280, 720)
        self.setScene(self.scene)
        self.setRenderHint(QPainter.RenderHint.Antialiasing)
        self.setBackgroundBrush(QColor("#e7ebf0"))
        self.setFrameShape(QFrame.Shape.NoFrame)
        self._slide = None

    def set_slide(self, title: str, body: str, number: int, total: int, theme_name: str, *, cover: bool = False):
        self._slide = (title, body, number, total, theme_name, cover)
        self._draw_slide()

    def _draw_slide(self):
        if not self._slide:
            return
        title, body, number, total, theme_name, cover = self._slide
        theme = THEMES.get(theme_name, THEMES["清爽藍"])
        self.scene.clear()
        self.scene.addRect(0, 0, 1280, 720, QPen(Qt.PenStyle.NoPen), QBrush(QColor("#" + theme["paper"])))
        self.scene.addRect(0, 0, 12, 720, QPen(Qt.PenStyle.NoPen), QBrush(QColor("#" + theme["accent"])))
        title_item = self.scene.addText(title, QFont("Arial", 43 if cover else 31, QFont.Weight.Bold))
        title_item.setDefaultTextColor(QColor("#" + theme["accent"]))
        title_item.setTextWidth(1120)
        title_item.setPos(92, 160 if cover else 50)
        if not cover:
            self.scene.addRect(80, 146, 1120, 3, QPen(Qt.PenStyle.NoPen), QBrush(QColor("#" + theme["rule"])))
        content = self.scene.addText(body, QFont("Arial", 24 if cover else 20))
        content.setDefaultTextColor(QColor("#" + theme["text"]))
        content.setTextWidth(1080)
        content.setPos(96, 390 if cover else 186)
        footer = self.scene.addText(f"{theme_name}　·　{number:02d} / {total:02d}", QFont("Arial", 12))
        footer.setDefaultTextColor(QColor("#" + theme["muted"]))
        footer.setPos(930, 670)
        self.fitInView(self.scene.sceneRect(), Qt.AspectRatioMode.KeepAspectRatio)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.fitInView(self.scene.sceneRect(), Qt.AspectRatioMode.KeepAspectRatio)


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
        self.recent_list.itemDoubleClicked.connect(self._open_recent)
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
            subtitle="先保留原文與頁數。風格與名稱之後仍可修改；目前提供可編輯式 PowerPoint 匯出。",
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
        self.style_choice.addItems(["清爽藍", "雜誌編輯", "自然療癒", "高科技"])
        form.addWidget(self.style_choice)
        form.addWidget(QLabel("內容原則：忠實保留貼入內容。AI 大綱擴寫與圖像式簡報尚未通過驗收，不會顯示成可用選項。"))
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
        self.export_button = self._button("匯出 PowerPoint…", primary=True)
        self.save_button.clicked.connect(self.save_project)
        self.export_button.clicked.connect(self.export_project)
        header.addWidget(home)
        header.addWidget(self.editor_title, 1)
        header.addWidget(self.save_button)
        header.addWidget(self.export_button)
        layout.addLayout(header)
        columns = QHBoxLayout()
        self.slide_list = QListWidget()
        self.slide_list.currentRowChanged.connect(self._select_slide)
        columns.addWidget(self.slide_list, 1)
        self.slide_canvas = SlidePreview()
        self.slide_canvas.setMinimumSize(480, 300)
        columns.addWidget(self.slide_canvas, 3)
        editor = QVBoxLayout()
        editor.addWidget(QLabel("頁面標題"))
        self.slide_heading = QLineEdit()
        editor.addWidget(self.slide_heading)
        editor.addWidget(QLabel("頁面內容"))
        self.slide_text = QPlainTextEdit()
        editor.addWidget(self.slide_text, 1)
        self.apply_slide_button = self._button("套用到這一頁")
        self.apply_slide_button.clicked.connect(self._apply_slide_text)
        editor.addWidget(self.apply_slide_button)
        columns.addLayout(editor, 2)
        layout.addLayout(columns, 1)
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
        document["settings"] = {"style": self.style_choice.currentText(), "output_format": "可編輯式 PPTX"}
        for slide in document["slides"]:
            slide["source_id"] = self.parsed["source"]["id"]
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
        self.slide_list.clear()
        for index, slide in enumerate(self.document.get("slides", []), 1):
            self.slide_list.addItem(f"{index:02d}　{slide['title']}")
        self.stack.setCurrentWidget(self.editor_page)
        if self.slide_list.count():
            self.slide_list.setCurrentRow(0)

    def _select_slide(self, row: int) -> None:
        if not self.document or not 0 <= row < len(self.document.get("slides", [])):
            return
        slide = self.document["slides"][row]
        self.slide_heading.setText(slide.get("title", ""))
        text_elements = [element for element in slide.get("elements", []) if element.get("type", "text") == "text"]
        self._text_element_id = text_elements[0]["id"] if text_elements else None
        self.slide_text.setPlainText(text_elements[0].get("text", "") if text_elements else "")
        self._refresh_slide_canvas(row)

    def _apply_slide_text(self) -> None:
        row = self.slide_list.currentRow()
        if not self.document or not 0 <= row < len(self.document["slides"]):
            return
        slide = self.document["slides"][row]
        slide["title"] = self.slide_heading.text().strip()
        text = self.slide_text.toPlainText().strip()
        if text:
            self._text_element_id = update_slide_text_element(slide, text, self._text_element_id)
        elif self._text_element_id:
            slide["elements"] = [element for element in slide.get("elements", []) if element.get("id") != self._text_element_id]
            self._text_element_id = None
        self.slide_list.item(row).setText(f"{row + 1:02d}　{slide['title']}")
        self._refresh_slide_canvas(row)
        self.save_project()

    def _refresh_slide_canvas(self, row: int) -> None:
        if not self.document or not 0 <= row < len(self.document["slides"]):
            return
        slide = self.document["slides"][row]
        texts = [element.get("text", "") for element in slide.get("elements", []) if element.get("type", "text") == "text"]
        body = "\n".join(texts)
        self.slide_canvas.set_slide(
            slide.get("title", ""), body, row + 1, len(self.document["slides"]),
            self.document.get("settings", {}).get("style", "清爽藍"), cover=row == 0,
        )

    def save_project(self) -> None:
        if not self.document or not self.project_id:
            return
        self.document["title"] = self.editor_title.text().strip() or self.document["title"]
        try:
            self.revision = self.store.save_document(self.project_id, self.document, expected_revision=self.revision)
            self.editor_status.setText("已保存。")
        except (OSError, RuntimeError, ValueError) as exc:
            QMessageBox.critical(self, "保存失敗", f"專案未能保存：{exc}")

    def _schedule_save(self) -> None:
        if self.document and self.project_id:
            self.editor_status.setText("內容已變更，正在保存…")
            self._autosave_timer.start()

    def _return_home(self) -> None:
        self._autosave_timer.stop()
        self.save_project()
        self._refresh_recent()
        self.stack.setCurrentWidget(self.home_page)

    def export_project(self) -> None:
        if not self.document:
            return
        path, _ = QFileDialog.getSaveFileName(self, "匯出可編輯 PowerPoint", f"{self.document['title']}.pptx", "PowerPoint (*.pptx)")
        if not path:
            return
        try:
            self.save_project()
            assets = self.app_support / "projects" / self.project_id / "assets"
            export_project_pptx(path, self.document, self.document.get("settings", {}).get("style", "清爽藍"), asset_root=assets)
        except (OSError, ValueError, RuntimeError) as exc:
            QMessageBox.critical(self, "匯出失敗", f"PPTX 未能匯出：{exc}")
            return
        self.editor_status.setText(f"已匯出可編輯 PowerPoint：{path}")
        QMessageBox.information(self, "完成", f"已匯出 {len(self.document['slides'])} 頁。\n\n{path}")

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
            for slide in slides:
                slide["source_id"] = source["id"]
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
        worker = self._plan_worker
        if worker and worker.isRunning():
            worker.cancel()
            if not worker.wait(15_000):
                self.parse_status.setText("正在停止本機模型；請稍候再關閉視窗。")
                event.ignore()
                return
        event.accept()


def main() -> None:
    app = QApplication.instance() or QApplication(sys.argv)
    window = PresentationStudio()
    window.show()
    app.exec()
