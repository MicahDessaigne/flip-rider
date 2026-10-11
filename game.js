'use strict';
(()=>{
const $=id=>document.getElementById(id);
const cv=$('c'),ctx=cv.getContext('2d');
const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hs=n=>{const x=Math.sin(n*127.1)*43758.5453;return x-Math.floor(x)};
let W,H,DPR=1,Z=1,SA={t:0,r:0,b:0,l:0};
function resize(){
  DPR=Math.min(2,devicePixelRatio||1);W=innerWidth;H=innerHeight;
  cv.width=W*DPR;cv.height=H*DPR;cv.style.width=W+'px';cv.style.height=H+'px';
  const c=getComputedStyle($('probe'));
  SA={t:parseFloat(c.paddingTop)||0,r:parseFloat(c.paddingRight)||0,b:parseFloat(c.paddingBottom)||0,l:parseFloat(c.paddingLeft)||0};
}
addEventListener('resize',resize);resize();

/* ---------- save data / shop ---------- */
const SKINS=[{n:'Crimson',c:'#ff1744',p:0},{n:'Cyan',c:'#00e5ff',p:120},{n:'Gold',c:'#ffd600',p:120},{n:'Venom',c:'#76ff03',p:250}];
const COST={shield:[60,150,320],magnet:[80,200,420]},MAG=[0,120,180,250];
let SV;try{SV=JSON.parse(localStorage.wr7||'{}')}catch(e){SV={}}
SV=Object.assign({coins:0,best:0,shield:0,magnet:0,skin:0,own:[1,0,0,0]},SV);
const save=()=>{try{localStorage.wr7=JSON.stringify(SV)}catch(e){}};
const vib=ms=>{try{navigator.vibrate&&navigator.vibrate(ms)}catch(e){}};

/* ---------- constants ---------- */
const WR=12,WB=20,WO=8,GRAV=1500,INERT=800,LOOPV=450,HEAD=[[5,-20],[1,-13]];
const vmaxOf=x=>480+220*Math.min(1,Math.max(0,x)/45000);

/* ---------- state ---------- */
let mode='menu',b,s,rd=null,T=0,hold=false,parts=[],texts=[],shake=0,hit=0,deadT=0,overT=0,pruneT=0;
const cam={x:0,y:0,vh:600};
const buf=[];

function newRun(){
  World.reset((Math.random()*1e9)|0);World.ensure(0);
  const y=World.groundY(200);
  b={x:200,y:y-21,vx:0,vy:0,a:0,w:0,wr:0,rs:0,sl:0,on:[false,false]};
  s={pts:0,mult:1,chain:0,mt:0,shield:SV.shield,inv:0,airT:0,gT:0,rot:0,fs:0,loopL:null,layer:0,mile:1,dead:0,coins:0};
  parts=[];texts=[];rd=null;T=0;shake=0;hit=0;cam.x=b.x+250;cam.y=b.y-45;cam.vh=600;
}
const dist=()=>Math.max(0,(b.x-200)/10);
const total=()=>s.pts+Math.floor(dist()/50);
const rankOf=t=>t>=300?'S':t>=160?'A':t>=80?'B':t>=30?'C':'D';

/* ---------- helpers ---------- */
function burst(x,y,n,c,sp){for(let i=0;i<n;i++){const a=Math.random()*TAU,v=Math.random()*(sp||150);parts.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-40,l:.5,m:.5,c,z:2+Math.random()*2})}}
function txt(x,y,t,c){texts.push({x,y,t,c:c||'#fff',l:1.3})}
function trick(p,label,chain){
  const v=p*s.mult;s.pts+=v;txt(b.x,b.y-50,'+'+v+' '+label,'#fff');
  if(chain){s.chain++;s.mult=Math.min(5,1+Math.floor(s.chain/2));s.mt=7}
}
function wp(i){const c=Math.cos(b.a),sn=Math.sin(b.a),fx=i?WB:-WB;return{x:b.x+c*fx-sn*WO,y:b.y+sn*fx+c*WO}}
function lp(lx,ly){const c=Math.cos(b.a),sn=Math.sin(b.a);return{x:b.x+c*lx-sn*ly,y:b.y+sn*lx+c*ly}}
const segOK=g=>!g.loop||(s.layer?g.lb:g.la);
function contacts(px,py,r){
  buf.length=0;
  const a=Math.floor((px-r)/200),z=Math.floor((px+r)/200);
  for(let i=a;i<=z;i++){const l=World.bucket(i);if(!l)continue;
    for(const g of l){
      if(!segOK(g))continue;
      let t=((px-g.x1)*g.dx+(py-g.y1)*g.dy)/g.l2;t=t<0?0:t>1?1:t;
      const dx=px-(g.x1+g.dx*t),dy=py-(g.y1+g.dy*t),d2=dx*dx+dy*dy;
      if(d2<r*r){const d=Math.sqrt(d2)||1e-4;buf.push({nx:dx/d,ny:dy/d,pen:r-d,sg:g})}
    }}
  return buf;
}
function crash(){
  if(s.dead)return;s.dead=1;mode='dead';deadT=0;hold=false;shake=18;
  Snd.crash();vib(220);burst(b.x,b.y,40,'#ff2b3a',380);burst(b.x,b.y,20,'#fff',260);
  rd={x:b.x,y:b.y-14,vx:b.vx*.9,vy:b.vy*.9-250,a:b.a,w:(Math.random()-.5)*16};
}

/* ---------- physics ---------- */
function step(h){
  let ax=0,ay=GRAV,inL=false;const L=s.loopL;
  if(L&&mode!=='menu'){
    const dx=b.x-L.cx,dy=b.y-L.cy,d=Math.hypot(dx,dy)||1;
    if(d<L.r+30&&d>L.r-75&&b.y<L.y0-L.r*.2){inL=true;ax=dx/d*GRAV*1.1;ay=dy/d*GRAV*1.1}
  }
  b.vx+=ax*h;b.vy+=ay*h;
  const air=!(b.on[0]||b.on[1]);
  if(!s.dead&&air){if(hold)b.w=Math.max(b.w-26*h,-9.5);else b.w*=Math.max(0,1-9*h)}
  b.w*=1-.25*h;
  b.x+=b.vx*h;b.y+=b.vy*h;b.a+=b.w*h;
  b.on[0]=b.on[1]=false;let nx0=0,ny0=0,got=false;
  for(let i=0;i<2;i++){
    const p=wp(i),cs=contacts(p.x,p.y,WR);
    for(const c of cs){
      if(c.sg.part==='w'&&c.nx<-.5&&!s.dead&&mode==='play')crash();
      b.x+=c.nx*c.pen;b.y+=c.ny*c.pen;
      const rx=p.x-b.x,ry=p.y-b.y,vn=(b.vx-b.w*ry)*c.nx+(b.vy+b.w*rx)*c.ny;
      if(vn<0){const rn=rx*c.ny-ry*c.nx,j=-1.05*vn/(1+rn*rn/INERT);b.vx+=c.nx*j;b.vy+=c.ny*j;b.w+=rn*j/INERT;if(-vn>hit)hit=-vn}
      b.on[i]=true;nx0=c.nx;ny0=c.ny;got=true;
    }
  }
  if(got){
    b.sl=Math.atan2(nx0,-ny0);
    let tx=-ny0,ty=nx0;const fx=Math.cos(b.a),fy=Math.sin(b.a);
    if(tx*fx+ty*fy<0){tx=-tx;ty=-ty}
    const vt=b.vx*tx+b.vy*ty,vm=vmaxOf(b.x),live=hold&&!s.dead&&mode==='play';
    if(live){
      if(vt<vm){const a=vt<150?2800:1900;b.vx+=tx*a*h;b.vy+=ty*a*h}
      else{b.vx*=1-1.2*h;b.vy*=1-1.2*h}
    }else{const k=1-.35*h;b.vx*=k;b.vy*=k}
    if(inL&&mode==='play'&&!s.dead){const sp=Math.hypot(b.vx,b.vy);if(sp<LOOPV&&sp>5){const k=LOOPV/sp;b.vx*=k;b.vy*=k}}
    b.rs=(b.vx*tx+b.vy*ty)/WR;
  }
  b.wr+=b.rs*h;
  const q=b.vx*b.vx+b.vy*b.vy;if(q>1300*1300){const k=1300/Math.sqrt(q);b.vx*=k;b.vy*=k}
  if(!s.dead&&mode==='play'&&T>.4){
    for(const hp of HEAD){const p=lp(hp[0],hp[1]);if(contacts(p.x,p.y,6.5).length){crash();break}}
  }
}

/* ---------- per-frame logic ---------- */
const rectD=(p,q)=>Math.hypot(Math.max(q.x1-p.x,0,p.x-q.x2),Math.max(q.y1-p.y,0,p.y-q.y2))-p.r;
function logic(dt,sp,air){
  // loops
  let L=s.loopL;
  if(!L||b.x<L.x0-L.r-60||b.x>L.x0+L.d+L.r+60){L=null;for(const q of World.loops)if(b.x>q.x0-70&&b.x<q.x0+q.d+q.r+60){L=q;break}}
  if(L!==s.loopL){s.loopL=L;if(!L)s.layer=0}
  if(L){
    if(s.layer===0&&b.x<L.cx-10&&b.y<L.cy){s.layer=1;L.ent=true}
    else if(s.layer===1&&b.x>L.x0+L.d+40){s.layer=0;if(L.ent&&!L.done){L.done=true;trick(6,'LOOP',1);Snd.loop();vib(30)}}
  }
  // air tricks
  if(air){
    s.gT=0;s.airT+=dt;s.rot+=b.w*dt;
    const f=Math.floor(Math.abs(s.rot)/TAU+.25);
    if(f>s.fs){s.fs=f;Snd.flip(f);txt(b.x,b.y-40,'FLIP x'+f,'#ffd54a');vib(15)}
  }else{
    s.gT+=dt;
    if(s.gT>.06){
      if(s.airT>.3){
        const f=Math.floor(Math.abs(s.rot)/TAU+.25),rel=Math.abs(Math.atan2(Math.sin(b.a-b.sl),Math.cos(b.a-b.sl)));
        if(rel<1.2){
          if(f>0)trick(f*(f+3)/2,f>1?'FLIPS':'FLIP',1);
          if(rel<.25&&(f>0||s.airT>.6)){trick(1,'PERFECT',f>0?0:0)}
          if(s.airT>1.1){const v=Math.ceil((s.airT-.8)/.5);s.pts+=v;txt(b.x,b.y-70,'+'+v+' AIR','#9cf')}
        }
        Snd.land();burst(b.x,b.y+14,10,'#ffb300',220);
      }
      s.airT=0;s.rot=0;s.fs=0;
    }
  }
  // obstacles
  if(s.inv>0)s.inv-=dt;
  const w0=wp(0),w1=wp(1),h0=lp(5,-20),pts=[{x:w0.x,y:w0.y,r:11},{x:w1.x,y:w1.y,r:11},{x:h0.x,y:h0.y,r:6},{x:b.x,y:b.y,r:10}];
  for(const o of World.obs){
    if(o.dead||Math.abs(o.x-b.x)>450)continue;
    let md=1e9,hitO=false;
    for(const q of World.shapes(o,T))for(const p of pts){
      const d=q.r?Math.hypot(p.x-q.x,p.y-q.y)-q.r-p.r:rectD(p,q);
      if(d<md)md=d;if(d<0)hitO=true;
    }
    if(hitO){
      o.hit=1;
      if(s.inv<=0){
        if(s.shield>0){s.shield--;s.inv=1.6;o.dead=1;Snd.shield();shake=10;vib(60);burst(b.x,b.y,24,'#00e5ff',300);txt(b.x,b.y-50,'SHIELD!','#00e5ff')}
        else crash();
      }
    }else{
      o.md=Math.min(o.md===undefined?1e9:o.md,md);
      if(!o.cc&&!o.hit&&b.x>o.x+200){o.cc=1;if(o.md<22){trick(1,'CLOSE CALL');Snd.close()}}
    }
  }
  // coins
  const mr=MAG[SV.magnet];
  for(const c of World.coins){
    if(c.got||Math.abs(c.x-b.x)>mr+60)continue;
    let dx=b.x-c.x,dy=b.y-6-c.y,d=Math.hypot(dx,dy);
    if(mr&&c.k==='c'&&d<mr){c.x+=dx*Math.min(1,dt*9);c.y+=dy*Math.min(1,dt*9);dx=b.x-c.x;dy=b.y-6-c.y;d=Math.hypot(dx,dy)}
    if(d<30){
      c.got=1;
      if(c.k==='s'){s.shield=Math.min(3,s.shield+1);Snd.shield();txt(c.x,c.y-20,'SHIELD +1','#00e5ff')}
      else{s.coins++;Snd.coin()}
      burst(c.x,c.y,5,c.k==='s'?'#00e5ff':'#ffd54a',120);
    }
  }
  // multiplier decay
  if(s.chain>0){s.mt-=dt;if(s.mt<=0){s.chain=Math.max(0,s.chain-2);s.mult=Math.min(5,1+Math.floor(s.chain/2));s.mt=s.chain>0?3:0}}
  // milestones
  if(dist()>=s.mile*500){s.pts+=5;txt(b.x,b.y-90,(s.mile*500)+' m  +5','#ff8a80');s.mile++}
  // fall death
  const ly=World.lowY(b.x);if(ly!==null&&b.y>ly+450)crash();
  // sparks
  if(!air&&sp>250&&Math.random()<.5){const p=wp(0);parts.push({x:p.x,y:p.y+WR,vx:-sp*.2+Math.random()*60,vy:-Math.random()*140,l:.3,m:.3,c:'#ffa000',z:2})}
  // world
  World.ensure(b.x);pruneT+=dt;if(pruneT>1.5){pruneT=0;World.prune(b.x)}
  Snd.engine(sp/900,hold&&!air);
}

function update(dt){
  T+=dt;
  const n=Math.min(8,Math.max(1,Math.ceil(dt*240))),h=dt/n;
  for(let i=0;i<n;i++)step(h);
  const sp=Math.hypot(b.vx,b.vy),air=!(b.on[0]||b.on[1]);
  if(hit>0){if(hit>260){Snd.land();shake=Math.max(shake,Math.min(8,hit/120));burst(b.x,b.y+14,8,'#ffb300',200)}hit=0}
  if(mode==='play')logic(dt,sp,air);
  else if(mode==='dead'){
    deadT+=dt;Snd.engine(-1);
    if(rd)for(let k=0;k<3;k++){
      const e=dt/3;rd.vy+=GRAV*e;rd.x+=rd.vx*e;rd.y+=rd.vy*e;rd.a+=rd.w*e;
      for(const c of contacts(rd.x,rd.y,10)){
        rd.x+=c.nx*c.pen;rd.y+=c.ny*c.pen;const vn=rd.vx*c.nx+rd.vy*c.ny;
        if(vn<0){rd.vx-=1.4*vn*c.nx;rd.vy-=1.4*vn*c.ny;rd.vx*=.85;rd.w*=.8}
      }
    }
    if(deadT>1.3)over();
  }else if(mode==='menu'){Snd.engine(-1);World.ensure(b.x)}
  for(const p of parts){p.l-=dt;p.vy+=600*dt;p.x+=p.vx*dt;p.y+=p.vy*dt}
  parts=parts.filter(p=>p.l>0);
  for(const t of texts){t.l-=dt;t.y-=40*dt}
  texts=texts.filter(t=>t.l>0);
  shake=Math.max(0,shake-dt*30);
  // camera
  const tvh=600+clamp((sp-400)/400,0,1)*120;cam.vh+=(tvh-cam.vh)*Math.min(1,dt*1.5);
  Z=Math.min(H/cam.vh,W/1000);const VW=W/Z;
  const fo=mode==='dead'&&rd?rd:b;
  cam.x+=((fo.x+VW*.17+(mode==='dead'?0:b.vx*.12))-cam.x)*Math.min(1,dt*6);
  cam.y+=((fo.y-45)-cam.y)*Math.min(1,dt*4);
}

/* ---------- drawing ---------- */
const acc=()=>SKINS[SV.skin].c;
const LY=[[.1,'#1b0710',300,80],[.22,'#230912',200,64],[.4,'#2c0b16',130,50]];
function bg(){
  const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#05020a');g.addColorStop(.6,'#2a0610');g.addColorStop(1,'#100208');
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  LY.forEach(([f,c,hh,w],li)=>{
    ctx.fillStyle=c;const off=cam.x*f,i0=Math.floor(off/w),base=H*.72-cam.y*f*.2*Z;
    for(let i=i0;i*w-off<W;i++){
      const bh=hh*(.3+.7*hs(i*3+li*91))*Z/1.2,x=i*w-off;
      ctx.fillRect(x,base-bh,w-3,bh+H);
      if(li>0&&hs(i+li*7)>.5){ctx.fillStyle='rgba(255,60,70,.28)';for(let k=0;k<3;k++)ctx.fillRect(x+8+k*14,base-bh+10+((hs(i+k)*bh*.6)|0),5,5);ctx.fillStyle=c}
    }
  });
}
function web(){
  const u=Math.max(.8,Math.min(W,H)/500),R=170*u,n=6;
  ctx.save();ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=1.2;ctx.beginPath();
  for(let i=0;i<=n;i++){const a=i/n*Math.PI/2;ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*R,Math.sin(a)*R)}
  for(let k=1;k<=5;k++){const r=R*k/5;for(let i=0;i<n;i++){const a=i/n*Math.PI/2,c=(i+1)/n*Math.PI/2,m=(a+c)/2;
    ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);ctx.quadraticCurveTo(Math.cos(m)*r*.86,Math.sin(m)*r*.86,Math.cos(c)*r,Math.sin(c)*r)}}
  ctx.stroke();ctx.restore();
}
function drawRider(){
  ctx.lineCap='round';ctx.lineJoin='round';
  ctx.strokeStyle='#8e0f1a';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-6,-2);ctx.lineTo(2,-9);ctx.lineTo(8,4);ctx.stroke();
  ctx.strokeStyle='#d41528';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(-6,-2);ctx.lineTo(1,-13);ctx.stroke();
  ctx.strokeStyle='#111';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-5,-4);ctx.lineTo(0,-8);ctx.moveTo(-6,-7);ctx.lineTo(-1,-6);ctx.stroke();
  ctx.fillStyle='#000';ctx.beginPath();ctx.arc(-3,-8,1.6,0,TAU);ctx.fill();
  ctx.strokeStyle='#d41528';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(1,-13);ctx.lineTo(14,-3);ctx.stroke();
  ctx.fillStyle='#e0182d';ctx.beginPath();ctx.arc(5,-20,6,0,TAU);ctx.fill();
  ctx.strokeStyle='#000';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(5,-26);ctx.lineTo(5,-14);ctx.moveTo(-1,-20);ctx.lineTo(11,-20);ctx.moveTo(1,-24);ctx.lineTo(9,-16);ctx.stroke();
  ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(8.3,-20.5,2.6,1.4,-.4,0,TAU);ctx.fill();
}
function drawBike(){
  ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.a);
  const A=acc();
  for(const fx of[-WB,WB]){
    ctx.save();ctx.translate(fx,WO);ctx.rotate(b.wr);
    ctx.fillStyle='#0b0b10';ctx.strokeStyle=A;ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(0,0,WR-1,0,TAU);ctx.fill();ctx.stroke();
    ctx.strokeStyle='#ff2b3a';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-8,0);ctx.lineTo(8,0);ctx.moveTo(0,-8);ctx.lineTo(0,8);ctx.stroke();ctx.restore();
  }
  ctx.fillStyle='#16161d';ctx.strokeStyle=A;ctx.lineWidth=1.5;ctx.beginPath();
  ctx.moveTo(-31,-2);ctx.quadraticCurveTo(-28,6,-20,6);ctx.lineTo(20,6);ctx.quadraticCurveTo(28,6,31,-2);ctx.lineTo(28,-1);
  ctx.quadraticCurveTo(26,9,18,9);ctx.lineTo(-18,9);ctx.quadraticCurveTo(-26,9,-28,-1);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#2a2a33';ctx.fillRect(-14,-4,16,9);ctx.fillStyle='#ff2b3a';ctx.fillRect(-14,-4,16,2);
  if(!s.dead)drawRider();
  if(s.shield>0||s.inv>0){
    if(s.inv<=0||Math.floor(T*14)%2){ctx.strokeStyle='rgba(0,229,255,.9)';ctx.fillStyle='rgba(0,229,255,.12)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,-6,40,0,TAU);ctx.fill();ctx.stroke()}
  }
  ctx.restore();
}
function drawObs(o){
  const sh=World.shapes(o,T);
  switch(o.t){
    case'spikes':ctx.fillStyle='#ddd';ctx.strokeStyle='#ff1e2d';ctx.lineWidth=1.5;ctx.beginPath();
      for(let i=0;i<5;i++){const x=o.x-35+i*14;ctx.moveTo(x,o.y);ctx.lineTo(x+7,o.y-18);ctx.lineTo(x+14,o.y)}ctx.fill();ctx.stroke();break;
    case'saw':{const q=sh[0];ctx.save();ctx.translate(q.x,q.y);ctx.rotate(T*12);ctx.fillStyle='#ddd';ctx.strokeStyle='#ff1e2d';ctx.lineWidth=2;ctx.beginPath();
      for(let i=0;i<20;i++){const a=i/20*TAU,r=i%2?16:23;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle='#300';ctx.beginPath();ctx.arc(0,0,5,0,TAU);ctx.fill();ctx.restore();break}
    case'mine':{const q=sh[0];ctx.save();ctx.translate(q.x,q.y);ctx.rotate(T*2);ctx.strokeStyle='#ff1e2d';ctx.lineWidth=2.5;ctx.beginPath();
      for(let i=0;i<8;i++){const a=i/8*TAU;ctx.moveTo(Math.cos(a)*12,Math.sin(a)*12);ctx.lineTo(Math.cos(a)*20,Math.sin(a)*20)}ctx.stroke();
      ctx.fillStyle='#1a1a22';ctx.beginPath();ctx.arc(0,0,13,0,TAU);ctx.fill();ctx.stroke();
      ctx.fillStyle=Math.floor(T*4)%2?'#ff1e2d':'#600';ctx.beginPath();ctx.arc(0,0,5,0,TAU);ctx.fill();ctx.restore();break}
    case'pend':{const q=sh[0];ctx.strokeStyle='#888';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(o.x,o.y-240);ctx.lineTo(q.x,q.y);ctx.stroke();
      ctx.fillStyle='#222';ctx.beginPath();ctx.arc(o.x,o.y-240,7,0,TAU);ctx.fill();
      ctx.fillStyle='#1a1a22';ctx.strokeStyle='#ff1e2d';ctx.lineWidth=3;ctx.beginPath();ctx.arc(q.x,q.y,20,0,TAU);ctx.fill();ctx.stroke();
      ctx.fillStyle='#ff1e2d';ctx.beginPath();ctx.arc(q.x,q.y,6,0,TAU);ctx.fill();break}
    case'crush':{const q=sh[0],p=(T+o.ph)%2.6;
      if(p>.9&&p<1.9&&Math.floor(T*10)%2){ctx.fillStyle='rgba(255,30,45,.7)';ctx.fillRect(o.x-30,o.y-3,60,3)}
      ctx.fillStyle='#1b1b24';ctx.strokeStyle=acc();ctx.lineWidth=2;ctx.fillRect(q.x1,q.y1,56,q.y2-q.y1);ctx.strokeRect(q.x1,q.y1,56,q.y2-q.y1);
      ctx.fillStyle='#ff1e2d';for(let i=0;i<4;i++)ctx.fillRect(q.x1,q.y2-24+i*6,56,3);break}
    case'laser':{ctx.fillStyle='#222';ctx.fillRect(o.x-9,o.y-8,18,8);ctx.fillRect(o.x-9,o.y-260,18,8);
      const p=(T+o.ph)%3.2;
      if(sh.length){ctx.strokeStyle='rgba(255,30,45,.5)';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(o.x,o.y-252);ctx.lineTo(o.x,o.y-8);ctx.stroke();
        ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke()}
      else if(p>1.7&&Math.floor(T*14)%2){ctx.strokeStyle='rgba(255,30,45,.5)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(o.x,o.y-252);ctx.lineTo(o.x,o.y-8);ctx.stroke()}
      break}
  }
}
function drawWorld(){
  const VW=W/Z,VH=H/Z,x0=cam.x-VW/2-100,x1=cam.x+VW/2+100,sg=World.segs,A=acc();
  const sx=(Math.random()-.5)*shake,sy=(Math.random()-.5)*shake;
  ctx.save();ctx.translate(W/2+sx,H/2+sy);ctx.scale(Z,Z);ctx.translate(-cam.x,-cam.y);
  const bot=cam.y+VH/2+120;
  ctx.fillStyle='#0d0408';ctx.beginPath();
  for(const g of sg)if(g.part==='g'&&!g.loop&&g.x2>x0&&g.x1<x1){const yb=Math.max(g.y1,g.y2,bot)+100;ctx.moveTo(g.x1,g.y1);ctx.lineTo(g.x2,g.y2);ctx.lineTo(g.x2,yb);ctx.lineTo(g.x1,yb);ctx.closePath()}
  ctx.fill();
  const path=(loop)=>{ctx.beginPath();let px=NaN,py=NaN;
    for(const g of sg){if(g.part==='w'||!!g.loop!==loop||g.x2<x0||g.x1>x1)continue;
      if(g.x1!==px||g.y1!==py)ctx.moveTo(g.x1,g.y1);ctx.lineTo(g.x2,g.y2);px=g.x2;py=g.y2}};
  ctx.lineJoin='round';ctx.lineCap='round';
  path(false);ctx.strokeStyle=A;ctx.globalAlpha=.25;ctx.lineWidth=10;ctx.stroke();ctx.globalAlpha=1;ctx.lineWidth=3;ctx.stroke();
  path(true);ctx.strokeStyle='#1a0a10';ctx.lineWidth=14;ctx.stroke();ctx.strokeStyle=A;ctx.lineWidth=3;ctx.stroke();
  for(const o of World.obs)if(!o.dead&&o.x>x0-250&&o.x<x1+250)drawObs(o);
  for(const c of World.coins){
    if(c.got||c.x<x0||c.x>x1)continue;
    if(c.k==='s'){ctx.strokeStyle='#00e5ff';ctx.fillStyle='rgba(0,229,255,.2)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(c.x,c.y,12,0,TAU);ctx.fill();ctx.stroke();continue}
    ctx.fillStyle='#ffd54a';ctx.strokeStyle='#a67c00';ctx.lineWidth=1.5;ctx.beginPath();
    ctx.ellipse(c.x,c.y,7*Math.abs(Math.cos(T*4+c.x*.1))+1,7,0,0,TAU);ctx.fill();ctx.stroke();
  }
  drawBike();
  if(rd){ctx.save();ctx.translate(rd.x,rd.y);ctx.rotate(rd.a);drawRider();ctx.restore()}
  for(const p of parts){ctx.globalAlpha=Math.max(0,p.l/p.m);ctx.fillStyle=p.c;ctx.fillRect(p.x,p.y,p.z,p.z)}
  ctx.globalAlpha=1;
  ctx.font='900 16px system-ui,sans-serif';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#000';
  for(const t of texts){ctx.globalAlpha=Math.min(1,t.l);ctx.fillStyle=t.c;ctx.strokeText(t.t,t.x,t.y);ctx.fillText(t.t,t.x,t.y)}
  ctx.globalAlpha=1;ctx.restore();
}
function hud(){
  const u=clamp(Math.min(W/900,H/520),.8,1.3),x=SA.l+16,y=SA.t+10,A=acc(),F='system-ui,sans-serif';
  ctx.save();ctx.textBaseline='top';ctx.textAlign='left';ctx.lineWidth=5;ctx.strokeStyle='#000';
  ctx.font=`900 ${38*u}px ${F}`;ctx.fillStyle='#fff';const tt=String(total());ctx.strokeText(tt,x,y);ctx.fillText(tt,x,y);
  const my=y+44*u;ctx.font=`900 ${20*u}px ${F}`;ctx.fillStyle=s.mult>1?A:'#888';ctx.lineWidth=4;ctx.strokeText('x'+s.mult,x,my);ctx.fillText('x'+s.mult,x,my);
  ctx.fillStyle='rgba(255,255,255,.18)';ctx.fillRect(x+36*u,my+6*u,90*u,8*u);ctx.fillStyle=A;ctx.fillRect(x+36*u,my+6*u,90*u*clamp(s.mt/7,0,1),8*u);
  for(let i=0;i<s.shield;i++){ctx.strokeStyle='#00e5ff';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(x+10*u+i*22*u,my+38*u,8*u,0,TAU);ctx.stroke()}
  ctx.textAlign='center';ctx.font=`800 ${18*u}px ${F}`;ctx.fillStyle='#fff';ctx.lineWidth=4;ctx.strokeStyle='#000';
  const dm=Math.floor(dist())+' m';ctx.strokeText(dm,W/2,y+4);ctx.fillText(dm,W/2,y+4);
  ctx.textAlign='right';ctx.fillStyle='#ffd54a';const ct='● '+s.coins;ctx.strokeText(ct,W-SA.r-64,y+4);ctx.fillText(ct,W-SA.r-64,y+4);
  ctx.restore();
}
function draw(){
  ctx.setTransform(DPR,0,0,DPR,0,0);
  bg();web();
  const sp=Math.hypot(b.vx,b.vy),ss=clamp((sp-480)/400,0,1);
  drawWorld();
  if(ss>0&&mode==='play'){ctx.strokeStyle='rgba(255,255,255,.25)';ctx.lineWidth=1.5;ctx.beginPath();
    for(let i=0;i<ss*16;i++){const yy=Math.random()*H,xx=Math.random()*W,l=60+Math.random()*120;ctx.moveTo(xx,yy);ctx.lineTo(xx+l,yy)}ctx.stroke()}
  if(mode==='play'||mode==='dead')hud();
}

/* ---------- UI ---------- */
function show(id){for(const e of document.querySelectorAll('.scr'))e.style.display='none';if(id)$(id).style.display='flex'}
function menu(){mode='menu';newRun();$('mbest').textContent='BEST '+SV.best+'    ● '+SV.coins;show('menu')}
function startGame(){newRun();mode='play';show(null);Snd.init()}
function over(){
  if(mode==='over')return;mode='over';overT=performance.now();
  const sc=total(),nb=sc>SV.best;if(nb)SV.best=sc;SV.coins+=s.coins;save();
  $('osc').textContent=sc;$('ork').textContent='RANK '+rankOf(sc)+(nb&&sc>0?'  ·  NEW BEST!':'');
  $('ost').textContent=Math.floor(dist())+' m   ·   ● '+s.coins+'   ·   BEST '+SV.best;show('over');
}
function garage(){
  let h='';
  const up=(k,name,desc)=>{const lv=SV[k];h+=`<div class="it"><div><b>${name}</b><br><small>${desc} · LV ${lv}/3</small></div>`+(lv>=3?'<button disabled>MAX</button>':`<button data-u="${k}">● ${COST[k][lv]}</button>`)+'</div>'};
  up('shield','START SHIELD','Begin each run with shields');up('magnet','COIN MAGNET','Pulls coins toward you');
  SKINS.forEach((k,i)=>{h+=`<div class="it"><div><b>${k.n}</b><br><small>Neon colour</small></div>`+(SV.own[i]?(SV.skin===i?'<button disabled>EQUIPPED</button>':`<button data-s="${i}">EQUIP</button>`):`<button data-b="${i}">● ${k.p}</button>`)+'</div>'});
  $('gl').innerHTML=h;$('gc').textContent='● '+SV.coins;
}
$('gl').addEventListener('click',e=>{
  const t=e.target.closest('button');if(!t||t.disabled)return;
  if(t.dataset.u){const k=t.dataset.u,c=COST[k][SV[k]];if(SV.coins>=c){SV.coins-=c;SV[k]++}}
  else if(t.dataset.b){const i=+t.dataset.b;if(SV.coins>=SKINS[i].p){SV.coins-=SKINS[i].p;SV.own[i]=1;SV.skin=i}}
  else if(t.dataset.s)SV.skin=+t.dataset.s;
  save();garage();
});
$('mg').onclick=()=>{garage();show('garage')};
$('og').onclick=()=>{garage();show('garage')};
$('gb').onclick=()=>menu();
$('snd').onclick=()=>{Snd.init();$('snd').textContent=Snd.toggle()?'🔊':'🔇'};
$('snd').textContent=Snd.on?'🔊':'🔇';
$('menu').addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;startGame();hold=true});
$('over').addEventListener('pointerdown',e=>{if(e.target.closest('button')||performance.now()-overT<600)return;startGame();hold=true});
addEventListener('pointerdown',()=>{Snd.init();if(mode==='play')hold=true});
addEventListener('pointerup',()=>{hold=false});addEventListener('pointercancel',()=>{hold=false});
addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='ArrowUp'){if(mode==='play')hold=true;else if(mode==='menu'||(mode==='over'&&performance.now()-overT>600)){startGame();hold=true}e.preventDefault()}});
addEventListener('keyup',e=>{if(e.code==='Space'||e.code==='ArrowUp')hold=false});

/* ---------- main loop ---------- */
let last=performance.now();
function frame(now){
  const dt=Math.min(.033,Math.max(.001,(now-last)/1000));last=now;
  try{update(dt);draw()}catch(e){const el=$('err');el.style.display='block';el.textContent=String(e&&e.stack||e).slice(0,400)}
  requestAnimationFrame(frame);
}
menu();requestAnimationFrame(frame);
})();
