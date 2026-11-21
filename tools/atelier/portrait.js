// Shared portrait meshes keep the crowd inexpensive. The UV seam sits behind the head.
import {T,mesh,oval,makeCanvas,painted,canvasMap} from './craft.js';

const cache=new Map();
const surfaces=new Map();let weave;
export function personMaterial(color,kind){
  const key=kind+color;if(surfaces.has(key))return surfaces.get(key);
  const m=new T.MeshStandardMaterial({color,roughness:kind==='hair'?.46:kind==='skin'?.62:.95});
  if(kind==='fabric'){
    if(!weave){weave=canvasMap(makeCanvas(48,48,(c,w,h)=>{
      c.fillStyle='#a4a4a4';c.fillRect(0,0,w,h);
      for(let i=0;i<48;i+=4){c.fillStyle='#bdbdbd';c.fillRect(i,0,1,h);c.fillStyle='#888';c.fillRect(0,i,w,1);}
    }));weave.colorSpace=T.NoColorSpace;weave.wrapS=weave.wrapT=T.RepeatWrapping;weave.repeat.set(3,4);}
    m.bumpMap=weave;m.bumpScale=.00032;
  }
  surfaces.set(key,m);return m;
}
const rings=[[-.116,.031,.042],[-.101,.053,.061],[-.075,.072,.074],[-.042,.085,.080],[-.006,.092,.084],[.025,.095,.086],[.063,.092,.085],[.090,.073,.074],[.106,.043,.050],[.110,.004,.007]];
function headGeometry(){
  const geo=new T.LatheGeometry(rings.map(([y,r])=>new T.Vector2(r,y)),48,Math.PI);
  const pos=geo.attributes.position,uv=geo.attributes.uv;
  for(let n=0;n<pos.count;n++){
    const [y,r,d]=rings[n%rings.length],x=pos.getX(n),front=pos.getZ(n)/r;
    let z=front*d;
    if(front>0){
      const bell=(xx,yy,sx,sy)=>Math.exp(-(((x-xx)/sx)**2+((y-yy)/sy)**2));
      z+=front*(.020*bell(0,-.012,.014,.041)+.016*bell(0,-.03,.018,.013)
        +.007*bell(.056,-.033,.023,.02)+.007*bell(-.056,-.033,.023,.02));
    }
    pos.setZ(n,z);uv.setY(n,(y+.116)/.226);
  }
  geo.computeVertexNormals();return geo;
}
function complexion(skin,hair,variant){
  return painted(makeCanvas(512,384,(c,w,h)=>{
    c.fillStyle=skin;c.fillRect(0,0,w,h);
    const x=u=>256+u,y=v=>(.110-v)*h/.226;
    function haze(cx,cy,r,color){const g=c.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(cx-r,cy-r,r*2,r*2);}
    for(const s of [-1,1]){
      haze(x(s*48),y(-.030),34,'rgba(189,103,93,.34)');
      c.save();c.translate(x(s*30),y(.005));c.scale(s,1);c.rotate(-.085);
      c.fillStyle='#efe4d6';c.beginPath();c.moveTo(-12,0);c.quadraticCurveTo(0,-8.5,13,-1);c.quadraticCurveTo(4,7,-12,0);c.fill();
      c.fillStyle='#483b35';c.beginPath();c.ellipse(1,-.5,4.9,4.5,0,0,7);c.fill();c.fillStyle='#fcf4de';c.fillRect(-1,-3,2,2);
      c.strokeStyle=hair;c.lineWidth=2.2;c.beginPath();c.moveTo(-12,0);c.quadraticCurveTo(0,-8,14,-1.4);c.stroke();
      c.lineWidth=3.7;c.lineCap='round';c.beginPath();c.moveTo(-11,-16);c.quadraticCurveTo(2,-21-variant%3,13,-16.5);c.stroke();c.restore();
    }
    haze(256,y(-.031),9,'rgba(195,99,80,.27)');
    c.strokeStyle='#975f59';c.lineWidth=2.5;c.beginPath();c.moveTo(241,y(-.059));c.quadraticCurveTo(255,y(-.066),271,y(-.058));c.stroke();
    haze(256,y(-.073),11,'rgba(255,218,198,.35)');
  }));
}
function hairGeometry(style){
  const g=new T.SphereGeometry(1,36,16);const pos=g.attributes.position;
  for(let i=0;i<pos.count;i++){
    const u=g.attributes.uv.getX(i),v=g.attributes.uv.getY(i),a=u*Math.PI*2;
    const front=Math.sin(a),end=1.83-.64*front+.10*Math.sin(a*2+style)+.19*Math.pow(Math.max(0,front),3)*Math.sin(a*2.5+style);
    const phi=(1-v)*end;
    pos.setXYZ(i,-.098*Math.cos(a)*Math.sin(phi),.015+.106*Math.cos(phi),-.008+.093*Math.sin(a)*Math.sin(phi));
  }
  g.computeVertexNormals();return g;
}
let faceShape;
export function portrait(head,skin,hair,variant){
  if(!cache.has(variant))cache.set(variant,{face:complexion(skin,hair,variant),cap:hairGeometry(variant)});
  const {face,cap}=cache.get(variant);
  face.roughness=.61;mesh(head,faceShape??=headGeometry(),face);mesh(head,cap,personMaterial(hair,'hair'));
  for(const s of [-1,1])oval(head,personMaterial(skin,'skin'),s*.088,-.014,-.001,.012,.022,.011);
  if(variant===1||variant===4){
    const knot=oval(head,personMaterial(hair,'hair'),.008,.001,-.092,.040,.047,.038);knot.rotation.x=.35;
  }
}
