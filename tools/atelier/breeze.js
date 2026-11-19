import {T,palette as P,group,mesh,box,oval,rod,tube,painted,makeCanvas,animate} from './craft.js';

function wingShape(side){
  const shape=new T.Shape();
  shape.moveTo(0,.032);
  shape.bezierCurveTo(side*.070,.098,side*.21,.118,side*.337,.065);
  shape.quadraticCurveTo(side*.292,.018,side*.219,-.062);
  shape.lineTo(side*.193,-.068);shape.lineTo(side*.164,-.103);
  shape.quadraticCurveTo(side*.076,-.118,0,-.058);
  shape.closePath();
  const geo=new T.ShapeGeometry(shape,8);
  geo.rotateX(Math.PI/2);
  return geo;
}

export function addPigeons(p){
  const feather=new T.MeshStandardMaterial({color:'#8296a1',side:T.DoubleSide,roughness:.85});
  const outline=[wingShape(-1),wingShape(1)];
  const up=new T.Vector3(0,1,0),point=new T.Vector3(),tangent=new T.Vector3();
  for(let i=0;i<3;i++){
    const bird=group(p),body=group(bird);
    oval(body,'#97a5a6',0,.08,0,.076,.083,.148);
    oval(body,'#526c70',0,.137,.088,.053,.062,.054);
    for(const side of [-1,1]){
      oval(body,P.ink,side*.046,.148,.105,.009,.008,.008);
      rod(body,'#9b6e5c',[side*.033,.048,.018],[side*.035,.013,.049],.009);
    }
    rod(body,P.brass,[0,.131,.128],[0,.127,.18],.002,.019);
    oval(body,'#5b707b',0,.069,-.137,.059,.024,.106);
    const wings=[-1,1].map((s,k)=>{
      const pivot=group(body,s*.049,.106,.012);
      mesh(pivot,outline[k],feather);
      for(let j=0;j<2;j++){
        const stripe=oval(pivot,'#425763',s*(.157+j*.046),.010,-.012,.014,.006,.064-j*.010);
        stripe.rotation.y=s*.51;
      }
      pivot.userData.moves=true;return pivot;
    });
    const a=new T.Vector3(1.13+i*.34,5.265,-.216);
    const b=new T.Vector3(2.10+i*.41,5.022,-5.94+i*.065);
    const outward=new T.CatmullRomCurve3([a,
      new T.Vector3(2.14+i*.30,6.0+i*.08,.38),
      new T.Vector3(3.76+i*.19,6.56+i*.12,1.28),
      new T.Vector3(5.20+i*.13,6.78+i*.12,-.63),
      new T.Vector3(4.58+i*.17,6.08,-3.92),b]);
    const homeward=new T.CatmullRomCurve3([b,
      new T.Vector3(1.30+i*.41,6.05,-5.46),
      new T.Vector3(-.90+i*.34,7.12+i*.11,-4.20),
      new T.Vector3(-.53+i*.36,7.34+i*.14,-2.32),
      new T.Vector3(.89+i*.32,6.34,-1.32),a]);
    animate(bird,t=>{
      // Take off in succession, cross the open sky and settle on the opposite parapet.
      const phase=(t+1.66-i*.52)%23.8;
      const outwardLeg=phase<5.2,homeLeg=phase>=11.6&&phase<16.8;
      const flying=outwardLeg||homeLeg;
      let spread=0,bank=0;
      if(flying){
        const u=Math.min(1,(outwardLeg?phase:phase-11.6)/5.2);
        const along=u*u*(3-2*u),route=outwardLeg?outward:homeward;
        route.getPointAt(along,point);route.getTangentAt(along,tangent);
        spread=Math.min(1,u*10,(1-u)*10);
        bird.position.copy(point).addScaledVector(up,.032*spread*Math.sin(19*t+i));
        bird.rotation.y=Math.atan2(tangent.x,tangent.z);
        bank=(outwardLeg?1:-1)*.29*Math.sin(along*Math.PI);
      }else{
        const landed=phase<11.6;
        bird.position.copy(landed?b:a);
        (landed?outward:homeward).getTangentAt(1,tangent);
        bird.rotation.y=Math.atan2(tangent.x,tangent.z)+.13*Math.sin(phase*1.12+i);
      }
      body.rotation.z=bank;
      for(let j=0;j<2;j++){
        const s=j?1:-1,wing=wings[j];
        wing.rotation.y=s*1.23*(1-spread);
        wing.rotation.z=s*((-.38)*(1-spread)+spread*(.13+.74*Math.sin(t*16.8+i*.9)));
        wing.scale.x=.44+.56*spread;
      }
    });
  }
}

export function dryingPrints(face,art) {
  const rig=group(face,0,2.57,.49);
  for(const s of [-1,1]){
    rod(rig,P.walnut,[s*1.14,-.36,-.16],[s*1.14,.43,.10],.019);
  }
  tube(rig,P.ink,[[-1.14,.41,.10],[-.53,.33,.11],[.05,.30,.11],[.59,.33,.11],[1.14,.41,.10]],.009);
  const photo=art.room2.map.image;
  const patches=[[.369,.261,.156,.315],[.548,.261,.135,.315],[.718,.257,.128,.31]];
  for(let k=0;k<3;k++){
    const x=-.68+k*.68,y=.30+.048*Math.abs(x/.68),width=.48,height=.54;
    const sheetArt=painted(makeCanvas(192,216,(g,w,h)=>{
      g.fillStyle=['#f5e8cd','#e6e8d7','#f6e7d2'][k];g.fillRect(0,0,w,h);
      const [sx,sy,sw,sh]=patches[k];
      g.drawImage(photo,sx*photo.width,sy*photo.height,sw*photo.width,sh*photo.height,14,17,164,165);
      g.fillStyle=['#a9533e','#37685f','#8a6a4d'][k];g.fillRect(14,194,63,4);
    }));sheetArt.side=T.DoubleSide;
    const geo=new T.PlaneGeometry(width,height,7,9);
    const sheet=mesh(rig,geo,sheetArt,x,y-height*.50,.116);
    const pos=geo.attributes.position,base=pos.array.slice();
    for(const dx of [-.16,.16])box(rig,P.wood,x+dx,y+.004,.133,.037,.071,.028,true);
    animate(sheet,t=>{
      const gust=.50+.35*Math.sin(t*1.30-k*.57)+.15*Math.sin(t*2.7);
      for(let j=0;j<pos.count;j++){
        const u=.5-base[j*3+1]/height,v=base[j*3]/width;
        const free=u*u;
        pos.array[j*3+2]=free*(.045+gust*.18+.041*Math.sin(t*4.2-u*4.7+v*2-k*.70));
        pos.array[j*3+1]=base[j*3+1]+free*(.012+.068*gust);
        pos.array[j*3]=base[j*3]+free*.039*Math.sin(t*2.5-k*.6);
      }
      pos.needsUpdate=true;
    });
  }
}
