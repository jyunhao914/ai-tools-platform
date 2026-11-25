import * as T from './three.js';
import { RoundedBoxGeometry } from './rounded.js';
import { mergeGeometries } from './merge.js';

export { T };
let state = 833205;
export function rand() {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state / 4294967296;
}
export const palette = {
  ink: '#303c41', metal: '#495958', brass: '#c79a5f', jade: '#237f85',
  mint: '#a3cbc6', cream: '#f4f1e6', red: '#a74636', clay: '#e47459',
  wood: '#956144', walnut: '#4e3e34', paper: '#fff2d7', blue: '#456f9e',
};
const solids = new Map();
let vertexPaint;
// Fine gouache grain and edge wear keep painted wood, enamel, and people in the same visual world as the elevations.
let pigment;
function paintGrain(){
  if(pigment)return pigment;
  const c=makeCanvas(192,192,(g,w,h)=>{
    g.fillStyle='#fffcf5';g.fillRect(0,0,w,h);
    const wash=g.createLinearGradient(0,0,w,h);wash.addColorStop(0,'#b6bac021');wash.addColorStop(.4,'#ffffff00');wash.addColorStop(1,'#8e948820');g.fillStyle=wash;g.fillRect(0,0,w,h);
    drawNoise(g,w,h,7500,.045);g.fillStyle='#c4b8a721';g.fillRect(0,h-3,w,3);g.fillStyle='#fffbee';g.fillRect(2,1,w-4,1);
    for(let i=0;i<50;i++){g.fillStyle=i%2?'#9e978816':'#fff7de28';g.fillRect(rand()*w,rand()*h,1+rand()*4,1)}
  });
  pigment=canvasMap(c);return pigment;
}
export function mat(value) {
  if (value?.isMaterial) return value;
  if (!solids.has(value)) {
    const material = new T.MeshStandardMaterial({color:value, map:paintGrain(), roughness:.76});
    material.userData.paintColor = true;
    solids.set(value,material);
  }
  return solids.get(value);
}
export function group(parent, x=0, y=0, z=0, yaw=0) {
  const node = new T.Group();
  parent.add(node);
  node.position.set(x,y,z);
  node.rotation.y=yaw;
  return node;
}
export const movement=[];
export function animate(node, fn) {
  if (node) node.userData.moves=true;
  movement.push(fn);
  return node;
}
export function mesh(p, geometry, material, x=0,y=0,z=0) {
  const object=new T.Mesh(geometry,mat(material));
  p.add(object); object.position.set(x,y,z);
  object.castShadow = !object.material.transparent && !object.material.isMeshBasicMaterial;
  object.receiveShadow = !object.material.isMeshBasicMaterial;
  return object;
}
const block=new T.BoxGeometry(1,1,1);
const bevel=new RoundedBoxGeometry(1,1,1,1,.065);
const globe=new T.SphereGeometry(1,12,10);
export function box(p,m,x,y,z,w,h,d,soft=false) {
  const n=mesh(p,soft?bevel:block,m,x,y,z);n.scale.set(w,h,d);return n;
}
export function oval(p,m,x,y,z,w,h,d) {
  const n=mesh(p,globe,m,x,y,z);n.scale.set(w,h,d);return n;
}
export function cyl(p,m,x,y,z,rt,rb,h,n=20) {
  return mesh(p,new T.CylinderGeometry(rt,rb,h,n),m,x,y,z);
}
export function rod(p,m,a,b,r,rb=r,n=8) {
  const s=new T.Vector3(...a),delta=new T.Vector3(...b).sub(s);
  const o=cyl(p,m,0,0,0,r,rb,delta.length(),n);
  o.position.copy(s).addScaledVector(delta,.5);
  o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());
  return o;
}
export function beam(p,m,a,b,w,d=w) {
  const s=new T.Vector3(...a),delta=new T.Vector3(...b).sub(s);
  const o=box(p,m,0,0,0,w,delta.length(),d);
  o.position.copy(s).addScaledVector(delta,.5);
  o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());
  return o;
}
export function tube(p,m,coords,r=.025) {
  const c=new T.CatmullRomCurve3(coords.map(pt=>new T.Vector3(...pt)),false,'centripetal');
  return mesh(p,new T.TubeGeometry(c,Math.max(10,coords.length*4),r,6,false),m);
}
export function hoop(p,m,x,y,z,r,wire=.027) {
  return mesh(p,new T.TorusGeometry(r,wire,8,44),m,x,y,z);
}
export function panel(p,m,x,y,z,w,h,uv=null) {
  const geo=new T.PlaneGeometry(w,h);
  if(uv) {
    const coords=geo.attributes.uv;
    for(let i=0;i<coords.count;i++)coords.setXY(i,uv[0]+coords.getX(i)*(uv[2]-uv[0]),uv[1]+coords.getY(i)*(uv[3]-uv[1]));
  }
  return mesh(p,geo,m,x,y,z);
}
export function plate(p,m,x,y,z,w,d,h,r=.08) {
  const s=new T.Shape(),a=w/2,b=d/2;
  s.moveTo(-a+r,-b);s.lineTo(a-r,-b);s.quadraticCurveTo(a,-b,a,-b+r);s.lineTo(a,b-r);s.quadraticCurveTo(a,b,a-r,b);s.lineTo(-a+r,b);s.quadraticCurveTo(-a,b,-a,b-r);s.lineTo(-a,-b+r);s.quadraticCurveTo(-a,-b,-a+r,-b);
  const geo=new T.ExtrudeGeometry(s,{depth:h,bevelEnabled:false,curveSegments:6});
  geo.rotateX(-Math.PI/2);
  return mesh(p,geo,m,x,y,z);
}
export function makeCanvas(w,h,draw) {
  const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);return c;
}
export function canvasMap(c) {
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;return tex;
}
export function painted(canvas,unlit=false) {
  const map=canvasMap(canvas);
  return unlit?new T.MeshBasicMaterial({map}):new T.MeshStandardMaterial({map,roughness:.88});
}
export function label(p,words,x,y,z,w,h,bg,fg,opts={}) {
  const pixels=Math.min(1024,Math.max(192,Math.ceil(w*320))),ph=Math.max(56,Math.round(pixels*h/w));
  const art=makeCanvas(pixels,ph,(g,width,height)=>{
    g.fillStyle=bg;g.fillRect(0,0,width,height);
    if(opts.rule){g.strokeStyle=fg;g.globalAlpha=.55;g.lineWidth=Math.max(2,height*.022);g.strokeRect(8,8,width-16,height-16);g.globalAlpha=1}
    let size=height*(opts.size||.72);
    const family=opts.serif?'"Songti TC","Noto Serif TC",serif':'"PingFang TC","Microsoft JhengHei",sans-serif';
    g.font='700 '+size+'px '+family;
    size*=Math.min(1,width*.91/g.measureText(words).width);
    g.font='700 '+size+'px '+family;g.textAlign='center';g.textBaseline='middle';g.fillStyle=fg;
    g.fillText(words,width/2,height*.53);
  });
  return panel(p,painted(art,true),x,y,z,w,h);
}
export function drawNoise(g,w,h,count,alpha=.12) {
  g.save();
  for(let i=0;i<count;i++){g.fillStyle=rand()<.5?'#fff8db':'#403f43';g.globalAlpha=rand()*alpha;g.fillRect(rand()*w,rand()*h,.5+rand()*2,.5+rand()*2)}
  g.restore();
}
export function contact(p,x,z,w,d,y=.005) {
  const o=panel(p,shadowPaint,x,y,z,w,d);
  o.rotation.x=-Math.PI/2;o.castShadow=false;o.receiveShadow=false;return o;
}
const shadowPaint=new T.MeshBasicMaterial({transparent:true,depthWrite:false,map:canvasMap(makeCanvas(128,128,(g)=>{
  const grad=g.createRadialGradient(64,64,5,64,64,63);
  grad.addColorStop(0,'rgba(39,40,47,.35)');grad.addColorStop(.5,'rgba(39,40,47,.17)');grad.addColorStop(1,'rgba(39,40,47,0)');
  g.fillStyle=grad;g.fillRect(0,0,128,128);
}))});
// Batch the permanent architecture independently of each animated pivot.
export function batch(root) {
  vertexPaint ??= new T.MeshStandardMaterial({map:paintGrain(),vertexColors:true,roughness:.76});
  root.updateWorldMatrix(true,true);
  const anchors=[root]; root.traverse(o=>{if(o!==root&&o.userData.moves)anchors.push(o)});
  for(const anchor of anchors) {
    const inv=anchor.matrixWorld.clone().invert(), sets=new Map();
    function collect(o) {
      for(const child of o.children.slice()){
        if(child.userData.moves)continue;
        if(child.isMesh && child.material && !Array.isArray(child.material)){
          const material=child.material.userData.paintColor ? vertexPaint : child.material;
          const key=material.uuid+child.castShadow+child.receiveShadow;
          if(!sets.has(key))sets.set(key,[]);
          sets.get(key).push(child);
        }
        collect(child);
      }
    }
    collect(anchor);
    for(const members of sets.values()){
      if(members.length<2)continue;
      const useVertexPaint=members[0].material.userData.paintColor;
      const parts=members.map(o=>{
        const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
        if(useVertexPaint){
          const {r,g,b}=o.material.color;
          const colors=new Float32Array(geo.attributes.position.count*3);
          for(let i=0;i<colors.length;i+=3){colors[i]=r;colors[i+1]=g;colors[i+2]=b}
          geo.setAttribute('color',new T.BufferAttribute(colors,3));
        }
        geo.applyMatrix4(new T.Matrix4().multiplyMatrices(inv,o.matrixWorld));geo.clearGroups();return geo;
      });
      const combined=mergeGeometries(parts);
      if(!combined)continue;
      const m=new T.Mesh(combined,useVertexPaint?vertexPaint:members[0].material);
      m.castShadow=members[0].castShadow;m.receiveShadow=members[0].receiveShadow;
      anchor.add(m);members.forEach(o=>o.removeFromParent());parts.forEach(g=>g.dispose());
    }
  }
}
