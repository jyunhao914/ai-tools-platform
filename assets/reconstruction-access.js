(()=>{
'use strict';
const downloadApi = 'https://script.google.com/macros/s/AKfycbx6qfQFbhAwiqA4AdRisH2HuZDw8iLQEEw-pxraTYCCoMInj0O9cpygBSsB6ii32j21/exec';
const element = id => document.getElementById(id);
const credential = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const showTicket = () => {
  element('exchange').hidden = true;
  element('ready').hidden = false;
};
const legacyArticle='image-reconstruction-guide';
const articleParam=new URLSearchParams(location.search).get('article') ?? legacyArticle;
let ticket = location.hash.slice(1);
async function post(action, data) {
  const response = await fetch(downloadApi,{method:'POST',body:new URLSearchParams({action,...data}),credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'});
  const result = await response.json();
  if (!result.ok) throw Error(result.error === 'invalid' ? '憑證無效、已使用或已過期，請洽詢管理員。' : '服務暫時無法使用，請稍後重試。');
  return result;
}
const landing=new URL('reconstruction-access.html',document.currentScript.src);
window.renderGrantEntries=function(){
  document.querySelectorAll('[data-grant-entry]').forEach(host=>{
    if(host.querySelector('form'))return;
    const details=document.createElement('details'),summary=document.createElement('summary');
    summary.textContent='取得授權下載';details.append(summary);
    const form=document.createElement('form');form.dataset.grantArticle=host.dataset.grantEntry;
    const label=document.createElement('label');label.textContent='下載驗證碼 ';
    const input=document.createElement('input');input.type='password';input.autocomplete='off';input.required=true;input.placeholder='貼上管理員提供的驗證碼';label.append(input);
    const button=document.createElement('button');button.type='submit';button.textContent='送出驗證碼';
    const status=document.createElement('span');status.setAttribute('role','status');
    const contact=document.createElement('a');contact.href='mailto:zxc80057@gmail.com';contact.textContent='聯絡管理員　zxc80057@gmail.com';
    form.append(label,button,status);details.append(form,contact);host.replaceChildren(details);
  });
};
window.renderGrantEntries();
document.addEventListener('submit',async e=>{
  const form=e.target;
  if (!form.matches('#rebuild-code-form,#exchange,form[data-grant-article]'))return;
  e.preventDefault();
  const embedded=form.id!=='exchange';
  const article=embedded?(form.dataset.grantArticle||legacyArticle):articleParam;
  const button=form.querySelector('button'),input=form.querySelector('input');
  const status=embedded?form.querySelector('[role="status"]'):element('status');
  if(button.disabled)return;
  button.disabled=true;
  status.textContent='正在驗證…';
  try {
    const next=credential();
    const result=await post('redeemRebuild',{article,code:input.value.trim(),ticket:next});
    input.value='';
    if(embedded){
      landing.searchParams.set('article',article);landing.hash=next;
      location.assign(landing.href);
      return;
    }
    ticket=next;
    history.replaceState(null,'','#'+ticket);
    showTicket();
    element('expiry').textContent='有效至 '+new Date(result.until).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})+'（台灣時間）';
    status.textContent='驗證成功，可以下載。';
  } catch(error) {status.textContent=error.message;}
  finally {button.disabled=false;}
});
if (!element('exchange'))return;
if(articleParam!==legacyArticle){
  document.querySelector('main h1').textContent='文章授權下載';
  const articleLink=document.querySelector('main > a');
  articleLink.href='../cards/'+encodeURIComponent(articleParam)+'.html';
  articleLink.textContent='← 返回文章';element('download').textContent='確認下載檔案';
  document.title='文章授權下載';
  fetch(new URL('../data.json',landing),{credentials:'omit'}).then(r=>r.json()).then(data=>{
    const card=data.cards.find(item=>String(item.id)===articleParam);
    if(card){document.querySelector('main h1').textContent=card.title;document.title=card.title+' · 授權下載';}
  }).catch(()=>{});

  document.querySelector('main a[href^="mailto:"]').href='mailto:zxc80057@gmail.com';
}
if (ticket) showTicket();
element('copy').onclick = async () => {
  try {await navigator.clipboard.writeText(location.href);element('status').textContent='已複製臨時網址。';}
  catch {element('status').textContent='請複製瀏覽器網址列中的完整網址。';}
};
element('download').onclick = async () => {
  const button=element('download');
  button.disabled=true;
  element('status').textContent='正在取得檔案…';
  try {
    const result=await post('consumeRebuild',{article:articleParam,ticket});
    const bytes=Uint8Array.from(atob(result.data),ch=>ch.charCodeAt(0));
    const url=URL.createObjectURL(new Blob([bytes],{type:result.mime||'application/octet-stream'}));
    const link=document.createElement('a');
    link.href=url;link.download=result.name;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    history.replaceState(null,'',location.pathname+location.search);
    element('ready').hidden=true;
    element('status').textContent='已送出檔案，這個網址已失效。';
  } catch(error) {element('status').textContent=error.message;button.disabled=false;}
};
element('exchange').querySelector('button').disabled=false;
element('download').disabled=false;
})();
