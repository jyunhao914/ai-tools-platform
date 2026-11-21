import {T,palette as P,group,box,oval,cyl,rod,tube,hoop,panel,mesh,label,contact,animate,canvasMap,makeCanvas} from './craft.js';
import {person} from './street.js';
import {air} from './atmosphere.js';

const tau=2*Math.PI,clamp=T.MathUtils.clamp;
const steel=new T.MeshStandardMaterial({color:'#a5b5b4',metalness:.46,roughness:.37});
const darkTyre=new T.MeshStandardMaterial({color:'#333638',roughness:.94});
const warm=new T.MeshBasicMaterial({color:'#ffe4ae'}),red=new T.MeshBasicMaterial({color:'#f76446'});
const lampHalo=canvasMap(makeCanvas(128,128,(ctx,w)=>{
  const g=ctx.createRadialGradient(w/2,w/2,1,w/2,w/2,w/2);g.addColorStop(0,'rgba(255,231,170,.90)');
  g.addColorStop(.18,'rgba(255,203,119,.45)');g.addColorStop(.62,'rgba(249,168,81,.13)');g.addColorStop(1,'rgba(253,163,81,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,w,w);
}));
function lantern(p,x,y,z){
  const l=group(p,x,y,z);
  rod(l,P.walnut,[0,.20,0],[0,.31,0],.011);
  oval(l,'#b74432',0,0,0,.14,.192,.14);
  for(let j=0;j<5;j++){const h=(j-2)*.060,rr=.142*Math.sqrt(1-(h/.197)**2);hoop(l,'#db7551',0,h,0,rr,.005).rotation.x=Math.PI/2;}
  for(const side of [-1,1])cyl(l,P.brass,0,side*.183,0,.071,.070,.032,12);
  tube(l,'#ab4633',[[0,-.20,0],[.004,-.25,0],[-.01,-.31,0]],.012);
  animate(l,t=>{l.rotation.z=.058*air.wind*Math.sin(t*1.25+x);l.rotation.x=.035*Math.cos(t*1.04+z);});
}
const steamMap=canvasMap(makeCanvas(100,128,(g,w,h)=>{
  for(let j=0;j<9;j++){
    const x=w*(.49+.16*Math.sin(j*1.44)),y=h*(.21+j*.069);
    const r=14+5*Math.sin(j*2.7);
    const gradient=g.createRadialGradient(x,y,0,x,y,r);gradient.addColorStop(0,'rgba(244,242,236,.22)');gradient.addColorStop(1,'rgba(244,242,236,0)');
    g.fillStyle=gradient;g.fillRect(0,0,w,h);
  }
}));
function plume(parent,x,y,z,size=1,exhaust=false){
  for(let i=0;i<8;i++){
    const m=new T.SpriteMaterial({map:steamMap,color:exhaust?'#c5c5be':'#fffaec',transparent:true,depthWrite:false});
    const v=new T.Sprite(m);parent.add(v);v.renderOrder=3;
    animate(v,t=>{
      const rate=exhaust?.26:.52,u=(t*rate+i/8)%1,sway=Math.sin(u*5+i*.55);
      v.position.set(x+(u*u*air.wind*.46+sway*.043)*size,y+u*size*(exhaust?1.78:1.26),z+.052*sway);
      v.scale.set((.15+.58*u)*size,(.22+.66*u)*size,1);m.rotation=.21*sway;
      m.opacity=Math.sin(u*Math.PI)**.70*(exhaust?.48:.91);
    });
  }
}
export function gait(a,phase,strength,bag=false){
  const s=Math.sin(phase),c=Math.cos(phase);
  a.hips.position.y=.392+Math.abs(c)*.020*strength;
  a.hips.position.x=.017*s*strength;a.hips.rotation.y=.062*s*strength;
  a.body.rotation.z=-.028*s*strength;a.head.rotation.z=.018*s*strength;
  for(let i=0;i<2;i++){
    const step=i?-s:s;
    a.legs[i].rotation.x=-.48*step*strength;
    a.shins[i].rotation.x=Math.max(0,-step)*.73*strength;
    a.arms[i].rotation.x=(bag&&i===1?.10:.29)*step*strength-.095;
    a.elbows[i].rotation.x=-.21-.09*Math.max(0,-step)*strength;
  }
}
export function articulated(a){
  [a.root,a.hips,a.body,a.head,...a.legs,...a.shins,...a.arms,...a.elbows].forEach(o=>o.userData.moves=true);
}
function umbrella(parent,color){
  const g=group(parent,-.10,.28,.065);
  rod(g,steel,[0,-.09,0],[0,.83,0],.008);
  const verts=[],index=[],n=12;
  for(let i=0;i<n;i++){
    const a=i*tau/n,b=(i+1)*tau/n,mid=(a+b)/2,start=verts.length/3;
    verts.push(0,.82,0,Math.sin(a)*.26,.756,Math.cos(a)*.26,Math.sin(b)*.26,.756,Math.cos(b)*.26,
      Math.sin(a)*.45,.65,Math.cos(a)*.45,Math.sin(mid)*.469,.62,Math.cos(mid)*.469,Math.sin(b)*.45,.65,Math.cos(b)*.45);
    for(const k of [0,1,2,1,3,4,1,4,2,2,4,5])index.push(start+k);
    rod(g,'#746b64',[0,.81,0],[Math.sin(a)*.446,.642,Math.cos(a)*.446],.004);
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(verts,3));geo.setIndex(index);geo.computeVertexNormals();
  mesh(g,geo,new T.MeshStandardMaterial({color,roughness:.67,side:T.DoubleSide}));
  cyl(g,P.ink,0,.837,0,.011,.014,.023,8);
  g.userData.moves=true;return g;
}
function satchel(p){
  const bag=group(p,0,-.08,.015);
  for(const side of [-1,1])tube(bag,'#a16a43',[[side*.058,.025,0],[side*.046,.11,0],[side*.020,.132,0],[0,.097,0]],.006);
  box(bag,'#be9461',0,-.046,0,.16,.145,.089,true);return bag;
}
const period=27;
function phase(t){return (t+4.1)%period;}
function trafficSignal(p,x,z,reverse,ped){
  const g=group(p,x,.11,z,reverse?Math.PI:0);
  cyl(g,'#707c70',0,1.22,0,.048,.068,2.43,12);
  rod(g,'#849489',[0,2.36,0],[0,2.36,.55],.044);
  const head=group(g,0,2.30,.55,-Math.PI/2);
  box(head,'#464e47',0,0,0,.54,.205,.14,true);
  const lenses=[];
  ['#db5746','#edb34c','#62b796'].forEach((color,i)=>{
    const mat=new T.MeshBasicMaterial({color});lenses.push(mat);
    cyl(head,'#313d39',(i-1)*.152,0,.085,.074,.078,.048,16).rotation.x=Math.PI/2;
    oval(head,mat,(i-1)*.152,0,.111,.055,.055,.014);
    box(head,'#3d4a41',(i-1)*.152,.077,.108,.124,.024,.09,true);
  });
  const side=group(g,0,1.46,-.02,reverse?0:Math.PI);
  box(side,'#344941',0,0,0,.22,.28,.15,true);
  const walking=new T.MeshBasicMaterial({color:'#55d79d'});
  oval(side,walking,0,.047,.086,.024,.024,.008);
  rod(side,walking,[0,.019,.087],[-.015,-.015,.088],.012);
  const legs=group(side,-.01,-.005,.09);rod(legs,walking,[0,0,0],[.035,-.055,0],.010);rod(legs,walking,[0,0,0],[-.032,-.05,0],.010);
  const stopButton=box(side,P.brass,.0,-.70,.012,.085,.12,.07,true);
  animate(legs,t=>{
    const c=phase(t),active=c<12.7?2:c<15?1:0,walk=c>16&&c<25.5;
    lenses.forEach((m,i)=>m.color.set(i===active?['#ff4f3d','#ffc938','#56edab'][i]:'#344640'));
    walking.color.set(walk?'#63f3ad':'#ed6250');legs.rotation.z=walk?.23*Math.sin(t*5):0;
  });
}
function streetPlate(p,x,z,words,english,yaw){
  const g=group(p,x,.12,z,yaw);
  cyl(g,steel,0,1.49,0,.035,.044,2.98,10);
  const sign=group(g,.37,2.77,0);
  box(sign,'#dce5d8',0,0,0,.94,.30,.047,true);
  label(sign,words,0,.048,.027,.89,.17,'#287266','#f6f6df',{size:.81});
  label(sign,english,0,-.081,.027,.89,.079,'#287266','#f6f6df',{size:.80});
  const other=group(g,.01,2.49,-.30,Math.PI/2);
  box(other,'#dce5d8',0,0,0,.79,.22,.04,true);label(other,'光影巷',0,0,.022,.75,.195,'#287266','#fff1cb');
}
export function scooter(parent,x,z,yaw,col,riderColor){
  const g=group(parent,x,.028,z,yaw),car=group(g),wheels=[];
  contact(g,0,0,.51,1.30,.007);
  for(const zz of [-.39,.40]){
    const a=group(car,0,.20,zz,Math.PI/2);a.userData.moves=true;wheels.push(a);
    hoop(a,darkTyre,0,0,0,.152,.046);hoop(a,steel,0,0,0,.12,.014);
    const hub=cyl(a,steel,0,0,0,.039,.039,.095,12);hub.rotation.x=Math.PI/2;
    for(let i=0;i<5;i++){const an=i*tau/5;rod(a,'#7c8580',[0,0,0],[Math.sin(an)*.11,Math.cos(an)*.11,.01],.011);}
  }
  oval(car,col,0,.35,-.28,.174,.146,.313);
  oval(car,'#343b38',0,.469,-.19,.146,.064,.26);
  box(car,'#4c5652',0,.213,.046,.296,.058,.38,true);
  const front=oval(car,col,0,.40,.247,.152,.215,.091);front.rotation.x=.18;
  oval(car,col,0,.30,.39,.099,.052,.176);
  for(const side of [-1,1]){
    rod(car,steel,[side*.056,.20,.395],[side*.065,.54,.237],.016);
    rod(car,steel,[side*.115,.655,.242],[side*.202,.78,.25],.009);
    oval(car,'#40514e',side*.207,.79,.25,.060,.031,.026);
    oval(car,'#a5bcbd',side*.207,.79,.230,.05,.022,.015);
  }
  oval(car,col,0,.626,.249,.169,.074,.093);
  oval(car,warm,0,.642,.330,.078,.040,.021);
  rod(car,'#363e39',[-.20,.638,.209],[.20,.638,.209],.022);
  oval(car,red,0,.392,-.516,.091,.034,.018);
  const plate=box(car,'#e5e3d1',0,.309,-.536,.130,.069,.013);plate.rotation.x=.13;
  [[-.04,.32],[-.012,.315],[.014,.32],[.038,.318]].forEach(([xx,yy])=>box(car,'#46524a',xx,yy,-.546,.011,.025,.005));
  rod(car,P.metal,[.125,.244,-.19],[.175,.239,-.48],.037);
  let rider=null;
  if(riderColor){
    rider=person(car,0,.078,-.13,0,riderColor,'cycle');rider.root.scale.setScalar(.99);
    rider.body.rotation.x=.09;
    for(const leg of rider.legs)leg.rotation.x=-.92;
    for(const knee of rider.shins)knee.rotation.x=1.32;
    for(const arm of rider.arms)arm.rotation.x=-.98;
    for(const elbow of rider.elbows)elbow.rotation.x=-.19;
    oval(rider.head,'#566e71',0,.076,-.006,.114,.092,.102);
    for(const s of [-1,1])rod(rider.head,P.ink,[s*.094,.015,.018],[s*.052,-.086,.016],.007);
    rider.head.userData.moves=true;rider.legs[0].userData.moves=true;rider.shins[0].userData.moves=true;
  }
  car.userData.moves=true;g.userData.moves=true;
  return {g,car,wheels,rider};
}
function motorTraffic(p){
  const knots=[[-27,6.91],[25,6.91],[26.5,6.62],[27.1,5.31],[26.4,3.88],[24.6,3.71],[-25.85,3.71],[-27.7,3.91],[-28.6,5.15],[-28.1,6.45]];
  const curve=new T.CurvePath(),vec=pt=>new T.Vector3(pt[0],0,pt[1]);
  for(let i=0;i<knots.length;i++){
    const a=vec(knots[i]),b=vec(knots[(i+1)%knots.length]),c=vec(knots[(i+2)%knots.length]);
    const prev=a.clone().lerp(b,.5),next=b.clone().lerp(c,.5);
    curve.add(new T.QuadraticBezierCurve3(prev,b,next));
  }
  // Arc distance, braking distance and wheel angle share the same scale.
  const length=curve.getLength(),positions=[],v=new T.Vector3();
  for(let k=0;k<=700;k++){const pt=curve.getPointAt(k/700);positions.push(pt);}
  const station=(x,z)=>positions.reduce((best,pt,i)=>pt.distanceToSquared(v.set(x,0,z))<positions[best].distanceToSquared(v)?i:best,0)/700*length;
  const stopEast=station(7.10,6.91),stopWest=station(9.28,3.71);
  const actors=[[-4.1,6.91,'#477876','#b78c5f',1.45],[13.4,3.71,'#914e42','#63848b',1.37],[-18,6.91,'#bac1af','#927b94',1.55]];
  for(const [i,[sx,sz,col,rider,speed]] of actors.entries()){
    const model=scooter(p,sx,sz,0,col,rider);let distance=station(sx,sz),velocity=speed,last=null,wheelAngle=0;
    animate(model.g,t=>{
      const dt=last===null?0:clamp(t-last,0,.16);last=t;
      model.g.visible=i===0||air.hour>=5.8&&air.hour<22.3||i===1&&air.hour>=22.3;
      const light=phase(t),stop=light>=12.7&&light<26.3;
      const gap=Math.min((stopEast-distance+length)%length,(stopWest-distance+length)%length);
      const target=stop?Math.min(speed,Math.sqrt(2*1.20*Math.max(0,gap-.07))):speed;
      velocity+=clamp(target-velocity,-1.7*dt,.80*dt);
      const delta=stop&&gap<1.5?Math.min(velocity*dt,Math.max(0,gap-.045)):velocity*dt;
      distance=(distance+delta)%length;const u=distance/length;
      const pos=curve.getPointAt(u),dir=curve.getTangentAt(u);
      model.g.position.set(pos.x,.026,pos.z);model.g.rotation.y=Math.atan2(dir.x,dir.z);
      wheelAngle+=delta/.177;model.wheels.forEach(w=>w.rotation.z=-wheelAngle);
      const wait=1-clamp(velocity/.60,0,1);
      model.rider.legs[0].rotation.x=-.92+wait*.90;model.rider.shins[0].rotation.x=1.32-wait*1.30;
      model.rider.head.rotation.y=.06*Math.sin(t*.9+i)+wait*.17*Math.sin(t*.65);
      model.car.rotation.z=wait*.055+.025*velocity*Math.sin(dir.x*2);
    });
  }
  for(const [j,x] of [-7.65,-6.90,-6.23,11.25,11.95,12.69].entries()){
    const parked=scooter(p,x,7.86+(j%2)*.08,-2.60+(j%3)*.17,['#7d8881','#945f55','#9eb1b3'][j%3]);
    parked.g.rotation.z=.094;
    rod(parked.car,steel,[-.052,.27,-.12],[-.19,.009,-.18],.012);
  }
}
function crossing(p){
  const passenger=person(p,8.17,.13,2.96,0,'#aa7968');passenger.root.scale.setScalar(1.13);
  articulated(passenger);const shade=umbrella(passenger.body,'#617f83');satchel(passenger.arms[1]);
  contact(passenger.root,0,0,.45,.29,.001);
  animate(passenger.root,t=>{
    const n=Math.floor((t+4.1)/period),c=phase(t);
    const u=clamp((c-16.2)/7.7,0,1),back=n%2===1,q=back?1-u:u;
    const moving=u>0&&u<1;
    passenger.root.position.set(8.16+.11*Math.sin(q*Math.PI),.03+.1*Number(q<.06||q>.92),2.89+q*5.11);
    passenger.root.rotation.y=(back?Math.PI:0)+(moving?0:.15*Math.sin(t*1.07));
    gait(passenger,t*5.72,moving?1:0,true);passenger.head.rotation.y=moving?.07*Math.sin(t):.49*Math.sin(t*.74);
    shade.visible=air.rain>.32;if(shade.visible){passenger.arms[0].rotation.x=-.83;shade.rotation.z=.065*Math.sin(t*2.7)*Number(moving);}
  });
}
function foodCart(p){
  const cart=group(p,-.12,.13,8.63,Math.PI);
  const steelTop=box(cart,steel,0,.65,0,1.80,.074,.71,true);
  box(cart,'#767d6a',0,.34,0,1.66,.58,.60,true);
  for(const side of [-1,1]){
    rod(cart,steel,[side*.84,.08,-.28],[side*.84,1.60,-.28],.022);
    rod(cart,steel,[side*.84,.60,.29],[side*.84,1.57,.29],.018);
    for(const z of [-.20,.20])hoop(cart,darkTyre,side*.74,.072,z,.050,.015).rotation.y=Math.PI/2;
  }
  const canopy=box(cart,'#7c5341',0,1.63,0,1.97,.07,.92,true);canopy.rotation.x=.05;
  let daySign=group(cart,0,1.48,.426),eveningSign=group(cart,0,1.48,.428);
  for(const [sign,title] of [[daySign,'巷口早點'],[eveningSign,'巷口滷味']]){
    box(sign,'#643e35',0,0,0,1.74,.26,.055);label(sign,title,0,0,.031,1.70,.224,'#993e33','#ffebbf',{size:.81});
    sign.userData.moves=true;
  }
  const steamer=group(cart,-.36,.704,.057);
  for(let k=0;k<3;k++){
    cyl(steamer,'#c49153',0,.051+k*.075,0,.219,.214,.093,28);
    for(const h of [.027,.079])hoop(steamer,'#d6ac6c',0,h+k*.075,0,.218,.008).rotation.x=Math.PI/2;
  }
  for(let i=0;i<6;i++){const a=i*tau/6;oval(steamer,'#eed8a9',.123*Math.sin(a),.255,.12*Math.cos(a),.062,.038,.060);}
  plume(cart,-.35,.90,.05,.99);
  const counter=group(cart,.36,.71,.08);
  for(let k=0;k<3;k++){cyl(counter,['#995342','#a79a72','#aaa487'][k],-.14+k*.105,.073,-.18,.048,.051,.141,12);}
  for(let k=0;k<4;k++){cyl(counter,'#e2e5cf',.19,.02+k*.018,.099,.087,.080,.021,18);}
  box(counter,P.wood,-.09,.02,.10,.30,.031,.17,true);
  const vendor=person(cart,-.17,.008,-.38,.18,'#eee1c8','cook');vendor.root.scale.setScalar(1.13);
  articulated(vendor);
  const tongs=group(vendor.elbows[1],.018,-.06,.099);
  for(let s of [-1,1])rod(tongs,steel,[0,0,0],[s*.014,-.010,.12],.006);
  const customer=person(cart,.41,0,.68,Math.PI+.14,'#566e81');customer.root.scale.setScalar(1.11);
  articulated(customer);
  const bag=group(cart,.18,.86,.39);
  box(bag,'#ecddaf',0,-.040,0,.114,.13,.071,true);
  for(const side of [-1,1])tube(bag,'#bd9666',[[side*.04,.021,0],[side*.035,.084,0],[0,.088,0]],.006);
  animate(bag,t=>{
    const f=t%12,u=clamp((f-4.5)/1.35,0,1),v=clamp((f-6.45)/1.65,0,1);
    const open=air.hour>=5&&air.hour<23.5;cart.visible=true;
    daySign.visible=air.hour<14;eveningSign.visible=!daySign.visible;
    customer.root.visible=vendor.root.visible=bag.visible=open;
    bag.position.set(-.08+.36*u,.72+.14*Math.sin(u*Math.PI)-.06*v,.22+.24*u+.13*v);
    vendor.arms[1].rotation.x=-.62+.25*Math.sin(t*2.3)*(1-u)+.28*v;
    vendor.arms[0].rotation.x=-.12-.79*Math.sin(Math.PI*clamp((f-3.45)/4,0,1));
    vendor.head.rotation.y=.2+.40*u-.28*v;
    customer.arms[0].rotation.x=-.13-.80*Math.sin(Math.PI*clamp((f-4.45)/4.9,0,1));
    customer.head.rotation.x=.08*Math.cos(t*1.3);customer.body.rotation.x=.08*Math.sin(Math.PI*u);
  });
  for(const x of [-.83,.83])lantern(cart,x,1.36,.40);
  for(let i=0;i<2;i++){
    const stool=group(cart,-1.21-i*.38,0,.07+i*.19);
    box(stool,'#af4439',0,.24,0,.25,.047,.23,true);
    for(const s of [-1,1])for(const k of [-1,1])rod(stool,'#9c3a32',[s*.086,.23,k*.077],[s*.115,.009,k*.098],.017,.023);
  }
  const duct=group(p,2.68,3.52,10.04);
  tube(duct,steel,[[0,0,0],[0,.31,0],[.06,.45,0],[.20,.46,0]],.072);
  plume(duct,.21,.48,0,.65,true);
}
function localPedestrians(p){
  function commuter(x0,x1,z,color,offset,withBag){
    const a=person(p,x0,.13,z,0,color);articulated(a);a.root.scale.setScalar(1.08+offset*.018);
    const cover=umbrella(a.body,withBag?'#976b59':'#5c798b');if(withBag)satchel(a.arms[1]);
    contact(a.root,0,0,.44,.31,.007);
    animate(a.root,t=>{
      const distance=x1-x0,speed=.62+offset*.018,journey=distance/speed,cycle=journey*2+5;
      const at=(t+offset*2.57)%cycle,back=at>=journey+2.5,along=back?clamp((at-journey-2.5)/journey,0,1):clamp(at/journey,0,1);
      const moving=at<journey||back&&at<cycle-2.5;
      const turn=back?clamp((at-journey-2.5)*2.4,0,1):clamp(at*2.4,0,1);
      a.root.position.x=x0+distance*(back?1-along:along);a.root.position.z=z+.05*Math.sin(along*2.2);
      a.root.rotation.y=back?Math.PI*.5-Math.PI*turn:-Math.PI*.5+Math.PI*turn;
      a.root.visible=air.open===1||offset===1;
      gait(a,(t+offset)*5.55,moving?1:0,withBag);
      a.head.rotation.y=moving?.10*Math.cos(t*1.17):.37*Math.sin(t*.86);
      cover.visible=air.rain>.32;if(cover.visible){a.arms[0].rotation.x=-.83;cover.rotation.z=.037*Math.cos(t*2.77);}
    });
  }
  commuter(-5.2,4.5,7.61,'#778a70',1,true);
  commuter(-20,-10.6,2.86,'#956d65',4,false);
  commuter(11.5,20.7,7.74,'#787482',6,true);
}
function wetGround(p){
  const c=makeCanvas(256,256,(g,w,h)=>{
    for(let i=0;i<220;i++){
      const y=(i*137%251),xx=w*.5+Math.sin(y*.64)*6,ww=5+Math.abs(Math.sin(y*.09+.6))*41+15*(1-y/h);
      const grad=g.createLinearGradient(xx-ww,0,xx+ww,0);grad.addColorStop(0,'rgba(255,255,255,0)');grad.addColorStop(.49,'rgba(255,252,244,.66)');grad.addColorStop(1,'rgba(255,255,255,0)');
      g.fillStyle=grad;g.fillRect(xx-ww,y,ww*2,1.5);
    }
  });
  const map=canvasMap(c);
  const pools=['#f8c576','#d8896c','#a7c9c0'].map(color=>new T.MeshBasicMaterial({color,map,transparent:true,depthWrite:false}));
  const wash=new T.MeshBasicMaterial({map:lampHalo,transparent:true,depthWrite:false,color:'#ffd38f'});
  for(const [i,x] of [-16,-9,-5.6,-.25,3.9,8.0,12.8,19.2].entries()){
    const lamp=panel(p,wash,x,.028,7.17,3.2,2.8);lamp.rotation.x=-Math.PI/2;lamp.renderOrder=1;lamp.castShadow=false;
    for(const [j,z] of [6.92,3.92].entries()){
      const po=panel(p,pools[(i+j)%3],x+j*.69,.030,z,1.15+.23*(i%3),1.8);po.rotation.x=-Math.PI/2;po.castShadow=false;po.renderOrder=2;
    }
  }
  animate(null,()=>{pools.forEach(m=>m.opacity=(.20+.55*air.night)*air.rain);wash.opacity=.51*air.night;});
}
export function taiwanStreet(town){
  streetPlate(town,6.76,7.95,'映光路','Yingguang Rd.',-Math.PI*.58);
  streetPlate(town,-6.52,3.0,'臺灣街','Taiwan St.',-Math.PI*.17);
  trafficSignal(town,7.26,7.88,false);trafficSignal(town,9.16,2.85,true);
  foodCart(town);crossing(town);motorTraffic(town);localPedestrians(town);wetGround(town);
  for(const [x,z,w] of [[-16,7.48,4.7],[12.2,7.49,5.2],[-13,2.94,3.3],[14.4,2.93,2.4]]){
    box(town,'#b75243',x,.097,z,w,.070,.044);
  }
  for(let i=0;i<4;i++){
    const pos=-4.65+i*.92;
    box(town,'#b6a57e',pos,.139,7.57,.79,.017,.37);
    for(let j=0;j<3;j++)box(town,'#ccad6d',pos,.157,7.46+j*.103,.72,.018,.027,true);
  }
  for(const x of [-6.5,.75,5.3,14.6]){
    const l=new T.PointLight('#ffd19c',5.0,5.4,2);l.position.set(x,2.12,x===.75||x===14.6?2.7:8.35);town.add(l);
    animate(null,()=>{l.intensity=1.05+air.night*6.5;});
  }
}
