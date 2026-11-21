import {T,palette as P,rand,group,mesh,box,oval,cyl,rod,beam,tube,hoop,plate,panel,label,animate,contact,makeCanvas,canvasMap} from './craft.js';
import {spray,planter,seat,awning} from './architecture.js';
import {pavement,roadway} from './surfaces.js';
const TAU=Math.PI*2, roadY=.015, walkY=.22;
export const lot={x:-1.47,z:-1.36,width:15.56,depth:12.45,roadWidth:.89,railApron:1.72};
function garment(p,material,profile,x,y,z,squish){
  const verts=profile.map(([r,h])=>new T.Vector2(r,h));const m=mesh(p,new T.LatheGeometry(verts,16),material,x,y,z);m.scale.z=squish;return m;
}
export function person(p,x,y,z,yaw,coat,action='stand') {
  const root=group(p,x,y,z,yaw),hips=group(root,0,.391,0),body=group(hips,0,.012,0);
  const variant=[...coat].reduce((sum,c)=>sum+c.charCodeAt(0),0)%5;
  const skin=['#c88e6b','#d5a181','#b78060','#dfb391','#cc9876'][variant],hair=['#312c2b','#423733','#302e2d','#57514a','#292a29'][variant];
  const denim=['#4b5359','#535757','#414b51','#655b50','#42474d'][variant];
  garment(body,coat,[[.125,0],[.143,.030],[.132,.13],[.153,.239],[.143,.271],[.078,.298]],0,0,0,.68);
  for(const side of [-1,1]){
    const collar=box(body,coat,side*.035,.281,.056,.068,.057,.024,true);collar.rotation.z=side*.52;
  }
  cyl(body,skin,0,.31,-.002,.050,.058,.09);
  const head=group(body,0,.432,.004);
  garment(head,skin,[[.033,-.117],[.062,-.101],[.082,-.071],[.093,-.028],[.099,.026],[.096,.061],[.079,.087],[.040,.103]],0,0,0,.89);
  for(const side of [-1,1]){
    oval(head,skin,side*.093,-.010,-.004,.015,.028,.014);
    oval(head,'#bf906e',side*.032,-.006,.078,.019,.007,.007);
    oval(head,hair,side*.036,.000,.083,.009,.006,.005);
    rod(head,hair,[side*.023,.024,.082],[side*.057,.030,.071],.005);
  }
  oval(head,skin,0,-.013,.081,.016,.029,.018);
  oval(head,skin,0,-.031,.089,.018,.012,.013);
  oval(head,'#9e695b',0,-.061,.074,.026,.004,.006);
  oval(head,hair,0,.056,-.015,.102,.063,.088);
  oval(head,hair,0,.012,-.053,.099,.083,.055);
  for(let j=0;j<5;j++){
    const xx=(j-2)*.030,lock=oval(head,hair,xx,.047+Math.abs(xx)*.23,.049,.032,.032+.012*(j%2),.027);lock.rotation.z=.58;
  }
  if(variant===1||variant===4){oval(head,hair,0,-.013,-.089,.055,.058,.047);oval(head,hair,.013,-.072,-.094,.036,.056,.032);}
  if(action==='cook'){
    cyl(head,P.paper,0,.123,0,.112,.108,.075);oval(head,P.paper,0,.168,0,.132,.067,.114);
    box(body,'#e2d8bd',0,.125,.103,.21,.27,.026,true);
  }else if(action==='cycle'){
    oval(head,P.jade,0,.088,0,.117,.069,.107);box(head,P.brass,0,.067,.11,.142,.022,.065,true);
  }else if(action!=='sport'&&action!=='uniform'){
    const strap=box(body,P.walnut,0,.16,.108,.027,.31,.022);strap.rotation.z=-.50;
    box(body,action==='read'?P.wood:P.jade,.116,.045,.04,.11,.14,.12,true);
  }
  let arms=[],legs=[],shins=[],elbows=[];
  for(const s of [-1,1]){
    const arm=group(body,s*.138,.247,0);arms.push(arm);
    const forward=action==='cook'?(s===1?.17:.055):action==='cycle'?.15:action==='read'?.12:.022;
    const elbow=[s*.039,-.129,forward*.31],hand=[s*.028,-.19,forward];
    rod(arm,coat,[0,0,0],elbow,.048,.059,12);
    const fore=group(arm,...elbow),tip=hand.map((v,i)=>v-elbow[i]);elbows.push(fore);
    rod(fore,skin,[0,0,0],tip,.026,.039,12);oval(fore,skin,...tip,.029,.040,.024);
    oval(fore,skin,tip[0]-s*.020,tip[1]+.008,tip[2]+.01,.014,.021,.012);
    const knee=group(hips,s*.073,0,0);legs.push(knee);
    const bent=action==='cycle'?.14:.027;
    rod(knee,denim,[0,.035,0],[0,-.169,bent],.057,.072,12);
    const shin=group(knee,0,-.166,bent);shins.push(shin);
    rod(shin,action==='sport'?skin:denim,[0,0,0],[0,-.147,(action==='cycle'?-.035:0)-bent],.035,.052,12);
    const foot=group(shin,0,-.169,(action==='cycle'?-.035:0)-bent);
    oval(foot,variant%2?'#5d5048':'#6a6d67',0,0,.025,.052,.040,.085);
    oval(foot,'#3e413d',0,-.026,.026,.055,.015,.087);
    box(foot,'#b2aba0',0,.021,.067,.046,.008,.020,true);
  }
  if(action==='read'){const book=box(body,P.clay,0,.095,.168,.233,.14,.018);book.rotation.x=-.52}
  return {root,hips,body,head,arms,legs,shins,elbows};
}
export function ground(p){
  const {x,z,width,depth,roadWidth}=lot;
  const walkWidth=width-2*roadWidth, walkDepth=depth-2*roadWidth;
  const centerZ=z+lot.railApron/2,baseDepth=depth+lot.railApron;
  plate(p,'#354546',x,-.41,centerZ,width-.04,baseDepth-.04,.21,.27);
  plate(p,'#8f9689',x,-.20,centerZ,width,baseDepth,.07,.27);
  plate(p,'#5b6260',x,-.13,centerZ,width-.02,baseDepth-.02,.14,.27);
  const road=panel(p,roadway(width-.14,depth-.14,roadWidth),x,.014,z,width-.14,depth-.14);
  road.rotation.x=-Math.PI/2;
  plate(p,'#b4ab95',x,.023,z,walkWidth,walkDepth,.17,.31);
  const pave=panel(p,pavement(),x,.197,z,walkWidth-.30,walkDepth-.27);pave.rotation.x=-Math.PI/2;
  const nx=Math.ceil((walkWidth-.48)/.48),nz=Math.ceil((walkDepth-.48)/.48);
  const dx=(walkWidth-.48)/nx,dz=(walkDepth-.48)/nz;
  for(const side of [-1,1]){
    for(let i=0;i<nx;i++)box(p,i%3?'#c6c0a9':'#d7c9aa',x+(i+.5-nx/2)*dx,.145,z+side*(walkDepth/2-.046),dx-.014,.109,.093,true);
    for(let i=0;i<nz;i++)box(p,'#bbb9a6',x+side*(walkWidth/2-.046),.145,z+(i+.5-nz/2)*dz,.09,.11,dz-.014,true);
  }
}
function pole(p,x,z,height){
  cyl(p,'#938d80',x,walkY+height/2,z,.083,.115,height,12);
  for(let y of [.36,.47,1.1,height-.30])cyl(p,P.metal,x,y+walkY,z,.111,.112,.047,12);
  box(p,P.walnut,x,height+.11,z,.66,.072,.10);
  for(let s of [-1,1]){
    cyl(p,P.cream,x+s*.24,height+.23,z,.046,.055,.18,12);
    for(let j=0;j<3;j++)cyl(p,P.cream,x+s*.24,height+.18+j*.045,z,.066,.063,.019,12);
  }
  tube(p,P.ink,[[x,height-.6,z],[x+.24,height-.43,z],[x+.47,height-.41,z],[x+.53,height-.46,z]],.034);
  oval(p,P.metal,x+.50,height-.47,z,.156,.059,.105);oval(p,'#ffe9b3',x+.50,height-.51,z,.118,.032,.075);
}
export function utilities(p){
  pole(p,-4.87,2.55,3.39);pole(p,-4.99,-2.94,3.84);pole(p,4.91,-3.34,3.58);
  for(let s of [-1,1]){
    tube(p,'#384448',[[-4.87+s*.24,3.70,2.55],[-4.99+s*.24,3.38,-.03],[-4.99+s*.24,4.10,-2.94]],.016);
    tube(p,'#384448',[[-4.99+s*.24,4.10,-2.94],[.06,3.43,-3.26],[4.91+s*.24,3.86,-3.34]],.015);
  }
}
let treeLeaves;
function foliageTexture(){
 if(treeLeaves)return treeLeaves;
 const art=makeCanvas(256,208,(g,w,h)=>{
   for(let j=0;j<280;j++){
     const angle=rand()*TAU,r=Math.sqrt(rand()),xx=w*(.5+.44*r*Math.cos(angle)),yy=h*(.51+.43*r*Math.sin(angle));
     const shade=(.48-yy/h)*37+(rand()-.5)*31;
     g.fillStyle='rgb('+Math.round(100+shade)+','+Math.round(139+shade)+','+Math.round(81+shade*.65)+')';
     g.beginPath();g.ellipse(xx,yy,4+rand()*9,3+rand()*5,rand()*3.1,0,TAU);g.fill();
     if(j%4===0){g.fillStyle='#c0c589';g.fillRect(xx,yy-2,4,1.6)}
   }
 });
 treeLeaves=new T.MeshStandardMaterial({map:canvasMap(art),alphaTest:.46,side:T.DoubleSide,roughness:1});
 return treeLeaves;
}
export function tree(p,x,z,s=1){
  const g=group(p,x,walkY,z);g.scale.setScalar(s);
  cyl(g,'#bab2a1',0,.06,0,.49,.49,.12,22);cyl(g,'#756e58',0,.125,0,.42,.42,.025,22);
  rod(g,P.wood,[0,.12,0],[.035,1.29,0],.058,.084,10);
  for(let j=0;j<7;j++){
    const a=j*2.4,dy=1.25+rand()*.56,dx=.42*Math.cos(a),dz=.38*Math.sin(a);
    rod(g,P.wood,[.02,.81,0],[dx,dy,dz],.022,.049);
    const cloud=group(g,dx,dy,dz);
    for(let k=0;k<3;k++){const twig=panel(cloud,foliageTexture(),0,.14+k*.025,0,.69,.54);twig.rotation.y=a+k*Math.PI/3;twig.rotation.x=-.25}
    for(let k=0;k<4;k++)spray(cloud,(rand()-.5)*.39,(rand()-.5)*.27,(rand()-.5)*.39,.36,9);
  }
}
export function noodleStand(p){
  const g=group(p,3.60,walkY,1.61,-.23);
  box(g,'#527970',0,.37,.02,1.54,.70,.68,true);
  box(g,'#c1c0a8',0,.75,0,1.63,.075,.76,true);
  for(let s of [-1,1]){rod(g,P.walnut,[s*.74,0,-.26],[s*.74,1.71,-.26],.038);rod(g,P.walnut,[s*.74,.56,.35],[s*.74,1.64,.35],.028)}
  box(g,P.walnut,0,1.67,-.02,1.64,.061,.82);
  awning(g,0,1.79,-.37,1.76,.91);
  const pot=cyl(g,'#a4aaa3',-.26,.87,.04,.259,.221,.21,24);
  cyl(g,'#ba8d5a',-.26,.985,.04,.228,.23,.017);
  hoop(g,P.metal,-.26,.988,.04,.245,.016).rotation.x=Math.PI/2;
  for(let k=0;k<4;k++){let b=cyl(g,P.paper,.27,.82+k*.040,.12,.13,.072,.076,20);hoop(g,P.blue,.27,.85+k*.04,.12,.126,.007).rotation.x=Math.PI/2}
  for(let k=0;k<3;k++)cyl(g,[P.red,P.brass,P.jade][k],.42+k*.078,.867,-.19,.038,.04,.16,12);
  for(let i=0;i<3;i++)seat(g,-.46+i*.48,0,.74);
  const customer=person(g,.50,.06,.74,Math.PI-.26,'#6b8990','read');
  customer.hips.position.y=.34;customer.body.rotation.x=.07;
  for(let k=0;k<2;k++){customer.legs[k].rotation.x=-1.08;customer.legs[k].rotation.z=(k?1:-1)*.14}
  for(let k=0;k<2;k++){const bx=.48+k*.18;const bowl=cyl(g,P.cream,bx,.80,.29,.093,.053,.067,20);cyl(g,'#af783f',bx,.836,.29,.082,.081,.008,18);rod(g,P.walnut,[bx-.05,.85,.27],[bx+.09,.93,.32],.007)}
  const chef=person(g,-.21,.04,-.39,.26,P.cream,'cook');
  animate(chef.arms[1],t=>chef.arms[1].rotation.x=-.55+.18*Math.sin(t*2.15));
  const spoon=group(g,-.28,1.07,-.05);rod(spoon,P.metal,[0,-.13,0],[.19,.11,-.1],.014);
  animate(spoon,t=>spoon.rotation.y=.6*Math.sin(t*2.15));
  const steamArt=canvasMap(makeCanvas(64,64,g=>{let gr=g.createRadialGradient(32,32,1,32,32,31);gr.addColorStop(0,'rgba(255,249,222,.65)');gr.addColorStop(1,'rgba(255,249,222,0)');g.fillStyle=gr;g.fillRect(0,0,64,64)}));
  for(let j=0;j<6;j++){const sm=new T.SpriteMaterial({map:steamArt,transparent:true,depthWrite:false}),v=new T.Sprite(sm);g.add(v);animate(v,t=>{let u=(t*.38+j/6)%1;v.position.set(-.26+Math.sin(u*6+j)*.068,1+u*.63,.04);v.scale.set(.10+u*.21,.12+u*.23,1);sm.opacity=.67*Math.sin(u*Math.PI)})}
  const l=group(g,-.86,1.43,.32);oval(l,'#d97855',0,0,0,.131,.22,.13);for(let i=0;i<4;i++)hoop(l,'#aa654c',0,-.12+i*.08,0,.119,.008).rotation.x=Math.PI/2;
  animate(l,t=>l.rotation.z=.065*Math.sin(t*1.23));
  label(g,'麵',-.53,.46,.378,.28,.32,'#546e61','#faf0d1');
}
export function streetLife(p){
  const reader=person(p,-3.32,walkY,3.02,-.75,'#9f654d','read');
  animate(reader.head,t=>reader.head.rotation.y=.16*Math.sin(t*.65));
  const walker=person(p,.35,walkY,3.30,0,'#817a9b');
  walker.hips.userData.moves=true;contact(walker.root,0,0,.43,.29,.007);
  // The visitor follows the pavement, turns at the marquee, and steps through its moving doors.
  function journey(t){
    const u=t%18, x0=-1.85, x1=.37, z0=3.23, z1=2.03;
    if(u<5)return [x0+(x1-x0)*u/5,z0,Math.PI/2,1];
    if(u<7)return [x1,z0+(z1-z0)*(u-5)/2,Math.PI,1];
    if(u<11)return [x1,z1,Math.PI,0];
    if(u<13)return [x1,z1+(z0-z1)*(u-11)/2,0,1];
    return [x1+(x0-x1)*(u-13)/5,z0,-Math.PI/2,1];
  }
  animate(walker.root,t=>{const [x,z,a,moving]=journey(t);walker.root.position.x=x;walker.root.position.z=z;walker.root.rotation.y=a;walker.root.visible=moving===1;walker.hips.position.y=.385+.012*Math.abs(Math.sin(t*4.2))});
  for(let s=0;s<2;s++){animate(walker.legs[s],t=>walker.legs[s].rotation.x=Math.sin(t*4.2+s*Math.PI)*.39);animate(walker.arms[s],t=>walker.arms[s].rotation.x=-Math.sin(t*4.2+s*Math.PI)*.26)}
  // A courier follows the street around the island, tangent to each bend.
  const cycle=group(p),wheelPivots=[];
  contact(cycle,0,0,.54,1.35,.012);
  for(let z of [-.35,.36]){
    const wheel=group(cycle,0,.255,z,Math.PI/2);wheel.userData.moves=true;wheelPivots.push(wheel);
    hoop(wheel,P.ink,0,0,0,.231,.026);hoop(wheel,'#bec0ac',0,0,0,.207,.009);
    for(let j=0;j<9;j++){let a=j*Math.PI/9;rod(wheel,'#b9b5a1',[Math.cos(a)*.207,Math.sin(a)*.207,0],[-Math.cos(a)*.207,-Math.sin(a)*.207,0],.006)}
  }
  const frame=[[0,.26,-.35],[0,.54,-.13],[0,.27,.014],[0,.62,.23],[0,.59,-.10],[0,.26,-.35]];
  for(let i=1;i<frame.length;i++)rod(cycle,P.red,frame[i-1],frame[i],.028);
  rod(cycle,P.ink,[0,.26,.36],[0,.72,.22],.022);rod(cycle,P.metal,[-.18,.75,.22],[.18,.75,.22],.018);
  oval(cycle,P.walnut,0,.59,-.12,.081,.035,.12);
  box(cycle,P.wood,0,.46,-.52,.36,.24,.31,true);for(let j=0;j<3;j++)cyl(cycle,j%2?P.jade:P.brass,0,.61+j*.04,-.52,.127,.127,.043);
  const rider=person(cycle,0,.239,-.10,0,'#c57b50','cycle');rider.body.rotation.x=.16;rider.legs.forEach(l=>l.userData.moves=true);
  for(const arm of rider.arms)arm.rotation.x=-.8;
  const V=(x,z)=>new T.Vector3(lot.x+x,roadY,lot.z+z);
  const route=new T.CurvePath();const hw=(lot.width-lot.roadWidth)/2,hd=(lot.depth-lot.roadWidth)/2,rr=.78;
  const points=[[-hw+rr,hd],[hw-rr,hd],[hw,hd-rr],[hw,-hd+rr],[hw-rr,-hd],[-hw+rr,-hd],[-hw,-hd+rr],[-hw,hd-rr]];
  const corners=[[hw,hd],[hw,-hd],[-hw,-hd],[-hw,hd]];
  for(let j=0;j<4;j++){
    const a=V(...points[j*2]),b=V(...points[j*2+1]),c=V(...points[(j*2+2)%8]);
    route.add(new T.LineCurve3(a,b));route.add(new T.QuadraticBezierCurve3(b,V(...corners[j]),c));
  }
  const routeLength=route.getLength();
  animate(cycle,t=>{const u=(t*1.20/routeLength+.12)%1,pos=route.getPoint(u),dir=route.getTangent(u);cycle.position.copy(pos);cycle.rotation.y=Math.atan2(dir.x,dir.z);for(let i=0;i<2;i++){wheelPivots[i].rotation.z=-t*4.7;rider.legs[i].rotation.x=.15+.38*Math.sin(t*5.2+i*Math.PI)}});
  tree(p,-4.54,3.10,.80);tree(p,4.53,-2.93,.67);
}
