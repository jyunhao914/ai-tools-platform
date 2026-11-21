(() => {
  const url=new URL(location.href);
  if(url.searchParams.get('view')==='tools'){
    url.searchParams.delete('view');
    url.searchParams.delete('street');url.searchParams.delete('sight');url.searchParams.delete('light');
    history.replaceState(history.state,'',url);
    return;
  }
  const exploreOnArrival=url.searchParams.get('view')==='town';
  const navigation=performance.getEntriesByType('navigation')[0];
  if(location.hash||url.searchParams.has('q')||url.searchParams.has('admin')||(!exploreOnArrival&&navigation?.type==='back_forward'))return;
  const dialog=document.createElement('dialog');
  if(!dialog.showModal)return;
  const base=new URL('.',document.currentScript.src);
  dialog.id='atelierEntrance';dialog.setAttribute('aria-label','AI 工具資源平台入口');
  dialog.style.cssText='position:fixed;inset:0;margin:0;width:100%;height:100%;max-width:none;max-height:none;padding:0;border:0;overflow:hidden;background:#324744;color:#fff8e8;color-scheme:light;';
  const host=document.createElement('div'),view=host.attachShadow({mode:'open'});
  view.innerHTML=`
    <style>
      :host{display:block;height:100%;font:16px/1.45 system-ui,sans-serif}.page{height:100%;position:relative}
      .enter{color:#173d34;background:#fff1d4;padding:.77rem 1.2rem;border-radius:5px;cursor:pointer}
      [hidden]{display:none!important}
    </style>
    <div class="page">
      <div id="scene" class="loading"><div class="loader" role="status">載入街景…</div></div>
      <header><dl class="visits" aria-label="瀏覽統計" title="依造訪次數累計">
        <div><dt>累計人次</dt><dd id="visits-total">—</dd></div>
        <div><dt>今日人次</dt><dd id="visits-today">—</dd></div></dl>
        <div class="header-tools"><details id="climate" hidden><summary aria-label="街景時間與臺中天氣"><span class="clock">臺灣時間</span><span class="conditions"></span><span aria-hidden="true">⌄</span></summary>
        <div class="settings"><label>街景時間<select name="when"><option value="auto">臺灣現在時間</option><option value="dawn">凌晨</option><option value="morning">早晨</option><option value="noon">正午</option><option value="dusk">黃昏</option><option value="night">夜間</option></select></label>
        <label>街景天氣<select name="weather"><option value="auto">跟隨臺中天氣</option><option value="clear">預覽晴天</option><option value="cloud">預覽多雲</option><option value="rain">預覽細雨</option></select></label><p class="source"><span></span> <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a></p></div></details>
        <button id="pause" type="button" aria-pressed="false" hidden><i aria-hidden="true"></i><span>暫停動態</span></button></div></header>
      <div class="dock">
        <section class="intro"><h1>AI 工具資源平台</h1>
          <a class="enter" aria-label="進入工具平台" autofocus>進入工具平台 <small aria-hidden="true" hidden></small><span aria-hidden="true">↗</span></a>
        </section>
        <nav id="explore" aria-label="探索城鎮" hidden>
          <p id="copy">拖曳環顧，點店門入內。</p>
          <div class="destinations" aria-label="街區地點"><button type="button" id="guide-launch">臺中導覽圖</button><button type="button" data-go="film">走進平台室內</button><select id="station-tools" aria-label="依工作台找工具" hidden><option value="">依工作台找工具</option><option value="video">影片剪輯台</option><option value="slides">簡報製作桌</option><option value="illustration">圖像工作區</option></select><button type="button" id="open-wall" hidden>讀寫留言牆</button><button type="button" data-go="overview">全景</button><button type="button" data-go="street" hidden>回街上</button></div>
          <div class="steps" aria-label="步行"><button data-step="-1" type="button" aria-label="後退">↓</button><button data-step="1" type="button" aria-label="前進">前進 ↑</button></div>
        </nav>
      </div>
      <dialog id="city-guide" aria-labelledby="guide-title"><div class="guide-bar"><h2 id="guide-title">臺中導覽圖</h2><button id="guide-close" autofocus>關閉 ×</button></div>
      <div class="guide-columns"><div><svg id="guide-map" role="img" aria-label="臺中市行政區圖"></svg><p>點選有標記的行政區，探索街景。</p><button id="guide-studio">走進 AI 平台工作室 →</button></div>
      <div><select id="guide-area" aria-label="選擇行政區"><option value="">所有景點</option></select><div id="guide-places"></div></div></div></dialog>
    </div>`;
  const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('world.css?v=studio-tables-1',base);
  view.querySelector('style').after(style);
  const stage=view.querySelector('#scene'),enter=view.querySelector('.enter'),count=enter.querySelector('small');
  const taiwanHour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
  if(taiwanHour>=18||taiwanHour<6)stage.style.backgroundImage='url("'+new URL('town-poster-night.webp',base)+'")';
  const pause=view.querySelector('#pause'),nav=view.querySelector('#explore'),copy=view.querySelector('#copy');
  const climate=view.querySelector('#climate');
  const catalog=new URL(location.href);catalog.searchParams.delete('street');catalog.searchParams.delete('sight');catalog.searchParams.delete('light');catalog.searchParams.set('view','tools');enter.href=catalog;
  dialog.append(host);document.body.prepend(dialog);
  const frame=document.createElement('iframe');frame.title='互動式 3D 微縮街區';const sceneUrl=new URL('scene.html?v=studio-tables-1',base);
  const street=url.searchParams.get('street');if(exploreOnArrival&&['market','court','clinic','fruit'].includes(street))sceneUrl.searchParams.set('street',street);
  frame.src=sceneUrl;
  const previousOverflow=document.documentElement.style.overflow;
  const listeners=new AbortController(),options={signal:listeners.signal};
  const numbers=new Intl.NumberFormat('zh-TW'),dayInTaiwan=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'});
  const visitsKey='atelier-visit-totals-v1';
  let lastVisits=null;
  try{
    const saved=JSON.parse(localStorage.getItem(visitsKey));
    if(saved&&Number.isSafeInteger(saved.total)&&saved.total>=0&&Number.isSafeInteger(saved.today)&&saved.today>=0&&typeof saved.day==='string')lastVisits=saved;
  }catch{}
  function showVisits(total,today){
    view.querySelector('#visits-total').textContent=numbers.format(total);
    view.querySelector('#visits-today').textContent=today===null?'—':numbers.format(today);
  }
  if(lastVisits)showVisits(lastVisits.total,lastVisits.day===dayInTaiwan.format(new Date())?lastVisits.today:null);
  document.addEventListener('catalog-visits',event=>{
    const {total,today}=event.detail,day=dayInTaiwan.format(new Date());
    if(today!==null){
      lastVisits={day,total,today};
      try{localStorage.setItem(visitsKey,JSON.stringify(lastVisits));}catch{}
      showVisits(total,today);
    }else{
      showVisits(Math.max(total,lastVisits?.total||0),lastVisits?.day===day?lastVisits.today:null);
    }
  },options);
  let remaining=10000,startedAt=null,clock=0,clockReady=false,counting=!exploreOnArrival,loadingTimer=0;
  const post=(type,extra={})=>frame.contentWindow?.postMessage({channel:'atelier',type,...extra},location.origin);
  function stopCountdown(){counting=false;clearInterval(clock);count.hidden=true;}
  function enterPlatform(){
    if(!dialog.open)return;
    stopCountdown();clearTimeout(loadingTimer);listeners.abort();
    document.documentElement.style.overflow=previousOverflow;
    if(exploreOnArrival){url.searchParams.delete('view');url.searchParams.delete('street');url.searchParams.delete('sight');url.searchParams.delete('light');history.replaceState(history.state,'',url);}
    dialog.close();dialog.remove();
    document.getElementById('homeLink')?.focus({preventScroll:true});
  }
  function tick(){
    const left=remaining-(startedAt===null?0:performance.now()-startedAt);
    count.textContent=Math.max(0,Math.ceil(left/1000))+' 秒';
    if(left<=0)enterPlatform();
  }
  function syncClock(){
    clearInterval(clock);
    if(!counting||!clockReady)return;
    if(startedAt!==null)remaining-=performance.now()-startedAt;
    startedAt=document.hidden?null:performance.now();
    if(!document.hidden)clock=setInterval(tick,160);
    tick();
  }
  function startClock(){if(clockReady)return;clockReady=true;count.hidden=!counting;syncClock();}
  function poster(terminal){
    stage.className='still';stage.querySelector('.loader')?.remove();pause.hidden=true;nav.hidden=true;climate.hidden=true;
    if(terminal)frame.remove();startClock();
  }
  const placeNames={film:'AI 工具資源平台',print:'設計室',overview:'全景',street:'街道'};
  let sightNames={};
  const initialSight=url.searchParams.get('sight');
  const landmarks=import(new URL('city-places.js',base)).then(({sights})=>{
    sightNames=sights;for(const [id,place] of Object.entries(sights))placeNames[id]=place.name;
    return sights;
  });
  const guideReady=import(new URL('guide.js',base)).then(m=>m.cityGuide(view,place=>post('go',{place})));
  view.querySelector('#guide-launch').onclick=async()=>{stopCountdown();(await guideReady)();};
  function showPlace(place,travel){
    if(!placeNames[place])return;
    nav.dataset.place=place;nav.dataset.travel=String(travel);
    copy.textContent=travel?'正在前往'+placeNames[place]+'…':place==='street'?'拖曳環顧，點店門入內。':place==='overview'?'拖曳轉動全景，點店面或回街上。':'在'+placeNames[place]+'內，可以移動或轉身看街景。';
    if(Object.hasOwn(sightNames,place))copy.textContent=placeNames[place]+'　·　拖曳環顧';
    nav.querySelector('[data-go="street"]').hidden=place==='street';
    nav.querySelector('[data-go="film"]').hidden=place==='film';
    view.querySelector('#open-wall').hidden=place!=='film'||travel;
    view.querySelector('#station-tools').hidden=place!=='film'||travel;
    if(place==='film'&&!travel)copy.textContent='點工作台的螢幕找工具，也可以在牆上貼留言。';
    nav.querySelector('.steps').hidden=place==='overview';
    for(const b of nav.querySelectorAll('[data-go]'))b.setAttribute('aria-pressed',String(b.dataset.go===place));
  }
  const stationQueries={video:'剪輯',slides:'簡報',illustration:'插畫'};
  function stationCatalog(key){
    if(nav.dataset.place!=='film'||nav.dataset.travel==='true'||!Object.hasOwn(stationQueries,key))return;
    const roomURL=new URL(location.href);roomURL.searchParams.set('view','town');roomURL.searchParams.set('street','studio');roomURL.searchParams.delete('sight');
    history.replaceState(history.state,'',roomURL);
    const results=new URL(location.href);
    for(const name of ['view','street','sight','light'])results.searchParams.delete(name);
    results.searchParams.set('q',stationQueries[key]);results.hash='tools';
    location.assign(results.href);
  }
  const stationChoice=view.querySelector('#station-tools');
  stationChoice.onchange=()=>{const key=stationChoice.value;stationChoice.value='';stationCatalog(key);};
  function receive(event){
    if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.channel!=='atelier')return;
    const {type,paused,place}=event.data;
    if(type==='toolsFor'){stationCatalog(event.data.station);return;}
    if(type==='climate'){
      climate.querySelector('.clock').textContent=(event.data.when==='auto'?'臺灣 ':'預覽 ')+event.data.time;
      const {weather,source,dataTime}=event.data;
      climate.querySelector('.conditions').textContent=(source==='manual'?'預覽':source==='recent'?'先前':'')+weather;
      climate.querySelector('.source span').textContent=source==='manual'?'手動預覽':source==='current'?'臺中市區估算 '+dataTime:source==='recent'?'最近取得 '+dataTime:source==='loading'?'連線中':'暫時無法取得天氣';
      climate.querySelector('.source a').hidden=source==='manual';return;
    }
    if(type==='wallOpen'||type==='wallClosed'){
      const open=type==='wallOpen';view.querySelector('header').hidden=open;view.querySelector('.dock').hidden=open;
      if(open)stopCountdown();return;
    }
    if(type==='unavailable'){clearTimeout(loadingTimer);poster(true);return;}
    if(type==='explore'){stopCountdown();return;}
    if(type==='place'||type==='travel'){showPlace(place,type==='travel');return;}
    if(type==='ready'){
      clearTimeout(loadingTimer);stage.className='ready';stage.querySelector('.loader')?.remove();
      pause.hidden=false;nav.hidden=false;climate.hidden=false;showPlace('street',false);startClock();
      if(exploreOnArrival&&['rain','park'].includes(url.searchParams.get('light'))){
        const weather=url.searchParams.get('light')==='park'?'clear':'rain';
        climate.querySelector('[name=when]').value='noon';climate.querySelector('[name=weather]').value=weather;
        post('climate',{when:'noon',weather});
      }
      if(exploreOnArrival&&initialSight)landmarks.then(sights=>{if(Object.hasOwn(sights,initialSight)){stopCountdown();post('go',{place:initialSight});}});
      if(exploreOnArrival&&street==='studio'){stopCountdown();post('go',{place:'film'});}
    }
    if(type==='playback'||type==='ready'){pause.setAttribute('aria-pressed',String(paused));pause.querySelector('span').textContent=paused?'播放動態':'暫停動態';}
  }
  // The link itself already opens the catalog if someone uses a new tab or clicks during startup.
  enter.addEventListener('click',e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();enterPlatform();});
  climate.addEventListener('toggle',()=>{if(climate.open)stopCountdown();});
  for(const select of climate.querySelectorAll('select'))select.addEventListener('change',()=>{
    stopCountdown();post('climate',{when:climate.querySelector('[name=when]').value,weather:climate.querySelector('[name=weather]').value});
  });
  view.querySelector('#open-wall').addEventListener('click',()=>post('wall'));
  pause.addEventListener('click',()=>{stopCountdown();post('toggle');});
  for(const b of nav.querySelectorAll('[data-go]'))b.addEventListener('click',()=>{stopCountdown();post('go',{place:b.dataset.go});});
  for(const b of nav.querySelectorAll('[data-step]')){
    const begin=()=>{stopCountdown();post('step',{value:Number(b.dataset.step)});};
    const end=()=>post('step',{value:0});
    b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);begin();});
    b.addEventListener('pointerup',end);b.addEventListener('pointercancel',end);b.addEventListener('lostpointercapture',end);
    b.addEventListener('keydown',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();if(!e.repeat)begin();}});
    b.addEventListener('keyup',e=>{if([' ','Enter'].includes(e.key))end();});b.addEventListener('blur',end);
  }
  dialog.addEventListener('keydown',stopCountdown);
  dialog.addEventListener('cancel',e=>{e.preventDefault();enterPlatform();});
  frame.addEventListener('error',()=>poster(true));
  window.addEventListener('message',receive,options);
  window.addEventListener('hashchange',()=>{if(location.hash)enterPlatform();},options);
  document.addEventListener('visibilitychange',syncClock,options);
  dialog.showModal();document.documentElement.style.overflow='hidden';
  stage.append(frame);
  // Even a failed module request leaves the separate catalog link usable throughout.
  loadingTimer=setTimeout(()=>poster(false),24000);
})();
