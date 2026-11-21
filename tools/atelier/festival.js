import {T,group,box,cyl,rod,oval,hoop,panel,tube,label,contact,mesh,makeCanvas,painted,animate,batch} from './craft.js';
import {person} from './street.js';
import {articulated} from './taiwan-life.js';
import {air} from './atmosphere.js';

const cream='#fff0ca',mint='#298b86',coral='#dd6954',gold='#edb751',navy='#304652';
const tau=Math.PI*2;
let festivalStart=0;
export function restartFestival(time){festivalStart=time;}
function choreograph(node,action){animate(node,time=>action(Math.max(0,time-festivalStart)));}
const ease=(a,b,t)=>T.MathUtils.smoothstep(t,a,b);
function visitor(p,x,z,yaw,shirt,size=1){
  const a=person(p,x,0,z,yaw,shirt,'uniform');
  a.root.scale.setScalar(size);articulated(a);
  if(size<.9)a.head.scale.multiplyScalar(1.13);
  contact(a.root,0,0,.36,.23,.007);
  return a;
}
function hat(a,color){
  oval(a.head,color,0,.095,-.006,.105,.044,.10);
  oval(a.head,color,0,.074,.081,.089,.010,.078);
  box(a.head,cream,0,.104,.084,.027,.018,.009,true);
}
function wrist(a,index){
  // End of the forearm in the neutral standing rig.
  const side=index===0?-1:1;
  return group(a.elbows[index],-side*.011,-.061,.0152);
}
function breathe(a,t){
  a.hips.position.y=.39+.003*Math.sin(t*1.65);
  a.body.rotation.z=.025*Math.sin(t*.84);a.head.rotation.z=-.55*a.body.rotation.z;
}
// The stance foot travels back by exactly the distance covered by the hips.
// Solve the hip and knee angles to place its ankle on the pavement.
function walk(a,dist,speed,t){
  const step=.234,phase=dist/(a.root.scale.x*step*2);
  const hips=.368+.011*Math.cos(phase*tau*2);
  a.hips.position.y=hips;a.hips.position.x=.012*Math.sin(phase*tau);
  a.body.rotation.y=.073*Math.sin(phase*tau);a.body.rotation.z=-.028*Math.cos(phase*tau);
  for(let i=0;i<2;i++){
    const u=(phase+i*.5)%1,inAir=u>=.5,k=inAir?(u-.5)*2:u*2;
    const z=step*(inAir?ease(0,1,k)-.5:.5-k);
    const lift=inAir?.075*Math.sin(Math.PI*k):0,down=hips-.049-lift;
    const l1=Math.hypot(.166,.027),l2=Math.hypot(.169,.027);
    const r=T.MathUtils.clamp(Math.hypot(down,z),.05,l1+l2-.0001);
    const bend=Math.acos(T.MathUtils.clamp((r*r-l1*l1-l2*l2)/(2*l1*l2),-1,1));
    a.legs[i].rotation.x=Math.atan2(.027,.166)-Math.atan2(z,down)-Math.atan2(l2*Math.sin(bend),l1+l2*Math.cos(bend));
    a.shins[i].rotation.x=bend-Math.atan2(.027,.166)-Math.atan2(.027,.169);
    a.arms[i].rotation.x=-.19+.39*Math.cos(u*tau)*speed;
    a.elbows[i].rotation.x=-.22-.10*Math.sin(u*tau);
  }
  a.head.rotation.x=.018*Math.sin(phase*tau*2);a.head.rotation.y=.10*Math.sin(t*.86);
}
function pinwheel(hand){
  const p=group(hand);rod(p,'#ab7950',[0,0,0],[.05,.27,.025],.009);
  const wheel=group(p,.05,.27,.035);
  [mint,cream,coral,gold].forEach((c,i)=>{
    const blade=group(wheel,0,0,0);blade.rotation.z=i*Math.PI/2;
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute([0,0,0,.10,.018,.035,.08,.095,0,0,0,0,.08,.095,0,.021,.061,-.012],3));geo.computeVertexNormals();
    mesh(blade,geo,new T.MeshStandardMaterial({color:c,side:T.DoubleSide}));
  });oval(p,gold,.05,.27,.056,.022,.022,.012);
  animate(wheel,t=>wheel.rotation.z=t*4.8+.49*Math.sin(t*1.3));
}
function family(p){
  const adult=visitor(p,0,0,0,'#638d9d',1.12),child=visitor(p,0,0,0,'#eb9756',.81);
  hat(adult,'#e3c78a');hat(child,'#de725a');pinwheel(wrist(child,1));
  const pack=group(adult.body,0,.15,-.10);box(pack,'#ac603f',0,0,0,.192,.205,.094,true);
  box(pack,'#bf8557',0,-.055,-.057,.15,.075,.024,true);
  const span=3.58,legTime=10,period=26;
  choreograph(adult.root,t=>{
    const u=(t+2.1)%period,back=u>=13,leg=back?u-13:u;
    const distance=span*ease(0,legTime,leg),x=-25.25+(back?span-distance:distance);
    const turn=ease(legTime,12.7,leg),yaw=(back?-1:1)*Math.PI*(.5-turn);
    const speed=leg<legTime?Math.sin(Math.PI*leg/legTime):0;
    for(const [i,a] of [adult,child].entries()){
      a.root.position.set(x+.28*i,.124,7.59+i*.40+.036*Math.sin(distance*1.3));a.root.rotation.y=yaw;
      walk(a,distance+i*.055,speed,t+i*.84);
      a.head.rotation.y+=i?-.30*(1-speed):.30*(1-speed);
    }
    child.arms[1].rotation.x=-.79+.10*Math.cos(t*2);child.elbows[1].rotation.x=-.72;
    adult.head.rotation.x+=.16*(1-speed);child.head.rotation.x-=.22*(1-speed);
  });
}
function photoPair(p){
  const camera=visitor(p,-23.70,2.87,1.60,'#42668f',1.09),friend=visitor(p,-22.06,2.79,-1.49,'#ed724e',1.06);
  camera.root.position.y=friend.root.position.y=.132;hat(friend,cream);
  const grip=wrist(camera,1),device=group(grip,-.035,.003,.028);
  box(device,navy,0,0,0,.118,.090,.054,true);box(device,'#c4bca8',0,.04,0,.118,.014,.055);
  const lens=cyl(device,'#29414b',0,0,.037,.029,.034,.040,18);lens.rotation.x=Math.PI/2;
  oval(device,'#91bdc4',0,0,.061,.023,.023,.007);
  const flash=new T.MeshBasicMaterial({color:'#fff0cb'});const blink=oval(device,flash,.043,.021,.032,.012,.009,.005);
  choreograph(camera.root,t=>{
    const u=(t+2.3)%8,raise=ease(.25,1.65,u)*(1-ease(4.5,6,u)),pose=ease(.60,1.95,u)*(1-ease(4.25,5.65,u));
    breathe(camera,t);breathe(friend,t+.72);camera.body.rotation.x=.10*raise;
    for(let i=0;i<2;i++){const side=i?1:-1;
      camera.arms[i].rotation.x=-.14-1.68*raise;camera.arms[i].rotation.z=-side*.48*raise;camera.elbows[i].rotation.x=-.20-1.11*raise;}
    device.rotation.x=.34+2.79*raise;camera.head.rotation.x=-.08+.14*raise;
    blink.visible=(u>2.49&&u<2.65)||(u>3.38&&u<3.50);
    friend.head.rotation.z=.15*pose;friend.head.rotation.y=.11*Math.sin(t);
    friend.arms[0].rotation.z=-1.95*pose;friend.elbows[0].rotation.z=-.55*pose+.20*pose*Math.sin(t*6);
    friend.hips.position.x=.025*pose;
  });
}
function photoCard(p,material,w,h){
  const card=group(p);
  box(card,cream,0,0,0,w,h,.008);
  panel(card,material,0,h*.045,.006,w*.83,h*.71);
  return card;
}
function kiosk(p,detailedCast){
  const shop=group(p,-16.62,.126,7.98,Math.PI);
  const enamel='#307772',wood='#b78356';
  box(shop,enamel,0,.30,0,1.32,.51,.39,true);
  for(const x of [-.48,.48])for(const z of [-.13,.13]){
    const wheel=cyl(shop,navy,x,.099,z,.09,.09,.046,16);wheel.rotation.x=Math.PI/2;}
  box(shop,wood,0,.575,0,1.42,.070,.49,true);
  for(let j=0;j<12;j++){const x=-.59+j*.108;box(shop,j%2?'#4a9588':'#428777',x,.30,.199,.098,.39,.012);}
  for(const y of [.106,.50])box(shop,'#ce9d61',0,y,.210,1.32,.025,.025);
  for(const x of [-.64,.64]){box(shop,'#d7ab6d',x,.30,.212,.028,.41,.025);}
  const tray=group(shop,.45,.36,.222);
  box(tray,'#664b3a',0,0,0,.27,.22,.03,true);box(tray,'#f2dbac',0,0,.018,.23,.18,.01);
  for(let j=0;j<4;j++)box(tray,'#9d8161',-.04,j*.025-.02,.025,.13,.005,.006);
  for(const x of [-.626,.626]){rod(shop,gold,[x,.59,-.14],[x,1.35,-.14],.018);}
  const woodTop=box(shop,enamel,0,1.36,-.04,1.53,.063,.59,true);woodTop.rotation.x=.075;
  for(let i=0;i<13;i++)box(shop,i%2?cream:coral,(i-6)*.11,1.32,.235,.111,.095,.030,true);
  label(shop,'街拍沖印',-.30,.32,.218,.61,.185,'#327873','#fff0d6',{size:.80});
  const prints=['劇院','湖心亭','教堂'].map((name,i)=>painted(makeCanvas(320,260,c=>{
    const palettes=[['#98d2c2','#e3ad4b','#235c64'],['#e7c59a','#b55140','#37776f'],['#c5dfda','#db9b43','#405c6a']];
    const [sky,sun,land]=palettes[i];c.fillStyle=sky;c.fillRect(0,0,320,260);
    c.fillStyle='#fff0c9';c.beginPath();c.arc(236,70,37,0,tau);c.fill();
    c.fillStyle=land;c.fillRect(0,165,320,95);
    if(i===0){
      c.fillStyle=land;c.fillRect(34,66,244,109);
      for(let j=0;j<3;j++){const x=42+j*83;c.fillStyle=cream;c.beginPath();c.moveTo(x,66);c.lineTo(x+77,66);c.bezierCurveTo(x+15,99,x+11,136,x+77,175);c.lineTo(x,175);c.bezierCurveTo(x+53,133,x+54,98,x,66);c.fill();}
    }else if(i===1){
      for(const x of [30,146]){c.fillStyle=sun;c.beginPath();c.moveTo(x,118);c.lineTo(x+59,65);c.lineTo(x+121,118);c.fill();c.fillStyle=cream;for(let j=0;j<5;j++)c.fillRect(x+11+j*24,118,6,42);}
      c.fillRect(25,162,252,5);
    }else{
      for(const side of [-1,1]){c.fillStyle=side===1?sun:'#aa783c';c.beginPath();c.moveTo(160+side*6,42);c.quadraticCurveTo(163+side*12,118,160+side*83,171);c.lineTo(160+side*8,171);c.fill();}
    }
    c.fillStyle=cream;c.font='bold 35px "PingFang TC",sans-serif';c.fillText(name,22,217);
    c.fillRect(24,233,73,3);
  }),true));
  tube(shop,'#815e45',[[-.58,1.31,.18],[0,1.275,.18],[.58,1.31,.18]],.006);
  for(let j=0;j<4;j++){
    const x=-.47+j*.30,anchor=group(shop,x,1.275+.10*x*x,.18);
    const card=photoCard(anchor,prints[j%3],.137,.134);card.position.y=-.058;card.rotation.z=(j-1.6)*.054;
    box(anchor,wood,0,.004,.014,.023,.054,.019);
    animate(anchor,t=>anchor.rotation.x=.08+.09*Math.sin(1.8*t+j));
  }
  box(shop,cream,.31,.69,-.015,.34,.15,.24,true);box(shop,navy,.31,.677,.108,.27,.035,.012,true);
  for(let j=0;j<5;j++)box(shop,'#afab95',.23+j*.028,.771,-.029,.015,.008,.085);
  oval(shop,new T.MeshBasicMaterial({color:'#95d7aa'}),.431,.723,.108,.012,.008,.006);
  for(const x of [-.27,-.12]){cyl(shop,'#b3a17a',x,.639,.1,.052,.052,.09,16);cyl(shop,navy,x,.689,.1,.04,.04,.012,16);}
  for(let j=0;j<3;j++)box(shop,[coral,gold,cream][j],-.43+.06*j,.624,.08,.049,.022,.08,true);
  if(detailedCast){
    const print=photoCard(shop,prints[1],.16,.155);print.name='festival-print';print.userData.moves=true;return;
  }
  const vendor=visitor(shop,.23,-.25,-.85,'#398e96',1.10),customer=visitor(shop,-.33,.37,Math.PI-.94,'#385ca1',1.12);
  box(vendor.body,navy,0,.116,.09,.19,.235,.026,true);hat(vendor,'#c98154');
  box(vendor.body,'#a68461',.035,.10,.114,.092,.065,.013,true);
  for(const s of [-1,1]){const strap=box(vendor.body,navy,s*.066,.235,.084,.024,.15,.012,true);strap.rotation.z=-s*.13;}
  for(let i=0;i<3;i++)oval(customer.head,'#38332f',0,-.015-i*.042,-.092-i*.006,.050-i*.004,.046,.042);
  for(const s of [-1,1]){const rim=hoop(customer.head,'#776653',s*.041,.002,.086,.027,.003);rim.scale.y=.72;}
  rod(customer.head,'#776653',[-.014,.004,.088],[.014,.004,.088],.0025);
  const gHand=wrist(vendor,0),take=wrist(customer,1),photo=photoCard(shop,prints[1],.16,.155);
  const from=new T.Vector3(),to=new T.Vector3(),slot=new T.Vector3(.31,.674,.13);
  choreograph(photo,t=>{
    const u=(t+8.4)%9,reach=ease(.6,2.3,u)*(1-ease(4.15,5.4,u)),accept=ease(2.2,3.8,u)*(1-ease(6.9,8.55,u)),inspect=ease(4.35,5.65,u)*(1-ease(6.9,8.55,u));
    breathe(vendor,t);breathe(customer,t+.8);
    vendor.body.rotation.x=.32*reach;vendor.head.rotation.y=.28*(1-reach);vendor.arms[0].rotation.x=-.72-1.02*reach;vendor.elbows[0].rotation.x=-.40-.36*reach;
    customer.body.rotation.x=.22*accept;customer.head.rotation.x=.18*inspect;customer.arms[1].rotation.x=-.20-1.25*accept;customer.elbows[1].rotation.x=-.18-.36*accept-1.03*inspect;
    // Both endpoints follow the articulated wrists. Keep the print in hand until it is lowered.
    shop.worldToLocal(gHand.getWorldPosition(from));shop.worldToLocal(take.getWorldPosition(to));
    photo.position.copy(slot).lerp(from,ease(.45,1.65,u)).lerp(to,ease(2.75,3.75,u));
    photo.rotation.set(-1.04+.98*inspect,.25+.58*accept,.055*Math.sin(t*2));
    photo.scale.setScalar(ease(0,.40,u)*(1-ease(8.1,8.8,u)));
  });
}
function welcome(p){
  const host=visitor(p,-.80,2.87,-.34,'#3f9792',1.08);host.root.position.y=.195;hat(host,'#dd9558');
  box(host.body,cream,-.077,.19,.104,.050,.037,.012,true);
  choreograph(host.root,t=>{const u=(t+2)%7,show=ease(.4,1.5,u)*(1-ease(4,5.35,u));breathe(host,t);
    host.head.rotation.y=-.25+.48*show;host.arms[1].rotation.z=show*1.55;host.arms[1].rotation.x=-.37*show;host.elbows[1].rotation.z=.44*show;});
}
export function festival(scene,detailedCast){
  const street=group(scene);
  family(street);photoPair(street);kiosk(street,detailedCast);if(!detailedCast)welcome(street);
  // Enamel-shaded festoon lamps carry the warm colour through to the studio door.
  const ember=new T.MeshBasicMaterial({color:'#ffd482'});
  for(const [x,y,z] of [[-23.0,2.50,2.93],[-14.4,2.51,2.88],[-12.4,2.44,8.05],[-5.85,2.46,2.69]]){
    const strand=group(street,x,y,z);
    tube(strand,'#4e5a4e',[[-1.18,.1,0],[0,-.14,0],[1.18,.1,0]],.008);
    for(let j=0;j<7;j++){const s=(j-3)*.34,h=-.14+.24*(s/1.18)**2;
      cyl(strand,'#59685d',s,h-.024,0,.021,.045,.045,12);oval(strand,ember,s,h-.072,0,.036,.045,.036);}
  }
  animate(null,()=>ember.color.set(air.night>.4?'#ffd085':'#ffdda0'));batch(street);
  return street;
}
