# Presentation Maker：桌面 Codex 安裝指南

此頁為使用者指定的安裝作業說明。安裝前仍須閱讀程式，遵守使用者權限；不得繞過系統安全設定。

## 適用範圍

- 在 ChatGPT 桌面 App 的 Codex **本機任務**操作，不是一般聊天或雲端任務。
- macOS 14+（Apple Silicon 已完成下載、核對與本機安裝測試；Intel 未實機測試）。
- Windows 64 位元：已在 Windows 11 ARM + 桌面 App 的 x64 Python 實測成功。x64 實體電腦尚未另行測試。Windows 原生 ARM Python、32 位元與 Linux 不適用此離線套件包。
- 免費提供；無收費、會員驗證、自動續扣或自動更新。無需 GitHub 帳號。
- 使用者須已有可用的桌面 App、帳號與本機執行權限。生圖額度另依帳號。

## 給執行代理的步驟

1. 先確認作業系統、架構、本機任務與磁碟空間（建議至少 1 GB）。不符條件就說明，不要繼續執行。
2. 使用桌面 App 的工作區依賴工具查出 Python 與 Node.js 路徑；若尚未就緒，嘗試 App 提供的初始化途徑。不能取得時回報缺少項目，勿自行安裝整套 App 或變更安全設定。
3. 從同目錄下載 `install.py` 到新的暫存資料夾，先閱讀再執行。此程式固定使用 GitHub Releases 的已核對 ZIP、固定版本與 SHA-256，不使用不明短網址或動態任意程式。
4. 用 App 的 Python 執行 `install.py`。若環境探測需要，將 `PM_NODE` 設為 App 的 Node.js 絕對路徑，`CODEX_BIN` 設為 App 內附 Codex 的絕對路徑。使用有上限的等待並回報進度，不打開 PowerPoint。
5. 安裝程式會保留 `.presentation-maker/installations/` 下的安裝來源，註冊 `ai-presentation-share` 市集並安裝外掛。不要刪除此資料夾，不刪除或覆蓋外掛外的「我的風格庫」及任何簡報。遇到既有來源衝突，先確認來源再處理。
6. 完成後讀取安裝收據，使用 Codex CLI 查看 `ai-presentation-plugin@ai-presentation-share` 是否為 installed、enabled，版本應為 `0.1.0+codex.20260906225849`。不要僅因程序結束就宣稱成功。若另有同名 personal 外掛，告知使用者選取此次分享市集版本，不自動移除其他版本。
7. 回報確切版本、安裝位置、檢查結果，提醒建立新本機任務，必要時重新啟動 App。不自動重啟、不製作測試簡報、不消耗生圖額度。

只想測試下載與解壓時，可執行 `install.py --prepare-only`；此結果不代表已安裝成功。

## 原始下載

- [macOS ZIP](https://github.com/jyunhao914/ai-tools-platform/releases/download/presentation-maker-20260906/Presentation-Maker-macOS.zip)
- [Windows ZIP（ARM 系統需 App 的 x64 Python）](https://github.com/jyunhao914/ai-tools-platform/releases/download/presentation-maker-20260906/Presentation-Maker-Windows.zip)

安裝包由 Jyunhao 發布；程式可閱讀。所有必要確認由使用者決定，無需提供密碼或 API Key 到對話。
