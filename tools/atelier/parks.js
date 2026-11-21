import {person} from './ensemble.js';
import {T,group,box,oval,rod,tube,mesh,painted,makeCanvas,panel,animate} from './craft.js';

// Richly planted ground reads as a continuous park from the opening aerial view.
export function gardens(city){
  const ground=painted(makeCanvas(1200,480,(c,w,h)=>{
    c.fillStyle='#83b875';c.fillRect(0,0,w,h);
    let seed=231;const rnd=()=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
    for(let i=0;i<38000;i++){
      const x=rnd()*w,y=rnd()*h,t=.5+.22*Math.sin(x*.021)+.22*Math.cos(y*.026+x*.007);
      c.fillStyle=rnd()<t?'rgba(47,115,75,.13)':'rgba(227,235,130,.15)';c.fillRect(x,y,2+rnd()*10,1+rnd()*4);
    }
    const routes=[[-40,131,350,280,590,45,1240,169],[140,520,180,290,925,257,1050,-40],[481,520,567,312,408,215,530,-20]];
    for(const r of routes){c.beginPath();c.moveTo(r[0],r[1]);c.bezierCurveTo(...r.slice(2));c.strokeStyle='#abc594';c.lineWidth=26;c.stroke();c.strokeStyle='#e7dabe';c.lineWidth=20;c.stroke();}
  }));
  const lawn=panel(city,ground,-22,.012,49.35,32,17.90);lawn.rotation.x=-Math.PI/2;
  function flowers(x,z,length,angle){
    const bed=group(city,x,.10,z,angle);
    oval(bed,'#5b9b74',0,.04,0,length/2,.115,.40);
    const colors=['#e86663','#f38b86','#ffc47b','#ffda87','#edafbe'];
    const shape=new T.IcosahedronGeometry(1,0),mat=new T.MeshStandardMaterial({roughness:.92});
    const blooms=new T.InstancedMesh(shape,mat,100),leaf=new T.Object3D();
    for(let j=0;j<100;j++){const u=(j+.5)/100,phi=j*2.39996,r=.29*Math.sqrt(1-(2*u-1)**2);
      leaf.position.set((u-.5)*length,.14+.08*(1-Math.abs(Math.sin(phi)))+.035*Math.cos(phi*4),r*Math.sin(phi));
      leaf.scale.set(.054,.061,.054);leaf.updateMatrix();blooms.setMatrixAt(j,leaf.matrix);blooms.setColorAt(j,new T.Color(colors[Math.floor(u*8)%5]));}
    blooms.userData.moves=true;bed.add(blooms);
  }
  for(const [x,z,l,a] of [[-26,54.4,7.3,.12],[-20.1,47.6,5.6,1.16],[-14.1,54.4,5.2,-.18],[-19.3,42.9,5.9,.02],[-10,29.5,5.4,0],[-18.8,29.6,4.6,0]])flowers(x,z,l,a);
}
export function lakeLife(lake){
  const mat=new T.MeshStandardMaterial({color:'#67a99a',roughness:.37,metalness:.09});
  const elapsed={value:0};
  mat.onBeforeCompile=shader=>{
    shader.uniforms.lakeTime=elapsed;
    shader.vertexShader='varying vec2 lakeXZ;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n lakeXZ=position.xz;');
    shader.fragmentShader='uniform float lakeTime; varying vec2 lakeXZ;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 p=lakeXZ; float crest=sin(p.x*96.+lakeTime*1.65+sin(p.y*39.))*sin(p.y*73.-lakeTime*.93+sin(p.x*18.));
      float shore=smoothstep(.48,1.,length(p));diffuseColor.rgb*=mix(vec3(.60,.84,1.0),vec3(1.12,1.14,.82),shore);
      diffuseColor.rgb+=vec3(.11,.16,.15)*smoothstep(.66,.92,crest);`);
  };
  animate(null,t=>elapsed.value=t);
  const disk=new T.CircleGeometry(1,96);disk.rotateX(-Math.PI/2);
  mesh(lake,disk,mat,0,.095,.8).scale.set(5.90,1,4.40);
  const boat=group(lake);
  oval(boat,'#cc714b',0,0,0,.30,.14,.72);
  oval(boat,'#ffe0a1',0,.065,0,.28,.085,.68);oval(boat,'#346d75',0,.093,0,.226,.064,.55);
  for(const z of [-.24,.15])box(boat,'#d5a675',0,.15,z,.41,.036,.095,true);
  const rower=person(boat,0,-.022,-.19,0,'#4b82a7','row');
  rower.root.scale.setScalar(.72);
  for(const leg of rower.legs)leg.rotation.x=-1.20;
  for(const shin of rower.shins)shin.rotation.x=1.32;
  const blades=[-1,1].map(s=>{const o=group(boat,s*.24,.15,-.12);rod(o,'#dab384',[-s*.14,.03,-.03],[s*.50,-.13,.04],.012);
    oval(o,'#f3ca8c',s*.52,-.135,.045,.118,.018,.053);return o;});
  const wake=[];for(let i=0;i<14;i++){
    const a=i%2?1:-1,j=Math.floor(i/2);
    wake.push(tube(boat,'#96dbcf',[[a*(.15+j*.064),-.063,-.6-j*.18],[a*(.25+j*.077),-.064,-.76-j*.18],[a*(.31+j*.083),-.063,-.85-j*.18]],.008));
  }
  wake.forEach(w=>w.userData.moves=true);
  animate(boat,t=>{const a=t*.104+.38;boat.position.set(2.48*Math.cos(a),.163,1.8+1.34*Math.sin(a));boat.rotation.set(.022*Math.cos(t*1.9),Math.atan2(-2.48*Math.sin(a),1.34*Math.cos(a)),.029*Math.sin(2.3*t));
    rower.body.rotation.x=.07+.21*Math.cos(2.25*t);
    rower.arms.forEach((arm,i)=>{arm.rotation.x=-.98+.53*Math.sin(2.25*t);arm.rotation.z=(i?1:-1)*.66;rower.elbows[i].rotation.x=-.47-.32*Math.cos(2.25*t);});
    blades.forEach((o,i)=>{const s=i?1:-1;o.rotation.y=s*.62*Math.sin(t*2.25);o.rotation.z=s*.18*Math.cos(t*2.25);});
    wake.forEach((w,i)=>w.visible=Math.sin(t*2.25-i*.39)>-.64);});
}
export function plazaJets(p){
  const stream=new T.MeshStandardMaterial({color:'#a5e7eb',roughness:.25,transparent:true,opacity:.77});
  const colours=['#f06653','#138f91','#f3b437','#4374bc'];
  for(let i=0;i<4;i++){
    const x=-15.15+i*2.95;
    rod(p,'#9aaab0',[x,.12,29.12],[x,2.39,29.12],.018);
    const geo=new T.PlaneGeometry(.58,1.30,6,8);geo.translate(.29,-.65,0);
    const sheet=mesh(p,geo,new T.MeshStandardMaterial({color:colours[i],side:T.DoubleSide,roughness:.85}),x,2.35,29.12);
    const verts=geo.attributes.position,rest=verts.array.slice();sheet.rotation.y=-.32+i*.08;
    animate(sheet,t=>{for(let j=0;j<verts.count;j++){
      const xx=rest[j*3],yy=rest[j*3+1];verts.setZ(j,xx*.23*Math.sin(t*3.1+xx*8+yy*3.6+i));
    }verts.needsUpdate=true;});
  }
  for(let i=0;i<7;i++){const f=group(p,-13.55+i*.80,.132,27.65);
    tube(f,stream,[[-.20,0,0],[-.12,.39,0],[0,.52,0],[.12,.39,0],[.21,0,0]],.023);
    animate(f,t=>f.scale.y=.67+.49*(.5+.5*Math.sin(2.6*t-i*.68)));}
}
