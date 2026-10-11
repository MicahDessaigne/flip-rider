(() => {
'use strict';
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const saEl = document.getElementById('sa');
let W = 800, H = 400, SAT = 0, SAL = 0;
function resize() {
  const d = devicePixelRatio || 1;
  W = innerWidth; H = innerHeight;
  cv.width = Math.round(W * d); cv.height = Math.round(H * d);
  ctx.setTransform(d, 0, 0, d, 0, 0);
  const cs = getComputedStyle(saEl);
  SAT = parseFloat(cs.paddingTop) || 0; SAL = parseFloat(cs.paddingLeft) || 0;
}
addEventListener('resize', resize); resize();

// ---------- tuning ----------
const TAU = Math.PI * 2, HOT = '#ff2a3d';
const G = 1500, ACC = 1700, SPINA = 34, MAXW = 9;
const R = 7, HALF = 17, INV_I = 1 / 430, REST = 0.1, SUB = 8, STEP = 8;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => Math.floor(a + Math.random() * (b - a));
const hash = n => { n = Math.sin(n * 127.1) * 43758.5453; return n - Math.floor(n); };
const fr = v => v - Math.floor(v);
const sm = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const tgt = x => 440 + Math.min(240, Math.max(0, x) / 70); // target ground speed

// ---------- save ----------
const SKINS = [
  { n: 'CLASSIC', p: 0, c: '#e01a2b' }, { n: 'VENOM', p: 150, c: '#dcdcf0' },
  { n: 'NEON', p: 300, c: '#00e5ff' }, { n: 'GOLD', p: 600, c: '#ffc400' }];
const SHIELD_PRICE = 50, MAGNET_PRICE = 120;
let SV = { coins: 0, best: 0, bestDist: 0, skin: 0, owned: [1, 0, 0, 0], shields: 0, magnet: 0, snd: 1 };
try { const j = JSON.parse(localStorage.getItem('wr3') || localStorage.getItem('wr2') || 'null'); if (j) Object.assign(SV, j); } catch (e) {}
const save = () => { try { localStorage.setItem('wr3', JSON.stringify(SV)); } catch (e) {} };

// ---------- audio ----------
let ac = null, eng = null, engG = null;
function initAudio() {
  if (!ac) {
    const A = window.AudioContext || window.webkitAudioContext;
    if (A) {
      ac = new A();
      eng = ac.createOscillator(); eng.type = 'sawtooth'; eng.frequency.value = 60;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
      engG = ac.createGain(); engG.gain.value = 0;
      eng.connect(lp); lp.connect(engG); engG.connect(ac.destination); eng.start();
    }
  }
  if (ac && ac.state === 'suspended') ac.resume();
}
function beep(f0, f1, dur, type = 'sine', vol = 0.15) {
  if (!ac || !SV.snd) return;
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
  const t = ac.currentTime, on = mode === 'play' && SV.snd;
  engG.gain.setTargetAtTime(on ? (holding ? 0.055 : 0.02) : 0, t, 0.05);
  eng.frequency.setTargetAtTime(48 + Math.hypot(s.vx, s.vy) * 0.16, t, 0.08);
}
const BASS = [55, 55, 82.4, 55, 65.4, 65.4, 98, 73.4];
let nextN = 0, ni = 0;
function music() {
  if (!ac || !SV.snd || ac.state !== 'running') return;
  const t = ac.currentTime;
  if (nextN < t) nextN = t + 0.05;
  while (nextN < t + 0.25) {
    const f = BASS[ni % 8] * (Math.floor(ni / 16) % 2 ? 1.335 : 1);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle'; o.frequency.value = f * 2;
    g.gain.setValueAtTime(0.035, nextN); g.gain.exponentialRampToValueAtTime(0.001, nextN + 0.2);
    o.connect(g); g.connect(ac.destination); o.start(nextN); o.stop(nextN + 0.22);
    nextN += 0.24; ni++;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) holding = false;
  if (!ac) return;
  if (document.hidden) ac.suspend(); else ac.resume();
});

// ---------- terrain ----------
let hs = [], cy0 = 0, maxY = 0, coins = [], haz = [], loops = [], pits = [], pads = [], lastK = '';
const X = () => hs.length * STEP;
function add(y) { hs.push(y); if (y !== null && y > maxY) maxY = y; }
function flat(n) { for (let i = 0; i < n; i++) add(cy0); }
function ease(n, dy) {
  const y0 = cy0;
  for (let i = 1; i <= n; i++) { cy0 = y0 + dy * (1 - Math.cos(Math.PI * i / n)) / 2; add(cy0); }
}
function hill(dy, k) { ease(Math.max(16, Math.ceil(Math.abs(dy) * k / STEP)), dy); }
function ramp(n, h) { const y0 = cy0; for (let i = 1; i <= n; i++) { const t = i / n; cy0 = y0 - h * t * t; add(cy0); } }
function gap(n) { for (let i = 0; i < n; i++) add(null); }

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
function coinsAlong(x0, x1, p) {
  if (Math.random() > p) return;
  for (let x = x0; x < x1; x += 46) {
    const y = gY(x);
    if (y !== null) coins.push({ x, y: y - 26, got: false });
  }
}

function mkLoop(x0, y0, Rl) {
  const d = Rl * 1.2, k = d / TAU, N = 90, pts = [], cum = [0];
  let pa = 0;
  for (let i = 0; i <= N; i++) {
    const t = TAU * i / N;
    const x = x0 + Rl * Math.sin(t) + k * t, y = y0 - Rl * (1 - Math.cos(t));
    let a = Math.atan2(-Rl * Math.sin(t), Rl * Math.cos(t) + k);
    while (a - pa > Math.PI) a -= TAU;
    while (pa - a > Math.PI) a += TAU;
    pa = a;
    pts.push({ x, y, a });
    if (i) cum.push(cum[i - 1] + Math.hypot(x - pts[i - 1].x, y - pts[i - 1].y));
  }
  return { x0, y0, R: Rl, d, pts, cum, len: cum[N], done: false, vmin: 430 };
}
function posAt(L, sp) {
  const c = L.cum; let lo = 0, hi = c.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= sp) lo = m; else hi = m; }
  const p = L.pts[lo], q = L.pts[hi], dl = (c[hi] - c[lo]) || 1, f = clamp((sp - c[lo]) / dl, 0, 1);
  return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, a: p.a + (q.a - p.a) * f, w: (q.a - p.a) / dl };
}

function loopPiece() {
  flat(26);
  const Rl = rnd(52, 105), x0 = X() - STEP, y0 = cy0, L = mkLoop(x0, y0, Rl);
  loops.push(L);
  for (let i = 6; i < L.pts.length - 4; i += 7) {
    const p = L.pts[i];
    coins.push({ x: p.x + Math.sin(p.a) * 22, y: p.y - Math.cos(p.a) * 22, got: false });
  }
  flat(Math.ceil(L.d / STEP) + 1);
  flat(28);
}
function jumpPiece(d, big) {
  const vt = tgt(d);
  flat(22);
  const h = rnd(60, big ? 135 : 100), m0 = 0.75 + Math.random() * 0.2;
  const n = Math.ceil(2 * h / (m0 * STEP));
  ramp(n, h);
  const m = 2 * h / (n * STEP), v = vt * 0.8, vx = v / Math.sqrt(1 + m * m);
  const gl = clamp(2 * m * vx * vx / G * 0.75, 70, 360), gn = Math.round(gl / STEP);
  const ty = cy0, xl = X() - STEP, drop = rnd(30, 90);
  gap(gn);
  const xe = X();
  pits.push({ x0: xl, x1: xe, y: ty + drop + 170 });
  for (let q = 0; q < 5; q++) coins.push({ x: xl + (q + 0.5) / 5 * (xe - xl), y: ty - 40 - 50 * Math.sin(Math.PI * (q + 0.5) / 5), got: false });
  cy0 = ty + drop; add(cy0);
  ease(30, rnd(20, 60)); flat(30);
}
function hazPiece(t) {
  flat(34);
  const x = X() + 40, gy = cy0;
  flat(14);
  haz.push({ t, x, gy, w: 44, per: t === 'crush' ? 2.6 : t === 'laser' ? 2.2 : t === 'sawg' ? 2.0 : 2.6, ph: Math.random(), ad: false, cc: false });
  flat(26);
}
function extend(toX) {
  while (X() < toX) {
    const d = X(), hard = Math.min(1, d / 30000), x0 = X();
    const dir = cy0 > 300 ? -1 : cy0 < -300 ? 1 : (Math.random() < 0.5 ? -1 : 1);
    const o = ['roll', 'roll', 'steep'];
    if (d > 1000) o.push('jump', 'jump');
    if (d > 2500) o.push('loop');
    if (d > 3500) o.push('boost', 'crush');
    if (d > 4500) o.push('cliff', 'pend', 'laser');
    if (d > 6000) o.push('sawg', 'double', 'loop', 'mega');
    let k, tries = 0;
    do { k = o[(Math.random() * o.length) | 0]; tries++; } while (k === lastK && tries < 4);
    lastK = k;
    let cw = 0;
    if (k === 'roll') { hill(dir * rnd(40, 140), 3); flat(rnd(6, 14)); cw = 0.55; }
    else if (k === 'steep') { flat(10); hill(dir * rnd(170, 320), dir < 0 ? 1.7 : 1.2); flat(14); hill(-dir * rnd(40, 110), 3); flat(8); cw = 0.5; }
    else if (k === 'jump') jumpPiece(d, false);
    else if (k === 'double') { jumpPiece(d, false); jumpPiece(d, true); }
    else if (k === 'mega') jumpPiece(d, true);
    else if (k === 'loop') { loopPiece(); if (hard > 0.3 && Math.random() < 0.5) loopPiece(); }
    else if (k === 'boost') { flat(18); pads.push({ x: X(), gy: cy0, used: false }); flat(8); flat(40); cw = 0.8; }
    else if (k === 'cliff') { flat(24); hill(rnd(30, 60), 3); hill(rnd(240, 380), 1.15); hill(-rnd(40, 100), 3); flat(24); }
    else { hazPiece(k); if (hard > 0.4 && Math.random() < 0.4) hazPiece(['crush', 'laser', 'sawg', 'pend'][rnd(0, 4)]); cw = 0.5; }
    if (cw) coinsAlong(x0, X(), cw);
  }
}
function terrainReset() {
  hs = []; cy0 = 0; maxY = 0; coins = []; haz = []; loops = []; pits = []; pads = []; lastK = '';
  add(0); flat(90);
}

// ---------- state ----------
let mode = 'menu', s, holding = false, shake = 0, msg = '', msgT = 0, P = [], T = 0, btns = [], hintT = 0;
const ZOOM = () => clamp(Math.min(H / 450, W / 720), 0.35, 1.6);

function reset() {
  terrainReset(); extend(5000);
  P = []; shake = 0; msg = ''; msgT = 0; holding = false; hintT = 0;
  s = { x: 0, y: -R - 0.5, vx: 0, vy: 0, a: 0, w: 0, wa: 0, nc: 2, air: 0, rot: 0, maxX: 0,
        bonus: 0, coins: 0, mult: 1, mt: 0, invul: 0, rail: null, safeH: [], safeT: 0, stuck: 0,
        dead: false, deadAt: 0, why: '', tricks: 0, flips: 0, loops: 0, mile: 0, newBest: false,
        camX: -150, camY: -300 };
}
const dist = () => Math.max(0, Math.floor(s.maxX / 50));
const total = () => dist() * 10 + s.bonus;
const rankOf = t => t >= 15000 ? 'S' : t >= 8000 ? 'A' : t >= 4000 ? 'B' : t >= 1500 ? 'C' : 'D';
const starsOf = t => (t >= 1500) + (t >= 4000) + (t >= 8000);

function award(base, label) {
  const p = base * s.mult;
  s.bonus += p; s.mt = 8; s.tricks++;
  msg = label + (s.mult > 1 ? '  x' + s.mult : '') + '   +' + p; msgT = 1.5;
  if (s.mult < 5) s.mult++;
}
function spark(x, y, vx, vy, c, n, life) {
  for (let i = 0; i < n; i++) P.push({
    x, y, vx: vx + (Math.random() - .5) * 220, vy: vy + (Math.random() - .5) * 220,
    l: life * (.6 + Math.random() * .6), m: life, c, z: 1.2 + Math.random() * 2 });
}
function startRun() { reset(); mode = 'play'; s.vx = 260; hintT = 6; }

cv.addEventListener('pointerdown', e => {
  e.preventDefault(); initAudio();
  if (mode === 'play') { holding = true; return; }
  if (mode === 'dead' && performance.now() - s.deadAt < 600) return;
  const x = e.clientX, y = e.clientY;
  for (const b of btns) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.fn(); return; }
});
addEventListener('pointerup', () => { holding = false; });
addEventListener('pointercancel', () => { holding = false; });
addEventListener('blur', () => { holding = false; });
addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault(); if (e.repeat) return; initAudio();
    if (mode === 'play') holding = true;
    else if (mode === 'menu') startRun();
    else if (mode === 'dead' && performance.now() - s.deadAt > 600) startRun();
  }
});
addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'ArrowUp') holding = false; });

function respawn() {
  const p = s.safeH.length ? s.safeH[0] : { x: 0, y: -R - 0.5 };
  s.x = p.x; s.y = p.y - 3; s.vx = 400; s.vy = 0; s.a = 0; s.w = 0;
  s.nc = 2; s.air = 0; s.rot = 0; s.rail = null; s.invul = 1.8; s.safeH = [];
  for (const L of loops) if (L.x0 > p.x - 10) L.done = false;
  for (const q of pads) if (q.x > p.x) q.used = false;
}
function crash(why) {
  if (s.dead || s.invul > 0) return;
  if (SV.shields > 0) {
    SV.shields--; save();
    spark(s.x, s.y, 0, -100, '#9ff', 30, .8);
    msg = 'SHIELD USED'; msgT = 1.6; shake = 10; beep(300, 900, .3, 'triangle', .2);
    respawn(); return;
  }
  s.dead = true; s.deadAt = performance.now(); s.why = why; holding = false; shake = 22; mode = 'dead';
  spark(s.x, s.y - 10, 0, -150, HOT, 50, 1);
  spark(s.x, s.y - 10, 0, -150, '#ffffff', 16, .7);
  const t = total();
  s.newBest = t > SV.best;
  if (s.newBest) SV.best = t;
  if (dist() > SV.bestDist) SV.bestDist = dist();
  SV.coins += s.coins; save();
  beep(160, 30, .45, 'sawtooth', .25);
  if (navigator.vibrate) navigator.vibrate([80, 40, 120]);
}

// bike collision points (local): x, y, radius
const BIKE_PTS = [[-HALF, 0, R], [HALF, 0, R], [-21, -8, 2.5], [21, -8, 2.5], [-3, -10, 3], [6.2, -16.2, 4.2], [1.5, -13.5, 3.5]];
const HEAD = [[6.2, -16.2, 4.2], [1.5, -13.5, 3.5]];

function hdist(h, x, y) {
  if (h.x1 !== undefined) {
    const dx = Math.max(h.x1 - x, 0, x - h.x2), dy = Math.max(h.y1 - y, 0, y - h.y2);
    return Math.hypot(dx, dy);
  }
  return Math.hypot(x - h.cx, y - h.cy) - h.r;
}
function updateHaz() {
  for (const h of haz) {
    if (Math.abs(h.x - s.x) > 1400) continue;
    if (!h.ad && h.x > s.x && h.x - s.x < 700) {
      h.ad = true;
      const hard = Math.min(1, Math.max(0, s.x) / 30000);
      if (Math.random() >= 0.2 * hard) {
        const ta = (h.x - s.x) / Math.max(300, s.vx), j = Math.random() - 0.5;
        let ut;
        if (h.t === 'crush') ut = 0.3 + j * (0.25 + 0.25 * hard);
        else if (h.t === 'laser') ut = 0.18 + j * 0.3;
        else if (h.t === 'sawg') ut = j * 0.3;
        else ut = (Math.random() < 0.5 ? 0.25 : 0.75) + j * 0.2;
        h.ph = fr(ut - (T + ta) / h.per);
      }
    }
    const u = fr(T / h.per + h.ph); h.u = u;
    if (h.t === 'crush') {
      const open = u < .62 ? 1 : u < .76 ? 1 - sm((u - .62) / .14) : u < .88 ? 0 : sm((u - .88) / .12);
      const y2 = h.gy - 4 - open * 135;
      h.x1 = h.x - h.w / 2; h.x2 = h.x + h.w / 2; h.y2 = y2; h.y1 = y2 - 46;
      h.warn = u > .5 && u < .9; h.dang = open < .5;
    } else if (h.t === 'laser') {
      h.on = u > .5 && u < .8; h.warn = u > .4 && u <= .5; h.dang = h.on;
      h.x1 = h.x - 3; h.x2 = h.x + 3; h.y1 = h.gy - 150; h.y2 = h.gy;
    } else if (h.t === 'sawg') {
      h.cx = h.x; h.cy = h.gy - 70 - 62 * Math.cos(TAU * u); h.r = 14; h.dang = true;
    } else {
      const ang = Math.sin(TAU * u); h.ang = ang;
      h.cx = h.x + 175 * Math.sin(ang); h.cy = h.gy - 200 + 175 * Math.cos(ang); h.r = 13; h.dang = true;
    }
  }
}

function pickCoins() {
  const mR = SV.magnet ? 95 : 28;
  for (const c of coins) {
    if (!c.got && Math.abs(c.x - s.x) < mR && Math.abs(c.y - s.y) < mR + 4) {
      c.got = true; s.coins++; s.bonus += 10;
      beep(900, 1500, .12, 'triangle', .12);
      spark(c.x, c.y, 0, -60, '#ffffff', 5, .35);
    }
  }
}

function railStep(dt) {
  const r = s.rail, L = r.L;
  if (holding) r.v = Math.min(760, r.v + 420 * dt); else r.v = Math.max(L.vmin, r.v * (1 - .03 * dt));
  r.sp += r.v * dt;
  if (r.sp >= L.len) {
    s.rail = null; L.done = true;
    s.a = 0; s.w = 0; s.x = L.x0 + L.d; s.y = L.y0 - R - 0.5; s.vx = r.v; s.vy = 0;
    s.nc = 2; s.air = 0; s.rot = 0; s.loops++;
    award(250 + Math.round(L.R * 3), 'LOOP');
    beep(500, 1300, .3, 'triangle', .15); if (navigator.vibrate) navigator.vibrate(30);
    return;
  }
  const q = posAt(L, r.sp);
  s.x = q.x + Math.sin(q.a) * R; s.y = q.y - Math.cos(q.a) * R; s.a = q.a; s.w = q.w * r.v;
  s.vx = r.v * Math.cos(q.a); s.vy = r.v * Math.sin(q.a);
  s.wa += r.v / R * dt;
  if (s.x > s.maxX) s.maxX = s.x;
  pickCoins();
}

function step(dt) {
  if (mode !== 'play') return;
  if (s.rail) { railStep(dt); return; }
  s.vy += G * dt;
  if (s.nc === 0) {
    if (holding) s.w = Math.max(-MAXW, s.w - SPINA * dt);
    else s.w *= Math.max(0, 1 - 7 * dt);
  }
  s.vx *= 1 - .03 * dt; s.vy *= 1 - .008 * dt; s.w *= 1 - .3 * dt;
  s.x += s.vx * dt; s.y += s.vy * dt; s.a += s.w * dt;
  if (s.nc === 0) { s.rot += s.w * dt; s.air += dt; }
  if (s.x > s.maxX) s.maxX = s.x;

  let nc = 0;
  const ca = Math.cos(s.a), sa = Math.sin(s.a);
  for (let i = 0; i < 2; i++) {
    const ox = i ? HALF : -HALF, rx = ox * ca, ry = ox * sa, wx = s.x + rx, gy = gY(wx);
    if (gy === null) continue;
    const pen = s.y + ry + R - gy;
    if (pen <= 0) continue;
    nc++;
    const th = Math.atan(slopeAt(wx)), nx = Math.sin(th), ny = -Math.cos(th);
    const pc = Math.min(pen, 16) * Math.cos(th) * .85;
    s.x += nx * pc; s.y += ny * pc;
    const vpx = s.vx - s.w * ry, vpy = s.vy + s.w * rx, vn = vpx * nx + vpy * ny;
    if (vn < 0) {
      const rn = rx * ny - ry * nx, e = vn < -120 ? REST : 0, j = -(1 + e) * vn / (1 + rn * rn * INV_I);
      s.vx += j * nx; s.vy += j * ny; s.w += rn * j * INV_I;
    }
  }

  if (nc > 0) {
    const th = Math.atan(slopeAt(s.x)), tx = Math.cos(th), ty = Math.sin(th);
    let tv = s.vx * tx + s.vy * ty; const tg = tgt(s.x);
    if (holding && tv < tg) { const a = Math.min(ACC * dt, tg - tv); s.vx += tx * a; s.vy += ty * a; tv += a; }
    else if (tv > tg * 1.12) { const a = Math.min(260 * dt, tv - tg * 1.12); s.vx -= tx * a; s.vy -= ty * a; tv -= a; }
    if (holding && tv < 70) { s.stuck += dt; if (s.stuck > .5) { s.vx += tx * 170; s.vy += ty * 170; s.stuck = 0; } } else s.stuck = 0;
    s.wa += tv / R * dt;
    for (const p of pads) {
      if (!p.used && s.x > p.x && s.x < p.x + 64) {
        p.used = true; s.vx += tx * 140; s.vy += ty * 140;
        msg = 'BOOST!'; msgT = .9; spark(s.x - 10, s.y + R, -200, -40, '#ffd84a', 16, .5); beep(300, 900, .25, 'sawtooth', .12);
      }
    }
    for (const L of loops) {
      if (!L.done && s.x >= L.x0 && s.x < L.x0 + 30 && s.vx > 0 && Math.abs(s.y + R - gY(s.x)) < 14) {
        s.rail = { L, sp: 0, v: Math.max(L.vmin, Math.hypot(s.vx, s.vy)) };
        s.nc = 2; return;
      }
    }
  }

  // head / shoulder crash
  const ca2 = Math.cos(s.a), sa2 = Math.sin(s.a);
  for (const p of HEAD) {
    const hx = s.x + p[0] * ca2 - p[1] * sa2, hy = s.y + p[0] * sa2 + p[1] * ca2, g = gY(hx);
    if (g !== null && hy + p[2] >= g + 1) { crash(Math.abs(s.rot) > 1 || s.air > .2 ? 'BAD LANDING' : 'HEAD FIRST'); if (s.dead) return; break; }
  }
  if (s.y > maxY + 450) { crash('FELL INTO THE VOID'); if (s.dead) return; }
  for (const p of pits) if (s.x > p.x0 && s.x < p.x1 && s.y + R > p.y - 14) { crash('IMPALED'); if (s.dead) return; break; }

  // hazards
  for (const h of haz) {
    if (Math.abs(h.x - s.x) > 220 || h.u === undefined) continue;
    if (h.t === 'laser' && !h.on && !h.dang) { /* off: safe */ }
    let mn = 1e9;
    for (const p of BIKE_PTS) {
      const wx = s.x + p[0] * ca2 - p[1] * sa2, wy = s.y + p[0] * sa2 + p[1] * ca2;
      const dd = hdist(h, wx, wy) - p[2];
      if (dd < mn) mn = dd;
    }
    const lethal = h.t === 'laser' ? h.on : true;
    if (lethal && mn < 0) { crash(h.t === 'crush' ? 'CRUSHED' : h.t === 'laser' ? 'FRIED' : h.t === 'sawg' ? 'SAWED' : 'SMASHED'); if (s.dead) return; }
    else if (!h.cc && h.dang && mn < 14) { h.cc = true; award(75, 'CLOSE CALL'); }
  }

  // landing
  if (nc > 0 && s.nc === 0) {
    if (s.air > .2) {
      spark(s.x, s.y + R, s.vx * .2, -120, HOT, 14, .4);
      beep(110, 40, .12, 'sine', .22);
      const f = Math.floor(Math.abs(s.rot) / TAU + .3), tilt = Math.abs(Math.atan2(Math.sin(s.a), Math.cos(s.a)));
      if (f > 0) {
        const perfect = tilt < .3;
        s.flips += f;
        award(100 * f + (perfect ? 50 : 0), (f > 1 ? f + 'x FLIP' : 'FLIP') + (perfect ? ' · PERFECT' : ''));
        beep(600 + f * 150, 1200 + f * 150, .25, 'triangle', .18); if (navigator.vibrate) navigator.vibrate(20);
      } else if (s.air > 1) award(Math.round(s.air * 60), 'BIG AIR');
    }
    s.air = 0; s.rot = 0;
  }
  if (nc > 0) s.rot = 0;
  if (nc === 2) s.a = Math.atan2(Math.sin(s.a), Math.cos(s.a));
  s.nc = nc;

  if (nc === 2 && Math.abs(s.a) < .35) {
    s.safeT += dt;
    if (s.safeT > .35) { s.safeT = 0; s.safeH.push({ x: s.x, y: s.y }); if (s.safeH.length > 6) s.safeH.shift(); }
  }
  pickCoins();
}

function updateFx(dt) {
  T += dt;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    p.l -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt;
    if (p.l <= 0) P.splice(i, 1);
  }
  if (shake > 0) shake = Math.max(0, shake - dt * 40);
  if (msgT > 0) msgT -= dt;
  if (hintT > 0) hintT -= dt;
  if (s.invul > 0) s.invul -= dt;
  if (mode === 'play') {
    if (s.mt > 0) { s.mt -= dt; if (s.mt <= 0) { s.mult = 1; s.mt = 0; } }
    if (holding && s.nc > 0 && !s.rail && Math.random() < .5) spark(s.x - 22, s.y + 2, -s.vx * .25, -30, HOT, 1, .35);
    if (s.nc > 0 && !s.rail && Math.hypot(s.vx, s.vy) > 250 && Math.random() < .3) spark(s.x - HALF, s.y + R, -s.vx * .1, -25, '#7a3a42', 1, .4);
    const m = Math.floor(dist() / 250);
    if (m > s.mile) { s.mile = m; s.bonus += 500; msg = (m * 250) + ' m   +500'; msgT = 1.5; beep(500, 1000, .3, 'square', .08); }
  }
  if (haz.length > 40) haz = haz.filter(h => h.x > s.x - 1500);
  if (pits.length > 30) pits = pits.filter(p => p.x1 > s.x - 1500);
  if (pads.length > 30) pads = pads.filter(p => p.x > s.x - 1500);
  if (loops.length > 20) loops = loops.filter(L => L.x0 + L.d > s.x - 1500);
  if (Math.random() < .02) coins = coins.filter(c => !c.got && c.x > s.x - 1500);
}

// ---------- drawing ----------
function skyline(camX, par, baseY, hmin, hmax, fill, windows, strands) {
  const bw = 70, off = camX * par, i0 = Math.floor(off / bw);
  if (strands) { ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1; }
  for (let i = i0; i * bw - off < W + bw; i++) {
    const h = hmin + hash(i + par * 100) * (hmax - hmin), x = i * bw - off;
    ctx.fillStyle = fill; ctx.fillRect(x, baseY - h, bw - 6, h + H);
    if (strands) {
      const h2 = hmin + hash(i + 2 + par * 100) * (hmax - hmin);
      ctx.beginPath(); ctx.moveTo(x + 30, baseY - h);
      ctx.quadraticCurveTo(x + 30 + bw, Math.max(baseY - h, baseY - h2) + 34, x + 30 + bw * 2, baseY - h2); ctx.stroke();
    }
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
  if (mode !== 'play' || sp < 480) return;
  ctx.strokeStyle = 'rgba(255,255,255,' + clamp((sp - 480) / 400, 0, 1) * 0.3 + ')'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 12; i++) {
    const y = hash(i * 3.1) * H;
    const x = ((hash(i * 9.7) * W * 2 - T * (900 + i * 60)) % (W + 200) + (W + 200)) % (W + 200) - 100;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 40 + sp * 0.04, y); ctx.stroke();
  }
}
function drawTerrain(cx, cy, VW, VH) {
  const i0 = Math.max(0, Math.floor(cx / STEP) - 1), i1 = Math.min(hs.length - 1, Math.ceil((cx + VW) / STEP) + 1);
  const bot = cy + VH + 400;
  let run = [];
  const flush = () => {
    if (run.length >= 2) {
      const f = run[0], l = run[run.length - 1];
      ctx.beginPath(); ctx.moveTo(f[0], bot);
      for (const p of run) ctx.lineTo(p[0], p[1]);
      ctx.lineTo(l[0], bot); ctx.closePath();
      ctx.fillStyle = '#0b0306'; ctx.shadowBlur = 0; ctx.fill();
      ctx.lineWidth = 2;
      for (const [off, al] of [[16, .22], [38, .12], [70, .07]]) {
        ctx.strokeStyle = 'rgba(224,26,43,' + al + ')'; ctx.beginPath();
        run.forEach((p, k) => k ? ctx.lineTo(p[0], p[1] + off) : ctx.moveTo(p[0], p[1] + off)); ctx.stroke();
      }
      ctx.beginPath(); run.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      ctx.strokeStyle = HOT; ctx.shadowColor = HOT; ctx.shadowBlur = 16; ctx.lineWidth = 4; ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = '#ffc0c6'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    run = [];
  };
  if (i0 === 0) run.push([cx - 1500, hs[0]]);
  for (let i = i0; i <= i1; i++) {
    const h = hs[i];
    if (h === null) flush(); else run.push([i * STEP, h]);
  }
  flush();
}
function drawPits(cx, VW) {
  for (const p of pits) {
    if (p.x1 < cx - 50 || p.x0 > cx + VW + 50) continue;
    ctx.fillStyle = '#0b0306'; ctx.fillRect(p.x0, p.y + 14, p.x1 - p.x0, 700);
    ctx.fillStyle = '#d8dbe6'; ctx.shadowColor = HOT; ctx.shadowBlur = 8; ctx.beginPath();
    for (let x = p.x0 + 4; x < p.x1 - 8; x += 14) { ctx.moveTo(x, p.y + 14); ctx.lineTo(x + 7, p.y - 18); ctx.lineTo(x + 14, p.y + 14); }
    ctx.fill(); ctx.shadowBlur = 0;
  }
}
function drawLoops(cx, VW) {
  for (const L of loops) {
    if (L.x0 + L.d < cx - 200 || L.x0 > cx + VW + 200) continue;
    // entry chevrons
    ctx.strokeStyle = 'rgba(255,60,70,.7)'; ctx.lineWidth = 3;
    for (let k = 0; k < 3; k++) { const x = L.x0 - 90 + k * 24, y = L.y0 - 2; ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + 10, y - 7); ctx.lineTo(x, y); ctx.stroke(); }
    const path = () => { ctx.beginPath(); L.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); };
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    path(); ctx.strokeStyle = '#12040a'; ctx.lineWidth = 15; ctx.shadowBlur = 0; ctx.stroke();
    path(); ctx.strokeStyle = HOT; ctx.shadowColor = HOT; ctx.shadowBlur = 16; ctx.lineWidth = 4; ctx.stroke();
    path(); ctx.shadowBlur = 0; ctx.strokeStyle = '#ffc0c6'; ctx.lineWidth = 1.2; ctx.stroke();
  }
}
function drawPads(cx, VW) {
  for (const p of pads) {
    if (p.x < cx - 100 || p.x > cx + VW + 100) continue;
    ctx.fillStyle = p.used ? '#553' : '#ffd84a'; ctx.shadowColor = '#ffd84a'; ctx.shadowBlur = p.used ? 0 : 14;
    ctx.fillRect(p.x, p.gy - 3, 64, 3);
    ctx.strokeStyle = p.used ? '#664' : '#fff'; ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      const x = p.x + 10 + k * 18 + ((T * 30) % 8); ctx.beginPath(); ctx.moveTo(x, p.gy - 14); ctx.lineTo(x + 8, p.gy - 8); ctx.lineTo(x, p.gy - 3); ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
}
function drawMarks(cx, VW) {
  for (let k = Math.max(1, Math.floor(cx / 5000)); k * 5000 < cx + VW; k++) {
    const x = k * 5000, y = gY(x); if (y === null) continue;
    ctx.fillStyle = '#444'; ctx.fillRect(x - 1.5, y - 56, 3, 56);
    ctx.fillStyle = HOT; ctx.fillRect(x - 24, y - 62, 48, 18);
    ctx.fillStyle = '#fff'; ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(k * 100 + ' m', x, y - 49);
  }
}
function drawHaz(cx, VW) {
  for (const h of haz) {
    if (h.x < cx - 250 || h.x > cx + VW + 250 || h.u === undefined) continue;
    ctx.save(); ctx.lineJoin = 'round';
    const lamp = (x, y, on) => { ctx.fillStyle = on ? '#ff2a3d' : '#40121a'; ctx.shadowColor = '#ff2a3d'; ctx.shadowBlur = on ? 14 : 0; ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; };
    if (h.t === 'crush') {
      ctx.fillStyle = '#3a3a46'; ctx.fillRect(h.x - 5, h.gy - 700, 10, h.y1 - (h.gy - 700));
      ctx.fillStyle = '#1c1c26'; ctx.strokeStyle = h.warn && Math.floor(T * 12) % 2 ? '#fff' : HOT; ctx.lineWidth = 2.5; ctx.shadowColor = HOT; ctx.shadowBlur = 10;
      ctx.fillRect(h.x1, h.y1, h.w, 46); ctx.strokeRect(h.x1, h.y1, h.w, 46);
      ctx.fillStyle = '#d8dbe6'; ctx.beginPath();
      for (let k = 0; k < 5; k++) { const x = h.x1 + k * h.w / 5; ctx.moveTo(x, h.y2 - 12); ctx.lineTo(x + h.w / 10, h.y2 + 2); ctx.lineTo(x + h.w / 5, h.y2 - 12); }
      ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#2a2a34'; ctx.fillRect(h.x - 46, h.gy - 16, 8, 16); ctx.fillRect(h.x + 38, h.gy - 16, 8, 16);
      const on = h.warn && Math.floor(T * 10) % 2 === 0; lamp(h.x - 42, h.gy - 22, on); lamp(h.x + 42, h.gy - 22, on);
    } else if (h.t === 'laser') {
      ctx.fillStyle = '#2a2a34'; ctx.fillRect(h.x - 8, h.gy - 160, 16, 10); ctx.fillRect(h.x - 8, h.gy - 2, 16, 8);
      if (h.on) {
        ctx.strokeStyle = '#fff'; ctx.shadowColor = HOT; ctx.shadowBlur = 20; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(h.x, h.gy - 150); ctx.lineTo(h.x, h.gy); ctx.stroke();
        ctx.strokeStyle = HOT; ctx.lineWidth = 9; ctx.globalAlpha = .4; ctx.stroke();
      } else if (h.warn && Math.floor(T * 14) % 2) {
        ctx.strokeStyle = 'rgba(255,42,61,.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.moveTo(h.x, h.gy - 150); ctx.lineTo(h.x, h.gy); ctx.stroke();
      }
    } else if (h.t === 'sawg') {
      ctx.strokeStyle = '#3a3a46'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(h.x, h.gy - 150); ctx.lineTo(h.x, h.gy); ctx.stroke();
      ctx.translate(h.cx, h.cy); ctx.rotate(T * 10);
      ctx.fillStyle = '#cfd2da'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 8; ctx.beginPath();
      for (let k = 0; k < 20; k++) { const a = k * TAU / 20, r = k % 2 ? 11 : 16; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.fillStyle = HOT; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
    } else {
      ctx.strokeStyle = '#3a3a46'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(h.x - 170, h.gy); ctx.lineTo(h.x - 170, h.gy - 206); ctx.lineTo(h.x + 170, h.gy - 206); ctx.lineTo(h.x + 170, h.gy); ctx.stroke();
      ctx.strokeStyle = '#8a8a96'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(h.x, h.gy - 200); ctx.lineTo(h.cx, h.cy); ctx.stroke();
      ctx.fillStyle = '#16161c'; ctx.strokeStyle = HOT; ctx.lineWidth = 2.5; ctx.shadowColor = HOT; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(h.cx, h.cy, 13, 0, TAU); ctx.fill(); ctx.stroke();
      for (let k = 0; k < 8; k++) { const a = k * TAU / 8 + h.ang; ctx.beginPath(); ctx.moveTo(h.cx + Math.cos(a) * 13, h.cy + Math.sin(a) * 13); ctx.lineTo(h.cx + Math.cos(a) * 20, h.cy + Math.sin(a) * 20); ctx.stroke(); }
    }
    ctx.restore();
  }
}
function drawCoins(cx, VW) {
  ctx.fillStyle = '#fff'; ctx.shadowColor = HOT; ctx.shadowBlur = 10;
  for (const c of coins) {
    if (c.got || c.x < cx - 30 || c.x > cx + VW + 30) continue;
    const w = Math.abs(Math.cos(T * 3.3 + c.x * .01)) * 5 + 1.5;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, w, 6, 0, 0, TAU); ctx.fill();
  }
  ctx.shadowBlur = 0;
}
function drawBike() {
  ctx.save();
  ctx.translate(s.x, s.y); ctx.rotate(s.a);
  if (s.invul > 0 && Math.floor(T * 12) % 2) ctx.globalAlpha = .4;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const c = s.dead ? '#666' : SKINS[SV.skin].c;
  if (mode === 'play' && holding) {
    ctx.fillStyle = '#ffb347'; ctx.shadowColor = '#ff6a00'; ctx.shadowBlur = 8;
    const fl = 6 + Math.random() * 8;
    ctx.beginPath(); ctx.moveTo(-23, -8); ctx.lineTo(-23 - fl, -6.5); ctx.lineTo(-23, -5); ctx.closePath(); ctx.fill();
  }
  ctx.shadowColor = c; ctx.shadowBlur = 7;
  for (const wx of [-HALF, HALF]) {
    ctx.save(); ctx.translate(wx, 0); ctx.rotate(s.wa);
    ctx.fillStyle = '#0a0a0a'; ctx.strokeStyle = c; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(0, 0, R - .9, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.moveTo(0, -5); ctx.lineTo(0, 5); ctx.stroke();
    ctx.restore();
  }
  // deck with kicktails
  ctx.beginPath(); ctx.moveTo(-23, -9.5); ctx.lineTo(-18, -5.5); ctx.lineTo(18, -5.5); ctx.lineTo(23, -9.5);
  ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 4.5; ctx.stroke();
  ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.stroke();
  // engine, exhaust, fork, low bar stub
  ctx.fillStyle = '#161616'; ctx.strokeStyle = c; ctx.lineWidth = 1.2;
  ctx.fillRect(-9, -12, 12, 6); ctx.strokeRect(-9, -12, 12, 6);
  ctx.strokeStyle = '#9a9aa6'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-9, -8); ctx.lineTo(-22, -6.5); ctx.stroke();
  ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(HALF, 0); ctx.lineTo(13, -10); ctx.stroke();
  ctx.strokeStyle = c; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(11, -11); ctx.lineTo(15, -11); ctx.stroke();

  // ---- tiny crouched Spider-Man rider ----
  ctx.shadowBlur = 2;
  ctx.strokeStyle = c; ctx.lineWidth = 3.2;                       // legs
  ctx.beginPath(); ctx.moveTo(-9, -10.5); ctx.lineTo(-1, -9.5); ctx.lineTo(3, -6.5); ctx.stroke();
  ctx.strokeStyle = '#0c0c10'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(3, -6.2); ctx.lineTo(7, -6.2); ctx.stroke(); // boot
  ctx.strokeStyle = c; ctx.lineWidth = 5.4;                       // torso
  ctx.beginPath(); ctx.moveTo(-10, -10.5); ctx.lineTo(1.5, -13.5); ctx.stroke();
  ctx.strokeStyle = '#0c0c10'; ctx.lineWidth = .9;                // back web mark
  ctx.beginPath(); ctx.moveTo(-6, -12.6); ctx.lineTo(-3, -10.6); ctx.moveTo(-6, -10.6); ctx.lineTo(-3, -12.6); ctx.moveTo(-4.5, -13.2); ctx.lineTo(-4.5, -10); ctx.stroke();
  ctx.strokeStyle = c; ctx.lineWidth = 2.6;                       // arm
  ctx.beginPath(); ctx.moveTo(1.5, -13.5); ctx.lineTo(7, -11.5); ctx.lineTo(12, -10.8); ctx.stroke();
  ctx.fillStyle = '#0c0c10'; ctx.beginPath(); ctx.arc(12.3, -10.8, 1.7, 0, TAU); ctx.fill();
  ctx.fillStyle = c; ctx.beginPath(); ctx.arc(6.2, -16.2, 4.2, 0, TAU); ctx.fill();   // mask
  ctx.strokeStyle = '#0c0c10'; ctx.lineWidth = .6; ctx.beginPath();
  ctx.moveTo(6.2, -20.4); ctx.lineTo(6.2, -12); ctx.moveTo(2, -16.2); ctx.lineTo(10.4, -16.2);
  ctx.moveTo(3.2, -19); ctx.quadraticCurveTo(6.2, -17.6, 9.2, -19); ctx.moveTo(3.2, -13.4); ctx.quadraticCurveTo(6.2, -14.8, 9.2, -13.4); ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0c0c10'; ctx.lineWidth = .6;
  ctx.beginPath(); ctx.ellipse(8.2, -16.8, 2.3, 1.2, -.35, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(4.6, -16.8, 1.8, 1, -.15, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ---------- UI ----------
function rr(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function btn(x, y, w, h, label, fn, o = {}) {
  btns.push({ x, y, w, h, fn });
  ctx.save();
  ctx.shadowColor = HOT; ctx.shadowBlur = o.dim ? 0 : 12;
  ctx.fillStyle = o.dim ? 'rgba(255,255,255,.12)' : 'rgba(224,26,43,.92)';
  rr(x, y, w, h, 10); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = o.dim ? '#bbb' : '#fff'; ctx.font = '800 ' + (o.fs || 18) + 'px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ctx.restore();
}
function text(t, x, y, size, color = '#fff', glow = false, weight = 800) {
  ctx.save(); ctx.fillStyle = color; ctx.font = weight + ' ' + size + 'px system-ui'; ctx.textAlign = 'center';
  if (glow) { ctx.shadowColor = HOT; ctx.shadowBlur = 18; }
  ctx.fillText(t, x, y); ctx.restore();
}
function drawMenu(u) {
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, W, H);
  text('WEB RIDER', W / 2, H * 0.24, 56 * u, '#fff', true, 900);
  text('BEST ' + SV.best + '  ·  FARTHEST ' + SV.bestDist + ' m', W / 2, H * 0.24 + 30 * u, 15 * u, 'rgba(255,255,255,.7)', false, 700);
  const bx = W / 2 - 120 * u;
  btn(bx, H * 0.44, 240 * u, 54 * u, 'PLAY', startRun, { fs: 22 * u });
  btn(bx, H * 0.44 + 64 * u, 240 * u, 44 * u, 'GARAGE', () => { mode = 'garage'; }, { fs: 16 * u, dim: true });
  btn(bx, H * 0.44 + 118 * u, 240 * u, 38 * u, SV.snd ? 'SOUND: ON' : 'SOUND: OFF', () => { SV.snd = SV.snd ? 0 : 1; save(); }, { fs: 14 * u, dim: true });
  ctx.save(); ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = '800 ' + 18 * u + 'px system-ui';
  ctx.fillText('● ' + SV.coins, 16 + SAL, SAT + 28 * u); ctx.restore();
}
function drawGarage(u) {
  ctx.fillStyle = 'rgba(0,0,0,.88)'; ctx.fillRect(0, 0, W, H);
  text('GARAGE', W / 2, SAT + 38 * u, 32 * u, '#fff', true, 900);
  text('● ' + SV.coins + ' coins', W / 2, SAT + 60 * u, 15 * u, 'rgba(255,255,255,.75)', false, 700);
  const items = SKINS.map((k, i) => ({ type: 'skin', i, k })).concat([{ type: 'shield' }, { type: 'magnet' }]);
  const n = items.length, gp = 8, mg = 14 + SAL, cw = Math.min(150 * u, (W - mg * 2 - gp * (n - 1)) / n), ch = 150 * u;
  const x0 = (W - (cw * n + gp * (n - 1))) / 2, y0 = Math.max(SAT + 76 * u, H / 2 - ch / 2 - 10);
  items.forEach((it, idx) => {
    const x = x0 + idx * (cw + gp), mx = x + cw / 2;
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.06)';
    ctx.strokeStyle = (it.type === 'skin' && SV.skin === it.i) ? HOT : 'rgba(255,255,255,.15)'; ctx.lineWidth = 2;
    rr(x, y0, cw, ch, 12); ctx.fill(); ctx.stroke(); ctx.restore();
    const by = y0 + ch - 40 * u, bh = 32 * u, fs = 12 * u;
    if (it.type === 'skin') {
      const k = it.k, owned = SV.owned[it.i], eq = SV.skin === it.i, can = SV.coins >= k.p;
      ctx.save(); ctx.fillStyle = k.c; ctx.shadowColor = k.c; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(mx, y0 + 36 * u, 18 * u, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(mx + 4 * u, y0 + 33 * u, 6 * u, 3 * u, -.3, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(mx - 6 * u, y0 + 33 * u, 5 * u, 2.6 * u, .3, 0, TAU); ctx.fill(); ctx.restore();
      text(k.n, mx, y0 + 76 * u, 13 * u);
      btn(x + 6, by, cw - 12, bh, eq ? 'EQUIPPED' : owned ? 'EQUIP' : k.p + ' ●', () => {
        if (owned) SV.skin = it.i; else if (can) { SV.coins -= k.p; SV.owned[it.i] = 1; SV.skin = it.i; }
        save();
      }, { fs, dim: eq || (!owned && !can) });
    } else if (it.type === 'shield') {
      ctx.save(); ctx.strokeStyle = '#7fe8ff'; ctx.lineWidth = 3; ctx.shadowColor = '#7fe8ff'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(mx, y0 + 36 * u, 16 * u, 0, TAU); ctx.stroke(); ctx.restore();
      text('SHIELD', mx, y0 + 76 * u, 13 * u);
      text('1 extra life · own ' + SV.shields, mx, y0 + 94 * u, 9.5 * u, 'rgba(255,255,255,.65)', false, 600);
      btn(x + 6, by, cw - 12, bh, SHIELD_PRICE + ' ●', () => { if (SV.coins >= SHIELD_PRICE) { SV.coins -= SHIELD_PRICE; SV.shields++; save(); } }, { fs, dim: SV.coins < SHIELD_PRICE });
    } else {
      ctx.save(); ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 5 * u; ctx.shadowColor = '#ffd84a'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(mx, y0 + 38 * u, 12 * u, 0, Math.PI); ctx.stroke(); ctx.restore();
      text('MAGNET', mx, y0 + 76 * u, 13 * u);
      text('pulls coins', mx, y0 + 94 * u, 9.5 * u, 'rgba(255,255,255,.65)', false, 600);
      btn(x + 6, by, cw - 12, bh, SV.magnet ? 'OWNED' : MAGNET_PRICE + ' ●', () => { if (!SV.magnet && SV.coins >= MAGNET_PRICE) { SV.coins -= MAGNET_PRICE; SV.magnet = 1; save(); } }, { fs, dim: !!SV.magnet || SV.coins < MAGNET_PRICE });
    }
  });
  btn(W / 2 - 90 * u, y0 + ch + 18 * u, 180 * u, 42 * u, 'BACK', () => { mode = 'menu'; }, { fs: 16 * u });
}
function drawDead(u) {
  ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(0, 0, W, H);
  const cy = Math.max(SAT + 36 * u, H * 0.08);
  text('WIPED OUT', W / 2, cy + 30 * u, 44 * u, HOT, true, 900);
  text(s.why, W / 2, cy + 54 * u, 14 * u, 'rgba(255,255,255,.7)', false, 700);
  const t = total(), lh = 22 * u, y = cy + 86 * u;
  const rows = [['DISTANCE', dist() + ' m  =  ' + dist() * 10], ['TRICKS & BONUSES', '+' + s.bonus], ['FLIPS · LOOPS', s.flips + ' · ' + s.loops], ['COINS', s.coins + ' ●']];
  rows.forEach((r, i) => {
    ctx.save(); ctx.font = '700 ' + 15 * u + 'px system-ui'; ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.textAlign = 'right'; ctx.fillText(r[0], W / 2 - 14, y + i * lh);
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText(r[1], W / 2 + 14, y + i * lh); ctx.restore();
  });
  const y2 = y + rows.length * lh;
  text('SCORE ' + t, W / 2, y2 + 20 * u, 34 * u, '#fff', true, 900);
  const st = starsOf(t);
  text('★'.repeat(st) + '☆'.repeat(3 - st) + '   RANK ' + rankOf(t) + (s.newBest ? '   NEW BEST!' : ''), W / 2, y2 + 48 * u, 19 * u, '#ffd84a', false, 800);
  const by = y2 + 64 * u, bw = Math.min(150 * u, (W - 40) / 3 - 8);
  btn(W / 2 - bw * 1.5 - 8, by, bw, 44 * u, 'RETRY', startRun, { fs: 17 * u });
  btn(W / 2 - bw / 2, by, bw, 44 * u, 'GARAGE', () => { mode = 'garage'; }, { fs: 15 * u, dim: true });
  btn(W / 2 + bw / 2 + 8, by, bw, 44 * u, 'MENU', () => { reset(); mode = 'menu'; }, { fs: 15 * u, dim: true });
}
function drawHUD(u) {
  const top = SAT + 6, t = total(), mg = 16 + SAL;
  text(String(t), W / 2, top + 40 * u, 42 * u, '#fff', true, 900);
  text(dist() + ' m  ·  BEST ' + SV.best, W / 2, top + 60 * u, 13 * u, 'rgba(255,255,255,.7)', false, 700);
  ctx.save(); ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = '800 ' + 17 * u + 'px system-ui';
  ctx.fillText('● ' + (SV.coins + s.coins), mg, top + 24 * u);
  if (SV.shields > 0) { ctx.fillStyle = '#7fe8ff'; ctx.font = '700 ' + 13 * u + 'px system-ui'; ctx.fillText('SHIELD x' + SV.shields, mg, top + 44 * u); }
  ctx.textAlign = 'right'; ctx.fillStyle = s.mult > 1 ? '#ffd84a' : 'rgba(255,255,255,.5)'; ctx.font = '900 ' + 26 * u + 'px system-ui';
  ctx.fillText('x' + s.mult, W - 16, top + 28 * u);
  if (s.mt > 0) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(W - 16 - 60 * u, top + 36 * u, 60 * u * clamp(s.mt / 8, 0, 1), 4); }
  ctx.restore();
  if (msgT > 0) text(msg, W / 2, H * 0.3, 26 * u, '#fff', true, 900);
  if (hintT > 0) {
    text('HOLD = GAS   ·   IN THE AIR = BACKFLIP   ·   RELEASE = STOP SPINNING', W / 2, H * 0.86, 14 * u, 'rgba(255,255,255,' + clamp(hintT, 0, 1) * .8 + ')', false, 700);
  }
}

function draw() {
  const Z = ZOOM(), VW = W / Z, VH = H / Z, u = clamp(Math.min(W / 760, H / 420), .7, 1.4);
  btns = [];
  const ty = s.rail ? (s.rail.L.y0 - s.rail.L.R) - VH * 0.5 : s.y - VH * 0.6;
  s.camX += ((s.x - VW * 0.28) - s.camX) * 0.14;
  s.camY += (ty - s.camY) * 0.08;
  let sx = 0, sy = 0;
  if (shake > 0) { sx = (Math.random() - .5) * shake; sy = (Math.random() - .5) * shake; }
  const cx = s.camX + sx, cy = s.camY + sy;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#000'); bg.addColorStop(0.6, '#1c0207'); bg.addColorStop(1, '#4a0510');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); ctx.shadowBlur = 0;
  web();
  ctx.fillStyle = 'rgba(255,40,60,0.18)'; ctx.beginPath(); ctx.arc(W * 0.78, H * 0.22, 70, 0, TAU); ctx.fill();
  skyline(cx, 0.12, H * 0.64 - s.camY * 0.04, 90, 260, '#0e0307', false, false);
  skyline(cx, 0.22, H * 0.74 - s.camY * 0.06, 60, 200, '#12040a', false, true);
  skyline(cx, 0.4, H * 0.86 - s.camY * 0.1, 50, 170, '#0a0206', true, false);
  speedLines();

  ctx.save(); ctx.scale(Z, Z); ctx.translate(-cx, -cy);
  drawTerrain(cx, cy, VW, VH);
  drawPits(cx, VW);
  drawMarks(cx, VW);
  drawLoops(cx, VW);
  drawPads(cx, VW);
  drawHaz(cx, VW);
  drawCoins(cx, VW);
  for (const p of P) {
    ctx.globalAlpha = Math.max(0, p.l / p.m);
    ctx.fillStyle = p.c; ctx.shadowColor = p.c; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.z, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  drawBike();
  ctx.restore();

  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .45, W / 2, H / 2, Math.max(W, H) * .75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  if (mode === 'play') drawHUD(u);
  else if (mode === 'menu') drawMenu(u);
  else if (mode === 'garage') drawGarage(u);
  else if (mode === 'dead') drawDead(u);
}

// ---------- loop ----------
reset();
let last = performance.now();
function frame(t) {
  const dt = Math.min(0.033, Math.max(0, (t - last) / 1000)); last = t;
  extend(s.x + 3600);
  updateHaz();
  for (let i = 0; i < SUB; i++) step(dt / SUB);
  updateFx(dt);
  engineSound(); music();
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
