import {T,group,box,panel,rod,oval,cyl,tube,label,makeCanvas,painted,batch} from './craft.js';
import {airUnit,pipes} from './architecture.js';
import {scooter} from './taiwan-life.js';
import {air} from './atmosphere.js';

const loader=new T.TextureLoader();
export function elevationMaterial(name){
  const map=loader.load(new URL('elevations/'+name+'.webp',import.meta.url).href);
  map.colorSpace=T.SRGBColorSpace;map.anisotropy=6;
  return new T.MeshStandardMaterial({map,roughness:.78,emissive:'#ffffff',emissiveMap:map,emissiveIntensity:.22});
}
const enamel=['#fff5de','#25637c','#f5e3dc','#263d67'];
function blade(g,x,words,index){
  const w=.49,h=1.16,z=.59,y=2.17;
  for(const level of [y-.49,y+.5])rod(g,'#3d4947',[x,level,.02],[x,level,z+.19],.025);
  const b=group(g,x,y,z,Math.PI/2);
  box(b,'#645d4d',0,0,0,w+.048,h+.065,.15,true);
  const art=painted(makeCanvas(210,520,(c,W,H)=>{
    const light=index%2===0;c.fillStyle=enamel[index];c.fillRect(0,0,W,H);
    c.strokeStyle=light?'#967f57':'#c0ad88';c.lineWidth=3;c.strokeRect(7,7,W-14,H-14);
    c.fillStyle=light?'#38483d':'#f7e8cb';c.textAlign='center';c.font='35px "Songti TC",serif';c.fillText(words.slice(0,2),W/2,76);
    c.font='bold 122px "Songti TC",serif';[...words.slice(2)].forEach((ch,i)=>c.fillText(ch,W/2,234+145*i));
  }),true);
  for(const sign of [-1,1]){const f=group(b,0,0,.079*sign,sign===1?0:Math.PI);panel(f,art,0,0,0,w,h);}
}
function frontage(parent,x,z,yaw,i,mats){
  const w=4.06,h=[5.68,6.22,5.35,5.82][i],p=group(parent,x,.14,z,yaw);
  box(p,['#afa998','#95847b','#8a9084','#a9aba1'][i],0,h/2,-1.57,w,h,3.12);
  panel(p,mats[i],0,h/2,.011,w,h);
  for(const side of [-1,1]){const face=group(p,side*w/2,h/2,-1.56,side*Math.PI/2);panel(face,mats[(i+2)%4],0,0,.009,3.12,h);}
  for(const y of [h*.37,h*.69,h])box(p,'#b6b4a5',0,y,.055,w+.055,.056,.16);
  const awning=box(p,['#537f95','#c26850','#417588','#426492'][i],0,h*.36,.22,w*.96,.045,.52);awning.rotation.x=.09;
  const terrace=group(p,0,h+.03,-1.55);
  for(const side of [-1,1]){
    box(terrace,'#d3cebb',0,.10,side*1.52,3.99,.20,.080);
    box(terrace,'#d3cebb',side*1.95,.10,0,.075,.20,3.03);
  }
  if(i%2){
    for(const x of [-1.53,-.92]){box(terrace,'#b98365',x,.12,-.1,.42,.23,1.92,true);
      for(let j=0;j<5;j++)oval(terrace,j%2?'#609968':'#89aa62',x,.35,-.89+j*.38,.17,.24,.23);}
    for(const x of [.30,1.58])for(const z of [-.35,.92])cyl(terrace,'#9c8370',x,.40,z,.024,.024,.80,10);
    for(let j=0;j<7;j++)box(terrace,'#cfab83',.30+j*.21,.82,.28,.080,.060,1.40);
  }else{
    cyl(terrace,'#a9bdc3',1.24,.56,-.58,.33,.33,.98,28);
    for(const h of [.19,.39,.71,.98])cyl(terrace,'#d5ddda',1.24,h,-.58,.338,.338,.023,24);
    for(let j=0;j<6;j++)box(terrace,'#698d9f',-.88+j*.22,.22,.63,.18,.07,1.00);
  }
  pipes(p,-w*.48,.06,.055,h*.92);airUnit(p,w*.36,h*.56,.14,.82);
  blade(p,-w*.35,['春和茶行','四季青果','林家鍋貼','光影相館'][i],i);
  for(let k=0;k<2;k++)tube(p,'#3f4543',[[-w*.5,3.6-k*.065,.22],[0,3.47-k*.07,.27],[w*.5,3.55-k*.07,.22]],.012);
}
export function buildLane(scene){
  const street=group(scene),mats=[0,1,2,3].map(i=>elevationMaterial('shop'+i));
  for(let j=0;j<5;j++){
    const x=-26+j*4.07;
    frontage(street,x,2.35+(j%2)*.11,0,[2,0,3,1,2][j],mats);
    frontage(street,x,8.42+(j%2)*.09,Math.PI,[3,2,1,0,3][j],mats);
  }
  for(const [x,z,angle,color] of [[-24.4,3.08,.8,'#9baead'],[-20.1,7.94,-2.3,'#505c60'],[-17.6,3.05,1.2,'#81766f']])scooter(street,x,z,angle,color);
  batch(street);
  return street;
}
// The wet asphalt samples a mirrored camera view of the street. Water coverage varies in world space.
export function wetLane(scene,street,fest,visitors){
  const target=new T.WebGLRenderTarget(480,272),mirror=new T.PerspectiveCamera(),projection=new T.Matrix4();
  const reflected=new T.Scene();reflected.add(street.clone(true),new T.HemisphereLight(0xfff8ed,0x929b94,1.65));
  const poses=[];
  // Source and reflection share geometry, while moving joints have separate transforms.
  function reflectGroup(original){
    const copy=original.clone(true),sources=[],copies=[];
    original.traverse(o=>sources.push(o));copy.traverse(o=>copies.push(o));
    sources.forEach((o,i)=>{if(o.userData.moves)poses.push([o,copies[i]]);});
    reflected.add(copy);
  }
  reflectGroup(fest);reflectGroup(visitors);
  const brightness=reflected.children[1],view=new T.Vector3(),dest=new T.Vector3();
  const u={reflection:{value:target.texture},project:{value:projection},wet:{value:0},time:{value:0},day:{value:1}};
  const shader=new T.ShaderMaterial({uniforms:u,vertexShader:`varying vec3 pos;varying vec4 coord;uniform mat4 project;void main(){vec4 p=modelMatrix*vec4(position,1.);pos=p.xyz;coord=project*p;gl_Position=projectionMatrix*viewMatrix*p;}`,fragmentShader:`
  varying vec3 pos;varying vec4 coord;uniform sampler2D reflection;uniform float wet,time,day;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
  void main(){vec2 p=pos.xz;float g=noise(p*78.),m=noise(p*vec2(.8,1.7))*.63+noise(p*4.)*.27+noise(p*14.)*.10;
  float pool=smoothstep(.67-.32*wet,.78-.32*wet,m);vec2 uv=coord.xy/coord.w*.5+.5;
  uv+=vec2(noise(p*11.+time*.6)-.5,sin(p.y*70.+time*4.)*.22+noise(p*31.)-.5)*.0045*wet;
  vec2 b=vec2(.0035,.004);vec3 sky=texture2D(reflection,clamp(uv,.001,.999)).rgb*.44;sky+=(texture2D(reflection,uv+b).rgb+texture2D(reflection,uv-b).rgb+texture2D(reflection,uv+vec2(b.x,-b.y)).rgb+texture2D(reflection,uv+vec2(-b.x,b.y)).rgb)*.14;float asphalt=(.12+.038*g+.045*noise(p*2.))*(.45+.55*day)*(1.-.43*wet);
  gl_FragColor=vec4(mix(vec3(asphalt*.90,asphalt*.91,asphalt*.88),sky,pool*(.07+.48*wet)),1.);
  #include <colorspace_fragment>
  }`});
  const road=new T.Mesh(new T.PlaneGeometry(19.75,4.45),shader);road.rotation.x=-Math.PI/2;road.position.set(-18.25,.001,5.35);scene.add(road);
  let last=-Infinity;
  return (r,c,t)=>{
    u.wet.value=air.rain;u.time.value=t;u.day.value=air.day;
    const now=performance.now()/1000;
    if(c.position.x>1||c.position.x< -37||Math.abs(c.position.z-5)>14||now-last<.12)return;
    last=now;c.updateMatrixWorld();
    for(const [o,copy] of poses){copy.position.copy(o.position);copy.quaternion.copy(o.quaternion);copy.scale.copy(o.scale);copy.visible=o.visible;}
    mirror.copy(c,false);mirror.position.y=.002-c.position.y;
    c.getWorldDirection(view);view.y*=-1;mirror.up.set(0,-1,0);mirror.lookAt(dest.copy(mirror.position).add(view));mirror.updateMatrixWorld();
    projection.multiplyMatrices(mirror.projectionMatrix,mirror.matrixWorldInverse);
    reflected.background=scene.fog.color;brightness.intensity=.64+air.day*1.16;
    const auto=r.shadowMap.autoUpdate,need=r.shadowMap.needsUpdate;r.shadowMap.autoUpdate=false;r.shadowMap.needsUpdate=false;
    r.setRenderTarget(target);r.render(reflected,mirror);r.setRenderTarget(null);r.shadowMap.autoUpdate=auto;r.shadowMap.needsUpdate=need;
  };
}
