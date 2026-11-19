import {T, palette as P, rand, mat, group, box, mesh, panel, oval, cyl, rod, beam, tube, plate, label, animate} from './craft.js';
import {workingRoom} from './room-motion.js';
import {roofTile,zinc,cloth} from './surfaces.js';
const tau=2*Math.PI;
export function front(parent,x,y,z,yaw=0){return group(parent,x,y,z,yaw)}
export function foundation(p,w,d) {
  plate(p,'#8a8c80',0,0,0,w+.16,d+.15,.09);
  plate(p,'#b5a892',0,.09,0,w+.09,d+.1,.085);
}
// Painted elevations are cut into jambs and spandrels: the rooms sit back inside a real opening.
function elevation(face,w,h,material,bay){
  function patch(l,b,r,t) {
    if(r-l<.005||t-b<.005)return;
    panel(face,material,(l+r)/2-w/2,(b+t)/2,0,r-l,t-b,[l/w,b/h,r/w,t/h]);
  }
  if(!bay){patch(0,0,w,h);return}
  const {x=0,y,bw,bh,art}=bay, left=(w-bw)/2+x,right=left+bw,top=y+bh,depth=bay.depth??.42;
  patch(0,0,w,y);patch(0,top,w,h);patch(0,y,left,top);patch(right,y,w,top);
  const frame=group(face,x,y+bh/2,0);
  if(bay.index===undefined)panel(frame,art,0,0,-depth,bw+.07,bh+.04);
  else workingRoom(frame,art,bay.index,bw+.07,bh+.04,-depth);
  for(let k of [-1,1]){
    box(frame,k===1?P.walnut:'#8b6c51',k*(bw/2+.018),0,-depth/2,.06,bh,depth+.03);
    box(frame,P.walnut,k*(bw/2+.04),0,.045,.09,bh+.19,.10);
    box(frame,P.brass,k*(bw/2-.014),0,.070,.022,bh+.06,.036);
  }
  box(frame,'#745a43',0,bh/2+.01,-depth/2,bw,.055,depth);
  box(frame,P.wood,0,-bh/2+.015,-depth/2+.045,bw+.12,.08,depth+.14);
  box(frame,P.walnut,0,bh/2+.058,.055,bw+.21,.11,.16);
  box(frame,P.cream,0,-bh/2-.045,.09,bw+.24,.115,.25);
  const strip=new T.MeshBasicMaterial({color:'#ffe1a6'});box(frame,strip,0,bh/2-.03,-.10,bw*.93,.028,.03);
  return frame;
}
export function shell(p,w,d,h,artSet,openings={}) {
  foundation(p,w,d);
  const faces={
    front:front(p,0,.12,d/2),right:front(p,w/2,.12,0,Math.PI/2),
    back:front(p,0,.12,-d/2,Math.PI),left:front(p,-w/2,.12,0,-Math.PI/2)
  };
  for(const [key,face] of Object.entries(faces)){
    const fw=key==='front'||key==='back'?w:d;
    elevation(face,fw,h,artSet[key],openings[key]);
    for(let dir of [-1,1])box(face,P.walnut,dir*(fw/2-.024),h/2,.015,.052,h,.055);
  }
  box(p,'#626e65',0,h+.13,0,w+.02,.11,d+.02);
  return faces;
}
export function gable(p,w,d,y,rise,surface=roofTile) {
  const run=d/2+.16, angle=Math.atan2(rise,run), slope=Math.hypot(run,rise);
  for(const s of [-1,1]){
    const face=box(p,P.walnut,0,y+rise/2,s*run/2,w+.33,.11,slope);
    face.rotation.x=s*angle;
    const top=panel(p,surface,0,y+rise/2+.065,s*run/2,w+.33,slope);
    top.rotation.x=-Math.PI/2+s*angle;
    box(p,P.walnut,0,y+.002,s*run,w+.36,.095,.105);
    if(surface===roofTile){
      const count=Math.max(8,Math.round(w/.17));
      for(let j=0;j<=count;j++){
        const xx=(w+.29)*(j/count-.5);
        const colors=['#ba6755','#cb7760','#ac5c4d'];
        rod(p,colors[j%3],[xx,y+rise+.081,0],[xx,y+.082,s*run],.036,.045,9);
        for(let k=1;k<=4;k++){
          const u=k/4;
          rod(p,colors[(j+k)%3],[xx,y+rise*(1-u)+.085,s*run*u],[xx,y+rise*(1-u)+.072,s*(run*u+.043)],.043,.049,9);
        }
      }
    }
    for(const e of [-1,1])beam(p,'#9c6451',[e*(w/2+.14),y+.10,s*run],[e*(w/2+.14),y+rise+.08,0],.08);
  }
  rod(p,P.clay,[-w/2-.22,y+rise+.11,0],[w/2+.22,y+rise+.11,0],.088,.088,14);
  for(const s of [-1,1]){
    const shape=new T.Shape();shape.moveTo(-run,0);shape.lineTo(0,rise);shape.lineTo(run,0);shape.closePath();
    const m=mesh(p,new T.ShapeGeometry(shape),P.cream,s*(w/2-.01),y,0);m.rotation.y=s*Math.PI/2;
    box(p,P.walnut,s*w/2,y+rise*.35,0,.07,rise*.62,.075);
  }
}
export function railing(p,x,y,z,w,metal=P.jade) {
  for(const h of [.12,.5])box(p,metal,x,y+h,z,w,.042,.045);
  for(let i=0;i<=Math.ceil(w/.26);i++)box(p,metal,x-w/2+i*w/Math.ceil(w/.26),y+.28,z,.032,.55,.035);
}
export function awning(p,x,y,z,w,projection=.50,m=cloth) {
  const a=group(p,x,y,z), tilt=.22;
  const top=panel(a,m,0,-.035,projection*.48,w,projection);
  top.rotation.x=-Math.PI/2+tilt;
  const frontY=-projection*.13;
  for(let i=0;i<12;i++)box(a,i%2?P.cream:P.jade,((i+.5)/12-.5)*w,frontY-.05,projection-.015,w/12+.003,.105,.036,true);
  for(const s of [-1,1]){
    beam(a,P.ink,[s*w*.44,-.32,.01],[s*w*.44,frontY,projection*.97],.037);
    rod(a,P.brass,[s*w*.44,.07,.01],[s*w*.44,frontY,projection],.02);
  }
}
export function sconce(p,x,y,z) {
  box(p,P.ink,x,y,z,.14,.22,.06,true);
  rod(p,P.brass,[x,y,z],[x,y+.05,z+.15],.035);
  oval(p,'#ffe4a4',x,y-.04,z+.17,.096,.13,.095);
  cyl(p,P.ink,x,y+.073,z+.17,.036,.115,.075);
  cyl(p,P.brass,x,y-.161,z+.17,.063,.047,.037);
}
export function blade(p,x,y,z,text,color=P.jade) {
  for(let dy of [-.37,.37])rod(p,P.ink,[x,y+dy,z],[x,y+dy,z+.54],.034);
  const b=group(p,x,y,z+.42,Math.PI/2);
  box(b,P.walnut,0,0,0,.77,.52,.11,true);
  for(const side of [-1,1]){
    const a=group(b,0,0,.061*side,side===1?0:Math.PI);
    label(a,text,0,0,0,.72,.46,color,'#fff2cf',{rule:true});
  }
}
export function pipes(p,x,y,z,h){
  tube(p,'#626e66',[[x,y+h,z],[x,y+h-.2,z],[x+.14,y+h-.35,z],[x+.14,y+.26,z],[x+.24,y+.15,z]],.052);
  for(let j=.32;j<h-.35;j+=.7)box(p,P.walnut,x+.14,y+j,z,.15,.044,.12);
}
export function airUnit(p,x,y,z,scale=1){
  const unit=group(p,x,y,z);unit.scale.setScalar(scale);
  box(unit,'#a09f8b',0,0,0,.81,.46,.30,true);box(unit,'#626e65',-.15,0,.16,.38,.38,.04,true);
  const hub=group(unit,-.15,0,.195);
  for(let i=0;i<5;i++){
    const a=group(hub);a.rotation.z=i*tau/5;
    oval(a,P.ink,.065,.065,0,.075,.126,.018).rotation.z=-.6;
  }
  animate(hub,t=>hub.rotation.z=t*3);
  for(let k=-2;k<=2;k++)box(unit,'#beb8a4',-.15,k*.06,.221,.33,.014,.02);
  for(let k=0;k<6;k++)box(unit,P.metal,.20,-.12+k*.049,.16,.23,.018,.021);
  for(let s of [-1,1])beam(unit,P.ink,[s*.28,-.24,-.02],[s*.28,-.38,-.13],.035);
}
export function skylight(p,x,y,z,w,d){
  const g=group(p,x,y,z);
  box(g,P.ink,0,.18,0,w,.35,d);
  const roof=panel(g,mat('#91b0b0'),0,.39,0,w+.06,d+.05);roof.rotation.x=-Math.PI/2+.15;
  for(let i=0;i<=4;i++){let xx=(i/4-.5)*w;beam(g,P.cream,[xx,.39+d*.075,-d/2],[xx,.39-d*.075,d/2],.042)}
}
export function tank(p,x,y,z,s=.75) {
  const o=group(p,x,y,z);o.scale.setScalar(s);
  for(let k=0;k<4;k++){let a=Math.PI*.25+k*Math.PI*.5;beam(o,P.ink,[.64*Math.cos(a),0,.64*Math.sin(a)],[.49*Math.cos(a),.61,.49*Math.sin(a)],.07)}
  cyl(o,'#919d97',0,1.05,0,.60,.58,1.05,32);
  for(let h of [.55,.74,1.27,1.56])cyl(o,P.metal,0,h,0,.615,.612,.038,32);
  oval(o,'#a5ada1',0,1.58,0,.60,.15,.60);
  tube(o,P.brass,[[.40,1.67,0],[.62,1.66,0],[.68,1.47,0],[.68,.12,0],[.83,.07,0]],.037);
}
export function stairs(p,x,y,z,width,length,height) {
  const g=group(p,x,y,z);
  const n=Math.ceil(height/.15);
  for(let i=0;i<n;i++)box(g,'#b0a99b',0,(i+.5)*height/n,-i*length/n,width,height/n+.02,length/n+.04);
  for(let s of [-1,1]){
    beam(g,P.ink,[s*width*.48,-.03,0],[s*width*.48,height-.12,-length],.08);
    rod(g,P.jade,[s*width*.51,.57,0],[s*width*.51,height+.52,-length],.029);
    for(let i=0;i<=n;i+=3)rod(g,P.jade,[s*width*.51,height*i/n,-i*length/n],[s*width*.51,height*i/n+.55,-i*length/n],.022);
  }
}
const leafShape=new T.Shape();leafShape.moveTo(0,0);leafShape.quadraticCurveTo(-.53,.53,0,1);leafShape.quadraticCurveTo(.56,.49,0,0);
const leafGeo=new T.ShapeGeometry(leafShape,4);
const leafPaint=['#40684f','#698757','#85965e','#53816b','#a6ad71'].map(c=>new T.MeshStandardMaterial({color:c,side:T.DoubleSide,roughness:1}));
export function spray(p,x,y,z,size=.25,count=20) {
  const cluster=group(p,x,y,z);
  for(let k=0;k<count;k++){
    const a=rand()*tau,u=rand()*size*.47,len=size*(.45+rand()*.52);
    const l=mesh(cluster,leafGeo,leafPaint[Math.floor(rand()*leafPaint.length)],Math.cos(a)*u,rand()*size*.28,Math.sin(a)*u);
    l.scale.set(len*.61,len,len);l.rotation.set((rand()-.5)*1.45,a,(rand()-.5)*1.94);
  }
  return cluster;
}
export function planter(p,x,y,z,s=.32,flowers=false){
  cyl(p,P.clay,x,y+s*.39,z,s*.50,s*.34,s*.78,12);cyl(p,P.wood,x,y+s*.77,z,s*.53,s*.51,s*.11,12);
  spray(p,x,y+s*.78,z,s*1.30,24);
  if(flowers)for(let i=0;i<8;i++){
    const a=rand()*tau;oval(p,i%2?'#d98b82':'#f2d9a4',x+Math.cos(a)*s*.36,y+s*(1.40+rand()*.28),z+Math.sin(a)*s*.36,s*.095,s*.066,s*.09)
  }
}
export function ivy(p,x,y,z,length){
  for(let j=0;j<4;j++){
    const pts=[],l=length*(.48+rand()*.52);
    for(let k=0;k<6;k++)pts.push([x+j*.1+.07*Math.sin(k+j),y-l*k/5,z+.044*Math.cos(k)]);
    tube(p,'#67735d',pts,.011);
    for(let k=0;k<9;k++){const u=k/9,leaf=mesh(p,leafGeo,leafPaint[(k+j)%5],x+j*.1+.07*Math.sin(u*5+j),y-l*u,z+.04);leaf.scale.set(.12,.15,.12);leaf.rotation.z=(k%2?1:-1)*2}
  }
}
export function seat(p,x,y,z){cyl(p,P.red,x,y+.33,z,.19,.18,.07,20);for(let j=0;j<4;j++){let a=j*Math.PI/2+.6;rod(p,P.red,[x+.16*Math.cos(a),y+.03,z+.16*Math.sin(a)],[x+.12*Math.cos(a),y+.31,z+.12*Math.sin(a)],.027)}}
