// A shared clock keeps street lighting, shops, pedestrians and wet surfaces in the same scene.
import {T, makeCanvas} from './craft.js';
import {weatherFeed} from './weather.js';

const clamp=T.MathUtils.clamp, lerp=T.MathUtils.lerp;
const smooth=(a,b,x)=>T.MathUtils.smoothstep(x,a,b);
const levels={clear:[.17,0],cloud:[.78,0],rain:[.96,1]};
const terms={clear:'晴朗',cloud:'多雲',rain:'細雨'};
const preview={morning:7.5,noon:12.1,dusk:17.15,night:20.5,dawn:4.3};
const hourFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export const air={rain:0,cloud:.2,night:0,hour:12,wind:.45,day:1,open:1};
const tint=new T.Color();
const C=hex=>new T.Color(hex);
const liveFeed=weatherFeed();
function solarPosition(date,hour){
  const utc=new Date(date.getTime()+8*3600000);
  const n=(Date.UTC(utc.getUTCFullYear(),utc.getUTCMonth(),utc.getUTCDate())-Date.UTC(utc.getUTCFullYear(),0,0))/86400000;
  const rad=Math.PI/180,lat=24.15*rad,decl=.409*Math.sin(2*Math.PI*(n-81)/365);
  const b=(360/365*(n-81))*rad;
  const eq=(9.87*Math.sin(2*b)-7.53*Math.cos(b)-1.5*Math.sin(b))/60;
  const a=(hour+eq+.027-12)*15*rad;
  return new T.Vector3(-Math.cos(decl)*Math.sin(a),Math.sin(lat)*Math.sin(decl)+Math.cos(lat)*Math.cos(decl)*Math.cos(a),
    Math.sin(lat)*Math.cos(decl)*Math.cos(a)-Math.cos(lat)*Math.sin(decl)).normalize();
}
function cloudMap(){
  const lattice=new Uint8Array(256*256);let seed=12050;
  for(let i=0;i<lattice.length;i++){seed=(Math.imul(1664525,seed)+1013904223)>>>0;lattice[i]=seed>>>24;}
  function noise(x,y,period){
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
    const at=(a,b)=>lattice[((a%period+period)%period)*83%256+256*((b%period+period)%period)]/255;
    return lerp(lerp(at(ix,iy),at(ix+1,iy),fx*fx*(3-2*fx)),lerp(at(ix,iy+1),at(ix+1,iy+1),fx*fx*(3-2*fx)),fy*fy*(3-2*fy));
  }
  const c=makeCanvas(256,256,(ctx,w,h)=>{
    const im=ctx.createImageData(w,h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let a=0,b=.56;
      for(let k=0;k<5;k++){const f=4<<k;a+=b*noise(x/w*f,y/h*f,f);b*=.5;}
      const n=(y*w+x)*4;im.data[n]=im.data[n+1]=im.data[n+2]=Math.min(255,a*248);im.data[n+3]=255;
    }
    ctx.putImageData(im,0,0);
  });
  const map=new T.CanvasTexture(c);map.wrapS=map.wrapT=T.RepeatWrapping;return map;
}
const skyVertex=`
varying vec3 vDir;
void main(){vDir=position;vec4 clip=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=clip.xyww;}`;
const skyFragment=`
varying vec3 vDir;
uniform sampler2D clouds;
uniform vec3 zenith,horizon,sun,cloudLit,cloudShade,glow;
uniform float t,cover,daylight;
void main(){
  vec3 d=normalize(vDir);
  float altitude=max(d.y,0.), toward=max(dot(sun,d),0.);
  vec3 col=mix(horizon,zenith,pow(altitude,.48));
  col+=glow*(pow(toward,19.)*.29+pow(toward,180.)*.38+smoothstep(.99935,.99988,toward)*2.)*(1.-cover*.8)*daylight;
  vec2 uv=d.xz/(max(d.y,.01)+.21)*.22+vec2(t*.001, t*.00028);
  float n=texture2D(clouds,uv).r*.79+texture2D(clouds,uv*2.8-vec2(t*.00032,0.)).r*.21;
  float density=smoothstep(.65-cover*.36,.78-cover*.35,n)*smoothstep(-.015,.13,d.y);
  col=mix(col,mix(cloudLit,cloudShade,smoothstep(.42,.85,n)),density*(.70+cover*.28));
  float star=step(.9984,fract(sin(dot(floor(d.xz/(max(d.y,0.)+.65)*480.),vec2(12.9898,78.233)))*43758.54));
  col+=vec3(.46,.55,.67)*star*(1.-daylight)*(1.-cover)*(1.-density)*smoothstep(.09,.33,d.y);
  gl_FragColor=vec4(col,1.);
  #include <colorspace_fragment>
}`;
function rainyStreet(scene){
  // Curtains of rain are anchored to open streets, so no drops fall through studio ceilings.
  const strips=[[-29,29,3.1,8.45],[-29,29,-9.4,-7.5],[-29,29,15,17.7],[-10.8,-9.28,-8.3,3.1],[6.45,7.55,-8.3,3.1]];
  const count=960,geo=new T.BufferGeometry(),positions=new Float32Array(count*6),seeds=[];
  let state=220;const rand=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<count;i++){
    const r=i<count*.73?strips[0]:strips[1+i%4];seeds.push([lerp(r[0],r[1],rand()),lerp(r[2],r[3],rand()),rand()*7,.073+rand()*.085,3.8+rand()*1.4]);
  }
  geo.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));
  const rainMat=new T.LineBasicMaterial({color:'#d0deef',transparent:true,opacity:0,depthWrite:false});
  const rain=new T.LineSegments(geo,rainMat);rain.frustumCulled=false;rain.renderOrder=4;scene.add(rain);
  const rings=new T.InstancedMesh(new T.RingGeometry(.87,1,20),new T.MeshBasicMaterial({color:'#aebec1',transparent:true,opacity:.32,depthWrite:false,side:T.DoubleSide}),54);
  rings.frustumCulled=false;scene.add(rings);const o=new T.Object3D();o.rotation.x=-Math.PI/2;
  return (t)=>{
    rain.visible=rings.visible=air.rain>.025;
    if(!rain.visible)return;
    rainMat.opacity=air.rain*(.29+air.night*.13);rings.material.opacity=.31*air.rain;
    for(let i=0;i<count;i++){
      const [x,z,seed,len,speed]=seeds[i],y=((seed-t*speed)%7+7)%7,idx=i*6;
      const drift=y*.10*air.wind;
      positions.set([x+drift,y,z,x+drift+len*.10*air.wind,y+len,z+.012],idx);
    }
    geo.attributes.position.needsUpdate=true;
    for(let i=0;i<rings.count;i++){
      const [x,z,seed]=seeds[i*3],u=(t*1.38+seed)%1,s=.11*u;
      o.position.set(x,.026,z);o.scale.set(s,s,s);o.updateMatrix();rings.setMatrixAt(i,o.matrix);
    }
    rings.instanceMatrix.needsUpdate=true;
  };
}
const colors={
  daySky:C('#467fa7'),dayLow:C('#e6dfc9'),nightSky:C('#182a48'),nightLow:C('#606f83'),sunset:C('#f3b78e'),
  overSky:C('#8798a7'),overLow:C('#c6cccb'),nightCloud:C('#44546b'),cloudWhite:C('#f4eee0'),cloudGray:C('#8996a2'),
  amber:C('#ffb474'),white:C('#ffebcc'),moon:C('#a3c4e3'),bottom:C('#b9b9a0'),darkBottom:C('#7a7880'),
  nightHill:C('#697b8b'),nightFog:C('#627686')
};
export function atmosphere(scene,camera,sun,hemi,bounce,streets,report){
  const uniforms={clouds:{value:cloudMap()},zenith:{value:C('#5297ab')},horizon:{value:C('#c9d8cf')},sun:{value:new T.Vector3()},
    cloudLit:{value:C('#eee8d5')},cloudShade:{value:C('#b5bdbe')},glow:{value:C('#ffbd7b')},cover:{value:.3},daylight:{value:1},t:{value:0}};
  const sky=new T.Mesh(new T.SphereGeometry(1,24,12),new T.ShaderMaterial({vertexShader:skyVertex,fragmentShader:skyFragment,uniforms,
    side:T.BackSide,depthWrite:false,fog:false}));
  sky.frustumCulled=false;sky.renderOrder=-100;scene.add(sky);scene.background=null;
  const updateRain=rainyStreet(scene),minutes={last:null},sunDir=new T.Vector3();
  let when='auto',weather='auto',weatherKind='clear',currentTime='',initialized=false,nextClock=0;
  let currentWeather=liveFeed.read(Date.now());
  function clock(now){
    const d=new Date(now),stamp=hourFormat.format(d);
    const [h,m]=stamp.split(':').map(Number);air.hour=when==='auto'?h+m/60:preview[when];
    sunDir.copy(solarPosition(d,air.hour));currentWeather=liveFeed.read(now);
    weatherKind=weather==='auto'?currentWeather.kind:weather;
    currentTime=when==='auto'?stamp:String(Math.floor(air.hour)).padStart(2,'0')+':'+String(Math.round(air.hour%1*60)).padStart(2,'0');
    const live=weather==='auto',label=live?currentWeather.label:terms[weatherKind];
    const source=live?currentWeather.state:'manual',dataTime=live&&currentWeather.time?hourFormat.format(new Date(currentWeather.time)):'';
    const k=[currentTime,when,weather,label,source,dataTime].join('|');
    if(k!==minutes.last){minutes.last=k;report('climate',{time:currentTime,weather:label,when,source,dataTime});}
  }
  function set(config){
    if(config.when==='auto'||Object.hasOwn(preview,config.when))when=config.when;
    if(config.weather==='auto'||Object.hasOwn(levels,config.weather))weather=config.weather;
    clock(Date.now());
  }
  function update(t,dt){
    const now=Date.now();
    if(now>=nextClock||!initialized){clock(now);nextClock=now+1000;}
    const live=weather==='auto',cloud=live?currentWeather.cloud:levels[weatherKind][0],wet=live?currentWeather.rain:levels[weatherKind][1];
    const k=initialized?1-Math.exp(-Math.min(dt,.6)*1.9):1;
    air.rain=lerp(air.rain,wet,k);air.cloud=lerp(air.cloud,cloud,k);
    air.day=smooth(-.14,.15,sunDir.y);air.night=1-smooth(-.14,.09,sunDir.y);
    air.open=air.hour>=5&&air.hour<22.5?1:0;
    const wind=live?currentWeather.wind:.68+.35*air.rain;
    air.wind=wind*(.76+.24*Math.sin(t*.41)+.12*Math.cos(t*.86));
    const twilight=1-smooth(.015,.34,Math.abs(sunDir.y+.02)),night=air.night,cover=air.cloud;
    uniforms.zenith.value.copy(colors.nightSky).lerp(colors.daySky,air.day).lerp(tint.copy(colors.nightCloud).lerp(colors.overSky,air.day),cover*.77);
    uniforms.horizon.value.copy(colors.nightLow).lerp(colors.dayLow,air.day).lerp(colors.sunset,twilight*.83*(1-cover*.68)).lerp(tint.copy(colors.nightLow).lerp(colors.overLow,air.day),cover*.62);
    uniforms.cloudLit.value.copy(colors.nightCloud).lerp(colors.cloudWhite,air.day).lerp(colors.amber,twilight*.32);
    uniforms.cloudShade.value.copy(colors.nightSky).lerp(colors.cloudGray,air.day);
    uniforms.glow.value.copy(colors.amber).lerp(colors.white,smooth(.06,.48,sunDir.y));uniforms.sun.value.copy(sunDir);
    uniforms.t.value=t;uniforms.cover.value=cover;uniforms.daylight.value=air.day;sky.position.copy(camera.position);
    hemi.color.copy(colors.moon).lerp(colors.white,air.day);hemi.groundColor.copy(colors.darkBottom).lerp(colors.bottom,air.day);
    hemi.intensity=.90+air.day*(.82+cover*.26);
    sun.position.copy(sunDir).multiplyScalar(26);
    sun.intensity=(.55+1.75*Math.max(0,sunDir.y))*air.day*(1-cover*.84)*(.96+.04*Math.sin(t*.17));
    sun.color.copy(colors.amber).lerp(colors.white,smooth(.03,.48,sunDir.y));
    bounce.color.copy(colors.moon);bounce.intensity=.37+night*.20;
    scene.fog.color.copy(uniforms.horizon.value);scene.fog.near=21-cover*3;scene.fog.far=83-cover*17-wet*8-(live&&currentWeather.fog?25:0);
    for(const hill of streets.hills)hill.material.color.setRGB(1,1,1).lerp(colors.nightHill,night*.89);
    streets.road.color.setRGB(1,1,1).multiplyScalar(1-air.rain*.43-night*.15);
    streets.road.roughness=.95-air.rain*.71;
    streets.lamps.color.set('#b7b39c').lerp(colors.amber,night*.98);
    for(const [material,lit] of streets.windows){material.color.setScalar(.9+.10*air.day-.16*night+lit*.12*night);}
    updateRain(t);initialized=true;
  }
  set({});return {set,update};
}
