/* Progressive theme layer. No credentials or browser-local global settings. */
(function(){
  'use strict';
  var root=document.documentElement;
  var scenes=['forest','sky','meadow','lake'];
  var preview=new URLSearchParams(location.search).get('previewTheme');
  function active(){return scenes.indexOf(root.dataset.scene)!==-1;}
  function go(name,select){select(name);document.getElementById('tools').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
  function link(label,action){var b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;return b;}
  window.NatureThemes={
    apply:function(settings,restoreOriginal,getAppearance){
      var choice=preview!==null?preview:settings.site_scene;
      if(scenes.indexOf(choice)===-1){var wasActive=active();delete root.dataset.scene;if(wasActive&&restoreOriginal)restoreOriginal();return;}
      root.dataset.scene=choice;
      var appearance=getAppearance&&getAppearance(choice);
      if(appearance!=='dark'&&appearance!=='light')appearance='light';
      root.setAttribute('data-theme',appearance);
      var toggle=document.getElementById('themeToggle');
      if(toggle)toggle.textContent=appearance==='dark'?'☀️':'🌙';
      var title=document.getElementById('heroTitle');
      title.replaceChildren(document.createTextNode('Jyunhao'),document.createElement('br'),document.createTextNode('AI工具資源平台'));
      document.getElementById('heroSub').textContent='Work smarter with ease.';
    },
    buildHero:function(pages,select){
      if(!active())return false;
      var grid=document.getElementById('heroGrid');grid.replaceChildren();
      if(pages.length)grid.appendChild(link('瀏覽工具 →',function(){go(pages[0],select);}));
      return true;
    },
    /* Navigation remains owned by the original renderer in every theme. */
    buildNav:function(){return false;}
  };
  document.addEventListener('DOMContentLoaded',function(){
    var logo=document.querySelector('.nav-logo-icon');
    if(logo){
      var entry=document.createElement('a');entry.className='scene-admin';entry.href='./manage.html';entry.textContent='AI';entry.title='管理員登入';entry.setAttribute('aria-label','管理員登入');
      entry.onclick=function(e){e.stopPropagation();};
      logo.parentNode.insertBefore(entry,logo);
    }
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
      document.addEventListener('pointermove',function(e){if(active()&&e.pointerType==='mouse'){
        root.style.setProperty('--nature-x',((e.clientX/innerWidth-.5)*-12)+'px');
        root.style.setProperty('--nature-y',((e.clientY/innerHeight-.5)*-8)+'px');
      }},{passive:true});
    }
  });
})();
