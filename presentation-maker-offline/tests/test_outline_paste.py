import pytest
import tkinter as tk
from pathlib import Path

from presentation_maker_offline.export import export_project_pptx
from presentation_maker_offline.project_document import new_project_document
from presentation_maker_offline.source_import import parse_outline_text
from presentation_maker_offline.workflow import ProjectStore


def test_parse_markdown_outline_into_slides_with_traceable_source():
    title, slides, source = parse_outline_text(
        "# AI 導入策略\n"
        "簡報目的：說明導入步驟\n"
        "## 現況與挑戰\n"
        "- 資料分散\n"
        "- 流程耗時\n"
        "### 補充觀察\n"
        "跨部門資訊不同步\n"
        "## 推動計畫\n"
        "1. 先盤點需求\n"
        "2. 小規模試行\n"
    )

    assert title == "AI 導入策略"
    assert [slide["title"] for slide in slides] == ["現況與挑戰", "推動計畫"]
    assert "簡報目的：說明導入步驟" in slides[0]["elements"][0]["text"]
    assert "• 資料分散" in slides[0]["elements"][0]["text"]
    assert "補充觀察" in slides[0]["elements"][0]["text"]
    assert "• 先盤點需求" in slides[1]["elements"][0]["text"]
    assert source["origin"] == "pasted_text"
    assert len(source["content_sha256"]) == 64


def test_parse_plain_text_outline_by_blank_lines_and_numbered_pages():
    _, plain_slides, _ = parse_outline_text("市場背景\n• 使用者增加\n\n解決方案\n• 建立入口")
    assert [slide["title"] for slide in plain_slides] == ["市場背景", "解決方案"]
    assert plain_slides[1]["elements"][0]["text"] == "• 建立入口"

    _, numbered_slides, _ = parse_outline_text("第 1 頁：市場背景\n需求成長\n第 2 頁：解決方案\n導入流程")
    assert [slide["title"] for slide in numbered_slides] == ["市場背景", "解決方案"]
    assert numbered_slides[0]["elements"][0]["text"] == "需求成長"


def test_pasted_outline_persists_and_exports_as_editable_pptx(tmp_path):
    title, slides, source = parse_outline_text("## 開場\n- 重點一\n## 結論\n- 重點二")
    document = new_project_document(title)
    document["slides"] = slides
    document["sources"] = [source]
    document["outline"] = [{"id": f"outline-{i}", "slide_id": slide["id"], "title": slide["title"]} for i, slide in enumerate(slides)]
    for slide in slides:
        slide["source_id"] = source["id"]
    document["project_id"] = "pasted-outline-project"

    store = ProjectStore(tmp_path / "projects.sqlite3")
    store.create(source["path"], project_id=document["project_id"])
    store.save_document(document["project_id"], document, expected_revision=0)
    loaded = store.load_document(document["project_id"])[1]
    assert loaded["slides"][0]["elements"][0]["text"] == "• 重點一"
    assert loaded["sources"][0]["origin"] == "pasted_text"

    output = export_project_pptx(tmp_path / "outline.pptx", loaded)
    assert output.is_file()


def test_outline_paste_dialog_pastes_previews_and_creates_project(tmp_path, monkeypatch):
    from presentation_maker_offline.ui import PresentationMakerApp

    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    try:
        app = PresentationMakerApp()
    except tk.TclError as exc:
        pytest.skip(f"Tk display is unavailable: {exc}")

    try:
        app.update()
        app.paste_outline()
        app.update()
        dialog = next(widget for widget in app.winfo_children() if widget.winfo_class() == "Toplevel")
        assert dialog.winfo_viewable()
        assert app.grab_current() is None

        def descendants(widget):
            return [widget, *(child for item in widget.winfo_children() for child in descendants(item))]

        widgets = descendants(dialog)
        outline_input = next(widget for widget in widgets if widget.winfo_class() == "Text")
        outline_input.focus_set()
        dialog.clipboard_get = lambda: "# UI 貼上驗收\n## 第一頁\n- 重點甲\n## 第二頁\n- 重點乙"
        buttons = {widget.cget("text"): widget for widget in widgets if widget.winfo_class() == "TButton"}

        buttons["從剪貼簿貼上"].invoke()
        app.update()
        assert "## 第一頁" in outline_input.get("1.0", "end")

        buttons["預覽大綱"].invoke()
        app.update()
        preview = next(widget for widget in widgets if widget.winfo_class() == "Listbox")
        assert preview.get(0, "end") == ("01　第一頁", "02　第二頁")

        buttons["建立專案"].invoke()
        assert app.document["title"] == "UI 貼上驗收"
        assert len(app.document["slides"]) == 2
        assert len(app.project_store.list_projects()) == 1
    finally:
        app.destroy()


@pytest.mark.parametrize("text", ["", "   \n  "])
def test_parse_rejects_empty_outline(text):
    with pytest.raises(ValueError, match="貼上簡報大綱"):
        parse_outline_text(text)
