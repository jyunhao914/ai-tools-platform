export function wallUI(paint,onClose){
  const board=document.getElementById('community-board'),form=document.getElementById('board-form');
  const list=document.getElementById('board-entries'),empty=document.getElementById('board-empty'),status=document.getElementById('board-status');
  const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  const endpoint=local?new URL('../../api/guestbook',import.meta.url):'https://script.google.com/macros/s/AKfycbyfGtZOX9gdUFw6DIgkzOn8w3b4Aczr9J144qkyUO0wf1M0X31h1uOZilIjuB2xx3b7/exec';
  const refresh=document.getElementById('board-refresh');
  const time=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  let request=0,posting=false,attempt=null;
  function element(tag,content){const e=document.createElement(tag);e.textContent=content;return e;}
  async function load(){
    const seq=++request;refresh.disabled=true;
    try{
      const response=await fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(25000)});
      if(!response.ok)throw Error();
      const {entries}=await response.json();
      if(seq!==request)return;
      paint(entries);
      const items=entries.map(entry=>{
        const li=document.createElement('li'),header=document.createElement('header'),stamp=element('time',time.format(new Date(entry.created)));
        stamp.dateTime=entry.created;header.append(element('strong',entry.name),stamp);li.append(header,element('p',entry.message));return li;
      });
      list.replaceChildren(...items);empty.textContent=items.length?'':'牆上還沒有留言。你可以貼上第一張便條。';empty.hidden=!!items.length;
    }catch{if(seq===request){empty.hidden=false;empty.textContent='暫時無法讀取留言，可點「更新留言」重試。';}}
    finally{if(seq===request)refresh.disabled=false;}
  }
  refresh.onclick=load;
  document.getElementById('board-close').onclick=()=>board.close();
  board.addEventListener('close',onClose);
  form.onsubmit=async event=>{
    event.preventDefault();if(posting)return;
    const name=document.getElementById('board-name').value.trim(),body=document.getElementById('board-body'),message=body.value.trim();
    if(!message){status.textContent='請輸入留言內容。';body.focus();return;}
    if(!attempt||attempt.name!==name||attempt.message!==message)attempt={name,message,token:crypto.randomUUID()};
    posting=true;const button=form.querySelector('button');button.disabled=body.readOnly=true;status.textContent='送出中…';
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':local?'application/json':'text/plain;charset=UTF-8'},body:JSON.stringify(attempt),signal:AbortSignal.timeout(30000)});
      if(!response.ok||!(await response.json()).ok)throw Error();
      attempt=null;body.value='';status.textContent='留言已送出。';await load();
    }catch{status.textContent='送出狀態尚未確認，可重試同一則留言。';}
    finally{posting=false;button.disabled=body.readOnly=false;}
  };
  return {load,open(){if(!board.open)board.showModal();load();}};
}
