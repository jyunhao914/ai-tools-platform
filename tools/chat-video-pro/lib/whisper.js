// OpenAI Whisper transcription. Optional — only used if user picks the Whisper tab.
// Returns transcript in SRT format with timestamps.

window.CVP = window.CVP || {};

window.CVP.whisper = (function () {
  const API_URL = "https://api.openai.com/v1/audio/transcriptions";

  async function transcribe({ apiKey, file, language }) {
    if (!apiKey) throw new Error("缺少 OpenAI API Key，請到設定填入。");
    if (!file) throw new Error("沒有選擇媒體檔案。");

    const form = new FormData();
    form.append("file", file);
    form.append("model", "whisper-1");
    form.append("response_format", "srt");
    if (language) form.append("language", language);

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Whisper API 錯誤 ${res.status}: ${errText}`);
    }

    return await res.text();
  }

  return { transcribe };
})();
