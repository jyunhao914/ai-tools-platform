import {T, rand, painted, makeCanvas, canvasMap, drawNoise, animate} from './craft.js';

export async function loadArt() {
  const loader=new T.TextureLoader();
  const urls=['wall0','wall1','wall2','wall3','room0','room1','room2','room3','rental','sound'];
  const entries=await Promise.all(urls.map(async name=>{
    const map=await loader.loadAsync(new URL(name+'.webp', import.meta.url).href);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;
    const material=!name.startsWith('wall')?new T.MeshBasicMaterial({map}):new T.MeshStandardMaterial({map,roughness:.91});
    return [name,material];
  }));
  return Object.fromEntries(entries);
}
export const roofTile=painted(makeCanvas(768,384,(g,w,h)=>{
  g.fillStyle='#914f40';g.fillRect(0,0,w,h);
  for(let j=0;j<8;j++){
    for(let i=-1;i<16;i++){
      const x=i*50+(j%2)*7,y=j*48;
      g.fillStyle=['#bc6653','#cf775e','#c16a53','#d78969'][Math.floor(rand()*4)];
      g.beginPath();g.roundRect(x+2,y-2,48,48,[0,0,12,12]);g.fill();
      g.fillStyle='#e19979';g.fillRect(x+7,y+2,4,35);
      g.fillStyle='#994f41';g.fillRect(x+40,y,5,33);
    }
  }drawNoise(g,w,h,16000,.17);
}));
export const cloth=painted(makeCanvas(512,256,(g,w,h)=>{
  for(let i=0;i<12;i++){g.fillStyle=i%2?'#f1dbb0':'#527a70';g.fillRect(i*w/12,0,w/12+1,h)}
  let sh=g.createLinearGradient(0,0,0,h);sh.addColorStop(0,'#382b2444');sh.addColorStop(.55,'#fffbee12');sh.addColorStop(1,'#382d252c');g.fillStyle=sh;g.fillRect(0,0,w,h);
  for(let i=1;i<h;i+=4){g.fillStyle='#3028250c';g.fillRect(0,i,w,1)}drawNoise(g,w,h,4500,.18);
}));
export const zinc=painted(makeCanvas(512,256,(g,w,h)=>{
  g.fillStyle='#647e80';g.fillRect(0,0,w,h);
  for(let x=3;x<w;x+=22){g.fillStyle='#435f65';g.fillRect(x,0,5,h);g.fillStyle='#9aada5';g.fillRect(x+5,0,3,h)}
  for(let j=0;j<130;j++){g.fillStyle='#ae755d24';g.fillRect(rand()*w,rand()*h,rand()*15+2,rand()*4+1)}
  drawNoise(g,w,h,5000,.17);
}));
export const tiled=painted(makeCanvas(512,256,(g,w,h)=>{
  g.fillStyle='#b8b395';g.fillRect(0,0,w,h);
  for(let y=0;y<h;y+=26)for(let x=-29;x<w;x+=54){let dx=x+(y%52===0?27:0);g.fillStyle=['#628e80','#769888','#60877c','#849f8b'][Math.floor(rand()*4)];g.fillRect(dx+1,y+1,51,24);g.fillStyle='#b3bca044';g.fillRect(dx+2,y+2,48,2)}
  drawNoise(g,w,h,3000,.16);
}));
export function pavement(){return painted(makeCanvas(1280,960,(g,w,h)=>{
  g.fillStyle='#9a9182';g.fillRect(0,0,w,h);
  for(let y=0;y<h;y+=23)for(let x=-40;x<w;x+=48){let xx=x+((y/23)%2)*24;let v=Math.floor(rand()*14);g.fillStyle='rgb('+(188+v)+','+(177+v)+','+(156+v)+')';g.fillRect(xx+1,y+1,46,21);g.fillStyle='#f4dfb84a';g.fillRect(xx+1,y+1,46,2)}
  drawNoise(g,w,h,55000,.28);
}))}
export function roadway(width,depth,roadWidth){return painted(makeCanvas(1536,1152,(g,w,h)=>{
  g.fillStyle='#53595c';g.fillRect(0,0,w,h);drawNoise(g,w,h,145000,.34);
  g.strokeStyle='#dfd0a5';g.lineWidth=3.6;g.setLineDash([34,28]);g.beginPath();const mx=(roadWidth/2-.07)*w/width,my=(roadWidth/2-.07)*h/depth;g.roundRect(mx,my,w-2*mx,h-2*my,.78*w/width);g.stroke();g.setLineDash([]);
  g.fillStyle='#dfd8be';for(let i=0;i<6;i++){g.fillRect(1070+i*17,h-97,9,76);g.fillRect(23,320+i*14,82,8)}
  g.strokeStyle='#414649';g.lineWidth=2;for(let i=0;i<15;i++){let x=rand()*w,y=rand()*h;g.beginPath();g.moveTo(x,y);for(let k=0;k<6;k++){x+=3+rand()*13;y+=rand()*12-6;g.lineTo(x,y)}g.stroke()}
  for(const [x,y] of [[390,1100],[1480,470],[670,62],[68,790]]){g.fillStyle='#434b50';g.beginPath();g.ellipse(x,y,16,16,.2,0,2*Math.PI);g.fill();g.strokeStyle='#8b918c';for(let j=0;j<3;j++){g.beginPath();g.arc(x,y,4+j*4,0,2*Math.PI);g.stroke()}}
}))}
export function filmStock(art) {
  const c=makeCanvas(1024,112,(g,w,h)=>{
    g.fillStyle='#553e32';g.fillRect(0,0,w,h);
    for(let i=0;i<8;i++){g.drawImage(art['room'+i%4].map.image,i*128+6,15,116,81);
      for(let k=0;k<4;k++){g.fillStyle='#f1c995';g.fillRect(i*128+k*32+7,4,13,6);g.fillRect(i*128+k*32+7,102,13,6)}
    }
  });
  const map=canvasMap(c);map.wrapS=T.RepeatWrapping;map.repeat.x=1.25;
  const material=new T.MeshBasicMaterial({map,side:T.DoubleSide});animate(null,t=>{map.offset.x=-(t*.085)%1});
  return material;
}
export function lessonScreen(art) {
  const c=document.createElement('canvas');c.width=640;c.height=360;
  const g=c.getContext('2d'),map=canvasMap(c),titles=['從手勢到分鏡','手部動作示範','從草圖到圖解','線上課程'];
  let last=-1;
  function draw(t){
    const idx=Math.floor(t/4)%4, frame=Math.floor(t*6);
    if(frame===last)return;last=frame;
    g.fillStyle='#253f43';g.fillRect(0,0,640,360);
    const im=art['room'+idx].map.image;g.drawImage(im,0,0,im.width,im.height,5,5,630,278);
    g.fillStyle='#ffedc6';g.font='600 31px "PingFang TC",sans-serif';g.fillText(titles[idx],16,326);
    for(let j=0;j<4;j++){g.fillStyle=j===idx?'#e98a63':'#78978b';g.fillRect(475+j*38,314,27,5)}
    map.needsUpdate=true;
  }
  draw(0);animate(null,draw);return new T.MeshBasicMaterial({map});
}
