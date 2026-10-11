(() => {
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const saEl = document.getElementById('sa');
let W, H, SAT = 0;
function resize() {
  const d = devicePixelRatio || 1;
  W = innerWidth; H = innerHeight;
  cv.width = W * d; cv.height = H * d;
  ctx.setTransform(d, 0, 0, d, 0, 0);
  SAT = parseFloat(getComputedStyle(saEl).paddingTop) || 0;
}
addEventListener('resize', resize); resize();

const TAU = Math.PI * 2;
const RED = '#e01a2b', HOT = '#ff2a3d';
// physics
const G = 1500, ACC = 1150, MAXV = 1150, SPINA = 28, MAXW = 8.5;
const R = 7, HALF = 17, INV_I = 1 / 430, REST = 0.1, SUB = 8;
const hash = n => { n = Math.sin(n * 127.1) * 43758.5453; return n - Math.floor(n); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- audio ----------
let ac = null, eng = null, engG = null;
function initAudio() {
  if (!ac) {
    const A = window.AudioContext || window.webkitAudioContext;
    if (A) {
      ac = new A();
      eng = ac.createOscillator(); eng.type = 'sawtooth'; eng.frequency.value = 60;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      engG = ac.createGain(); engG.gain.value = 0;
      eng.connect(lp); lp.connect(engG); engG.connect(ac.destination); eng.start();
    }
  }
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
function engineSound() {
  if (!ac || !eng) return;
  const t = ac.currentTime, on = s.started && !s.dead;
  engG.gain.setTargetAtTime(on ? (holding ? 0.07 : 0.025) : 0, t, 0.05);
  eng.frequency.setTargetAtTime(45 + Math.hypot(s.vx, s.vy) * 0.14, t, 0.08);
}
document.addEventListener('visibilitychange', () => {
  if (!ac) return;
  if (document.hidden) ac.suspend(); else ac.resume();
});

// ---------- terrain ----------
const STEP = 8;
let hs = [], cy0 = 0, maxY = 0, coins = [];
const add = y => { hs.push(y); if (y !== null && y > maxY) maxY = y; };
const flat = (n, sl = 0) => { for (let i = 0; i < n; i++) { cy0 += sl * STEP; add(cy0); } };
const ease = (n, dy) => { const y0 = cy0; for (let i = 1; i <= n; i++) { cy0 = y0 + dy * (1 - Math.cos(Math.PI * i / n)) / 2; add(cy0); } };
const ramp = (n, h) => { const y0 = cy0; for (let i = 1; i <= n; i++) { const t = i / n; cy0 = y0 - h * t * t; add(cy0); } };
const gap = n => { for (let i = 0; i < n; i++) add(null); };
const rnd = (a, b) => Math.floor(a + Math.random() * (b - a));

function terrainReset() { hs = []; coins = []; cy0 = 0; maxY = 0; add(0); flat(110); }
function coinRow(x0, x1) {
  for (let x = x0; x < x1; x += 48) {
    const y = gY(x);
    if (y !== null) coins.push({ x, y: y - 30, got: false });
  }
}
function extend(toX) {
  while (hs.length * STEP < toX) {
    const dist = hs.length * STEP, r = Math.random();
    const dir = cy0 > 200 ? -1 : cy0 < -200 ? 1 : (Math.random() < 0.5 ? -1 : 1);
    const hard = Math.min(10, dist / 2500);
    if (r < 0.3) { ease(rnd(30, 55), dir * rnd(40, 120)); flat(rnd(5, 15)); }
    else if (r < 0.55) { const d = rnd(30, 80); ease(25, d); ease(25, -d); flat(rnd(4, 10)); }
    else if (r < 0.88 && dist > 2000) {
      flat(8); ramp(30, rnd(60, 110));
      const n = rnd(16, 26) + Math.floor(hard);
      const gx0 = hs.length * STEP, ty = cy0;
      gap(n);
      for (let k = 0; k < 5; k++) {
        coins.push({ x: gx0 + (k + .5) / 5 * n * STEP, y: ty - 40 - 60 * Math.sin(Math.PI * (k + .5) / 5), got: false });
      }
      cy0 += rnd(30, 80); add(cy0); ease(25, 40); flat(15);
      continue;
    } else { ease(20, dir * rnd(30, 90)); flat(rnd(15, 30)); }
    if (Math.random() < 0.5) coinRow(dist, hs.length * STEP);
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
let coinTotal = +localStorage.getItem('wr_coins') || 0;
// bike is ~45 units tall; showing ~540 units of height makes it about 1/12 of the screen
const ZOOM = () => clamp(Math.min(H / 540, W / 720), 0.3, 1.6);

function reset() {
  terrainReset(); extend(5000);
  P = []; shake = 0; msg = ''; msgT = 0;
  const VH = H / ZOOM();
  s = { x: 0, y: -R - 1, vx: 300, vy: 0, a: 0, w: 0, wa: 0,
        nc: 2, air: 0, rot: 0, combo: 0, bonus: 0, coins: 0, mile: 0,
        dead: false, started: false, deadAt: 0, why: '',
        camX: -200, camY: -VH * 0.62 };
}
const score = () => Math.floor(Math.max(0, s.x) / 40) + s.bonus;

function spark(x, y, vx, vy, c, n, life) {
  for (let i = 0; i < n; i++) P.push({
    x, y, vx: vx + (Math.random() - .5) * 220, vy: vy + (Math.random() - .5) * 220,
    l: life * (.6 + Math.random() * .6), m: life, c, z: 1.2 + Math.random() * 2 });
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
addEventListener('blur', release);
addEventListener('keydown', e => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); if (!e.repeat) press(); } });
addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'ArrowUp') release(); });

function crash(why) {
  if (s.dead) return;
  s.dead = true; s.deadAt = performance.now(); s.why = why; holding = false; shake = 24;
  spark(s.x, s.y - 20, 0, -150, HOT, 50, 1);
  spark(s.x, s.y - 20, 0, -150, '#ffffff', 16, .7);
  const sc = score();
  if (sc > best) { best = sc; localStorage.setItem('wr_best', best); }
  coinTotal += s.coins; localStorage.setItem('wr_coins', coinTotal);
  beep(160, 30, .45, 'sawtooth', .25);
  if (navigator.vibrate) navigator.vibrate([80, 40, 120]);
}

function step(dt) {
  if (!s.started || s.dead) return;

  s.vy += G * dt;
  if (s.nc === 0) {
    if (holding) s.w = Math.max(-MAXW, s.w - SPINA * dt);
    else s.w *= (1 - 1.2 * dt);
  }
  s.vx *= (1 - 0.04 * dt); s.vy *= (1 - 0.01 * dt);
  s.w *= (1 - 0.3 * dt);

  s.x += s.vx * dt; s.y += s.vy * dt; s.a += s.w * dt;
  if (s.nc === 0) { s.rot += s.w * dt; s.air += dt; }

  let nc = 0;
  const ca = Math.cos(s.a), sa = Math.sin(s.a);
  for (let i = 0; i < 2; i++) {
    const ox = i ? HALF : -HALF;
    const rx = ox * ca, ry = ox * sa;
    const px = s.x + rx, py = s.y + ry;
    const gy = gY(px);
    if (gy === null) continue;
    const pen = py + R - gy;
    if (pen <= 0) continue;
    nc++;
    const th = Math.atan(slopeAt(px));
    const nx = Math.sin(th), ny = -Math.cos(th), tx = Math.cos(th), ty = Math.sin(th);
    s.y -= pen * 0.85;
    const vpx = s.vx - s.w * ry, vpy = s.vy + s.w * rx;
    const vn = vpx * nx + vpy * ny;
    if (vn < 0) {
      const rn = rx * ny - ry * nx;
      const e = vn < -120 ? REST : 0;
      const j = -(1 + e) * vn / (1 + rn * rn * INV_I);
      s.vx += j * nx; s.vy += j * ny; s.w += rn * j * INV_I;
    }
    if (i === 0 && holding && Math.hypot(s.vx, s.vy) < MAXV) {
      s.vx += tx * ACC * dt; s.vy += ty * ACC * dt;
    }
    s.wa += (s.vx * tx + s.vy * ty) / R * dt;
  }

  // head / shoulder crash test
  const ca2 = Math.cos(s.a), sa2 = Math.sin(s.a);
  const pts = [[3, -39, 5], [0, -31, 4]];
  for (const [ox, oy, rad] of pts) {
    const hx = s.x + ox * ca2 - oy * sa2, hy = s.y + ox * sa2 + oy * ca2;
    const g = gY(hx);
    if (g !== null && hy + rad >= g) { crash(Math.abs(s.rot) > 1 || s.air > 0.2 ? 'BAD LANDING' : 'HEAD FIRST!'); return; }
  }
  if (s.y > maxY + 600) { crash('FELL INTO THE VOID'); return; }

  // landing
  if (nc > 0 && s.nc === 0) {
    if (s.air > 0.2) {
      spark(s.x, s.y + R, s.vx * .2, -120, HOT, 14, .4);
      beep(110, 40, .12, 'sine', .22);
      const f = Math.floor(Math.abs(s.rot) / TAU + 0.3);
      if (f > 0) {
        s.combo++;
        const p2 = f * 50 * s.combo;
        s.bonus += p2;
        msg = (f > 1 ? f + 'x FLIP' : 'FLIP') + (s.combo > 1 ? ' · COMBO x' + s.combo : '') + ' +' + p2;
        msgT = 1.4;
        beep(600 + f * 150, 1200 + f * 150, .25, 'triangle', .18);
        if (navigator.vibrate) navigator.vibrate(20);
      } else s.combo = 0;
    }
    s.air = 0; s.rot = 0;
  }
  if (nc > 0) s.rot = 0;
  s.nc = nc;

  for (const c of coins) {
    if (!c.got && Math.abs(c.x - s.x) < 30 && Math.abs(c.y - (s.y - 15)) < 36) {
      c.got = true; s.coins++;
      beep(900, 1500, .12, 'triangle', .12);
      spark(c.x, c.y, 0, -60, '#ffffff', 5, .35);
    }
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
  if (s.started && !s.dead) {
    if (holding && s.nc > 0 && Math.random() < 0.6) spark(s.x - 22, s.y + 2, -s.vx * .25, -30, HOT, 1, .35);
    const m = Math.floor(score() / 100);
    if (m > s.mile) { s.mile = m; msg = (m * 100) + ' !'; msgT = 1.2; beep(500, 1000, .3, 'square', .08); }
  }
  if (Math.random() < 0.02) coins = coins.filter(c => !c.got && c.x > s.x - 1500);
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
  const rays = 6, Rr = Math.min(300, W * 0.6);
  for (let k = 0; k < rays; k++) {
    const a = (k / (rays - 1)) * Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * Rr, Math.sin(a) * Rr); ctx.stroke();
  }
  for (let r = Rr / 5; r <= Rr; r += Rr / 5) {
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
function speedLines() {
  const sp = Math.hypot(s.vx, s.vy);
  if (!s.started || s.dead || sp < 600) return;
  const a = clamp((sp - 600) / 600, 0, 1) * 0.35;
  ctx.strokeStyle = 'rgba(255,255,255,' + a + ')'; ctx.lineWidth = 1.5;
  const t = performance.now() / 1000;
  for (let i = 0; i < 14; i++) {
    const y = hash(i * 3.1) * H;
    const x = ((hash(i * 9.7) * W * 2 - t * (900 + i * 60)) % (W + 200) + (W + 200)) % (W + 200) - 100;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 40 + sp * 0.04, y); ctx.stroke();
  }
}
function drawTerrain(cx, cy, VW, VH) {
  const i0 = Math.max(0, Math.floor(cx / STEP) - 1), i1 = Math.min(hs.length - 1, Math.ceil((cx + VW) / STEP) + 1);
  let run = [];
  const flush = () => {
    if (run.length >= 2) {
      ctx.beginPath(); ctx.moveTo(run[0][0], VH + 600);
      for (const p of run) ctx.lineTo(p[0], p[1]);
      ctx.lineTo(run[run.length - 1][0], VH + 600); ctx.closePath();
      ctx.fillStyle = '#0a0305'; ctx.shadowBlur = 0; ctx.fill();
      ctx.beginPath();
      run.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      ctx.strokeStyle = HOT; ctx.shadowColor = HOT; ctx.shadowBlur = 14; ctx.lineWidth = 3; ctx.stroke();
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
function drawCoins(cx, cy, VW) {
  const t = performance.now() / 300;
  ctx.fillStyle = '#fff'; ctx.shadowColor = HOT; ctx.shadowBlur = 10;
  for (const c of coins) {
    if (c.got || c.x < cx - 30 || c.x > cx + VW + 30) continue;
    const w = Math.abs(Math.cos(t + c.x * .01)) * 5 + 1.5;
    ctx.beginPath(); ctx.ellipse(c.x - cx, c.y - cy, w, 6, 0, 0, TAU); ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function drawRider(cx, cy) {
  ctx.save();
  ctx.translate(s.x - cx, s.y - cy);
  ctx.rotate(s.a);
  ctx.translate(0, R);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const red = s.dead ? '#777' : RED;
  ctx.shadowColor = red; ctx.shadowBlur = 8;

  for (const wx of [-17, 17]) {
    ctx.save(); ctx.translate(wx, -7); ctx.rotate(s.wa);
    ctx.fillStyle = '#0a0a0a'; ctx.strokeStyle = red; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 6.6, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(-5.5, 0); ctx.lineTo(5.5, 0); ctx.moveTo(0, -5.5); ctx.lineTo(0, 5.5); ctx.stroke();
    ctx.restore();
  }
  // skateboard deck with kicktails
  ctx.beginPath(); ctx.moveTo(-25, -15); ctx.lineTo(-20, -11); ctx.lineTo(20, -11); ctx.lineTo(25, -14);
  ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 4.5; ctx.stroke();
  ctx.strokeStyle = red; ctx.lineWidth = 1.6; ctx.stroke();
  // engine block, tank, exhaust
  ctx.fillStyle = '#161616'; ctx.strokeStyle = red; ctx.lineWidth = 1.4;
  ctx.fillRect(-9, -19, 12, 7); ctx.strokeRect(-9, -19, 12, 7);
  ctx.fillStyle = red; ctx.beginPath(); ctx.ellipse(4, -21, 6, 3, -0.15, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#999'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-9, -15); ctx.lineTo(-24, -12); ctx.stroke();
  // short raked fork + small bar
  ctx.strokeStyle = '#222'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(17, -7); ctx.lineTo(12, -22); ctx.stroke();
  ctx.strokeStyle = red; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(9, -24); ctx.lineTo(14, -24); ctx.stroke();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-15, -22); ctx.lineTo(-5, -23); ctx.stroke();

  // tiny crouched rider
  ctx.shadowBlur = 3;
  ctx.strokeStyle = red; ctx.lineWidth = 3.2;
  ctx.beginPath(); ctx.moveTo(-7, -24); ctx.lineTo(-2, -18); ctx.lineTo(3, -12); ctx.stroke();
  ctx.lineWidth = 4.2;
  ctx.beginPath(); ctx.moveTo(-7, -24); ctx.lineTo(0, -33); ctx.stroke();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(-8.5, -24); ctx.lineTo(-1.5, -32.5); ctx.stroke();
  ctx.strokeStyle = red; ctx.lineWidth = 2.3;
  ctx.beginPath(); ctx.moveTo(0, -32); ctx.lineTo(7, -29); ctx.lineTo(10, -25); ctx.stroke();
  ctx.fillStyle = red; ctx.beginPath(); ctx.arc(3, -39, 4.6, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(3, -43.6); ctx.lineTo(3, -34.4); ctx.moveTo(-1.6, -39); ctx.lineTo(7.6, -39); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.shadowBlur = 0;
  for (const ex of [1.6, 5.2]) { ctx.beginPath(); ctx.ellipse(ex, -39.5, 1.7, 1, ex < 3 ? 0.45 : -0.45, 0, TAU); ctx.fill(); }
  ctx.restore();
}

function draw() {
  const Z = ZOOM(), VW = W / Z, VH = H / Z;
  s.camX = s.x - VW * 0.28;
  s.camY += ((s.y - VH * 0.62) - s.camY) * 0.08;
  let sx = 0, sy = 0;
  if (shake > 0) { sx = (Math.random() - .5) * shake; sy = (Math.random() - .5) * shake; }
  const cx = s.camX + sx, cy = s.camY + sy;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#000000'); bg.addColorStop(0.6, '#1c0207'); bg.addColorStop(1, '#4a0510');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.shadowBlur = 0;
  web();
  ctx.fillStyle = 'rgba(255,40,60,0.18)'; ctx.beginPath(); ctx.arc(W * 0.78, H * 0.22, 70, 0, TAU); ctx.fill();
  skyline(cx, 0.15, H * 0.70 - s.camY * 0.05, 60, 200, '#12040a', false);
  skyline(cx, 0.35, H * 0.82 - s.camY * 0.10, 50, 180, '#0a0206', true);
  speedLines();

  ctx.save(); ctx.scale(Z, Z);
  drawTerrain(cx, cy, VW, VH);
  drawCoins(cx, cy, VW);
  for (const p of P) {
    ctx.globalAlpha = Math.max(0, p.l / p.m);
    ctx.fillStyle = p.c; ctx.shadowColor = p.c; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(p.x - cx, p.y - cy, p.z, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  drawRider(cx, cy);
  ctx.restore();

  // HUD (safe-area aware)
  const top = SAT + 8;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff'; ctx.shadowColor = HOT; ctx.shadowBlur = 14;
  ctx.font = '900 44px system-ui,sans-serif'; ctx.fillText(score(), W / 2, top + 44);
  ctx.shadowBlur = 0; ctx.font = '700 14px system-ui'; ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.fillText('BEST ' + best, W / 2, top + 64);
  ctx.textAlign = 'left'; ctx.font = '800 17px system-ui'; ctx.fillStyle = '#fff';
  ctx.fillText('● ' + (coinTotal + s.coins), 16 + 0, top + 24);
  ctx.textAlign = 'center';
  if (msgT > 0) {
    ctx.fillStyle = '#fff'; ctx.shadowColor = HOT; ctx.shadowBlur = 20;
    ctx.font = '900 28px system-ui'; ctx.fillText(msg, W / 2, H * 0.28); ctx.shadowBlur = 0;
  }
  if (!s.started) {
    ctx.fillStyle = '#fff'; ctx.shadowColor = HOT; ctx.shadowBlur = 20;
    ctx.font = '900 38px system-ui'; ctx.fillText('WEB RIDER', W / 2, H * 0.3); ctx.shadowBlur = 0;
    ctx.font = '700 20px system-ui'; ctx.fillText('TAP TO START · HOLD TO ACCELERATE', W / 2, H * 0.8);
    ctx.font = '500 14px system-ui'; ctx.fillStyle = 'rgba(255,255,255,.65)';
    ctx.fillText('HOLD IN THE AIR TO BACKFLIP · LAND ON YOUR WHEELS', W / 2, H * 0.86);
  }
  if (s.dead) {
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = HOT; ctx.shadowColor = HOT; ctx.shadowBlur = 25;
    ctx.font = '900 46px system-ui'; ctx.fillText('WIPED OUT', W / 2, H * 0.42);
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.font = '700 20px system-ui';
    ctx.fillText(s.why + ' · SCORE ' + score() + ' · BEST ' + best, W / 2, H * 0.49);
    ctx.fillStyle = HOT; ctx.font = '600 18px system-ui'; ctx.fillText('TAP TO RETRY', W / 2, H * 0.58);
  }
}

// ---------- loop ----------
reset();
let last = performance.now();
function frame(t) {
  const dt = Math.min(0.033, Math.max(0, (t - last) / 1000)); last = t;
  extend(s.x + 4000);
  for (let i = 0; i < SUB; i++) step(dt / SUB);
  updateFx(dt);
  engineSound();
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
