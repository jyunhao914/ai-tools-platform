// Taichung city centre is fixed for the town. Unix timestamps keep the device timezone out of the data.
const endpoint='https://api.open-meteo.com/v1/forecast?latitude=24.15&longitude=120.68&current=weather_code,cloud_cover,precipitation,wind_speed_10m&timeformat=unixtime&timezone=Asia%2FTaipei';
const key='atelier-taichung-current-v1';
const minute=60000,refresh=15*minute,maximumAge=6*60*minute;
const bounded=(v,a,b)=>Math.min(b,Math.max(a,v));
function parse(data,now){
  const {time,weather_code:code,cloud_cover:cloud,precipitation:mm,wind_speed_10m:wind}=data||{};
  if(![time,code,cloud,mm,wind].every(Number.isFinite))return null;
  if(time*1000>now+8*minute||now-time*1000>maximumAge||cloud<0||cloud>100||mm<0||wind<0)return null;
  const drizzle=code>=51&&code<=57,showers=code>=80&&code<=86,storm=code>=95;
  const rainCode=drizzle||code>=61&&code<=77||showers||storm,wet=rainCode||mm>.015;
  const fog=code===45||code===48;
  const kind=wet?'rain':(cloud>=48||code===3||fog)?'cloud':'clear';
  const label=storm?'雷雨':showers?'陣雨':drizzle?'細雨':wet?'有雨':fog?'有霧':code===3||cloud>=87?'陰天':kind==='cloud'?'多雲':code===0&&cloud<15?'晴朗':'晴時多雲';
  return {time:time*1000,kind,label,cloud:bounded(cloud/100,.06,1),rain:wet?bounded((storm?.86:drizzle?.38:.52)+mm*.72,.35,1):0,wind:bounded(wind/19,.18,1.65),fog};
}
export function weatherFeed(){
  let record=null,checked=0,request=null,next=0,failed=false;
  try{
    const cached=JSON.parse(localStorage.getItem(key)||'null');
    if(cached){record=parse(cached.data,Date.now());if(record){checked=Number(cached.checked)||0;next=Math.min(Date.now()+refresh,checked+refresh);}}
  }catch{}
  async function load(){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
    try{
      const response=await fetch(endpoint,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'});
      if(!response.ok)throw new Error('weather response');
      const data=(await response.json()).current,now=Date.now(),parsed=parse(data,now);
      if(!parsed||now-parsed.time>90*minute)throw new Error('weather timestamp');
      record=parsed;checked=now;failed=false;next=now+refresh;
      try{localStorage.setItem(key,JSON.stringify({data,checked}));}catch{}
    }catch{failed=true;next=Date.now()+2*minute;}
    finally{clearTimeout(timer);request=null;}
  }
  function read(now){
    if(!document.hidden&&!request&&now>=next)request=load();
    if(record&&now-record.time<=maximumAge){
      return {...record,state:failed||now-record.time>55*minute?'recent':'current'};
    }
    return {kind:'cloud',label:failed?'天氣暫缺':'天氣連線中',cloud:.38,rain:0,wind:.52,fog:false,time:0,state:failed?'offline':'loading'};
  }
  read(Date.now());return {read};
}
