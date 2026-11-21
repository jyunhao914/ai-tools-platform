import {T,group,box,cyl,rod,oval,panel,makeCanvas,painted,label,animate} from './craft.js';

const ink='#192740',ivory='#f6f9ff',coral='#ed876f',jade='#42a5bc',gold='#98a4f2';
const faces=[],indicators=new Map();
export function highlightStation(key){
  for(const [id,{lamp,base}] of indicators)lamp.color.set(id===key?'#e7feff':base);
}
const specs=[
  {key:'video',name:'影片剪輯台',color:coral,x:-1.14,angle:.19},
  {key:'slides',name:'簡報製作桌',color:gold,x:0,angle:0},
  {key:'illustration',name:'圖像工作區',color:jade,x:1.14,angle:-.19}
];
function polygon(c,points,color){
  c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();
}
function circle(c,x,y,r,color){c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();}
function fill(c,color,x,y,w,h){c.fillStyle=color;c.fillRect(x,y,w,h);}
function artwork(c,x,y,w,h,palette,photo){
  c.save();c.translate(x,y);c.beginPath();c.rect(0,0,w,h);c.clip();
  if(photo){
    const scale=Math.max(w/photo.width,h/photo.height),dw=photo.width*scale,dh=photo.height*scale;
    c.drawImage(photo,(w-dw)/2,(h-dh)/2,dw,dh);
  }else{
    const field=c.createLinearGradient(0,h,w,0);field.addColorStop(0,'#1e294d');field.addColorStop(1,'#5b568e');
    fill(c,field,0,0,w,h);
    for(let k=0;k<92;k++){const a=k/91;c.beginPath();
      for(let j=0;j<=160;j++){const t=j/160*Math.PI*2;
        const u=w*(.48+(.23+.068*Math.cos(3*t+.95*a))*Math.cos(2*t+.58*a));
        const v=h*(.51+(.30+.08*Math.cos(3*t+.95*a))*Math.sin(2*t+.58*a)+.12*Math.sin(3*t+.95*a));
        if(j)c.lineTo(u,v);else c.moveTo(u,v);}
      c.strokeStyle='hsla('+Math.round(154+140*a)+',85%,76%,.54)';c.lineWidth=.9;c.stroke();}
  }
  c.restore();
}
const tones=[['#f3c86e','#dd7053','#fff0bf','#25797a'],['#b3e1d2','#559b96','#fcce73','#25565e'],['#f3b9a2','#88658b','#fff1c4','#495476']];
function drawScreen(c,spec,art){
  fill(c,ink,0,0,640,344);
  if(spec.key==='video'){
    artwork(c,22,18,420,210,tones[0],art.room1.map.image);for(let i=0;i<3;i++)artwork(c,460,18+i*72,149,58,tones[i],art['room'+i].map.image);
    for(let row=0;row<3;row++){let x=23;for(let j=0;j<5;j++){const w=68+(j*47+row*23)%75;fill(c,[jade,coral,gold][row],x,246+row*29,w,19);x+=w+6;}}
  }else if(spec.key==='slides'){
    fill(c,'#e3ecde',0,0,640,344);for(let j=0;j<3;j++)artwork(c,13,16+j*110,113,89,tones[j],art['room'+j].map.image);
    fill(c,'#fff5da',142,16,485,310);artwork(c,333,16,294,310,tones[1],art.wall0.map.image);
    fill(c,jade,161,42,46,9);c.fillStyle=ink;c.font='bold 34px system-ui';c.fillText('臺中街景',160,141);
    fill(c,'#8ba59a',161,160,130,5);fill(c,'#a6b6a3',161,177,96,4);
  }else{
    fill(c,'#ede8d9',0,0,640,344);artwork(c,62,15,442,311,tones[2]);
    for(let j=0;j<6;j++){circle(c,28,38+j*48,11,[coral,jade,ink,gold,'#a188af','#fff4da'][j]);}
    for(let j=0;j<4;j++){fill(c,[ivory,coral,jade,gold][j],520,38+j*62,87,46);}
  }
}
function workbench(p,spec,art){
  const g=group(p,spec.x,0,-.72,spec.angle),accent=spec.color;
  box(g,'#d7dfea',0,.53,0,1.09,.074,.58,true);
  const lamp=new T.MeshBasicMaterial({color:accent});indicators.set(spec.key,{lamp,base:accent});
  box(g,'#293753',0,.486,.26,1.06,.073,.042,true);
  box(g,lamp,0,.50,.282,1.035,.011,.012);
  box(g,lamp,0,.895,-.111,.946,.535,.043,true);
  for(const x of [-.47,.47]){box(g,ink,x,.27,-.02,.045,.51,.41);}
  box(g,'#95a5ba',0,.62,-.09,.074,.17,.058);
  box(g,'#a4afc4',0,.574,-.087,.25,.019,.13,true);
  box(g,ink,0,.895,-.108,.92,.51,.085,true);
  const material=painted(makeCanvas(640,344,c=>drawScreen(c,spec,art)),true);
  const screen=panel(g,material,0,.895,-.061,.863,.455);faces.push([spec.key,screen]);
  box(g,ink,0,.442,.296,.90,.120,.020,true);
  const tag=label(g,spec.name+'  ↗',0,.442,.309,.86,.106,ink,ivory,{size:.85});faces.push([spec.key,tag]);
  if(spec.key==='video'){
    const deck=group(g,-.08,.585,.12);box(deck,'#45585a',0,0,0,.54,.040,.17,true);
    for(let j=0;j<6;j++){box(deck,[coral,ivory,jade][j%3],-.21+.062*j,.025,-.028,.043,.012,.031);}
    cyl(deck,'#bdc8b8',.20,.031,0,.046,.046,.024,18);
    const play=box(g,new T.MeshBasicMaterial({color:'#fff7bf'}),0,.756,-.056,.005,.115,.004);animate(play,t=>play.position.x=-.39+(t*.11% .78));
  }else if(spec.key==='slides'){
    const marker=box(g,new T.MeshBasicMaterial({color:gold}),-.425,.99,-.056,.009,.09,.004);
    animate(marker,t=>marker.position.y=1.036-Math.floor(t/3.6)%3*.146);
    box(g,'#637b77',-.05,.582,.12,.49,.025,.16,true);
    for(let j=0;j<9;j++)for(let k=0;k<3;k++)box(g,ivory,-.253+j*.05,.599,.075+k*.04,.041,.009,.029);
    oval(g,'#f0c576',.31,.589,.14,.049,.025,.076);
  }else{
    const nib=group(g,0,0,-.055);
    const cursor=panel(nib,painted(makeCanvas(64,64,c=>polygon(c,[[12,4],[56,40],[35,42],[27,61]],ivory)),true),0,0,0,.038,.038);
    cursor.material.transparent=true;cursor.material.depthWrite=false;
    animate(nib,t=>{nib.position.x=.02+.16*Math.sin(t*.65);nib.position.y=.90+.059*Math.sin(t*.95);});
    box(g,'#344b50',-.03,.581,.135,.47,.029,.19,true);
    rod(g,'#e9cb9b',[-.15,.603,.094],[.10,.609,.193],.011);
    cyl(g,coral,.35,.635,.14,.056,.049,.14,18);
    for(let j=0;j<4;j++)rod(g,[gold,jade,ivory,ink][j],[.34,.65,.14],[.31+j*.022,.80+(j%2)*.025,.15],.0075);
  }
}
export function creativeStudio(p,art){
  const back=-1.22;
  box(p,'#5e728d',1.70,1.0,-.81,.51,1.97,.036);
  for(let j=0;j<8;j++)box(p,'#90a0b6',1.48+j*.062,1,-.78,.022,1.91,.021);
  box(p,'#33445f',0,.98,back,3.99,1.93,.065);
  for(const side of [-1,1]){
    for(let j=0;j<13;j++)box(p,'#8091a8',side*1.91,.98,-1.07+j*.159,.042,1.78,.028);
    box(p,'#9caabe',side*1.74,1.94,0,.068,.026,2.12);
    box(p,new T.MeshBasicMaterial({color:'#e8faff'}),side*1.74,1.922,0,.032,.008,2.12);
  }
  const mural=painted(makeCanvas(1440,390,(c,w,h)=>{
    const field=c.createLinearGradient(0,0,w,h);field.addColorStop(0,'#182b51');field.addColorStop(.5,'#182942');field.addColorStop(1,'#404473');c.fillStyle=field;c.fillRect(0,0,w,h);
    // A continuous field of fine luminous contours across the glass media wall.
    for(let j=0;j<96;j++){const v=j/95;c.beginPath();
      for(let x=0;x<=w;x+=6){const y=235+115*Math.sin(x/190+v*2.6)+62*Math.sin(x/320-v*3.3)+(v-.5)*146; if(!x)c.moveTo(x,y);else c.lineTo(x,y);}
      c.strokeStyle='hsla('+Math.round(178+v*79)+',78%,'+(62+12*v)+'%,'+(.10+.47*v)+')';c.lineWidth=1.7;c.stroke();}
    const shade=c.createLinearGradient(0,0,880,0);shade.addColorStop(0,'#162947ee');shade.addColorStop(.66,'#182a49b5');shade.addColorStop(1,'#182a4900');c.fillStyle=shade;c.fillRect(0,0,880,h);
    c.fillStyle='#f2f6ff';c.font='650 83px "PingFang TC",sans-serif';c.fillText('AI 工具資源',61,205);
  }),true);
  box(p,'#9eacc2',-.49,1.49,back+.066,2.58,.751,.042,true);
  panel(p,mural,-.49,1.49,back+.092,2.55,.724);
  for(const spec of specs)workbench(p,spec,art);
  for(const x of [-1.46,-.43,.59,1.62]){
    rod(p,'#3a5554',[x,1.93,-.45],[x,1.84,-.45],.014);
    const lamp=cyl(p,ink,x,1.80,-.45,.045,.092,.115,16);
    cyl(p,new T.MeshBasicMaterial({color:'#e7f5ff'}),x,1.74,-.45,.077,.077,.009,16);
  }
  const glow=new T.PointLight('#e4eeff',3.1,4.4,2);glow.position.set(0,1.72,.24);p.add(glow);
  // Restrict the warm practical light to views near the studio.
  glow.visible=false;return glow;
}
export function workstationAt(ray){
  let nearest=Infinity,key=null;
  for(const [id,face] of faces){const hit=ray.intersectObject(face,false)[0];if(hit&&hit.distance<nearest){nearest=hit.distance;key=id;}}
  return key;
}
