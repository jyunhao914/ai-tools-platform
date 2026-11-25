import {shopDoor} from './studio-building.js';
import {T} from './craft.js';
import {sights} from './city-places.js';
import {workstationAt,highlightStation} from './workstations.js';
import {hitsWall} from './wall.js';
import {rooms,doorState} from './interiors.js';

const vector=a=>new T.Vector3(...a);
const clamp=T.MathUtils.clamp;
const smooth=x=>x*x*(3-2*x);
const eyeHeight=1.20;
// Track beside the tram, keeping the storefront in frame.
const streetEye=[-7.95,1.30,6.72],streetLook=[.37,1.74,2.72];
const crane=new T.CatmullRomCurve3([[-8.05,1.34,7.10],[-6.92,1.39,7.05],[-4.84,1.57,6.94],[-2.62,1.82,6.86],[-1.04,1.99,6.76],[.22,2.06,6.74]].map(vector));
const subject=new T.CatmullRomCurve3([[.78,2.13,2.99],[.64,2.15,2.91],[.49,2.11,2.83],[.37,2.04,2.75],[.37,1.96,2.71],[.37,1.89,2.71]].map(vector));
const duration=9.55;
const streetViews={shopfront:[[4.60,1.34,4.86],[4.10,1.13,1.32]],shops:[[4.92,1.69,6.57],[2.68,1.49,2.24]],photo:[[-15.10,1.07,7.26],[-16.65,.93,7.99]],clinic:[[7.1,1.43,6.53],[10.62,1.22,.63]],fruit:[[18.6,1.38,5.85],[20.75,1.07,1.45]],market:[[10.0,1.62,7.48],[15.2,1.26,.91]],court:[[13.85,1.58,8.20],[14.00,1.16,13.75]]};
const upstairs={
  record:{eye:[-.51,3.92,2.12],look:[-.36,3.65,.36]},
  podcast:{eye:[1.06,3.92,1.67],look:[1.61,3.65,.07]}
};
const stairs=[[1.11,1.49,1.47],[1.47,1.49,.71],[1.47,2.75,2.19],[2.09,2.75,2.19],[2.09,3.92,.70],[1.04,3.92,.67],[1.04,3.92,1.96]];
function upperWalk(x,z){
  if(!inRect(x,z,[-1.42,2.22,.60,2.23]))return false;
  if(x>1.17&&z>.72&&z<2.19)return false;
  return Math.abs(x-.70)>.075||z>1.68;
}
const WEST=-9.78,EAST=6.94,frontWalk=3.27;
const townBounds=[[9.4,18.4,8.46,9.07],[-26,26,3.05,8.48],[-10.9,-9.33,-8.85,7.76],[6.48,7.44,-8.85,7.77],[-27.9,27.9,-9.30,-7.76],[-28.8,-27.3,-17.4,17.4],[27.3,28.8,-17.4,17.4],[-28.7,28.7,15,17.25],[-28.7,28.7,-17.4,-15.2],[-28.4,28.4,3.85,7.3]];
function inRect(x,z,b){return x>=b[0]&&x<=b[1]&&z>=b[2]&&z<=b[3];}
function roomAt(x,z){return Object.entries(rooms).find(([,r])=>inRect(x,z,r.bounds))?.[0];}
function inDoor(x,z,r){return Math.abs(x-r.door[0])<r.width*.43&&z>=r.bounds[3]-.12&&z<=3.22;}
export function streetVisit(camera,canvas,report,reduced,tram){
  let mode='street',tour=true,tourTime=0,trip=null,yaw=0,pitch=0,mapAngle=.66,mapHeight=.48,mapDistance=33;
  let walking=0,keys=new Set(),pointers=new Map(),lastPinch=0,dragged=false;
  const up=new T.Vector3(0,1,0),direction=new T.Vector3(),aim=new T.Vector3(),camPoint=new T.Vector3(),lastDir=new T.Vector3();
  const ray=new T.Raycaster(),hit=new T.Vector3(),cursor=new T.Vector2();
  const entrances=Object.entries(rooms).map(([id,r])=>[id,new T.Box3(vector([r.door[0]-(id==='film'?1.8:.85),.26,r.door[1]-.12]),vector([r.door[0]+(id==='film'?1.8:.61),id==='film'?3.08:2.1,r.door[1]+.13]))]);
  function announce(place){highlightStation(null);mode=place;report('place',{place});}
  function face(point){
    camera.lookAt(point);camera.getWorldDirection(direction);
    yaw=Math.atan2(direction.x,-direction.z);pitch=Math.asin(clamp(direction.y,-1,1));
  }
  function applyLook(){
    direction.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
    camera.lookAt(aim.copy(camera.position).add(direction));
  }
  function orbitMap(){
    const target=aim.set(-.24,1.12,.94);
    camera.position.set(target.x+mapDistance*Math.sin(mapAngle)*Math.cos(mapHeight),target.y+mapDistance*Math.sin(mapHeight),target.z+mapDistance*Math.cos(mapAngle)*Math.cos(mapHeight));
    face(target);
  }
  function sceneFov(){return camera.aspect<.85?79:64;}
  function resize(width,height){
    camera.aspect=width/height;camera.fov=sceneFov();camera.updateProjectionMatrix();if(tour)setTour(tourTime);
  }
  function setTour(t){
    const u=clamp(t/duration,0,1),narrow=clamp((.90-camera.aspect)/.46,0,1);
    // A monotone ease-out brings the camera to rest without passing the shop.
    const glide=u+u*u-u*u*u;
    crane.getPoint(glide,camera.position);subject.getPoint(glide,aim);
    camera.position.z+=narrow*(1.85-.88*glide);
    camera.fov=T.MathUtils.lerp(55,53,glide)+narrow*T.MathUtils.lerp(26,40,glide);
    camera.updateProjectionMatrix();face(aim);
  }
  function alignOpening(seconds){
    if(!tour)return;
    tourTime=clamp(seconds,0,duration);setTour(tourTime);
  }
  function replay(){
    trip=null;clearMotion();tour=true;tourTime=0;announce('street');setTour(0);
  }
  function clearMotion(){walking=0;keys.clear();}
  function manual(){
    report('explore');
    if(trip?.stairs)return;
    if(trip){trip=null;announce(roomAt(camera.position.x,camera.position.z)||'street');}
    tour=false;
  }
  function getTarget(clientX,clientY){
    if(trip)return null;
    const bounds=canvas.getBoundingClientRect();cursor.set((clientX-bounds.left)/bounds.width*2-1,1-(clientY-bounds.top)/bounds.height*2);
    camera.updateMatrixWorld();ray.setFromCamera(cursor,camera);
    if(mode==='film')return hitsWall(ray)?'wall':workstationAt(ray);
    if(upstairs[mode]||rooms[mode]||camera.position.z<2.24)return null;
    let id=null,best=Infinity;
    for(const [key,box] of entrances){if(ray.ray.intersectBox(box,hit)){const d=ray.ray.origin.distanceTo(hit);if(d<best){best=d;id=key;}}}
    return id;
  }
  function go(destination,after=null){
    camera.fov=sceneFov();camera.updateProjectionMatrix();
    const fromUpper=Object.hasOwn(upstairs,mode),toUpper=Object.hasOwn(upstairs,destination);
    if(trip?.stairs)return;
    if(toUpper&&!fromUpper&&mode!=='film'){go('film',destination);return;}
    if(fromUpper||toUpper){
      if(destination===mode)return;
      const dest=toUpper?destination:'film',route=[camera.position.toArray()];
      if(fromUpper)route.push([camera.position.x,3.92,2.18],[1.04,3.92,2.18]);
      if(fromUpper&&!toUpper)route.push(...[...stairs].reverse(),rooms.film.eye);
      if(!fromUpper)route.push(...stairs);
      if(toUpper)route.push([1.04,3.92,2.18],[upstairs[dest].eye[0],3.92,2.18],upstairs[dest].eye);
      const points=route.map(vector).filter((v,i,a)=>!i||v.distanceTo(a[i-1])>.015);
      const curve=new T.CurvePath();
      for(let i=1;i<points.length;i++)curve.add(new T.LineCurve3(points[i-1],points[i]));
      clearMotion();tour=false;report('explore');camera.getWorldDirection(lastDir);
      trip={dest,curve,stairs:true,after:!toUpper&&destination!=='film'?destination:null,look:vector(toUpper?upstairs[dest].look:rooms.film.aim),startLook:lastDir.clone(),time:0,duration:reduced.matches?0:clamp(curve.getLength()*.59,.9,4.8)};
      report('travel',{place:dest});if(!trip.duration)advanceTrip(0);return;
    }
    if(Object.hasOwn(sights,destination)){
      manual();clearMotion();const place=sights[destination];
      camera.position.fromArray(place.eye);face(vector(place.look));announce(destination);return;
    }
    if(Object.hasOwn(sights,mode)&&['street','overview','film','print'].includes(destination)){
      tour=false;trip=null;clearMotion();camera.position.fromArray(streetEye);face(vector(streetLook));announce('street');
    }
    if(destination!=='overview'&&destination!=='street'&&!rooms[destination])return;
    report('explore');tour=false;clearMotion();
    if(trip?.dest===destination)return;
    const start=camera.position.clone(),eye=start.clone(),points=[start],current=roomAt(eye.x,eye.z);
    const point=(x,y,z)=>{const next=new T.Vector3(x,y,z);if(points.at(-1).distanceTo(next)>.06)points.push(next);};
    let finalLook;
    if(current && current!==destination){
      const r=rooms[current];point(r.door[0],eyeHeight,r.door[1]-.19);point(r.door[0],eyeHeight,frontWalk);
      eye.copy(points.at(-1));if(current==='film')doorState.film=1;
    }
    if(destination==='overview'){
      point(6.5,7.4,7.45);mapDistance=camera.aspect<.85?43:32;
      point(-.24+mapDistance*Math.sin(mapAngle)*Math.cos(mapHeight),1.12+mapDistance*Math.sin(mapHeight),.94+mapDistance*Math.cos(mapAngle)*Math.cos(mapHeight));
      finalLook=vector([-.24,1.12,.94]);
    }else if(destination==='street'){
      if(!current){point(-7.0,2.05,7.15);point(...streetEye);finalLook=vector(streetLook);}
      else{point(eye.x+.10,eyeHeight,3.5);finalLook=vector([eye.x+5.2,1.44,4.20]);}
    }else{
      const r=rooms[destination];
      if(destination==='film')doorState.film=1;
      if(!current&&eye.z>4.5&&eye.z<13.5&&eye.y<6){
        const cross=Math.abs(eye.x-WEST)+Math.abs(WEST-r.door[0])<Math.abs(eye.x-EAST)+Math.abs(EAST-r.door[0])?WEST:EAST;
        point(cross,eyeHeight,eye.z>5.8?6.87:4.70);point(cross,eyeHeight,frontWalk);
      }else if(!current&&(eye.y>5||eye.z<2.3)){point(EAST,4.2,5.0);point(EAST,eyeHeight,frontWalk);}
      point(r.door[0],eyeHeight,frontWalk);point(r.door[0],eyeHeight,r.door[1]+.05);
      point(...r.eye);finalLook=vector(r.aim);
    }
    if(points.length<2){face(finalLook);announce(destination);if(after)go(after);return;}
    const curve=new T.CatmullRomCurve3(points,false,'centripetal',.40);
    camera.getWorldDirection(lastDir);
    trip={dest:destination,after,curve,look:finalLook,startLook:lastDir.clone(),time:0,duration:reduced.matches?0:clamp(curve.getLength()*.19,1.35,3.9)};
    report('travel',{place:destination});
    if(!trip.duration)advanceTrip(0);
  }
  function advanceTrip(dt){
    const run=trip;run.time+=dt;
    const progress=run.duration?Math.min(1,run.time/run.duration):1;
    const t=smooth(progress);
    run.curve.getPointAt(t,camera.position);
    const ahead=run.curve.getPointAt(Math.min(1,t+.10),camPoint).sub(camera.position);
    if(ahead.lengthSq()<.00001)ahead.copy(run.look).sub(camera.position);
    ahead.normalize();
    direction.copy(run.look).sub(camera.position).normalize();
    ahead.lerp(direction,smooth(clamp((t-.56)/.44,0,1))).normalize();
    ahead.lerp(run.startLook,1-smooth(clamp(progress/.29,0,1))).normalize();
    face(aim.copy(camera.position).add(ahead));
    if(progress===1){trip=null;face(run.look);announce(run.dest);if(run.after)go(run.after);}
  }
  function walkable(x,z){
    if(Object.hasOwn(sights,mode)){
      const [cx,,cz]=sights[mode].eye;
      return Math.abs(x-cx)<2.4&&Math.abs(z-cz)<1.35;
    }
    if(Object.values(rooms).some(r=>inRect(x,z,r.bounds)||inDoor(x,z,r)))return true;
    if(!townBounds.some(b=>inRect(x,z,b)))return false;
    if(tram&&Math.abs(z-tram.position.z)<.62&&Math.abs(x-tram.position.x)<1.78)return false;
    return true;
  }
  function move(forward,side,dt){
    if(trip?.stairs)return;
    const p=camera.position,norm=Math.max(1,Math.hypot(forward,side)),speed=(rooms[mode]||upstairs[mode])?1.15:2.0;
    if(mode==='street'&&!townBounds.some(b=>inRect(p.x,p.z,b))&&!roomAt(p.x,p.z)){
      if(p.z>22){go(p.z<42?'opera':p.x<-23?'lake':'chapel');return;}
      p.fromArray(streetEye);face(vector(streetLook));
    }
    const dx=(Math.sin(yaw)*forward+Math.cos(yaw)*side)*dt*speed/norm;
    const dz=(-Math.cos(yaw)*forward+Math.sin(yaw)*side)*dt*speed/norm;
    if(upstairs[mode]){
      if(upperWalk(p.x+dx,p.z))p.x+=dx;
      if(upperWalk(p.x,p.z+dz))p.z+=dz;
      const dest=p.x>.70?'podcast':'record';if(dest!==mode)announce(dest);
      applyLook();return;
    }
    if(walkable(p.x+dx,p.z))p.x+=dx;if(walkable(p.x,p.z+dz))p.z+=dz;
    const dest=roomAt(p.x,p.z)||'street';if(!Object.hasOwn(sights,mode)&&dest!==mode)announce(dest);
    p.y=T.MathUtils.lerp(p.y,eyeHeight,1-Math.exp(-dt*5));applyLook();
  }
  function step(value){
    if(value===0){walking=0;return;}
    if(mode==='overview'){go('street');return;}
    manual();walking=value;move(value,0,.09);
  }
  function update(dt,play,elapsed=dt){
    shopDoor.near=Math.abs(camera.position.x-4.10)<1.10&&Math.abs(camera.position.z-2.36)<1.2;
    if(trip){advanceTrip(dt);return;}
    if(tour&&play){const before=tourTime;tourTime+=elapsed;
      for(const [at,name] of [[.42,'bell'],[2.30,'bird'],[4.55,'bus'],[7.40,'bird']])if(before<at&&tourTime>=at&&tourTime-at<.55)report('cue',{name});
      setTour(tourTime);if(tourTime>=duration){tour=false;report('tourEnd');}}
    if(mode==='overview')return;
    if(keys.has('ArrowLeft')||keys.has('ArrowRight')){yaw+=(Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')))*dt*1.52;applyLook();}
    const forward=walking+Number(keys.has('w')||keys.has('ArrowUp'))-Number(keys.has('s')||keys.has('ArrowDown'));
    const side=Number(keys.has('d'))-Number(keys.has('a'));
    if(forward||side)move(forward,side,dt);
    const nearFilm=Math.abs(camera.position.x-.37)<1.05&&camera.position.z<3.45&&camera.position.z>-.4;
    doorState.film=T.MathUtils.lerp(doorState.film,Number(nearFilm),1-Math.exp(-dt*5));
  }
  canvas.addEventListener('pointerdown',e=>{
    if(trip?.stairs)return;
    if(e.button!==0&&e.pointerType==='mouse')return;
    manual();canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,ox:e.clientX,oy:e.clientY});
    dragged=pointers.size>1;
    if(pointers.size===2){const [a,b]=pointers.values();lastPinch=Math.hypot(a.x-b.x,a.y-b.y);}
  });
  canvas.addEventListener('pointermove',e=>{
    const p=pointers.get(e.pointerId);
    if(!p){if(e.pointerType==='mouse'){const target=getTarget(e.clientX,e.clientY);canvas.style.cursor=target?'pointer':'grab';highlightStation(mode==='film'?target:null);}return;}
    const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
    if(Math.hypot(p.x-p.ox,p.y-p.oy)>5)dragged=true;
    if(pointers.size===2){
      const [a,b]=pointers.values(),gap=Math.hypot(a.x-b.x,a.y-b.y);
      if(mode==='overview'){mapDistance=clamp(mapDistance*Math.exp((lastPinch-gap)*.008),13,53);orbitMap();}
      else if(Math.abs(gap-lastPinch)>1)move(Math.sign(gap-lastPinch),0,Math.min(.15,Math.abs(gap-lastPinch)*.008));
      lastPinch=gap;return;
    }
    if(mode==='overview'){mapAngle-=dx*.006;mapHeight=clamp(mapHeight+dy*.004,.23,1.10);orbitMap();}
    else{yaw-=dx*.0047;pitch=clamp(pitch+dy*.0040,-.90,.94);applyLook();}
  });
  canvas.addEventListener('pointerleave',()=>highlightStation(null));
  canvas.addEventListener('pointerup',e=>{
    const start=pointers.get(e.pointerId);pointers.delete(e.pointerId);
    if(start&&!dragged){const destination=getTarget(e.clientX,e.clientY);if(destination==='wall')report('openWall');else if(destination&&mode==='film')report('toolsFor',{station:destination});else if(destination)go(destination);}
  });
  canvas.addEventListener('pointercancel',e=>pointers.delete(e.pointerId));
  canvas.addEventListener('wheel',e=>{
    e.preventDefault();manual();
    if(mode==='overview'){mapDistance=clamp(mapDistance*Math.exp(clamp(e.deltaY,-100,100)*.002),13,53);orbitMap();}
    else move(-Math.sign(e.deltaY),0,Math.min(.24,Math.abs(e.deltaY)*.003));
  },{passive:false});
  canvas.addEventListener('keydown',e=>{
    const key=e.key.length===1?e.key.toLowerCase():e.key;
    if(key==='Escape'){e.preventDefault();go('street');return;}
    if(!['w','s','a','d','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key))return;
    e.preventDefault();if(mode==='overview'){go('street');return;}manual();keys.add(key);
  });
  canvas.addEventListener('keyup',e=>keys.delete(e.key.length===1?e.key.toLowerCase():e.key));
  window.addEventListener('blur',clearMotion);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearMotion();});
  setTour(0);
  const viewpoint=streetViews[new URL(location.href).searchParams.get('street')];
  if(Array.isArray(viewpoint)){tour=false;camera.position.copy(vector(viewpoint[0]));face(vector(viewpoint[1]));}
  return {resize,update,go,step,replay,alignOpening,get mode(){return mode;}};
}
