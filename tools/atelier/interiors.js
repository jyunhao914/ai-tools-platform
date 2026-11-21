import {T,palette as P,group,box,panel,rod,cyl,oval,label,animate} from './craft.js';
import {cameraSlider,press,brushArm} from './equipment.js';
import {creativeStudio} from './workstations.js';
import {mountWall} from './wall.js';
import {person} from './street.js';
export let studioLight;
export const doorState={film:0};
export const rooms={
  film:{label:'AI 工具資源平台', door:[.37,2.46], eye:[.37,1.49,2.16], aim:[.37,1.38,-.02], bounds:[-1.24,1.97,-.03,2.19], width:1.40},
  print:{label:'設計室', door:[-2.50,2.36], eye:[-2.65,1.25,1.92], aim:[-3.41,1.00,-.10], bounds:[-4.39,-2.21,-.28,2.12], width:.80}
};
const warm=new T.MeshBasicMaterial({color:'#ffe0a1'});
const pine=['#937459','#b18b69','#aa8566','#ba9170'];
function desk(p,x,z,w,d,h){
  box(p,P.wood,x,h,z,w,.069,d,true);
  for(const side of [-1,1])for(const depth of [-1,1])box(p,P.walnut,x+side*w*.43,h*.49,z+depth*d*.37,.048,h,.048);
}
function framedPrint(p,art,x,y,z,w,h){
  box(p,P.walnut,x,y,z,w+.08,h+.08,.055);
  box(p,P.paper,x,y,z+.036,w,h,.025);panel(p,art,x,y,z+.052,w*.85,h*.83,[.15,.10,.86,.89]);
}
function hangingLight(p,x,z){
  rod(p,P.ink,[x,1.96,z],[x,1.75,z],.012);
  cyl(p,P.jade,x,1.72,z,.055,.16,.10,12);cyl(p,warm,x,1.66,z,.153,.143,.025,12);
}
function filmSet(p,w,d,art){
  const back=-d/2+.105;
  studioLight=creativeStudio(p);
  const notice=group(p,1.18,1.53,back+.13);notice.scale.setScalar(.66);
  mountWall(notice,0,0,0);
  const camera=group(p,-1.70,0,.16,.49);camera.scale.setScalar(.67);
  for(let j=0;j<3;j++){
    const a=j*Math.PI*2/3;rod(camera,P.metal,[0,.62,0],[.24*Math.sin(a),.02,.24*Math.cos(a)],.022);
  }
  cameraSlider(camera,0,.63,0);
  const operator=person(p,-1.68,.04,.62,Math.PI-.22,'#b96448','read');
  animate(operator.head,t=>operator.head.rotation.x=.08+.09*Math.sin(t*1.05));
  animate(operator.arms[0],t=>operator.arms[0].rotation.x=-.38+.13*Math.sin(t*1.2));
}
function printDesk(p,w,d,art){
  const back=-d/2+.11;
  box(p,'#e2c79e',0,.88,back+.025,w-.10,1.76,.075);
  framedPrint(p,art.room2,-.72,1.17,back+.09,.48,.63);framedPrint(p,art.room0,-.09,1.26,back+.09,.52,.45);
  desk(p,-.52,back+.47,1.43,.57,.59);
  const brush=group(p,-.48,.646,back+.53,.11);brush.scale.setScalar(.78);brushArm(brush,0,0,0);
  const roller=group(p,.58,.02,back+.54,-.10);roller.scale.setScalar(.76);press(roller,0,0,0,art);
  const maker=person(p,-.85,.01,back+.80,Math.PI-.34,'#7a9686','read');
  animate(maker.head,t=>maker.head.rotation.x=.12+.08*Math.sin(t*1.9));
  animate(maker.arms[0],t=>maker.arms[0].rotation.x=-.42+.24*Math.sin(t*1.55));
  for(let j=0;j<3;j++){
    box(p,P.walnut,-w*.46,.41+j*.33,-.08,.20,.043,.78);
    for(let k=0;k<5;k++)box(p,[P.paper,P.jade,P.clay,P.brass][(j+k)%4],-w*.46,.52+j*.33,-.37+k*.13,.13,.19,.058);
  }
  for(let k=0;k<5;k++){const sheet=group(p,.55+(k%2)*.22,.01,back+.28+k*.05,-.20);cyl(sheet,['#c88058','#b6a572','#ae8d73'][k%3],0,.30,0,.043,.043,.61,12);}
}
export function studioRoom(parent,id,w,d,art){
  const p=group(parent,0,.20,0);
  box(p,'#a1876c',0,.019,0,w-.04,.038,d-.04);
  const strips=10;
  for(let j=0;j<strips;j++)box(p,pine[j%4],-w/2+(j+.5)*w/strips,.047,0,w/strips-.013,.026,d-.06);
  for(const side of [-1,1])box(p,id==='film'?'#9cb7a6':'#ccaf8a',side*(w/2-.065),1.00,0,.077,2.01,d-.12);
  box(p,'#c4ab85',0,1,-d/2+.055,w-.05,2.01,.065);
  box(p,id==='film'?'#d6c5a7':'#d6c0a4',0,1.99,0,w-.07,.045,d-.04);
  for(let j=0;j<4;j++)box(p,P.walnut,0,1.93,-d*.39+j*d*.25,w-.03,.077,.075);
  if(id!=='film'){hangingLight(p,-w*.25,-.13);hangingLight(p,w*.24,.17);}
  if(id==='film')filmSet(p,w,d,art);else printDesk(p,w,d,art);
}
