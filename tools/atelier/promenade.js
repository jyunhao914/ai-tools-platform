import {T,group,box,rod,oval,cyl,panel,tube,painted,makeCanvas,animate,batch} from './craft.js';
const turquoise='#008e91',coral='#e15c48',honey='#f2ac42',ivory='#fff1cc',red='#ad4941';
function marqueeArt(){
  return painted(makeCanvas(1536,256,(c,w,h)=>{
    c.fillStyle='#127876';c.fillRect(0,0,w,h);
    c.strokeStyle='#e8ab53';c.lineWidth=6;c.strokeRect(12,12,w-24,h-24);
    c.textAlign='center';c.textBaseline='middle';c.fillStyle='#092f43';c.font='800 145px "PingFang TC",sans-serif';c.fillText('AI 工具資源平台',w/2+3,h*.54+5);
    c.fillStyle='#fff4d2';c.fillText('AI 工具資源平台',w/2,h*.54);
    for(const x of [85,w-85]){c.save();c.translate(x,h*.52);c.rotate(Math.PI/4);c.fillStyle='#ffc66a';c.fillRect(-16,-16,32,32);c.restore();}
  }),true);
}
export function promenade(scene){
  const set=group(scene),arch=group(set,-20.95,0,5.31,-Math.PI/2),sign=marqueeArt();
  const bulbs=Array.from({length:4},()=>new T.MeshBasicMaterial({color:'#ffdf8e'}));
  for(const s of [-1,1]){
    box(arch,turquoise,s*2.58,1.61,0,.17,3.22,.20,true);
    box(arch,coral,s*2.58,.26,0,.31,.48,.31,true);
    tube(arch,honey,[[s*2.59,2.65,0],[s*2.55,3.11,0],[s*2.25,3.36,0],[s*1.92,3.42,0]],.077);
  }
  // An enamel film reel on each pier gives the entrance a silhouette from either side.
  for(const s of [-1,1]){
    const reel=group(arch,s*2.52,3.47,.16);
    const disc=cyl(reel,honey,0,0,0,.238,.238,.09,32);disc.rotation.x=Math.PI/2;
    for(let i=0;i<5;i++){const a=i*2*Math.PI/5;oval(reel,'#a75039',Math.cos(a)*.136,Math.sin(a)*.136,.054,.047,.047,.014);}
    oval(reel,ivory,0,0,.068,.043,.043,.015);animate(reel,t=>reel.rotation.z=s*t*.39);
    for(let k=0;k<3;k++)rod(arch,ivory,[s*2.57+(k-1)*.035,.52,.108],[s*2.57+(k-1)*.035,2.74,.108],.009);
  }
  for(const [x,z,side,base,c1,c2] of [[-22.05,2.54,1,1.94,'#e46a50','#fff1cc'],[-16.95,8.24,-1,2.06,'#ebac39','#f7e8b8']]){
    const booth=group(set,x,0,z,side===1?0:Math.PI);
    for(let j=0;j<14;j++){
      const color=j%2?c1:c2,xx=(j-6.5)*.235;
      const aw=box(booth,color,xx,base,.20,.235,.038,.66);aw.rotation.x=.19;
      box(booth,color,xx,base-.12,.515,.235,.14,.036);
      oval(booth,color,xx,base-.19,.518,.117,.065,.02);
    }
  }
  box(arch,coral,0,3.53,0,5.11,.62,.22,true);
  for(const s of [-1,1]){const f=group(arch,0,3.53,s*.118,s===1?0:Math.PI);panel(f,sign,0,0,.01,4.95,.55);
    for(let j=0;j<26;j++)oval(f,bulbs[j%4],-2.41+j*.193,-.33,.035,.031,.032,.024);}
  for(const x of [-18.5,-13.7,-8.8]){const ribbon=group(set,x,0,5.3,Math.PI/2);
    tube(ribbon,'#73685b',[[-2.82,3.59,0],[0,3.31,0],[2.82,3.62,0]],.011);
    for(let j=0;j<12;j++){const s=-2.62+j*.46;
      const flag=group(ribbon,s,3.31+.28*(s/2.8)**2,0);const geo=new T.BufferGeometry();
      geo.setAttribute('position',new T.Float32BufferAttribute([-.12,0,0,.12,0,0,0,-.235,.014],3));geo.computeVertexNormals();
      const material=new T.MeshStandardMaterial({color:[coral,honey,turquoise,'#ebc6a1'][j%4],side:T.DoubleSide,roughness:.73});
      flag.add(new T.Mesh(geo,material));animate(flag,t=>flag.rotation.x=Math.sin(t*2+j*.62)*.19+.13);}
  }
  const wheel=group(set,43.5,0,5.35,-Math.PI/2),radius=4.62;
  for(const z of [-.76,.76]){for(const s of [-1,1])rod(wheel,turquoise,[s*2.05,.1,z],[0,5.65,z*.58],.11,.08);}
  const spin=group(wheel,0,5.65,0);
  for(const z of [-.32,.32]){const pts=[];for(let j=0;j<=48;j++){const a=j*Math.PI/24;pts.push([radius*Math.cos(a),radius*Math.sin(a),z]);}tube(spin,ivory,pts,.055);}
  for(let j=0;j<16;j++){const a=j*Math.PI/8,x=radius*Math.cos(a),y=radius*Math.sin(a);
    rod(spin,j%2?ivory:coral,[0,0,0],[x,y,.32],.034);rod(spin,ivory,[x,y,-.34],[x,y,.34],.045);
    const car=group(spin,x,y,0);box(car,[turquoise,coral,honey][j%3],0,-.46,0,.46,.44,.52,true);box(car,'#668e96',0,-.27,0,.44,.19,.49,true);
    animate(car,t=>car.rotation.z=-t*.075);}
  animate(spin,t=>spin.rotation.z=t*.075);
  animate(null,t=>bulbs.forEach((m,i)=>m.color.setRGB(1,.58+.27*Math.cos(t*3.1-i*1.57),.27+.14*Math.cos(t*3.1-i*1.57))));
  batch(set);return set;
}
