# 本機視覺辨識驗證（2026-09-26）

已使用本機 Qwen3-VL-8B-Instruct-4bit 進行一次真實圖片輸入測試。
來源是 outputs/qwen-whole-slide-cover-20260926.png，不提供原文答案。
執行時 HF_HUB_OFFLINE=1、TRANSFORMERS_OFFLINE=1；未下載新模型權重。

執行環境：工作區 work/vision-runtime，Python 3.11 venv（沿用 system site packages），
mlx-vlm 0.7.3、mlx 0.32.2、transformers 5.17.0。新增依賴只安裝於 venv，
沒有替換原生圖環境。pip 對繼承的其他影像套件有版本衝突警告，
此環境目前僅驗證視覺辨識，不應用於其他生圖／去背／OCR 引擎；正式封裝前需獨立鎖定依賴。

使用 CLI 圖片輸入，temperature=0、max_tokens=250。正常結束（exit 0），輸出：

> 認識大腸癌
>
> 早期發現・早期治療・守護腸道健康
>
> 一般大眾／健康衛教

結果符合畫面可見的三行文字，也保留畫面中的分隔點，沒有替換成原稿逗號。
本機既有分片可由此 runtime 成功載入，未修改模型索引或外接備份。
通過範圍僅為清楚封面三行文字的本機讀圖，不代表密集表格、座標、掃描 PDF、
閱讀順序或醫療圖片理解全部合格。下一步接入子程序介面及文字差異檢查，
並使用其他固定測例驗證。尚未接入桌面 App。
