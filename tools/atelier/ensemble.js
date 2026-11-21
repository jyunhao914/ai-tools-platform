// Motion anchors are shared by street choreography and handheld props. The visible
// body is a skinned actor, fitted after the surrounding static architecture is batched.
import {group,box,cyl,oval,palette as P} from './craft.js';
export const performers=[];
export function person(parent,x,y,z,yaw,coat,action='stand'){
  const root=group(parent,x,y,z,yaw),hips=group(root,0,.391,0),body=group(hips,0,.012,0);
  const head=group(body,0,.409,.004),arms=[],elbows=[],legs=[],shins=[],hands=[],feet=[];
  for(const s of [-1,1]){
    const arm=group(body,s*.132,.247,0);
    const reach=action==='cook'?(s===1?.17:.055):action==='cycle'?.15:action==='read'?.12:.022;
    const elbow=group(arm,s*.039,-.129,reach*.31);
    arms.push(arm);elbows.push(elbow);hands.push(group(elbow,-s*.011,-.070,reach*.69));
    const leg=group(hips,s*.065,0,0),bend=action==='cycle'?.14:.027,shin=group(leg,0,-.166,bend);
    legs.push(leg);shins.push(shin);feet.push(group(shin,0,-.169,(action==='cycle'?-.035:0)-bend));
  }
  if(action==='cook'){cyl(head,P.paper,0,.083,0,.084,.083,.052);oval(head,P.paper,0,.114,0,.093,.037,.091);}
  if(action==='cycle')oval(head,P.jade,0,.073,0,.082,.049,.084);
  if(action==='read'){const book=box(body,'#827663',0,.10,.15,.18,.11,.016,true);book.rotation.x=-.52;}
  const actor={root,hips,body,head,arms,elbows,legs,shins,hands,feet,action,coat};
  root.name='town-performer-'+performers.length;
  for(const node of [root,hips,body,head,...arms,...elbows,...legs,...shins,...hands,...feet])node.userData.moves=true;
  performers.push(actor);return actor;
}
