// Chat Video Pro Lite — main UI controller for the UXP panel.

(function () {
  const $ = (sel) => document.querySelector(sel);
  const STORAGE_KEY = "cvp.settings.v1";

  const state = {
    settings: loadSettings(),
    sourceItem: null,
    sourceItemName: "",
    selectedMediaFile: null,
    transcriptMode: "paste", // 'paste' | 'whisper'
    clips: [],
  };

  // ---------- Settings (persistence) ----------
  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      anthropicKey: "",
      openaiKey: "",
      claudeModel: "claude-sonnet-4-6",
    };
  }

  function saveSettings(s) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    state.settings = s;
  }

  // ---------- UI helpers ----------
  function setStatus(el, text, kind) {
    el.textContent = text;
    el.style.color =
      kind === "error" ? "var(--danger)" :
      kind === "success" ? "#4caf50" :
      "var(--fg-muted)";
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(1);
    return `${m}:${s.padStart(4, "0")}`;
  }

  function renderClipsList() {
    const ul = $("#clipsList");
    ul.innerHTML = "";
    for (const c of state.clips) {
      const li = document.createElement("li");
      const title = document.createElement("div");
      title.className = "clip-title";
      title.textContent = c.title;
      const time = document.createElement("div");
      time.className = "clip-time";
      time.textContent = `${formatTime(c.startSeconds)} → ${formatTime(c.endSeconds)}  ·  ${(c.endSeconds - c.startSeconds).toFixed(1)}s`;
      const reason = document.createElement("div");
      reason.className = "muted small";
      reason.textContent = c.reason;
      li.appendChild(title);
      li.appendChild(time);
      if (c.reason) li.appendChild(reason);
      ul.appendChild(li);
    }
  }

  // ---------- Settings modal ----------
  function openSettings() {
    $("#anthropicKey").value = state.settings.anthropicKey || "";
    $("#openaiKey").value = state.settings.openaiKey || "";
    $("#claudeModel").value = state.settings.claudeModel || "claude-sonnet-4-6";
    $("#settingsModal").classList.remove("hidden");
  }

  function closeSettings() {
    $("#settingsModal").classList.add("hidden");
  }

  $("#btnSettings").addEventListener("click", openSettings);
  $("#btnCloseSettings").addEventListener("click", closeSettings);
  $("#btnSaveSettings").addEventListener("click", () => {
    saveSettings({
      anthropicKey: $("#anthropicKey").value.trim(),
      openaiKey: $("#openaiKey").value.trim(),
      claudeModel: $("#claudeModel").value,
    });
    closeSettings();
  });

  // ---------- Tabs ----------
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.mode;
      state.transcriptMode = mode;
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      $("#paneTranscriptPaste").classList.toggle("hidden", mode !== "paste");
      $("#paneTranscriptWhisper").classList.toggle("hidden", mode !== "whisper");
    });
  });

  // ---------- Step 1: bind source project item ----------
  $("#btnPickSourceItem").addEventListener("click", async () => {
    const info = $("#sourceItemInfo");
    try {
      if (!CVP.premiere.isAvailable()) {
        throw new Error("此功能僅在 Premiere Pro 內可用。");
      }
      const { item, name } = await CVP.premiere.getSelectedProjectItem();
      state.sourceItem = item;
      state.sourceItemName = name;
      setStatus(info, `已綁定：${name}`, "success");
    } catch (err) {
      state.sourceItem = null;
      setStatus(info, `錯誤：${err.message}`, "error");
    }
  });

  // ---------- Step 2: whisper file select & transcribe ----------
  $("#mediaFile").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    state.selectedMediaFile = file || null;
    const info = $("#mediaFileInfo");
    if (file) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      setStatus(info, `${file.name}（${mb} MB）`);
      $("#btnTranscribe").disabled = false;
    } else {
      setStatus(info, "尚未選擇");
      $("#btnTranscribe").disabled = true;
    }
  });

  $("#btnTranscribe").addEventListener("click", async () => {
    const status = $("#transcribeStatus");
    const btn = $("#btnTranscribe");
    btn.disabled = true;
    setStatus(status, "上傳並轉錄中（檔案越大越久）...");
    try {
      const srt = await CVP.whisper.transcribe({
        apiKey: state.settings.openaiKey,
        file: state.selectedMediaFile,
      });
      $("#transcriptInput").value = srt;
      // Switch to paste tab so user can review/edit
      document.querySelector('.tab[data-mode="paste"]').click();
      setStatus(status, "完成！逐字稿已填入上方文字框。", "success");
    } catch (err) {
      setStatus(status, `錯誤：${err.message}`, "error");
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- Step 4: generate clips ----------
  $("#btnGenerate").addEventListener("click", async () => {
    const status = $("#generateStatus");
    const btn = $("#btnGenerate");
    btn.disabled = true;
    state.clips = [];
    renderClipsList();

    try {
      if (!state.sourceItem) {
        throw new Error("請先完成步驟 1：綁定來源素材。");
      }
      const transcript = $("#transcriptInput").value.trim();
      if (!transcript) {
        throw new Error("請先完成步驟 2：提供逐字稿。");
      }

      setStatus(status, "Claude 正在分析逐字稿並挑選精華片段...");
      const clips = await CVP.anthropic.pickClips({
        apiKey: state.settings.anthropicKey,
        model: state.settings.claudeModel,
        transcript,
        clipCount: parseInt($("#clipCount").value, 10),
        clipDuration: parseInt($("#clipDuration").value, 10),
        style: $("#clipStyle").value.trim(),
      });

      state.clips = clips;
      renderClipsList();
      setStatus(status, `Claude 挑出 ${clips.length} 個片段，正在寫入 Premiere 時間軸...`);

      const inserted = await CVP.premiere.insertClipsToActiveSequence({
        projectItem: state.sourceItem,
        clips,
        onProgress: (i, total, clip) => {
          setStatus(status, `寫入第 ${i}/${total} 段：${clip.title}`);
        },
      });

      setStatus(status, `✅ 完成！已插入 ${inserted} 個片段到時間軸。`, "success");
    } catch (err) {
      console.error(err);
      setStatus(status, `錯誤：${err.message}`, "error");
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- First-run hint ----------
  if (!state.settings.anthropicKey) {
    setStatus($("#generateStatus"), "提示：請先點右上角 ⚙ 設定 API Key。");
  }
})();
