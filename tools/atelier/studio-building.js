import {storeAction,retailFixtures,chilledItem,packageFace} from './store-visit.js';
import {T,group,box,rod,oval,cyl,hoop,label,panel,painted,makeCanvas,animate} from './craft.js';
import {softbox,cameraSlider} from './equipment.js';
import {person} from './ensemble.js';
const steel='#566978',silver='#c1d0d7',navy='#243954',light=new T.MeshBasicMaterial({color:'#e5f9ff'});
const glass=new T.MeshPhysicalMaterial({color:'#9dc9d2',roughness:.13,metalness:.08,transparent:true,opacity:.13,side:T.DoubleSide,depthWrite:false});
function divider(p,x,z,length,height){
  box(p,glass,x,height/2,z,.025,height,length);
  for(const s of [-1,1])box(p,steel,x,height/2,z+s*length/2,.052,height,.044);
  for(const y of [.065,.70,height-.025])box(p,y===.70?silver:steel,x,y,z,.037,.026,length);
}
export function slabWithOpening(p,y,depth){
  // Cut out the stair flights on the east side, leaving a continuous landing at the front.
  box(p,'#a9b8c2',-.57,y,0,2.90,.048,depth);
  box(p,'#a9b8c2',1.45,y,-.78,1.20,.048,1.02);
  box(p,'#a9b8c2',1.45,y,1.205,1.20,.048,.25);
}
function steps(p){
  const g=group(p,0,.245,0),rise=2.485/18,run=1.36/9;
  for(let i=0;i<18;i++){
    const returning=i>=9,k=i%9,x=returning?1.72:1.10,z=returning?.98-k*run:-.23+k*run;
    box(g,'#bfcbd2',x,(i+1)*rise,z,.53,.072,run+.025);
    box(g,'#e7dbad',x,(i+1)*rise+.038,z+(returning?1:-1)*run*.42,.49,.008,.024);
  }
  box(g,silver,1.41,9*rise,1.16,1.16,.075,.29);
  for(const [x,z1,y1,z2,y2] of [[.82,-.29,.06,1.0,1.24],[1.99,1.0,1.24,-.29,2.49]]){
    rod(g,steel,[x,y1+.48,z1],[x,y2+.48,z2],.018);
    for(let k=0;k<4;k++){const u=k/3,z=z1+(z2-z1)*u,y=y1+(y2-y1)*u;rod(g,steel,[x,y,z],[x,y+.48,z],.009);}
  }
}
export let productionLight;
export function upperStudio(house,art){
  steps(house);const f=group(house,0,2.73,0),back=-1.26;
  slabWithOpening(f,0,2.62);
  box(f,'#57697c',0,.91,back,4.04,1.82,.064);
  for(const side of [-1,1])box(f,'#8095a2',side*2.0,.89,0,.044,1.78,2.54);
  divider(f,.33,-.36,1.77,1.72);
  for(const x of [-1.86,-.08,.52,1.86])box(f,light,x,1.66,-.15,.032,.018,2.0);
  productionLight=new T.PointLight('#ffe8d2',3.6,4.1,2);
  productionLight.position.set(.12,1.44,.53);productionLight.visible=false;f.add(productionLight);
  // Fabric acoustic panels have alternating weave and recessed joints.
  const fabric=painted(makeCanvas(256,128,(c,w,h)=>{
    c.fillStyle='#626c79';c.fillRect(0,0,w,h);
    for(let y=0;y<h;y+=3){c.fillStyle=y%2?'#818790':'#56616c';c.fillRect(0,y,w,1);}
    c.fillStyle='#9b9f9d55';for(let x=0;x<w;x+=3)c.fillRect(x,0,1,h);
  }));
  for(let j=0;j<3;j++)for(let i=0;i<6;i++){
    const x=.46+i*.26,y=.38+j*.385;
    box(f,steel,x,y,-1.08,.23,.33,.07,true);
    panel(f,fabric,x,y,-1.039,.213,.308);
  }
  // Soft sweep, practical fixtures and a suspended boom in the recording bay.
  const sweep=new T.Shape();sweep.moveTo(-1.2,1.42);sweep.lineTo(-1.16,.26);sweep.quadraticCurveTo(-1.16,.02,-.91,.02);sweep.lineTo(-.38,.02);sweep.lineTo(-.38,.0);sweep.lineTo(-1.21,0);sweep.closePath();
  const geo=new T.ExtrudeGeometry(sweep,{depth:1.86,bevelEnabled:false});geo.rotateY(-Math.PI/2);
  const cyc=new T.Mesh(geo,new T.MeshStandardMaterial({color:'#477690',roughness:.88,side:T.DoubleSide}));cyc.position.x=.08;f.add(cyc);
  label(f,'錄影棚',-.84,1.42,back+.07,.80,.18,'#364c65','#eff8ff');
  const key=group(f,-1.64,.04,-.31,.68);key.scale.setScalar(.84);softbox(key,0,0,0);
  const tripod=group(f,-1.34,0,.45,Math.PI+.39);
  for(let i=0;i<3;i++)rod(tripod,steel,[0,.57,0],[.22*Math.sin(i*2.094),.03,.22*Math.cos(i*2.094)],.014);
  cameraSlider(tripod,0,.57,0);
  rod(f,steel,[-.15,1.68,.05],[-.66,1.31,-.58],.014);
  oval(f,navy,-.65,1.29,-.58,.059,.082,.052);
  const presenter=person(f,-.70,.035,-.68,.10,'#e5b69b','record');presenter.root.scale.setScalar(1.21);
  animate(presenter.body,t=>{presenter.head.rotation.y=.19*Math.sin(t*.70);presenter.arms[1].rotation.x=-.56-.58*(.5+.5*Math.sin(t*1.24));presenter.elbows[1].rotation.x=-.53;});
  // The booth is deep enough to see the microphones in front of the acoustic diffusers.
  for(let i=0;i<21;i++){const x=.43+i*.074;box(f,i%3?'#718192':'#566579',x,.90,back+.07,.037,1.30,.05+.07*Math.sin(i*1.4)**2);}
  label(f,'收音室',1.18,1.45,back+.31,.68,.17,navy,'#edf6fa');
  box(f,'#8a9aa8',1.20,.52,-.77,1.23,.060,.54,true);
  for(const x of [.69,1.68])box(f,steel,x,.26,-.77,.044,.52,.38);
  for(const x of [.72,1.65]){
    cyl(f,steel,x,.565,-.63,.083,.086,.024,16);rod(f,steel,[x,.57,-.63],[x,.87,-.63],.013);
    rod(f,steel,[x,.87,-.63],[x+.13,.96,-.76],.012);oval(f,navy,x+.13,.926,-.76,.042,.072,.047);
    hoop(f,steel,x+.14,.93,-.70,.047,.006);
  }
  const console=group(f,1.19,.56,-.78);
  box(console,navy,0,0,.04,.43,.026,.16,true);
  for(let j=0;j<7;j++){box(console,silver,(j-3)*.052,.021,.04,.008,.006,.088);box(console,'#e0b17c',(j-3)*.052,.034,.04+.027*Math.sin(j*2),.026,.016,.028,true);}
  const boomArm=group(f,1.66,.53,-.94);rod(boomArm,navy,[0,0,0],[.05,.43,0],.015);
  rod(boomArm,steel,[.05,.43,0],[-.23,.52,0],.014);oval(boomArm,navy,-.235,.48,0,.04,.065,.041);
  box(f,silver,.65,.64,-.90,.043,.19,.035);box(f,navy,.65,.79,-.91,.34,.21,.031,true);
  panel(f,painted(makeCanvas(320,160,(c,w,h)=>{
    c.fillStyle='#182a3b';c.fillRect(0,0,w,h);
    for(let i=0;i<4;i++){c.fillStyle=['#84d4bd','#85b8e3','#dac791','#99afcf'][i];for(let x=12;x<w-12;x+=3){const a=2+11*Math.abs(Math.sin(x*.04+i)*Math.cos(x*.37));c.fillRect(x,23+i*36-a,2,a*2);}}
  }),true),.65,.79,-.89,.304,.18);
  const host=person(f,1.22,.04,-1.0,-.15,'#739ba4','mix');host.root.scale.setScalar(1.05);
  animate(host.head,t=>{host.head.rotation.y=.26*Math.sin(t*.65);host.arms[0].rotation.x=-.8-.25*Math.cos(t*1.53);});
  const strip=group(f,1.15,.588,-.56,-.08);
  box(strip,navy,0,0,0,.49,.036,.16,true);
  for(let i=0;i<8;i++){const level=box(strip,new T.MeshBasicMaterial({color:i<6?'#77d5af':'#f2b969'}),-.19+.053*i,.024,0,.027,.013,.088);animate(level,t=>level.scale.z=.025+.058*Math.abs(Math.sin(t*2.3+i*1.5)));}
}
export function receptionPartitions(p){
  for(const x of [-.57,.57])divider(p,x,-.86,.72,1.26);
  const floor=painted(makeCanvas(256,256,(c,w,h)=>{
    c.fillStyle='#acb7bf';c.fillRect(0,0,w,h);
    let seed=9;const rnd=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
    for(let i=0;i<5800;i++){const x=rnd()*w,y=rnd()*h;c.fillStyle=['#93a2ac','#c7d1d7','#98aab3','#dde0de'][i%4];c.beginPath();c.moveTo(x,y);c.lineTo(x+rnd()*2.6,y+.4);c.lineTo(x+.8,y+1.6);c.fill();}
  }));
  floor.map.wrapS=floor.map.wrapT=T.RepeatWrapping;floor.map.repeat.set(3,2);
  const tile=panel(p,floor,0,.068,0,4.02,2.58);tile.rotation.x=-Math.PI/2;
  for(const x of [-1.8,-.64,.64,1.8])box(p,'#9cacb9',x,.069,0,.006,.003,2.52);
  for(const x of [-1.59,-1.23]){const speaker=group(p,x,.30,-.92);
    box(speaker,navy,0,.36,0,.185,.32,.13,true);
    for(const [y,r] of [[.37,.052],[.46,.024]]){const cone=cyl(speaker,'#252d36',0,y,.071,r,r,.018,24);cone.rotation.x=Math.PI/2;}
  }
}
export const shopDoor={near:false};
function sevenMark(){
  const canvas=makeCanvas(384,384,c=>{
    c.fillStyle='#fffcee';c.fillRect(0,0,384,384);
    c.fillStyle='#12815c';c.fillRect(8,8,368,368);
    c.fillStyle='#fffcee';c.beginPath();c.moveTo(51,36);c.lineTo(338,36);c.lineTo(313,350);c.lineTo(75,350);c.fill();
    c.fillStyle='#f18334';c.fillRect(93,63,175,54);
    c.fillStyle='#d74731';c.beginPath();c.moveTo(271,64);c.lineTo(305,96);c.bezierCurveTo(239,154,196,240,187,319);c.lineTo(133,319);c.bezierCurveTo(148,224,199,127,271,64);c.fill();
    c.fillStyle='#fffcee';c.fillRect(70,176,252,46);
    c.fillStyle='#087b51';c.textAlign='center';c.textBaseline='middle';c.font='900 44px Arial,sans-serif';c.fillText('ELEVEN',194,202);
  });return painted(canvas,true);
}
export function cornerStore(parent){
  const g=group(parent,4.10,.22,1.26),w=3.13,d=2.20;
  box(g,'#c1c4bd',0,.036,0,w,.072,d);
  for(const s of [-1,1])box(g,'#d8ded8',s*w*.49,1.05,0,.075,2.10,d);
  box(g,'#dce3dd',0,1.03,-d*.49,w,2.04,.075);
  box(g,'#e9ede7',0,2.08,0,w+.10,.13,d+.15,true);
  const front=group(g,0,0,1.1);
  for(const s of [-1,1]){
    box(front,glass,s*1.0,.88,0,.92,1.60,.032);
    for(const x of [.54,1.44])box(front,silver,s*x,.87,0,.042,1.70,.052);
    box(front,silver,s*.99,.11,0,.97,.12,.058);
  }
  for(const [y,col] of [[1.76,'#087e55'],[1.83,'#e05235'],[1.9,'#e98137']]){
    box(front,col,0,y,.05,w+.065,.067,.16);box(g,col,-w*.5-.012,y,0,.043,.067,d);
  }
  box(front,'#f6f5e9',0,1.83,.15,1.20,.37,.075,true);
  label(front,'7-ELEVEN',0,1.83,.191,1.17,.32,'#fffbed','#007545',{size:.88});
  const blade=group(front,-1.47,1.78,.27,-.75);
  box(blade,'#e6eee5',0,0,0,.47,.50,.09,true);
  const mark=sevenMark();for(const side of [-1,1]){const logo=panel(blade,mark,0,0,side*.051,.44,.46);logo.rotation.y=side===1?0:Math.PI;}
  for(const x of [-.45,.45]){
    const door=group(front,x,.12,.014);
    box(door,glass,0,.72,0,.87,1.44,.032);
    for(const s of [-1,1])box(door,silver,s*.421,.72,.005,.025,1.46,.046);
    box(door,'#458d72',0,.73,.022,.86,.035,.014);
    let offset=0,lastTime=null;
    animate(door,t=>{
      const dt=lastTime===null?.016:Math.max(0,t-lastTime);lastTime=t;
      const target=Number(shopDoor.near||storeAction.passing);
      offset=dt===0?target:T.MathUtils.lerp(offset,target,1-Math.exp(-dt*8));
      door.position.x=x+Math.sign(x)*.73*offset;
    });
  }
  for(let j=0;j<3;j++){
    const x=-1.14+j*.76;box(g,navy,x,.85,-.97,.68,1.47,.14,true);
    for(let s=0;s<4;s++){const y=.29+s*.26;box(g,'#b8c5c9',x,y,-.78,.64,.031,.26);
      for(let k=0;k<6;k++){
        if(j===1&&s===2&&k===5)continue;
        chilledItem(g,j,s,k,x+(k-2.5)*.098,y,-.73);
      }
    }
    label(g,['鮮乳','茶飲','冷藏飲品'][j],x,1.50,-.566,.63,.097,'#19745b','#fff9dc');
    if(j!==1){box(g,glass,x,.86,-.57,.67,1.38,.024);box(g,silver,x+.28,.87,-.53,.014,.20,.019);}
  }
  box(g,'#b08b66',.91,.35,.18,1.01,.60,.34,true);box(g,'#e6ebe8',.91,.68,.18,1.09,.064,.41,true);
  box(g,navy,.80,.80,.21,.24,.18,.045,true);
  for(const x of [-.85,0,.85])box(g,light,x,1.97,0,.055,.026,1.65);
  // Front window coffee counter with ceramic cups, grinder and illuminated menu.
  const coffee=group(g,-1.20,0,.49,.12);
  box(coffee,'#b99774',0,.32,0,.54,.59,.49,true);box(coffee,'#e5e8df',0,.641,0,.60,.047,.52,true);
  box(coffee,'#424d50',-.03,.84,-.02,.38,.37,.29,true);
  box(coffee,'#b6c3bf',-.03,.90,.143,.32,.072,.058);
  for(const x of [-.095,.030]){cyl(coffee,'#575e5e',x,.84,.16,.020,.016,.065);cyl(coffee,'#f7e5cc',x,.718,.17,.045,.029,.075,12);}
  label(coffee,'CITY CAFÉ',-.024,.972,.133,.31,.067,'#3b4448','#f6ecd1');
  for(let i=0;i<5;i++)cyl(coffee,'#efe4d4',.22,.68+i*.026,.05,.044,.031,.056,14);
  // Packets on a low endcap sit below the sight line through the glass.
  for(let shelf=0;shelf<3;shelf++){
    const y=.22+shelf*.24;box(g,'#b0bdb6',-.78,y,.10,.76,.032,.27);
    for(let k=0;k<5;k++){const x=-1.08+k*.147,col=['#db9d58','#afbf6a','#e58b6b','#82b9be','#dec57e'][(k+shelf)%5];
      box(g,col,x,y+.09,.125,.11,.15,.067,true);panel(g,packageFace('snack',(k+shelf)%3),x,y+.09,.160,.102,.135);}
  }
  const warmer=group(g,1.17,.72,.15);
  box(warmer,'#6b7773',0,0,0,.37,.052,.25);
  for(let j=0;j<2;j++)for(let k=0;k<3;k++)oval(warmer,'#e4b274',(k-1)*.103,.052,j*.089-.04,.047,.043,.047);
  for(const dir of [-1,1])box(warmer,silver,dir*.17,.105,0,.014,.21,.23);
  box(warmer,glass,0,.095,.126,.35,.18,.015);box(warmer,'#dd9859',0,.206,0,.39,.033,.26);
  retailFixtures(g,glass);
  const clerk=person(g,.87,.08,-.11,-.31,'#68a68a','mix');clerk.root.scale.setScalar(1.26);storeAction.clerk=clerk;
  animate(clerk.head,t=>{
    const s=t%30,scan=T.MathUtils.smoothstep(s,15.1,16.4)-T.MathUtils.smoothstep(s,17.4,18.2);
    clerk.head.rotation.x=.12+.08*Math.sin(t*1.13)+scan*.24;clerk.head.rotation.y=-.47*scan;
    clerk.arms[1].rotation.x=-.55-.15*Math.sin(t*1.7)-scan*.59;
    clerk.arms[0].rotation.x=-.23-.22*(1+Math.sin(t*.96));
  });
}
