// Small, locally synthesized cues keep the soundtrack available offline.
export function townSound(){
  let ctx,master,bed,inside=false,enabled=false,pulses,noise,serial=0;
  function note(hz,time,length,level,type='sine',end=hz){
    const osc=ctx.createOscillator(),env=ctx.createGain();
    osc.type=type;osc.frequency.setValueAtTime(hz,time);osc.frequency.exponentialRampToValueAtTime(end,time+length);
    env.gain.setValueAtTime(.0001,time);env.gain.exponentialRampToValueAtTime(level,time+.012);env.gain.exponentialRampToValueAtTime(.0001,time+length);
    osc.connect(env).connect(master);osc.start(time);osc.stop(time+length+.01);osc.onended=()=>{osc.disconnect();env.disconnect();};
  }
  function cue(kind){
    if(!enabled||ctx.state!=='running'||document.hidden)return;
    const t=ctx.currentTime+.015;
    if(kind==='door'){note(587,t,.35,.14);note(880,t+.14,.54,.095);}
    else if(kind==='scan'){note(1840,t,.092,.075);}
    else if(kind==='board'){note(392,t,.16,.11,'triangle');note(587,t+.09,.22,.08);}
    else if(kind==='station'){note(740,t,.12,.12);note(1110,t+.055,.15,.065);}
    else if(kind==='shutter'){note(910,t,.048,.13,'triangle',115);note(510,t+.065,.035,.075,'triangle',135);}
    else if(kind==='laugh'){for(let i=0;i<3;i++){note(340+i*15,t+i*.135,.108,.050,'triangle',238+i*12);note(900,t+i*.135,.085,.018,'sine',620);}}
    else if(kind==='bird'){note(2170,t,.12,.038,'sine',3030);note(3150,t+.16,.15,.027,'sine',2120);}
    else if(kind==='bus'){note(659,t,.26,.065);note(523,t+.20,.30,.047);}
    else if(kind==='bell'){note(990,t,.52,.068);note(1485,t+.16,.45,.027);}
  }
  function pulse(){if(!inside&&enabled)cue(['bell','shutter','laugh'][serial++%3]);}
  function room(value){
    if(inside===value)return;inside=value;
    if(bed)bed.frequency.setTargetAtTime(value?230:690,ctx.currentTime,.32);
    if(value)cue('door');
  }
  async function toggle(){
    if(!ctx){
      const Engine=window.AudioContext||window.webkitAudioContext;if(!Engine)return false;
      ctx=new Engine();master=ctx.createGain();master.gain.value=.65;master.connect(ctx.destination);
      const size=ctx.sampleRate*3,buffer=ctx.createBuffer(1,size,ctx.sampleRate),data=buffer.getChannelData(0);
      let last=0;for(let i=0;i<size;i++){last=.90*last+.10*(Math.random()*2-1);data[i]=last*.43;}
      noise=ctx.createBufferSource();noise.buffer=buffer;noise.loop=true;bed=ctx.createBiquadFilter();bed.type='lowpass';bed.frequency.value=inside?230:690;
      noise.connect(bed).connect(master);noise.start();
    }
    if(enabled){enabled=false;clearInterval(pulses);await ctx.suspend();return false;}
    await ctx.resume();if(ctx.state!=='running')return false;
    enabled=true;cue(inside?'door':'bell');pulses=setInterval(pulse,5800);return true;
  }
  function visibility(){if(enabled){if(document.hidden)ctx.suspend().catch(()=>{});else ctx.resume().catch(()=>{});}}
  function close(){enabled=false;clearInterval(pulses);if(ctx&&ctx.state!=='closed'){noise.stop();ctx.close().catch(()=>{});}}
  return {toggle,cue,room,visibility,close};
}
