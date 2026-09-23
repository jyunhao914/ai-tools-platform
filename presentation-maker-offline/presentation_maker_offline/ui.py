from __future__ import annotations

import tkinter as tk
from copy import deepcopy
from pathlib import Path
from tkinter import filedialog, messagebox, ttk
from uuid import uuid4

from .export import export_project_pptx
from .project_document import new_project_document
from .source_import import import_source
from .storage import discover_qwen38_mlx, qwen_image21_readiness
from .workflow import ProjectStore


class PresentationMakerApp(tk.Tk):
    """A clearly-labelled, locally persisted interaction prototype."""

    def __init__(self):
        super().__init__()
        self.title("離線簡報工作室 · 互動原型")
        self.geometry("1360x850")
        self.minsize(1050, 680)
        self.source_path: str | None = None
        self.current_project_id: str | None = None
        self.document: dict | None = None
        self.revision = 0
        self.undo_stack: list[dict] = []
        self.candidate: dict | None = None
        self.mark_start: tuple[int, int] | None = None
        self.mark_rect: int | None = None
        self.title_text = tk.StringVar(value="我的離線簡報")
        self.style = tk.StringVar(value="清爽藍")
        self.output = tk.StringVar(value="可編輯式 PPTX")
        self.status_text = tk.StringVar(value="互動原型：示範操作，不會呼叫 AI 模型。")
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
        ttk.Label(header, text="互動原型 · 示例修改為模擬，尚未連接模型", foreground="#9a5b00").pack(side="left", padx=18)
        ttk.Button(header, text="模型與儲存設定", command=self.show_settings).pack(side="right")
        ttk.Button(header, text="開啟專案", command=self.open_project).pack(side="right", padx=8)

        shell = ttk.Panedwindow(self, orient="horizontal")
        shell.pack(fill="both", expand=True, padx=14, pady=(0, 10))
        left = ttk.Frame(shell, padding=10, width=205)
        center = ttk.Frame(shell, padding=10)
        right = ttk.Frame(shell, padding=10, width=310)
        shell.add(left, weight=1); shell.add(center, weight=5); shell.add(right, weight=2)

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
        ttk.Label(toolbar, text="畫布 · 拖曳即可新增矩形標記").pack(side="left")
        ttk.Button(toolbar, text="比較候選", command=self.compare_candidate).pack(side="right")
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
        chat_tab = ttk.Frame(tabs, padding=10)
        data_tab = ttk.Frame(tabs, padding=10)
        tabs.add(edit_tab, text="內容／版面")
        tabs.add(chat_tab, text="對話修改")
        tabs.add(data_tab, text="專案資料")

        ttk.Label(edit_tab, text="頁面標題").pack(anchor="w")
        self.slide_title = tk.StringVar()
        title_entry = ttk.Entry(edit_tab, textvariable=self.slide_title)
        title_entry.pack(fill="x", pady=(4, 4))
        title_entry.bind("<FocusOut>", lambda _event: self.edit_slide_title())
        ttk.Label(edit_tab, text="風格（原型選項）").pack(anchor="w", pady=(10, 3))
        ttk.Combobox(edit_tab, textvariable=self.style, values=["清爽藍", "雜誌編輯", "自然療癒", "高科技"], state="readonly").pack(fill="x")
        ttk.Label(edit_tab, text="修改留言").pack(anchor="w", pady=(12, 4))
        self.annotation_note = tk.Text(edit_tab, height=5, wrap="word")
        self.annotation_note.pack(fill="x")
        ttk.Button(edit_tab, text="保存標記留言", command=self.save_annotation_note).pack(fill="x", pady=5)
        ttk.Button(edit_tab, text="復原上一項", command=self.undo).pack(fill="x", pady=(12, 0))

        ttk.Label(chat_tab, text="輸入修改指示；原型只建立候選，不執行生成。", wraplength=260).pack(anchor="w")
        self.chat_input = tk.Text(chat_tab, height=7, wrap="word")
        self.chat_input.pack(fill="x", pady=8)
        ttk.Button(chat_tab, text="建立模擬候選", command=self.create_candidate).pack(fill="x")
        self.candidate_text = tk.StringVar(value="目前沒有候選版本")
        ttk.Label(chat_tab, textvariable=self.candidate_text, wraplength=260).pack(anchor="w", pady=10)
        ttk.Button(chat_tab, text="接受候選", command=self.accept_candidate).pack(fill="x")
        ttk.Button(chat_tab, text="取消候選", command=self.cancel_candidate).pack(fill="x", pady=4)

        ttk.Button(data_tab, text="加入參考資料…", command=self.add_source).pack(fill="x")
        self.source_list = tk.Listbox(data_tab, height=10, activestyle="none")
        self.source_list.pack(fill="both", expand=True, pady=8)
        ttk.Label(data_tab, text="來源在本機解析；PPTX 文字與圖片素材可加入專案，DOCX／PDF／TXT 目前以文字為主。", wraplength=260).pack(anchor="w")

        footer = ttk.Frame(self, padding=(14, 4, 14, 12))
        footer.pack(fill="x")
        ttk.Label(footer, textvariable=self.status_text).pack(side="left", fill="x", expand=True)
        ttk.Button(footer, text="匯出可編輯 PPTX…", command=self.export).pack(side="right")

    def _sample(self):
        document = new_project_document(self.title_text.get().strip() or "我的離線簡報")
        headings = [document["title"], "核心訊息與聽眾", "內容架構與重點"]
        document["slides"] = [{"id": str(uuid4()), "order": i, "title": name, "elements": []} for i, name in enumerate(headings)]
        document["sources"] = []
        return document

    def start(self):
        document = self._sample()
        project_id = str(uuid4())
        asset_dir = self.app_support / "projects" / project_id / "assets"
        if self.source_path:
            try:
                imported_slides, source_record = import_source(self.source_path, asset_dir=asset_dir)
            except (OSError, ValueError, RuntimeError) as exc:
                messagebox.showerror("無法匯入來源", str(exc))
                self.status_text.set(f"匯入失敗：{exc}")
                return
            document["title"] = Path(self.source_path).stem
            document["slides"] = imported_slides
            for slide in imported_slides:
                slide["source_id"] = source_record["id"]
            document["sources"] = [source_record]
        self.project_store.create(self.source_path or "example://interaction-prototype", project_id=project_id)
        document["project_id"] = project_id
        self.project_store.save_document(project_id, document, expected_revision=0)
        self.current_project_id, self.document, self.revision = project_id, document, 1
        self.undo_stack.clear()
        self._refresh()
        warnings = document["sources"][0].get("warnings", []) if document.get("sources") else []
        if warnings:
            self.status_text.set(f"已匯入，但有解析提醒：{warnings[0]}")
        elif self.source_path:
            self.status_text.set("本機來源內容已匯入；PPTX 文字／圖片可編輯與匯出，複雜圖層樣式仍有差異。")
        else:
            self.status_text.set("示例專案已保存；此為 UI 模擬，不是模型生成或推論進度。")

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
            self.undo_stack.clear(); self.candidate = None
            self._refresh(); self.status_text.set("已從本機資料庫開啟專案。")
            menu.destroy()
        ttk.Button(menu, text="開啟", command=load_selected).pack(pady=(0, 12))

    def _persist(self):
        if not self.document or not self.current_project_id: return
        self.revision = self.project_store.save_document(self.current_project_id, self.document, self.revision)
        self.document["revision"] = self.revision

    def _mutate(self):
        if self.document is None: self.start()
        self.undo_stack.append(deepcopy(self.document))

    def _refresh(self):
        if not self.document: return
        self.slide_list.delete(0, "end")
        for i, slide in enumerate(self.document["slides"], 1):
            self.slide_list.insert("end", f"{i:02d}　{slide['title']}")
        if self.document["slides"]:
            self.slide_list.selection_clear(0, "end"); self.slide_list.selection_set(0)
        self._refresh_annotations(); self.draw_slide(); self._select_slide(None)
        self.source_list.delete(0, "end")
        for src in self.document.get("sources", []): self.source_list.insert("end", src["path"])

    def _current_slide(self):
        if not self.document or not self.document["slides"]: return None
        selected = self.slide_list.curselection()
        return self.document["slides"][selected[0] if selected else 0]

    def _select_slide(self, _event):
        slide = self._current_slide()
        if not slide: return
        self.slide_title.set(slide["title"])
        count = sum(1 for mark in self.document["annotations"] if mark["slide_id"] == slide["id"])
        self.slide_status.set(f"第 {slide['order'] + 1} 頁 · {slide['title']} · {count} 個區域標記")
        self.draw_slide(); self._refresh_annotations()

    def draw_slide(self):
        self.canvas.delete("all")
        self._canvas_images = []
        slide = self._current_slide()
        if not slide: return
        width, height = max(self.canvas.winfo_width(), 500), max(self.canvas.winfo_height(), 360)
        margin = 34
        self.canvas.create_rectangle(margin, margin, width-margin, height-margin, fill="white", outline="#cbd5e1")
        self.canvas.create_text(margin+28, margin+42, text=slide["title"], anchor="w", fill="#18324b", font=("Arial", 22, "bold"))
        self.canvas.create_line(margin+28, margin+70, width-margin-28, margin+70, fill="#dbeafe", width=3)
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
                self.canvas.create_text(x, y, width=box_width, text=element["text"], anchor="nw", justify="left", fill="#334155", font=("Arial", 13))
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
        self._persist(); self._refresh(); self.status_text.set("區域標記已保存；可在右側加入修改留言。")

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
        if not self.undo_stack or not self.document: return
        previous = self.undo_stack.pop()
        previous["project_id"] = self.current_project_id
        self.document = previous; self._persist(); self._refresh()
        self.status_text.set("已復原一項變更並保存。")

    def add_source(self):
        path = filedialog.askopenfilename(filetypes=[("簡報與文件", "*.pptx *.pdf *.docx *.txt *.png *.jpg *.jpeg"), ("所有檔案", "*")])
        if not path: return
        if not self.document: self.start()
        try:
            source_slides, source_record = import_source(path, asset_dir=self.app_support / "projects" / self.current_project_id / "assets")
        except (OSError, ValueError, RuntimeError) as exc:
            messagebox.showerror("無法加入參考資料", str(exc)); return
        source_record["role"] = "supplement"
        source_record["pages"] = source_slides
        self._mutate(); self.document.setdefault("sources", []).append(source_record)
        self._persist(); self._refresh(); self.status_text.set("來源路徑已加入專案；目前原型尚未解析內容。")

    def show_settings(self):
        win = tk.Toplevel(self); win.title("模型與儲存設定"); win.geometry("560x320"); win.transient(self)
        ttk.Label(win, text="本機引擎狀態", font=("Arial", 16, "bold")).pack(anchor="w", padx=20, pady=(18, 10))
        text_model = discover_qwen38_mlx(); image_model = qwen_image21_readiness()
        text = f"Qwen 文字模型：已找到（{len(list(text_model.glob('*.safetensors')))} shards）；生成 runtime 狀態待安裝確認" if text_model else "Qwen 文字模型：尚未找到完整模型資料夾"
        image = f"Qwen-Image-2.1：權重完整、離線載入已驗證（{image_model['safetensors']} 檔）；圖片生成待驗收" if image_model["ready"] else f"Qwen-Image-2.1：尚未完整（缺 {len(image_model['missing'])} 項、暫存 {len(image_model['incomplete'])} 項）"
        ttk.Label(win, text=text, wraplength=510).pack(anchor="w", padx=20, pady=6)
        ttk.Label(win, text=image, wraplength=510).pack(anchor="w", padx=20, pady=6)
        ttk.Label(win, text=f"專案資料庫：{self.project_store.path}", wraplength=510).pack(anchor="w", padx=20, pady=6)
        ttk.Button(win, text="關閉", command=win.destroy).pack(anchor="e", padx=20, pady=18)

    def export(self):
        if not self.document: self.start()
        path = filedialog.asksaveasfilename(defaultextension=".pptx", filetypes=[("PowerPoint", "*.pptx")], initialfile="offline-presentation-example.pptx")
        if path:
            asset_root = self.app_support / "projects" / self.current_project_id / "assets"
            export_project_pptx(path, self.document, self.style.get(), asset_root=asset_root)
            self.status_text.set(f"已匯出可編輯 PPTX：{Path(path).name}；原圖尚未包含。")
            messagebox.showinfo("已匯出可編輯 PPTX", "文字與頁面為可編輯物件。此版尚未輸出來源圖片，也未經模型生成。")


def main():
    PresentationMakerApp().mainloop()


if __name__ == "__main__":
    main()
