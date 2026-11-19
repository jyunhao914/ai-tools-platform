import {T,palette as P,group,mesh,box,oval,cyl,rod,beam,tube,hoop,plate,panel,label,mat,animate,canvasMap,makeCanvas,painted} from './craft.js';
import {filmStock} from './surfaces.js';
const TAU=Math.PI*2;
function reel(p,x,y,z,r,tone) {
  const g=group(p,x,y,z);
  const shape=new T.Shape();shape.absarc(0,0,r,0,TAU);
  for(let i=0;i<5;i++){
    const a=i*TAU/5,hole=new T.Path();
    hole.absarc(Math.cos(a)*r*.585,Math.sin(a)*r*.585,r*.235,0,TAU,true);
    shape.holes.push(hole);
  }
  const geo=new T.ExtrudeGeometry(shape,{depth:.041,bevelEnabled:true,bevelSegments:1,bevelSize:.009,bevelThickness:.009,curveSegments:12});
  for(const offset of [-.15,.12])mesh(g,geo,tone,0,0,offset);
  const core=cyl(g,'#6a5146',0,0,0,r*.33,r*.33,.27);core.rotation.x=Math.PI/2;
  for(const offset of [-.15,.17])hoop(g,P.brass,0,0,offset,r-.016,.018);
  rod(g,P.ink,[0,0,-.22],[0,0,.22],r*.14,r*.14,16);
  oval(g,P.brass,0,0,.22,r*.115,r*.115,.035);
  return g;
}
export function projector(p,x,y,z,art) {
  const a=group(p,x,y,z,.045);
  for(let j of [-1,1]){
    beam(a,P.metal,[j*.87,0,-.33],[j*.58,.31,-.28],.13);
    beam(a,P.metal,[j*.87,0,.33],[j*.58,.31,.28],.13);
  }
  box(a,P.walnut,0,.28,0,2.07,.12,.82,true);
  box(a,'#245c54',-.10,.78,0,1.98,1.01,.78,true);
  box(a,'#8cac97',-.10,1.20,0,1.89,.20,.74,true);
  box(a,'#386f63',-.18,.79,.389,1.62,.68,.055,true);
  for(let j=0;j<9;j++)box(a,'#224540',-.81+j*.078,.80,.426,.035,.37,.028,true);
  // The head's optical axis points down the street; the reels face the courtyard.
  const lens=(a0,a1,rad,col)=>rod(a,col,[a0,.85,0],[a1,.85,0],rad,rad,36);
  lens(.80,1.15,.35,P.ink);lens(1.15,1.44,.30,P.brass);lens(1.45,1.61,.36,P.metal);lens(1.60,1.645,.30,'#487c81');
  oval(a,'#82b9b9',1.65,.90,.06,.021,.14,.11);
  for(let j=0;j<5;j++)lens(1.15+j*.057,1.17+j*.057,.316,'#93724e');
  for(const xx of [-.94,.66])for(const yy of [.48,1.09])oval(a,P.brass,xx,yy,.431,.031,.031,.018);
  const meter=group(a,.33,1.03,.426);box(meter,P.ink,0,0,0,.43,.164,.035,true);box(meter,P.cream,0,.003,.021,.36,.111,.01,true);
  for(let k=0;k<6;k++)box(meter,P.walnut,-.13+k*.052,.025,.031,.009,.039,.01);
  const needle=group(meter,0,-.035,.04);rod(needle,P.red,[0,0,0],[.070,.078,0],.009);animate(needle,t=>needle.rotation.z=.22*Math.sin(t*3.1));
  // A cast carrying handle and winding crank define the side silhouette.
  tube(a,P.walnut,[[-.44,1.26,-.16],[-.43,1.43,-.16],[-.28,1.47,-.16],[.03,1.47,-.16],[.10,1.28,-.16]],.044);
  box(a,P.brass,-.13,.49,.424,.49,.061,.028,true);
  label(a,'16 mm',.34,.76,.431,.70,.29,'#264d48','#ead6a8');
  for(const [xx,yy] of [[-.69,1.91],[.57,1.83]]){
    beam(a,P.metal,[xx*.60,1.21,-.22],[xx,yy,-.22],.13,.14);
  }
  const left=reel(a,-.69,1.91,0,.61,'#c6a56d'),right=reel(a,.57,1.83,0,.52,'#93a99b');
  animate(left,t=>left.rotation.z=-t*.82);animate(right,t=>right.rotation.z=-t*.96);
  // Visible ribbon of picture frames threaded between guides, front and back.
  const path=new T.CatmullRomCurve3([[-1.21,1.60,-.27],[-1.27,1.37,-.19],[-1.13,.63,.15],[-.87,.36,.17],[.74,.35,.17],[1.03,.51,.18],[.93,1.20,.01],[.90,1.44,-.26]].map(v=>new T.Vector3(...v)));
  const pos=[],uv=[],indices=[];
  for(let j=0;j<=70;j++){
    const u=j/70,q=path.getPoint(u),t=path.getTangent(u),n=new T.Vector3(-t.y,t.x,0).normalize().multiplyScalar(.079);
    pos.push(q.x+n.x,q.y+n.y,q.z+.34,q.x-n.x,q.y-n.y,q.z+.34);uv.push(u,1,u,0);
    if(j<70){let k=j*2;indices.push(k,k+1,k+2,k+1,k+3,k+2)}
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();mesh(a,geo,filmStock(art));
  for(let xx of [-1.15,.96]){rod(a,P.ink,[xx,.57,.32],[xx,.57,.55],.068);oval(a,P.brass,xx,.57,.56,.066,.066,.018)}
}
export function cameraSlider(p,x,y,z) {
  const g=group(p,x,y,z);
  const rail=.92;for(let depth of [-.07,.07])rod(g,'#98a7a1',[-rail/2,0,depth],[rail/2,0,depth],.026);
  const cam=group(g,-.1,.03,0);
  box(cam,P.ink,0,.032,0,.25,.055,.24,true);cyl(cam,P.metal,0,.13,0,.065,.081,.17);
  box(cam,P.ink,0,.29,0,.26,.22,.35,true);box(cam,'#687976',-.13,.32,0,.08,.17,.22,true);
  rod(cam,P.ink,[0,.30,.15],[0,.30,.34],.092,.1,20);
  rod(cam,'#5d9296',[0,.30,.335],[0,.30,.35],.071);
  box(cam,P.metal,0,.43,-.07,.21,.05,.13,true);oval(cam,'#ed6952',-.083,.38,.15,.026,.02,.018);
  animate(cam,t=>{cam.position.x=.28*Math.sin(t*.55);cam.rotation.y=.17*Math.sin(t*.55+.4)});
}
export function softbox(p,x,y,z) {
  const g=group(p,x,y,z);
  for(let k=0;k<3;k++){const a=k*TAU/3;rod(g,P.ink,[0,.21,0],[Math.sin(a)*.25,.01,Math.cos(a)*.25],.017)}
  rod(g,P.metal,[0,.18,0],[0,1.0,0],.025);
  const top=group(g,0,1.12,0,-.5);top.rotation.x=-.28;
  const head=cyl(top,P.ink,0,0,0,.29,.12,.20,4);head.rotation.x=Math.PI*.5;head.rotation.y=Math.PI*.25;
  const diffuser=box(top,'#fff0d1',0,0,.103,.41,.39,.025,true);diffuser.rotation.z=.01;
}
export function press(p,x,y,z,art) {
  const g=group(p,x,y,z);box(g,P.jade,0,.21,0,1.08,.39,.43,true);box(g,P.cream,0,.45,-.06,1.16,.13,.37,true);
  rod(g,P.ink,[-.51,.46,.16],[.51,.46,.16],.058);
  const m=art.room2.map.image;
  const sheet=makeCanvas(384,512,(ctx,w,h)=>{
    ctx.fillStyle='#fff0d9';ctx.fillRect(0,0,w,h);
    ctx.drawImage(m,m.width*.35,m.height*.26,m.width*.54,m.height*.38,23,57,w-46,295);
    ctx.fillStyle='#a95038';ctx.fillRect(24,25,62,12);ctx.fillStyle='#2f5655';ctx.font='bold 33px "PingFang TC",sans-serif';ctx.fillText('手部動作圖解',23,415);
    ctx.fillRect(24,437,270,3);ctx.fillRect(24,451,175,3);
  });
  const pageMat=painted(sheet);pageMat.side=T.DoubleSide;
  const verts=[],uv=[],idx=[];
  for(let j=0;j<=20;j++){const u=j/20,py=.45-.39*u*u,pz=.16+.42*Math.sin(u*1.55);verts.push(-.39,py,pz,.39,py,pz);uv.push(0,1-u,1,1-u);if(j<20){let k=j*2;idx.push(k,k+1,k+2,k+1,k+3,k+2)}}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(verts,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();const page=mesh(g,geo,pageMat);
  animate(page,t=>{page.scale.z=.84+.17*Math.sin(t*1.4);page.rotation.x=.035*Math.sin(t*1.4)});
  const wheel=hoop(g,P.brass,.60,.32,0,.12,.023);wheel.rotation.y=Math.PI/2;
  const dial=group(g,.61,.32,0);rod(dial,P.metal,[0,-.10,0],[0,.10,0],.015);animate(dial,t=>dial.rotation.x=t*1.4);
}
export function server(p,x,y,z) {
  const g=group(p,x,y,z);box(g,P.ink,0,.52,0,.45,1.05,.33,true);
  const light=new T.MeshBasicMaterial({color:'#acecd3'});
  for(let k=0;k<7;k++){box(g,'#62736b',0,.13+k*.13,.17,.39,.09,.027);for(let j=0;j<4;j++)box(g,j===k%4?light:P.ink,-.13+j*.064,.13+k*.13,.19,.029,.018,.015)}
  for(let j=0;j<3;j++)tube(g,[P.clay,P.brass,P.jade][j],[[.11,.24+j*.14,.19],[.15,.17+j*.09,.27],[.24,.32+j*.12,.25],[.1,.57+j*.09,.19]],.012);
  animate(null,t=>light.color.setHSL(.44,.65,.54+.26*Math.sin(t*5)**2));
}
export function brushArm(p,x,y,z){
  const g=group(p,x,y,z);
  box(g,P.wood,0,0,0,.96,.09,.44);
  const paper=panel(g,mat(P.paper),0,.051,0,.77,.34);paper.rotation.x=-Math.PI/2;
  const lines=makeCanvas(320,140,(ctx)=>{ctx.fillStyle='#f1e4c9';ctx.fillRect(0,0,320,140);ctx.strokeStyle='#363537';ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(34,97);ctx.bezierCurveTo(80,28,165,133,260,42);ctx.stroke()});
  const paint=panel(g,painted(lines),0,.057,0,.73,.32);paint.rotation.x=-Math.PI/2;
  const brush=group(g);rod(brush,P.wood,[.02,.07,0],[.11,.46,-.07],.018);rod(brush,P.ink,[0,.01,0],[.02,.09,0],.01,.026);
  // A fixed overhead copy camera photographs the artist's original ink samples.
  rod(g,P.metal,[-.44,.04,-.17],[-.44,.58,-.17],.022);rod(g,P.ink,[-.44,.58,-.17],[-.12,.58,0],.022);box(g,P.ink,-.12,.55,0,.13,.09,.13);
  const rest=group(g,.32,.07,-.05);rod(rest,P.wood,[-.08,0,0],[.16,.02,.04],.013);
  // The brush rests on the writing table; the copy head tracks across the sheet.
  brush.rotation.z=1.34;brush.position.set(.34,.06,.10);
}
