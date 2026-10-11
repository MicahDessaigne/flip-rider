(() => {
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let W, H;
function resize() {
  const d = devicePixelRatio || 1;
  W = innerWidth; H = innerHeight;
  cv.width = W * d; cv.height = H * d;
  ctx.setTransform(d, 0, 0, d, 0, 0);
}
addEventListener('resize', resize); resize();

const TAU = Math.PI * 2;
const RED = '#e01a2b', HOT = '#ff2a3d';
const G = 1600, ACC = 950, MAXV = 1000, FR = 0.3, SPIN = 7.5;
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const hash = n => { n = Math.sin(n * 127.1) * 43758.5453; return n - Math.floor(n); };

// ---------- audio ----------
let ac = null;
function initAudio() {
  if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (A) ac = new A(); }
  if (ac && ac.state === 'suspended') ac.resume();
}
function beep(f0, f1, dur, type = 'sine', vol = 0.15) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(ac.destination);
  o.start(t); o.stop(t + dur);
}

// ---------- terrain (height array, null = void) ----------
const STEP = 8;
let hs = [], cy0 = 0, maxY = 0;
const add = y => { hs.push(y); if (y !== null && y > maxY) maxY = y; };
const flat = (n, sl = 0) => { for (let i = 0; i < n; i++) { cy0 += sl * STEP; add(cy0); } };
const ease = (n, dy) => { const y0 = cy0; for (let i = 1; i <= n; i++) { cy0 = y0 + dy * (1 - Math.cos(Math.PI * i / n)) / 2; add(cy0); } };
const ramp = (n, h) => { const y0 = cy0; for (let i = 1; i <= n; i++) { const t = i / n; cy0 = y0 - h * t * t; add(cy0); } };
const gap = n => { for (let i = 0; i < n; i++) add(null); };
const rnd = (a, b) => Math.floor(a + Math.random() * (b - a));

function terrainReset() { hs = []; cy0 = 0; maxY = 0; add(0); flat(110); }
function extend(toX) {
  while (hs.length * STEP < toX) {
    const dist = hs.length * STEP, r = Math.random();
    const dir = cy0 > 200 ? -1 : cy0 < -200 ? 1 : (Math.random() < 0.5 ? -1 : 1);
    if (r < 0.3) { ease(rnd(30, 55), dir * rnd(40, 120)); flat(rnd(5, 15)); }
    else if (r < 0.55) { const d = rnd(30, 80); ease(25, d); ease(25, -d); flat(rnd(4, 10)); }
    else if (r < 0.88 && dist > 2000) {
      flat(8); ramp(30, rnd(60, 110)); gap(rnd(16, 30));
      cy0 += rnd(30, 80); add(cy0); ease(25, 40); flat(15);
    } else { ease(20, dir * rnd(30, 90)); flat(rnd(15, 30)); }
  }
}
function gY(x) {
  const f = x / STEP, i = Math.floor(f);
  if (i < 0) return hs[0];
  if (i + 1 >= hs.length) return hs[hs.length - 1];
  const a = hs[i], b = hs[i + 1];
  if (a === null || b === null) return null;
  return a + (b - a) * (f - i);
}
function slopeAt(x) {
  const a = gY(x - 4), b = gY(x + 4);
  return (a === null || b === null) ? 0 : (b - a) / 8;
}

// ---------- state ----------
let s, holding = false, shake = 0, msg = '', msgT = 0, P = [];
let best = +localStorage.getItem('wr_best') || 0;
const ZOOM = () => Math.max(0.6, Math.min(1.3, H / 650));

function reset() {
  terrainReset(); extend(4000);
  P = []; shake = 0; msg = ''; msgT = 0;
  const VH = H / ZOOM();
  s = { x: 0, y: 0, v: 250, vx: 250, vy: 0, a: 0, g: true, spin: 0, bonus: 0,
        dead: false, started: false, deadAt: 0, why: '', camX: -200, camY: -VH * 0.62 };
}
const score = () => Math.floor(s.x / 40) + s.bonus;

function spark(x, y, vx, vy, c, n, life) {
  for (let i = 0; i < n; i++) P.push({
    x, y, vx: vx + (Math.random() - .5) * 220, vy: vy + (Math.random() - .5) * 220,
    l: life * (.6 + Math.random() * .6), m: life, c, z: 2 + Math.random() * 3 });
}

function press() {
  initAudio();
  if (s.dead) { if (performance.now() - s.deadAt > 500) reset(); return; }
  s.started = true; holding = true;
}
const release = () => { holding = false; };
cv.addEventListener('pointerdown', e => { e.preventDefault(); press(); });
addEventListener('pointerup', release);
addEventListener('pointercancel', release);
addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) press(); } });
addEventListener('keyup', e => { if (e.code === 'Space') release(); });

function crash(why) {
  if (s.dead) return;
  s.dead = true; s.deadAt = performance.now(); s.why = why; holding = false; shake = 22;
  spark(s.x, s.y - 20, 0, -150, HOT, 45, 1);
  spark(s.x, s.y - 20, 0, -150, '#ffffff', 14, .7);
  const sc = score();
  if (sc > best) { best = sc; localStorage.setItem('wr_best', best); }
  beep(160, 30, .4, 'sawtooth', .25);
  if (navigator.vibrate) navigator.vibrate([80, 40, 120]);
}

function step(dt) {
  if (!s.started || s.dead) return;
  if (s.g) {
    const th = Math.atan(slopeAt(s.x));
    s.v += G * Math.sin(th) * dt;
    if (holding) s.v += ACC * dt;
    s.v -= s.v * FR * dt;
    s.v = Math.max(80, Math.min(MAXV, s.v));
    s.vx = s.v * Math.cos(th); s.vy = s.v * Math.sin(th);
    const nx = s.x + s.vx * dt;
    const yBall = s.y + s.vy * dt + 0.5 * G * dt * dt;
    const gy = gY(nx);
    s.x = nx;
    if (gy === null || gy > yBall) {
      s.g = false; s.y = yBall; s.vy += G * dt; s.spin = 0;
    } else {
      s.y = gy;
      s.a += angDiff(th, s.a) * Math.min(1, 25 * dt);
      if (holding && Math.random() < 0.5) spark(s.x - 30, s.y - 14, -s.vx * .3, -40, HOT, 1, .35);
    }
  } else {
    s.vy += G * dt; s.x += s.vx * dt; s.y += s.vy * dt;
    if (holding) { s.a -= SPIN * dt; s.spin -= SPIN * dt; }
    const gy = gY(s.x);
    if (gy !== null && s.y >= gy) {
      const th = Math.atan(slopeAt(s.x));
      if (Math.abs(angDiff(s.a, th)) < 1.0) {
        s.y = gy; s.g = true;
        s.v = Math.max(80, s.vx * Math.cos(th) + s.vy * Math.sin(th));
        s.a = th;
        spark(s.x, s.y, s.vx * .2, -120, HOT, 12, .4);
        beep(110, 40, .1, 'sine', .2);
        const f = Math.round(Math.abs(s.spin) / TAU);
        if (f > 0) {
          const pts = f * f * 25; s.bonus += pts;
          msg = (f > 1 ? f + 'x FLIP! +' : 'FLIP! +') + pts; msgT = 1.3;
          beep(600 + f * 150, 1200 + f * 150, .22, 'triangle', .18);
        }
      } else crash(Math.abs(angDiff(s.a, th)) > 2 ? 'HEAD FIRST!' : 'BAD LANDING');
    } else if (s.y > maxY + 500) crash('FELL INTO THE VOID');
  }
}

function updateFx(dt) {
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    p.l -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt;
    if (p.l <= 0) P.splice(i, 1);
  }
  if (shake > 0) shake = Math.max(0, shake - dt * 40);
  if (msgT > 0) msgT -= dt;
}

// ---------- drawing ----------
function skyline(camX, par, baseY, hmin, hmax, fill, windows) {
  const bw = 70, off = camX * par, i0 = Math.floor(off / bw);
  for (let i = i0; i * bw - off < W + bw; i++) {
    const h = hmin + hash(i + par * 100) * (hmax - hmin), x = i * bw - off;
    ctx.fillStyle = fill; ctx.fillRect(x, baseY - h, bw - 6, h + H);
    if (windows) {
      ctx.fillStyle = 'rgba(255,60,70,0.55)';
      for (let k = 0; k < 6; k++) {
        const wx = x + 8 + (k % 3) * 18, wy = baseY - h + 14 + Math.floor(k / 3) * 26;
        if (hash(i * 7 + k) > 0.55) ctx.fillRect(wx, wy, 8, 12);
      }
    }
  }
}
function web() {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1.2;
  const rays = 6, R = Math.min(300, W * 0.6);
  for (let k = 0; k < rays; k++) {
    const a = (k / (rays - 1)) * Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); ctx.stroke();
  }
  for (let r = R / 5; r <= R; r += R / 5) {
    ctx.beginPath();
    for (let k = 0; k < rays - 1; k++) {
      const a1 = (k / (rays - 1)) * Math.PI / 2, a2 = ((k + 1) / (rays - 1)) * Math.PI / 2, m = (a1 + a2) / 2;
      if (k === 0) ctx.moveTo(Math.cos(a1) * r, Math.sin(a1) * r);
      ctx.quadraticCurveTo(Math.cos(m) * r * .86, Math.sin(m) * r * .86, Math.cos(a2) * r, Math.sin(a2) * r);
    }
    ctx.stroke();
  }
  ctx.restore();
}
function drawTerrain(cx, cy, VW, VH) {
  const i0 = Math.max(0, Math.floor(cx / STEP) - 1), i1 = Math.min(hs.length - 1, Math.ceil((cx + VW) / STEP) + 1);
  let run = [];
  const flush = () => {
    if (run.length >= 2) {
      ctx.beginPath(); ctx.moveTo(run[0][0], VH + 400);
      for (const p of run) ctx.lineTo(p[0], p[1]);
      ctx.lineTo(run[run.length - 1][0], VH + 400); ctx.closePath();
      ctx.fillStyle = '#0a0305'; ctx.shadowBlur = 0; ctx.fill();
      ctx.beginPath();
      run.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      ctx.strokeStyle = HOT; ctx.shadowColor = HOT; ctx.shadowBlur = 16; ctx.lineWidth = 4; ctx.stroke();
      ctx.shadowBlur = 0;
    }
    run = [];
  };
  for (let i = i0; i <= i1; i++) {
    const h = hs[i];
    if (h === null) flush(); else run.push([i * STEP - cx, h - cy]);
  }
  flush();
}

function drawRider(cx, cy) {
  ctx.save();
  ctx.translate(s.x - cx, s.y - cy);
  ctx.translate(0, -18); ctx.rotate(s.a); ctx.translate(0, 18);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const red = s.dead ? '#777' : RED;
  ctx.shadowColor = red; ctx.shadowBlur = 10;

  // wheels
  for (const wx of [-26, 26]) {
    ctx.fillStyle = '#0a0a0a'; ctx.strokeStyle = red; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(wx, -11, 10.5, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = red; ctx.beginPath(); ctx.arc(wx, -11, 3, 0, TAU); ctx.fill();
  }
  // skateboard deck with kicktails
  ctx.beginPath(); ctx.moveTo(-39, -23); ctx.lineTo(-32, -17); ctx.lineTo(32, -17); ctx.lineTo(39, -23);
  ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 7; ctx.stroke();
  ctx.strokeStyle = red; ctx.lineWidth = 2.5; ctx.stroke();
  // engine block + exhaust
  ctx.fillStyle = '#161616'; ctx.strokeStyle = red; ctx.lineWidth = 2;
  ctx.fillRect(-24, -31, 18, 13); ctx.strokeRect(-24, -31, 18, 13);
  ctx.beginPath(); ctx.moveTo(-24, -24); ctx.lineTo(-40, -19); ctx.strokeStyle = '#999'; ctx.lineWidth = 3; ctx.stroke();
  // front fork + handlebar
  ctx.strokeStyle = '#222'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(26, -11); ctx.lineTo(20, -41); ctx.stroke();
  ctx.strokeStyle = red; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(15, -43); ctx.lineTo(26, -43); ctx.stroke();

  ctx.shadowBlur = 4;
  // legs
  ctx.strokeStyle = red; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(-4, -37); ctx.lineTo(5, -28); ctx.lineTo(11, -19); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-4, -37); ctx.lineTo(-9, -28); ctx.lineTo(-14, -19); ctx.stroke();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 2; // black boot tips
  ctx.beginPath(); ctx.moveTo(8, -22); ctx.lineTo(11, -19); ctx.moveTo(-12, -22); ctx.lineTo(-14, -19); ctx.stroke();
  // torso
  ctx.strokeStyle = red; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(-4, -37); ctx.lineTo(6, -54); ctx.stroke();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 3; // black side stripe
  ctx.beginPath(); ctx.moveTo(-8, -38); ctx.lineTo(1, -53); ctx.stroke();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(2, -46, 3, 0, TAU); ctx.fill(); // chest spider mark
  // arms
  ctx.strokeStyle = red; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(6, -52); ctx.lineTo(18, -48); ctx.lineTo(21, -43); ctx.stroke();
  // head / mask
  ctx.fillStyle = red; ctx.beginPath(); ctx.arc(10, -63, 8.5, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(10, -71.5); ctx.lineTo(10, -54.5);
  ctx.moveTo(1.5, -63); ctx.lineTo(18.5, -63);
  ctx.moveTo(4, -69); ctx.lineTo(16, -57);
  ctx.moveTo(16, -69); ctx.lineTo(4, -57);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(10, -63, 5, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.2; ctx.shadowBlur = 0;
  for (const ex of [8, 14]) {
    ctx.beginPath(); ctx.ellipse(ex, -64, 3.2, 1.8, ex === 8 ? 0.45 : -0.45, 0, TAU); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function draw() {
  const Z = ZOOM(), VW = W / Z, VH = H / Z;
  // camera
  s.camX = s.x - VW * 0.3;
  s.camY += ((s.y - VH * 0.62) - s.camY) * 0.08;
  let sx = 0, sy = 0;
  if (shake > 0) { sx = (Math.random() - .5) * shake; sy = (Math.random() - .5) * shake; }
  const cx = s.camX + sx, cy = s.camY + sy;

  // background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#000000'); bg.addColorStop(0.6, '#1c0207'); bg.addColorStop(1, '#4a0510');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.shadowBlur = 0;
  web();
  ctx.fillStyle = 'rgba(255,40,60,0.18)'; ctx.beginPath(); ctx.arc(W * 0.78, H * 0.22, 70, 0, TAU); ctx.fill();
  skyline(cx, 0.15, H * 0.70 - s.camY * 0.05, 60, 200, '#12040a', false);
  skyline(cx, 0.35, H * 0.82 - s.camY * 0.10, 50, 180, '#0a0206', true);

  // world
  ctx.save(); ctx.scale(Z, Z);
  drawTerrain(cx, cy, VW, VH);
  // particles
  for (const p of P) {
    ctx.globalAlpha = Math.max(0, p.l / p.m);
    ctx.fillStyle = p.c; ctx.shadowColor = p.c; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(p.x - cx, p.y - cy, p.z, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  if (!s.dead) drawRider(cx, cy);
  ctx.restore();

  // HUD
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff'; ctx.shadowColor = HOT; ctx.shadowBlur = 14;
  ctx.font = '900 52px system-ui,sans-serif'; ctx.fillText(score(), W / 2, 76);
  ctx.shadowBlur = 0; ctx.font = '700 15px system-ui'; ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.fillText('BEST ' + best, W / 2, 102);
  if (msgT > 0) {
    ctx.fillStyle = '#fff'; ctx.shadowColor = HOT; ctx.shadowBlur = 20;
    ctx.font = '900 32px system-ui'; ctx.fillText(msg, W / 2, H * 0.28); ctx.shadowBlur = 0;
  }
  if (!s.started) {
    ctx.fillStyle = '#fff'; ctx.font = '800 26px system-ui'; ctx.fillText('WEB RIDER', W / 2, H * 0.3);
    ctx.font = '700 20px system-ui'; ctx.fillText('HOLD TO ACCELERATE', W / 2, H * 0.78);
    ctx.font = '500 15px system-ui'; ctx.fillStyle = 'rgba(255,255,255,.65)';
    ctx.fillText('HOLD IN THE AIR TO BACKFLIP · LAND ON YOUR WHEELS', W / 2, H * 0.83);
  }
  if (s.dead) {
    ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = HOT; ctx.shadowColor = HOT; ctx.shadowBlur = 25;
    ctx.font = '900 48px system-ui'; ctx.fillText('WIPED OUT', W / 2, H * 0.42);
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.font = '700 20px system-ui';
    ctx.fillText(s.why + ' · SCORE ' + score(), W / 2, H * 0.49);
    ctx.fillStyle = HOT; ctx.font = '600 18px system-ui'; ctx.fillText('TAP TO RETRY', W / 2, H * 0.58);
  }
}

// ---------- loop ----------
reset();
let last = performance.now();
function frame(t) {
  const dt = Math.min(0.05, Math.max(0, (t - last) / 1000)); last = t;
  extend(s.x + W * 2 + 1500);
  for (let i = 0; i < 4; i++) step(dt / 4);
  updateFx(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
