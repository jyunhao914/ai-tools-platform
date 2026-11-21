import {T,group,box,cyl,rod,oval,panel,makeCanvas,painted,label,animate} from './craft.js';

const ink='#193942',ivory='#fff0ca',coral='#ed7859',jade='#168983',gold='#edb344';
const faces=[];
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
function artwork(c,x,y,w,h,palette){
  c.save();c.translate(x,y);c.scale(w/200,h/110);c.beginPath();c.rect(0,0,200,110);c.clip();
  fill(c,palette[0],0,0,200,110);circle(c,144,35,20,palette[2]);
  polygon(c,[[0,81],[46,41],[76,58],[98,30],[161,86],[200,65],[200,110],[0,110]],palette[1]);
  polygon(c,[[0,67],[52,85],[110,57],[138,79],[172,60],[200,81],[200,110],[0,110]],palette[3]);
  c.restore();
}
const tones=[['#f3c86e','#dd7053','#fff0bf','#25797a'],['#b3e1d2','#559b96','#fcce73','#25565e'],['#f3b9a2','#88658b','#fff1c4','#495476']];
function drawScreen(c,spec){
  fill(c,ink,0,0,640,344);
  if(spec.key==='video'){
    artwork(c,22,18,420,210,tones[0]);for(let i=0;i<3;i++)artwork(c,460,18+i*72,149,58,tones[i]);
    for(let row=0;row<3;row++){let x=23;for(let j=0;j<5;j++){const w=68+(j*47+row*23)%75;fill(c,[jade,coral,gold][row],x,246+row*29,w,19);x+=w+6;}}
  }else if(spec.key==='slides'){
    fill(c,'#e3ecde',0,0,640,344);for(let j=0;j<3;j++)artwork(c,13,16+j*110,113,89,tones[j]);
    fill(c,'#fff5da',142,16,485,310);artwork(c,333,16,294,310,tones[1]);
    fill(c,jade,161,42,46,9);c.fillStyle=ink;c.font='bold 34px system-ui';c.fillText('臺中街景',160,141);
    fill(c,'#8ba59a',161,160,130,5);fill(c,'#a6b6a3',161,177,96,4);
  }else{
    fill(c,'#ede8d9',0,0,640,344);artwork(c,62,15,442,311,tones[2]);
    for(let j=0;j<6;j++){circle(c,28,38+j*48,11,[coral,jade,ink,gold,'#a188af','#fff4da'][j]);}
    for(let j=0;j<4;j++){fill(c,[ivory,coral,jade,gold][j],520,38+j*62,87,46);}
  }
}
function workbench(p,spec){
  const g=group(p,spec.x,0,-.72,spec.angle),accent=spec.color;
  box(g,'#e2bd8f',0,.53,0,1.09,.074,.58,true);
  box(g,accent,0,.487,.258,1.06,.087,.045,true);
  for(const x of [-.47,.47]){box(g,ink,x,.27,-.02,.045,.51,.41);}
  box(g,'#637779',0,.62,-.09,.074,.17,.058);
  box(g,'#364d52',0,.574,-.087,.25,.019,.13,true);
  box(g,ink,0,.895,-.108,.92,.51,.085,true);
  const material=painted(makeCanvas(640,344,c=>drawScreen(c,spec)),true);
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
export function creativeStudio(p){
  const back=-1.22,slats='#ab7753';
  box(p,'#34716b',0,.98,back,3.99,1.93,.065);
  for(let j=0;j<12;j++)box(p,slats,-1.91+j*.054,.95,back+.051,.027,1.84,.024);
  const mural=painted(makeCanvas(1100,340,c=>{
    fill(c,'#1c6968',0,0,1100,340);
    for(let j=0;j<5;j++){c.beginPath();c.arc(1005,344,103+j*38,.98*Math.PI,1.85*Math.PI);c.lineWidth=20;c.strokeStyle=[coral,gold,'#7dc6af','#397f7e','#36928c'][j];c.stroke();}
    c.fillStyle=ivory;c.font='bold 85px "PingFang TC",sans-serif';c.fillText('AI 創作工作室',46,147);
    fill(c,gold,49,196,119,10);fill(c,coral,181,196,58,10);
  }),true);
  panel(p,mural,-.55,1.52,back+.07,2.48,.73);
  for(const spec of specs)workbench(p,spec);
  for(const x of [-1.46,-.43,.59,1.62]){
    rod(p,'#3a5554',[x,1.93,-.45],[x,1.84,-.45],.014);
    const lamp=cyl(p,ink,x,1.80,-.45,.045,.092,.115,16);
    cyl(p,new T.MeshBasicMaterial({color:'#ffe2aa'}),x,1.74,-.45,.077,.077,.009,16);
  }
  const glow=new T.PointLight('#ffdbaf',3.6,4.4,2);glow.position.set(0,1.72,.24);p.add(glow);
  // Restrict the warm practical light to views near the studio.
  glow.visible=false;return glow;
}
export function workstationAt(ray){
  let nearest=Infinity,key=null;
  for(const [id,face] of faces){const hit=ray.intersectObject(face,false)[0];if(hit&&hit.distance<nearest){nearest=hit.distance;key=id;}}
  return key;
}
