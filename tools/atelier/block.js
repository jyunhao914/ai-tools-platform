import {T,palette as P,group,box,oval,cyl,rod,beam,tube,panel,plate,label,contact,animate,painted,makeCanvas} from './craft.js';
import {shell,gable,railing,awning,sconce,blade,pipes,airUnit,skylight,tank,stairs,planter,ivy,spray} from './architecture.js';
import {studioRoom, doorState} from './interiors.js';
import {roofTile,zinc,tiled,lessonScreen} from './surfaces.js';
import {projector,cameraSlider,softbox,press,server,brushArm} from './equipment.js';
import {addTramLine} from './tram.js';
import {addPigeons,dryingPrints} from './breeze.js';
import {cameraRental,soundStudio,screeningYard} from './annexes.js';
import {lot,ground,utilities,noodleStand,streetLife} from './street.js';

function ledStrip(p,x,y,z,w,count){
  for(let i=0;i<count;i++)oval(p,'#ffde9c',x+((i+.5)/count-.5)*w,y,z,.032,.032,.025);
}
function posterBox(p,x,y,z,w,h,art,title){
  box(p,P.walnut,x,y,z,w+.08,h+.08,.075,true);
  box(p,P.brass,x,y,z+.044,w+.025,h+.023,.035);
  panel(p,art,x,y+.055,z+.066,w-.055,h-.16,[.20,.07,.83,.96]);
  label(p,title,x,y-h*.40,z+.068,w-.055,h*.14,'#efe0be','#283f3c');
}
function cat(p,x,y,z){
  const g=group(p,x,y,z);oval(g,P.clay,0,.105,0,.22,.106,.108);oval(g,P.cream,.14,.123,.037,.100,.088,.088);
  for(let s of [-1,1]){cyl(g,P.clay,.15+s*.05,.204,.033,.006,.04,.082,3);oval(g,P.ink,.193,.128,.090+s*.015,.008,.006,.008)}
  const tail=group(g,-.17,.09,-.02);tube(tail,P.wood,[[0,0,0],[-.10,.026,-.045],[-.17,.045,.038],[-.12,.067,.091]],.036);
  animate(tail,t=>tail.rotation.y=.3*Math.sin(t*1.1));return g;
}
function foldingDoors(p) {
  const g=group(p,0,.08,.058);
  box(g,P.wood,0,1.73,.135,1.78,.125,.20);
  for(const side of [-1,1])box(g,P.walnut,side*.80,.86,.13,.13,1.73,.18);
  function ramp(t,a,b){const u=Math.max(0,Math.min(1,(t-a)/(b-a)));return u*u*(3-2*u)}
  for(const side of [-1,1]){
    const leaf=group(g,side*.755,.045,.168),inner=-side*.374;
    box(leaf,P.red,inner,.81,0,.746,1.62,.070);
    box(leaf,'#805441',inner,1.045,.041,.605,.882,.03);
    for(let col=0;col<2;col++)for(let row=0;row<3;row++){
      const xx=inner+(col-.5)*.252,yy=.78+row*.268;
      box(leaf,['#b99c76','#b7a680','#c4ad86'][(col+row)%3],xx,yy,.064,.22,.235,.028);
      box(leaf,'#d8c19a',xx-.056,yy+.043,.08,.026,.105,.008);
    }
    box(leaf,'#813d32',inner,.34,.046,.60,.44,.028);box(leaf,'#a44e3c',inner,.34,.066,.50,.34,.026);
    rod(leaf,P.brass,[inner-side*.23,.65,.10],[inner-side*.23,.83,.10],.014);
    for(const yy of [.30,1.35])cyl(leaf,P.brass,0,yy,.037,.028,.028,.13,12);
    animate(leaf,t=>{const u=t%18;
      const opening=ramp(u,4.10,5.23)-ramp(u,7.48,8.40)+ramp(u,10.17,11.15)-ramp(u,13.35,14.3);
      leaf.rotation.y=side*1.40*Math.max(opening,doorState.film);
    });
  }
  box(g,'#bcb295',0,-.018,.19,1.85,.080,.41);
}
function verticalType(p,x,y,z,words) {
  const sign=group(p,x,y,z);
  for(let dy of [-.55,.55])beam(sign,P.metal,[.01,dy,-.24],[.01,dy,.03],.052);
  box(sign,P.walnut,0,0,0,.40,1.67,.17,true);
  box(sign,P.clay,0,0,.088,.35,1.61,.047,true);
  for(let i=0;i<words.length;i++)label(sign,words[i],0,.56-i*.37,.118,.31,.34,'#bd6752','#fff1d4',{size:.85});
}
function filmingHouse(p,a,screen) {
  const g=group(p,.37,.20,1.04),w=4.11,d=2.68,h=4.49;
  const f=shell(g,w,d,h,{front:a.wall0,right:a.wall0,back:a.wall3,left:a.wall2},{front:{bw:3.05,bh:1.58,y:2.61,index:1,art:a.room1,depth:.38,door:{x:0,w:1.47,h:1.83}}});
  studioRoom(g,'film',w,d,a);
  // Continuous stepped cornices and ceramic piers tie the cinema elevations together.
  for(const [level,depth,col] of [[.28,.06,'#71877b'],[2.22,.10,'#b3a78c'],[4.53,.15,P.cream],[4.65,.07,P.jade]]){
    box(g,col,0,level,0,w+depth,.085,d+depth);
  }
  for(let s of [-1,1]){
    box(f.front,P.jade,s*1.88,3.41,.04,.14,2.00,.17);
    box(f.front,P.cream,s*1.90,4.48,.04,.33,.15,.23);
    sconce(f.front,s*1.68,1.56,.075);
    rod(f.front,P.brass,[s*1.64,2.85,.05],[s*1.64,2.28,.56],.020);
    for(let i=0;i<2;i++)box(f.front,P.brass,s*.90,.73+i*.22,.045,.04,.19,.05,true);
  }
  box(f.front,'#263d3c',0,2.22,.30,4.09,.53,.68,true);
  box(f.front,P.clay,0,2.47,.31,4.13,.078,.70,true);
  box(f.front,P.brass,0,1.956,.31,4.12,.051,.70,true);
  label(f.front,'AI 工具資源平台',0,2.225,.65,3.91,.43,'#254e49','#fff0ca',{size:.89});
  ledStrip(f.front,0,2.00,.653,3.76,20);
  for(let end of [-1,1])for(let j=0;j<3;j++)box(f.front,P.brass,end*(1.92-j*.048),2.236,.661,.017,.204+j*.044,.027);
  foldingDoors(f.front);
  posterBox(f.front,-1.59,1.15,.075,.43,.73,a.room2,'手部圖解');
  posterBox(f.front,1.58,1.14,.075,.44,.73,a.room1,'今日錄影');
  cameraSlider(f.front,-.93,2.82,.16);softbox(f.front,1.27,2.76,-.08);
  const tally=new T.MeshBasicMaterial({color:'#f08c6c'});box(f.front,P.ink,-1.1,4.32,.08,.73,.17,.10,true);oval(f.front,tally,-1.38,4.32,.14,.033,.033,.025);
  label(f.front,'錄影中',-1.05,4.32,.136,.47,.13,'#253e39','#ffe4c3');
  animate(null,t=>tally.color.setHSL(.027,.82,.50+.12*Math.sin(t*2.8)**2));
  box(g,P.cream,0,4.74,0,w+.26,.13,d+.24);
  plate(g,'#688178',0,4.79,0,w+.13,d+.13,.065);
  box(g,'#9fa890',0,4.94,-d*.47,w,.24,.13);
  for(let s of [-1,1])box(g,'#8f9d88',s*(w/2-.04),4.94,0,.105,.22,d);
  projector(g,-.39,4.85,.10,a);
  skylight(g,1.45,4.85,-.64,.70,.77);
  for(let j=0;j<3;j++)box(g,P.brass,-1.77+j*.13,4.85,.91,.05,.055,.43);
  airUnit(f.right,-.76,3.41,.15,.81);
  pipes(f.right,.99,.13,.115,4.38);
  const tele=group(f.right,.04,1.33,.08);
  box(tele,P.ink,0,0,0,1.57,.94,.12,true);panel(tele,screen,0,.035,.074,1.43,.80);
  for(let k=0;k<3;k++)box(tele,P.brass,-.61+k*.12,-.421,.075,.067,.018,.015);
  blade(f.right,.70,2.23,0,'放映',P.red);
  for(let s of [-1,1])planter(f.front,s*1.91,.08,.38,.29,true);
  return g;
}
function printShop(p,a) {
  const g=group(p,-3.30,.20,.91,.025),w=2.65,d=2.88,h=3.22;
  const f=shell(g,w,d,h,{front:a.wall1,right:a.wall3,back:a.wall1,left:a.wall3},{front:{x:-.53,bw:1.25,bh:1.14,y:.53,index:2,art:a.room2,depth:.21,door:{x:.76,w:.87,h:1.68}}});
  const door=group(f.front,.76,.02,.061);
  for(const side of [-1,1])box(door,P.walnut,side*.46,.84,0,.055,1.67,.10);
  box(door,P.wood,0,1.69,0,.99,.075,.12);
  studioRoom(g,'print',w,d,a);
  gable(g,w,d,3.36,.68);awning(f.front,0,1.90,0,2.74,.43);
  box(f.front,P.walnut,0,2.01,.05,2.66,.18,.13);
  verticalType(f.front,-1.35,2.55,.29,'圖像設計');
  dryingPrints(f.front,a);
  press(f.front,-.35,.14,.23,a);planter(f.front,1.07,.10,.36,.33);
  const tray=group(f.left,.02,1.19,.03);
  for(let k=0;k<3;k++)posterBox(tray,-.79+k*.79,.11,0,.52,.76,[a.room2,a.room0,a.room1][k],['圖解','手稿','攝影'][k]);
  const balcony=group(f.front,0,2.13,.12);box(balcony,P.wood,0,0,.06,2.45,.10,.30);railing(balcony,0,0,.21,2.27,P.walnut);
  for(let j=0;j<3;j++)planter(balcony,-.97+j*.27,.05,.15,.18,true);
  sconce(f.left,-.78,2.0,.06);pipes(f.left,-1.12,.12,.11,3.12);
  // Small skylight with open vent flaps on the shaded roof pitch.
  const vent=group(g,-.68,3.86,-.43);vent.rotation.x=-.31;
  box(vent,P.metal,0,0,0,.72,.18,.64);for(let j=0;j<5;j++)box(vent,P.mint,-.27+j*.134,.10,0,.09,.04,.50);
  ivy(f.left,-.66,2.99,.11,.80);
}
function planningRoom(p,a) {
  const g=group(p,-2.15,.20,-2.03,Math.PI),w=3.35,d=2.07,h=3.49;
  const f=shell(g,w,d,h,{front:a.wall3,left:a.wall1,back:a.wall3,right:a.wall1},{front:{bw:2.55,bh:1.43,y:1.69,index:0,art:a.room0}});
  box(g,P.walnut,0,3.65,0,w+.28,.12,d+.23);
  plate(g,'#9e9c86',0,3.71,0,w+.18,d+.15,.06);
  tank(g,-.92,3.77,-.21,.77);
  box(g,P.cream,0,3.89,-.99,w,.25,.12);
  const slats=group(g,.35,3.78,.83);for(let j=0;j<4;j++)box(slats,P.walnut,-.48+j*.32,.37,-.03,.052,.73,.056);
  for(let j=0;j<5;j++)box(slats,P.wood,0,.08+j*.14,-.03,1.27,.07,.035);
  for(let j=0;j<3;j++)planter(slats,-.47+j*.36,0,.00,.35,j===1);
  box(f.front,P.wood,0,1.64,.20,2.89,.10,.61);brushArm(f.front,-.50,1.67,.33);
  railing(f.front,.77,1.69,.47,.91,P.walnut);
  label(f.front,'教案企劃',.67,1.47,.085,1.48,.26,'#743f32','#ffe6c2',{rule:true});
  sconce(f.front,-1.44,1.45,.10);awning(f.front,0,3.26,0,2.98,.33);
  // A small timber rooftop addition is offset so the studio tower still owns the skyline.
  const attic=group(g,.51,3.76,-.15,-.03);
  const af=shell(attic,1.82,1.26,1.15,{front:a.wall1,back:a.wall1,left:a.wall3,right:a.wall2});
  gable(attic,1.82,1.26,1.28,.45);
  box(af.back,P.walnut,0,.63,.09,1.55,.72,.15);
  panel(af.back,a.wall1,0,.63,.174,1.44,.61,[.10,.54,.89,.94]);
  for(let x of [-.54,0,.54])box(af.back,P.wood,x,.63,.182,.048,.63,.038);
  box(af.back,P.wood,0,.27,.13,1.68,.10,.28);planter(af.back,.54,.30,.23,.16,true);
  ivy(af.left,-.29,1.06,.08,.59);
  const shirts=group(f.right,0,2.64,.26);tube(shirts,P.metal,[[-.88,.1,0],[0,.01,.03],[.88,.1,0]],.012);
  for(let j=0;j<3;j++){let scarf=group(shirts,-.53+j*.49,.052,0);box(scarf,[P.cream,'#aab9af','#d1a48b'][j],0,-.20,0,.32,.42,.023);animate(scarf,t=>scarf.rotation.x=.12*Math.sin(t*1.1+j))}
  airUnit(f.right,-.38,1.57,.13,.65);cat(g,.68,3.79,.60);
}
function controlRoom(p,a) {
  const g=group(p,2.97,.20,-1.62,Math.PI/2),w=3.49,d=2.66,h=3.76;
  const f=shell(g,w,d,h,{front:a.wall2,right:a.wall3,back:a.wall0,left:a.wall2},{front:{bw:2.62,bh:1.51,y:1.74,index:3,art:a.room3,depth:.37}});
  box(f.front,P.jade,0,1.60,.15,3.47,.20,.42);label(f.front,'課 程 控 制 室',0,1.60,.373,2.05,.16,'#365f55','#ffecca');
  server(f.front,1.28,1.78,.09);
  const cpu=group(f.front,-.70,3.45,.085);
  for(let j=0;j<7;j++){
    const s=new T.MeshBasicMaterial({color:'#80ccb5'});oval(cpu,s,-.48+j*.17,0,0,.046,.046,.021);
    animate(null,t=>s.color.setHSL(.43,.40,.39+.30*Math.max(0,Math.cos(t*2-j*.7))));
    if(j<6)box(cpu,P.brass,-.39+j*.17,0,0,.078,.013,.025);
  }
  gable(g,w,d,3.89,.56,zinc);blade(f.front,-1.31,1.24,0,'上線',P.jade);
  const cabinet=group(f.right,-.32,.60,.05);
  box(cabinet,'#8f9a88',0,.36,0,.76,.93,.22,true);
  for(let j=0;j<5;j++)box(cabinet,P.metal,-.12,.14+j*.075,.12,.35,.026,.017);
  for(let j=0;j<3;j++)tube(f.right,[P.ink,P.metal,P.walnut][j],[[-.53+j*.11,.73,.16],[-.55+j*.11,.33,.16],[-.96+j*.09,.29,.16],[-1.02+j*.09,.10,.16]],.022);
  sconce(f.right,.65,1.47,.07);pipes(f.left,.87,.12,.11,3.71);airUnit(f.left,-.57,2.82,.14,.81);
  const mast=group(g,-1.20,4.10,-.21);
  rod(mast,P.metal,[0,0,0],[0,1.67,0],.032,.044);
  for(let j=0;j<4;j++){const len=.21+j*.085;rod(mast,P.metal,[-len,.91+j*.16,.02],[len,.91+j*.16,.02],.015)}
  tube(mast,P.ink,[[0,1.35,0],[.09,.91,.03],[.11,.42,.02],[.34,.07,0]],.010);
  const ladder=group(f.back,1.10,.08,.16);
  for(let s of [-1,1])rod(ladder,P.metal,[s*.16,0,0],[s*.16,3.91,0],.025);
  for(let j=0;j<16;j++)rod(ladder,P.metal,[-.16,j*.24,0],[.16,j*.24,0],.018);
}
function courtyard(p) {
  const deck=group(p,.04,.20,-.78);
  box(deck,P.wood,0,2.25,0,2.42,.12,.60);railing(deck,0,2.31,.29,2.41);
  for(let s of [-1,1])beam(deck,P.metal,[s*1.02,1.78,.02],[s*.70,2.19,.20],.07);
  const steps=group(p,-.26,.20,-2.05,Math.PI/2);
  stairs(steps,0,0,.48,.62,1.23,1.32);
  planter(p,-.74,.20,-3.40,.37,true);planter(p,-4.70,.20,-1.02,.40);planter(p,4.77,.20,.47,.36);
}
export function buildDistrict(p,a){
  const screen=lessonScreen(a);
  ground(p);contact(p,lot.x,lot.z,lot.width-1.1,lot.depth-1.25,.202);
  filmingHouse(p,a,screen);printShop(p,a);planningRoom(p,a);controlRoom(p,a);
  courtyard(p);utilities(p);noodleStand(p);streetLife(p);
  cameraRental(p,a);soundStudio(p,a);screeningYard(p,screen);
  addTramLine(p,lot);addPigeons(p);
}
