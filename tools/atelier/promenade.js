import {T,group,box,rod,oval,tube,animate,batch} from './craft.js';
const turquoise='#008e91',coral='#e15c48',honey='#f2ac42',ivory='#fff1cc';
export function promenade(scene){
  const set=group(scene);
  for(const [x,z,side,base,c1,c2] of [[-22.05,2.54,1,1.94,'#e46a50','#fff1cc'],[-16.95,8.24,-1,2.06,'#ebac39','#f7e8b8']]){
    const booth=group(set,x,0,z,side===1?0:Math.PI);
    for(let j=0;j<14;j++){
      const color=j%2?c1:c2,xx=(j-6.5)*.235;
      const aw=box(booth,color,xx,base,.20,.235,.038,.66);aw.rotation.x=.19;
      box(booth,color,xx,base-.12,.515,.235,.14,.036);
      oval(booth,color,xx,base-.19,.518,.117,.065,.02);
    }
  }
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
  batch(set);return set;
}
