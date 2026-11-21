// Continuous streets around the original arts block, at the same scale as its tram.
import {T, palette as P, group, box, panel, mesh, cyl, rod, tube, label, painted, makeCanvas, canvasMap, drawNoise, batch, animate} from './craft.js';
import {roofTile, zinc, cloth} from './surfaces.js';
import {person} from './street.js';
import {air} from './atmosphere.js';
import {neighborhood} from './neighborhood.js';
import {taiwanStreet} from './taiwan-life.js';

const facades=['#d7ad8c','#d9cdb0','#b8c5b7','#d6b4a5','#b7bec0'];
const shopColors=['#934c43','#37655c','#536875','#966c42'];
const stores=['蘭芳花店','巷口豆花','日新印刷','青果行','明昌電器','光華書局','光影照相館','家常便當','中藥行','五金行','聲音工坊','診所'];
const lampGlow=new T.MeshBasicMaterial({color:'#ffe1a4'});
function streetTile(){
  const texture=canvasMap(makeCanvas(384,384,(g,w,h)=>{
    g.fillStyle='#d2c5ae';g.fillRect(0,0,w,h);
    for(let y=0;y<8;y++)for(let x=-1;x<5;x++){
      const px=x*96+(y%2)*48;g.fillStyle=['#d9cbb4','#cebfaa','#d4c7b1','#ddceb7'][(y*3+x+9)%4];
      g.fillRect(px+1,y*48+1,94,46);
    }
    drawNoise(g,w,h,15000,.24);
  }));
  texture.wrapS=texture.wrapT=T.RepeatWrapping;
  return new T.MeshStandardMaterial({map:texture,roughness:.95});
}
function paving(p, x,z,w,d,material,y=.10){
  const floor=panel(p,material,x,y,z,w,d,[0,0,w/3.4,d/3.4]);floor.rotation.x=-Math.PI/2;floor.castShadow=false;
}
function hillRing(p,radius,base,height,color,phase){
  const vertices=[],colors=[],indices=[],segments=210;
  for(let i=0;i<=segments;i++){
    const angle=2*Math.PI*i/segments;
    const crest=height*(.52+.24*Math.sin(angle*5+phase)+.19*Math.cos(angle*9-.3)+.09*Math.sin(angle*19+phase*2)+.05*Math.sin(angle*37));
    for(let j=0;j<4;j++){
      const t=j/3,r=radius-6*(1-t);
      vertices.push(Math.sin(angle)*r,-1+(base+crest+1)*t,Math.cos(angle)*r);
      const c=new T.Color(color).multiplyScalar(.88+.15*t+.045*Math.sin(angle*21+phase)*t+.035*Math.cos(angle*14-t*2));
      colors.push(c.r,c.g,c.b);
    }
    if(i<segments)for(let j=0;j<3;j++){const n=i*4+j;indices.push(n,n+1,n+4,n+1,n+5,n+4);}
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setIndex(indices);
  const hill=new T.Mesh(geo,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,fog:false}));p.add(hill);return hill;
}
function skyline(scene){
  scene.fog=new T.Fog('#dfdfc9',23,84);
  return [hillRing(scene,141,2.1,13.5,'#b8cbcd',.32),hillRing(scene,126,.2,8.5,'#a4bcb1',2)];
}
function roof(p,w,d,y,peak,material){
  const half=d/2+.17,run=Math.hypot(half,peak);
  for(const side of [-1,1]){
    const slab=panel(p,material,0,y+peak*.50,side*half*.50,w+.34,run);
    slab.rotation.x=-Math.PI/2+side*Math.atan2(peak,half);
    box(p,P.walnut,0,y-.014,side*half,w+.35,.105,.12);
  }
  box(p,P.walnut,0,y+peak-.016,0,w+.40,.09,.11);
  for(const side of [-1,1]){
    const shape=new T.Shape();shape.moveTo(-half,0);shape.lineTo(0,peak);shape.lineTo(half,0);shape.closePath();
    const cap=mesh(p,new T.ShapeGeometry(shape),P.cream,side*w*.5,y,0);cap.rotation.y=side*Math.PI/2;
  }
}
const signs=new Map();
function shopSign(parent,text,x,y,z,w,h,color,square=false){
  const key=color+text;
  if(!signs.has(key))signs.set(key,painted(makeCanvas(square?128:384,square?150:84,(g,pw,ph)=>{
    g.fillStyle=color;g.fillRect(0,0,pw,ph);g.fillStyle='#f9e8c7';g.textAlign='center';g.textBaseline='middle';
    g.font='bold '+Math.round(ph*.66)+'px "Songti TC","PingFang TC",serif';g.fillText(text,pw/2,ph*.52,pw*.91);
  }),true));
  return panel(parent,signs.get(key),x,y,z,w,h);
}
function dwelling(row,art,x,z,yaw,i,near=true){
  const p=group(row,x,.11,z,yaw),w=2.85+(i%4)*.26,d=2.6+(i%3)*.24,h=2.5+((i*7)%5)*.48;
  box(p, facades[i%5],0,h/2-.02,0,w,h,d);
  const front=group(p,0,0,d/2+.018);
  panel(front,art['wall'+i%4],0,h/2,0,w,h);
  const rear=group(p,0,0,-d/2-.012,Math.PI);
  panel(rear,art['wall'+((i+2)%4)],0,h/2,0,w,h,[.04,.13,.94,.98]);
  for(const s of [-1,1]){
    const wall=panel(p,art['wall'+((i+1)%4)],s*(w/2+.012),h/2,0,d,h,[.09,.07,.85,.94]);wall.rotation.y=s*Math.PI/2;
  }
  if(near){
    box(front,P.walnut,0,1.09,.027,w-.12,1.88,.082);
    const display=panel(front,art[i%3?'room'+i%4:'rental'],-w*.15,1.00,.080,w*.56,1.21,[.16,.16,.88,.89]);
    display.castShadow=false;
    for(const px of [-.406,-.147,.121])box(front,P.wood,w*px,1.02,.116,.055,1.43,.048);
    box(front,'#4e7773',w*.30,.93,.066,w*.23,1.65,.12);
    box(front,'#92aaa1',w*.30,1.12,.145,w*.16,.83,.045);box(front,P.brass,w*.385,.76,.163,.03,.16,.043);
    box(front,shopColors[i%4],0,1.99,.11,w+.095,.34,.28);
    shopSign(front,stores[i%stores.length],0,1.99,.256,w*.76,.23,shopColors[i%4]);
    const canopy=panel(front,i%4===1?zinc:cloth,0,1.78,.38,w+.14,.76);canopy.rotation.x=-1.34;
    box(front,shopColors[i%4],0,1.68,.75,w+.17,.087,.07);
    if(h>3.25){
      box(front,P.wood,0,2.50,.19,w*.79,.084,.40);
      for(let j=0;j<9;j++)box(front,'#51635a',(j-4)*w*.084,2.72,.37,.035,.40,.04);
      box(front,P.walnut,0,2.91,.38,w*.81,.069,.08);
    }
    const sign=group(front,-w*.47,2.35,.34,Math.PI/2);
    box(sign,shopColors[(i+1)%4],0,0,0,.53,.60,.095,true);
    for(const flip of [-1,1]){const face=group(sign,0,0,.053*flip,flip<0?Math.PI:0);shopSign(face,['✳','✿','◉','♫'][i%4],0,0,.003,.39,.45,shopColors[(i+1)%4],true);}
  }
  if(near && i%3===0){
    for(const off of [-.23,.23])cyl(p,'#7b827d',off,h+.19,-.29,.055,.058,.41,8);
    cyl(p,'#9baba7',0,h+.64,-.29,.335,.34,.69,20);
    for(let j=0;j<4;j++)cyl(p,'#ced1bd',0,h+.36+j*.16,-.29,.347,.347,.022,20);
    cyl(p,'#c9cfc1',0,h+1.02,-.29,.073,.339,.12,20);
  }
  if(near && i%3===2){
    for(const side of [-1,1])box(front,'#b9a995',side*(w*.46),.83,.67,.14,1.65,.17);
    for(let j=0;j<3;j++)box(front,'#648b7b',-.70+j*.14,.50,.57,.057,.84,.11);
    box(front,'#92a398',.61,h*.78,.075,.63,.36,.19,true);
    for(let j=0;j<9;j++)box(front,'#536763',.36+j*.059,h*.78,.179,.017,.25,.013);
  }
  if(i%4!==3)roof(p,w,d,h,.36+.11*(i%3),i%3?roofTile:zinc);
  else{box(p,'#6f867d',0,h+.04,0,w+.30,.15,d+.28);box(p,'#99a29a',0,h+.27,-d*.12,.68,.44,.55);}
}
const foliage=painted(makeCanvas(256,224,(g,w,h)=>{
  let seed=3863;const rnd=()=>((seed=Math.imul(1664525,seed)+1013904223>>>0)/4294967296);
  for(let j=0;j<1200;j++){
    const a=rnd()*Math.PI*2,r=Math.sqrt(rnd()),x=(.50+.45*r*Math.cos(a))*w,y=(.52+.44*r*Math.sin(a))*h;
    const v=(1-y/h)*28+rnd()*23;
    g.fillStyle='rgb('+Math.round(61+v)+','+Math.round(91+v)+','+Math.round(64+v*.52)+')';
    g.beginPath();g.ellipse(x,y,2+rnd()*7,2+rnd()*6,a,0,2*Math.PI);g.fill();
    if(j%7===0){g.fillStyle='#c1bb87';g.fillRect(x,y-2,2,1);}
  }
}),false);
foliage.alphaTest=.44;foliage.side=T.DoubleSide;foliage.roughness=1;
function canopyTree(p,x,z,size=1){
  const g=group(p,x,.12,z);g.scale.setScalar(size);
  cyl(g,'#795b45',0,.67,0,.055,.10,1.34,7);
  for(let j=0;j<9;j++){
    const a=j*2.39,r=j%3*.19, y=1.48+(j%3)*.21,xx=Math.cos(a)*r,zz=Math.sin(a)*r;
    rod(g,P.wood,[0,.89,0],[xx,y,zz],.019,.045,7);
    for(let k=0;k<3;k++){const leaves=panel(g,foliage,xx,y,zz,.86,.69);leaves.rotation.y=a+k*Math.PI/3;leaves.rotation.x=-.22;}
  }
}
function streetLight(p,x,z){
  cyl(p,'#486862',x,1.42,z,.036,.067,2.82,10);
  rod(p,P.metal,[x,2.74,z],[x+.42,2.91,z],.038);
  cyl(p,P.jade,x+.43,2.88,z,.09,.188,.11,10);
  cyl(p,lampGlow,x+.43,2.79,z,.147,.076,.10,10);
}
function clockTower(p){
  const g=group(p,19,.10,-3.66);box(g,'#b98a67',0,3.2,0,1.66,6.4,1.65);
  for(let f=0;f<4;f++){
    const face=group(g,0,0,0,f*Math.PI/2);
    box(face,P.cream,0,5.49,.839,1.46,1.49,.09);
    const dial=cyl(face,'#f5dfb5',0,5.51,.926,.58,.58,.09,28);dial.rotation.x=Math.PI/2;
    for(let j=0;j<12;j++){const a=j*Math.PI/6;const mark=box(face,P.walnut,.47*Math.sin(a),5.51+.47*Math.cos(a),.986,.032,.10,.018);mark.rotation.z=-a;}
    const hand=group(face,0,5.51,.999);box(hand,P.ink,0,.15,0,.04,.32,.02);
    const minute=group(face,0,5.51,1.014);
    box(minute,P.walnut,0,.205,0,.025,.43,.018);
    animate(hand,()=>{hand.rotation.z=-Math.PI*2*(air.hour%12)/12;});
    animate(minute,()=>{minute.rotation.z=-Math.PI*2*(air.hour%1);});
    for(let j=0;j<3;j++)box(face,'#8b6953',(j-1)*.44,3.87,.858,.04,1.39,.065);
  }
  cyl(g,'#58746b',0,6.53,0,.29,1.34,.64,4).rotation.y=Math.PI/4;
  cyl(g,P.brass,0,7.04,0,.028,.048,.48,8);
}
function boulevardLife(p){
  // A baker delivering paper and two neighbors walk on opposite pavements.
  const paths=[[-13.2,-8.1,2.96,'#bd8154'],[7.8,14.0,7.70,'#508080'],[-7.0,-1.5,7.64,'#9c6060']];
  paths.forEach(([from,to,z,coat],i)=>{
    const a=person(p,from,.13,z,0,coat);a.root.userData.moves=true;
    a.legs.forEach(l=>l.userData.moves=true);a.arms.forEach(l=>l.userData.moves=true);
    animate(a.root,t=>{
      const u=t*(.135+i*.026)+i*1.47,s=Math.sin(u);a.root.position.x=from+(to-from)*(.5+.5*s);
      a.root.rotation.y=Math.cos(u)>0?Math.PI/2:-Math.PI/2;
      const stride=Math.sin(t*(5.3+i))*.43*Math.abs(Math.cos(u));
      a.legs[0].rotation.x=stride;a.legs[1].rotation.x=-stride;a.arms[0].rotation.x=-stride*.55;a.arms[1].rotation.x=stride*.55;
    });
  });
}
export function buildTown(scene,art){
  const hills=skyline(scene);
  const town=group(scene),tile=streetTile();
  const asphalt=painted(makeCanvas(384,384,(g,w,h)=>{g.fillStyle='#818680';g.fillRect(0,0,w,h);drawNoise(g,w,h,38000,.36);}));
  asphalt.map.wrapS=asphalt.map.wrapT=T.RepeatWrapping;
  paving(town,0,0,220,220,asphalt,-.01);
  const rows=[
    {z:.70,angle:0,x:[-27,-23.6,-19.8,-15.9,-12.4,26.1]},
    {z:10.6,angle:Math.PI,x:[-26,-22.3,-18.5,-14.7,-10.8,-6.8,-3.2,.65,4.55,22,25.8]},
    {z:-11.7,angle:0,x:[-24,-20,-16,-12,-7.9,-3.8,.4,4.4,8.4,12.5,16.6,20.7,24.8]},
    {z:20.0,angle:Math.PI,x:[-24,-19.7,-15.4,-11,-6.7,-2.5,1.8,6.1,10.4,14.7,19,23]},
    {z:-20.2,angle:0,x:[-22,-17.8,-13.5,-9.2,-4.9,-.6,3.7,8,12.3,16.6,20.9]}
  ];
  for(const [j,row] of rows.entries()){
    const buildings=group(scene);
    row.x.forEach((x,i)=>{if(j<2&&x<=-9)return;dwelling(buildings,art,x,row.z+(i%3-.6)*.16,row.angle,i+j*7,j<2);});
    batch(buildings);
  }
  for(const side of [-1,1]){
    const end=group(scene);
    for(let j=0;j<12;j++){
      const z=-22+j*4.05;
      dwelling(end,art,side*(31.25+Math.sin(j*1.9)*.38),z,-side*Math.PI/2,j+13,Math.abs(z-5)<9);
      if(j%3!==1)dwelling(end,art,side*(38.1+j%3*.49),z+2.3,side*Math.PI/2,j+26,false);
    }
    for(let i=0;i<12;i++)dwelling(end,art,-23+i*4.13,-27.3+side*1.95,side<0?0:Math.PI,i+35,false);
    batch(end);
    paving(town,side*30.3,.3,3.65,47,tile,.112);
  }
  for(const [x,z,w,d] of [[0,9.9,57,4.75],[-19,.45,19,5.05],[18.56,.45,20.16,5.05],[0,-12,57,4.8],[0,20,57,4.7],[0,-20.2,55,4.4]]){
    box(town,'#b3a891',x,.037,z,w,.16,d);paving(town,x,z,w-.05,d-.06,tile,.123);
  }
  for(const x of [-24,-15.8,8.2,16.1,23.7]){
    for(let j=0;j<6;j++)box(town,'#d9ccb1',x,.012,3.42+j*.65,1.07,.009,.27);
  }
  for(const x of [-22,-13,-6,2.6,11,19.7,26])streetLight(town,x,7.78);
  for(const [x,z,s] of [[-17,2.62,1.18],[-11.8,7.9,1.38],[-4.8,7.99,1.12],[6.2,8.25,1.49],[13.8,2.9,1.26],[21,8,1.22],[17.9,-8.8,1.55],[-14,-8.8,1.48],[22.3,-9,1.46],[6,18,1.29]])canopyTree(town,x,z,s);
  for(const x of [-14,8.7,23.4]){
    for(const z of [2.8,8.25])cyl(town,P.wood,x,2.03,z,.061,.088,4.06,8);
    for(let j=0;j<2;j++)tube(town,'#4f5652',[[x-.12*j,4.02-j*.1,2.8],[x-.12*j,3.69-j*.10,5.5],[x-.12*j,4.02-j*.1,8.25]],.012);
  }
  clockTower(town);boulevardLife(town);
  taiwanStreet(town);neighborhood(town,art);batch(town);
  return {hills,road:asphalt,lamps:lampGlow,windows:Object.entries(art).filter(([name])=>!name.startsWith('wall')).map(([,m],i)=>[m,i%2])};
}
