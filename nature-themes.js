/* Progressive theme layer. No credentials or browser-local global settings. */
(function(){
  'use strict';
  var root=document.documentElement;
  var scenes=['forest','sky','meadow','lake'];
  var preview=new URLSearchParams(location.search).get('previewTheme');
  function active(){return scenes.indexOf(root.dataset.scene)!==-1;}
  function go(name){switchTab(name);document.getElementById('tools').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
  function link(label,action){var b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;return b;}
  window.NatureThemes={
    apply:function(settings){
      var choice=preview!==null?preview:settings.site_scene;
      if(scenes.indexOf(choice)===-1){var wasActive=active();delete root.dataset.scene;if(wasActive&&typeof initTheme==='function')initTheme();return;}
      root.dataset.scene=choice;
      root.setAttribute('data-theme',choice==='forest'?'dark':'light');
      var title=document.getElementById('heroTitle');
      title.replaceChildren(document.createTextNode('Jyunhao'),document.createElement('br'),document.createTextNode('AI工具資源平台'));
      document.getElementById('heroSub').textContent='Work smarter with ease.';
    },
    buildHero:function(){
      if(!active())return false;
      var grid=document.getElementById('heroGrid');grid.replaceChildren();
      [['簡報創作','簡報製作'],['影像生成','圖像生成'],['效率工具','工具箱']].forEach(function(pair){
        if(PAGES.indexOf(pair[1])!==-1)grid.appendChild(link(pair[0]+' ↗',function(){go(pair[1]);}));
      });return true;
    },
    buildNav:function(){
      if(!active())return false;
      var nav=document.getElementById('navTabs');nav.replaceChildren();clearNavMenus();
      nav.appendChild(link('探索工具',function(){document.getElementById('tools').scrollIntoView({behavior:'smooth'});}));
      if(PAGES.indexOf('關於我們')!==-1)nav.appendChild(link('關於',function(){go('關於我們');}));
      return true;
    }
  };
  document.addEventListener('DOMContentLoaded',function(){
    var logo=document.querySelector('.nav-logo-icon');
    if(logo){
      var entry=document.createElement('a');entry.className='scene-admin';entry.href='./manage.html';entry.textContent='AI';entry.title='管理員登入';entry.setAttribute('aria-label','管理員登入');
      entry.onclick=function(e){e.stopPropagation();};
      logo.parentNode.insertBefore(entry,logo);
    }
    var tools=document.getElementById('tools');
    if(tools){
      var chooser=document.createElement('div');chooser.className='scene-categories';chooser.setAttribute('aria-label','工具分類');tools.prepend(chooser);
      function refresh(){
        chooser.replaceChildren();
        if(typeof PAGES==='undefined')return;
        PAGES.forEach(function(name){chooser.appendChild(link(name,function(){go(name);}));});
      }
      refresh();
      new MutationObserver(refresh).observe(document.getElementById('heroGrid'),{childList:true});
    }
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
      document.addEventListener('pointermove',function(e){if(active()&&e.pointerType==='mouse'){
        root.style.setProperty('--nature-x',((e.clientX/innerWidth-.5)*-12)+'px');
        root.style.setProperty('--nature-y',((e.clientY/innerHeight-.5)*-8)+'px');
      }},{passive:true});
    }
  });
})();
