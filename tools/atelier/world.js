import {T, batch, movement, group, contact} from './craft.js';
import {OrbitControls} from './orbit.js';
import {loadArt} from './surfaces.js';
import {buildDistrict} from './block.js';
import {lot} from './street.js';

const stage=document.querySelector('#scene');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let paused=reduced.matches;
function report(type){
  if(parent!==window)parent.postMessage({channel:'atelier',type,paused},location.origin);
}
async function start() {
  const renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;
  const nativeRatio=Math.min(devicePixelRatio,1.8);
  renderer.setPixelRatio(nativeRatio);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  // Shadows are low-frequency painted lighting. Render them at a lower rate than camera interaction.
  renderer.shadowMap.autoUpdate=false;
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-8,8,6,-6,.1,100);
  const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label','旋轉街區：拖曳或使用方向鍵；加減鍵縮放，Esc 回到全景');stage.append(canvas);
  const sky=new T.HemisphereLight(0xfffbf0,0xaebcce,1.58);scene.add(sky);
  const sun=new T.DirectionalLight(0xffe9cc,2.1);sun.position.set(-7.8,13,7.3);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:.5,far:36});sun.shadow.normalBias=.017;sun.shadow.bias=-.00015;sun.shadow.camera.updateProjectionMatrix();scene.add(sun);
  const bounce=new T.DirectionalLight(0xe1ebff,.53);bounce.position.set(6,4,-5);scene.add(bounce);
  contact(scene,lot.x+.40,lot.z+lot.railApron/2+.28,lot.width+5.6,lot.depth+lot.railApron+4.5,-.418);
  contact(scene,lot.x+.28,lot.z+lot.railApron/2+.12,lot.width+3.4,lot.depth+lot.railApron+3.1,-.417);
  const art=await loadArt();const district=group(scene);buildDistrict(district,art);
  movement.forEach(fn=>fn(0));batch(district);
  const controls=new OrbitControls(camera,canvas);controls.enablePan=false;controls.enableDamping=true;controls.dampingFactor=.085;controls.minPolarAngle=.44;controls.maxPolarAngle=1.49;
  controls.minZoom=.72;controls.maxZoom=3.7;controls.rotateSpeed=.67;controls.zoomSpeed=.90;
  const dist=27,homeAngle=.48,openingDuration=3.8,orbitSpeed=.098;
  const centerZ=lot.z+lot.railApron/2,baseDepth=lot.depth+lot.railApron;
  const points=[];
  for(const dx of [-lot.width/2,lot.width/2])for(const dz of [-baseDepth/2,baseDepth/2])for(const y of [-.42,.22])points.push(new T.Vector3(lot.x+dx,y,centerZ+dz));
  for(const x of [-1.46,1.65])for(const z of [.54,1.65])points.push(new T.Vector3(x,7.66,z));
  for(const pt of [[-7.98,4.20,.78],[3.27,6.4,-5.32],[-3.27,5.39,-1.82],[5.46,7.0,-.63],[-.9,7.6,-4.2]])points.push(new T.Vector3(...pt));
  let aspect=1,viewHeight=10.4,quietUntil=0,opening=!paused,openingTime=0,previousFrame=null;
  let elapsed=0,lastShadow=-1,dirty=true,forceShadow=true,sampleTime=0,sampleCount=0;
  let viewportWidth=0,viewportHeight=0,motionRatio=nativeRatio,staticShadows=false;
  const offset=new T.Vector3(),dir=new T.Vector3(),right=new T.Vector3(),up=new T.Vector3(),center=new T.Vector3();
  const homePitch=()=>aspect<1?.56:.41;
  function pose(angle,pitch,height,target) {
    dir.set(Math.sin(angle)*Math.cos(pitch),Math.sin(pitch),Math.cos(angle)*Math.cos(pitch));
    controls.target.copy(target);camera.position.copy(target).addScaledVector(dir,dist);camera.lookAt(target);
    viewHeight=height;
    camera.left=-height*aspect/2;camera.right=height*aspect/2;camera.top=height/2;camera.bottom=-height/2;
    camera.updateProjectionMatrix();dirty=true;
  }
  function frameBlock(angle,pitch,blend=1){
    right.set(Math.cos(angle),0,-Math.sin(angle));
    up.set(-Math.sin(pitch)*Math.sin(angle),Math.cos(pitch),-Math.sin(pitch)*Math.cos(angle));
    let left=Infinity,edge=-Infinity,bottom=Infinity,top=-Infinity;
    for(const pt of points){
      const x=pt.dot(right),y=pt.dot(up);
      left=Math.min(left,x);edge=Math.max(edge,x);bottom=Math.min(bottom,y);top=Math.max(top,y);
    }
    center.set(lot.x,0,centerZ);
    center.y=((bottom+top)/2-center.dot(up))/up.y;
    const fit=Math.max((edge-left)/aspect,top-bottom)*1.055+.13;
    center.lerp(controls.target,1-blend);
    pose(angle,pitch,T.MathUtils.lerp(viewHeight,fit,blend),center);
  }
  function glide(){
    const u=Math.min(1,openingTime/openingDuration);
    const arc=u+.21*u*(1-u);
    const slope=(1-u)*(1-u)*(1+2*u);
    frameBlock(homeAngle+.49*(1-arc),homePitch()+.16*slope);
    if(u===1)opening=false;
  }
  function resetOverview(){
    opening=false;camera.zoom=1;
    controls.enableDamping=false;controls.update(0);controls.enableDamping=true;
    frameBlock(homeAngle,homePitch());controls.update(0);quietUntil=performance.now()+3200;
  }
  function resize(){
    const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);
    if(w===viewportWidth&&h===viewportHeight)return;
    const firstView=viewportWidth===0;viewportWidth=w;viewportHeight=h;
    aspect=w/h;renderer.setSize(w,h,false);
    if(opening)glide();
    else if(firstView)frameBlock(homeAngle,homePitch());
    else{
      offset.copy(camera.position).sub(controls.target);
      frameBlock(Math.atan2(offset.x,offset.z),Math.asin(offset.y/offset.length()));
    }
    controls.update(0);forceShadow=true;dirty=true;
  }
  new ResizeObserver(resize).observe(stage);resize();
  controls.addEventListener('change',()=>dirty=true);
  controls.addEventListener('start',()=>{opening=false;quietUntil=Infinity;report('explore')});
  controls.addEventListener('end',()=>quietUntil=performance.now()+3800);
  const movingCasters=[];
  function collectCasters(node,moving=false){
    moving=moving||node.userData.moves;
    if(moving&&node.isMesh&&node.castShadow)movingCasters.push(node);
    for(const child of node.children)collectCasters(child,moving);
  }
  collectCasters(district);
  function applyQuality(){
    const ratio=paused?nativeRatio:motionRatio;
    if(Math.abs(renderer.getPixelRatio()-ratio)>.005)renderer.setPixelRatio(ratio);
    for(const caster of movingCasters)caster.castShadow=paused||!staticShadows;
    forceShadow=true;dirty=true;
  }
  function setPaused(value){
    paused=value;previousFrame=null;sampleTime=0;sampleCount=0;dirty=true;
    applyQuality();report('playback');
  }
  window.addEventListener('message',event=>{
    if(event.origin===location.origin&&event.source===parent&&event.data?.channel==='atelier'&&event.data.type==='toggle')setPaused(!paused);
  });
  reduced.addEventListener('change',e=>{if(e.matches)opening=false;setPaused(e.matches)});
  document.addEventListener('visibilitychange',()=>{previousFrame=null;sampleTime=0;sampleCount=0;dirty=true});
  canvas.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();report('explore');resetOverview();return}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(e.key))return;
    e.preventDefault();report('explore');opening=false;quietUntil=performance.now()+3800;
    if(['+','=','-'].includes(e.key)){camera.zoom=T.MathUtils.clamp(camera.zoom*(e.key==='-'?.88:1.14),.72,3.7);camera.updateProjectionMatrix();dirty=true;return}
    offset.copy(camera.position).sub(controls.target);
    const az=Math.atan2(offset.x,offset.z)+(e.key==='ArrowLeft'?.13:e.key==='ArrowRight'?-.13:0);
    const el=T.MathUtils.clamp(Math.asin(offset.y/offset.length())+(e.key==='ArrowUp'?.09:e.key==='ArrowDown'?-.09:0),.09,1.12);
    pose(az,el,viewHeight,controls.target);controls.update(0);
  });
  function tuneResolution(dt){
    if(dt<=0)return;
    sampleTime+=Math.min(dt,.4);sampleCount++;
    if(sampleTime<2.4)return;
    const avg=sampleTime/sampleCount;
    let nextRatio=motionRatio;
    if(avg>.048)nextRatio=Math.min(motionRatio,Math.max(avg>.08?.84:1,motionRatio-.18));
    else if(avg<.022)nextRatio=Math.min(nativeRatio,motionRatio+.10);
    // On slower GPUs cache the architecture's shadows. Moving vehicles have their own contact shadows.
    const nextStaticShadows=staticShadows ? avg>.038 : avg>.080;
    if(Math.abs(nextRatio-motionRatio)>.01||nextStaticShadows!==staticShadows){
      motionRatio=nextRatio;staticShadows=nextStaticShadows;applyQuality();
    }
    sampleTime=0;sampleCount=0;
  }
  let presented=false;
  renderer.setAnimationLoop(now=>{
    if(document.hidden){previousFrame=null;return}
    const dt=previousFrame===null?0:Math.max(0,(now-previousFrame)/1000);
    previousFrame=now;
    // Timetables, moving feet and wingbeats follow visible elapsed time on slower devices as well.
    // Only the camera step is limited to avoid a jarring jump after a delayed frame.
    const cameraDt=Math.min(dt,.22);
    if(!paused){
      elapsed+=dt;movement.forEach(fn=>fn(elapsed));dirty=true;
      if(opening){openingTime+=cameraDt;glide()}
      else if(now>quietUntil&&camera.zoom<=1.15){
        offset.copy(camera.position).sub(controls.target);
        const angle=Math.atan2(offset.x,offset.z)-cameraDt*orbitSpeed;
        frameBlock(angle,Math.asin(offset.y/offset.length()),1-Math.exp(-cameraDt*2));
      }
      tuneResolution(dt);
    }
    controls.update(cameraDt);
    if(forceShadow||lastShadow<0||(!staticShadows&&elapsed-lastShadow>.20)){renderer.shadowMap.needsUpdate=true;lastShadow=elapsed;forceShadow=false}
    if(dirty){
      renderer.render(scene,camera);dirty=false;
      if(!presented){presented=true;report('ready')}
    }
  });
}
start().catch(err=>{
  console.error(err);
  stage.querySelector('canvas')?.remove();
  report('unavailable');
});
