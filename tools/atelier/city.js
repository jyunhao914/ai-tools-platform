import {T,group,box,panel,cyl,rod,oval,tube,label,mesh,animate,batch,makeCanvas,painted} from './craft.js';
import {elevationMaterial} from './lane.js';
import {air} from './atmosphere.js';
import {person} from './street.js';
const stone='#cbc9b9',steel='#697772',white='#e9e7db',glass='#607d85',dark='#334641';
const lit=new T.MeshBasicMaterial({color:'#ffe4a4'}),red='#a84431';
const atlas={};
function art(name){return atlas[name]??=elevationMaterial(name);}
function facade(p,name,x,z,w,h,d){
  const g=group(p,x,.04,z);
  box(g,stone,0,h/2,0,w,h,d);
  for(const side of [-1,1]){
    const front=group(g,0,h/2,side*(d*.5+.014),side>0?0:Math.PI);panel(front,art(name),0,0,0,w,h);
    const end=group(g,side*(w*.5+.014),h/2,0,side*Math.PI/2);panel(end,art(name),0,0,0,d,h);
  }
  box(g,'#abb0a9',0,h+.04,0,w+.06,.10,d+.07);return g;
}
function turf(p,x,z,w,d){box(p,'#879474',x,.034,z,w,.07,d);}
function plank(p,x,z,w,d){box(p,'#b5b2a3',x,.053,z,w,.10,d);}
let foliage;
function tree(p,x,z,size=1){
  if(!foliage){
    const tex=painted(makeCanvas(256,256,c=>{
      let seed=415;const rng=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
      for(let j=0;j<3000;j++){let dx=rng()*2-1,dy=rng()*2-1;const a=Math.atan2(dy,dx),edge=.86+.10*Math.sin(a*7)+.06*Math.sin(a*11+1.2);if(dx*dx+dy*dy>edge*edge)continue;
        const d=Math.max(0,1-dx*dx-dy*dy),v=Math.round(32+((1-dy)*.35+rng()*.35+d*.21)*52);
        c.fillStyle='rgb('+Math.round(v*.84)+','+(v+15)+','+Math.round(v*.62)+')';c.beginPath();c.ellipse(128+dx*103,128+dy*97,3+rng()*6,2+rng()*5,rng()*3,0,Math.PI*2);c.fill();}
    }));tex.alphaTest=.42;tex.side=T.DoubleSide;foliage=tex;
  }
  const g=group(p,x,0,z);g.scale.setScalar(size);
  rod(g,'#6f6755',[0,0,0],[.05,1.8,0],.095,.055);
  for(let i=0;i<5;i++){const a=i*2.4,v=Math.sin(a)*.48,b=Math.cos(a)*.48;
    rod(g,'#736c59',[0,.94,0],[v,1.95,b],.048,.02);
    const k=group(g,v,2.12+(i%2)*.18,b,a);panel(k,foliage,0,0,0,1.85,1.65);}
}
function letter(p,txt,x,y,z,w,h){label(p,txt,x,y,z,w,h,'#374a43','#f4efd9',{size:.76});}
function light(p,x,z,h=3){
  cyl(p,steel,x,h*.5,z,.035,.055,h,8);box(p,steel,x+.15,h,z,.44,.07,.12);box(p,lit,x+.18,h-.047,z,.28,.014,.09);
}
function opera(p){
  const g=facade(p,'opera',-10.5,23.9,10.2,5.3,4.2);
  for(let i=0;i<5;i++){const x=-4+i*2;
    const pot=cyl(g,stone,x,5.53,0,.36,.53,.39,24);pot.scale.z=.8;
    cyl(g,'#647e61',x,5.74,0,.34,.34,.035,24);}
  plank(p,-10.5,27.1,11.8,2.2);
  box(p,'#81a4a9',-11,.116,27.65,6.7,.02,.72);
  for(let j=0;j<5;j++)box(p,'#9cb5b2',-13+j,.134,27.66,.57,.01,.035);
}
function church(p){
  const g=group(p,-14,0,49);turf(g,0,0,10,9);plank(g,0,3.4,1.1,4.15);
  const gold=art('chapel');gold.side=T.DoubleSide;
  for(const side of [-1,1])for(const end of [-1,1]){
    const v=[],uv=[],faces=[],nx=12,ny=24;
    for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const t=j/ny,s=i/nx;
      v.push(side*(.092+2.77*Math.pow(1-t,1.52)),.10+t*(5.15+.60*s),end*(.052+s*(2.28+.43*t)));
      uv.push(s,t);if(i&&j){const a=j*(nx+1)+i;faces.push(a-1,a-nx-2,a,a,a-nx-2,a-nx-1);}}
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(v,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(faces);geo.computeVertexNormals();mesh(g,geo,gold);
  }
  const face=new T.Shape();face.moveTo(-2.59,.08);for(let i=0;i<=24;i++){let t=i/24;face.lineTo(-.08-2.6*(1-t)**1.52,.1+t*5.51);}
  for(let i=24;i>=0;i--){let t=i/24;face.lineTo(.08+2.6*(1-t)**1.52,.1+t*5.51);}face.closePath();
  mesh(g,new T.ShapeGeometry(face),new T.MeshStandardMaterial({color:'#43534c',side:T.DoubleSide}),0,0,2.24);
  for(let j=-4;j<=4;j++)box(g,'#82765a',j*.42,.60,2.26,.028,1.12,.03);
  rod(g,steel,[0,5.52,2.28],[0,6.34,2.28],.023);rod(g,steel,[-.18,6.06,2.28],[.18,6.06,2.28],.023);
  for(const [x,z] of [[-4,-2],[4.1,-2.6],[-4,2]])tree(g,x,z,1.14);
}
function lake(p){
  const g=group(p,-27,0,49);turf(g,0,0,13,11);
  const water=new T.MeshStandardMaterial({color:'#587d77',metalness:.17,roughness:.29});
  const pond=cyl(g,water,0,.068,.8,1,1,.045,64);pond.scale.set(5.94,1,4.43);
  for(let k=0;k<2;k++){
    const x=(k-.5)*2.5;box(g,'#b5a18c',x,.35,0,2.8,.21,1.98);
    for(const ex of [-1,1])for(const ez of [-1,1])box(g,white,x+ex*1.18,1.1,ez*.84,.091,1.45,.091);
    const roof=cyl(g,'#9c4936',x,2.22,0,.57,1.57,.80,4);roof.rotation.y=Math.PI/4;roof.scale.z=.78;
    for(const z of [-.80,.80]){box(g,'#a65d4e',x,.93,z,2.46,.053,.04);for(let i=0;i<9;i++)box(g,white,x-1.17+i*.292,.73,z,.032,.40,.03);}
  }
  panel(g,art('lake'),0,1.24,-.25,4.92,1.74);
  box(g,'#a8967d',3.85,.38,0,3.2,.18,.70);
  for(const s of [-1,1]){box(g,'#ac5748',3.86,.80,s*.35,3.21,.057,.05);for(let i=0;i<7;i++)box(g,white,2.31+i*.51,.57,s*.35,.045,.50,.045);}
  for(let i=0;i<4;i++)tree(g,-4.6+i*2.9,-3.6,1.12+i%2*.19);
  const ripples=group(g);for(let i=0;i<18;i++){const a=i*2.4;box(ripples,'#91aaa0',Math.sin(a)*3.9,.098,1.6+Math.cos(a)*1.8,.18+i%5*.09,.008,.012);}
  animate(ripples,t=>ripples.position.x=.08*Math.sin(t*.56));
}
function ballpark(p){
  const g=group(p,.35,0,48);turf(g,0,0,11.4,9.7);
  const clay=box(g,'#ad7958',0,.10,1.02,3.44,.045,3.44);clay.rotation.y=Math.PI/4;
  const grass=box(g,'#758f64',0,.132,1.02,1.94,.022,1.94);grass.rotation.y=Math.PI/4;
  for(const [x,z] of [[0,3.2],[-2.2,1],[2.2,1],[0,-1.2]])box(g,white,x,.16,z,.13,.02,.13);
  for(const side of [-1,1])rod(g,white,[0,.16,3.24],[side*4.52,.16,-1.28],.019);
  for(let i=0;i<15;i++){const a=-2.68+i*.383;const row=group(g,4.85*Math.sin(a),0,4.3*Math.cos(a),a+Math.PI);
    box(row,'#828d86',0,.63,0,1.91,1.25,.84);const seat=panel(row,art('seats'),0,.76,.51,1.93,1.21);seat.rotation.x=-.45;
    box(row,'#586561',0,1.31,-.30,1.98,.062,.65);}
  for(const sx of [-1,1])for(const sz of [-1,1]){const x=sx*4.75,z=sz*3.4;rod(g,steel,[x,0,z],[x,3.8,z],.052);
    box(g,steel,x,3.9,z,1.02,.43,.09);for(let i=0;i<5;i++)box(g,lit,x-.39+i*.19,3.91,z+.06,.11,.17,.032);}
  letter(g,'洲際棒球場',0,1.80,-3.9,2.20,.51);
  for(const [x,z] of [[0,.8],[0,3.1],[2.22,1.05],[-2.33,.93],[1.2,-1.77]]){const h=person(g,x,.15,z,x+.7,'#ddd9bd','sport');h.root.scale.setScalar(.56);}
}
function park(p){
  const g=group(p,20,0,22);turf(g,0,0,12,9.5);plank(g,-1,.47,.89,8);
  for(let j=0;j<12;j++){const a=j*2.39;tree(g,Math.sin(a)*4.85,Math.cos(a)*3.58,.74+j%3*.17);}
  const stage=group(g,1.5,0,-.4);box(stage,stone,0,.2,0,3.9,.34,1.95);
  for(let i=0;i<6;i++){
    const z=-1+i*.39;const pts=[];for(let k=0;k<=12;k++){const a=k*Math.PI/12;pts.push([2.24*Math.cos(a),.30+1.94*Math.sin(a),z]);}
    tube(stage,'#c4c8bd',pts,.044);
    if(i===0||i===5)tube(stage,white,pts,.072);
  }
  for(let i=0;i<4;i++)box(g,'#a1a890',1.35,.13+i*.07,1.47+i*.34,4.48,.12,.30);
  const jog=person(g,-1,.11,0,0,'#ab725d','sport');animate(jog.root,t=>{const a=t*.29;jog.root.position.set(-1+Math.sin(a)*.35,.11,Math.cos(a)*2.62);jog.root.rotation.y=Math.atan2(.35*Math.cos(a),-2.62*Math.sin(a));jog.legs.forEach((l,i)=>l.rotation.x=.55*Math.sin(t*6+i*Math.PI));});
}
function temple(p){
  const g=facade(p,'temple',13,48.6,8.5,4.25,4);
  for(const s of [-1,1]){const roof=box(g,'#a7673e',0,4.46,s*.84,8.45,.17,2.14);roof.rotation.x=s*.28;
    for(let j=-2;j<=2;j++)oval(g,'#a94a36',j*1.54,2.35,2.18,.13,.18,.13);}
  plank(g,0,3.56,8.4,3.25);
  const shrine=group(g,0,.16,3.72);facade(shrine,'palanquin',0,0,1.19,1.15,.93);
  box(shrine,'#a77b40',0,.08,0,1.35,.13,1.10);
  for(const s of [-1,1])rod(shrine,'#654337',[s*.50,.25,-1.54],[s*.50,.25,1.54],.035);
  const cap=cyl(shrine,'#af452d',0,1.36,0,.20,.91,.38,4);cap.rotation.y=Math.PI/4;oval(shrine,'#d5ab52',0,1.61,0,.074,.099,.074);
  for(const x of [-.59,.59])for(const z of [-.47,.47]){const tassel=group(shrine,x,1.17,z);cyl(tassel,'#d5ab52',0,-.1,0,.026,.042,.20,8);animate(tassel,t=>tassel.rotation.z=.11*Math.sin(t*2+x));}
}
function market(p){
  const g=group(p,26.5,0,49);
  for(const side of [-1,1])for(let j=0;j<4;j++){
    const z=-4.55+j*2.70;const shop=group(g,side*2.48,.10,z,-side*Math.PI/2);
    facade(shop,'shop'+(j+(side>0?1:0))%4,0,-1.75,2.75,3.6,2.2);
    const m=art((j+(side===1?1:0))%2?'grill':'fried');
    const f=panel(shop,m,0,.90,.12,2.28,1.8);f.material.emissiveIntensity=.35;
    box(shop,steel,0,.68,.27,2.25,.065,.37);
    const canopy=box(shop,j%2?'#986b50':'#526961',0,1.87,.24,2.45,.085,.87);canopy.rotation.x=.11;
    for(const x of [-1.05,1.05])rod(shop,steel,[x,0,.55],[x,1.82,.55],.016);
    for(let i=0;i<5;i++)oval(shop,lit,-.85+i*.42,1.74,.61,.038,.056,.038);
  }
  const gantry=group(g,0,0,5.45);for(const x of [-2.49,2.49])box(gantry,steel,x,1.69,0,.11,3.35,.11);
  label(gantry,'逢 甲 夜 市',0,3.22,.09,4.95,.60,'#723d32','#ffe6a7',{rule:true});
  for(let j=0;j<5;j++){const h=person(g,-.85+(j%2)*1.56,.03,-3.1+j*1.33,j%2?1.51:-1.27,['#67796c','#93715b','#657780'][j%3],'read');animate(h.head,t=>h.head.rotation.y=.22*Math.sin(t*.72+j));}
}
function institutions(p){
  const mall=facade(p,'mall',-27,24.0,10.1,7.1,5.8);box(mall,glass,0,1.46,3.32,6,.11,1.02);
  const lin=facade(p,'hotel',1.5,23.2,6.9,11.15,4.0);
  facade(lin,'mall',0,0,7.65,1.70,4.9);label(lin,'THE LIN',0,10.75,2.025,2.26,.47,'#344347','#eedeb4');
  box(lin,'#ada699',0,1.49,2.75,4.6,.15,1.16);
  const h=facade(p,'hospital',38.3,48.4,8.8,5.10,3.75);
  facade(h,'hospital',-.73,-2.32,6.1,6.15,2.7);
  box(h,'#5e7978',0,1.04,2.26,2.34,.10,1.04);
  for(const s of [-1,1])rod(h,steel,[s*.94,0,2.62],[s*.94,1.02,2.62],.037);
  label(h,'臺中榮民總醫院',0,4.83,1.91,3.69,.39,'#c9c9b9','#283d43');
  const fab=facade(p,'fab',53,48.2,10.5,4.10,4.9);
  facade(fab,'fab',1,-3.81,8.2,5.20,3.3);
  label(fab,'台積電　中科廠區',1.6,1.74,2.48,3.1,.4,'#d7dcdb','#4b5456');
  for(let j=0;j<8;j++){cyl(fab,'#a7b2b3',-4.22+j*1.16,4.38,-.65,.28,.29,.62,18);cyl(fab,steel,-4.22+j*1.16,4.71,-.65,.21,.21,.052,18);}
  plank(p,47.0,52.6,3.8,1.8);const monument=group(p,46.7,.11,52.2);
  box(monument,stone,0,.58,0,2.82,1.06,.34);letter(monument,'中部科學園區',0,.67,.18,2.54,.46);
  for(let j=0;j<5;j++)tree(p,43.4+j*2.90,53.5,.70);
}
function bus(p,x,z,s){
  const g=group(p,x,.075,z,s<0?Math.PI:0);
  box(g,'#dce6e3',0,.72,0,3.57,1.12,.86,true);
  box(g,'#407c7a',0,.32,0,3.61,.27,.88,true);box(g,'#c9ccc3',.26,1.33,0,1.65,.12,.59,true);
  for(const side of [-1,1]){for(let j=0;j<6;j++)box(g,'#405b62',-1.37+j*.47,.89,side*.438,.40,.48,.022);
    for(const ex of [-1.11,1.10]){let hub=cyl(g,'#333937',ex,.24,side*.414,.228,.228,.13,20);hub.rotation.x=Math.PI/2;hub=cyl(g,'#919c94',ex,.24,side*.482,.115,.115,.016,16);hub.rotation.x=Math.PI/2;}}
  const front=group(g,1.80,.81,0,Math.PI/2);box(front,'#374b50',0,0,0,.78,.53,.025);
  label(front,'臺灣大道',0,.345,.027,.72,.16,'#242c29','#ffce77');for(const side of [-1,1])oval(front,lit,side*.28,-.37,.055,.075,.036,.018);
  return g;
}
function transit(p){
  const z=35;box(p,'#666c69',9,.027,z,96,.051,7.0);
  for(const zz of [32,34.9,37.9])for(let i=-38;i<55;i+=3.9)box(p,'#d7d6c3',i,.061,zz,1.62,.012,.067);
  for(const [x,zz] of [[-17,34.9],[31,34.9]]){
    box(p,'#b7b9ae',x,.13,zz,5.65,.23,1.02,true);for(const ex of [-1.8,1.8])box(p,steel,x+ex,.99,zz,.086,1.67,.10);
    box(p,'#b0b7ad',x,1.86,zz,5.80,.12,1.30,true);letter(p,'臺灣大道　公車專用道',x,1.66,zz+.56,3.32,.24);
    for(let j=0;j<3;j++){box(p,steel,x-1+j*.73,.52,zz,.60,.063,.34);}}
  const coach=bus(p,0,35.95,1),other=bus(p,0,33.62,-1);
  // Smooth arrivals with a dwell at each boarding island. Wrap at the distant end of the model.
  function position(t,stop,lo,hi){
    const distance=hi-lo,cycle=distance/2.5+6,phase=t%cycle,arrival=(stop-lo)/2.5;
    if(phase<=arrival)return lo+phase*2.5;
    if(phase<arrival+6)return stop;
    return stop+(phase-arrival-6)*2.5;
  }
  animate(coach,t=>coach.position.x=position(t+9,-17,-39,56));animate(other,t=>other.position.x=-position(t+12,-31,-56,39));
  // A separate north–south viaduct crosses the boulevard beside the forest park.
  for(const x of [22.35,23.18]){box(p,'#b3b8af',x,3.52,30,.80,.34,29);
    for(const d of [-.24,.24])box(p,'#716f63',x+d,3.73,30,.045,.075,29);}
  for(let j=0;j<6;j++){const zz=16.5+j*5.43;box(p,'#a8aea5',22.77,1.67,zz,.56,3.38,.63,true);box(p,'#b5b9af',22.77,3.26,zz,1.92,.32,.69,true);}
  const train=group(p,22.37,3.72,30);
  for(const shift of [-1.48,1.48]){const car=group(train,0,0,shift);box(car,'#e4e8df',0,.49,0,.73,.91,2.83,true);
    for(const side of [-1,1]){box(car,'#6caa55',side*.365,.26,0,.028,.14,2.72);for(let j=0;j<6;j++)box(car,'#46616a',side*.37,.59,-1.14+j*.45,.033,.37,.37);}
    for(const side of [-1,1])box(car,'#394f58',0,.58,side*1.41,.63,.49,.03,true);}
  animate(train,t=>train.position.z=30+10.7*Math.sin(.14*t-.6));
  for(const s of [-1,1]){box(p,'#b3b9aa',22.77+s*1.05,3.66,21.8,.69,.20,5.0);box(p,'#97a697',22.77+s*.82,5.08,21.8,1.04,.12,5.3);}
  letter(p,'文心森林公園站',22.79,4.59,24.25,1.98,.32);
  for(let j=0;j<8;j++)light(p,-34+j*12.1,38.6);
}
export function buildCity(scene){
  const p=group(scene);
  for(const z of [28.6,39.4,57.5])plank(p,10,z,98,1.25);
  for(const x of [-33,7.3,44.1])plank(p,x,40.8,.99,34.5);
  // Mid-rise city blocks tie the boulevard and the destinations together in the distance.
  for(let j=0;j<12;j++){
    const x=-43+j*7.8;const h=[7.2,9.8,6.6,11.2,7.8][j%5];
    facade(p,j%4===1?'hotel':'shop'+j%4,x,64.7,5.8,h,3.7);
    if(j%3!==0)facade(p,'shop'+((j+1)%4),x+1.5,72,5.7,h+2.8,4);
  }
  // Taller Taichung blocks sit beyond the vanishing point of the old street.
  for(let j=0;j<5;j++)if(j!==2)facade(p,j%2===0?'hotel':'mall',49+j%2*4,-5+j*4.7,3.8,8.3+(j%3)*2.5,3.6);
  for(const [x,z] of [[-21,43],[-7,42],[8,42],[19,41],[32,43],[44,43],[-31,61],[-19,61],[-8,61],[5,61],[18,61],[32,61],[45,61]]){
    turf(p,x,z,3.2,1.8);tree(p,x,z,.85);
  }
  institutions(p);opera(p);church(p);lake(p);ballpark(p);temple(p);park(p);market(p);transit(p);
  for(const x of [-32.1,-22,-16,-5.1,6.2,10.1,29.5,36.8])tree(p,x,28.2,.77);
  animate(null,()=>lit.color.set(air.night>.5?'#ffd798':'#eee1bc'));batch(p);return p;
}
