# 離線簡報工作室（本機試用版）

這是持續開發中的 macOS 桌面試用版，核心用途是把貼上的簡報大綱整理成投影片、用本機 Qwen-Image-2.1 為頁面生成配圖，最後輸出 PowerPoint。它尚未達到整體計劃書定義的正式完成標準。

## 快速開始

試用包：`outputs/OfflinePresentationStudio-2026.09.26-image.app`（Apple Silicon／arm64）。第一次開啟若 macOS 顯示安全提示，請在 Finder 對 App 按右鍵並選「打開」。

1. 貼上大綱；按「從剪貼簿貼上」或使用 `⌘V`，畫面會先顯示辨識頁數和標題。
2. 按「下一步：設定簡報」，確認名稱和風格，再建立專案。
3. 在逐頁編輯器修正標題、內文和圖片提示詞。
4. 按「為尚無圖片的頁面配圖」批次生成，或「為這一頁重新生成配圖」。圖片以本機 Qwen-Image-2.1 推論，逐張存入專案並顯示在預覽中；可取消後續頁面而保留已完成頁面。
5. 按「匯出 PowerPoint」，產生包含文字、圖片和版面的 `.pptx`。

編輯器也提供滑鼠拖曳區域標記、留言保存及重新開啟專案。標記目前是註記，不會自動改圖或改字。來源可匯入 PPTX、PDF、DOCX、TXT；匯出文字仍是可編輯的 PowerPoint 文字物件。

## 本機模型

- 圖片：需要本機完整 Qwen-Image-2.1 權重與相容的 PyTorch／Diffusers 環境。這台 Apple Silicon Mac 已以 MPS 實際執行過生圖；配圖介面、專案儲存及 PPTX 圖片匯出另有自動化整合測試。模型權重不裝進 `.app`，App 會使用此 Mac 上的模型。
- 文字：本機 Qwen3.8-27B MLX 權重存在時，可呼叫隨附的 `mlx-serve` 執行環境產生大綱候選。文字權重也不裝進 `.app`。AI 草稿會先供檢視，接受前不覆蓋原文。服務只監聽 `127.0.0.1`，不把簡報內容送到外部服務。

生圖是高記憶體與磁碟負載工作；此機測試時需約 31 GB 圖片模型檔案。第一次推論會載入模型，請等待狀態提示。模型未安裝或不完整時，功能應提示原因，不會默默改用雲端服務。

## 已驗證與尚未驗證

- 自動化測試：`48 passed, 1 skipped`。涵蓋大綱貼上與 21 頁解析、編輯流程、標記儲存、配圖工作流程（使用假後端）、PPTX 匯出和資料驗證。
- 打包 `.app`：PyInstaller 建置成功，隔離環境啟動測試存活 8 秒且未退出，Apple Silicon 簽章結構檢查通過。
- 生圖模型：開發環境的 Diffusers／PyTorch MPS 推論成功；**尚未在已鎖定的 macOS 桌面上以滑鼠完成封裝 App 的端到端驗收**。需解鎖後實測貼上、右鍵選單、按鈕、實際生圖和 Keynote／PowerPoint 開檔。

仍待完成的範圍包括：新電腦模型安裝引導、完整來源引用/OCR、更多版型及風格庫、深入的逐物件編輯、對話式修改與版本比較、進階圖片修編、正式安裝簽署／公證、跨機安裝與效能驗收。請把本版本視為可供本機測試的試用原型，而非已完成的正式軟體。

## 從原始碼執行與測試

```sh
cd presentation-maker-offline
python3 -m pip install -e .
presentation-maker-offline-app
python3 -m pytest -q
```

新版 Qt 入口為 `presentation_maker_offline/qt_ui.py`；`ui.py` 是舊 Tk 原型。版面與 PowerPoint 匯出位於 `presentation_maker_offline/export.py`。
