(function(){
/* ====== POLYFILLS for old browsers ====== */
if(!NodeList.prototype.forEach){NodeList.prototype.forEach=Array.prototype.forEach;}
if(!String.prototype.startsWith){String.prototype.startsWith=function(s,p){p=p||0;return this.indexOf(s,p)===p;};}
if(!Element.prototype.closest){Element.prototype.closest=function(sel){var el=this;while(el&&el.nodeType===1){if(el.matches(sel))return el;el=el.parentElement;}return null;};}
if(!Element.prototype.matches){Element.prototype.matches=Element.prototype.msMatchesSelector||Element.prototype.webkitMatchesSelector||function(s){var m=this.ownerDocument.querySelectorAll(s);for(var i=0;i<m.length;i++){if(m[i]===this)return true;}return false;};}

/* ====== SAFE STORAGE ====== */
/* 受管理/封鎖 cookie 的 Chrome 會讓 localStorage 一碰就丟例外 → 全頁白屏。
   一律走 try/catch 包裝，存取失敗就當沒有快取。 */
var LS={get:function(k){try{return window.localStorage.getItem(k)}catch(e){return null}},
        set:function(k,v){try{window.localStorage.setItem(k,v)}catch(e){}},
        rm:function(k){try{window.localStorage.removeItem(k)}catch(e){}}};
var SS={get:function(k){try{return window.sessionStorage.getItem(k)}catch(e){return null}},
        set:function(k,v){try{window.sessionStorage.setItem(k,v)}catch(e){}},
        rm:function(k){try{window.sessionStorage.removeItem(k)}catch(e){}}};

/* ====== CONFIG ====== */
var GAS_API='https://script.google.com/macros/s/AKfycbx6qfQFbhAwiqA4AdRisH2HuZDw8iLQEEw-pxraTYCCoMInj0O9cpygBSsB6ii32j21/exec';
var _cbId=0;
var CARDS=[];
var PAGES=[];
var GEM_URL="https://gemini.google.com/gem/1-I-HEXLdgeStt9PmL-dla2q8Blq3Omop?usp=sharing";
var _statsData={};
var _totalVisits=0;
var _todayVisits=0;
var _expandedTabs={};
var _activeTab='';
var _catalogView='recommended';
var _drawerFocus=null,_articleFocus=null;
var _navMenus=[];
var _activeSub='';
var NAV=[];
var _adminCards=[];
var _adminEmails=[];
var _adminTab='cards';
var _editCard=null;
var _editType='article';
var _settings={};
var _userRole='public'; /* 'public'|'student'|'admin' */

var HERO_META=[
  {ico:'assets/cat-pres-mono.jpg',desc:'AI 簡報生成工具，製作精美投影片'},
  {ico:'assets/cat-video-mono.jpg',desc:'把簡報轉成配音影片'},
  {ico:'assets/cat-image-mono.jpg',desc:'快速產出視覺內容'},
  {ico:'assets/cat-tool-mono.jpg',desc:'各類 AI 工具整合，提升工作效率'},
  {ico:'assets/cat-abt-mono.jpg',desc:'關於本平台與 AI 推廣計畫'},
  {ico:'assets/cat-gem-mono.jpg',desc:'Gemini Gem 精選'},
  {ico:'assets/cat-chat-mono.jpg',desc:'ChatGPT GPTs 精選'}
];

/* ====== JSONP ====== */
function gasAPI(action,params,callback){
  var url=GAS_API+'?action='+encodeURIComponent(action);
  var pw=SS.get('admin_pw')||'';
  var stok=LS.get('student_token')||'';
  if(pw){if(!params)params={};if(!params.pw)params.pw=pw;}
  else if(stok){if(!params)params={};if(!params.token)params.token=stok;}
  if(params){for(var k in params){if(params.hasOwnProperty(k)){url+='&'+encodeURIComponent(k)+'='+encodeURIComponent(params[k])}}}
  var cbName='_gcb_'+(++_cbId);
  var done=false;
  var timer=setTimeout(function(){if(!done){done=true;delete window[cbName];if(callback)callback(null)}},12000);
  window[cbName]=function(data){
    if(!done){done=true;clearTimeout(timer);delete window[cbName];
      if(data&&data.error==='token_expired'){disableStudentMode();showStudentLogin();}
      if(callback)callback(data);
    }
  };
  var s=document.createElement('script');
  s.src=url+'&callback='+cbName;
  s.onerror=function(){if(!done){done=true;clearTimeout(timer);delete window[cbName];if(callback)callback(null)}};
  document.head.appendChild(s);
}

/* POST version for large payloads (articles with images) */
function gasAPIPost(action,params,callback){
  /* XHR POST（同 gasLogin）。舊版用隱藏 iframe 表單送出，但 iframe 表單會
     夾帶瀏覽器的 Google cookies，GAS 會把請求彈去帳號頁 → 寫入靜默失敗、
     又固定 4 秒回 ok，造成「存了沒生效」。XHR 不帶跨域 cookies，GAS 以
     匿名處理（部署為 Anyone），回應可直接讀取驗證。 */
  var pw=SS.get('admin_pw')||'';
  var stok=LS.get('student_token')||'';
  if(!params)params={};
  params.action=action;
  if(pw)params.pw=pw;
  else if(stok)params.token=stok;
  var body=[];
  for(var k in params){if(params.hasOwnProperty(k)){body.push(encodeURIComponent(k)+'='+encodeURIComponent(params[k]))}}
  var done=false;
  var timer=setTimeout(function(){if(!done){done=true;if(callback)callback(null)}},30000);
  var xhr=new XMLHttpRequest();
  xhr.open('POST',GAS_API,true);
  xhr.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
  xhr.onload=function(){
    if(done)return;done=true;clearTimeout(timer);
    try{
      var m=xhr.responseText.match(/\{[\s\S]*\}/);
      if(m){if(callback)callback(JSON.parse(m[0]));return;}
    }catch(e){}
    if(callback)callback(xhr.status>=200&&xhr.status<400?{ok:true}:null);
  };
  xhr.onerror=function(){if(!done){done=true;clearTimeout(timer);if(callback)callback(null)}};
  xhr.send(body.join('&'));
}

/* ====== STUDENT AUTH ====== */
function gasLogin(username,password,callback){
  var fd=new URLSearchParams();
  fd.set('action','login');fd.set('username',username);fd.set('password',password);
  var xhr=new XMLHttpRequest();
  xhr.open('POST',GAS_API,true);
  xhr.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
  xhr.onload=function(){
    try{var j=xhr.responseText.match(/\{[\s\S]*\}/);if(j){callback(JSON.parse(j[0]));return;}}catch(e){}
    callback(null);
  };
  xhr.onerror=function(){callback(null)};
  xhr.send(fd.toString());
}

function enableStudentMode(token){
  /* 互斥：若已是管理員，先清掉管理員身份 */
  if(SS.get('admin_pw')){
    SS.rm('admin_pw');
    document.body.classList.remove('admin-mode');
    var _ab=document.getElementById('adminBar');if(_ab)_ab.remove();
  }
  _userRole='student';
  LS.set('student_token',token);
  var badge=$('studentBadge');
  if(badge)badge.style.display='';
  /* 卡片權限是前端過濾（資料源 repo data.json 已含全部卡片），
     直接重繪即可。舊版會向 GAS 取卡片，但 GAS 那份是遷移前的過期資料，
     一登入就會把整站換成舊內容——已移除。 */
  renderCards();
}

function disableStudentMode(){
  _userRole='public';
  LS.rm('student_token');
  var badge=$('studentBadge');
  if(badge)badge.style.display='none';
  var menu=document.getElementById('studentBadgeMenu');
  if(menu)menu.remove();
  renderCards();
}

function showStudentLogin(){
  if($('studentLoginOverlay'))return;
  var overlay=ce('div','');
  overlay.id='studentLoginOverlay';
  overlay.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)';
  var box=ce('div','');
  box.style.cssText='background:var(--bg3);border:1px solid var(--border2);border-radius:16px;padding:36px 32px;max-width:340px;width:90%;text-align:center';
  box.innerHTML='<div style="font-size:38px;margin-bottom:12px">\uD83D\uDD12</div>'
    +'<h2 style="color:var(--text);margin:0 0 6px;font-size:20px">\u5B78\u54E1\u767B\u5165</h2>'
    +'<p style="color:var(--text2);font-size:13px;margin:0 0 20px">AI \u5DE5\u5177\u8CC7\u6E90\u5E73\u53F0 \u5B78\u54E1\u5C08\u5340</p>'
    +'<input id="stLoginUser" type="text" placeholder="\u5E33\u865F" autocomplete="username" style="width:100%;padding:10px 14px;border-radius:9px;border:1px solid var(--border2);background:rgba(255,255,255,0.06);color:var(--text);font-size:14px;outline:none;box-sizing:border-box;margin-bottom:10px">'
    +'<input id="stLoginPw" type="password" placeholder="\u5BC6\u78BC" autocomplete="current-password" style="width:100%;padding:10px 14px;border-radius:9px;border:1px solid var(--border2);background:rgba(255,255,255,0.06);color:var(--text);font-size:14px;outline:none;box-sizing:border-box;margin-bottom:14px">'
    +'<button id="stLoginBtn" style="width:100%;padding:11px;border-radius:9px;border:none;background:#4f8f6f;color:#fff;font-size:15px;font-weight:600;cursor:pointer">\u767B\u5165</button>'
    +'<p id="stLoginErr" style="color:#ef4444;font-size:13px;margin:10px 0 0;display:none">\u5E33\u865F\u6216\u5BC6\u78BC\u932F\u8AA4</p>'
    +'<button id="stLoginCancel" style="margin-top:16px;color:var(--text3);font-size:12px;background:none;border:none;cursor:pointer">\u53D6\u6D88</button>';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  var userInp=$('stLoginUser'),pwInp=$('stLoginPw'),loginBtn=$('stLoginBtn'),errMsg=$('stLoginErr');
  $('stLoginCancel').onclick=function(){overlay.remove()};
  setTimeout(function(){userInp.focus()},80);
  function doStudentLogin(){
    var u=userInp.value.trim(),p=pwInp.value.trim();
    if(!u||!p)return;
    loginBtn.textContent='\u9A57\u8B49\u4E2D...';loginBtn.disabled=true;errMsg.style.display='none';
    gasLogin(u,p,function(r){
      loginBtn.textContent='\u767B\u5165';loginBtn.disabled=false;
      if(r&&r.ok&&r.token){
        overlay.remove();
        enableStudentMode(r.token);
        toast('\u2705 \u6B61\u8FCE\uFF0C\u5B78\u54E1');
      }else if(r&&r.error==='locked'){
        errMsg.textContent='\u767B\u5165\u5931\u6557\u6B21\u6578\u904E\u591A\uFF0C\u8ACB 10 \u5206\u9418\u5F8C\u518D\u8A66';
        errMsg.style.display='block';
      }else{
        errMsg.textContent='\u5E33\u865F\u6216\u5BC6\u78BC\u932F\u8AA4';
        errMsg.style.display='block';pwInp.value='';pwInp.focus();
      }
    });
  }
  loginBtn.onclick=doStudentLogin;
  pwInp.addEventListener('keydown',function(e){if(e.key==='Enter')doStudentLogin()});
  userInp.addEventListener('keydown',function(e){if(e.key==='Enter')pwInp.focus()});
}

/* ====== UTILS ====== */
function $(id){return document.getElementById(id)}
function ce(tag,cls,html){var el=document.createElement(tag);if(cls)el.className=cls;if(html!==undefined)el.innerHTML=html;return el}

function toDriveImg(url){
  if(!url)return'';
  var m=url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if(m)return'https://lh3.googleusercontent.com/d/'+m[1];
  m=url.match(/id=([a-zA-Z0-9_-]+)/);
  if(m)return'https://lh3.googleusercontent.com/d/'+m[1];
  /* Relative path — anchor to site root (not current pathname) so /cards/x.html views resolve assets/ correctly */
  if(url.indexOf('http')!==0&&url.indexOf('//')!==0&&url.indexOf('/')!==0&&url.indexOf('data:')!==0){
    var base=location.pathname.replace(/\/(cards\/[^/]*|index\.html?)?$/,'');
    return base+'/'+url;
  }
  return url;
}

function parseImgSpec(raw){
  if(!raw)return null;
  var parts=raw.split('|');
  var url=toDriveImg(parts[0].trim());
  var fit=parts[1]?parts[1].trim():'cover';
  var pos=parts[2]?parts[2].trim():'center';
  var bg=parts[3]?parts[3].trim():'';
  var zoom=parts[4]?parseInt(parts[4],10)||100:100;
  return{url:url,fit:fit,pos:pos,bg:bg,zoom:zoom};
}

function toast(msg){
  var t=$('toast');
  t.textContent=msg;
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid=setTimeout(function(){t.classList.remove('show')},2200);
}

function totalViews(){
  return Math.max(0,Number(_totalVisits)||0);
}

function fileIcon(mimeType){
  if(!mimeType)return'\uD83D\uDCC4';
  if(mimeType.indexOf('image')>=0)return'\uD83D\uDDBC\uFE0F';
  if(mimeType.indexOf('pdf')>=0)return'\uD83D\uDCD5';
  if(mimeType.indexOf('presentation')>=0||mimeType.indexOf('ppt')>=0)return'\uD83D\uDCCA';
  if(mimeType.indexOf('word')>=0||mimeType.indexOf('doc')>=0)return'\uD83D\uDCC4';
  if(mimeType.indexOf('text')>=0)return'\uD83D\uDCDD';
  return'\uD83D\uDCC1';
}

function typeBadge(type){
  if(type==='file')return'\uD83D\uDCC1 ';
  if(type==='article')return'\uD83D\uDCDD ';
  if(type==='copy')return'\uD83D\uDCCB ';
  return'\uD83D\uDD17 ';
}

function typeLabel(type){
  if(type==='file')return'\u6A94\u6848';
  if(type==='article')return'\u6587\u7AE0';
  if(type==='copy')return'\u8907\u88FD\u6309\u9215';
  return'\u9023\u7D50';
}

/* ====== STARS ====== */
function buildStars(){}

/* ====== NAV TABS ====== */
/* ====== 首頁精選與近期更新 ====== */
var HOME_CARD_LIMIT=6;
function publicationTime(card){
  var time=Date.parse(card.publishDate);
  return Number.isFinite(time)?time:-Infinity;
}
function cardExtra(card){try{return typeof card.extra==='string'?JSON.parse(card.extra||'{}'):(card.extra||{})}catch(e){return {}}}
function isVisibleCard(card){
  var ex=cardExtra(card),perm=ex.permission||card.permission||'public';
  return [false,0,'false'].indexOf(card.visible)<0&&!card.hidden&&!card.archived&&schedOk(card)
    &&(perm==='public'||perm==='student'&&_userRole!=='public'||perm==='admin'&&_userRole==='admin');
}
function homeCards(){
  var valid=new Set();
  NAV.forEach(function(n){if(!showNavigationCategory(n.name))return;valid.add(n.name);(n.children||[]).forEach(function(c){valid.add(c)})});
  var pool=CARDS.filter(function(card){return isVisibleCard(card)&&valid.has(card.page||card.category)});
  var featured=new Set(),cards=[];
  var recent=pool.slice().sort(function(a,b){return publicationTime(b)-publicationTime(a)});
  if(_catalogView==='recent')return {cards:recent,featured:featured};
  var slots=Array.isArray(_settings.home_featured)?_settings.home_featured:[];
  for(var i=0;i<HOME_CARD_LIMIT;i++){
    var card=pool.find(function(item){return item.id===slots[i]});
    if(card&&featured.has(card.id))card=null;
    if(card)featured.add(card.id);
    cards.push(card);
  }
  // An automatic slot can promote a later selection. Fill its vacated slot
  // from the remaining recent cards, so each tool appears only once.
  var used=new Set();
  cards.forEach(function(card,index){
    if(card&&!used.has(card.id)){used.add(card.id);return}
    var next=recent.find(function(item){return !used.has(item.id)});
    if(!next){cards[index]=null;return}
    cards[index]=next;used.add(next.id);
  });
  return {cards:cards.filter(Boolean),featured:featured};
}
function updateCatalogTabs(){
  ['Recommended','Recent'].forEach(function(name){var el=$('view'+name),active=!_activeTab&&!_searchActive&&_catalogView===(name==='Recent'?'recent':'recommended');el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active))});
}
function setCatalogView(view){_catalogView=view;switchTab(view==='recent'?'recent':'');}
function renderHomeCards(grid){
  $('toolsHead').textContent=_catalogView==='recent'?'近期更新':'推薦工具';
  $('subFilter').style.display='none';
  var home=homeCards();
  if(!home.cards.length){
    grid.appendChild(ce('div','tools-empty','目前沒有可顯示的內容'));
    return;
  }
  $('resultsStatus').textContent='顯示 '+home.cards.length+' 項工具';
  home.cards.forEach(function(card){
    if(card.type==='article')renderOneArticleCard(grid,card);
    else if(card.type==='file')renderOneFileCard(grid,card);
    else renderOneLinkCard(grid,card);

  });
  observeCards();
}

/* 空白 hash 顯示首頁。分類與文章沿用各自的網址。 */
function applyHashRoute(){
  var h=decodeURIComponent(location.hash.slice(1));
  if(h.indexOf('article=')===0)return;
  var parts=h.split('/');
  var top=parts[0],sub=parts[1]||'';
  _catalogView=top==='recent'?'recent':'recommended';
  _activeTab='';
  _activeSub='';
  if(top&&PAGES.indexOf(top)>=0){
    _activeTab=top;
    if(sub&&childrenOf(top).indexOf(sub)>=0)_activeSub=sub;
  }else if(top&&parentOf(top)){
    _activeTab=parentOf(top);
    _activeSub=top;
  }
}

/* NAV 樹：[{name,ico,desc,children:[名稱]}]；childrenOf 供分類篩選用 */
function childrenOf(tab){
  for(var i=0;i<NAV.length;i++){
    if(NAV[i].name===tab)return (NAV[i].children||[]).slice();
  }
  return [];
}
function parentOf(sub){
  for(var i=0;i<NAV.length;i++){
    if((NAV[i].children||[]).indexOf(sub)>=0)return NAV[i].name;
  }
  return '';
}
/* 該分類（含子分類）可見卡片數 */
function countOf(name){
  var names=[name].concat(childrenOf(name));
  return CARDS.filter(function(c){
    return names.indexOf(c.page||c.category)>=0&&isVisibleCard(c);
  }).length;
}

function showNavigationCategory(name){
  return name!=='Gremini GEM'&&name!=='Chat GPTs';
}

function buildNavTabs(){
  var cont=$('navTabs');
  cont.innerHTML='';
  clearNavMenus();
  PAGES.filter(showNavigationCategory).forEach(function(p){
    var kids=childrenOf(p);
    if(!kids.length){
      var btn=ce('button','nav-tab'+(_activeTab===p?' active':''),p);
      btn.onclick=function(){switchTab(p)};
      cont.appendChild(btn);
      return;
    }
    /* 有子分類 → 下拉選單（選單掛 body，避免被 nav 的 overflow 裁掉） */
    var wrap=ce('div','nav-drop');
    var btn2=ce('button','nav-tab'+(_activeTab===p?' active':''),p+' <span class="nav-caret">▾</span>');
    var menu=ce('div','nav-drop-menu');
    var all=ce('button','nav-drop-item'+(_activeTab===p&&!_activeSub?' active':''),'全部 '+esc(p)+' <span class="ndi-cnt">'+countOf(p)+'</span>');
    all.onclick=function(e){e.stopPropagation();closeNavMenus();switchTab(p)};
    menu.appendChild(all);
    kids.forEach(function(k){
      var it=ce('button','nav-drop-item'+(_activeSub===k?' active':''),esc(k)+' <span class="ndi-cnt">'+countOf(k)+'</span>');
      it.onclick=function(e){e.stopPropagation();closeNavMenus();switchTab(p,k)};
      menu.appendChild(it);
    });
    document.body.appendChild(menu);
    _navMenus.push(menu);
    btn2.onclick=function(e){
      e.stopPropagation();
      var wasOpen=menu.classList.contains('open');
      closeNavMenus();
      if(wasOpen){switchTab(p);return}
      var r=btn2.getBoundingClientRect();
      menu.classList.add('open');
      menu.style.top=(r.bottom+6)+'px';
      menu.style.left=Math.max(8,Math.min(window.innerWidth-menu.offsetWidth-8,r.left))+'px';
    };
    wrap.appendChild(btn2);
    cont.appendChild(wrap);
  });
}
function closeNavMenus(){_navMenus.forEach(function(m){m.classList.remove('open')})}

/* ====== 手機分類抽屜（分類多到窄條裝不下時的主要導覽） ====== */
function buildDrawer(){
  var body=$('drawerBody');
  if(!body)return;
  body.innerHTML='';
  var home=ce('button','dw-item','推薦工具');home.onclick=function(){setCatalogView('recommended');closeDrawer();scrollToTools()};body.appendChild(home);
  NAV.filter(function(n){return showNavigationCategory(n.name)}).forEach(function(n){
    var btn=ce('button','dw-item'+(_activeTab===n.name&&!_activeSub?' active':''),
      esc(n.name)+'<span class="dw-cnt">'+countOf(n.name)+'</span>');
    btn.onclick=function(){switchTab(n.name);closeDrawer();scrollToTools()};
    body.appendChild(btn);
    childrenOf(n.name).forEach(function(k){
      var sb=ce('button','dw-item sub'+(_activeSub===k?' active':''),
        esc(k)+'<span class="dw-cnt">'+countOf(k)+'</span>');
      sb.onclick=function(){switchTab(n.name,k);closeDrawer();scrollToTools()};
      body.appendChild(sb);
    });
  });
}
function scrollToTools(){
  var t=$('tools');
  if(t)setTimeout(function(){t.scrollIntoView({behavior:'smooth'})},60);
}
function openDrawer(){
  _drawerFocus=document.activeElement;
  buildDrawer();
  $('drawer').inert=false;
  $('drawer').classList.add('show');
  $('drawer').setAttribute('aria-hidden','false');
  $('drawerBackdrop').classList.add('show');
  $('navBurger').classList.add('open');
  $('navBurger').setAttribute('aria-expanded','true');
  document.body.style.overflow='hidden';
  $('categoryFilter').setAttribute('aria-expanded','true');
  $('drawerClose').focus();
}
function closeDrawer(){
  if(!$('drawer')||!$('drawer').classList.contains('show'))return;
  $('drawer').classList.remove('show');
  $('drawer').inert=true;
  $('categoryFilter').setAttribute('aria-expanded','false');
  if(_drawerFocus)_drawerFocus.focus();
  $('drawer').setAttribute('aria-hidden','true');
  $('drawerBackdrop').classList.remove('show');
  $('navBurger').classList.remove('open');
  $('navBurger').setAttribute('aria-expanded','false');
  document.body.style.overflow='';
}
if($('navBurger')){
  $('navBurger').onclick=function(e){
    e.stopPropagation();
    if($('drawer').classList.contains('show'))closeDrawer();else openDrawer();
  };
  $('drawerClose').onclick=closeDrawer;
  $('drawerBackdrop').onclick=closeDrawer;
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeDrawer()});
  window.addEventListener('resize',function(){if(window.innerWidth>1050)closeDrawer()});
}
function clearNavMenus(){_navMenus.forEach(function(m){if(m.parentNode)m.parentNode.removeChild(m)});_navMenus=[]}
document.addEventListener('click',closeNavMenus);
window.addEventListener('scroll',closeNavMenus);
window.addEventListener('resize',closeNavMenus);

/* 快照與 GAS 的加總值會差幾次，先顯示再更新會看到數字跳動。
   → 等 GAS 新鮮值（現約 2.7 秒）才顯示；GAS 掛掉時 6 秒後退回快照值。 */
var _visitReady=false,_statsFresh=false;
setTimeout(function(){if(!_visitReady){_visitReady=true;updateVisit()}},6000);
function updateVisit(isFresh){
  if(isFresh){_visitReady=true;_statsFresh=true;}
  var n=totalViews();
  if(n>0||_statsFresh){
    document.dispatchEvent(new CustomEvent('catalog-visits',{detail:{total:n,today:_statsFresh?Math.max(0,Number(_todayVisits)||0):null}}));
  }
  if(!_visitReady)return;
  var el=$('navVisit');
  if(n>0||_statsFresh){
    el.innerHTML='\uD83D\uDC41 '+n.toLocaleString()+' \u6B21\u700F\u89BD'+' <span>\u00B7 \u4ECA\u65E5 '+_todayVisits.toLocaleString()+'</span>';
    el.style.visibility='visible';
  }
}

/* ====== HERO CARDS ====== */
function buildHeroGrid(){}

/* ====== SWITCH TAB ====== */
function switchTab(tab,sub){
  _catalogView=tab==='recent'?'recent':'recommended';
  _activeTab=tab==='recent'?'':tab;
  _activeSub=sub||'';
  location.hash=_activeSub?(tab+'/'+_activeSub):tab;
  clearSearch();
  buildNavTabs();
  renderCards();
}

/* ====== CARD RENDERING ====== */
function esc(s){
  if(s===null||s===undefined)return'';
  s=String(s);
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function getCardImages(card){
  var imgs=[];
  var raw=card.imageUrl||card.imageUrls;
  if(!raw)return imgs;
  var lines=Array.isArray(raw)?raw:(typeof raw==='string'?raw.split('\n'):[]);
  lines.forEach(function(line){
    var trimmed=(typeof line==='string')?line.trim():'';
    if(trimmed)imgs.push(parseImgSpec(trimmed));
  });
  return imgs.filter(Boolean);
}

function buildSlider(imgs,card){
  if(!imgs.length){
    var ph=ce('div','card-placeholder',card.iconUrl?'<img src="'+esc(toDriveImg(card.iconUrl))+'" style="width:64px;height:64px;object-fit:contain;margin:auto">':'\uD83D\uDDBC');
    return ph;
  }
  var wrap=ce('div','card-slider');
  var idx=0;
  imgs.forEach(function(spec,i){
    var img=ce('img');
    img.src=spec.url;
    img.alt='';
    img.loading='lazy';
    img.decoding='async';
    /* 後台剛發佈時 Pages 尚未部署完成會 404，最多重試 5 次（每 20 秒） */
    var _retries=0;
    img.onerror=function(){
      if(_retries>=5)return;
      _retries++;
      var base=spec.url.split('?')[0];
      setTimeout(function(){img.src=base+'?r='+Date.now()},20000);
    };
    var _z=(spec.zoom||100)/100;
    var _fit=(spec.fit==='cover'&&_z<1)?'contain':spec.fit;
    img.style.objectFit=_fit;
    img.style.objectPosition=spec.pos;
    if(_z!==1)img.style.transform='scale('+_z+')';
    if(_fit==='contain'&&spec.bg)img.style.background=spec.bg;
    if(i===0)img.classList.add('active');
    wrap.appendChild(img);
  });
  if(imgs.length>1){
    var prev=ce('button','slider-btn prev','&#8249;');
    var next=ce('button','slider-btn next','&#8250;');
    prev.onclick=function(e){e.stopPropagation();slide(-1)};
    next.onclick=function(e){e.stopPropagation();slide(1)};
    wrap.appendChild(prev);
    wrap.appendChild(next);
    var dots=ce('div','slider-dots');
    imgs.forEach(function(_,i){
      var dot=ce('div','slider-dot'+(i===0?' active':''));
      dot.onclick=function(e){e.stopPropagation();goSlide(i)};
      dots.appendChild(dot);
    });
    wrap.appendChild(dots);
  }
  function slide(dir){
    var all=wrap.querySelectorAll('img');
    all[idx].classList.remove('active');
    idx=(idx+dir+all.length)%all.length;
    all[idx].classList.add('active');
    updateDots();
  }
  function goSlide(i){
    var all=wrap.querySelectorAll('img');
    all[idx].classList.remove('active');
    idx=i;
    all[idx].classList.add('active');
    updateDots();
  }
  function updateDots(){
    var dd=wrap.querySelectorAll('.slider-dot');
    dd.forEach(function(d,i){d.classList.toggle('active',i===idx)});
  }
  return wrap;
}

/* 排程顯示：publishAt 前、unpublishAt 後不顯示（後台「排程上下架」欄位） */
function schedOk(o){
  var now=Date.now();
  if(o.publishAt&&now<new Date(o.publishAt).getTime())return false;
  if(o.unpublishAt&&now>=new Date(o.unpublishAt).getTime())return false;
  return true;
}
function renderCards(){
  if(_searchActive)return;
  updateCatalogTabs();
  $('resultsStatus').className='sr-only';
  var grid=$('toolsGrid');
  grid.innerHTML='';
  if(!_activeTab){renderHomeCards(grid);return}
  if(_activeTab==='\u95DC\u65BC\u6211\u5011'){
    $('subFilter').style.display='none';
    renderAboutPage();
    return;
  }
  var kids=childrenOf(_activeTab);
  var accept=_activeSub?[_activeSub]:[_activeTab].concat(kids);
  var filtered=CARDS.filter(function(c){
    if(accept.indexOf(c.page||c.category)<0||!isVisibleCard(c))return false;
    var perm=c.permission||'public';
    if(perm==='student'&&_userRole==='public')return false;
    if(perm==='admin'&&_userRole!=='admin')return false;
    return true;
  });
  if(_activeTab==='工具箱'){
    filtered.sort(function(a,b){return publicationTime(b)-publicationTime(a)});
  }else{
    filtered.sort(function(a,b){return (b.pinned?1:0)-(a.pinned?1:0)});
  }
  /* 子分類篩選列 */
  var chipBar=$('subFilter');
  if(chipBar){
    if(kids.length){
      chipBar.innerHTML='';
      var mk=function(label,sub,cnt){
        var b=ce('button','sub-chip'+((_activeSub||'')===sub?' active':''),esc(label)+' <span class="sc-cnt">'+cnt+'</span>');
        b.onclick=function(){switchTab(_activeTab,sub)};
        chipBar.appendChild(b);
      };
      mk('全部','',countOf(_activeTab));
      kids.forEach(function(k){mk(k,k,countOf(k))});
      chipBar.style.display='';
    }else{
      chipBar.innerHTML='';chipBar.style.display='none';
    }
  }
  $('toolsHead').textContent=_activeTab+(_activeSub?' › '+_activeSub:'');
  $('resultsStatus').textContent='顯示 '+filtered.length+' 項工具';
  if(!filtered.length){
    grid.innerHTML='<div class="tools-empty">\uD83D\uDD0D \u6B64\u5206\u985E\u66AB\u7121\u5167\u5BB9</div>';
    return;
  }
  /* \u6536\u5408\uFF1A\u5361\u7247\u591A\u6642\u5148\u6536\u8D77\u4F86\uFF0C\u7248\u9762\u4E0D\u96A8\u6587\u7AE0\u6578\u7206\u70B8 */
  var LIMIT=9;
  var expanded=_expandedTabs[_activeTab]||filtered.length<=LIMIT;
  var toShow=expanded?filtered:filtered.slice(0,LIMIT);
  toShow.forEach(function(card){
    var type=card.type||'link';
    if(type==='article'){
      renderOneArticleCard(grid,card);
    }else if(type==='file'){
      renderOneFileCard(grid,card);
    }else{
      renderOneLinkCard(grid,card);
    }
  });
  if(filtered.length>LIMIT){
    var moreWrap=ce('div','show-more-wrap');
    var moreBtn=ce('button','show-more-btn',expanded?'\u6536\u5408 \u25B2':'\u986F\u793A\u5168\u90E8\uFF08\u9084\u6709 '+(filtered.length-LIMIT)+' \u9805\uFF09\u25BC');
    moreBtn.onclick=function(){
      _expandedTabs[_activeTab]=!expanded;
      renderCards();
      if(expanded){var t=$('tools');if(t)t.scrollIntoView({behavior:'smooth'});}
    };
    moreWrap.appendChild(moreBtn);
    grid.appendChild(moreWrap);
  }

  observeCards();
}


/* Catalog presentation. Content and download URLs remain owned by the CMS. */
function uiIcon(name){
  var paths={download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',external:'<path d="M14 4h6v6m0-6L10 14M10 4H4v16h16v-6"/>',copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',moon:'<path d="M20.5 14a8.5 8.5 0 0 1-10.5-10.5A8.5 8.5 0 1 0 20.5 14Z"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>'};
  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.arrow)+'</svg>';
}
function catalogTitle(card){
  var names={'presentation-studio':'Presentation Studio','tool_minicut':'Mini Cut','1776513173234':'Voicebox','1776533629224':'SlideCast','1774422838992':'NotebookLM 簡報中控','gpt_qrcode_generator_1':'QR Code 產生器'};
  return names[card.id]||String(card.title||'未命名工具').trim();
}
function catalogSummary(card){
  var text=card.description||card.desc||card.excerpt||'';
  if(!text){var tmp=document.createElement('div');tmp.innerHTML=card.content||'';text=tmp.textContent||'';}
  text=String(text).replace(/\s+/g,' ').trim();
  if(text.length>70){var sentence=text.match(/^.{8,70}?[。！？]/);text=sentence?sentence[0]:Array.from(text).slice(0,68).join('')+'…';}
  return text;
}
function fullArticle(card){var ex=cardExtra(card);return ex.content&&ex.content.length>(card.content||'').length?ex.content:(card.content||'');}
function downloadOptions(card){
  // Both assistant editions are explained and linked within the same guide.
  if(card.id==='1785291000000')return [];
  var doc=new DOMParser().parseFromString(fullArticle(card),'text/html'),seen=new Set(),items=[];
  doc.querySelectorAll('a[href]').forEach(function(a){
    var raw=a.getAttribute('href'),url;
    try{url=new URL(raw,document.baseURI)}catch(e){return}
    if(!/^https?:$/.test(url.protocol))return;
    var text=(a.textContent||'').replace(/\s+/g,' ').trim();
    var direct=a.hasAttribute('download')||/\.(zip|dmg|exe|msi|pkg)(?:$|\?)/i.test(url.pathname);
    var drive=url.hostname==='drive.google.com'&&/\/file\/d\//.test(url.pathname)&&/下載|macOS|Windows|Mac 版/i.test(text);
    var appstore=url.hostname==='apps.apple.com';
    if(!direct&&!drive&&!appstore||seen.has(url.href))return;
    if(/建置中|尚未|準備中|即將/.test(text))return;
    seen.add(url.href);
    var label=appstore?'App Store':/Windows/i.test(text)?'Windows':/macOS|\bMac\b|DMG/i.test(text)?'macOS':'下載外掛';
    if(/Apple Silicon/i.test(text))label+=' · Apple Silicon';
    if(label==='Windows'&&/64/.test(text))label+=' · 64 位元';
    var version=/Voicebox Lite/i.test(text)?'Voicebox Lite':(/\b\d+\.\d+\.\d+\b/.exec(text)||[])[0]||'';
    items.push({url:url.href,label:label,meta:version,download:a.getAttribute('download')||''});
  });
  return items;
}
function setDownloadLink(a,item,card){
  a.href=item.url;
  if(item.download&&new URL(item.url).origin===location.origin)a.download=item.download;
  else{a.target='_blank';a.rel='noopener noreferrer'}
  a.onclick=function(){trackClick(card,null)};
}
function showDownloads(card,items,trigger){
  var dialog=$('downloadDialog'),host=$('downloadOptions');host.innerHTML='';
  $('downloadTitle').textContent=catalogTitle(card)+' · 選擇版本';
  items.forEach(function(item){
    var a=ce('a','download-option',uiIcon('download')+'<span><span class="download-label">'+esc(item.label)+'</span>'+(item.meta?'<span class="download-meta">'+esc(item.meta)+'</span>':'')+'</span>'+uiIcon('external'));
    setDownloadLink(a,item,card);host.appendChild(a);
  });
  dialog._trigger=trigger;dialog.showModal();
}
$('downloadClose').onclick=function(){$('downloadDialog').close()};
$('downloadDialog').addEventListener('click',function(e){if(e.target===this){var r=this.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)this.close()}});
$('downloadDialog').addEventListener('close',function(){if(this._trigger&&this._trigger.isConnected)this._trigger.focus()});
function articleLink(card,cls,label){
  var a=ce('a',cls,label);a.href='cards/'+encodeURIComponent(card.id)+'.html';
  a.onclick=function(e){if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();trackClick(card,null);openArticleReader(card)};
  return a;
}
function renderCatalogCard(grid,card){
  var el=ce('article','card');el.dataset.cardId=card.id;
  var extra=cardExtra(card),m3={};try{m3=JSON.parse(card.meta3||'{}')}catch(e){}
  var isArticle=card.type==='article',isFile=card.type==='file';
  var isCopy=card.type==='copy'||(card.linkBehavior||extra.linkBehavior||card.meta1)==='copy';
  var category=parentOf(card.page||card.category)||card.page||card.category||'工具';
  var title=catalogTitle(card),body=ce('div','card-body'),head=ce('h2','card-title');
  var imageHost=el;
  if(isArticle){imageHost=articleLink(card,'card-thumbnail','');imageHost.tabIndex=-1;imageHost.setAttribute('aria-hidden','true');el.appendChild(imageHost);}
  if(card.coverImage){
    var img=ce('img','card-cover');img.src=toDriveImg(card.coverImage);img.alt='';img.width=1440;img.height=810;img.loading=grid.children.length<3?'eager':'lazy';img.decoding='async';imageHost.appendChild(img);
  }else{imageHost.appendChild(buildSlider(getCardImages(card),card));}
  body.appendChild(ce('div','card-category',esc(category)));
  if(isArticle)head.appendChild(articleLink(card,'card-title-link',esc(title)));
  else head.textContent=title;
  body.appendChild(head);
  body.appendChild(ce('p','card-desc',esc(catalogSummary(card))));
  var foot=ce('div','card-foot');
  if(isArticle){
    var items=downloadOptions(card);
    if(items.length){
      foot.appendChild(articleLink(card,'card-details','使用說明'));
      var label=card.id==='presentation-studio'?'下載外掛':items[0].label==='App Store'?'App Store':'下載工具';
      var dl=ce(items.length===1?'a':'button','card-link',uiIcon('download')+esc(label));
      if(items.length===1)setDownloadLink(dl,items[0],card);
      else{dl.type='button';dl.setAttribute('aria-haspopup','dialog');dl.setAttribute('aria-label','下載 '+title);dl.onclick=function(){showDownloads(card,items,dl)}}
      foot.appendChild(dl);
    }else foot.appendChild(articleLink(card,'card-link',esc('閱讀教學')+uiIcon('arrow')));
  }else if(isCopy){
    var copyContent=card.copyContent||extra.copyContent||m3.c||card.linkUrl||'';
    var copy=ce('button','card-link',uiIcon('copy')+esc(card.linkBtnLabel||extra.linkBtnLabel||card.meta2||card.btnLabel||'複製內容'));copy.type='button';
    copy.onclick=function(){copyText(copyContent).then(function(ok){if(!ok)return;flashBtn(copy,'已複製');toast('已複製');trackClick(card,null)})};foot.appendChild(copy);
  }else{
    var link=ce('a','card-link',uiIcon(isFile?'download':'external')+esc(isFile?'下載檔案':card.linkBtnLabel||extra.linkBtnLabel||card.meta2||card.btnLabel||'開啟工具'));
    link.href=(isFile?card.fileUrl:'')||card.linkUrl||'#';link.target='_blank';link.rel='noopener noreferrer';link.onclick=function(){trackClick(card,null)};foot.appendChild(link);
  }
  body.appendChild(foot);el.appendChild(body);grid.appendChild(el);
}
function renderOneLinkCard(grid,card){renderCatalogCard(grid,card)}
function renderOneArticleCard(grid,card){renderCatalogCard(grid,card)}
function renderOneFileCard(grid,card){renderCatalogCard(grid,card)}
function renderOneCopyCard(grid,card){renderCatalogCard(grid,card)}

/* 按鈕即時回饋：暫時換字 1.6 秒 */
function flashBtn(btn,msg){
  if(btn._flashing)return;
  btn._flashing=true;
  var orig=btn.innerHTML;
  btn.textContent=msg;
  setTimeout(function(){btn.innerHTML=orig;btn._flashing=false;},1600);
}
function copyText(text){
  function fallback(){
    var ta=document.createElement('textarea'),focused=document.activeElement,ok=false;
    ta.value=text||'';ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();
    try{ok=document.execCommand('copy');}catch(e){}finally{ta.remove();if(focused&&focused.focus)focused.focus();}
    if(!ok)toast('無法複製，請允許剪貼簿存取後重試');
    return ok;
  }
  if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(text||'').then(function(){return true;},fallback);
  return Promise.resolve(fallback());
}

/* ====== CLICK TRACKING ====== */
function trackClick(card,viewsSpan){
  /* \u4EE5 id \u70BA\u9375\u8A18\u6578\uFF08GAS Stats \u8868\uFF09\uFF0Ctitle \u50C5\u4F9B\u5831\u8868\u95B1\u8B80 */
  card.views=(card.views||0)+1;
  if(viewsSpan)viewsSpan.textContent='\uD83D\uDC41 '+card.views+' \u6B21\u9EDE\u95B1';
  gasAPI('recordClick',{title:card.title||'',id:card.id||''},null);
}
function cardViews(card){
  var v=card.views||0;
  var t=(_statsData&&_statsData[card.title])||0;
  return Math.max(v,t); /* \u820A\u5361\u6B77\u53F2\u8A08\u6578\u5B58\u5728 title \u9375\uFF0C\u53D6\u8F03\u5927\u8005\u4E0D\u5012\u9000 */
}

/* ====== VIDEO EMBED URL ====== */
function toEmbedUrl(url){
  if(!url)return'';
  /* YouTube */
  var yt=url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if(yt)return'https://www.youtube.com/embed/'+yt[1];
  /* Vimeo */
  var vm=url.match(/vimeo\.com\/(\d+)/);
  if(vm)return'https://player.vimeo.com/video/'+vm[1];
  /* Google Drive video */
  var gd=url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if(gd)return'https://drive.google.com/file/d/'+gd[1]+'/preview';
  return url;
}

/* ====== QR CODE GENERATOR (inlined lib, canvas-based) ====== */
function showQrCode(text){
  $('qrUrl').textContent=text;
  $('qrOverlay').classList.add('show');
  try{
    var qr=qrcode(0,'M');
    qr.addData(text);
    qr.make();
    var canvas=$('qrCanvas');
    var ctx=canvas.getContext('2d');
    var size=qr.getModuleCount();
    var scale=Math.max(4,Math.floor(220/size));
    canvas.width=size*scale;
    canvas.height=size*scale;
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#000';
    for(var r=0;r<size;r++){for(var c=0;c<size;c++){if(qr.isDark(r,c))ctx.fillRect(c*scale,r*scale,scale,scale)}}
  }catch(e){
    console.error('QR generation failed:',e);
  }
}
$('qrClose').onclick=function(){$('qrOverlay').classList.remove('show')};
$('articleQr').onclick=function(){
  var base=location.origin+location.pathname.replace(/\/(cards\/[^/]*|index\.html?)?$/,'');
  var url=base+'/cards/'+_currentArticleId+'.html';
  showQrCode(url);
};

/* ====== IMAGE COMPRESSION ====== */
function compressImage(file,callback,maxW,quality){
  maxW=maxW||800;
  quality=quality||0.7;
  var reader=new FileReader();
  reader.onload=function(ev){
    var img=new Image();
    img.onload=function(){
      var w=img.width,h=img.height;
      if(w>maxW){h=Math.round(h*(maxW/w));w=maxW}
      var canvas=document.createElement('canvas');
      canvas.width=w;canvas.height=h;
      var ctx=canvas.getContext('2d');
      ctx.drawImage(img,0,0,w,h);
      var dataUrl=canvas.toDataURL('image/jpeg',quality);
      callback(dataUrl);
    };
    img.src=ev.target.result;
  };
  reader.readAsDataURL(file);
}

function insertCompressedImage(file,altText){
  altText=altText||'uploaded image';
  toast('圖片上傳中...');
  compressImage(file,function(dataUrl){
    /* Upload compressed image to Google Drive via uploadFile doPost */
    var base64Data=dataUrl.split(',')[1];
    var pw=SS.get('admin_pw')||'';
    var fileName='article_img_'+Date.now()+'.jpg';

    /* Use XMLHttpRequest to POST to Apps Script (form-encoded) */
    var formData=new URLSearchParams();
    formData.set('action','uploadFile');
    formData.set('pw',pw);
    formData.set('fileData',base64Data);
    formData.set('fileName',fileName);
    formData.set('mimeType','image/jpeg');

    var xhr=new XMLHttpRequest();
    xhr.open('POST',GAS_API,true);
    xhr.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
    xhr.onload=function(){
      try{
        var text=xhr.responseText;
        var json=text.match(/\{[\s\S]*\}/);
        if(json){
          var res=JSON.parse(json[0]);
          if(res.ok&&res.directUrl){
            var ed=$('articleEditor');
            if(ed)ed.focus();
            document.execCommand('insertHTML',false,'<img src="'+res.directUrl+'" style="max-width:100%;border-radius:8px;margin:8px 0" alt="'+altText+'">');
            toast('圖片已插入');
            return;
          }
        }
        toast('\u274C \u5716\u7247\u4E0A\u50B3\u5931\u6557\uFF0C\u8ACB\u91CD\u8A66');
      }catch(e){
        toast('\u274C \u5716\u7247\u4E0A\u50B3\u5931\u6557\uFF0C\u8ACB\u91CD\u8A66');
      }
    };
    xhr.onerror=function(){
      toast('\u274C \u5716\u7247\u4E0A\u50B3\u5931\u6557\uFF0C\u8ACB\u91CD\u8A66');
    };
    xhr.send(formData.toString());
  });
}

/* ====== ANNOUNCEMENT ====== */
function applyAnnouncement(){
  var banner=$('announcementBanner');
  var textEl=$('announcementText');
  if(_settings.announcement && _settings.announcement_visible==='true'){
    textEl.textContent=_settings.announcement;
    banner.classList.add('show');
  }else{
    banner.classList.remove('show');
  }
}
$('announcementDismiss').onclick=function(){
  $('announcementBanner').classList.remove('show');
};

/* ====== SEO ====== */
function applySEO(){
  var title=_settings.seo_title;
  var desc=_settings.seo_description;
  var img=_settings.seo_og_image;
  function setMeta(sel,val){var el=document.querySelector(sel);if(el&&val)el.setAttribute('content',val);}
  if(title){
    document.title=title;
    setMeta('meta[property="og:title"]',title);
    setMeta('meta[name="twitter:title"]',title);
  }
  if(desc){
    setMeta('meta[name="description"]',desc);
    setMeta('meta[property="og:description"]',desc);
    setMeta('meta[name="twitter:description"]',desc);
  }
  if(img){
    setMeta('meta[property="og:image"]',img);
    setMeta('meta[name="twitter:image"]',img);
  }
}

/* ====== APPLY SITE INFO ====== */
function applySiteInfo(){

  var t=document.querySelector('.hero-title');
  var s=document.querySelector('.hero-sub');
  var b=document.querySelector('.hero-badge');
  var f=$('footerCopy');
  var n=document.querySelector('.brand-full');
  if(!document.documentElement.dataset.scene){
    if(_settings.site_title&&t)t.textContent=_settings.site_title;
    if(s)s.textContent=String(_settings.site_subtitle||'').trim();
  }
  if(_settings.site_badge&&b)b.textContent=_settings.site_badge;
  if(_settings.site_footer&&f)f.textContent=_settings.site_footer;
  var su=$('siteUpdated');if(su&&_settings.site_updated)su.textContent='更新於 '+String(_settings.site_updated).slice(0,10);
  if(_settings.site_nav_title&&n)n.textContent=_settings.site_nav_title;
}

/* ====== ARTICLE READER (public) ====== */
var _currentArticleId=null;
function openArticleReader(card,fromRoute){
  var overlay=$('articleOverlay');
  _articleFocus=document.activeElement;
  _currentArticleId=card.id;
  /* 分享網址用 #article=；不要把路徑改成 /cards/<id>.html——那會把 document.baseURI
     一起帶到 cards/ 底下，之後所有相對路徑（分類圖示、site.json、blocks.js、子頁 data.json）
     都會多一層而 404。分享鈕與 QR 另外自己組 /cards/<id>.html，不受這裡影響。 */
  if(!fromRoute)history.pushState(null,'',location.pathname.replace(/\/(cards\/[^/]*|index\.html?)?$/,'')+'/'+location.search+'#article='+encodeURIComponent(card.id));
  $('articleTitle').textContent=card.title||'';
  var cover=$('articleCover');
  if(card.coverImage){
    cover.src=toDriveImg(card.coverImage);
    cover.style.display='block';
    cover.onerror=function(){this.style.display='none'};
  }else{
    cover.style.display='none';
  }
  var _metaParts=[];var _pubDate=card.publishDate?card.publishDate.slice(0,10):'';if(_pubDate)_metaParts.push(_pubDate);$('articleMetaText').textContent=_metaParts.join(' \u30FB ');
  /* 先用本地內容立即顯示（getData / data.json 快照已含 content），
     GAS 回來內容不同才更新。原本等 getArticle 3~6 秒畫面都是空的，
     script.google.com 被公司/醫院網路擋掉時更是永遠空白。 */
  function _renderArticle(html){
    $('articleContent').innerHTML=html||'';
    hydrateInlineCopyBtns($('articleContent'));
    /* Lazy load images */
    $('articleContent').querySelectorAll('img').forEach(function(img){img.setAttribute('loading','lazy')});
    buildArticleToc();
    updateReadingTime($('articleContent'));
    _articleFontSize=17;
    $('articleContent').style.fontSize='';
  }
  var _localHtml=card.content||card.desc||'';
  /* card.content 只是 200 字預覽；完整內文存在 card.extra(JSON).content */
  try{
    if(card.extra){
      var _ex=typeof card.extra==='string'?JSON.parse(card.extra):card.extra;
      if(_ex&&_ex.content&&_ex.content.length>_localHtml.length)_localHtml=_ex.content;
    }
  }catch(e){}
  _renderArticle(_localHtml);
  /* repo data.json 為唯一資料源；舊 GAS getArticle 會用停用後台的舊內文蓋掉新內容，已移除 */
  overlay.classList.add('show');
  overlay.scrollTop=0;
  $('catalogShell').inert=true;
  document.body.style.overflow='hidden';
  $('articleBack').focus();
}

/* Share article link — use /cards/id.html for proper OG on LINE/social */
$('articleShare').onclick=function(){
  var base=location.origin+location.pathname.replace(/\/(cards\/[^/]*|index\.html?)?$/,'');
  var url=base+'/cards/'+_currentArticleId+'.html';
  copyText(url).then(function(ok){if(ok)toast('已複製分享連結');});
};

/* Build Table of Contents from H2/H3 */
function buildArticleToc(){
  var content=$('articleContent');
  var tocLinks=$('articleTocLinks');
  var toc=$('articleToc');
  tocLinks.innerHTML='';
  var headings=content.querySelectorAll('h2,h3');
  if(headings.length<2){toc.style.display='none';return}
  toc.style.display='';
  headings.forEach(function(h,i){
    h.id='toc-'+i;
    var a=document.createElement('a');
    a.href='#toc-'+i;
    a.textContent=h.textContent;
    if(h.tagName==='H3')a.className='toc-h3';
    a.onclick=function(e){
      e.preventDefault();
      h.scrollIntoView({behavior:'smooth',block:'start'});
    };
    tocLinks.appendChild(a);
  });
  /* Highlight active TOC item on scroll */
  var articleOverlay=$('articleOverlay');
  articleOverlay.onscroll=function(){
    var scrollTop=articleOverlay.scrollTop;
    var active=null;
    headings.forEach(function(h){if(h.offsetTop<=scrollTop+100)active=h});
    tocLinks.querySelectorAll('a').forEach(function(a){
      a.classList.toggle('active',active&&a.getAttribute('href')==='#'+active.id);
    });
  };
}

function hideArticleReader(){
  $('articleOverlay').classList.remove('show');
  $('catalogShell').inert=false;
  if(_articleFocus&&_articleFocus.isConnected)_articleFocus.focus();
  document.body.style.overflow='';
  _currentArticleId=null;
}
function closeArticleReader(){
  hideArticleReader();
  var category=_activeTab?'#'+encodeURIComponent(_activeTab)+(_activeSub?'/'+encodeURIComponent(_activeSub):''):(_catalogView==='recent'?'#recent':'');
  history.pushState(null,'',location.pathname.replace(/\/(cards\/[^/]*|index\.html?)?$/,'')+'/'+location.search+category);
}
$('articleBack').onclick=closeArticleReader;
$('articleBackBottom').onclick=closeArticleReader;

/* Open article from URL hash on load */
function checkArticleHash(){
  var hash=location.hash;
  if(hash.indexOf('#article=')===0){
    var artId=hash.replace('#article=','');
    var card=CARDS.find(function(c){return c.id===artId});
    if(card&&isVisibleCard(card))openArticleReader(card,true);
  }
}

/* ====== READING TIME ====== */
function updateReadingTime(contentEl){
  var text=(contentEl.textContent||contentEl.innerText||'');
  var chars=text.replace(/\s/g,'').length;
  var minutes=Math.max(1,Math.round(chars/500));
  var el=$('articleReadTime');
  if(el)el.textContent='· 約 '+minutes+' 分鐘閱讀';
}

/* ====== FONT SIZE CONTROL ====== */
var _articleFontSize=17;
$('fontPlus').onclick=function(){
  _articleFontSize=Math.min(22,_articleFontSize+2);
  $('articleContent').style.fontSize=_articleFontSize+'px';
};
$('fontMinus').onclick=function(){
  _articleFontSize=Math.max(12,_articleFontSize-2);
  $('articleContent').style.fontSize=_articleFontSize+'px';
};

/* ====== BACK TO TOP ====== */
var _btt=$('backToTop');
window.addEventListener('scroll',function(){
  _btt.classList.toggle('show',window.scrollY>400);
});
_btt.onclick=function(){window.scrollTo({top:0,behavior:'smooth'})};

/* ====== CARD ENTRANCE ANIMATION ====== */
function observeCards(){
  var cards=document.querySelectorAll('.card:not(.card-visible)');
  if(!('IntersectionObserver' in window)){cards.forEach(function(c){c.classList.add('card-visible')});return}
  var obs=new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(en.isIntersecting){en.target.classList.add('card-visible');obs.unobserve(en.target)}
    });
  },{threshold:0.08});
  cards.forEach(function(c){obs.observe(c)});
}

/* ====== SKELETON LOADING ====== */
function showSkeleton(grid,count){
  grid.innerHTML='';
  for(var i=0;i<(count||6);i++){
    var sk=ce('div','skeleton-card');
    sk.innerHTML='<div class="sk-img"></div><div class="sk-body"><div class="sk-line medium"></div><div class="sk-line short"></div><div class="sk-line"></div></div>';
    grid.appendChild(sk);
  }
}

/* ====== KEYBOARD NAVIGATION ====== */
document.addEventListener('keydown',function(e){
  /* Esc closes article overlay */
  if(e.key==='Escape'){
    var artOverlay=$('articleOverlay');
    if(artOverlay&&artOverlay.classList.contains('show')){
      $('articleBack').click();
      return;
    }
    var modalOverlay=$('modalOverlay');
    if(modalOverlay&&modalOverlay.classList.contains('show')){
      $('modalClose').click();
      return;
    }
  }

});

/* ====== DARK/LIGHT THEME TOGGLE ====== */
function initTheme(){applyTheme(LS.get('catalog_theme')==='dark'?'dark':'light')}
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme',theme);
  var btn=$('themeToggle');
  if(btn){btn.innerHTML=theme==='dark'?uiIcon('sun'):uiIcon('moon');btn.setAttribute('aria-label',theme==='dark'?'切換淺色模式':'切換深色模式');btn.title=btn.getAttribute('aria-label')}
  document.querySelector('meta[name="theme-color"]').content=theme==='dark'?'#171b20':'#f7f7f2';
  LS.set('catalog_theme',theme);
}
if($('themeToggle')){
  $('themeToggle').onclick=function(){
    var current=document.documentElement.getAttribute('data-theme')||'dark';
    applyTheme(current==='dark'?'light':'dark');
  };
}

/* ====== GLOBAL SEARCH ====== */
var _searchActive=false;
/* 子頁面搜尋索引：把各子頁面的卡片標題納入全站搜尋 */
var HUB_INDEX=[];
function loadHubIndex(){
  fetch('./hubs.json',{cache:'no-cache'}).then(function(r){return r.ok?r.json():null}).then(function(reg){
    var hubs=(reg&&reg.hubs||[]).filter(function(h){return !h.archived});
    hubs.forEach(function(h){
      fetch('./'+h.folder+'/data.json',{cache:'no-cache'}).then(function(r){return r.ok?r.json():null}).then(function(d){
        if(!d)return;
        var mods=d.modules||(d.styles?[{type:'cards',items:d.styles}]:[]);
        var hubTitle=(d.site&&d.site.title)||h.title||h.folder;
        mods.forEach(function(m){
          if(m.type!=='cards')return;
          (m.items||[]).forEach(function(it){
            HUB_INDEX.push({
              id:'hub_'+h.folder+'_'+(it.id||Math.random().toString(36).slice(2)),
              title:it.scene||it.name||'',
              desc:(it.name&&it.scene?it.name+'｜':'')+hubTitle,
              linkUrl:h.folder+'/',
              imageUrls:it.thumb?[h.folder+'/'+it.thumb]:[],
              meta1:'open',meta2:'前往 '+hubTitle,
              type:'link',_hub:true
            });
          });
        });
        if(_searchActive)runSearch();
      }).catch(function(){});
    });
  }).catch(function(){});
}

function clearSearch(){
  $('globalSearch').value='';$('clearSearch').hidden=true;_searchActive=false;
}
function runSearch(){
  var q=$('globalSearch').value.trim().toLocaleLowerCase();
  $('clearSearch').hidden=!q;
  _searchActive=!!q;
  updateCatalogTabs();
  if(!q){renderCards();return}
  $('subFilter').style.display='none';
  var terms=q.split(/\s+/);
  var results=CARDS.filter(function(c){
    var text=[c.title,catalogSummary(c),c.tag,c.page||c.category].join(' ').toLocaleLowerCase();
    return isVisibleCard(c)&&terms.every(function(term){return text.indexOf(term)>=0});
  }).concat(HUB_INDEX.filter(function(c){var text=[c.title,c.desc].join(' ').toLocaleLowerCase();return terms.every(function(term){return text.indexOf(term)>=0})}));
  var grid=$('toolsGrid');grid.innerHTML='';
  $('toolsHead').textContent='搜尋結果';
  $('resultsStatus').className='search-results-status';
  $('resultsStatus').textContent='找到 '+results.length+' 項符合「'+$('globalSearch').value.trim()+'」的工具';
  if(!results.length){
    var empty=ce('div','tools-empty','<h2>找不到符合的工具</h2><p>試試「簡報」、「剪輯」或其他功能關鍵字。</p>');
    var reset=ce('button','card-link','清除搜尋');reset.onclick=function(){clearSearch();renderCards();$('globalSearch').focus()};empty.appendChild(reset);grid.appendChild(empty);return;
  }
  results.forEach(function(c){renderCatalogCard(grid,c)});observeCards();
}
function initSearch(){
  var input=$('globalSearch');
  input.addEventListener('input',function(e){if(!e.isComposing)runSearch()});
  input.addEventListener('compositionend',runSearch);
  input.addEventListener('keydown',function(e){if(e.key==='Escape'){clearSearch();renderCards()}});
  $('clearSearch').onclick=function(){clearSearch();renderCards();input.focus()};
  $('viewRecommended').onclick=function(){setCatalogView('recommended')};
  $('viewRecent').onclick=function(){setCatalogView('recent')};
  $('categoryFilter').onclick=openDrawer;
  $('homeLink').onclick=function(e){e.preventDefault();setCatalogView('recommended');window.scrollTo({top:0,behavior:'smooth'})};
  var query=new URLSearchParams(location.search).get('q');if(query)input.value=query;
}

/* ====== INTERSECTION OBSERVER FOR CARDS ====== */
var _cardObserver=null;
function observeCards(){
  if(_cardObserver)_cardObserver.disconnect();
  if(!('IntersectionObserver' in window)){
    document.querySelectorAll('.card').forEach(function(c){c.classList.add('visible')});
    return;
  }
  _cardObserver=new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        entry.target.classList.add('visible');
        _cardObserver.unobserve(entry.target);
      }
    });
  },{threshold:0.08});
  document.querySelectorAll('.card:not(.visible)').forEach(function(c){
    _cardObserver.observe(c);
  });
}

/* ====== ABOUT US PAGE ====== */
function renderAboutPage(){
  var grid=$('toolsGrid');
  grid.innerHTML='';
  $('toolsHead').innerHTML='\u95DC\u65BC\u6211\u5011';
  var section=ce('div','about-section');
  section.innerHTML='<h3>關於 Jyunhao AI工具資源平台</h3>'
    +'<p>本平台致力於整合最新 AI 科技工具，幫助教師、學生、行政與影音製作人員提升每日工作效能。</p>'
    +'<h4>\uD83C\uDFAF \u6211\u5011\u7684\u76EE\u6A19</h4>'
    +'<ul>'
    +'<li>\u2022 \u964D\u4F4E AI \u5DE5\u5177\u7684\u4F7F\u7528\u9580\u6ABB</li>'
    +'<li>\u2022 \u63D0\u4F9B\u7D93\u904E\u9A57\u8B49\u7684\u5BE6\u7528\u5DE5\u5177\u63A8\u85A6</li>'
    +'<li>\u2022 \u6301\u7E8C\u66F4\u65B0\u6700\u65B0 AI \u61C9\u7528\u8CC7\u6E90</li>'
    +'</ul>'
    +'<h4>\uD83D\uDCEC \u806F\u7D61\u6211\u5011</h4>'
    +'<div class="about-contact">\u5982\u6709\u5DE5\u5177\u63A8\u85A6\u6216\u5408\u4F5C\u63D0\u6848\uFF0C\u6B61\u8FCE\u4F86\u4FE1\uFF1A<a href="mailto:zxc80057@gmail.com">zxc80057@gmail.com</a></div>';
  grid.appendChild(section);
}

/* ====== CACHE LAYER ====== */
var CACHE_KEY='aitools_catalog_2026';
var CACHE_TTL=300000; /* 5 min */

function saveCache(obj){
  try{obj._ts=Date.now();obj._ver=4;LS.set(CACHE_KEY,JSON.stringify(obj));
  /* clear ALL old cache keys */
  try{['aitools_cache','aitools_v2','aitools_v3'].forEach(function(k){LS.rm(k)})}catch(e2){}
  }catch(e){}
}
function loadCache(){
  try{
    /* clear ALL legacy caches */
    try{['aitools_cache','aitools_v2','aitools_v3'].forEach(function(k){LS.rm(k)})}catch(e2){}
    var raw=LS.get(CACHE_KEY);
    if(!raw)return null;
    var obj;
    try{obj=JSON.parse(raw)}catch(pe){LS.rm(CACHE_KEY);return null}
    /* Validate cache: must have cards array with items and valid pages */
    if(!obj||typeof obj!=='object'||!Array.isArray(obj.cards)||!obj.cards.length||!Array.isArray(obj.pages)||!obj.pages.length){
      LS.rm(CACHE_KEY);return null;
    }
    /* Expire cache after 1 hour */
    if(obj._ts&&(Date.now()-obj._ts>3600000)){
      LS.rm(CACHE_KEY);return null;
    }
    return obj;
  }catch(e){
    try{LS.rm(CACHE_KEY)}catch(e2){}
    return null;
  }
}

function mergeAdminExtra(cards,adminCards){
  if(!adminCards)return;
  var map={};
  adminCards.forEach(function(ac){if(ac.id)map[ac.id]=ac;if(ac.title)map['t_'+ac.title]=ac;});
  cards.forEach(function(c){
    var full=map[c.id]||map['t_'+c.title];
    if(!full)return;
    if(full.extra){
      var ex=(typeof full.extra==='string')?JSON.parse(full.extra||'{}'):full.extra;
      c.extra=ex;
      ['linkBehavior','linkBtnLabel','linkBtnIcon','copyContent','btnStyle'].forEach(function(k){if(ex[k])c[k]=ex[k]});
    }
    ['meta1','copyContent','btnLabel','btnIcon','btnStyle'].forEach(function(k){if(full[k])c[k]=full[k]});
  });
  /* Auto-migrate: if admin has pw, write meta1/meta2/meta3 for cards missing them */
  if(SS.get('admin_pw')){
    autoMigrateMeta(cards);
  }
}

function autoMigrateMeta(cards){
  var migrated=LS.get('_meta_migrated_v1');
  if(migrated)return;
  var queue=[];
  cards.forEach(function(c){
    if(c.type!=='link'&&c.type!=='copy')return;
    var behavior=c.linkBehavior||((c.meta1==='copy')?'copy':'open');
    var needsUpdate=false;
    /* Check if meta fields need updating */
    if(c.meta1!==behavior)needsUpdate=true;
    if(behavior==='copy'&&!c.meta3)needsUpdate=true;
    if(c.linkBtnLabel&&!c.meta2)needsUpdate=true;
    if(!needsUpdate)return;
    /* Build updated card */
    c.meta1=behavior;
    c.meta2=c.linkBtnLabel||c.btnLabel||'';
    c.meta3=JSON.stringify({i:c.linkBtnIcon||c.btnIcon||'',s:c.btnStyle||'primary',c:c.copyContent||''});
    queue.push(JSON.parse(JSON.stringify(c)));
  });
  if(!queue.length){LS.set('_meta_migrated_v1','1');return;}
  var idx=0;
  function saveNext(){
    if(idx>=queue.length){
      LS.set('_meta_migrated_v1','1');
      console.log('[Migration] Done, updated '+queue.length+' cards');
      return;
    }
    var card=queue[idx];idx++;
    gasAPI('saveCard',{data:JSON.stringify(card)},function(r){
      console.log('[Migration] '+(r&&r.ok?'OK':'FAIL')+': '+card.title);
      saveNext();
    });
  }
  console.log('[Migration] Updating '+queue.length+' cards with meta fields...');
  saveNext();
}

function applyFullData(data,adminCards){
  if(data){
    if(data.cards&&data.cards.length)CARDS=data.cards;
    if(data.pages&&data.pages.length)PAGES=data.pages;
    if(data.gemUrl)GEM_URL=data.gemUrl;
    var _s=data.stats||{};_statsData=_s.tools||_s;_totalVisits=_s.total||0;_todayVisits=_s.today||0;
    if(data.settings){_settings=data.settings;applyAnnouncement();applySEO();applySiteInfo();}
  }
  mergeAdminExtra(CARDS,adminCards);
  applyHashRoute();
  buildNavTabs();buildHeroGrid();renderCards();updateVisit();observeCards();
  checkArticleHash();
}

/* ====== INIT ====== */
function init(){
  initTheme();
  buildStars();
  initSearch();
  loadHubIndex();
  /* getStats records one visit; do not also record a synthetic tool click. */

  /* 1. Try render from localStorage cache (instant, correct data) */
  var cache=loadCache();
  var _hasCache=false;
  if(cache&&cache.cards&&cache.cards.length){
    _hasCache=true;
    CARDS=cache.cards;
    if(cache.nav&&cache.nav.length){NAV=cache.nav;PAGES=NAV.map(function(n){return n.name});HERO_META=NAV.map(function(n){return{ico:n.ico||'',desc:n.desc||''}});}
    else if(cache.pages&&cache.pages.length){PAGES=cache.pages;NAV=PAGES.map(function(p){return{name:p,children:[]}});}
    if(cache.stats){_statsData=cache.stats.tools||cache.stats;_totalVisits=cache.stats.total||0;_todayVisits=cache.stats.today||0;}
    if(cache.settings){_settings=cache.settings;applyAnnouncement();applySEO();applySiteInfo();}
  }
  /* 1b. 權威資料源：repo 的 data.json + site.json（GitHub Pages 靜態檔，快且穩）。
     GAS 只負責瀏覽數與學員登入，內容一律以 repo 為準。 */
  if(typeof fetch==='function'){
    Promise.all([
      fetch('./data.json',{cache:'no-cache'}).then(function(r){return r.ok?r.json():null}),
      fetch('./site.json',{cache:'no-cache'}).then(function(r){return r.ok?r.json():null}).catch(function(){return null})
    ]).then(function(res){
      var d=res[0],site=res[1];
      if(!d||!d.cards||!d.cards.length)return;
      CARDS=d.cards;
      if(site){
        if(site.nav&&site.nav.length){
          NAV=site.nav;
          PAGES=NAV.map(function(n){return n.name});
          HERO_META=NAV.map(function(n){return {ico:n.ico||'',desc:n.desc||''}});
        }else if(site.pages&&site.pages.length){
          PAGES=site.pages;
          NAV=PAGES.map(function(p,i){var m=(site.heroMeta||[])[i]||{};return{name:p,ico:m.ico||'',desc:m.desc||'',children:[]}});
          if(site.heroMeta&&site.heroMeta.length)HERO_META=site.heroMeta;
        }
        if(site.gemUrl)GEM_URL=site.gemUrl;
        if(site.settings){_settings=site.settings;applyAnnouncement();applySEO();applySiteInfo();}
      }else{
        if(d.pages&&d.pages.length)PAGES=d.pages;
        if(d.settings){_settings=d.settings;applyAnnouncement();applySEO();applySiteInfo();}
      }
      if(d.stats&&!_statsFresh){var _s=d.stats;_statsData=_s.tools||_s;_totalVisits=_s.total||0;_todayVisits=_s.today||0;}
      applyHashRoute();
      buildNavTabs();buildHeroGrid();renderCards();updateVisit();observeCards();checkArticleHash();
      if($('globalSearch').value.trim())runSearch();
      saveCache({cards:CARDS,pages:PAGES,nav:NAV,stats:{total:_totalVisits,today:_todayVisits,tools:_statsData},settings:_settings});
    }).catch(function(){});
  }
  applyHashRoute();
  if(_hasCache){
    buildNavTabs();buildHeroGrid();renderCards();updateVisit();observeCards();
  }
  /* Resume login state（舊版 GAS 後台已移除，管理一律走 /manage.html） */
  {
    var stok=LS.get('student_token');
    if(stok){_userRole='student';var badge=$('studentBadge');if(badge)badge.style.display='';}
  }
  /* Footer hidden student login dot */
  var _dot=$('studentLoginDot');
  if(_dot)_dot.onclick=function(){if(_userRole==='public')showStudentLogin();};
  /* Student badge click → logout menu */
  (function(){
    var badge=$('studentBadge');
    if(!badge)return;
    badge.onclick=function(e){
      e.stopPropagation();
      var menu=document.getElementById('studentBadgeMenu');
      if(menu){menu.remove();return;}
      menu=ce('div','student-badge-menu');menu.id='studentBadgeMenu';
      var logoutBtn=ce('button','','\u767B\u51FA');
      logoutBtn.onclick=function(e){e.stopPropagation();menu.remove();disableStudentMode();toast('\u5DF2\u767B\u51FA\u5B78\u54E1\u6A21\u5F0F');};
      menu.appendChild(logoutBtn);
      badge.appendChild(menu);
      document.addEventListener('click',function hide(){menu.remove();document.removeEventListener('click',hide)},{once:true});
    };
  })();
  /* If no cache: skeleton stays, nav/hero/counter all wait for API */
  /* If no cache, skeleton stays visible until API returns */

  /* 2. GAS 只補「即時瀏覽數」：不覆蓋內容，掛了也不影響網站。
     用輕量的 getStats（只回統計與各卡片數字）；整包 getData 要 6-9 秒。 */
  gasAPI('getStats',null,function(data){
    if(!data||!data.ok)return;
    var vmap=data.views||{};
    var changed=false;
    CARDS.forEach(function(c){if(vmap[c.id]!=null&&vmap[c.id]!==c.views){c.views=vmap[c.id];changed=true}});
    if(data.stats){var _s=data.stats;_statsData=_s.tools||_s;_totalVisits=_s.total||0;_todayVisits=_s.today||0;updateVisit(true);}
    if(changed&&!_searchActive){renderCards();}
  });

  /* Failsafe: if data never arrives after 20s, show error with reload button */
  setTimeout(function(){
    if(CARDS.length){
      /* repo data.json 已渲染或快取已渲染 — 不需處理 */
    }else{
      var grid=$('toolsGrid');
      if(grid)grid.innerHTML='<div class="tools-empty" style="padding:60px 24px"><div style="font-size:40px;margin-bottom:16px">⚠️</div><div style="font-size:17px;font-weight:600;color:var(--text);margin-bottom:8px">資料載入失敗</div><div style="font-size:14px;color:var(--text2);margin-bottom:24px">請確認網路連線後重新載入頁面</div><button onclick="location.reload()" style="padding:10px 28px;border-radius:8px;background:var(--accent);color:#fff;font-size:14px;font-weight:600;border:none;cursor:pointer">重新載入</button></div>';
      var tools=$('tools');if(tools)tools.scrollIntoView({behavior:'smooth'});
    }
  },20000);

  window.addEventListener('hashchange',function(){
    var h=decodeURIComponent(location.hash.replace('#',''));
    if(h.indexOf('article=')===0){checkArticleHash();return}
    if(_currentArticleId)hideArticleReader();
    var prevTab=_activeTab,prevSub=_activeSub,prevView=_catalogView;
    applyHashRoute();
    if(_activeTab!==prevTab||_activeSub!==prevSub||_catalogView!==prevView){
      clearSearch();
      buildNavTabs();
      renderCards();
    }
  });
  checkArticleHash();
}

/* ====== IMAGE EDIT TOOLBAR IN EDITOR ====== */
var _imgToolbar=null;
var _imgSelected=null;

function createImgToolbar(){
  if(_imgToolbar)return _imgToolbar;
  var tb=document.createElement('div');
  tb.className='img-edit-toolbar';
  tb.style.display='none';

  function addBtn(text,cls,fn){
    var b=document.createElement('button');
    b.textContent=text;
    if(cls)b.className=cls;
    b.onmousedown=function(e){e.preventDefault()};
    b.onclick=function(e){e.preventDefault();fn(b)};
    tb.appendChild(b);
    return b;
  }
  function addSep(){var s=document.createElement('div');s.className='iet-sep';tb.appendChild(s)}

  /* Size */
  addBtn('小','',function(){applyImgClass('img-size-','img-size-small')});
  addBtn('中','',function(){applyImgClass('img-size-','img-size-medium')});
  addBtn('大','',function(){applyImgClass('img-size-','img-size-large')});
  addBtn('滿版','',function(){applyImgClass('img-size-','img-size-full')});
  addSep();
  /* Alignment / Float */
  addBtn('⬅ 左浮','',function(){applyImgClass('img-float-|img-center','img-float-left')});
  addBtn('置中','',function(){applyImgClass('img-float-|img-center','img-center')});
  addBtn('右浮 ➡','',function(){applyImgClass('img-float-|img-center','img-float-right')});
  addSep();
  /* Delete */
  addBtn('🗑 刪除','iet-danger',function(){
    if(_imgSelected){_imgSelected.remove();hideImgToolbar()}
  });

  document.body.appendChild(tb);
  _imgToolbar=tb;
  return tb;
}

function applyImgClass(removePrefix,addClass){
  if(!_imgSelected)return;
  /* Remove classes matching prefix patterns (pipe-separated) */
  removePrefix.split('|').forEach(function(pf){
    var toRemove=[];
    _imgSelected.classList.forEach(function(c){if(c.indexOf(pf)===0)toRemove.push(c)});
    toRemove.forEach(function(c){_imgSelected.classList.remove(c)});
  });
  if(addClass)_imgSelected.classList.add(addClass);
  positionImgToolbar();
  updateImgToolbarActive();
}

function showImgToolbar(img){
  if(_imgSelected)_imgSelected.classList.remove('img-selected');
  _imgSelected=img;
  img.classList.add('img-selected');
  var tb=createImgToolbar();
  tb.style.display='flex';
  positionImgToolbar();
  updateImgToolbarActive();
}

function positionImgToolbar(){
  if(!_imgToolbar||!_imgSelected)return;
  var rect=_imgSelected.getBoundingClientRect();
  _imgToolbar.style.left=Math.max(8,rect.left)+'px';
  _imgToolbar.style.top=Math.max(8,rect.top-44)+'px';
  _imgToolbar.style.position='fixed';
}

function hideImgToolbar(){
  if(_imgSelected){_imgSelected.classList.remove('img-selected');_imgSelected=null}
  if(_imgToolbar)_imgToolbar.style.display='none';
}

function updateImgToolbarActive(){
  if(!_imgToolbar||!_imgSelected)return;
  var btns=_imgToolbar.querySelectorAll('button');
  var cls=_imgSelected.className;
  var map={'小':'img-size-small','中':'img-size-medium','大':'img-size-large','滿版':'img-size-full','⬅ 左浮':'img-float-left','置中':'img-center','右浮 ➡':'img-float-right'};
  btns.forEach(function(b){
    var expected=map[b.textContent];
    if(expected)b.classList.toggle('active',cls.indexOf(expected)>=0);
  });
}

/* Delegate click on images inside editor */
document.addEventListener('click',function(e){
  var editor=$('articleEditor');
  if(!editor)return;
  if(e.target.tagName==='IMG'&&editor.contains(e.target)){
    e.preventDefault();
    showImgToolbar(e.target);
    return;
  }
  /* Click outside image: hide toolbar (but not if clicking toolbar itself) */
  if(_imgToolbar&&!_imgToolbar.contains(e.target)){
    hideImgToolbar();
  }
});

/* ====== INLINE BUTTON (ICB) SYSTEM — unified copy + link ====== */
var _icbEditTarget=null;
var _icbMode='block';
var _icbStyle='primary';
var _icbBehavior='copy'; /* 'copy' or 'link' */
var _ICB_MARKER_ID='_icb_insert_marker_';
var _lastEditorRange=null;

/* Track cursor position in editor on every interaction */
document.addEventListener('mouseup',function(){_saveEditorRange()},true);
document.addEventListener('keyup',function(){_saveEditorRange()},true);
function _saveEditorRange(){
  var editor=$('articleEditor');if(!editor)return;
  var sel=window.getSelection();if(!sel||!sel.rangeCount)return;
  var range=sel.getRangeAt(0);
  if(editor.contains(range.startContainer)){_lastEditorRange=range.cloneRange()}
}

function openIcbDialog(existingEl){
  /* Insert a temporary marker at last known cursor position */
  if(!existingEl){
    var editor=$('articleEditor');
    if(editor){
      /* Remove any old marker */
      var old=document.getElementById(_ICB_MARKER_ID);if(old)old.parentNode.removeChild(old);
      /* Restore last known cursor position, then insert marker */
      if(_lastEditorRange){
        var sel=window.getSelection();
        sel.removeAllRanges();
        sel.addRange(_lastEditorRange);
        document.execCommand('insertHTML',false,'<span id="'+_ICB_MARKER_ID+'" style="display:none">\u200B</span>');
      }else{
        /* No saved position — append marker at end */
        var mk=document.createElement('span');mk.id=_ICB_MARKER_ID;mk.style.display='none';
        editor.appendChild(mk);
      }
    }
  }
  _icbEditTarget=existingEl;
  var overlay=$('icbDialogOverlay');
  $('icbDialogTitle').textContent=existingEl?'\u7DE8\u8F2F\u6309\u9375':'\u63D2\u5165\u6309\u9375';
  $('icbConfirm').textContent=existingEl?'\u66F4\u65B0':'\u63D2\u5165';
  $('icbDelete').style.display=existingEl?'inline-block':'none';

  /* Populate from existing or defaults */
  var data={label:'\u9EDE\u6211\u8907\u88FD',icon:'\uD83D\uDCCB',style:'primary',mode:'block',behavior:'copy',copy:'',desc:'',linkUrl:'',linkNewTab:true};
  if(existingEl){
    data.label=existingEl.getAttribute('data-label')||data.label;
    data.icon=existingEl.getAttribute('data-icon')||data.icon;
    data.style=existingEl.getAttribute('data-style')||data.style;
    data.mode=existingEl.getAttribute('data-mode')||data.mode;
    data.behavior=existingEl.getAttribute('data-behavior')||data.behavior;
    data.copy=existingEl.getAttribute('data-copy-b64')?_b64d(existingEl.getAttribute('data-copy-b64')):(existingEl.getAttribute('data-copy')||data.copy);
    data.desc=existingEl.getAttribute('data-desc')||data.desc;
    data.linkUrl=existingEl.getAttribute('data-link-url')||data.linkUrl;
    data.linkNewTab=existingEl.getAttribute('data-link-newtab')!=='false';
  }
  $('icbLabel').value=data.label;
  $('icbIcon').value=data.icon;
  $('icbCopyContent').value=data.copy;
  $('icbDesc').value=data.desc;
  $('icbLinkUrl').value=data.linkUrl;
  $('icbLinkNewTab').checked=data.linkNewTab;
  _icbMode=data.mode;
  _icbStyle=data.style;
  _icbBehavior=data.behavior;
  _toggleIcbBehavior();

  /* Update UI selections */
  overlay.querySelectorAll('#icbDisplayRow .icb-mode-opt').forEach(function(el){
    el.classList.toggle('active',el.getAttribute('data-mode')===_icbMode);
  });
  overlay.querySelectorAll('#icbBehaviorRow .icb-mode-opt').forEach(function(el){
    el.classList.toggle('active',el.getAttribute('data-behavior')===_icbBehavior);
  });
  overlay.querySelectorAll('.icb-style-opt').forEach(function(el){
    el.classList.toggle('active',el.getAttribute('data-style')===_icbStyle);
  });
  overlay.classList.add('show');
}

/* Behavior toggle (copy / link) */
function _toggleIcbBehavior(){
  var isCopy=_icbBehavior==='copy';
  $('icbCopyField').style.display=isCopy?'':'none';
  $('icbLinkField').style.display=isCopy?'none':'';
  $('icbLinkTargetField').style.display=isCopy?'none':'';
  if(isCopy){
    $('icbLabel').placeholder='\u4F8B\uFF1A\u8907\u88FD Prompt / \u8907\u88FD\u9023\u7D50';
    if(!$('icbLabel').value||$('icbLabel').value==='\u524D\u5F80\u5DE5\u5177')$('icbLabel').value='\u9EDE\u6211\u8907\u88FD';
    if(!$('icbIcon').value||$('icbIcon').value==='\u2197')$('icbIcon').value='\uD83D\uDCCB';
  }else{
    $('icbLabel').placeholder='\u4F8B\uFF1A\u524D\u5F80\u5DE5\u5177 / \u958B\u555F\u9023\u7D50';
    if(!$('icbLabel').value||$('icbLabel').value==='\u9EDE\u6211\u8907\u88FD')$('icbLabel').value='\u524D\u5F80\u5DE5\u5177';
    if(!$('icbIcon').value||$('icbIcon').value==='\uD83D\uDCCB')$('icbIcon').value='\u2197';
  }
}
$('icbBehaviorRow').querySelectorAll('.icb-mode-opt').forEach(function(el){
  el.onclick=function(){
    _icbBehavior=this.getAttribute('data-behavior');
    $('icbBehaviorRow').querySelectorAll('.icb-mode-opt').forEach(function(b){b.classList.remove('active')});
    this.classList.add('active');
    _toggleIcbBehavior();
  };
});
/* Display mode toggle (block / inline) */
$('icbDisplayRow').querySelectorAll('.icb-mode-opt').forEach(function(el){
  el.onclick=function(){
    _icbMode=this.getAttribute('data-mode');
    $('icbDisplayRow').querySelectorAll('.icb-mode-opt').forEach(function(b){b.classList.remove('active')});
    this.classList.add('active');
  };
});

/* Style toggle */
$('icbDialogOverlay').querySelectorAll('.icb-style-opt').forEach(function(el){
  el.onclick=function(){
    _icbStyle=this.getAttribute('data-style');
    $('icbDialogOverlay').querySelectorAll('.icb-style-opt').forEach(function(b){b.classList.remove('active')});
    this.classList.add('active');
  };
});

/* Cancel */
$('icbCancel').onclick=function(){
  $('icbDialogOverlay').classList.remove('show');
  _icbEditTarget=null;
};

/* Prevent paste interception on copy content textarea */
$('icbCopyContent').addEventListener('paste',function(e){e.stopPropagation()});
$('icbCopyContent').addEventListener('keydown',function(e){e.stopPropagation()});
$('icbCopyContent').addEventListener('input',function(e){e.stopPropagation()});

/* Delete */
$('icbDelete').onclick=function(){
  if(_icbEditTarget){
    _icbEditTarget.parentNode.removeChild(_icbEditTarget);
    toast('已刪除複製按鈕');
  }
  $('icbDialogOverlay').classList.remove('show');
  _icbEditTarget=null;
};

/* Confirm insert/update */
$('icbConfirm').onclick=function(){
  var label=$('icbLabel').value.trim()||((_icbBehavior==='copy')?'\u9EDE\u6211\u8907\u88FD':'\u524D\u5F80\u5DE5\u5177');
  var icon=$('icbIcon').value.trim()||((_icbBehavior==='copy')?'\uD83D\uDCCB':'\u2197');
  var copyContent=(_icbBehavior==='copy')?($('icbCopyContent').value||''):'';
  var linkUrl=(_icbBehavior==='link')?($('icbLinkUrl').value.trim()||''):'';
  var linkNewTab=$('icbLinkNewTab').checked;
  var desc=$('icbDesc').value.trim();
  if(_icbBehavior==='copy'&&!copyContent){toast('\u8ACB\u8F38\u5165\u8907\u88FD\u5167\u5BB9');return;}
  if(_icbBehavior==='link'&&!linkUrl){toast('\u8ACB\u8F38\u5165\u9023\u7D50 URL');return;}

  var html=buildIcbHtml({label:label,icon:icon,behavior:_icbBehavior,style:_icbStyle,mode:_icbMode,copy:copyContent,linkUrl:linkUrl,linkNewTab:linkNewTab,desc:desc});

  if(_icbEditTarget){
    /* Update existing */
    _icbEditTarget.outerHTML=html;
  }else{
    /* Replace the marker with the copy button */
    var marker=document.getElementById(_ICB_MARKER_ID);
    if(marker){
      marker.outerHTML=html;
    }else{
      /* Fallback: insert at end of editor */
      var editor=$('articleEditor');
      if(editor){editor.innerHTML+=html;}
    }
  }
  $('icbDialogOverlay').classList.remove('show');
  _icbEditTarget=null;
};

function _b64e(s){
  if(!s)return '';
  try{
    var encoded=encodeURIComponent(s);
    var bytes=unescape(encoded);
    if(bytes.length>2097152)bytes=bytes.substring(0,2097152);
    return btoa(bytes);
  }catch(e){
    /* Fallback: encode char by char */
    try{
      var result='';
      var utf8=unescape(encodeURIComponent(s.substring(0,500000)));
      result=btoa(utf8);
      return result;
    }catch(e2){return ''}
  }
}
function _b64d(s){try{return decodeURIComponent(escape(atob(s)))}catch(e){return s}}
function buildIcbHtml(d){
  var behavior=d.behavior||'copy';
  var b64=(behavior==='copy')?_b64e(d.copy):'';
  var linkAttr=(behavior==='link')?' data-link-url="'+esc(d.linkUrl||'')+'" data-link-newtab="'+(d.linkNewTab!==false)+'"':'';
  var copyAttr=(behavior==='copy')?' data-copy-b64="'+esc(b64)+'"':'';
  var descAttr=d.desc?' data-desc="'+esc(d.desc)+'"':'';
  var descHtml=d.desc?'<div class="icb-desc">'+esc(d.desc)+'</div>':'';
  var previewText='';
  if(behavior==='copy'&&d.copy){previewText=esc(d.copy.length>120?d.copy.substring(0,120)+'\u2026':d.copy)}
  else if(behavior==='link'&&d.linkUrl){previewText='\uD83D\uDD17 '+esc(d.linkUrl.length>60?d.linkUrl.substring(0,60)+'\u2026':d.linkUrl)}
  var baseAttrs='data-label="'+esc(d.label)+'" data-icon="'+esc(d.icon)+'" data-behavior="'+behavior+'" data-style="'+d.style+'" data-mode="'+d.mode+'"'+copyAttr+linkAttr+descAttr;
  var behaviorLabel=(behavior==='copy')?'\uD83D\uDCCB \u8907\u88FD':'\uD83D\uDD17 \u9023\u7D50';
  if(d.mode==='block'){
    return '<div class="inline-copy-btn" '+baseAttrs+' contenteditable="false">'
      +descHtml
      +(previewText?'<div class="icb-preview">'+previewText+'</div>':'')
      +'<div class="icb-bar"><span class="icb-label">'+behaviorLabel+'</span>'
      +'<span class="icb-action style-'+d.style+'">'+esc(d.icon)+' '+esc(d.label)+'</span></div>'
      +'<span class="icb-delete-hint" title="\u9EDE\u6211\u7DE8\u8F2F">\u270F\uFE0F</span></div>';
  }else{
    return '<span class="inline-copy-btn" '+baseAttrs+' contenteditable="false">'
      +'<span class="icb-bar"><span class="icb-action style-'+d.style+'">'+esc(d.icon)+' '+esc(d.label)+'</span></span></span>';
  }
}

/* Click-to-edit in editor: delegate from articleEditor */
document.addEventListener('click',function(e){
  var target=e.target.closest('.inline-copy-btn');
  if(!target)return;
  /* Only allow edit if inside the rte-editor */
  var editor=$('articleEditor');
  if(editor&&editor.contains(target)){
    e.preventDefault();
    e.stopPropagation();
    openIcbDialog(target);
  }
});

/* ====== HYDRATE inline-copy-btn in article reader ====== */
function hydrateInlineCopyBtns(container){
  var btns=container.querySelectorAll('.inline-copy-btn');
  btns.forEach(function(el){
    var behavior=el.getAttribute('data-behavior')||'copy';
    var copyContent=el.getAttribute('data-copy-b64')?_b64d(el.getAttribute('data-copy-b64')):(el.getAttribute('data-copy')||'');
    var linkUrl=el.getAttribute('data-link-url')||'';
    var linkNewTab=el.getAttribute('data-link-newtab')!=='false';
    var label=el.getAttribute('data-label')||(behavior==='copy'?'\u9EDE\u6211\u8907\u88FD':'\u524D\u5F80\u5DE5\u5177');
    var icon=el.getAttribute('data-icon')||(behavior==='copy'?'\uD83D\uDCCB':'\u2197');
    var style=el.getAttribute('data-style')||'primary';
    var mode=el.getAttribute('data-mode')||'block';
    var desc=el.getAttribute('data-desc')||'';

    el.innerHTML='';
    el.removeAttribute('contenteditable');

    if(mode==='block'){
      if(desc){var descEl=document.createElement('div');descEl.className='icb-desc';descEl.textContent=desc;el.appendChild(descEl)}
      /* Preview area — only for copy mode */
      if(behavior==='copy'&&copyContent){
        var preview=document.createElement('div');
        preview.className='icb-preview';
        preview.textContent=copyContent;
        el.appendChild(preview);
        setTimeout(function(){
          if(preview.scrollHeight>preview.clientHeight+4){
            preview.classList.add('expandable');
            preview.onclick=function(){this.classList.toggle('expanded');this.classList.toggle('expandable')};
            preview.style.cursor='pointer';
          }
        },50);
      }
      var bar=document.createElement('div');bar.className='icb-bar';
      var lbl=document.createElement('span');lbl.className='icb-label';
      lbl.textContent=behavior==='copy'?'\uD83D\uDCCB \u8907\u88FD':'\uD83D\uDD17 \u9023\u7D50';
      bar.appendChild(lbl);
      var btn=document.createElement('button');
      btn.className='icb-action style-'+style;
      btn.textContent=icon+' '+label;
      if(behavior==='link'){
        btn.onclick=function(){window.open(linkUrl,linkNewTab?'_blank':'_self')};
      }else{
        btn.onclick=function(){copyText(copyContent).then(function(ok){if(!ok)return;var o=btn.textContent;btn.textContent='\u2705 \u5DF2\u8907\u88FD\uFF01';setTimeout(function(){btn.textContent=o},2000)});};
      }
      bar.appendChild(btn);el.appendChild(bar);
    }else{
      var bar=document.createElement('span');bar.className='icb-bar';
      var btn=document.createElement('button');
      btn.className='icb-action style-'+style;
      btn.textContent=icon+' '+label;
      if(behavior==='link'){
        btn.onclick=function(e){e.stopPropagation();window.open(linkUrl,linkNewTab?'_blank':'_self')};
      }else{
        btn.onclick=function(e){e.stopPropagation();copyText(copyContent).then(function(ok){if(!ok)return;var o=btn.textContent;btn.textContent='\u2705 \u5DF2\u8907\u88FD\uFF01';setTimeout(function(){btn.textContent=o},2000)});};
      }
      bar.appendChild(btn);
      el.appendChild(bar);
    }
  });
}

/* ====== 省效能模式偵測 ======
   無硬體加速的電腦（公司/醫院 IT 常關掉）跑 blur 特效會整頁卡死。
   開頁後量 0.8 秒實際 FPS，低於 24 就加上 html.lite 關特效，並記住。 */
(function(){
  try{
    if(LS.get('lite_mode')==='1'){
      document.documentElement.classList.add('lite');
      return;
    }
  }catch(e){}
  if(document.hidden)return; /* 背景分頁 FPS 不準，跳過這次 */
  var t0=performance.now(),frames=0;
  function tick(){
    frames++;
    var dt=performance.now()-t0;
    if(dt<800){requestAnimationFrame(tick);return;}
    if(document.hidden)return;
    var fps=frames/(dt/1000);
    if(fps<24){
      document.documentElement.classList.add('lite');
      try{LS.set('lite_mode','1');}catch(e){}
    }
  }
  requestAnimationFrame(tick);
})();

document.addEventListener('keydown',function(e){
  var panel=$('drawer').classList.contains('show')?$('drawer'):(_currentArticleId?$('articleOverlay'):null);
  if(!panel)return;
  if(e.key==='Escape'){if(_currentArticleId)closeArticleReader();else closeDrawer();return}
  if(e.key==='Tab'){
    var els=Array.from(panel.querySelectorAll('a[href],button,input,[tabindex="0"]')).filter(function(el){return !el.disabled&&el.getClientRects().length});
    var first=els[0],last=els[els.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
});
init();
})();
