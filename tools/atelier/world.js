import {T,batch,movement,group} from './craft.js';
import {loadArt} from './surfaces.js';
import {buildDistrict} from './block.js';
import {promenade} from './promenade.js';
import {buildCity} from './city.js';
import {buildLane,wetLane} from './lane.js';
import {buildTown} from './town.js';
import {streetVisit} from './streets.js';
import {paintNotes} from './wall.js';
import {studioLight} from './interiors.js';
import {wallUI} from './wall-ui.js';
import {atmosphere} from './atmosphere.js';

const stage=document.querySelector('#scene');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let paused=reduced.matches;
function report(type,details={}){
  if(parent!==window)parent.postMessage({channel:'atelier',type,paused,...details},location.origin);
}
async function start(){
  const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.outputColorSpace=T.SRGBColorSpace;
  const nativeRatio=Math.min(devicePixelRatio,1.60);
  renderer.setPixelRatio(nativeRatio);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(60,1,.035,220);
  const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label','城鎮街景，拖曳環顧，WASD 或方向鍵移動。點選店面可入內，Esc 返回街道。');
  stage.append(canvas);
  const hemi=new T.HemisphereLight(0xfff3de,0xb6b6a8,1.72);scene.add(hemi);
  const sun=new T.DirectionalLight(0xffe5bf,2.18);sun.position.set(-11,16,8);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-19,right:19,top:16,bottom:-16,near:.5,far:58});
  sun.shadow.normalBias=.014;sun.shadow.bias=-.00016;sun.shadow.camera.updateProjectionMatrix();scene.add(sun);
  const bounce=new T.DirectionalLight(0xe1e9f4,.48);bounce.position.set(6,4,-5);scene.add(bounce);
  const art=await loadArt();
  const district=group(scene);buildDistrict(district,art);batch(district);
  const town=buildTown(scene,art);
  const lane=buildLane(scene),fest=promenade(scene),reflect=wetLane(scene,lane,fest);buildCity(scene);
  const sky=atmosphere(scene,camera,sun,hemi,bounce,town,report);
  const notes=wallUI(paintNotes,()=>{report('wallClosed');canvas.focus({preventScroll:true});});
  function openWall(){if(visit.mode==='film'){visit.step(0);notes.open();report('wallOpen');}}
  const visit=streetVisit(camera,canvas,(type,details)=>{
    if(type==='openWall'){openWall();return;}
    if(type==='place'){studioLight.visible=details.place==='film';if(studioLight.visible)notes.load();}
    report(type,details);
  },reduced,district.getObjectByName('cinema-tram'));
  let lastFrame=null,elapsed=0,lastShadow=-1,presented=false;
  let viewportWidth=0,viewportHeight=0,ratio=nativeRatio,sample=0,frames=0,shadowInterval=.26;
  function resize(){
    const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);
    if(w===viewportWidth&&h===viewportHeight)return;
    viewportWidth=w;viewportHeight=h;renderer.setSize(w,h,false);visit.resize(w,h);
  }
  new ResizeObserver(resize).observe(stage);resize();
  function setPaused(value){paused=value;lastFrame=null;report('playback');}
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==parent||event.data?.channel!=='atelier')return;
    const data=event.data;
    if(data.type==='wall'){openWall();return;}
    if(data.type==='climate')sky.set(data);
    if(data.type==='toggle')setPaused(!paused);
    if(data.type==='go')visit.go(data.place);
    if(data.type==='step')visit.step(Math.sign(data.value)||0);
  });
  reduced.addEventListener('change',e=>setPaused(e.matches));
  document.addEventListener('visibilitychange',()=>{lastFrame=null;});
  function tune(dt){
    if(dt<=0||paused)return;
    sample+=Math.min(dt,.35);frames++;
    if(sample<2.1)return;
    const avg=sample/frames;
    const next=avg>.044?Math.max(.78,ratio-.18):avg<.023?Math.min(nativeRatio,ratio+.09):ratio;
    if(Math.abs(ratio-next)>.01){ratio=next;renderer.setPixelRatio(ratio);}
    shadowInterval=avg>.070?1.2:avg>.04?.6:.26;
    sample=0;frames=0;
  }
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();renderer.setAnimationLoop(null);report('unavailable');},{once:true});
  renderer.setAnimationLoop(now=>{
    if(document.hidden){lastFrame=null;return;}
    const dt=lastFrame===null?0:Math.max(0,(now-lastFrame)/1000);lastFrame=now;
    visit.update(Math.min(dt,.15),!paused);
    if(!paused)elapsed+=dt;
    sky.update(elapsed,dt);
    movement.forEach(fn=>fn(elapsed));
    if(lastShadow<0||elapsed-lastShadow>=shadowInterval){renderer.shadowMap.needsUpdate=true;lastShadow=elapsed;}
    tune(dt);reflect(renderer,camera,elapsed);renderer.render(scene,camera);
    if(!presented){presented=true;report('ready');}
  });
}
start().catch(error=>{console.error(error);report('unavailable');});
