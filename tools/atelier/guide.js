import {sights} from './city-places.js';
const zones={
  '西屯區':['marketnight','mall','opera','lin','avenue','hospital','chapel','science','fab'],
  '南屯區':['park','metro'],'北屯區':['stadium'],'北區':['lake'],'大甲區':['temple']
};
export function cityGuide(root,onGo){
  const dialog=root.querySelector('#city-guide'),list=root.querySelector('#guide-places'),area=root.querySelector('#guide-area'),map=root.querySelector('#guide-map');
  let zone='';
  function select(name){
    zone=name;area.value=name;list.replaceChildren();
    const ids=name?zones[name]:Object.keys(sights);
    for(const id of ids){const b=document.createElement('button');b.type='button';b.textContent=sights[id].name;b.onclick=()=>{dialog.close();onGo(id);};list.append(b);}
    for(const el of map.querySelectorAll('[data-zone]'))el.classList.toggle('selected',el.dataset.zone===name);
  }
  for(const name of Object.keys(zones))area.add(new Option(name,name));
  area.onchange=()=>select(area.value);
  root.querySelector('#guide-close').onclick=()=>dialog.close();
  root.querySelector('#guide-studio').onclick=()=>{dialog.close();onGo('film');};
  dialog.addEventListener('cancel',e=>{e.stopPropagation();});
  let loaded=false;
  async function draw(){
    const url=new URL('./city-boundary.json',import.meta.url),response=await fetch(url);if(!response.ok)return;
    const data=await response.json(),ns='http://www.w3.org/2000/svg';map.setAttribute('viewBox',data.viewBox);
    for(const [name,d] of data.regions){
      const shape=document.createElementNS(ns,'path');shape.setAttribute('d',d);
      if(zones[name]){shape.dataset.zone=name;shape.onclick=()=>select(name);const title=document.createElementNS(ns,'title');title.textContent=name;shape.append(title);}
      map.append(shape);
    }
    // Geographical pins keep compact western districts easy to identify.
    const labels=[['大甲區',120.62,24.35,-25,-12],['西屯區',120.63,24.18,-42,2],['南屯區',120.62,24.13,-31,21],['北區',120.68,24.15,24,22],['北屯區',120.71,24.19,23,-6]];
    for(const [name,lon,lat,dx,dy] of labels){
      const x=(lon-120.46)*760*Math.cos(24.2*Math.PI/180),y=(24.46-lat)*760;
      const g=document.createElementNS(ns,'g');g.dataset.zone=name;g.onclick=()=>select(name);
      const pin=document.createElementNS(ns,'circle');pin.setAttribute('cx',x);pin.setAttribute('cy',y);pin.setAttribute('r',3.8);
      const line=document.createElementNS(ns,'path');line.setAttribute('d','M'+x+','+y+'l'+dx+','+dy);
      const txt=document.createElementNS(ns,'text');txt.setAttribute('x',x+dx+(dx<0?-2:2));txt.setAttribute('y',y+dy+4);txt.setAttribute('text-anchor',dx<0?'end':'start');txt.textContent=name;
      g.append(line,pin,txt);map.append(g);
    }select(zone);
  }
  return ()=>{dialog.showModal();select('');if(!loaded){loaded=true;draw().catch(()=>{loaded=false;});}};
}
