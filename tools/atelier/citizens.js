import {shoppingCustomer,storeAction} from './store-visit.js';
import {T,group,contact} from './craft.js';
import {performers} from './ensemble.js';
import {GLTFLoader} from './cast/GLTFLoader.js';
import {clone} from './cast/SkeletonUtils.js';

const loader=new GLTFLoader();
const names=['mei_casual','kenji_formal','ryan_smart','daniel_formal_crew','hannah_casual_crew'];
export function loadCitizens(){
  return Promise.all(names.map(name=>loader.loadAsync(new URL('cast/'+name+'.glb',import.meta.url).href)));
}
// Keep the vertical weight transfer and lateral sway of the recorded walk.
// Only the travelled distance is supplied by the route, in the same units as the recording.
function walkingClip(clip){
  const copy=clip.clone();
  const root=copy.tracks.find(track=>track.name.endsWith('Hips.position'));
  const values=root.values,end=values.length-3,dx=values[end]-values[0],dz=values[end+2]-values[2];
  for(let i=0;i<root.times.length;i++){const u=root.times[i]/copy.duration;values[i*3]-=dx*(u-1);values[i*3+2]-=dz*(u-1);}
  return {clip:copy,stride:Math.hypot(dx,dz)};
}
function sidewalk(d,L,r){
  // Two straight pavements with circular turnarounds. Heading is tangent at both joins.
  const bend=Math.PI*r,perimeter=2*(L+bend);let s=d%perimeter;
  if(s<L)return [s,0,Math.PI/2];s-=L;
  if(s<bend){const q=s/r;return [L+r*Math.sin(q),r*(1-Math.cos(q)),Math.PI/2-q];}s-=bend;
  if(s<L)return [L-s,2*r,-Math.PI/2];s-=L;
  const q=s/r;return [-r*Math.sin(q),r*(1+Math.cos(q)),-Math.PI/2-q];
}
// Two-bone reach, preserving the captured elbow's bend plane and upper-arm twist.
function reachHand(body,side,leg=false){
  const find=suffix=>body.getObjectByName('mixamorig'+side+suffix);
  const arm=find(leg?'UpLeg':'Arm'),fore=find(leg?'Leg':'ForeArm'),hand=find(leg?'Foot':'Hand');
  const shoulder=new T.Vector3(),elbow=new T.Vector3(),palm=new T.Vector3(),axis=new T.Vector3(),pole=new T.Vector3(),goal=new T.Vector3(),joint=new T.Vector3();
  const a=new T.Vector3(),b=new T.Vector3(),q=new T.Quaternion(),parent=new T.Quaternion();
  function turn(node,from,to,base){
    a.subVectors(from,base).normalize();b.subVectors(to,base).normalize();
    q.setFromUnitVectors(a,b).multiply(node.getWorldQuaternion(parent));
    node.quaternion.copy(node.parent.getWorldQuaternion(parent).invert().multiply(q));
  }
  return (target,weight,out)=>{
    arm.getWorldPosition(shoulder);fore.getWorldPosition(elbow);hand.getWorldPosition(palm);
    goal.copy(palm).lerp(target,weight);
    const upper=shoulder.distanceTo(elbow),lower=elbow.distanceTo(palm);
    axis.subVectors(goal,shoulder);const span=T.MathUtils.clamp(axis.length(),Math.abs(upper-lower)+.0001,upper+lower-.0001);axis.normalize();
    pole.subVectors(elbow,shoulder);pole.addScaledVector(axis,-pole.dot(axis));pole.normalize();
    const along=(upper*upper+span*span-lower*lower)/(2*span);
    joint.copy(shoulder).addScaledVector(axis,along).addScaledVector(pole,Math.sqrt(Math.max(0,upper*upper-along*along)));
    turn(arm,elbow,joint,shoulder);fore.getWorldPosition(elbow);hand.getWorldPosition(palm);
    turn(fore,palm,goal,elbow);return hand.getWorldPosition(out);
  };
}
export function citizens(scene,files,print,camera,report){
  if(!files)return ()=>{};
  const updates=[];
  const frustum=new T.Frustum(),projection=new T.Matrix4(),bounds=new T.Sphere(new T.Vector3(),1.5);
  function visible(frame){bounds.center.copy(frame.position);bounds.center.y+=.54;return frame.visible=frustum.intersectsSphere(bounds);}
  function place(index,x,y,z,scale,yaw,parent=scene){
    const file=files[index],frame=group(parent,x,y,z,yaw),body=clone(file.scene);
    body.scale.setScalar(scale);frame.add(body);if(parent===scene)contact(frame,0,.002,.44,.28,.006);
    body.traverse(n=>{if(n.isSkinnedMesh){n.frustumCulled=false;n.castShadow=true;n.receiveShadow=true;}});
    const mixer=new T.AnimationMixer(body);
    return {frame,body,mixer,clip:name=>T.AnimationClip.findByName(file.animations,name)};
  }
  function walker(index,x,y,z,length,radius,offset,pace,scale){
    const a=place(index,x,y,z,scale,0),{clip,stride}=walkingClip(a.clip('Walk'));
    a.mixer.clipAction(clip).play();
    updates.push(t=>{
      const phase=offset+t*pace;
      const [px,pz,angle]=sidewalk(phase*stride*scale/clip.duration,length,radius);
      a.frame.position.set(x+px,y,z+pz);a.frame.rotation.y=angle;if(visible(a.frame))a.mixer.setTime(phase);
    });
  }
  function neighbor(index,x,y,z,yaw,action,phase,scale){
    const a=place(index,x,y,z,scale,yaw),idle=a.mixer.clipAction(a.clip('Idle')).play(),gesture=a.mixer.clipAction(a.clip(action)).play();
    updates.push(t=>{if(!visible(a.frame))return;const q=(t+phase)%15,w=T.MathUtils.smoothstep(q,1.5,2.4)*(1-T.MathUtils.smoothstep(q,6.0,7.3));
      idle.setEffectiveWeight(1-w);gesture.setEffectiveWeight(w);a.mixer.setTime(t+phase);});
  }
  walker(0,-5.35,.219,2.94,3.84,.22,1.13,.96,.60);
  updates.push(shoppingCustomer(place,walkingClip,reachHand,()=>{
    if(Math.hypot(camera.position.x-4.7,camera.position.z-1.62)<3.1)report('cue',{name:'scan'});
  }));
  neighbor(2,-2.24,.219,2.85,.63,'Clap',1,.57);
  walker(2,-17.0,.126,7.66,4.58,.19,3.43,1.08,.62);
  walker(0,-16.05,.115,28.65,8.8,.23,4.07,1.04,.76);
  neighbor(1,-13.16,.11,27.74,-.30,'Talk',.66,.72);
  walker(2,-32.3,.11,57.52,6.30,.18,1.92,.87,.72);
  neighbor(0,-24.65,.12,56.80,2.18,'Talk',2.13,.69);
  if(print){
    const seller=place(2,-16.80,.126,8.29,.61,2.63),guest=place(0,-16.45,.126,7.61,.60,-.50);
    seller.mixer.clipAction(seller.clip('Idle')).play();guest.mixer.clipAction(guest.clip('Idle')).play();
    const give=reachHand(seller.body,'Left'),take=reachHand(guest.body,'Left');
    const meeting=new T.Vector3(-16.62,.90,7.96),inspecting=new T.Vector3(-16.51,.99,7.77),slot=new T.Vector3(-16.93,.803,7.85);
    const to=new T.Vector3(),from=new T.Vector3(),point=new T.Vector3(),smooth=T.MathUtils.smoothstep;
    updates.push(t=>{
      const showSeller=visible(seller.frame),showGuest=visible(guest.frame);if(!showSeller&&!showGuest)return;
      const u=t%10;seller.mixer.setTime(t+2);guest.mixer.setTime(t+4);
      give(meeting,smooth(u,.5,2.8)*(1-smooth(u,4.5,5.8)),from);
      to.copy(meeting).lerp(inspecting,smooth(u,4.3,5.9));
      take(to,smooth(u,1.6,3.3)*(1-smooth(u,7.3,8.6)),point);
      from.lerp(point,smooth(u,3.3,3.8));to.copy(slot).lerp(from,smooth(u,.15,1.1));
      print.position.copy(print.parent.worldToLocal(to));print.rotation.set(-.74+.65*smooth(u,4.3,5.9),.10,.08);
      print.scale.setScalar(smooth(u,0,.24)*(1-smooth(u,8.3,8.9)));
    });
  }
  const shadeMaterials=new Map(),restWalk=new Map(),bodyAt=new T.Vector3();
  for(const [i,a] of performers.entries()){
    const civilian=['stand','read'].includes(a.action),index=civilian&&i%3===0?0:civilian&&i%3===1?2:3+i%2;
    const size=index===0?.519:.491;
    const actor=place(index,0,0,0,size,0,a.root),body=actor.body;
    const walkData=restWalk.get(index)||walkingClip(actor.clip('Walk'));restWalk.set(index,walkData);
    const idle=actor.mixer.clipAction(actor.clip('Idle')).play(),walk=actor.mixer.clipAction(walkData.clip).play();
    const stride=walkData.stride*size,cycle=walkData.clip.duration,phase=(i*.61803%1)*13.7;
    const work=['cycle','row','sport','cook','read','record','mix','deliver','portrait'].includes(a.action);
    const arms=['Right','Left'].map(side=>reachHand(body,side));
    const legs=['Right','Left'].map(side=>reachHand(body,side,true));
    const neck=body.getObjectByName('mixamorigNeck'),rib=body.getObjectByName('mixamorigSpine1');
    body.traverse(n=>{
      if(n.isSkinnedMesh&&(n.name==='Top_shirt'||n.parent?.name==='Top_shirt'||/top_shirt/i.test(n.material.name))){
        const key=n.material.uuid+a.coat;if(!shadeMaterials.has(key)){
          const material=n.material.clone();material.color.set(a.coat);material.roughness=.87;shadeMaterials.set(key,material);}
        n.material=shadeMaterials.get(key);
      }
    });
    const adjusted=[neck,rib,...['Left','Right'].flatMap(side=>['Arm','ForeArm','UpLeg','Leg'].map(j=>body.getObjectByName('mixamorig'+side+j)))];
    const captured=adjusted.map(b=>b.quaternion.clone());
    let last=-1,lastPose=-1,distance=0,weight=0;const previous=a.root.position.clone(),target=new T.Vector3(),result=new T.Vector3();
    updates.push(t=>{

      const dt=last<0?0:Math.max(0,t-last),travel=Math.hypot(previous.x-a.root.position.x,previous.z-a.root.position.z);
      const moved=travel>1||['cycle','row'].includes(a.action)?0:travel;
      previous.copy(a.root.position);last=t;distance+=moved/Math.max(.2,a.root.scale.x);
      weight=T.MathUtils.lerp(weight,T.MathUtils.smoothstep(dt?moved/dt:0,.035,.35),1-Math.exp(-dt*12));
      a.root.getWorldPosition(bodyAt);bounds.center.copy(bodyAt);bounds.center.y+=.50;
      const wasVisible=actor.frame.visible;actor.frame.visible=frustum.intersectsSphere(bounds);
      if(!actor.frame.visible||!a.root.visible)return;
      const d2=camera.position.distanceToSquared(bodyAt);
      if(wasVisible&&lastPose>=0&&t-lastPose<(d2>3600?.12:d2>400?.065:.016))return;lastPose=t;
      idle.time=(t+phase)%idle.getClip().duration;walk.time=(distance/stride*cycle+phase)%cycle;
      adjusted.forEach((b,j)=>b.quaternion.copy(captured[j]));
      idle.setEffectiveWeight(1-weight);walk.setEffectiveWeight(weight);actor.mixer.update(0);
      adjusted.forEach((b,j)=>captured[j].copy(b.quaternion));
      body.position.y=(a.hips.position.y-.391)*(1-weight);
      body.rotation.x=a.body.rotation.x*.50;body.rotation.z=a.body.rotation.z*.45;
      // Mix local joint accents into the captured breathing and weight shifts.
      rib.rotateY(.016*Math.sin(t*1.47+phase));neck.rotateX(a.head.rotation.x*.48+.035*Math.sin(t*.83+phase));
      neck.rotateY(a.head.rotation.y*.65+.085*Math.sin(t*.70+phase));
      for(let j=0;j<2;j++){
        const active=work||Math.abs(a.arms[j].rotation.x)+Math.abs(a.arms[j].rotation.z)>.24;
        if(active&&(work||weight<.55)){
          a.hands[j].getWorldPosition(target);
          if(a===storeAction.clerk&&j===0){
            const s=t%30,w=T.MathUtils.smoothstep(s,15.28,16.36)-T.MathUtils.smoothstep(s,16.83,17.62);
            result.set(.61,.83,.29);storeAction.root.localToWorld(result);target.lerp(result,w);
          }
          arms[j](target,work?.96:.73,result);
        }
        if(a.action==='cycle'||a.action==='row'){
          a.feet[j].getWorldPosition(target);legs[j](target,.995,result);
        }
      }
    });
  }
  return t=>{camera.updateMatrixWorld();frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));updates.forEach(update=>update(t));};
}
