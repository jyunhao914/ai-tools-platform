import {T,mesh,animate} from './craft.js';

// Articulated relief keeps foreground figures and worktables in front of the painted back wall.
// Positions below are normalized to each illustrated room, measured from the top left.
const rooms=[
  {gesture:[.51,.77,.095,.12],head:[.61,.55,.105,.15],front:[.58,.83,.25,.29]},
  {gesture:[.665,.495,.09,.12],head:[.612,.382,.08,.13],front:[.16,.74,.21,.35]},
  {gesture:[.394,.673,.096,.10],head:[.26,.475,.096,.14],front:[.25,.74,.21,.31]},
  {gesture:[.623,.781,.08,.10],head:[.368,.526,.11,.13],front:[.41,.79,.23,.31]}
];
const influence=(u,v,[cx,cy,rx,ry])=>Math.exp(-1.6*(((u-cx)/rx)**2+((v-cy)/ry)**2));
export function workingRoom(parent,art,index,w,h,z) {
  const geo=new T.PlaneGeometry(w,h,80,54),pos=geo.attributes.position,uv=geo.attributes.uv;
  const source=pos.array.slice(),masks=new Float32Array(pos.count*2),spec=rooms[index];
  for(let i=0;i<pos.count;i++){
    const u=uv.getX(i),v=1-uv.getY(i);
    masks[2*i]=influence(u,v,spec.gesture);masks[2*i+1]=influence(u,v,spec.head);
    pos.setZ(i,.115*influence(u,v,spec.front)+.041*v*v);
  }
  const material=art.clone(),time={value:0};
  material.onBeforeCompile=shader=>{
    shader.uniforms.workTime=time;
    shader.fragmentShader='uniform float workTime;\n'+shader.fragmentShader;
    let overlay='';
    if(index===3)overlay=`
      vec2 p=vec2(vMapUv.x,1.0-vMapUv.y);
      float signal=fract(workTime*.31);
      vec2 source=vec2(.433,.363),hub=vec2(.526,.317),dest=vec2(.620,.356);
      vec2 packet=signal<.5?mix(source,hub,signal*2.):mix(hub,dest,(signal-.5)*2.);
      float glint=1.-smoothstep(.003,.009,distance(p,packet));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.59,1.,.79),glint);
      float playX=.735+fract(workTime*.11)*.243;
      if(p.y>.506&&p.y<.594)diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.,.77,.43),.83*(1.-smoothstep(.0009,.0029,abs(p.x-playX))));
      float cursor=step(.5,fract(workTime*.9));if(p.x>.249&&p.x<.261&&p.y>.478&&p.y<.484)diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.68,.95,.82),cursor);
    `;
    if(index===0)overlay=`
      vec2 p=vec2(vMapUv.x,1.0-vMapUv.y);
      float u=clamp((p.x-.536)/.069,0.,1.);
      float brush=.851+.016*sin(u*5.)-.016*u;
      float hold=clamp(fract(workTime*.13)*1.7,0.,1.);
      if(p.x>.536&&p.x<.605&&u<hold){float ink=1.-smoothstep(.001,.005,abs(p.y-brush));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.07,.058,.04),ink*.84);}
    `;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n'+overlay);
  };
  material.customProgramCacheKey=()=> 'room-work-'+index;
  const m=mesh(parent,geo,material,0,0,z);let previous=-1;
  animate(m,t=>{
    time.value=t;const key=Math.floor(t*24);if(key===previous)return;previous=key;
    const rhythm=Math.sin(t*[2.05,1.29,1.85,2.9][index]),breath=Math.sin(t*1.13+.7*index);
    for(let i=0;i<pos.count;i++){
      pos.array[i*3]=source[i*3]+w*(.008*rhythm*masks[i*2]+.0019*breath*masks[i*2+1]);
      pos.array[i*3+1]=source[i*3+1]+h*(.006*Math.cos(t*1.5)*masks[i*2]+.0029*breath*masks[i*2+1]);
    }
    pos.needsUpdate=true;
  });
  return m;
}
