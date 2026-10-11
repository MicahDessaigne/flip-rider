'use strict';
const World=(()=>{
const B=200,G=1500,PI=Math.PI;
let segs,bk,loops,obs,coins,gx,gy,seed,first,hadLoop,lastKind;
const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const R=(a,b)=>a+(b-a)*rnd();
function addSeg(x1,y1,x2,y2,loop){
  const s={x1,y1,x2,y2,loop:loop||null,la:true,lb:true,part:'g',dx:x2-x1,dy:y2-y1};
  s.l2=s.dx*s.dx+s.dy*s.dy||1;segs.push(s);
  const a=Math.floor(Math.min(x1,x2)/B),b=Math.floor(Math.max(x1,x2)/B);
  for(let i=a;i<=b;i++){let l=bk.get(i);if(!l)bk.set(i,l=[]);l.push(s)}
  return s;
}
const gseg=(x,y)=>{addSeg(gx,gy,x,y);gx=x;gy=y};
function flat(len){const x0=gx,n=Math.max(1,Math.round(len/60));for(let i=1;i<=n;i++)gseg(x0+len*i/n,gy)}
function ease(len,dy){const x0=gx,y0=gy,n=Math.max(3,Math.round(len/28));for(let i=1;i<=n;i++){const t=i/n;gseg(x0+len*t,y0+dy*(1-Math.cos(PI*t))/2)}}
function bumps(n,h){for(let i=0;i<n;i++){const x0=gx,y0=gy,L=R(70,100);for(let k=1;k<=8;k++){const t=k/8;gseg(x0+L*t,y0-h*Math.sin(PI*t))}}}
function groundY(x){const l=bk.get(Math.floor(x/B));if(l)for(const s of l)if(s.part==='g'&&!s.loop&&s.dx>0&&x>=s.x1&&x<=s.x2)return s.y1+s.dy*(x-s.x1)/s.dx;return null}
function lowY(x){let m=null;for(let i=-1;i<=1;i++){const l=bk.get(Math.floor(x/B)+i);if(l)for(const s of l)if(s.part!=='w'){const y=Math.max(s.y1,s.y2);if(m===null||y>m)m=y}}return m}
function coinsAlong(xa,xb,h,p){for(let x=xa;x<xb;x+=40){if(rnd()>p)continue;const y=groundY(x);if(y!==null)coins.push({x,y:y-h,k:'c'})}}
function jump(h,len,gap,drop,lh,ll){
  const n=10;let x0=gx,y0=gy;
  for(let i=1;i<=n;i++){const t=i/n;gseg(x0+len*t,y0-h*t*t)}
  const ex=gx,ey=gy,lx=ex+gap,ly=ey+drop-lh;
  const w=addSeg(lx,ly,lx,ly+700);w.part='w';
  gx=lx;gy=ly;
  for(let i=1;i<=n;i++){const t=i/n;gseg(lx+ll*t,ly+lh*(1-(1-t)*(1-t)))}
  for(let i=0;i<=6;i++)coins.push({x:ex+gap*i/6,y:ey-70-80*Math.sin(PI*i/6),k:'c'});
}
function loopPiece(r){
  const d=64,x0=gx,y0=gy,n=56,L={x0,y0,r,d,cx:x0+d/2,cy:y0-r};loops.push(L);
  let px=x0,py=y0;
  for(let i=1;i<=n;i++){
    const th=2*PI*i/n,x=x0+r*Math.sin(th)+d*th/(2*PI),y=y0-r*(1-Math.cos(th));
    const s=addSeg(px,py,x,y,L);s.part=i<=n/2?'A':'B';s.la=i<=n/2+4;s.lb=i>=n/2-3;px=x;py=y;
  }
  gx=px;gy=py;
  for(let i=0;i<10;i++){const a=i/10*2*PI;coins.push({x:L.cx+(r-34)*Math.sin(a),y:L.cy+(r-34)*Math.cos(a),k:'c'})}
  hadLoop=true;
}
function plaza(d){
  const n=1+((rnd()*(1+d*2.2))|0),avail=d<.12?3:d<.35?4:d<.6?5:6,types=['spikes','mine','saw','pend','crush','laser'];
  flat(130);coinsAlong(gx-60,gx+60,40,1);
  for(let i=0;i<n;i++){
    const t=types[(rnd()*avail)|0],pad=t==='pend'?230:t==='saw'?150:140;
    flat(pad);obs.push({t,x:gx,y:gy,ph:R(0,6.28)});flat(pad);coinsAlong(gx-50,gx+50,40,1);
  }
  if(rnd()<.18)coins.push({x:gx-60,y:gy-50,k:'s'});
  flat(80);
}
function pick(w){let t=0;for(const k in w)t+=w[k];let r=rnd()*t;for(const k in w){r-=w[k];if(r<=0)return k}return'hills'}
function nextPiece(){
  const d=Math.min(1,gx/45000),x0=gx;
  if(first){first=false;flat(900);return}
  const dir=gy>350?-1:gy<-450?1:(rnd()<.5?-1:1);let k;
  if(!hadLoop&&gx>2000)k='loop';
  else{let n=0;do{k=pick({hills:3,jump:3,plaza:.6+3*d,loop:1+d,bumps:1.4,crest:1.2+d,drop:gy<250?1+d:0})}while(k===lastKind&&(k==='loop'||k==='plaza'||k==='jump')&&++n<6)}
  lastKind=k;
  if(k==='hills'){const n=2+((rnd()*2)|0);let dr=dir;for(let i=0;i<n;i++){ease(R(380,560),dr*R(80,170+230*d));flat(R(30,90));dr=-dr}coinsAlong(x0+60,gx-40,40,.7)}
  else if(k==='jump'){
    flat(140);const h=R(55,95),len=R(170,220),th=Math.atan(2*h/len),vm=500+220*d;
    const rg=vm*Math.cos(th)*(2*vm*Math.sin(th)/G);
    jump(h,len,Math.max(70,rg*R(.3,.62)),R(0,40+60*d),R(30,60),R(190,250));flat(160);
  }
  else if(k==='loop'){flat(240);loopPiece(R(105,150+50*d));flat(320)}
  else if(k==='bumps'){flat(80);bumps(4+((rnd()*5)|0),R(8,12+10*d));flat(100);coinsAlong(x0+80,gx-60,40,.6)}
  else if(k==='crest'){ease(R(260,320),-R(150,250));ease(R(240,300),R(180,300));flat(110);coinsAlong(x0+60,gx-40,40,.5)}
  else if(k==='drop'){flat(80);ease(R(210,260),R(130,260));flat(150);coinsAlong(x0+60,gx-40,40,.6)}
  else plaza(d);
}
function shapes(o,T){
  const t=T+o.ph;
  switch(o.t){
    case'spikes':return[{x1:o.x-36,y1:o.y-18,x2:o.x+36,y2:o.y}];
    case'saw':return[{x:o.x+Math.sin(t*1.8)*70,y:o.y-22,r:22}];
    case'mine':return[{x:o.x,y:o.y-62+Math.sin(t*2.2)*28,r:15}];
    case'pend':{const a=Math.sin(t*1.5)*.95;return[{x:o.x+Math.sin(a)*205,y:o.y-240+Math.cos(a)*205,r:20}]}
    case'crush':{const p=t%2.6;let bt;if(p<1.2)bt=170;else if(p<1.35)bt=170-166*(p-1.2)/.15;else if(p<1.9)bt=4;else bt=4+166*(p-1.9)/.7;
      return[{x1:o.x-28,y1:o.y-420,x2:o.x+28,y2:o.y-bt}]}
    case'laser':return(t%3.2)>2.2?[{x1:o.x-5,y1:o.y-260,x2:o.x+5,y2:o.y}]:[];
  }
  return[];
}
function prune(x){
  segs=segs.filter(s=>s.x2>x-1500);coins=coins.filter(c=>!c.got&&c.x>x-800);
  obs=obs.filter(o=>o.x>x-800);loops=loops.filter(l=>l.x0+l.d+l.r>x-800);
  const lim=Math.floor((x-1600)/B);for(const k of bk.keys())if(k<lim)bk.delete(k);
}
return{
  reset(sd){seed=(sd>>>0)||1;segs=[];bk=new Map();loops=[];obs=[];coins=[];gx=0;gy=0;first=true;hadLoop=false;lastKind=''},
  ensure(x){while(gx<x+3200)nextPiece()},
  prune,groundY,lowY,shapes,bucket:i=>bk.get(i),
  get segs(){return segs},get obs(){return obs},get coins(){return coins},get loops(){return loops}
};
})();
