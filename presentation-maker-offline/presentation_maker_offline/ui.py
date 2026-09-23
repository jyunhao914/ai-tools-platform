from __future__ import annotations
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from pathlib import Path
from uuid import uuid4
from .export import export_demo_pptx
from .storage import discover_qwen38_mlx, qwen_image21_readiness
from .workflow import ProjectStore
from .project_document import new_project_document

class PresentationMakerApp(tk.Tk):
    def __init__(self):
        super().__init__(); self.title("Presentation Maker Offline"); self.geometry("1100x720"); self.minsize(900, 600)
        self.source = tk.StringVar(); self.title_text = tk.StringVar(value="我的離線簡報"); self.style = tk.StringVar(value="清爽藍"); self.output = tk.StringVar(value="可編輯式 PPTX")
        project_root = Path.home() / "Library" / "Application Support" / "PresentationMaker"
        project_root.mkdir(parents=True, exist_ok=True)
        self.project_store = ProjectStore(project_root / "projects.sqlite3")
        self.current_project_id = None
        self._build()
    def _build(self):
        header = ttk.Frame(self, padding=24); header.pack(fill="x")
        ttk.Label(header, text="Presentation Maker", font=("Arial", 24, "bold")).pack(anchor="w")
        ttk.Label(header, text="在你的 Mac 上完成簡報，內容與素材不離開電腦。", foreground="#536174").pack(anchor="w", pady=(5,0))
        nav = ttk.Frame(header); nav.pack(fill="x", pady=(16,0))
        self.step = tk.StringVar(value="1 來源  ·  2 設定  ·  3 製作  ·  4 編輯與匯出")
        ttk.Label(nav, textvariable=self.step, foreground="#2457a6").pack(side="left")
        ttk.Button(nav, text="模型與儲存設定", command=self.show_settings).pack(side="right")
        body = ttk.Frame(self, padding=(24, 4)); body.pack(fill="both", expand=True)
        left = ttk.LabelFrame(body, text="建立專案", padding=18); left.pack(side="left", fill="y", padx=(0,18))
        ttk.Button(left, text="匯入檔案…", command=self.pick).pack(fill="x")
        ttk.Label(left, textvariable=self.source, wraplength=250).pack(anchor="w", pady=8)
        ttk.Label(left, text="簡報名稱").pack(anchor="w", pady=(12,3)); ttk.Entry(left, textvariable=self.title_text, width=30).pack(fill="x")
        ttk.Label(left, text="處理方式").pack(anchor="w", pady=(16,3))
        self.operation = ttk.Combobox(left, values=["保留內容", "縮減內容", "擴增內容", "還原大綱", "擷取風格"], state="readonly"); self.operation.current(0); self.operation.pack(fill="x")
        ttk.Label(left, text="整份圖片策略").pack(anchor="w", pady=(16,3))
        self.images = ttk.Combobox(left, values=["不用圖片", "沿用原圖", "超擬真重繪", "自由配圖"], state="readonly"); self.images.current(1); self.images.pack(fill="x")
        ttk.Label(left, text="輸出格式").pack(anchor="w", pady=(16,3)); ttk.Combobox(left, textvariable=self.output, values=["圖像式 PPTX", "可編輯式 PPTX"], state="readonly").pack(fill="x")
        ttk.Label(left, text="風格").pack(anchor="w", pady=(16,3)); ttk.Combobox(left, textvariable=self.style, values=["清爽藍", "雜誌編輯", "自然療癒", "高科技"], state="readonly").pack(fill="x")
        ttk.Button(left, text="開始製作", command=self.start).pack(fill="x", pady=(24,0))
        right = ttk.LabelFrame(body, text="逐頁預覽", padding=18); right.pack(side="left", fill="both", expand=True)
        self.status = ttk.Label(right, text="先匯入檔案，或直接開始建立示例簡報。", foreground="#536174"); self.status.pack(anchor="w")
        self.progress = ttk.Progressbar(right, mode="determinate", maximum=100); self.progress.pack(fill="x", pady=(10, 4))
        self.preview = tk.Listbox(right, font=("Arial", 16), activestyle="none"); self.preview.pack(fill="both", expand=True, pady=14)
        ttk.Button(right, text="匯出 PPTX…", command=self.export).pack(anchor="e")
    def pick(self):
        p = filedialog.askopenfilename(filetypes=[("簡報與文件", "*.pptx *.pdf *.docx *.txt"), ("所有檔案", "*")]);
        if p: self.source.set(Path(p).name); self.status.config(text="已加入來源，請確認設定後開始製作。")
    def start(self):
        title = self.title_text.get().strip() or "未命名簡報"
        document = new_project_document(title)
        slide_titles = [title, "核心訊息與聽眾", "內容架構與重點", "行動建議與下一步"]
        document["slides"] = [
            {"id": str(uuid4()), "order": index, "title": heading, "elements": []}
            for index, heading in enumerate(slide_titles)
        ]
        source_path = self.source.get() or "example://sample-project"
        self.current_project_id = self.project_store.create(source_path)
        self.project_store.save_document(self.current_project_id, document, expected_revision=0)
        self.preview.delete(0, "end"); self.preview.insert("end", self.title_text.get());
        for x in ["核心訊息與聽眾", "內容架構與重點", "行動建議與下一步"]: self.preview.insert("end", x)
        self.progress["value"] = 100
        self.step.set("1 ✓ 來源  ·  2 ✓ 設定  ·  3 ✓ 製作  ·  4 編輯與匯出")
        self.status.config(text=f"示例專案已保存 · {self.operation.get()} · {self.images.get()} · {self.style.get()} · 模型流程尚未串接")
    def export(self):
        if not self.preview.size(): self.start()
        p = filedialog.asksaveasfilename(defaultextension=".pptx", filetypes=[("PowerPoint", "*.pptx")], initialfile="offline-presentation.pptx")
        if p:
            export_demo_pptx(p, self.title_text.get(), list(self.preview.get(1, "end")), self.style.get()); self.status.config(text=f"示例 PPTX 已匯出：{Path(p).name} · 模型流程尚未串接"); messagebox.showinfo("完成", "示例簡報已匯出，可用 PowerPoint 或 Keynote 開啟。此功能目前輸出示例內容，模型工作流程尚未串接。")
    def show_settings(self):
        win = tk.Toplevel(self); win.title("模型與儲存設定"); win.geometry("520x300"); win.transient(self)
        ttk.Label(win, text="進階設定", font=("Arial", 16, "bold")).pack(anchor="w", padx=22, pady=(20,4))
        ttk.Label(win, text="一般流程不需要理解模型細節。以下僅顯示本機狀態。", foreground="#536174").pack(anchor="w", padx=22)
        box = ttk.LabelFrame(win, text="本機引擎狀態", padding=14); box.pack(fill="x", padx=22, pady=18)
        text_model = discover_qwen38_mlx()
        image_model = qwen_image21_readiness()
        text_status = f"文字模型　Qwen3.8-27B　✓ 已找到（MLX，{len(list(text_model.glob('*.safetensors')))} 個分片）" if text_model else "文字模型　Qwen3.8-27B　尚未找到完整模型資料夾"
        image_status = f"圖片模型　Qwen-Image-2.1　✓ 權重完整（{image_model['safetensors']} 個權重檔）；推論載入尚未驗證" if image_model["ready"] else f"圖片模型　Qwen-Image-2.1　尚未完整（缺少 {len(image_model['missing'])} 項，暫存 {len(image_model['incomplete'])} 項）"
        ttk.Label(box, text=text_status, wraplength=455).pack(anchor="w")
        ttk.Label(box, text=image_status, wraplength=455).pack(anchor="w", pady=(8,0))
        ttk.Label(box, text="儲存位置　由使用者選定的外接磁碟／模型資料夾").pack(anchor="w", pady=(8,0))
        ttk.Button(win, text="關閉", command=win.destroy).pack(anchor="e", padx=22)

def main(): PresentationMakerApp().mainloop()

if __name__ == "__main__":
    main()
