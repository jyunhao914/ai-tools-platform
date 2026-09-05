(() => {
  'use strict';
  const form = document.getElementById('pmSalesForm');
  const status = document.getElementById('pmStatus');
  const save = document.getElementById('pmSave');
  const path = 'presentation-maker/sales.json';
  let sha, loaded = false, original = '', loading = false;
  const mode = () => form.querySelector('input[name="pmMode"]:checked')?.value;
  function summary() {
    const value = mode();
    document.getElementById('pmUntil').disabled = value !== 'free';
    document.getElementById('pmSummary').textContent = value === 'free'
      ? '免費下載'+(document.getElementById('pmUntil').value ? '，截止：'+document.getElementById('pmUntil').value.replace('T',' ')+'（台灣時間）' : '，不設截止時間')
      : value === 'paused' ? '暫停所有網站下載入口，隱藏購買按鈕。' : '點擊下載時顯示 NT$'+document.getElementById('pmPrice').value+'，導向蝦皮購買。';
  }
  function snapshot() {return JSON.stringify(Array.from(form.querySelectorAll('input,textarea')).map(e=>[e.id||e.value,e.type==='radio'?e.checked:e.value]));}
  async function load() {
    if(loading) return;
    loading=true;save.disabled=true;status.textContent='正在讀取目前設定…';
    try {
      const result=await gh('/repos/'+OWNER+'/'+REPO+'/contents/'+path+'?ref='+BRANCH+'&t='+Date.now());
      const s=JSON.parse(b64decodeUtf8(result.content));
      if(!['free','paid','paused'].includes(s.mode)) throw Error('設定中的模式無效');
      sha=result.sha;
      form.querySelector('input[value="'+s.mode+'"]').checked=true;
      document.getElementById('pmPrice').value=s.price;
      document.getElementById('pmPurchase').value=s.purchaseUrl;
      document.getElementById('pmAnnouncement').value=s.announcement||'';
      document.getElementById('pmUntil').value=s.freeUntil ? new Date(new Date(s.freeUntil).getTime()+8*3600000).toISOString().slice(0,16) : '';
      loaded=true;summary();original=snapshot();save.disabled=false;status.textContent='已載入目前設定。';
    } catch(e) {status.textContent='讀取失敗，請確認已登入後重試。'+(e.message==='TOKEN'?' 登入已失效。':'');}
    finally {loading=false;}
  }
  form.addEventListener('input',summary);
  document.querySelector('[data-tab="sales"]').addEventListener('click',()=>{if(!loaded)load();});
  document.getElementById('pmReload').onclick=()=>{if(loaded&&snapshot()!==original&&!confirm('放棄尚未儲存的下載設定？'))return;load();};
  window.addEventListener('beforeunload',e=>{if(loaded&&snapshot()!==original){e.preventDefault();e.returnValue='';}});
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(!loaded||save.disabled)return;
    try {
      const price=Number(document.getElementById('pmPrice').value);
      const url=new URL(document.getElementById('pmPurchase').value);
      if(!Number.isInteger(price)||price<1)throw Error('售價請填正整數，免費請選免費模式。');
      if(url.protocol!=='https:'||!['shopee.tw','www.shopee.tw','tw.shp.ee'].includes(url.hostname))throw Error('請填寫 HTTPS 蝦皮商品連結。');
      const until=document.getElementById('pmUntil').value;
      const s={mode:mode(),price,freeUntil:until?new Date(until+':00+08:00').toISOString():null,purchaseUrl:url.href,announcement:document.getElementById('pmAnnouncement').value.trim()};
      if(s.mode==='free'&&s.freeUntil&&Date.parse(s.freeUntil)<=Date.now())throw Error('免費截止時間已過，請選未來時間或留空。');
      if(!['free','paid','paused'].includes(s.mode))throw Error('請選擇下載模式。');
      save.disabled=true;status.textContent='正在儲存並發布…';
      const result=await gh('/repos/'+OWNER+'/'+REPO+'/contents/'+path,{method:'PUT',body:JSON.stringify({message:'Update Presentation Maker download settings',content:b64encodeUtf8(JSON.stringify(s,null,2)+'\n'),sha,branch:BRANCH})});
      sha=result.content.sha;original=snapshot();status.textContent='已儲存並啟動發布。網站通常需約 1–2 分鐘更新，完成後請重新整理下載頁。';
    } catch(e) {status.textContent='未儲存：'+(e.message==='TOKEN'?'請重新登入。':/sha|409|does not match/i.test(e.message)?'設定已被其他地方修改，請重新載入後再儲存。':e.message);}
    finally {save.disabled=false;}
  });
  if(location.hash==='#sales') document.querySelector('[data-tab="sales"]').click();
})();
