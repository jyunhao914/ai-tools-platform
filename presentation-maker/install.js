'use strict';
document.getElementById('copy').addEventListener('click', async () => {
  const prompt = document.getElementById('prompt');
  const status = document.getElementById('copy-status');
  try {
    await navigator.clipboard.writeText(prompt.value);
    status.textContent = '已複製！請切到 ChatGPT 桌面 App 的 Codex 本機任務，貼上並送出。';
    document.getElementById('copy').textContent = '已複製 ✓';
  } catch (_) {
    prompt.focus();
    prompt.select();
    status.textContent = '瀏覽器未允許自動複製。文字已選取，請按 Ctrl+C（Mac：⌘C），再貼到 Codex。';
  }
});
