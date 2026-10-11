'use strict';
const Snd=(()=>{
let ac,master,eo,eg,nb,on=localStorage.wrSnd!=='0',step=0,next=0;
const ROOT=[55,55,65.41,49],RH=[1,0,1,1,0,1,0,1,1,0,1,0,1,1,0,1];
function init(){
  if(ac){if(ac.state!=='running')ac.resume();return}
  const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
  ac=new C();master=ac.createGain();master.gain.value=on?.7:0;master.connect(ac.destination);
  nb=ac.createBuffer(1,ac.sampleRate,ac.sampleRate);const d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  eo=ac.createOscillator();eo.type='sawtooth';const f=ac.createBiquadFilter();f.type='lowpass';f.frequency.value=420;
  eg=ac.createGain();eg.gain.value=0;eo.connect(f);f.connect(eg);eg.connect(master);eo.start();
  next=ac.currentTime+.1;setInterval(sched,50);
}
function tone(f,d,type,v,f2,t0){
  if(!ac||!on)return;t0=t0||ac.currentTime;const o=ac.createOscillator(),g=ac.createGain();
  o.type=type||'square';o.frequency.setValueAtTime(f,t0);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t0+d);
  g.gain.setValueAtTime(v||.2,t0);g.gain.exponentialRampToValueAtTime(.0001,t0+d);
  o.connect(g);g.connect(master);o.start(t0);o.stop(t0+d+.02);
}
function noise(d,v,fq,t0){
  if(!ac||!on)return;t0=t0||ac.currentTime;const s=ac.createBufferSource(),g=ac.createGain(),f=ac.createBiquadFilter();
  s.buffer=nb;f.type=fq>2000?'highpass':'lowpass';f.frequency.value=fq;g.gain.setValueAtTime(v,t0);g.gain.exponentialRampToValueAtTime(.0001,t0+d);
  s.connect(f);f.connect(g);g.connect(master);s.start(t0);s.stop(t0+d);
}
function sched(){
  if(!ac)return;if(!on){next=ac.currentTime+.1;return}
  while(next<ac.currentTime+.2){
    const s=step%16,t=next,bar=Math.floor(step/16)%4;
    if(s%4===0)tone(140,.18,'sine',.9,40,t);
    if(RH[s]){const f=ROOT[bar]*(s%8===6?2:1);tone(f,.12,'sine',.4,null,t);tone(f*2,.1,'sawtooth',.06,null,t)}
    if(s%2===1)noise(.04,.07,7000,t);
    step++;next+=.125;
  }
}
return{
  init,get on(){return on},
  toggle(){on=!on;localStorage.wrSnd=on?'1':'0';if(master)master.gain.value=on?.7:0;return on},
  engine(n,thr){if(!ac)return;const t=ac.currentTime;if(n<0){eg.gain.setTargetAtTime(0,t,.05);return}
    eo.frequency.setTargetAtTime(45+n*95,t,.05);eg.gain.setTargetAtTime(on?(thr?.09:.045):0,t,.08)},
  coin(){tone(988,.07,'square',.12);tone(1319,.12,'square',.12,null,ac&&ac.currentTime+.06)},
  flip(n){tone(500,.15,'triangle',.25,900+n*150)},
  crash(){noise(.5,.8,900);tone(160,.5,'sawtooth',.4,30)},
  land(){tone(110,.12,'sine',.7,45);noise(.08,.2,1500)},
  loop(){[523,659,784,1046].forEach((f,i)=>tone(f,.12,'square',.14,null,ac&&ac.currentTime+i*.07))},
  shield(){tone(300,.3,'sine',.3,900)},
  close(){tone(1200,.06,'square',.1)}
};
})();
