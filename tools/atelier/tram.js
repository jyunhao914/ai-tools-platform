import {T, palette as P, group, box, oval, cyl, rod, beam, hoop, plate, panel, label, painted, makeCanvas, drawNoise, contact, animate} from './craft.js';
import {person} from './street.js';

const RUN=8.0, STOP=3.35, LEG=RUN+STOP, DOOR=-.79;
const STEP=.33, PLATFORM=.21, WHEEL=.134, RAIL_Y=.091;
const amber='#e99a4a', enamel='#ae543e', dark='#354440';
const glass=new T.MeshStandardMaterial({color:'#b1d8d3',transparent:true,opacity:.20,roughness:.28,metalness:.16,depthWrite:false,side:T.DoubleSide});
const ease=(x)=>{const u=Math.max(0,Math.min(1,x));return u*u*(3-2*u)};

// A constant-speed middle section and equal acceleration/braking ramps at the termini.
function travel(u){
  const ramp=.19;
  if(u<ramp)return u*u/(2*ramp*(1-ramp));
  if(u>1-ramp)return 1-(1-u)**2/(2*ramp*(1-ramp));
  return (u-ramp/2)/(1-ramp);
}
function service(elapsed,west,east) {
  const leg=Math.floor(elapsed/LEG),phase=elapsed-leg*LEG;
  const eastbound=leg%2===0,depart=eastbound?west:east,arrive=eastbound?east:west;
  const u=Math.min(1,phase/RUN),atStop=Math.max(0,phase-RUN);
  return {
    leg,phase,eastbound,x:depart+(arrive-depart)*travel(u),
    speed:Math.min(1,u/.19,(1-u)/.19),
    door:ease((atStop-.08)/.48)*(1-ease((atStop-2.67)/.50))
  };
}
function buildWay(p,lot,track,west,east){
  const half=lot.width/2, left=lot.x-half+.23, right=lot.x+half-.23;
  const ballast=painted(makeCanvas(1024,128,(g,w,h)=>{
    g.fillStyle='#a49b8b';g.fillRect(0,0,w,h);drawNoise(g,w,h,43000,.58);
  }));
  const bed=panel(p,ballast,lot.x,.031,track,right-left,.93);bed.rotation.x=-Math.PI/2;
  for(let x=left+.06;x<right;x+=.22)box(p,P.walnut,x,.049,track,.090,.042,.63);
  for(const offset of [-.218,.218]){
    box(p,dark,lot.x,.069,track+offset,right-left,.040,.058);
    box(p,'#a5aaa2',lot.x,RAIL_Y-.007,track+offset,right-left,.014,.046);
  }
  for(const [edge,sign] of [[left,1],[right,-1]]){
    for(const side of [-1,1])beam(p,P.metal,[edge+sign*.12,.08,track+side*.22],[edge+sign*.24,.33,track+side*.22],.060);
    box(p,enamel,edge+sign*.22,.32,track,.091,.104,.66,true);
    // Planked access behind the buffer; visitors can reach the outer platform off the rails.
    for(let k=0;k<5;k++)box(p,P.wood,edge+sign*.04,.072,track-.34+k*.184,.19,.065,.17);
  }
  box(p,'#bbb39a',lot.x,.055,track-.50,lot.width-.42,.09,.082,true);
  // The wire is straight above the current collector; the support arms stay outside the car envelope.
  const wireY=1.94;
  for(const x of [left+.38,lot.x-.20,right-.38]){
    cyl(p,P.jade,x,.98,track-.50,.026,.051,1.89,12);
    cyl(p,P.metal,x,.18,track-.50,.073,.080,.29,12);
    rod(p,P.metal,[x,wireY+.075,track-.50],[x,wireY+.075,track+.07],.022);
    beam(p,P.jade,[x,wireY-.33,track-.50],[x,wireY+.064,track-.055],.027);
    cyl(p,P.cream,x,wireY+.041,track,.037,.035,.067,12);
  }
  rod(p,'#4c4a40',[left,wireY,track],[right,wireY,track],.010,.010,6);
  function stop(x,name,side) {
    const center=x-.32,length=3.14,front=track+.79;
    plate(p,'#a29682',center,.018,front,length,.65,PLATFORM-.018,.08);
    box(p,'#dec18a',center,PLATFORM+.006,track+.485,length-.10,.013,.057);
    for(let k=0;k<16;k++)box(p,'#b3a38c',center-length*.45+k*length*.06,PLATFORM+.007,front+.13,.012,.012,.29);
    const poleX=center+side*1.31;
    cyl(p,P.metal,poleX,PLATFORM+.55,front+.14,.024,.04,1.1,12);
    box(p,P.jade,poleX,PLATFORM+.96,front+.14,.51,.32,.066,true);
    label(p,name,poleX,PLATFORM+.96,front+.18,.46,.25,'#345d53','#fff0c8');
    const lamp=new T.MeshBasicMaterial({color:'#81634f'});
    oval(p,lamp,poleX,PLATFORM+1.18,front+.14,.043,.044,.041);
    return lamp;
  }
  return [stop(west,'設計街',-1),stop(east,'放映巷',1)];
}

function buildCar(p,track){
  const car=group(p,0,0,track);
  contact(car,0,0,3.42,1.03,.096);
  const wheels=[];
  for(const x of [-.99,.99]){
    rod(car,P.ink,[x,RAIL_Y+WHEEL,-.28],[x,RAIL_Y+WHEEL,.28],.045);
    for(const side of [-1,1]){
      const axle=group(car,x,RAIL_Y+WHEEL,side*.218);
      rod(axle,'#454b49',[0,0,-.034],[0,0,.034],WHEEL,WHEEL,22);
      hoop(axle,'#acaba0',0,0,side*.040,WHEEL-.014,.012);
      for(let j=0;j<3;j++){
        const a=j*Math.PI/3,dx=.101*Math.cos(a),dy=.101*Math.sin(a);
        rod(axle,P.metal,[-dx,-dy,side*.045],[dx,dy,side*.045],.015);
      }
      axle.userData.moves=true;wheels.push(axle);
    }
  }
  box(car,dark,0,.268,0,2.91,.11,.54,true);
  const body=group(car);
  plate(body,P.walnut,0,STEP-.06,0,3.13,.80,.06,.11);
  box(body,P.wood,0,STEP+.013,0,2.94,.027,.70);
  for(const x of [-.38,.23,.86]){
    box(body,P.wood,x,.53,-.19,.38,.05,.24,true);
    box(body,'#796346',x,.67,-.298,.38,.24,.046,true);
  }
  const doors=[];
  for(const side of [-1,1]){
    const face=group(body,0,0,side*.375,side===1?0:Math.PI);
    const doorX=DOOR*side, gap=.61, edge=1.49;
    for(const [from,to] of [[-edge,doorX-gap/2],[doorX+gap/2,edge]]){
      const midpoint=(from+to)/2,w=to-from;
      box(face,enamel,midpoint,.546,0,w,.406,.047,true);
      box(face,'#e4ba79',midpoint,.405,.029,w,.022,.017);
      box(face,P.cream,midpoint,.754,.006,w,.065,.064);
      panel(face,glass,midpoint,.988,.005,w-.022,.409);
      const panes=Math.max(1,Math.round(w/.39));
      for(let k=0;k<=panes;k++)box(face,P.cream,from+k*w/panes,.989,.017,.036,.45,.047);
      box(face,P.wood,midpoint,1.15,.026,w,.022,.028);
    }
    for(const s of [-1,1]){
      const leaf=group(face,doorX+s*gap/4,0,.052);
      box(leaf,'#784e39',0,.59,0,gap/2-.012,.49,.042,true);
      box(leaf,'#a76748',0,.55,.023,.229,.28,.014,true);
      panel(leaf,glass,0,1.018,0,.217,.335);
      for(let edge of [-1,1])box(leaf,P.wood,edge*.127,1.008,0,.031,.39,.031);
      box(leaf,P.wood,0,1.195,0,.287,.035,.036);
      if(side===1){leaf.userData.moves=true;doors.push({leaf,closed:leaf.position.x,s})}
    }
    box(face,P.cream,0,1.239,0,3.07,.089,.066,true);
    label(face,'巡迴放映',side*.48,.56,.028,.81,.191,'#a74e39','#fff0cc',{size:.79});
  }
  const lamps=[];
  for(const side of [-1,1]){
    const cab=group(body,side*1.50,0,0,side*Math.PI/2);
    box(cab,enamel,0,.57,0,.73,.46,.10,true);
    box(cab,P.cream,0,.794,0,.756,.068,.12,true);
    panel(cab,glass,0,.995,.005,.66,.365);
    for(const x of [-.341,0,.341])box(cab,P.cream,x,1.00,.015,.034,.438,.065);
    box(cab,P.cream,0,1.228,0,.75,.096,.11,true);
    const lamp=new T.MeshBasicMaterial({color:'#ffe6a2'});lamps.push(lamp);
    rod(cab,P.brass,[0,.63,.044],[0,.63,.092],.090,.080,18);
    oval(cab,lamp,0,.63,.097,.064,.061,.021);
    box(cab,dark,0,.323,0,.73,.067,.16,true);
    rod(cab,P.metal,[0,.288,.072],[0,.288,.21],.036);
    label(cab,'放映線',0,1.227,.062,.43,.085,'#35564e','#fff0cb');
    const crew=person(body,side*1.18,.342,-.05,side*Math.PI/2,P.jade);
    crew.root.scale.setScalar(.84);
    crew.body.rotation.x=.08;
  }
  plate(body,P.jade,0,1.276,0,3.22,.91,.078,.122);
  plate(body,'#b7c6af',0,1.353,0,3.10,.79,.066,.13);
  for(const x of [-.96,.98]){
    box(body,'#7d918c',x,1.458,0,.37,.093,.33,true);
    for(let j=0;j<5;j++)box(body,P.metal,x-.12+j*.059,1.505,0,.019,.014,.232);
  }
  for(const z of [-.072,.072]){
    beam(body,P.ink,[-.28,1.423,z],[.16,1.704,z],.028);
    beam(body,P.metal,[.16,1.704,z],[-.10,1.905,z],.024);
  }
  rod(body,P.brass,[-.10,1.924,-.17],[-.10,1.924,.17],.016);
  car.userData.moves=true;body.userData.moves=true;
  return {car,body,wheels,doors,lamps};
}
function passenger(p,east,track,stopX) {
  const actor=person(p,0,STEP,track,0,east?'#637d92':'#c18153');
  actor.root.scale.setScalar(.91);
  contact(actor.root,0,0,.41,.31,.008);
  actor.root.userData.moves=true;
  actor.legs.forEach(leg=>leg.userData.moves=true);
  actor.arms.forEach(arm=>arm.userData.moves=true);
  return (state,t)=>{
    // Each passenger spends one round trip at their home stop, then one on board.
    const segment=(state.leg+(east?0:3))%4;
    const crossing=ease((state.phase-RUN-.63)/1.58);
    let outside=0;
    if(segment===0)outside=crossing;
    if(segment===1)outside=1;
    if(segment===2)outside=1-crossing;
    const aisle=east?.135:-.135,platformSpot=east?.44:-.32;
    const homeDoor=stopX+DOOR, movingDoor=state.x+DOOR;
    // Walk straight through the door before turning along the platform.
    const platformX=homeDoor+platformSpot*ease((outside-.62)/.38);
    const carX=movingDoor+aisle*(1-ease(outside/.45));
    actor.root.position.set(
      T.MathUtils.lerp(carX,platformX,outside),
      T.MathUtils.lerp(STEP+.012,PLATFORM,ease((outside-.42)/.34)),
      track+T.MathUtils.lerp(east?-.12:.13,.84,outside)
    );
    const stride=Math.sin(t*9)*Math.sin(Math.PI*outside);
    actor.legs.forEach((leg,i)=>leg.rotation.x=(i?1:-1)*.43*stride);
    actor.arms.forEach((arm,i)=>arm.rotation.x=(i?-1:1)*.27*stride);
    actor.root.rotation.y=segment===0 ? Math.PI*ease((outside-.77)/.23) : Math.PI;
  };
}
export function addTramLine(p,lot) {
  const track=lot.z+lot.depth/2+.55;
  const west=lot.x-lot.width/2+2.26,east=lot.x+lot.width/2-2.26;
  const signals=buildWay(p,lot,track,west,east);
  const {car,body,wheels,doors,lamps}=buildCar(p,track);
  const riders=[passenger(p,false,track,west),passenger(p,true,track,east)];
  let wasEastbound;
  animate(null,t=>{
    const state=service(t+3.0,west,east);
    car.position.x=state.x;
    body.rotation.z=.0028*Math.sin((state.x-west)*6.0)*state.speed;
    for(const axle of wheels)axle.rotation.z=-(state.x-west)/WHEEL;
    for(const {leaf,closed,s} of doors)leaf.position.x=closed+s*.301*state.door;
    if(wasEastbound!==state.eastbound){
      lamps[0].color.set(state.eastbound?'#e57a56':'#ffe8a8');
      lamps[1].color.set(state.eastbound?'#ffe8a8':'#e57a56');
      wasEastbound=state.eastbound;
    }
    signals.forEach((lamp,i)=>lamp.color.set(i===Number(state.eastbound)&&state.door>.06?'#b4edc7':'#89715b'));
    riders.forEach(move=>move(state,t));
  });
}
