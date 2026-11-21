import {box,panel,makeCanvas,painted} from './craft.js';

let surface,texture;
const paper=['#d4e7f4','#dce1fa','#f2d8cd'];
const family='"PingFang TC", "Microsoft JhengHei", sans-serif';
function lines(g,text,limit){
  const result=[];let line='';
  for(const ch of Array.from(text)){
    if(ch==='\n'||g.measureText(line+ch).width>limit){result.push(line);line=ch==='\n'?'':ch;}
    else line+=ch;
  }
  result.push(line);
  return result;
}
export function paintNotes(entries){
  if(!texture)return;
  const g=texture.image.getContext('2d');
  g.fillStyle='#273754';g.fillRect(0,0,1000,540);
  g.fillStyle='#f2f6ff';g.font='bold 72px '+family;g.fillText('工作室留言牆',45,102);
  g.fillStyle='#c7d9ea';g.font='34px '+family;g.fillText('點這裡　閱讀・貼便條',48,159);
  g.fillStyle='#6f819d';g.fillRect(45,185,910,3);
  const notes=entries.slice(0,3);
  if(!notes.length)notes.push({name:'工作室',message:'這裡留給你的第一張便條。'});
  notes.forEach(({name,message},i)=>{
    g.save();g.translate(192+i*302,350);g.rotate([-.047,.035,-.023][i]);
    g.fillStyle='#2d4941';g.fillRect(-127,-103,265,231);
    g.fillStyle=paper[i];g.fillRect(-132,-108,265,231);
    g.fillStyle='#638dc3';g.beginPath();g.arc(0,-91,8,0,Math.PI*2);g.fill();
    g.fillStyle='#243e37';g.font='32px '+family;
    const text=lines(g,message,219);text.slice(0,3).forEach((line,j)=>g.fillText(j===2&&text.length>3?line.slice(0,-1)+'…':line,-111,-42+j*40));
    g.font='bold 24px '+family;g.fillText(Array.from(name).slice(0,8).join(''),-110,97,220);g.restore();
  });
  texture.needsUpdate=true;
}
export function mountWall(parent,x,y,z){
  box(parent,'#8190a5',x,y,z,1.70,.95,.075,true);
  box(parent,'#2b3b59',x,y,z+.039,1.65,.90,.025);
  const material=painted(makeCanvas(1000,540,()=>{}),true);
  texture=material.map;surface=panel(parent,material,x,y,z+.056,1.59,.86);paintNotes([]);
}
export function hitsWall(ray){
  return surface&&ray.intersectObject(surface,false).length>0;
}
