import {T,group,box,cyl,rod,panel,label,painted,makeCanvas,contact} from './craft.js';

const smooth=T.MathUtils.smoothstep;
const windowAt=(s,a,b,c,d)=>smooth(s,a,b)-smooth(s,c,d);
const period=30;
const shelf=[-.135,.908,-.73],scanner=[.60,.823,.358];
const teal='#276755';
const legs=[
  {start:.6,end:6.0,points:[[1.71,1.88],[.60,1.84],[.065,1.50],[.025,1.02],[-.055,.49],[-.26,.02],[-.27,-.37]]},
  {start:11.15,end:14.85,points:[[-.27,-.37],[-.15,-.04],[.086,.35],[.27,.61],[.54,.65],[.70,.61]]},
  {start:21.1,end:26.9,points:[[.70,.61],[.39,.75],[.075,.99],[.025,1.43],[.48,1.75],[1.14,1.88],[1.71,1.88]]}
].map(leg=>{
  const curve=new T.CatmullRomCurve3(leg.points.map(([x,z])=>new T.Vector3(x,0,z)),false,'centripetal');
  return {...leg,curve,length:curve.getLength()};
});
const shortest=(a,b,w)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*w;
const heading=v=>Math.atan2(v.x,v.z);
function travel(s,point,tangent) {
  let distance=0,angle=-Math.PI*.58;
  for(let i=0;i<legs.length;i++){
    const leg=legs[i],{curve,start,end,length}=leg;
    if(s<=end){
      const u=T.MathUtils.clamp((s-start)/(end-start),0,1);
      // Cruise between short acceleration and braking ramps.
      const ramp=.13,part=u<ramp?u*u/(2*ramp):u>1-ramp?1-ramp-(1-u)**2/(2*ramp):u-ramp/2;
      const progress=part/(1-ramp);
      curve.getPointAt(progress,point);curve.getTangentAt(progress,tangent);
      const face=heading(tangent);
      angle=shortest(angle,face,smooth(s,start-.64,start+.52));
      return {distance:distance+length*progress,angle,weight:windowAt(s,start-.20,start+.51,end-.51,end+.10)};
    }
    distance+=length;curve.getPointAt(1,point);curve.getTangentAt(1,tangent);
    const stop=[Math.PI,Math.PI,-Math.PI*.58][i];
    angle=shortest(heading(tangent),stop,smooth(s,end-.10,end+.62));
  }
  return {distance,angle,weight:0};
}

function teaBottle(parent){
  const g=group(parent);
  const amber=new T.MeshStandardMaterial({color:'#cf8736',roughness:.22,metalness:.08});
  cyl(g,amber,0,0,0,.043,.039,.132,24);cyl(g,amber,0,.077,0,.022,.042,.029,24);
  cyl(g,'#ece4cd',0,.103,0,.024,.023,.027,18);
  const wrap=painted(makeCanvas(256,96,(c,w,h)=>{
    c.fillStyle='#eac767';c.fillRect(0,0,w,h);c.fillStyle=teal;c.fillRect(0,0,w,13);
    for(let i=0;i<4;i++){const x=19+64*i;c.fillStyle=teal;c.beginPath();c.ellipse(x,43,14,6,-.55,0,Math.PI*2);c.fill();c.font='bold 17px sans-serif';c.fillText('烏龍',x-15,78);}
  }));
  cyl(g,wrap,0,-.004,0,.044,.043,.082,32);return g;
}
// Individual package fronts are drawn once and reused across every chilled shelf.
const wrappers=new Map();
export function packageFace(category,variant){
  const key=category+'-'+variant;
  if(wrappers.has(key))return wrappers.get(key);
  const colors={milk:['#468697','#5078a0','#bd715a'],soda:['#b8553d','#678977','#cd9548'],snack:['#c26a42','#78934f','#4a8292']};
  const titles={milk:['鮮乳','牧場','牛奶'],soda:['柚香','氣泡','蜜桃'],snack:['米菓','海苔','玉米']};
  const material=painted(makeCanvas(128,160,(c,w,h)=>{
    const accent=colors[category][variant];c.fillStyle=category==='milk'?'#f3ecda':accent;c.fillRect(0,0,w,h);
    c.fillStyle=category==='milk'?accent:'#ffe6ad';c.beginPath();c.moveTo(0,96);c.bezierCurveTo(35,53,73,115,128,67);c.lineTo(128,133);c.lineTo(0,144);c.fill();
    c.fillStyle=category==='milk'?accent:'#fff1d7';c.textAlign='center';c.font='bold 32px sans-serif';c.fillText(titles[category][variant],64,50);
    c.fillStyle=category==='milk'?'#faf4e6':accent;c.beginPath();c.ellipse(63,102,22,12,-.44,0,Math.PI*2);c.fill();
    c.fillStyle=category==='milk'?accent:'#fff6d7';c.font='bold 11px sans-serif';c.fillText(['TAIWAN','ORIGINAL','CLASSIC'][variant],64,152);
  }));
  wrappers.set(key,material);return material;
}
const cartonFold=new T.Shape();
cartonFold.moveTo(-.039,0);cartonFold.lineTo(0,.044);cartonFold.lineTo(.039,0);cartonFold.closePath();
const cartonRidge=new T.ExtrudeGeometry(cartonFold,{depth:.081,bevelEnabled:false});
const paper=new T.MeshStandardMaterial({color:'#e4e6dd',roughness:.85});
export function chilledItem(g,j,s,k,x,y,z){
  const v=(s+k)%3;
  if(j===0){
    box(g,'#e6e6d8',x,y+.088,z,.079,.145,.081);
    // The pitched top is the folded seal of a paper milk carton.
    const roof=new T.Mesh(cartonRidge,paper);
    roof.position.set(x,y+.160,z-.040);g.add(roof);
    panel(g,packageFace('milk',v),x,y+.090,z+.041,.077,.135);return;
  }
  if(j===2){
    cyl(g,packageFace('soda',v),x,y+.084,z,.040,.040,.137,20);
    cyl(g,'#ced5cc',x,y+.156,z,.039,.041,.008,18);box(g,'#8b9994',x,y+.161,z-.004,.014,.002,.022,true);return;
  }
  const color=['#c89950','#b9a345','#9bad6b'][v];
  cyl(g,color,x,y+.086,z,.034,.041,.14,16);
  cyl(g,'#e9dda7',x,y+.092,z,.040,.038,.056,16);
  cyl(g,['#648e65','#e9e0c2','#99754a'][v],x,y+.167,z,.021,.022,.025,12);
}
function priceStrip(g,x,y,z,j){
  const tag=painted(makeCanvas(512,55,(c,w,h)=>{
    c.fillStyle='#f4efdc';c.fillRect(0,0,w,h);
    for(let k=0;k<4;k++){const left=k*128;c.fillStyle=teal;c.fillRect(left,2,4,50);
      c.fillStyle='#57574d';c.font='14px sans-serif';c.fillText(['低脂鮮乳','無糖茶','果汁'][j],left+10,19);
      c.fillStyle='#a34528';c.font='bold 27px sans-serif';c.fillText((j===1&&k===3?'35':['25','35','29','30'][k]),left+9,46);
      c.fillStyle='#474641';for(let i=0;i<11;i++)c.fillRect(left+64+i*4,25,i%3+1,15);
    }
  }));
  panel(g,tag,x,y,z,.64,.034);
}
export const storeAction={root:null,passing:false};
export function retailFixtures(g,glass){
  storeAction.root=g;
  const bottle=teaBottle(g);bottle.name='selected-oolong';bottle.position.fromArray(shelf);bottle.userData.moves=true;
  const reserve=teaBottle(g);reserve.userData.moves=true;reserve.position.set(shelf[0],shelf[1],-.836);
  const door=group(g,-.72,.86,-.57);door.name='tea-cooler-sliding-glass';door.userData.moves=true;
  box(door,glass,.34,0,0,.67,1.38,.024);
  for(const edge of [.012,.666])box(door,'#abbdbb',edge,0,.012,.017,1.38,.033);
  rod(door,'#cad4d1',[.602,-.084,.048],[.602,.094,.048],.01);
  for(let j=0;j<3;j++){
    const x=-1.14+j*.76;
    for(let k=0;k<4;k++)priceStrip(g,x,.29+k*.26,-.637,j);
    for(const dir of [-1,1])box(g,new T.MeshBasicMaterial({color:'#ecfaff'}),x+dir*.314,.87,-.802,.008,1.28,.012);
    for(let k=0;k<10;k++)box(g,'#53696b',x+(k-4.5)*.059,.183,-.71,.032,.027,.012);
  }
  // Narrow timber ribs, a recessed toe kick and a shelf for paper cup sleeves.
  box(g,'#57625e',.91,.092,.355,.98,.077,.038);
  for(let i=0;i<29;i++)box(g,i%3?'#a88b6c':'#bb9a75',.438+i*.034,.37,.358,.025,.45,.012);
  box(g,'#678177',1.492,1.13,-.25,.032,.31,.72);
  const menu=group(g,1.468,1.13,-.25,-Math.PI/2);
  panel(menu,painted(makeCanvas(360,150,c=>{
    c.fillStyle='#354c46';c.fillRect(0,0,360,150);c.fillStyle='#f5dfb1';c.font='bold 27px sans-serif';c.fillText('CITY CAFÉ',18,39);
    c.fillStyle='#f7f3e4';c.font='17px sans-serif';c.fillText('美式咖啡       M 35    L 45',18,84);c.fillText('拿鐵咖啡       M 45    L 55',18,121);
  })),0,0,0,.65,.26);
  const terminal=group(g,.72,.725,.328,-.15);
  const machine=group(terminal);machine.rotation.x=-.41;
  box(machine,'#46545a',0,.034,0,.128,.043,.161,true);
  box(machine,'#74b9ac',0,.058,-.016,.097,.006,.072);
  for(let i=0;i<6;i++)box(machine,'#c4c9c3',(i%3-1)*.026,.06,.041+Math.floor(i/3)*.021,.017,.006,.013,true);
  box(g,'#35464d',scanner[0],.724,scanner[2],.14,.018,.099,true);
  const scan=new T.MeshBasicMaterial({color:'#95b3aa'});box(g,scan,scanner[0],.736,scanner[2],.105,.004,.011);
  const display=group(g,.83,.887,.246);
  panel(display,painted(makeCanvas(180,100,c=>{c.fillStyle='#263e47';c.fillRect(0,0,180,100);c.fillStyle='#d8ecdc';c.font='14px sans-serif';c.fillText('7-ELEVEN',10,22);c.font='bold 31px monospace';c.fillText('NT$ 35',20,75);}),true),0,0,0,.206,.12);
  display.userData.moves=true;
  const floor=painted(makeCanvas(128,128,c=>{c.fillStyle='#dedbd0';c.fillRect(0,0,128,128);c.strokeStyle='#aeb7b0';c.lineWidth=2;c.strokeRect(0,0,128,128);for(let i=0;i<750;i++){const x=(i*131)%127,y=(i*57+Math.floor(i/11)*23)%127;c.fillStyle=i%2?'#cecbbf':'#ece9df';c.fillRect(x,y,1,1);}}));
  floor.map.wrapS=floor.map.wrapT=T.RepeatWrapping;floor.map.repeat.set(8,6);
  const tiles=panel(g,floor,0,.074,0,3.02,2.11);tiles.rotation.x=-Math.PI/2;
  for(let k=0;k<4;k++){
    label(g,['御飯糰','三明治','咖啡','鮮食'][k],-1.28+k*.64,1.78,-1.026,.58,.133,['#3d685e','#a85137','#64513e','#44778b'][k],'#fff5dc');
  }
  Object.assign(storeAction,{bottle,reserve,door,scan,display});
}
function localReach(root,hand,local,w,result){
  root.localToWorld(local);hand(local,w,result);root.worldToLocal(result);
}

export function shoppingCustomer(place,walkingClip,reachHand,onScan){
  const {root,bottle,reserve,door,scan,display}=storeAction;
  const actor=place(0,0,0,0,.626,0,root);actor.frame.name='market-customer';
  contact(actor.frame,0,.002,.36,.22,.006);
  const {clip,stride}=walkingClip(actor.clip('Walk'));
  const walk=actor.mixer.clipAction(clip).play(),idle=actor.mixer.clipAction(actor.clip('Idle')).play();
  const arm=reachHand(actor.body,'Right'),other=reachHand(actor.body,'Left');
  const neck=actor.body.getObjectByName('mixamorigNeck');
  const fingerBones=['Index','Middle','Ring','Pinky'].flatMap(finger=>[1,2,3].map(j=>actor.body.getObjectByName('mixamorigRightHand'+finger+j)));
  const bones=[neck,...fingerBones,...['Right','Left'].flatMap(side=>['Arm','ForeArm'].map(part=>actor.body.getObjectByName('mixamorig'+side+part)))];
  const base=bones.map(b=>b.quaternion.clone());
  const phone=group(root);box(phone,'#27373d',0,0,0,.067,.012,.116,true);
  box(phone,'#95c8b8',0,.007,0,.054,.002,.085);
  const tote=group(actor.frame,-.155,.46,.024);
  const profile=new T.Shape();profile.moveTo(-.091,.114);profile.lineTo(.099,.114);profile.quadraticCurveTo(.117,-.02,.094,-.112);profile.quadraticCurveTo(.004,-.143,-.087,-.114);profile.quadraticCurveTo(-.110,-.03,-.091,.114);
  const pouch=new T.Mesh(new T.ExtrudeGeometry(profile,{depth:.061,bevelEnabled:true,bevelSegments:2,bevelSize:.008,bevelThickness:.009,curveSegments:8}),new T.MeshStandardMaterial({color:'#947853',roughness:.95}));
  pouch.rotation.y=Math.PI/2;pouch.position.x=-.038;tote.add(pouch);
  box(tote,'#594e46',-.001,.116,0,.067,.008,.176,true);
  for(const z of [-.067,.067])for(let k=0;k<7;k++)box(tote,'#d4b58a',-.046,-.081+k*.024,z,.003,.011,.004);
  for(const z of [-.07,.07])rod(tote,'#79533b',[0,.11,z],[.037,.45,.014],.011);
  const p=new T.Vector3(),v=new T.Vector3(),goal=new T.Vector3(),grip=new T.Vector3(),left=new T.Vector3(),paid=new T.Vector3(...scanner);
  const slot=new T.Vector3(...shelf),home=new T.Vector3(-.11,.60,.115),carry=new T.Vector3(-.137,.67,.182);
  let previous=null;
  return t=>{
    const s=t%period,motion=travel(s,p,v);
    actor.frame.position.set(p.x,T.MathUtils.lerp(.077,-.002,smooth(p.z,1.0,1.27)),p.z);
    actor.frame.rotation.y=motion.angle;
    bones.forEach((b,i)=>b.quaternion.copy(base[i]));
    idle.time=t%idle.getClip().duration;walk.time=(motion.distance/(stride*.626)*clip.duration)%clip.duration;
    walk.setEffectiveWeight(motion.weight);idle.setEffectiveWeight(1-motion.weight);actor.mixer.update(0);
    bones.forEach((b,i)=>base[i].copy(b.quaternion));
    const choose=windowAt(s,6.15,6.90,9.80,11.05),pay=windowAt(s,15.0,16.1,19.7,20.9);
    neck.rotateY(choose*.32*Math.sin((s-6.1)*2.3));neck.rotateX(.19*choose+.24*pay);
    door.position.x=-.72-.65*windowAt(s,6.85,7.63,10.0,10.90);
    storeAction.passing=Math.abs(p.x)<.64&&Math.abs(p.z-1.1)<.79;
    const reach=windowAt(s,7.65,8.55,8.84,9.8),counter=windowAt(s,14.80,16.15,16.55,17.20)+windowAt(s,18.67,19.42,19.83,20.65);
    goal.copy(carry);goal.y+=.08*windowAt(s,8.70,9.55,10.55,11.05);
    actor.frame.localToWorld(goal);root.worldToLocal(goal);goal.lerp(slot,reach).lerp(paid,counter);
    const pack=smooth(s,27.0,28.05)-smooth(s,28.4,29.0);
    v.set(-.15,.58,.025);actor.frame.localToWorld(v);root.worldToLocal(v);goal.lerp(v,pack);
    localReach(root,arm,goal,windowAt(s,7.63,8.51,28.2,29.12),grip);
    const holding=windowAt(s,8.34,8.76,16.0,16.46)+windowAt(s,19.28,19.72,27.88,28.22);
    fingerBones.forEach((finger,i)=>finger.rotateZ((i%3===0?.34:.51)*holding));
    tote.rotation.x=.067*Math.sin(motion.distance*10)*motion.weight;
    const take=smooth(s,8.48,8.83);
    bottle.position.copy(slot).lerp(grip,take).lerp(paid,windowAt(s,16.03,16.42,19.4,19.83));
    bottle.position.y-=.013*take;
    bottle.rotation.z=.19*Math.sin(s*1.8)*windowAt(s,8.86,9.53,10.58,11.15);
    reserve.position.z=-.836+.106*smooth(s,9.02,9.60);
    const packed=smooth(s,27.73,28.15);bottle.visible=s<28.16||s>29.65;
    if(s>29.65){bottle.position.copy(slot);bottle.position.z=-.836;bottle.scale.setScalar(1);}
    else bottle.scale.setScalar(1-packed);
    const tap=windowAt(s,16.4,17.56,18.16,18.91);
    goal.copy(home);goal.x=.12;actor.frame.localToWorld(goal);root.worldToLocal(goal);
    v.set(.735,.804,.346);goal.lerp(v,tap);
    localReach(root,other,goal,windowAt(s,16.08,16.63,18.56,19.12),left);
    phone.position.copy(left);phone.visible=s>=16.58&&s<18.94;phone.rotation.set(.13,.19,0);phone.scale.setScalar(windowAt(s,16.58,16.79,18.69,18.94));
    scan.color.setHex(s>16.38&&s<16.85?0xfc5a41:0x92afa7);
    if(previous!==null&&t-previous<.55&&s>=16.43&&previous%period<16.43)onScan();
    previous=t;display.visible=s>=16.43&&s<20.75;
  };
}
