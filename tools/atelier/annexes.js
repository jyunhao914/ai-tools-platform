import {T,palette as P,group,box,oval,cyl,rod,beam,tube,hoop,plate,panel,label,animate} from './craft.js';
import {shell,gable,railing,awning,sconce,pipes,airUnit,planter,ivy,skylight} from './architecture.js';
import {zinc,tiled} from './surfaces.js';
import {person,tree} from './street.js';

function tripod(p,x,z){
  const head=group(p,x,0,z,-.56);
  for(let i=0;i<3;i++){
    const a=i*2*Math.PI/3;
    rod(head,P.metal,[0,.68,0],[.25*Math.sin(a),.05,.25*Math.cos(a)],.022,.028);
  }
  cyl(head,P.brass,0,.72,0,.068,.061,.09);
  box(head,P.ink,0,.84,0,.25,.17,.18,true);
  rod(head,P.metal,[.035,.84,.09],[.035,.84,.22],.064,.078);
  oval(head,'#7baba9',.035,.84,.227,.053,.051,.009);
  box(head,P.cream,-.08,.94,-.016,.068,.024,.06);
}

export function cameraRental(p,a){
  const shop=group(p,-6.70,.20,.75),w=2.27,d=2.53,h=3.08;
  const f=shell(shop,w,d,h,
    {front:a.wall1,right:a.wall3,back:a.wall2,left:a.wall1},
    {front:{bw:1.88,bh:1.03,y:.60,art:a.rental,depth:.24}});
  gable(shop,w,d,h+.16,.60,zinc);
  awning(f.front,0,1.81,0,w+.06,.41);
  box(f.front,P.walnut,0,2.06,.07,w+.04,.38,.16,true);
  label(f.front,'攝影器材行',0,2.06,.159,w-.07,.30,'#773e32','#fff1d4',{rule:true});
  for(const s of [-1,1])sconce(f.front,s*1.04,1.45,.03);
  // A projecting enamel lens sign turns gently on its two-point suspension.
  beam(f.left,P.metal,[.73,2.71,.0],[.73,2.71,.64],.045);
  beam(f.left,P.metal,[.73,2.45,.0],[.73,2.71,.49],.03);
  const lens=group(f.left,.73,2.69,.39,Math.PI/2);
  rod(lens,P.brass,[-.115,0,0],[-.115,-.15,0],.012);
  rod(lens,P.brass,[.115,0,0],[.115,-.15,0],.012);
  for(const s of [-1,1]){
    rod(lens,P.metal,[0,-.39,0],[0,-.39,s*.074],.273,.26,36);
    hoop(lens,P.brass,0,-.39,s*.080,.222,.023);
    oval(lens,'#669b9e',0,-.39,s*.083,.182,.182,.023);
    oval(lens,P.cream,-.051,-.32,s*.106,.044,.032,.007);
  }
  animate(lens,t=>lens.rotation.z=.055*Math.sin(t*1.32));
  tripod(f.front,.66,.43);planter(f.front,-.90,.08,.32,.31,true);
  const balcony=group(f.back,0,1.84,.17);
  box(balcony,P.wood,0,0,0,1.91,.12,.39);railing(balcony,0,.06,.17,1.80);
  planter(balcony,-.63,.05,.07,.23);planter(balcony,.54,.05,.07,.26,true);
  airUnit(f.right,-.56,1.95,.12,.74);pipes(f.right,.97,.12,.10,3.08);ivy(f.left,-1.02,2.13,.06,.72);
}

function tapeDeck(face){
  const desk=group(face,-.97,2.00,-.06);
  box(desk,P.walnut,0,0,0,.75,.45,.17,true);
  box(desk,'#87908b',0,0,.095,.68,.38,.026);
  for(const x of [-.18,.17]){
    const reel=group(desk,x,.054,.13);
    rod(reel,P.walnut,[0,0,-.014],[0,0,.016],.127,.127,24);
    hoop(reel,P.brass,0,0,.025,.124,.012);
    for(let j=0;j<3;j++){
      const a=j*2*Math.PI/3;
      rod(reel,P.cream,[0,0,.031],[.119*Math.cos(a),.119*Math.sin(a),.031],.013);
    }
    oval(reel,P.metal,0,0,.044,.029,.029,.012);
    animate(reel,t=>reel.rotation.z=-1.28*t);
  }
  for(let j=0;j<5;j++)box(desk,j===1?P.red:P.cream,-.20+j*.087,-.132,.127,.065,.033,.025);
}

export function soundStudio(p,a){
  const studio=group(p,2.35,.20,-5.28,Math.PI),w=3.80,d=1.88,h=4.48;
  const f=shell(studio,w,d,h,
    {front:a.wall2,right:a.wall1,back:a.wall0,left:a.wall3},
    {front:{bw:2.86,bh:1.41,y:1.76,art:a.sound,depth:.35}});
  box(studio,P.metal,0,h+.17,0,w+.22,.12,d+.20);
  plate(studio,P.mint,0,h+.23,0,w+.17,d+.14,.10);
  for(const s of [-1,1]){
    box(f.front,P.jade,s*1.68,2.34,.045,.20,3.95,.16);
    for(let i=0;i<3;i++)box(f.front,P.brass,s*(1.51+i*.06),3.83,.13,.026,.79-i*.12,.04);
  }
  box(f.front,P.metal,0,1.57,.17,3.58,.31,.43,true);
  label(f.front,'聲音工作室',0,1.57,.39,2.40,.254,'#304d50','#ffebba');
  tapeDeck(f.front);sconce(f.front,1.38,1.25,.02);
  const alley=group(f.back,0,3.55,.10);
  box(alley,P.walnut,0,0,0,1.91,.49,.12,true);
  for(let i=0;i<14;i++){
    const bar=box(alley,i>10?P.clay:P.mint,(i-6.5)*.108,-.12,.075,.070,.12,.026);
    animate(bar,t=>{
      const level=.045+.24*Math.abs(Math.cos(i*.43+t*1.42)*Math.sin(i*.61+t*2.08));
      bar.scale.y=level;bar.position.y=-.16+level/2;
    });
  }
  const roof=group(studio,-.88,h+.34,0);
  box(roof,P.jade,0,.23,0,.84,.43,.67,true);
  // Roof monitor in a steel yoke, legible from both streets.
  for(const side of [-1,1])rod(roof,P.brass,[side*.23,.44,0],[side*.23,.82,0],.030);
  oval(roof,P.metal,0,.88,0,.207,.36,.17);
  for(let j=-3;j<=3;j++){
    const offset=j*.071,radius=.210*Math.sqrt(1-(offset/.36)**2);
    const grille=hoop(roof,j%2?P.brass:P.cream,0,.88+offset,0,radius,.010);
    grille.rotation.x=Math.PI/2;grille.scale.y=.84;
  }
  rod(roof,P.brass,[-.24,.81,0],[.24,.81,0],.042);
  skylight(studio,.83,h+.33,.03,.91,.77);
  pipes(f.left,.74,.10,.10,h);airUnit(f.right,-.46,2.56,.11,.75);
  planter(f.front,-1.62,.07,.39,.29,true);
}

function bench(p,x,z,w){
  for(const side of [-1,1]){
    box(p,P.metal,x+side*.36*w,.20,z,.065,.38,.30);
    beam(p,P.metal,[x+side*.36*w,.20,z+.10],[x+side*.36*w,.66,z+.20],.042);
  }
  for(let k=0;k<3;k++)box(p,P.wood,x,.38,z-.13+k*.12,w,.065,.095,true);
  for(let k=0;k<2;k++)box(p,P.wood,x,.50+k*.115,z+.19,w,.083,.044,true);
}

export function screeningYard(p,screen){
  const yard=group(p,-6.10,.211,-3.70,Math.PI);
  for(const s of [-1,1]){
    box(yard,P.ink,s*1.29,1.26,0,.105,2.51,.105);
    box(yard,P.brass,s*1.29,.11,0,.23,.21,.23,true);
    beam(yard,P.metal,[s*1.29,2.14,0],[s*1.29,2.52,.45],.049);
  }
  box(yard,P.metal,0,1.59,.02,2.55,1.48,.11,true);
  panel(yard,screen,0,1.59,.088,2.42,1.36);
  const cover=box(yard,P.jade,0,2.53,.13,2.83,.10,.74);
  cover.rotation.x=.10;box(yard,P.brass,0,2.45,.49,2.84,.075,.045);
  bench(yard,-.70,1.58,1.12);bench(yard,.70,1.58,1.12);
  const viewer=person(yard,.78,.04,1.57,Math.PI-.12,P.blue,'read');
  viewer.hips.position.y=.44;
  viewer.legs.forEach(l=>l.rotation.x=-.97);
  animate(viewer.head,t=>viewer.head.rotation.y=.10*Math.sin(t*.46));
  planter(yard,-1.44,.01,.13,.42,true);planter(yard,1.47,.01,.04,.41);
  tree(p,-7.41,-5.99,.73);tree(p,-1.13,-5.78,.82);
  const path=group(p,-.04,.201,-3.92);
  for(let i=0;i<20;i++){
    const x=-4.11+i*.43;
    box(path,i%4===0?'#aaa396':'#bfb39c',x,.005,0,.405,.012,.46);
  }
  for(let i=0;i<11;i++)box(p,'#b2ab98',-5.12,.205,-3.45+i*.49,.42,.015,.46);
  const alleyReader=person(p,-.58,.22,-5.33,-.71,P.clay,'read');
  animate(alleyReader.head,t=>alleyReader.head.rotation.x=-.12+.07*Math.sin(t*.71));
}
