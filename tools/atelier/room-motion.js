import {T,group,box,cyl,rod,panel,oval,animate} from './craft.js';
import {person} from './ensemble.js';

// A scale workroom behind each opening. The framing, props and operator sit on
// different depth planes, so the side reveals remain visible on an oblique approach.
export function workingRoom(parent,art,index,w,h,z){
  const room=group(parent,0,-h/2,0),depth=Math.max(.56,-z+.20);
  box(room,'#c8cbd0',0,.013,-depth/2,w,.033,depth);
  box(room,index===3?'#475267':'#afb9ba',0,h/2,-depth,w,h,.045);
  for(const side of [-1,1])box(room,'#a4a9af',side*w/2,h/2,-depth/2,.04,h,depth);
  const shelf=group(room,-w*.25,h*.37,-depth*.73);
  for(const yy of [0,h*.30]){
    box(shelf,'#707e86',0,yy,0,w*.38,.032,.18);
    for(let j=0;j<5;j++)box(shelf,['#618397','#e7d1b2','#456863'][j%3],(j-2)*w*.061,yy+.074,0,w*.043,.12+(j%2)*.035,.08);
  }
  box(room,'#d7c8ae',w*.14,h*.34,-depth*.39,w*.51,.045,.23,true);
  for(const xx of [-.07,.34])box(room,'#647781',w*xx,h*.17,-depth*.4,.03,h*.34,.16);
  box(room,'#24394b',w*.25,h*.54,-depth*.57,w*.26,h*.28,.037,true);
  panel(room,art,w*.25,h*.54,-depth*.57+.021,w*.24,h*.25,[.15,.21,.85,.82]);
  const worker=person(room,-w*.04,.032,-depth*.55,.55,'#4c8391',index===3?'mix':'record');
  worker.root.scale.setScalar(Math.min(1.14,h*.82));
  animate(worker.head,t=>{worker.head.rotation.y=.27*Math.sin(t*.84+index);worker.head.rotation.x=.11+.07*Math.cos(t*1.27);});
  worker.arms.forEach((a,i)=>animate(a,t=>{a.rotation.x=-.70-.30*Math.sin(t*(1.8-i*.27)+i);worker.elbows[i].rotation.x=-.37-.19*Math.cos(t*1.63+i);}));
}
