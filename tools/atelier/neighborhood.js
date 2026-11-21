import {T,group,box,panel,cyl,oval,rod,hoop,tube,label,painted,makeCanvas,drawNoise,contact,animate} from './craft.js';
import {person} from './street.js';
import {articulated,gait} from './taiwan-life.js';
import {air} from './atmosphere.js';

const pine='#785643',cream='#ede4ca',steel='#63766e',ink='#263e3b';
const lamp=new T.MeshBasicMaterial({color:'#ffeabb'});
const lerp=T.MathUtils.lerp;
const smooth=v=>T.MathUtils.smoothstep(v,0,1);
function building(row,x,w,h,sign,accent,sideDoor=false){
  const g=group(row,x,.13,.46),d=3.1;
  box(g,'#cbbba0',0,h/2,-1.30,w,h,.20);
  for(const side of [-1,1]){
    const xx=side*(w/2-.08);
    if(side===-1&&sideDoor){
      box(g,cream,xx,h/2,-.86,.16,h,1.17);box(g,cream,xx,h/2,1.40,.16,h,.50);
      box(g,cream,xx,2.47,.45,.16,1.62,1.45);
    }else box(g,cream,xx,h/2,.11,.16,h,d);
  }
  box(g,'#b0a99a',0,.045,.1,w,.09,d);
  box(g,'#b19b7c',0,h-.04,.08,w+.16,.16,d+.19);
  box(g,accent,0,h-.36,1.52,w+.10,.59,.16);
  label(g,sign,0,h-.36,1.613,w-.3,.49,accent,'#fff1cf',{size:.81});
  for(const s of [-1,1])box(g,steel,s*(w*.42),h-.71,1.05,.055,.09,.82);
  box(g,cream,0,h-.67,1.66,w+.22,.10,.68);
  for(let i=0;i<3;i++)box(g,lamp,(i-1)*w*.30,h-.732,1.72,.63,.018,.07);
  return g;
}
function upperFloor(row,x,width,height,art,variant){
  const g=group(row,x,height+.13,.45),top=variant===2?1.10:1.46;
  box(g,'#c4ab8c',0,top/2,-.06,width-.04,top,2.90);
  panel(g,art['wall'+variant],0,top/2,1.402,width-.10,top,[.04,.50,.96,.97]);
  for(const side of [-1,1]){
    const wall=panel(g,art['wall'+variant],side*(width/2-.01),top/2,-.06,2.90,top,[.10,.50,.9,.97]);wall.rotation.y=side*Math.PI/2;
  }
  box(g,'#756856',0,top+.04,-.06,width+.22,.12,3.1);
  if(variant===2){
    for(let k=0;k<6;k++)box(g,'#82684e',-1.6+k*.61,.40,1.46,.054,.80,.085);
  }else{
    box(g,steel,1.47,.45,1.49,.61,.32,.19,true);
    for(let k=0;k<7;k++)box(g,'#b8b9aa',1.23+k*.072,.44,1.595,.022,.20,.012);
    tube(g,'#827d66',[[1.79,.40,1.51],[1.98,.38,1.51],[1.99,-.42,1.51]],.021);
  }
}
function interiorArt(p,kind){
  const art=painted(makeCanvas(640,300,(g,w,h)=>{
    const fruit=kind==='fruit';g.fillStyle=fruit?'#edddae':'#efebe0';g.fillRect(0,0,w,h);
    g.fillStyle=fruit?'#516b4e':'#3f726e';g.fillRect(0,0,w,18);
    g.font='bold 50px sans-serif';g.fillText(fruit?'當季鮮果':'社區健康照護',26,88);
    g.font='25px sans-serif';g.fillText(fruit?'產地直送　每日選果':'定期健檢　預防保健',28,143);
    for(let i=0;i<4;i++){g.fillStyle=fruit?'#a2976b':'#acc6bc';g.fillRect(29,182+i*17,200-i*22,4);}
    if(fruit){
      for(let i=0;i<8;i++){
        const x=378+(i%4)*55,y=115+Math.floor(i/4)*71;
        g.fillStyle=['#cc8944','#b56346','#839258','#d6a350'][i%4];g.beginPath();g.ellipse(x,y,36,37,.2*i,0,Math.PI*2);g.fill();
        g.fillStyle='#567249';g.beginPath();g.ellipse(x+10,y-37,15,5,-.6,0,Math.PI*2);g.fill();
      }
    }else{
      g.strokeStyle='#a95b4f';g.lineWidth=6;g.beginPath();g.moveTo(325,145);for(const pt of [[366,145],[380,117],[400,172],[420,80],[439,145],[472,145],[487,124],[501,145],[601,145]])g.lineTo(...pt);g.stroke();
    }
  }));
  panel(p,art,kind==='fruit'?.40:-.72,1.49,-1.165,kind==='fruit'?2.34:1.57,kind==='fruit'?1.06:.77);
}
function clinic(row){
  const p=building(row,10.65,4.55,3.28,'日和家庭醫學診所','#286c71',true);
  interiorArt(p,'clinic');
  box(p,'#96b6ad',0,.56,-1.17,4.35,1.02,.06);
  box(p,'#7d9d93',.83,.36,-.52,1.67,.68,.54,true);
  box(p,cream,.83,.72,-.52,1.76,.066,.60);
  box(p,ink,.75,.87,-.46,.32,.21,.045,true);
  label(p,'掛號',1.33,.48,-.24,.50,.21,'#728f83',cream);
  for(let i=0;i<3;i++){
    const x=-1.62+i*.45;
    box(p,'#6d9495',x,.35,.22,.40,.075,.40,true);box(p,'#698c8b',x,.55,.02,.4,.35,.055,true);
    for(const s of [-1,1])rod(p,steel,[x+s*.13,.02,.22],[x+s*.13,.32,.22],.024);
  }
  const worker=person(p,1.31,.06,-.91,.16,'#85b1ac','uniform');worker.root.scale.setScalar(1.13);
  box(worker.body,'#f3e9c8',-.058,.206,.099,.055,.075,.012);
  animate(worker.head,t=>{worker.head.rotation.y=.29*Math.sin(t*.75);worker.head.rotation.x=.13*Math.cos(t*.61);});
  for(const x of [-2.02,-.63])box(p,'#8eaaa4',x,1.15,1.43,.045,2.28,.065);
  box(p,steel,-1.33,.14,1.43,1.4,.045,.068);
  box(p,'#769c97',-1.33,.80,1.44,1.38,.055,.065);
  const sign=group(p,-2.17,2.12,1.62,-Math.PI/2);
  box(sign,'#f2edd9',0,0,0,.55,.65,.10,true);
  for(const side of [-1,1]){
    box(sign,'#388d73',0,0,side*.059,.36,.113,.016);
    box(sign,'#388d73',0,0,side*.062,.115,.39,.014);
  }
  label(p,'看診中　08',1.18,1.78,-1.13,1.12,.27,'#244b41','#f4c57e');
  for(let j=0;j<4;j++){box(p,steel,1.80,1.02+j*.19,-1.02,.44,.022,.23);for(let k=0;k<3;k++)cyl(p,k%2?cream:'#a3b9a2',1.65+k*.135,1.10+j*.19,-1.01,.041,.045,.134,10);}
  tube(worker.body,'#3b4e4a',[[-.05,.28,.072],[-.07,.19,.105],[-.01,.15,.106],[.07,.23,.082],[.055,.28,.066]],.007);
}
function grocery(row){
  const g=building(row,15.6,5.08,3.42,'日日鮮　生鮮超市','#9b513c');
  label(g,'蔬果　｜　米糧　｜　日用品',0,1.91,-1.16,3.62,.32,'#9b593a','#ffe9c4');
  for(let j=0;j<4;j++){
    const x=-1.83+j*.28;box(g,'#507268',x,.24,1.42,.25,.38,.35,true);
    for(let k=0;k<3;k++)box(g,'#a0b6a3',x,.15+k*.08,1.601,.19,.015,.012);
  }
  const goods=['#cd8158','#8c9e78','#e0b76d','#99b4b4','#ca8d79'];
  for(const x of [-1.40,.12,1.63]){
    for(let tier=0;tier<3;tier++){
      const y=.25+tier*.41;
      box(g,pine,x,y,-.45,1.37,.058,.68);
      for(let j=0;j<6;j++){
        const xx=x+(j-2.5)*.203;
        box(g,goods[(j+tier+Math.round(x+3))%5],xx,y+.153,-.32,.153,.245,.16,true);
        box(g,cream,xx,y+.167,-.231,.11,.053,.012);
      }
      box(g,'#c08b55',x,y-.02,-.09,1.36,.066,.024);
    }
  }
  for(const side of [-1,1]){const post=group(g,2.04*side,.03,1.40);box(post,steel,0,1.25,0,.055,2.5,.065);}
  const cashier=person(g,-1.64,0,.54,0,'#a77848','uniform');animate(cashier.arms[0],t=>cashier.arms[0].rotation.x=-.55+.27*Math.sin(t*1.4));
  box(g,'#597a69',-1.65,.36,.96,.99,.65,.51,true);box(g,cream,-1.65,.70,.96,1.06,.061,.55);
}
function fruitShop(row){
  const p=building(row,21.2,4.55,2.75,'阿春青果行','#426647');
  interiorArt(p,'fruit');
  for(const side of [-1,1])rod(p,pine,[side*2.13,.03,2.17],[side*2.13,2.02,2.17],.025);
  for(let j=0;j<13;j++){const strip=box(p,j%2?'#d9bb79':'#849261',(j-6)*.36,2.00,1.88,.36,.05,.70);strip.rotation.x=.18;}
  for(let tier=0;tier<2;tier++)for(let j=0;j<4;j++){
    const x=-1.39+j*.90,y=.34+tier*.26,z=1.64-tier*.52;
    box(p,pine,x,y,z,.84,.16,.47);
    for(let r=0;r<7;r++){
      const xx=x+(r%4-1.5)*.181+(r>=4?.07:0),zz=z+(r>=4?-.096:.102),yy=y+.16;
      const fruit=oval(p,['#e39b43','#96a85e','#c06a54','#e4bf55'][j],xx,yy,zz,.085,j===3?.114:.089,.079);
      if(j===3)fruit.rotation.z=.54;
      rod(p,'#5b7051',[xx,yy+.070,zz],[xx+.008,yy+.105,zz],.007);
    }
    label(p,['柳丁','芭樂','蘋果','芒果'][j],x,y+.02,z+.247,.40,.13,'#e5c892','#343e31');
  }
  const seller=person(p,.39,.02,.32,0,'#8c9170','uniform');
  animate(seller.arms[1],t=>seller.arms[1].rotation.x=-.58+.33*Math.sin(t*1.38));
  box(p,steel,-1.82,.58,.73,.46,.15,.33,true);cyl(p,cream,-1.82,.69,.73,.19,.13,.08,16);
}
function parcel(p,x,y,z){
  box(p,'#bd966a',x,y,z,.35,.24,.32);box(p,'#e6c58c',x,y+.123,z,.065,.008,.322);
  box(p,cream,x+.066,y,z+.163,.102,.065,.009);
}
function deliveries(row){
  const g=group(row);const cart=group(g);cart.userData.moves=true;
  box(cart,steel,0,.13,.02,.47,.074,.69,true);
  for(const side of [-1,1]){
    rod(cart,steel,[side*.18,.14,-.25],[side*.18,.60,-.29],.017);
    for(const z of [-.20,.25])cyl(cart,ink,side*.199,.067,z,.061,.061,.048,12).rotation.z=Math.PI/2;
  }
  rod(cart,ink,[-.18,.60,-.29],[.18,.60,-.29],.022);
  parcel(cart,0,.29,-.03);
  const cargo=group(g);cargo.userData.moves=true;parcel(cargo,0,0,0);
  const worker=person(g,0,0,0,0,'#607f93','uniform');articulated(worker);
  oval(worker.head,'#435d72',0,.103,.025,.107,.054,.116);
  box(worker.head,'#435d72',0,.087,.109,.156,.015,.084,true);
  const placed=group(row,14.67,.13,1.78);box(placed,pine,0,.09,0,.76,.18,.47);
  animate(g,t=>{
    const cycle=(t+4)%21,arrive=smooth(cycle/7),returning=smooth((cycle-13)/7),u=arrive-returning;
    const x=19.30-4.16*u,z=2.88,unload=cycle>=7&&cycle<13;
    cart.position.set(x,.13,z);cart.rotation.y=-Math.PI/2;
    const take=smooth((cycle-7)/1.25),carry=smooth((cycle-8.25)/2.3),back=smooth((cycle-11.1)/1.9);
    const walk=unload?carry-back:0;
    worker.root.position.set(x+.48-.74*walk,.13,z-.96*walk);
    worker.root.rotation.y=-Math.PI/2-walk*.80;
    const walking=(cycle<7||cycle>=13&&cycle<20)?Math.sin(Math.PI*(cycle<7?cycle/7:(cycle-13)/7)):unload?Math.sin(Math.PI*carry)+Math.sin(Math.PI*back):0;
    gait(worker,t*6,walking);worker.arms.forEach(a=>a.rotation.x=-1.02+.17*Math.sin(Math.PI*carry));
    worker.body.rotation.x=.22*Math.sin(Math.PI*take)+.21*Math.sin(Math.PI*carry);
    if(cycle<7||cycle>=20){
      cargo.position.set(x,.66,z);
    }else{
      cargo.position.set(lerp(15.14,14.67,carry),.66+.22*take-.45*carry,lerp(z,1.78,carry));
    }
  });
}
function ambulance(row){
  const drive=group(row,7.49,0,-1.1);
  box(drive,'#626869',0,.012,0,1.88,.030,7.02);
  for(const sx of [-.81,.81])box(drive,'#cebd8d',sx,.031,0,.030,.008,6.66);
  const bay=group(row,8.37,1.52,1.31,-Math.PI/2);label(bay,'救護接送',0,0,.015,.74,.24,'#387775',cream);
  const g=group(row);g.name='clinic-ambulance';
  box(g,'#e5e4d9',0,.66,-.17,.95,.88,1.64,true);
  box(g,'#eae8db',0,.45,.77,.94,.48,.55,true);
  const wind=box(g,'#526c72',0,.87,.64,.84,.43,.068,true);wind.rotation.x=-.38;
  box(g,'#efeee2',0,1.13,-.10,.95,.081,1.57,true);
  const wheels=[];
  for(const side of [-1,1]){
    box(g,'#ac4f40',side*.481,.53,-.08,.018,.087,1.88);
    box(g,'#66838a',side*.483,.88,.24,.024,.32,.44,true);
    box(g,'#829999',side*.484,.89,-.59,.025,.28,.53,true);
    const door=group(g,side*.488,.75,-.17,side*Math.PI/2);label(door,'救護車',0,.005,.006,.42,.14,'#e4e3d6','#963e39');
    for(const zz of [-.87,-.35,.015,.49])box(g,'#a1a397',side*.491,.74,zz,.009,.42,.009);
    for(const zz of [-.37,.034])box(g,ink,side*.50,.689,zz,.018,.020,.066,true);
    for(let j=0;j<5;j++){const a=j*Math.PI*2/5;for(const zz of [-.65,.65])oval(g,'#5c635e',side*.541,.234+.073*Math.sin(a),zz+.073*Math.cos(a),.008,.015,.014);}
    oval(g,'#e7a24f',side*.393,.496,1.062,.026,.026,.012);
    box(g,steel,side*.53,.87,.68,.11,.09,.095,true);
    for(const z of [-.65,.65]){
      const w=group(g,side*.45,.234,z);w.userData.moves=true;wheels.push(w);
      cyl(w,'#373b3a',0,0,0,.21,.21,.13,20).rotation.z=Math.PI/2;
      cyl(w,'#a0a49c',side*.074,0,0,.123,.123,.023,12).rotation.z=Math.PI/2;
      box(w,ink,side*.088,0,0,.008,.029,.14);
    }
    box(g,lamp,side*.322,.51,1.052,.22,.095,.023,true);
    box(g,'#b64839',side*.36,.62,-1,.087,.23,.022,true);
  }
  box(g,ink,0,.39,1.054,.44,.12,.028);
  for(let i=0;i<4;i++)box(g,'#959d99',0,.35+i*.024,1.071,.37,.007,.008);
  for(const sx of [-.18,.18])rod(g,ink,[sx-.09,.765,.706],[sx+.07,.784,.70],.008);
  const badge=group(g,0,.614,1.052);label(badge,'AMBULANCE',0,0,.004,.50,.066,'#e6e2d4','#9c4642');
  box(g,cream,0,.30,1.075,.23,.072,.016);
  const signal=new T.MeshBasicMaterial({color:'#c64b3d'});
  box(g,steel,0,1.195,.12,.57,.043,.18,true);
  for(const side of [-1,1])box(g,signal,side*.178,1.24,.12,.21,.073,.16,true);
  contact(g,0,0,1.18,2.58,.012);
  // One continuous route into the service bay and around the rear of the clinic.
  const path=new T.CurvePath();
  const pts=[[7.48,-7.5],[7.48,-5.1],[7.48,-2.65],[7.49,-.56],[7.49,1.06]];
  const v=([x,z])=>new T.Vector3(x,.031,z);
  path.add(new T.CatmullRomCurve3(pts.map(v)));
  const length=path.getLength();let last=0,distance=0;
  animate(g,t=>{
    const s=(t+6)%32;
    const u=s<9?smooth(s/9):s<17?1:s<29?1-smooth((s-17)/12):0;
    const at=path.getPointAt(u),dir=path.getTangentAt(u);g.position.copy(at);g.rotation.y=Math.atan2(dir.x,dir.z);
    distance+=(u-last)*length;last=u;wheels.forEach(w=>w.rotation.x=distance/.21);
    signal.color.set(s<15&&Math.sin(t*3.3)>.2?'#f47f64':'#ab514a');
  });
}
function court(p){
  const c=group(p,14,.136,12.4),width=9.75,depth=7.10;
  const floor=painted(makeCanvas(960,700,(g,w,h)=>{
    g.fillStyle='#557d78';g.fillRect(0,0,w,h);g.fillStyle='#b36e55';g.fillRect(362,34,236,279);
    g.strokeStyle='#f5dbac';g.lineWidth=5;g.strokeRect(32,32,w-64,h-64);g.strokeRect(362,32,236,280);
    g.beginPath();g.arc(480,312,117,0,Math.PI);g.stroke();
    g.beginPath();g.moveTo(80,32);g.lineTo(80,106);g.arc(480,106,400,Math.PI,0,true);g.lineTo(880,32);g.stroke();
    g.beginPath();g.arc(480,668,82,Math.PI,0);g.stroke();drawNoise(g,w,h,28000,.20);
  }));
  const base=panel(c,floor,0,.025,0,width,depth);base.rotation.x=-Math.PI/2;base.rotation.z=Math.PI;
  const rim=[0,1.87,2.47];
  for(const x of [-4.72,-2.36,0,2.36,4.72])cyl(c,steel,x,1.16,3.5,.038,.048,2.3,9);
  const net=painted(makeCanvas(96,96,(g,w,h)=>{g.strokeStyle='#708375';g.lineWidth=2;g.beginPath();for(const x of [-w,0,w]){g.moveTo(x,0);g.lineTo(x+w,h);g.moveTo(x,h);g.lineTo(x+w,0);}g.stroke();}));
  net.map.wrapS=net.map.wrapT=T.RepeatWrapping;net.side=T.DoubleSide;net.alphaTest=.36;
  panel(c,net,0,1.15,3.51,9.49,2.26,[0,0,38,9]);
  cyl(c,steel,0,1.16,3.28,.062,.078,2.3,12);
  rod(c,steel,[0,1.42,3.28],[0,2.1,2.77],.045);
  box(c,cream,0,2.12,2.73,1.12,.73,.064,true);
  for(const xx of [-.17,.17])box(c,'#b86747',xx,2.04,2.687,.023,.23,.017);
  box(c,'#b86747',0,2.15,2.688,.36,.026,.014);
  hoop(c,'#ba5e37',...rim,.173,.017).rotation.x=Math.PI/2;
  for(let j=0;j<10;j++){
    const a=j*Math.PI*.2,b=a+.25;
    rod(c,cream,[.163*Math.sin(a),1.86,2.47+.163*Math.cos(a)],[.095*Math.sin(b),1.62,2.47+.095*Math.cos(b)],.006);
  }
  for(const x of [-4.2,4.18]){
    cyl(c,steel,x,1.94,2.82,.045,.062,3.88,10);box(c,steel,x,3.88,2.71,.49,.11,.32,true);
    box(c,lamp,x,3.815,2.66,.37,.012,.20);
  }
  // An open-sided practice canopy shelters the game on rainy days.
  for(const x of [-4.79,4.79])for(const z of [-3.32,3.32])box(c,steel,x,2.02,z,.084,4.04,.084);
  for(const x of [-4.79,-2.4,0,2.4,4.79]){
    rod(c,steel,[x,4.01,-3.4],[x,4.58,0],.042);rod(c,steel,[x,4.58,0],[x,4.01,3.4],.042);
    rod(c,steel,[x,4.00,-3.34],[x,4.00,3.34],.032);
  }
  for(const side of [-1,1]){
    const sheet=box(c,'#99a99d',0,4.32,side*1.74,9.85,.055,3.54);sheet.rotation.x=side*.164;
  }
  const a=person(c,-.66,.02,-.99,.18,'#497780','sport'),b=person(c,1.32,.02,1.47,-1.97,'#b56d49','sport');
  for(const [i,actor] of [a,b].entries()){
    articulated(actor);
    label(actor.body,i?'12':'07',0,.17,.106,.115,.104,i?'#b56d49':'#497780','#fff3d1');
    contact(actor.root,0,.02,.55,.35,.018);
  }
  const ball=group(c);oval(ball,'#bd683b',0,0,0,.091,.091,.091);
  for(const axis of [0,1,2]){const seam=hoop(ball,'#654632',0,0,0,.091,.0026);if(axis===1)seam.rotation.x=Math.PI/2;if(axis===2)seam.rotation.y=Math.PI/2;}
  const start=new T.Vector3(-.52,.84,-.88),target=new T.Vector3(...rim),catchAt=new T.Vector3(1.06,.69,1.44);
  animate(ball,t=>{
    const phase=t%8;
    a.root.rotation.y=.20;b.root.rotation.y=-1.98;
    a.arms[1].rotation.x=-.64-.41*Math.cos(t*6.28);
    a.shins[0].rotation.x=.17;a.shins[1].rotation.x=.18;
    b.arms[0].rotation.x=-.68;b.arms[1].rotation.x=-.58;a.root.position.y=.021;
    if(phase<3){
      const bounce=phase%1;
      ball.position.set(start.x,.11+.61*(2*bounce-1)**2,start.z);
      a.body.rotation.x=.13+.055*Math.cos(phase*6.28);
    }else if(phase<4){
      const u=phase-3;a.arms[1].rotation.x=-.68-2.16*u;a.arms[0].rotation.x=-.3-1.79*u;
      a.root.position.y=.02+.13*u;a.body.rotation.x=.12*(1-u);
      ball.position.copy(start);ball.position.y=.72+.50*u;
    }else if(phase<5.18){
      const u=(phase-4)/1.18;ball.position.lerpVectors(start,target,u);ball.position.y=lerp(1.22,1.87,u)+3.8*u*(1-u);
      a.arms[1].rotation.x=-2.84+1.96*u;a.root.position.y=.02+.13*(1-smooth(u*3));
    }else if(phase<5.62){
      const u=(phase-5.18)/.44;ball.position.copy(target);ball.position.y=1.87-1.75*u*u;
    }else if(phase<6.27){
      const u=(phase-5.62)/.65;ball.position.lerpVectors(target,catchAt,u);ball.position.y=lerp(.12,.69,u)+1.06*u*(1-u);
      b.arms[0].rotation.x=-.60-.50*u;
    }else if(phase<7.18){ball.position.copy(catchAt);b.body.rotation.y=.14*Math.sin((phase-6.27)*3);}
    else{const u=(phase-7.18)/.82;ball.position.lerpVectors(catchAt,start,u);ball.position.y=lerp(.69,.72,u)+.85*u*(1-u);b.arms[0].rotation.x=-1.1-.50*Math.sin(Math.PI*u);}
    ball.rotation.x=t*4;ball.rotation.z=t*1.3;
  });
  const bench=group(c,3.73,.03,1.5,Math.PI/2);
  box(bench,pine,0,.30,0,1.33,.07,.36,true);
  for(const x of [-.48,.48])box(bench,steel,x,.15,0,.057,.30,.27);
  cyl(bench,'#af8152',.46,.52,.02,.046,.052,.33,12);
  label(c,'映光社區球場',-2.89,2.12,3.42,2.44,.41,'#426862',cream).rotation.y=Math.PI;
  const flood=new T.PointLight('#fff0c7',4,8,2);flood.position.set(0,3.75,0);c.add(flood);animate(null,()=>{flood.intensity=2+air.night*8;});
}
export function neighborhood(row,art){upperFloor(row,10.65,4.55,3.28,art,0);upperFloor(row,15.6,5.08,3.42,art,1);upperFloor(row,21.2,4.55,2.75,art,2);clinic(row);grocery(row);fruitShop(row);deliveries(row);ambulance(row);court(row);}
