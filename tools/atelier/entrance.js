(() => {
  const query = new URLSearchParams(location.search);
  const navigation = performance.getEntriesByType('navigation')[0];
  if (location.hash || query.has('q') || query.has('admin') || navigation?.type === 'back_forward') return;

  const dialog = document.createElement('dialog');
  if (!dialog.showModal) return;
  const base = new URL('.', document.currentScript.src);
  dialog.id = 'atelierEntrance';
  dialog.setAttribute('aria-label', 'AI 工具資源平台入口');
  dialog.style.cssText = 'position:fixed;inset:0;margin:0;width:100%;height:100%;max-width:none;max-height:none;padding:0;border:0;overflow:hidden;background:#f3f2ea;color:#243c37;color-scheme:light;';

  const host = document.createElement('div');
  const view = host.attachShadow({mode: 'open'});
  view.innerHTML = `
    <style>
      :host{display:block;height:100%;color:#243c37;font:16px/1.45 system-ui,sans-serif}
      .page{height:100%;padding:1.5rem}header{display:flex;justify-content:space-between}
      .enter{cursor:pointer;padding:.8rem 1.1rem;color:#fff;background:#274c43;border:0;border-radius:6px}
      [hidden]{display:none!important}
    </style>
    <div class="page">
      <header>
        <div class="brand"><span class="brandmark" aria-hidden="true">✳</span><span>Jyunhao</span><span class="brand-detail">AI 工具資源平台</span></div>
        <button id="pause" type="button" aria-pressed="false" hidden><i aria-hidden="true"></i><span>暫停動態</span></button>
      </header>
      <main>
        <section class="intro">
          <div class="details">
            <h1>AI 工具<br>資源平台</h1>
            <p id="copy">拖曳環看街區，用滾輪或雙指縮放。</p>
          </div>
          <button class="enter" type="button" aria-label="進入工具平台" autofocus>進入工具平台 <small aria-hidden="true">10 秒</small><span aria-hidden="true">↗</span></button>
        </section>
        <div id="scene" class="loading"><div class="loader" role="status">載入微縮街區…</div></div>
      </main>
    </div>`;
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL('world.css', base);
  view.querySelector('style').after(style);
  dialog.append(host);
  document.body.prepend(dialog);
  dialog.showModal();

  const stage = view.querySelector('#scene');
  const enter = view.querySelector('.enter');
  const count = enter.querySelector('small');
  const pause = view.querySelector('#pause');
  const copy = view.querySelector('#copy');
  const frame = document.createElement('iframe');
  frame.title = '互動式 3D 微縮街區';
  frame.src = new URL('scene.html', base);
  const previousOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  const listeners = new AbortController();
  const options = {signal: listeners.signal};
  let remaining = 10000;
  let startedAt = null;
  let clock = 0;
  let counting = true;

  function stopCountdown() {
    counting = false;
    clearInterval(clock);
    count.hidden = true;
  }
  function enterPlatform() {
    if (!dialog.open) return;
    stopCountdown();
    listeners.abort();
    document.documentElement.style.overflow = previousOverflow;
    dialog.close();
    dialog.remove();
    document.getElementById('homeLink')?.focus({preventScroll: true});
  }
  function tick() {
    const left = remaining - (startedAt === null ? 0 : performance.now() - startedAt);
    count.textContent = Math.max(0, Math.ceil(left / 1000)) + ' 秒';
    if (left <= 0) enterPlatform();
  }
  function syncClock() {
    clearInterval(clock);
    if (!counting) return;
    if (startedAt !== null) remaining -= performance.now() - startedAt;
    startedAt = document.hidden ? null : performance.now();
    if (!document.hidden) clock = setInterval(tick, 200);
    tick();
  }
  function showPoster() {
    stage.className = 'still';
    stage.querySelector('.loader')?.remove();
    copy.hidden = true;
    pause.hidden = true;
    frame.remove();
  }
  function receive(event) {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.channel !== 'atelier') return;
    const {type, paused} = event.data;
    if (type === 'unavailable') { showPoster(); return; }
    if (type === 'explore') { stopCountdown(); return; }
    if (type === 'ready') {
      stage.className = 'ready';
      stage.querySelector('.loader')?.remove();
      pause.hidden = false;
    }
    if (type === 'playback' || type === 'ready') {
      pause.setAttribute('aria-pressed', String(paused));
      pause.querySelector('span').textContent = paused ? '播放動態' : '暫停動態';
    }
  }
  enter.addEventListener('click', enterPlatform);
  pause.addEventListener('click', () => {
    stopCountdown();
    frame.contentWindow?.postMessage({channel: 'atelier', type: 'toggle'}, location.origin);
  });
  dialog.addEventListener('keydown', stopCountdown);
  dialog.addEventListener('cancel', event => { event.preventDefault(); enterPlatform(); });
  frame.addEventListener('error', showPoster);
  window.addEventListener('message', receive, options);
  window.addEventListener('hashchange', () => { if (location.hash) enterPlatform(); }, options);
  document.addEventListener('visibilitychange', syncClock, options);
  stage.append(frame);
  syncClock();
})();
