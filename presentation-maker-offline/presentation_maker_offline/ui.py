from __future__ import annotations

import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk
from uuid import uuid4

from .backends import LocalQwenTextBackend
from .export import export_project_pptx
from .manifest import CheckpointManifest
from .project_document import new_project_document, update_slide_text_element
from .source_import import import_source, parse_outline_text
from .storage import discover_qwen38_mlx, qwen_image21_readiness
from .workflow import ProjectStore


STYLE_PALETTES = {
    "清爽藍": {"paper": "#F8FAFC", "accent": "#2563EB", "text": "#334155", "rule": "#BFDBFE"},
    "雜誌編輯": {"paper": "#FFF9F2", "accent": "#B45309", "text": "#44403C", "rule": "#F3D7B5"},
    "自然療癒": {"paper": "#F2F8F1", "accent": "#2F7658", "text": "#34483C", "rule": "#C8DDCB"},
    "高科技": {"paper": "#111827", "accent": "#38BDF8", "text": "#E2E8F0", "rule": "#334155"},
}


class PresentationMakerApp(tk.Tk):
    """Offline outline-to-editable-PPTX app with an explicit project workflow."""

    def __init__(self):
        super().__init__()
        self.title("離線簡報工作室")
        self.geometry("1280x820")
        self.minsize(900, 620)
        self.source_path: str | None = None
        self.current_project_id: str | None = None
        self.document: dict | None = None
        self.revision = 0
        self._next_parent_revision: int | None = None
        self.candidate: dict | None = None
        self.mark_start: tuple[int, int] | None = None
        self.mark_rect: int | None = None
        self.title_text = tk.StringVar(value="")
        self.style = tk.StringVar(value="清爽藍")
        self.output = tk.StringVar(value="可編輯式 PPTX")
        self.operation = tk.StringVar(value="保留內容")
        self.image_strategy = tk.StringVar(value="沿用原圖")
        self.intervention = tk.StringVar(value="協助潤飾")
        self.target_pages = tk.IntVar(value=8)
        self.status_text = tk.StringVar(value="從大綱建立可編輯簡報；目前不含 AI 生成。")
        self._init_store()
        self._build()

    def _init_store(self):
        self.app_support = Path.home() / "Library" / "Application Support" / "PresentationMaker"
        self.app_support.mkdir(parents=True, exist_ok=True)
        self.project_store = ProjectStore(self.app_support / "projects.sqlite3")

    def _build(self):
        self.configure(bg="#f4f6f8")
        header = ttk.Frame(self, padding=(18, 12))
        header.pack(fill="x")
        ttk.Label(header, text="離線簡報工作室", font=("Arial", 20, "bold")).pack(side="left")
        ttk.Label(header, text="離線編輯 · 匯出可編輯 PPTX", foreground="#475569").pack(side="left", padx=18)
        ttk.Button(header, text="狀態與資料位置", command=self.show_settings).pack(side="right")
        self.home_button = ttk.Button(header, text="首頁", command=self.show_home)
        self.home_button.pack(side="right", padx=8)
        ttk.Button(header, text="開啟專案", command=self.open_project).pack(side="right", padx=8)

        self.home_frame = ttk.Frame(self, padding=(48, 34))
        self.editor_frame = ttk.Frame(self, padding=(10, 4))
        self.home_frame.pack(fill="both", expand=True)
        self._build_home()

        shell = ttk.Panedwindow(self.editor_frame, orient="horizontal")
        shell.pack(fill="both", expand=True, padx=4, pady=(0, 8))
        left = ttk.Frame(shell, padding=10, width=205)
        center = ttk.Frame(shell, padding=10)
        right = ttk.Frame(shell, padding=10, width=310)
        shell.add(left, weight=1); shell.add(center, weight=5); shell.add(right, weight=2)

        ttk.Label(left, text="目前簡報", font=("Arial", 13, "bold")).pack(anchor="w")
        ttk.Label(left, text="直接編輯大綱內容並匯出。AI 擴寫、圖片生成及對話修改尚未提供。", wraplength=205, foreground="#475569").pack(anchor="w", pady=(6, 10))
        ttk.Label(left, text="簡報名稱").pack(anchor="w", pady=(4, 2))
        ttk.Entry(left, textvariable=self.title_text).pack(fill="x")
        ttk.Label(left, text="操作方式與 AI 介入程度尚未提供").pack(anchor="w", pady=(10, 2))
        ttk.Label(left, text="目前匯出：可編輯式 PPTX", foreground="#475569").pack(anchor="w", pady=(8, 2))
        ttk.Separator(left).pack(fill="x", pady=12)
        ttk.Label(left, text="投影片", font=("Arial", 13, "bold")).pack(anchor="w")
        self.slide_list = tk.Listbox(left, activestyle="none", height=14, exportselection=False)
        self.slide_list.pack(fill="both", expand=True, pady=8)
        self.slide_list.bind("<<ListboxSelect>>", self._select_slide)
        ttk.Button(left, text="＋ 新增頁面", command=self.add_slide).pack(fill="x")
        self.annotation_list = tk.Listbox(left, activestyle="none", height=7, exportselection=False)
        self.annotation_list.pack(fill="x", pady=(14, 6))
        self.annotation_list.bind("<<ListboxSelect>>", self._select_annotation)
        ttk.Label(left, text="區域標記", font=("Arial", 11, "bold")).pack(anchor="w")

        toolbar = ttk.Frame(center)
        toolbar.pack(fill="x", pady=(0, 8))
        ttk.Label(toolbar, text="預覽投影片 · 拖曳可標記待修改區域（備註僅保存，尚未執行 AI 修改）").pack(side="left")
        self.canvas = tk.Canvas(center, bg="#dce2e8", highlightthickness=0, cursor="crosshair")
        self.canvas.pack(fill="both", expand=True)
        self.canvas.bind("<Configure>", lambda _event: self.draw_slide())
        self.canvas.bind("<ButtonPress-1>", self._mark_begin)
        self.canvas.bind("<B1-Motion>", self._mark_drag)
        self.canvas.bind("<ButtonRelease-1>", self._mark_end)
        self.slide_status = tk.StringVar(value="尚未建立專案")
        ttk.Label(center, textvariable=self.slide_status).pack(anchor="w", pady=(7, 0))

        tabs = ttk.Notebook(right)
        tabs.pack(fill="both", expand=True)
        edit_tab = ttk.Frame(tabs, padding=10)
        data_tab = ttk.Frame(tabs, padding=10)
        tabs.add(edit_tab, text="內容／版面")
        tabs.add(data_tab, text="專案資料")

        ttk.Label(edit_tab, text="頁面標題").pack(anchor="w")
        self.slide_title = tk.StringVar()
        title_entry = ttk.Entry(edit_tab, textvariable=self.slide_title)
        title_entry.pack(fill="x", pady=(4, 4))
        title_entry.bind("<FocusOut>", lambda _event: self.edit_slide_title())
        ttk.Label(edit_tab, text="頁面文字物件（選取後編輯）").pack(anchor="w", pady=(8, 2))
        self.text_element_list = tk.Listbox(edit_tab, height=3, activestyle="none", exportselection=False)
        self.text_element_list.pack(fill="x")
        self.text_element_list.bind("<<ListboxSelect>>", self._select_text_element)
        self.slide_body = tk.Text(edit_tab, height=5, wrap="word", undo=True)
        self.slide_body.pack(fill="x", pady=(4, 2))
        ttk.Button(edit_tab, text="保存頁面文字（未選物件則新增）", command=self.save_slide_text).pack(fill="x")
        ttk.Label(edit_tab, text="風格預覽（選擇套用）").pack(anchor="w", pady=(10, 3))
        self.style_picker = ttk.Frame(edit_tab)
        self.style_picker.pack(fill="x", pady=(4, 0))
        self.style_card_canvases = {}
        for index, name in enumerate(STYLE_PALETTES):
            card = ttk.Frame(self.style_picker, padding=3, relief="solid")
            card.grid(row=index // 2, column=index % 2, sticky="nsew", padx=2, pady=2)
            sample = tk.Canvas(card, height=54, bg=STYLE_PALETTES[name]["paper"], highlightthickness=0, cursor="hand2")
            sample.pack(fill="x")
            sample.bind("<Configure>", lambda event, style_name=name: self._draw_style_card(style_name, event.width, event.height))
            sample.bind("<Button-1>", lambda _event, style_name=name: self._choose_style(style_name))
            ttk.Radiobutton(card, text=name, variable=self.style, value=name, command=self._style_changed).pack(anchor="w")
            card.bind("<Button-1>", lambda _event, style_name=name: self._choose_style(style_name))
            self.style_card_canvases[name] = sample
        self.style_picker.columnconfigure(0, weight=1)
        self.style_picker.columnconfigure(1, weight=1)
        self._refresh_style_cards()
        ttk.Label(edit_tab, text="區域備註（只保存，不會自動修改投影片）").pack(anchor="w", pady=(12, 4))
        self.annotation_note = tk.Text(edit_tab, height=5, wrap="word")
        self.annotation_note.pack(fill="x")
        ttk.Button(edit_tab, text="保存區域備註", command=self.save_annotation_note).pack(fill="x", pady=5)
        ttk.Button(edit_tab, text="復原上一項", command=self.undo).pack(fill="x", pady=(12, 0))

        ttk.Label(data_tab, text="此區目前只在本機解析與保存來源，不會將資料套用至 AI 生成。", wraplength=260, foreground="#9a5b00").pack(anchor="w", pady=(0, 8))
        ttk.Button(data_tab, text="加入並保存來源資料…", command=self.add_source).pack(fill="x")
        self.source_role = tk.StringVar(value="補充資料")
        ttk.Label(data_tab, text="資料用途").pack(anchor="w", pady=(10, 3))
        ttk.Combobox(data_tab, textvariable=self.source_role, values=["補充資料", "主要內容", "修改依據", "風格參考"], state="readonly").pack(fill="x")
        self.source_scope = tk.StringVar(value="整份簡報")
        ttk.Label(data_tab, text="套用範圍").pack(anchor="w", pady=(8, 3))
        ttk.Combobox(data_tab, textvariable=self.source_scope, values=["整份簡報", "目前頁面", "目前標記"], state="readonly").pack(fill="x")
        self.source_list = tk.Listbox(data_tab, height=10, activestyle="none")
        self.source_list.pack(fill="both", expand=True, pady=8)
        self.source_list.bind("<<ListboxSelect>>", self._preview_source)
        self.source_preview = tk.Text(data_tab, height=7, wrap="word", state="disabled")
        self.source_preview.pack(fill="x", pady=(2, 8))
        ttk.Label(data_tab, text="PPTX 文字與圖片素材可保存；DOCX／PDF／TXT 目前以文字為主。", wraplength=260).pack(anchor="w")

        footer = ttk.Frame(self, padding=(14, 4, 14, 12))
        self.footer = footer
        ttk.Label(footer, textvariable=self.status_text).pack(side="left", fill="x", expand=True)
        ttk.Button(footer, text="匯出可編輯 PPTX…", command=self.export).pack(side="right")

    def _build_home(self):
        ttk.Label(self.home_frame, text="建立一份簡報", font=("Arial", 28, "bold")).pack(anchor="w", pady=(12, 4))
        ttk.Label(self.home_frame, text="貼上已有大綱，檢查辨識出的投影片，再匯出可編輯的 PowerPoint。內容只在這台電腦處理。", wraplength=720, font=("Arial", 13), foreground="#475569").pack(anchor="w", pady=(0, 24))
        actions = ttk.Frame(self.home_frame)
        actions.pack(anchor="w", pady=(0, 28))
        ttk.Button(actions, text="貼上簡報大綱…", command=self.paste_outline).pack(side="left", ipadx=18, ipady=10, padx=(0, 12))
        ttk.Button(actions, text="匯入 PPTX／文件…", command=self.pick_primary).pack(side="left", ipadx=12, ipady=10)
        ttk.Label(self.home_frame, text="最近專案", font=("Arial", 16, "bold")).pack(anchor="w", pady=(8, 8))
        self.recent_list = tk.Listbox(self.home_frame, height=9, activestyle="none", exportselection=False)
        self.recent_list.pack(fill="both", expand=True)
        self.recent_list.bind("<Double-Button-1>", self._open_recent_project)
        ttk.Label(self.home_frame, text="雙擊專案即可繼續編輯。新專案會自動保存在本機。", foreground="#64748b").pack(anchor="w", pady=(8, 0))
        self._refresh_recent_projects()

    def _refresh_recent_projects(self):
        if not hasattr(self, "recent_list"):
            return
        self.recent_list.delete(0, "end")
        self._recent_project_ids = []
        for row in self.project_store.list_projects()[:12]:
            project_id = row["id"]
            loaded = self.project_store.load_document(project_id)
            title = loaded[1].get("title", "未命名簡報") if loaded else "無法讀取的專案"
            slide_count = len(loaded[1].get("slides", [])) if loaded else 0
            self.recent_list.insert("end", f"{title}　·　{slide_count} 頁")
            self._recent_project_ids.append(project_id)

    def _open_recent_project(self, _event=None):
        selection = self.recent_list.curselection()
        if not selection:
            return
        project_id = self._recent_project_ids[selection[0]]
        loaded = self.project_store.load_document(project_id)
        if not loaded:
            messagebox.showwarning("無法開啟專案", "此專案沒有可讀取的內容。")
            return
        self.revision, self.document = loaded
        self.current_project_id = project_id
        self._restore_controls()
        self._show_editor()
        self._refresh()
        self.status_text.set("已開啟本機專案。")

    def _show_editor(self):
        self.home_frame.pack_forget()
        self.editor_frame.pack(fill="both", expand=True)
        self.footer.pack(fill="x")

    def show_home(self):
        self.editor_frame.pack_forget()
        self.footer.pack_forget()
        self.home_frame.pack(fill="both", expand=True)
        self._refresh_recent_projects()

    def _sample(self):
        document = new_project_document(self.title_text.get().strip() or "我的離線簡報")
        headings = [document["title"], "核心訊息與聽眾", "內容架構與重點"]
        document["slides"] = [{"id": str(uuid4()), "order": i, "title": name, "elements": []} for i, name in enumerate(headings)]
        document["sources"] = []
        return document

    def new_sample(self):
        self.source_path = None
        if not self.title_text.get().strip():
            self.title_text.set("我的離線簡報")
        self.start()

    def pick_primary(self):
        path = filedialog.askopenfilename(filetypes=[("簡報、文件與圖片", "*.pptx *.pdf *.docx *.txt *.png *.jpg *.jpeg *.webp"), ("所有檔案", "*")])
        if not path:
            return
        self.source_path = path
        if not self.title_text.get().strip():
            self.title_text.set(Path(path).stem)
        self.start()

    def start(self):
        document = self._sample()
        document["settings"] = {
            "operation": self.operation.get(),
            "image_strategy": self.image_strategy.get(),
            "style": self.style.get(),
            "output_format": self.output.get(),
            "target_pages": max(1, min(100, self.target_pages.get())),
            "intervention": self.intervention.get(),
        }
        project_id = str(uuid4())
        was_imported = bool(self.source_path)
        asset_dir = self.app_support / "projects" / project_id / "assets"
        if self.source_path:
            try:
                imported_slides, source_record = import_source(self.source_path, asset_dir=asset_dir)
            except (OSError, ValueError, RuntimeError) as exc:
                messagebox.showerror("無法匯入來源", str(exc))
                self.status_text.set(f"匯入失敗：{exc}")
                return
            document["title"] = self.title_text.get().strip() or Path(self.source_path).stem
            document["slides"] = imported_slides
            for slide in imported_slides:
                slide["source_id"] = source_record["id"]
            document["sources"] = [source_record]
        warnings = document["sources"][0].get("warnings", []) if document.get("sources") else []
        self._save_new_project(document, self.source_path or "example://interaction-prototype", project_id=project_id)
        if warnings:
            self.status_text.set(f"已匯入，但有解析提醒：{warnings[0]}")
        elif was_imported:
            self.status_text.set("本機來源內容已匯入；PPTX 文字／圖片可編輯與匯出，複雜圖層樣式仍有差異。")
        else:
            self.status_text.set("示例專案已保存；此為 UI 模擬，不是模型生成或推論進度。")

    def _save_new_project(self, document: dict, source_reference: str, *, project_id: str | None = None) -> None:
        project_id = project_id or str(uuid4())
        document["project_id"] = project_id
        for slide in document.get("slides", []):
            slide.setdefault("source_id", document.get("sources", [{}])[0].get("id") if document.get("sources") else None)
        self.project_store.create(source_reference, project_id=project_id)
        self.project_store.save_document(project_id, document, expected_revision=0)
        self.current_project_id, self.document, self.revision = project_id, document, 1
        self.source_path = None
        self._show_editor()
        self._refresh()
        self._refresh_recent_projects()

    def paste_outline(self):
        dialog = tk.Toplevel(self)
        dialog.title("步驟 1／2：貼上簡報大綱")
        dialog.geometry("760x680")
        dialog.minsize(620, 520)

        ttk.Label(
            dialog,
            text="把大綱貼在下方，確認辨識頁數和標題後即可建立並匯出。每頁可用「## 標題」開頭或空行分隔。這裡只會依原文排版，不會呼叫 AI 擴寫或生成圖片。支援 ⌘V、右鍵貼上及下方貼上按鈕。",
            wraplength=710,
        ).pack(anchor="w", padx=16, pady=(16, 8))
        outline_input = tk.Text(dialog, height=18, wrap="word", undo=True)
        outline_input.pack(fill="both", expand=True, padx=16, pady=(0, 10))
        preview_label = tk.StringVar(value="貼上內容後會自動預覽頁數；確認後即可建立專案。")
        ttk.Label(dialog, textvariable=preview_label).pack(anchor="w", padx=16, pady=(0, 4))
        preview = tk.Listbox(dialog, height=7, activestyle="none", exportselection=False)
        preview.pack(fill="x", padx=16, pady=(0, 10))
        parsed: dict = {}
        create_button = None

        preview_job = None

        def paste_from_clipboard(_event=None):
            try:
                content = dialog.clipboard_get()
            except tk.TclError:
                preview_label.set("剪貼簿沒有可貼上的文字；請先複製大綱文字，再按「從剪貼簿貼上」。")
                return "break"
            if not content:
                preview_label.set("剪貼簿沒有可貼上的文字；請先複製大綱文字。")
                return "break"
            try:
                if outline_input.tag_ranges("sel"):
                    outline_input.delete("sel.first", "sel.last")
            except tk.TclError:
                pass
            outline_input.insert("insert", content)
            outline_input.focus_set()
            preview_label.set("已貼入剪貼簿文字，正在辨識投影片頁數…")
            return "break"

        def show_preview():
            nonlocal preview_job
            preview_job = None
            try:
                title, slides, source_record = parse_outline_text(outline_input.get("1.0", "end"))
            except ValueError as exc:
                parsed.clear()
                preview.delete(0, "end")
                preview_label.set(str(exc))
                create_button.configure(state="disabled")
                export_button.configure(state="disabled")
                return
            parsed.update(title=title, slides=slides, source=source_record)
            create_button.configure(state="normal")
            export_button.configure(state="normal")
            preview.delete(0, "end")
            for index, slide in enumerate(slides, 1):
                preview.insert("end", f"{index:02d}　{slide['title']}")
            preview_label.set(f"辨識到 {len(slides)} 張投影片；原始大綱與解析結果會保存在本機，不會上傳。")

        def preview_after_edit(_event=None):
            nonlocal preview_job
            if outline_input.edit_modified():
                outline_input.edit_modified(False)
                parsed.clear()
                preview.delete(0, "end")
                preview_label.set("大綱已更新，正在重新辨識頁數…")
                create_button.configure(state="disabled")
                export_button.configure(state="disabled")
                if preview_job:
                    dialog.after_cancel(preview_job)
                preview_job = dialog.after(450, show_preview)

        def show_context_menu(event):
            outline_input.focus_set()
            try:
                paste_menu.tk_popup(event.x_root, event.y_root)
            finally:
                paste_menu.grab_release()
            return "break"

        def create_project():
            if not parsed:
                show_preview()
            if not parsed:
                return
            document = new_project_document(self.title_text.get().strip() or parsed["title"])
            document["slides"] = parsed["slides"]
            document["sources"] = [parsed["source"]]
            document["outline"] = [
                {"id": str(uuid4()), "slide_id": slide["id"], "title": slide["title"]}
                for slide in parsed["slides"]
            ]
            document["settings"] = {
                "operation": self.operation.get(),
                "image_strategy": self.image_strategy.get(),
                "style": self.style.get(),
                "output_format": self.output.get(),
                "target_pages": len(parsed["slides"]),
                "intervention": self.intervention.get(),
            }
            for slide in document["slides"]:
                slide["source_id"] = parsed["source"]["id"]
            self.title_text.set(document["title"])
            self._save_new_project(document, parsed["source"]["path"])
            self.status_text.set(f"已從貼上的大綱建立並保存 {len(document['slides'])} 張投影片；目前不會呼叫 AI。")
            dialog.destroy()

        def create_and_export():
            if not parsed:
                show_preview()
            if not parsed:
                return
            filename = f"{self.title_text.get().strip() or parsed['title']}.pptx"
            path = filedialog.asksaveasfilename(
                defaultextension=".pptx",
                filetypes=[("PowerPoint 簡報", "*.pptx")],
                initialfile=filename,
            )
            if not path:
                return
            create_project()
            if not self.document or not self.current_project_id:
                return
            asset_root = self.app_support / "projects" / self.current_project_id / "assets"
            try:
                export_project_pptx(path, self.document, self.style.get(), asset_root=asset_root)
            except (OSError, ValueError) as exc:
                self.status_text.set(f"PPTX 匯出失敗：{exc}")
                messagebox.showerror("匯出失敗", str(exc))
                return
            self.status_text.set(f"已保存大綱專案並產生可編輯 PPTX：{Path(path).name}。此流程未呼叫 AI。")
            messagebox.showinfo("簡報已產生", f"已建立 {len(self.document['slides'])} 張可編輯投影片：\n{path}\n\n這是依貼上大綱排版的 PPTX，尚未經 AI 擴寫或生成圖片。")

        actions = ttk.Frame(dialog, padding=(16, 0, 16, 14))
        actions.pack(fill="x")
        ttk.Button(actions, text="從剪貼簿貼上", command=paste_from_clipboard).pack(side="left", padx=(0, 8))
        preview_button = ttk.Button(actions, text="預覽大綱", command=show_preview)
        preview_button.pack(side="left")
        create_button = ttk.Button(actions, text="建立專案", command=create_project, state="disabled")
        create_button.pack(side="right")
        export_button = ttk.Button(actions, text="建立並匯出 PPTX…", command=create_and_export, state="disabled")
        export_button.pack(side="right", padx=(0, 8))
        ttk.Button(actions, text="取消", command=dialog.destroy).pack(side="right", padx=(0, 8))

        paste_menu = tk.Menu(dialog, tearoff=0)
        paste_menu.add_command(label="貼上", command=paste_from_clipboard)
        paste_menu.add_command(label="全選", command=lambda: (outline_input.tag_add("sel", "1.0", "end-1c"), outline_input.focus_set()))
        outline_input.bind("<<Modified>>", preview_after_edit)
        for sequence in ("<Command-v>", "<Command-V>", "<Control-v>", "<Control-V>", "<<Paste>>"):
            try:
                outline_input.bind(sequence, paste_from_clipboard, add="+")
            except tk.TclError:
                continue
        for sequence in ("<Button-2>", "<Button-3>", "<Control-Button-1>"):
            try:
                outline_input.bind(sequence, show_context_menu, add="+")
            except tk.TclError:
                continue
        outline_input.edit_modified(False)
        # Keep this editor modeless: on macOS, a Tk grab on a newly-created
        # Toplevel can disable the parent while leaving the dialog behind it.
        # Raise it after mapping so the paste target is immediately visible.
        dialog.deiconify()
        dialog.lift(self)
        dialog.after_idle(dialog.lift)
        dialog.after_idle(outline_input.focus_set)

    def open_project(self):
        projects = self.project_store.list_projects()
        if not projects:
            messagebox.showinfo("開啟專案", "目前沒有已保存的專案。")
            return
        menu = tk.Toplevel(self); menu.title("選擇專案"); menu.geometry("480x320")
        listing = tk.Listbox(menu, exportselection=False)
        listing.pack(fill="both", expand=True, padx=12, pady=12)
        for row in projects:
            listing.insert("end", f"{row['id']}　{row['source_path']}")
        def load_selected():
            selection = listing.curselection()
            if not selection: return
            project_id = projects[selection[0]]["id"]
            loaded = self.project_store.load_document(project_id)
            if not loaded:
                messagebox.showwarning("無文件", "此專案尚無可開啟的文件內容。")
                return
            self.revision, self.document = loaded
            self.current_project_id = project_id
            self._restore_controls()
            self.candidate = None
            self._show_editor()
            self._refresh(); self.status_text.set("已從本機資料庫開啟專案。")
            self._refresh_recent_projects()
            menu.destroy()
        ttk.Button(menu, text="開啟", command=load_selected).pack(pady=(0, 12))

    def _persist(self):
        if not self.document or not self.current_project_id: return
        if self.title_text.get().strip():
            self.document["title"] = self.title_text.get().strip()
        try:
            target_pages = max(1, min(100, self.target_pages.get()))
        except (ValueError, tk.TclError):
            target_pages = 8
        self.document["settings"] = {
            "operation": self.operation.get(), "image_strategy": self.image_strategy.get(),
            "style": self.style.get(), "output_format": self.output.get(),
            "target_pages": target_pages, "intervention": self.intervention.get(),
        }
        self.revision = self.project_store.save_document(
            self.current_project_id, self.document, self.revision,
            parent_revision=self._next_parent_revision,
        )
        self._next_parent_revision = None
        self.document["revision"] = self.revision

    def _restore_controls(self):
        self.title_text.set(self.document.get("title", ""))
        settings = self.document.get("settings", {})
        self.operation.set(settings.get("operation", "保留內容"))
        self.image_strategy.set(settings.get("image_strategy", "沿用原圖"))
        self.style.set(settings.get("style", "清爽藍"))
        self.output.set(settings.get("output_format", "可編輯式 PPTX"))
        self.intervention.set(settings.get("intervention", "協助潤飾"))
        self.target_pages.set(settings.get("target_pages", len(self.document.get("slides", [])) or 8))
        self._refresh_style_cards()

    def _draw_style_card(self, name: str, width: int, height: int) -> None:
        canvas = self.style_card_canvases.get(name)
        if canvas is None:
            return
        palette = STYLE_PALETTES[name]
        canvas.delete("all")
        canvas.configure(background=palette["paper"])
        canvas.create_rectangle(10, 9, max(14, width - 10), 20, fill=palette["accent"], outline="")
        canvas.create_rectangle(10, 27, max(14, width - 34), 31, fill=palette["text"], outline="")
        canvas.create_rectangle(10, 36, max(14, width - 22), 39, fill=palette["rule"], outline="")
        canvas.create_rectangle(10, 44, max(14, width - 48), 47, fill=palette["rule"], outline="")

    def _refresh_style_cards(self) -> None:
        if not hasattr(self, "style_card_canvases"):
            return
        for name, canvas in self.style_card_canvases.items():
            palette = STYLE_PALETTES[name]
            selected = name == self.style.get()
            canvas.master.configure(relief="solid" if selected else "flat", borderwidth=2 if selected else 1)
            self._draw_style_card(name, max(canvas.winfo_width(), 120), max(canvas.winfo_height(), 54))

    def _choose_style(self, name: str) -> None:
        self.style.set(name)
        self._style_changed()

    def _style_changed(self) -> None:
        self._refresh_style_cards()
        if self.document:
            self._mutate()
            self._persist()
            self.draw_slide()

    def _mutate(self):
        if self.document is None: self.start()

    def _refresh(self):
        if not self.document: return
        self.slide_list.delete(0, "end")
        for i, slide in enumerate(self.document["slides"], 1):
            self.slide_list.insert("end", f"{i:02d}　{slide['title']}")
        if self.document["slides"]:
            self.slide_list.selection_clear(0, "end"); self.slide_list.selection_set(0)
        self._refresh_annotations(); self.draw_slide(); self._select_slide(None)
        self.source_list.delete(0, "end")
        for src in self.document.get("sources", []): self.source_list.insert("end", f"[{src.get('role', 'supplement')}] {src.get('display_name') or Path(src.get('path', '來源資料')).name}")

    def _current_slide(self):
        if not self.document or not self.document["slides"]: return None
        selected = self.slide_list.curselection()
        return self.document["slides"][selected[0] if selected else 0]

    def _select_slide(self, _event):
        slide = self._current_slide()
        if not slide: return
        self.slide_title.set(slide["title"])
        self._refresh_text_elements(slide)
        count = sum(1 for mark in self.document["annotations"] if mark["slide_id"] == slide["id"])
        self.slide_status.set(f"第 {slide['order'] + 1} 頁 · {slide['title']} · {count} 個區域標記")
        self.draw_slide(); self._refresh_annotations()

    def _refresh_text_elements(self, slide: dict) -> None:
        self._text_element_ids = [
            element["id"] for element in slide.get("elements", [])
            if element.get("type", "text") == "text"
        ]
        self.text_element_list.delete(0, "end")
        elements_by_id = {element["id"]: element for element in slide.get("elements", [])}
        for index, element_id in enumerate(self._text_element_ids, 1):
            excerpt = " ".join(elements_by_id[element_id].get("text", "").split())[:34]
            self.text_element_list.insert("end", f"文字區塊 {index}　{excerpt}")
        self.slide_body.delete("1.0", "end")
        if self._text_element_ids:
            self.text_element_list.selection_set(0)
            self._select_text_element(None)

    def _select_text_element(self, _event) -> None:
        selection = self.text_element_list.curselection()
        slide = self._current_slide()
        if not slide or not selection or selection[0] >= len(self._text_element_ids):
            return
        element_id = self._text_element_ids[selection[0]]
        element = next((item for item in slide["elements"] if item.get("id") == element_id), None)
        if element:
            self.slide_body.delete("1.0", "end")
            self.slide_body.insert("1.0", element.get("text", ""))

    def save_slide_text(self) -> None:
        slide = self._current_slide()
        if not slide or not self.document:
            messagebox.showinfo("頁面文字", "請先建立或開啟專案。")
            return
        selection = self.text_element_list.curselection()
        element_id = self._text_element_ids[selection[0]] if selection and selection[0] < len(self._text_element_ids) else None
        try:
            update_slide_text_element(slide, self.slide_body.get("1.0", "end"), element_id)
        except ValueError as exc:
            messagebox.showwarning("無法保存頁面文字", str(exc))
            return
        self._mutate()
        self._persist()
        selected_slide = self.slide_list.curselection()
        slide_index = selected_slide[0] if selected_slide else 0
        self._refresh()
        self.slide_list.selection_clear(0, "end")
        self.slide_list.selection_set(slide_index)
        self._select_slide(None)
        self.status_text.set("頁面文字已保存為可編輯物件；其他文字與圖片物件保持分開。")

    def draw_slide(self):
        self.canvas.delete("all")
        self._canvas_images = []
        slide = self._current_slide()
        if not slide: return
        width, height = max(self.canvas.winfo_width(), 500), max(self.canvas.winfo_height(), 360)
        margin = 34
        palette = STYLE_PALETTES.get(self.style.get(), STYLE_PALETTES["清爽藍"])
        self.canvas.create_rectangle(margin, margin, width-margin, height-margin, fill=palette["paper"], outline="#cbd5e1")
        self.canvas.create_text(margin+28, margin+42, text=slide["title"], anchor="w", fill=palette["accent"], font=("Arial", 22, "bold"))
        self.canvas.create_line(margin+28, margin+70, width-margin-28, margin+70, fill=palette["rule"], width=3)
        content_drawn = False
        for element in slide.get("elements", []):
            x = margin + float(element.get("x", .08)) * (width-2*margin)
            y = margin + float(element.get("y", .2)) * (height-2*margin)
            box_width = float(element.get("width", .84)) * (width-2*margin)
            box_height = float(element.get("height", .64)) * (height-2*margin)
            if element.get("type") == "image" and element.get("asset_path") and self.current_project_id:
                try:
                    from PIL import Image, ImageTk
                    image_path = self.app_support / "projects" / self.current_project_id / "assets" / element["asset_path"]
                    with Image.open(image_path) as image:
                        image.thumbnail((max(1, int(box_width)), max(1, int(box_height))))
                        photo = ImageTk.PhotoImage(image.copy())
                    self._canvas_images.append(photo)
                    self.canvas.create_image(x, y, image=photo, anchor="nw")
                    content_drawn = True
                except (OSError, ImportError):
                    self.canvas.create_text(x, y, text="圖片素材無法預覽", anchor="nw", fill="#b42318")
            elif element.get("type", "text") == "text" and element.get("text"):
                self.canvas.create_text(x, y, width=box_width, text=element["text"], anchor="nw", justify="left", fill=palette["text"], font=("Arial", 13))
                content_drawn = True
        if not content_drawn:
            self.canvas.create_text(margin+32, margin+112, text="在畫布拖曳，新增可保存的區域標記", anchor="w", fill="#64748b", font=("Arial", 13))
        for idx, mark in enumerate(self._slide_annotations(slide["id"]), 1):
            x1, y1, x2, y2 = mark["rect"]
            x1, x2 = sorted((x1, x2)); y1, y2 = sorted((y1, y2))
            self.canvas.create_rectangle(margin+x1*(width-2*margin), margin+y1*(height-2*margin), margin+x2*(width-2*margin), margin+y2*(height-2*margin), outline="#e05252", width=2)
            self.canvas.create_text(margin+x1*(width-2*margin)+12, margin+y1*(height-2*margin)+12, text=str(idx), fill="white", font=("Arial", 10, "bold"), tags="marker")

    def _slide_annotations(self, slide_id):
        return [m for m in (self.document or {}).get("annotations", []) if m["slide_id"] == slide_id]

    def _refresh_annotations(self):
        self.annotation_list.delete(0, "end")
        slide = self._current_slide()
        if not slide: return
        for i, mark in enumerate(self._slide_annotations(slide["id"]), 1):
            self.annotation_list.insert("end", f"{i} · {mark.get('status', '待處理')} · {mark.get('comment', '未留言')[:22]}")

    def _mark_begin(self, event):
        if not self.document: return
        self.mark_start = (event.x, event.y)
        self.mark_rect = self.canvas.create_rectangle(event.x, event.y, event.x, event.y, outline="#e05252", width=2, dash=(4, 2))

    def _mark_drag(self, event):
        if self.mark_start and self.mark_rect:
            self.canvas.coords(self.mark_rect, *self.mark_start, event.x, event.y)

    def _mark_end(self, event):
        if not self.mark_start: return
        x0, y0 = self.mark_start; self.mark_start = None
        x1, x2 = sorted((x0, event.x)); y1, y2 = sorted((y0, event.y))
        width, height = max(self.canvas.winfo_width(), 1), max(self.canvas.winfo_height(), 1)
        margin = 34
        rect = [max(0, min(1, (x1-margin)/(width-2*margin))), max(0, min(1, (y1-margin)/(height-2*margin))), max(0, min(1, (x2-margin)/(width-2*margin))), max(0, min(1, (y2-margin)/(height-2*margin)))]
        if rect[2]-rect[0] < .01 or rect[3]-rect[1] < .01:
            self.draw_slide(); return
        self._mutate()
        self.document["annotations"].append({"id": str(uuid4()), "slide_id": self._current_slide()["id"], "object_id": None, "rect": rect, "comment": "", "base_revision": self.revision, "status": "待處理", "locked": False})
        self._persist(); self._refresh(); self.status_text.set("區域標記已保存；AI 區域修改尚未提供。")

    def _select_annotation(self, _event):
        selected = self.annotation_list.curselection()
        slide = self._current_slide()
        if not selected or not slide: return
        marks = self._slide_annotations(slide["id"])
        if selected[0] < len(marks):
            self.annotation_note.delete("1.0", "end"); self.annotation_note.insert("1.0", marks[selected[0]].get("comment", ""))

    def save_annotation_note(self):
        slide = self._current_slide(); selection = self.annotation_list.curselection()
        if not slide or not selection: return
        marks = self._slide_annotations(slide["id"])
        if selection[0] >= len(marks): return
        self._mutate(); marks[selection[0]]["comment"] = self.annotation_note.get("1.0", "end").strip()
        self._persist(); self._refresh_annotations(); self.status_text.set("標記留言已保存。")

    def edit_slide_title(self):
        slide = self._current_slide()
        title = self.slide_title.get().strip()
        if not slide or not title or title == slide["title"]: return
        self._mutate(); slide["title"] = title; self._persist(); self._refresh()
        self.status_text.set("頁面標題已保存。")

    def add_slide(self):
        if not self.document: self.start()
        if not self.document or not self.current_project_id: return
        self._mutate()
        index = len(self.document["slides"])
        self.document["slides"].append({"id": str(uuid4()), "order": index, "title": f"新頁面 {index+1}", "elements": []})
        self._persist(); self._refresh(); self.slide_list.selection_clear(0, "end"); self.slide_list.selection_set(index); self._select_slide(None)

    def create_candidate(self):
        instruction = self.chat_input.get("1.0", "end").strip()
        if not instruction: return
        mark_selection = self.annotation_list.curselection()
        slide = self._current_slide()
        scope = f"第 {slide['order']+1} 頁／標記 {mark_selection[0]+1}" if slide and mark_selection else f"第 {slide['order']+1} 頁"
        self.candidate = {"instruction": instruction, "scope": scope, "base_revision": self.revision, "status": "模擬候選"}
        self.candidate_text.set(f"候選（未執行 AI）\n範圍：{scope}\n指示：{instruction}\n基底修訂：{self.revision}")
        self.status_text.set("已建立模擬修改候選；接受後會保存指示紀錄，不會改寫畫面內容。")

    def compare_candidate(self):
        if not self.candidate:
            messagebox.showinfo("前後比較", "目前沒有修改候選。")
            return
        messagebox.showinfo("前後比較（模擬）", f"目前版本：修訂 {self.revision}\n候選版本：尚未套用\n修改範圍：{self.candidate['scope']}\n指示：{self.candidate['instruction']}")

    def accept_candidate(self):
        if not self.candidate: return
        if self.candidate["base_revision"] != self.revision:
            messagebox.showwarning("版本衝突", "候選基於舊版本，請重新建立候選。")
            return
        self._mutate()
        self.document.setdefault("change_log", []).append(dict(self.candidate, status="accepted_simulation"))
        self._persist(); self.cancel_candidate()
        self.status_text.set("模擬候選指示已存入操作紀錄；尚未改動投影片內容。")

    def cancel_candidate(self):
        self.candidate = None; self.candidate_text.set("目前沒有候選版本")

    def undo(self):
        if not self.document or not self.current_project_id: return
        parent = self.project_store.revision_parent(self.current_project_id, self.revision)
        if not parent:
            self.status_text.set("目前已是最早版本，沒有可復原的修改。")
            return
        restored = self.project_store.load_revision(self.current_project_id, parent)
        if not restored:
            self.status_text.set("找不到此修訂的歷史快照，未變更目前文件。")
            return
        earlier_parent = self.project_store.revision_parent(self.current_project_id, parent) or 0
        _old_revision, self.document = restored
        self._restore_controls()
        self._next_parent_revision = earlier_parent
        self._persist(); self._refresh()
        self.status_text.set("已從持久化修訂快照復原，並保存為新的目前版本。")

    def add_source(self):
        path = filedialog.askopenfilename(filetypes=[("簡報與文件", "*.pptx *.pdf *.docx *.txt *.png *.jpg *.jpeg"), ("所有檔案", "*")])
        if not path: return
        if not self.document: self.start()
        if not self.document or not self.current_project_id: return
        try:
            source_slides, source_record = import_source(path, asset_dir=self.app_support / "projects" / self.current_project_id / "assets")
        except (OSError, ValueError, RuntimeError) as exc:
            messagebox.showerror("無法加入參考資料", str(exc)); return
        source_record["role"] = {"補充資料": "supplement", "主要內容": "primary", "修改依據": "edit_reference", "風格參考": "style_reference"}[self.source_role.get()]
        source_record["pages"] = source_slides
        scope_map = {"整份簡報": "project", "目前頁面": "slide", "目前標記": "annotation"}
        source_record["scope"] = scope_map[self.source_scope.get()]
        slide = self._current_slide()
        selected_mark = self.annotation_list.curselection()
        if source_record["scope"] == "slide" and slide:
            source_record["scope_target"] = slide["id"]
        elif source_record["scope"] == "annotation" and slide and selected_mark:
            marks = self._slide_annotations(slide["id"])
            if selected_mark[0] < len(marks):
                source_record["scope_target"] = marks[selected_mark[0]]["id"]
        if source_record["scope"] != "project" and not source_record.get("scope_target"):
            messagebox.showwarning("請選取範圍", "套用目前頁面或標記前，請先在左側選定對應範圍。")
            return
        self._mutate(); self.document.setdefault("sources", []).append(source_record)
        self._persist(); self._refresh(); self.status_text.set("參考資料已在本機解析並保存；來源頁數與文字可追溯。")

    def _preview_source(self, _event):
        selection = self.source_list.curselection()
        if not selection or not self.document:
            return
        sources = self.document.get("sources", [])
        if selection[0] >= len(sources):
            return
        source = sources[selection[0]]
        pages = source.get("pages")
        if pages is None:
            pages = [slide for slide in self.document.get("slides", []) if slide.get("source_id") == source["id"]]
        summary = [f"來源：{source.get('display_name') or Path(source.get('path', '來源資料')).name}", f"用途：{source.get('role', 'supplement')} · 範圍：{source.get('scope', 'project')} · 版本：{source.get('version', 1)}", f"頁數：{len(pages)}", ""]
        for index, page in enumerate(pages, 1):
            summary.append(f"第 {index} 頁｜{page.get('title', '')}")
            for element in page.get("elements", []):
                if element.get("type") == "text":
                    summary.append(element.get("text", ""))
                elif element.get("type") == "image":
                    summary.append("[圖片素材]")
        if source.get("warnings"):
            summary.extend(["", "解析提醒：", *source["warnings"]])
        self.source_preview.configure(state="normal")
        self.source_preview.delete("1.0", "end")
        self.source_preview.insert("1.0", "\n".join(summary))
        self.source_preview.configure(state="disabled")

    def show_settings(self):
        win = tk.Toplevel(self); win.title("模型與儲存設定"); win.geometry("560x320"); win.transient(self)
        ttk.Label(win, text="本機引擎狀態", font=("Arial", 16, "bold")).pack(anchor="w", padx=20, pady=(18, 10))
        text_model = discover_qwen38_mlx(); image_model = qwen_image21_readiness()
        if text_model:
            text_backend = LocalQwenTextBackend(CheckpointManifest(
                "Qwen3.8-27B local", str(text_model), "0" * 64,
                "local model directory", "local", "see checkpoint license", "mlx", format="mlx",
            ))
            health = text_backend.health()
            shards = len(list(text_model.glob("*.safetensors")))
            if health["ok"]:
                text = f"Qwen 文字權重：已找到（{shards} shards）；模型文字品質尚未通過端到端驗收。"
            else:
                detail = "; ".join(health["errors"])
                text = f"Qwen 文字權重：已找到（{shards} shards），但目前應用推論後端不可用：{detail}"
        else:
            text = "Qwen 文字模型：尚未找到完整模型資料夾或必要分片"
        image = f"Qwen-Image-2.1：權重完整、離線載入已驗證（{image_model['safetensors']} 檔）；圖片生成待驗收" if image_model["ready"] else f"Qwen-Image-2.1：尚未完整（缺 {len(image_model['missing'])} 項、暫存 {len(image_model['incomplete'])} 項）"
        ttk.Label(win, text=text, wraplength=510).pack(anchor="w", padx=20, pady=6)
        ttk.Label(win, text=image, wraplength=510).pack(anchor="w", padx=20, pady=6)
        ttk.Label(win, text=f"專案資料庫：{self.project_store.path}", wraplength=510).pack(anchor="w", padx=20, pady=6)
        ttk.Button(win, text="關閉", command=win.destroy).pack(anchor="e", padx=20, pady=18)

    def export(self):
        if not self.document: self.start()
        if not self.document or not self.current_project_id: return
        if self.output.get() == "圖像式 PPTX":
            messagebox.showinfo("此格式尚未提供", "目前只支援可編輯式 PPTX；圖像式匯出尚未實作，沒有產生降級替代檔。")
            return
        path = filedialog.asksaveasfilename(defaultextension=".pptx", filetypes=[("PowerPoint", "*.pptx")], initialfile=f"{self.document.get('title') or '我的簡報'}.pptx")
        if path:
            asset_root = self.app_support / "projects" / self.current_project_id / "assets"
            try:
                export_project_pptx(path, self.document, self.style.get(), asset_root=asset_root)
            except (OSError, ValueError) as exc:
                messagebox.showerror("匯出失敗", str(exc)); self.status_text.set(f"匯出失敗：{exc}"); return
            self.status_text.set(f"已匯出可編輯 PPTX：{Path(path).name}；文字及已匯入圖片為原生物件。")
            messagebox.showinfo("已匯出可編輯 PPTX", "文字物件可直接編輯；已匯入圖片已嵌入簡報。尚未經模型生成，複雜母片／動畫不保證保留。")


def main():
    PresentationMakerApp().mainloop()


if __name__ == "__main__":
    main()
