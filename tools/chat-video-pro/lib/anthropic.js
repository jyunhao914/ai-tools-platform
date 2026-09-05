// Anthropic Claude API client for the UXP runtime.
// UXP provides global fetch(); we only need to send Messages-API requests.

window.CVP = window.CVP || {};

window.CVP.anthropic = (function () {
  const API_URL = "https://api.anthropic.com/v1/messages";
  const API_VERSION = "2023-06-01";

  const SYSTEM_PROMPT = `你是一位資深的社群短影音剪輯師。使用者會給你一份 podcast 的逐字稿（含時間戳）。
你的任務是挑出最適合社群分享的精華片段，並以 JSON 陣列回傳。

挑選原則：
- 找出有金句、轉折、情緒張力、實用 tips、或話題性強的段落
- 每段必須是一個語意完整的單元，不要從句子中間切斷
- 避免冷場、寒暄、廣告
- 片段時間應符合使用者指定的長度

回傳格式（只回 JSON，不要任何其他文字）：
{
  "clips": [
    {
      "title": "簡短標題（10 字內，作為剪輯片段名稱）",
      "start_seconds": 12.5,
      "end_seconds": 58.3,
      "reason": "為什麼選這段（一句話）"
    }
  ]
}`;

  async function pickClips({ apiKey, model, transcript, clipCount, clipDuration, style }) {
    if (!apiKey) throw new Error("缺少 Anthropic API Key，請到設定填入。");
    if (!transcript || transcript.trim().length === 0) throw new Error("逐字稿是空的。");

    const userMessage = [
      `請從以下逐字稿挑出 ${clipCount} 個精華片段，每段約 ${clipDuration} 秒。`,
      style ? `風格需求：${style}` : "",
      "",
      "=== 逐字稿開始 ===",
      transcript,
      "=== 逐字稿結束 ===",
    ].filter(Boolean).join("\n");

    const body = {
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    };

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Claude API 錯誤 ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text ?? "";
    return parseClipsFromResponse(text);
  }

  function parseClipsFromResponse(text) {
    // The model may wrap JSON in markdown fences or include preamble — try to be lenient.
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = fenceMatch ? fenceMatch[1] : text;
    const braceStart = jsonStr.indexOf("{");
    const braceEnd = jsonStr.lastIndexOf("}");
    if (braceStart === -1 || braceEnd === -1) {
      throw new Error("Claude 回傳的內容不是有效 JSON。原文:\n" + text);
    }
    const parsed = JSON.parse(jsonStr.slice(braceStart, braceEnd + 1));
    if (!Array.isArray(parsed.clips)) {
      throw new Error("Claude 回傳的 JSON 缺少 clips 陣列。");
    }
    return parsed.clips.map((c) => ({
      title: String(c.title || "Untitled"),
      startSeconds: Number(c.start_seconds),
      endSeconds: Number(c.end_seconds),
      reason: String(c.reason || ""),
    })).filter((c) => Number.isFinite(c.startSeconds) && Number.isFinite(c.endSeconds) && c.endSeconds > c.startSeconds);
  }

  return { pickClips };
})();
