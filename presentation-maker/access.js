(() => {
  'use strict';
  const base = new URL('.', document.currentScript.src);
  let settings = null;
  const ready = fetch(new URL('sales.json', base), {cache: 'no-store'})
    .then(r => {if (!r.ok) throw Error('settings'); return r.json();})
    .then(s => {settings = s;}).catch(() => {});
  function free() {
    return settings?.mode === 'free' && (!settings.freeUntil || Date.now() < Date.parse(settings.freeUntil));
  }
  function protectedLink(a) {
    const u = new URL(a.href, location.href);
    return (u.hostname === 'github.com' && u.pathname.includes('/jyunhao914/ai-tools-platform/releases/') && /presentation-maker/i.test(u.pathname)) ||
      (u.origin === base.origin && u.pathname.startsWith(base.pathname) && /(?:\/$|index\.html$|INSTALL\.md$|install\.py$|\.zip$)/i.test(u.pathname));
  }
  function show() {
    let d = document.getElementById('pm-access');
    if (d) d.remove();
    d = document.createElement('dialog'); d.id = 'pm-access';
    d.style.cssText = 'box-sizing:border-box;width:min(92vw,480px);padding:32px;border:1px solid #ddd;border-radius:24px;background:#fff;color:#172033;box-shadow:0 20px 90px #0005;font:16px/1.7 system-ui';
    const icon = document.createElement('img'); icon.src = new URL('../assets/presentation-maker-icon.png',base); icon.width=64; icon.alt='Presentation Maker';
    const h=document.createElement('h2');h.textContent='Presentation Maker';h.style.margin='12px 0';
    const p=document.createElement('p');p.textContent=!settings?'目前無法讀取購買資訊，請稍後重試。':settings.mode==='paused'?'目前暫停開放下載。':`NT$${settings.price} · 一次付款`;
    const note=document.createElement('p');note.textContent=settings?.mode==='paused'?'請稍後再來查看。':settings?.announcement||'';
    d.append(icon,h,p,note);
    if(settings && settings.mode!=='paused') {
      try {const u=new URL(settings.purchaseUrl); if(u.protocol==='https:' && ['shopee.tw','www.shopee.tw','tw.shp.ee'].includes(u.hostname)) {
        const a=document.createElement('a');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent='前往蝦皮購買 →';a.style.cssText='display:block;text-align:center;background:#ee4d2d;color:white;padding:12px;border-radius:12px;text-decoration:none;font-weight:700';d.append(a);
      }} catch {}
    }
    const close=document.createElement('button');close.textContent='關閉';close.style.cssText='display:block;margin:20px auto 0;border:0;background:none;color:#555;cursor:pointer';close.onclick=()=>d.close();d.append(close);
    document.body.append(d); d.showModal();
  }
  document.addEventListener('click',async e=>{
    const a=e.target.closest('a');
    if(!a || !protectedLink(a)) return;
    e.preventDefault();e.stopImmediatePropagation();await ready;
    if(free()) {location.href=a.href;} else show();
  },true);
  ready.then(()=>{
    if(location.pathname===base.pathname || location.pathname===base.pathname+'index.html') {
      if(!free()) {
        document.querySelectorAll('.install-card,.steps,details').forEach(el=>el.hidden=true);
        const header=document.querySelector('header');
        if(header) {header.replaceChildren();const h=document.createElement('h1');h.textContent='Presentation Maker';const p=document.createElement('p');p.textContent='簡報製作外掛 · NT$199';const b=document.createElement('button');b.textContent='取得外掛';b.onclick=show;header.append(h,p,b);}
        show();
      }
    }
    if(free()) {
      const notice=document.createElement('p');notice.textContent=settings.freeUntil?'限時免費下載至 '+new Date(settings.freeUntil).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'推廣期間免費下載';notice.style.cssText='padding:16px;text-align:center;background:#e8f6ef;color:#175238;font-weight:bold';
      if(location.hash.includes('1787999825773') || location.pathname.includes('1787999825773') || location.pathname.startsWith(base.pathname)) document.body.prepend(notice);
    }
  });
})();
