from __future__ import annotations
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from pathlib import Path
from .export import export_demo_pptx

class PresentationMakerApp(tk.Tk):
    def __init__(self):
        super().__init__(); self.title("Presentation Maker Offline"); self.geometry("1100x720"); self.minsize(900, 600)
        self.source = tk.StringVar(); self.title_text = tk.StringVar(value="我的離線簡報"); self.style = tk.StringVar(value="清爽藍"); self.output = tk.StringVar(value="可編輯式 PPTX")
        self._build()
    def _build(self):
        header = ttk.Frame(self, padding=24); header.pack(fill="x")
        ttk.Label(header, text="Presentation Maker", font=("Arial", 24, "bold")).pack(anchor="w")
        ttk.Label(header, text="在你的 Mac 上完成簡報，內容與素材不離開電腦。", foreground="#536174").pack(anchor="w", pady=(5,0))
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
        self.preview = tk.Listbox(right, font=("Arial", 16), activestyle="none"); self.preview.pack(fill="both", expand=True, pady=14)
        ttk.Button(right, text="匯出 PPTX…", command=self.export).pack(anchor="e")
    def pick(self):
        p = filedialog.askopenfilename(filetypes=[("簡報與文件", "*.pptx *.pdf *.docx *.txt"), ("所有檔案", "*")]);
        if p: self.source.set(Path(p).name); self.status.config(text="已加入來源，請確認設定後開始製作。")
    def start(self):
        self.preview.delete(0, "end"); self.preview.insert("end", self.title_text.get());
        for x in ["核心訊息與聽眾", "內容架構與重點", "行動建議與下一步"]: self.preview.insert("end", x)
        self.status.config(text=f"已完成大綱與版面預覽 · {self.operation.get()} · {self.images.get()} · {self.style.get()}")
    def export(self):
        if not self.preview.size(): self.start()
        p = filedialog.asksaveasfilename(defaultextension=".pptx", filetypes=[("PowerPoint", "*.pptx")], initialfile="offline-presentation.pptx")
        if p:
            export_demo_pptx(p, self.title_text.get(), list(self.preview.get(1, "end")), self.style.get()); self.status.config(text=f"已匯出：{Path(p).name}"); messagebox.showinfo("完成", "簡報已匯出，可用 PowerPoint 或 Keynote 開啟。")

def main(): PresentationMakerApp().mainloop()

