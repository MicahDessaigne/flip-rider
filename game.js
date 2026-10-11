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
const HOT = '#ff2a3d';
// ---- tuning ----
const G = 1400, ACC = 700, MAXV = 640, SPINA = 26, MAXW = 7;
const R = 7, HALF = 17, INV_I = 1 / 430, REST = 0.1, SUB = 8;
const LOOPF = 900, LOOPMIN = 420;
const BK = 64;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => Math.floor(a + Math.random() * (b - a));
const hash = n => { n = Math.sin(n * 127.1) * 43758.5453; return n - Math.floor(n); };

// ---- save data ----
const SKINS = [
  { n: 'CLASSIC', p: 0, c: '#e01a2b' },
  { n: 'VENOM', p: 150, c: '#e6e6f5' },
  { n: 'NEON', p: 300, c: '#00e5ff' },
  { n: 'GOLD', p: 600, c: '#ffc400' }
];
const SHIELD_PRICE = 50;
let SV = { coins: 0, best: 0, bestDist: 0, skin: 0, owned: [1, 0, 0, 0], shields: 0 };
try { const j = JSON.parse(localStorage.getItem('wr2')); if (j) SV = Object.assign(SV, j); } catch (e) {}
const save = () => { try { localStorage.setItem('wr2', JSON.stringify(SV)); } catch (e) {} };

// ---- audio ----
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
  const t = ac.currentTime, on = mode === 'play';
  engG.gain.setTargetAtTime(on ? (holding ? 0.06 : 0.02) : 0, t, 0.05);
  eng.frequency.setTargetAtTime(45 + Math.hypot(s.vx, s.vy) * 0.16, t, 0.08);
}
document.addEventListener('visibilitychange', () => {
  if (!ac) return;
  if (document.hidden) ac.suspend(); else ac.resume();
});

// ---- terrain (line segments) ----
let segs, grid, haz, coins, px, py, maxY, lid;
function addSeg(x1, y1, x2, y2, loop) {
  const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy);
  if (l < 0.01) return;
  const o = { id: segs.length, x1, y1, x2, y2, l, dx: dx / l, dy: dy / l, nx: dy / l, ny: -dx / l, loop: !!loop, lid: loop ? lid : -1, lend: false };
  segs.push(o);
  const b0 = Math.floor(Math.min(x1, x2) / BK), b1 = Math.floor(Math.max(x1, x2) / BK);
  for (let b = b0; b <= b1; b++) (grid[b] || (grid[b] = [])).push(o);
}
function to(x, y, loop) { addSeg(px, py, x, y, loop); px = x; py = y; if (y > maxY) maxY = y; }
function flat(len) { const n = Math.max(1, Math.ceil(len / 60)), st = len / n; for (let i = 0; i < n; i++) to(px + st, py); }
function ease(len, dy) {
  const x0 = px, y0 = py, n = Math.max(6, Math.round(len / 10));
  for (let i = 1; i <= n; i++) to(x0 + len * i / n, y0 + dy * (1 - Math.cos(Math.PI * i / n)) / 2);
}
function ramp(len, h) {
  const x0 = px, y0 = py, n = Math.max(6, Math.round(len / 10));
  for (let i = 1; i <= n; i++) { const t = i / n; to(x0 + len * t, y0 - h * t * t); }
}
function loopPiece(Rl, d) {
  lid++;
  const x0 = px, y0 = py, n = 36;
  for (let i = 1; i <= n; i++) {
    const t = TAU * i / n;
    to(x0 + Rl * Math.sin(t) + d * t / TAU, y0 - Rl * (1 - Math.cos(t)), true);
  }
  segs[segs.length - 1].lend = true;
  py = y0; // snap exactly back to ground level
}
function coinsAlong(id0, p) {
  if (Math.random() > p) return;
  let acc = 0;
  for (let i = id0; i < segs.length; i++) {
    const o = segs[i]; acc += o.l;
    if (acc >= 44) {
      acc = 0;
      coins.push({ x: (o.x1 + o.x2) / 2 + o.nx * 22, y: (o.y1 + o.y2) / 2 + o.ny * 22, got: false });
    }
  }
}
function terrainReset() {
  segs = []; grid = {}; haz = []; coins = []; px = -300; py = 0; maxY = 0; lid = 0;
  flat(560);
}
function extend(toX) {
  while (px < toX) {
    const d = px, hard = Math.min(1, d / 12000), id0 = segs.length;
    const dir = py > 260 ? -1 : py < -260 ? 1 : (Math.random() < 0.5 ? -1 : 1);
    const opts = ['roll', 'roll', 'bump', 'steep'];
    if (d > 700) opts.push('jump', 'jump');
    if (d > 1200) opts.push('loop');
    if (d > 1600) opts.push('piston', 'sawdrop');
    if (d > 2400) opts.push('pend', 'loop');
    const k = opts[(Math.random() * opts.length) | 0];
    if (k === 'roll') { ease(rnd(180, 320), dir * rnd(40, 110)); flat(60); coinsAlong(id0, .6); }
    else if (k === 'bump') { const h = rnd(30, 70), L = rnd(120, 200); ease(L, -dir * h); ease(L, dir * h); flat(60); coinsAlong(id0, .6); }
    else if (k === 'steep') { ease(rnd(160, 240), dir * rnd(120, 200)); flat(80); coinsAlong(id0, .5); }
    else if (k === 'jump') {
      flat(100); ramp(rnd(140, 190), rnd(55, 90));
      const gl = rnd(90, 140) + hard * 40, dr = rnd(30, 70), x0 = px, y0 = py;
      for (let q = 0; q < 5; q++) coins.push({ x: x0 + (q + .5) / 5 * gl, y: y0 - 38 - 44 * Math.sin(Math.PI * (q + .5) / 5), got: false });
      px += gl; py += dr; if (py > maxY) maxY = py;
      ease(120, 20); flat(80);
    }
    else if (k === 'sawdrop') {
      flat(140); ramp(110, 48);
      const lipX = px; px += 24; py += 70; if (py > maxY) maxY = py;
      flat(40); flat(130);
      haz.push({ t: 'saw', x: lipX + 60, y: py - 9, r: 12, cc: false });
      coins.push({ x: lipX + 40, y: py - 100, got: false }, { x: lipX + 90, y: py - 95, got: false });
      ease(180, -70); flat(60);
    }
    else if (k === 'piston') {
      flat(130);
      const n = 1 + (Math.random() < hard * 1.5 ? 1 : 0);
      for (let q = 0; q < n; q++) {
        haz.push({ t: 'pist', x: px + 70, gy: py, w: 30, per: 2.8, ph: Math.random(), cc: false });
        flat(150);
      }
      flat(60); coinsAlong(id0, .5);
    }
    else if (k === 'pend') {
      flat(140);
      haz.push({ t: 'pend', x: px + 90, px: px + 90, py: py - 170, L: 140, amp: 1.1, per: 2.6, ph: Math.random() * TAU, gy: py, cc: false });
      flat(200); coinsAlong(id0, .4);
    }
    else if (k === 'loop') { flat(170); loopPiece(62, 84); flat(130); coinsAlong(id0, .9); }
  }
}
function contact(x, y, r, cen) {
  let best = null;
  const b1 = Math.floor((x + r) / BK);
  for (let b = Math.floor((x - r) / BK); b <= b1; b++) {
    const g = grid[b]; if (!g) continue;
    for (const o of g) {
      if (cen >= 0 && Math.abs(o.id - cen) > 14) continue;
      const ax = x - o.x1, ay = y - o.y1, t = ax * o.dx + ay * o.dy, sd = ax * o.nx + ay * o.ny;
      if (sd < -2 || sd >= r) continue;
      let nx, ny, pen;
      if (t >= 0 && t <= o.l) { nx = o.nx; ny = o.ny; pen = r - sd; }
      else {
        const qx = t < 0 ? o.x1 : o.x2, qy = t < 0 ? o.y1 : o.y2, vx = x - qx, vy = y - qy, d = Math.hypot(vx, vy);
        if (d >= r) continue;
        if (d < 1e-6) { nx = o.nx; ny = o.ny; pen = r; } else { nx = vx / d; ny = vy / d; pen = r - d; }
      }
      if (!best || pen > best.pen) best = { o, pen, nx, ny };
    }
  }
  return best;
}

// ---- hazards ----
function updateHaz(T) {
  for (const h of haz) {
    if (Math.abs(h.x - s.x) > 1500) continue;
    if (h.t === 'saw') { h.cx = h.x; h.cy = h.y; }
    else if (h.t === 'pend') {
      const a = h.amp * Math.sin(TAU * (T / h.per) + h.ph);
      h.a = a; h.cx = h.px + h.L * Math.sin(a); h.cy = h.py + h.L * Math.cos(a); h.r = 12;
    } else {
      const u = ((T / h.per) + h.ph) % 1; h.u = u;
      const lift = u < .5 ? 130 : u < .62 ? 130 * (1 - (u - .5) / .12) : u < .8 ? 0 : 130 * (u - .8) / .2;
      h.lift = lift;
      const bot = h.gy - lift;
      h.x1 = h.x - h.w / 2; h.x2 = h.x + h.w / 2; h.y1 = bot - 70; h.y2 = bot;
    }
  }
}
function hdist(h, x, y) {
  if (h.t === 'pist') {
    const dx = Math.max(h.x1 - x, 0, x - h.x2), dy = Math.max(h.y1 - y, 0, y - h.y2);
    return Math.hypot(dx, dy);
  }
  return Math.hypot(x - h.cx, y - h.cy) - h.r;
}

// ---- state ----
let mode = 'menu', s, holding = false, shake = 0, msg = '', msgT = 0, P = [], T = 0, btns = [];
const ZOOM = () => clamp(Math.min(H / 470, W / 760), 0.35, 1.5);

function reset() {
  terrainReset(); extend(4500);
  P = []; shake = 0; msg = ''; msgT = 0; holding = false;
  s = { x: 0, y: -R - 0.5, vx: 0, vy: 0, a: 0, w: 0, wa: 0, wl: [-1, -1],
        nc: 2, air: 0, rot: 0, bonus: 0, coins: 0, mult: 1, mt: 0, invul: 0,
        curLoop: -1, safe: { x: 0, y: -R - 0.5 }, safeT: 0,
        dead: false, deadAt: 0, why: '', started: false, tricks: 0,
        camX: -200, camY: -300, mile: 0 };
}
const dist = () => Math.max(0, Math.floor(s.x / 50));
const total = () => dist() * 10 + s.bonus;
const rankOf = t => t >= 10000 ? 'S' : t >= 6000 ? 'A' : t >= 3000 ? 'B' : t >= 1200 ? 'C' : 'D';
const starsOf = t => (t >= 1200) + (t >= 3000) + (t >= 6000);

function award(base, label) {
  const p = base * s.mult;
  s.bonus += p; s.mt = 8; s.tricks++;
  msg = label + (s.mult > 1 ? ' x' + s.mult : '') + '  +' + p; msgT = 1.4;
  if (s.mult < 5) s.mult++;
}
function spark(x, y, vx, vy, c, n, life) {
  for (let i = 0; i < n; i++) P.push({
    x, y, vx: vx + (Math.random() - .5) * 220, vy: vy + (Math.random() - .5) * 220,
    l: life * (.6 + Math.random() * .6), m: life, c, z: 1.2 + Math.random() * 2 });
}
function startRun() { reset(); mode = 'ready'; }
function press() {
  initAudio();
  if (mode === 'ready') { mode = 'play'; s.started = true; s.vx = 220; }
  holding = true;
}
const release = () => { holding = false; };
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); initAudio();
  if (mode === 'ready' || mode === 'play') { press(); return; }
  const x = e.clientX, y = e.clientY;
  if (mode === 'dead' && performance.now() - s.deadAt < 600) return;
  for (const b of btns) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.fn(); return; }
});
addEventListener('pointerup', release);
addEventListener('pointercancel', release);
addEventListener('blur', release);
addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault(); if (e.repeat) return;
    if (mode === 'ready' || mode === 'play') press();
    else if (mode === 'menu') startRun();
    else if (mode === 'dead' && performance.now() - s.deadAt > 600) startRun();
  }
});
addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'ArrowUp') release(); });

function respawn() {
  const p = s.safe;
  s.x = p.x; s.y = p.y - 4; s.vx = 380; s.vy = 0; s.a = 0; s.w = 0;
  s.nc = 2; s.air = 0; s.rot = 0; s.wl = [-1, -1]; s.invul = 1.8; s.curLoop = -1;
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

const BIKE_PTS = [[-HALF, 0, R], [HALF, 0, R], [3, -11, 3.5], [0, -8, 3], [-20, -9, 2], [20, -9, 2]];

function step(dt) {
  if (mode !== 'play') return;
  s.vy += G * dt;
  if (s.nc === 0) {
    if (holding) s.w = Math.max(-MAXW, s.w - SPINA * dt);
    else s.w *= (1 - 1.2 * dt);
  }
  s.vx *= (1 - 0.04 * dt); s.vy *= (1 - 0.01 * dt); s.w *= (1 - 0.3 * dt);
  s.x += s.vx * dt; s.y += s.vy * dt; s.a += s.w * dt;
  if (s.nc === 0) { s.rot += s.w * dt; s.air += dt; }

  let nc = 0, inLoop = false;
  const ca = Math.cos(s.a), sa = Math.sin(s.a);
  for (let i = 0; i < 2; i++) {
    const ox = i ? HALF : -HALF, rx = ox * ca, ry = ox * sa;
    const c = contact(s.x + rx, s.y + ry, R, s.wl[i]);
    if (!c) { s.wl[i] = -1; continue; }
    nc++; s.wl[i] = c.o.id;
    s.x += c.nx * c.pen * 0.8; s.y += c.ny * c.pen * 0.8;
    const vpx = s.vx - s.w * ry, vpy = s.vy + s.w * rx, vn = vpx * c.nx + vpy * c.ny;
    if (vn < 0) {
      const rn = rx * c.ny - ry * c.nx, e = vn < -120 ? REST : 0;
      const j = -(1 + e) * vn / (1 + rn * rn * INV_I);
      s.vx += j * c.nx; s.vy += j * c.ny; s.w += rn * j * INV_I;
    }
    const o = c.o;
    if (holding && Math.hypot(s.vx, s.vy) < MAXV) { s.vx += o.dx * ACC * .5 * dt; s.vy += o.dy * ACC * .5 * dt; }
    if (o.loop) {
      inLoop = true; s.curLoop = o.lid;
      s.vx -= c.nx * LOOPF * dt; s.vy -= c.ny * LOOPF * dt;
      const vt = s.vx * o.dx + s.vy * o.dy;
      if (vt < LOOPMIN) { const k = Math.min(1, dt * 20) * (LOOPMIN - vt); s.vx += o.dx * k; s.vy += o.dy * k; }
    }
    if (o.lend && s.curLoop === o.lid) { s.curLoop = -1; award(150, 'LOOP'); beep(500, 1300, .3, 'triangle', .15); }
    s.wa += (s.vx * o.dx + s.vy * o.dy) / R * dt;
  }

  // head hit test
  const ca2 = Math.cos(s.a), sa2 = Math.sin(s.a);
  const hx = s.x + 3 * ca2 + 11 * sa2, hy = s.y + 3 * sa2 - 11 * ca2;
  const hc = contact(hx, hy, 3.5, Math.max(s.wl[0], s.wl[1]));
  if (hc && hc.pen > 1) { crash('HEAD FIRST'); if (s.dead) return; }
  if (s.y > maxY + 500) { crash('FELL INTO THE VOID'); if (s.dead) return; }

  // hazards
  for (const h of haz) {
    if (Math.abs(h.x - s.x) > 130) continue;
    let hit = false;
    for (const p of BIKE_PTS) {
      const wx = s.x + p[0] * ca2 - p[1] * sa2, wy = s.y + p[0] * sa2 + p[1] * ca2;
      if (hdist(h, wx, wy) < p[2]) { hit = true; break; }
    }
    if (hit) { crash(h.t === 'saw' ? 'SAWED' : h.t === 'pist' ? 'CRUSHED' : 'SMASHED'); if (s.dead) return; }
    else if (!h.cc && hdist(h, s.x, s.y) < 34) { h.cc = true; award(50, 'CLOSE CALL'); }
  }

  // landing
  if (nc > 0 && s.nc === 0) {
    if (s.air > 0.2) {
      spark(s.x, s.y + R, s.vx * .2, -120, HOT, 14, .4);
      beep(110, 40, .12, 'sine', .22);
      const f = Math.floor(Math.abs(s.rot) / TAU + 0.3);
      if (f > 0) { award(100 * f, f > 1 ? f + 'x FLIP' : 'FLIP'); beep(600 + f * 150, 1200 + f * 150, .25, 'triangle', .18); if (navigator.vibrate) navigator.vibrate(20); }
      if (s.air > 0.9) award(Math.floor(s.air * 40), 'BIG AIR');
    }
    s.air = 0; s.rot = 0;
  }
  if (nc > 0) s.rot = 0;
  s.nc = nc;

  if (nc === 2 && !inLoop && Math.abs(s.a) < 0.4) {
    s.safeT += dt;
    if (s.safeT > 0.3) { s.safe = { x: s.x, y: s.y }; s.safeT = 0; }
  }

  for (const c of coins) {
    if (!c.got && Math.abs(c.x - s.x) < 28 && Math.abs(c.y - s.y) < 30) {
      c.got = true; s.coins++; s.bonus += 10;
      beep(900, 1500, .12, 'triangle', .12);
      spark(c.x, c.y, 0, -60, '#ffffff', 5, .35);
    }
  }
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
  if (s.invul > 0) s.invul -= dt;
  if (mode === 'play') {
    if (s.mult > 1 || s.mt > 0) { s.mt -= dt; if (s.mt <= 0) { s.mult = 1; s.mt = 0; } }
    if (holding && s.nc > 0 && Math.random() < 0.6) spark(s.x - 20, s.y + 4, -s.vx * .25, -30, HOT, 1, .35);
  }
  if (Math.random() < 0.02) coins = coins.filter(c => !c.got && c.x > s.x - 1500);
}

// ---- drawing ----
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
  if (mode !== 'play' || sp < 450) return;
  ctx.strokeStyle = 'rgba(255,255,255,' + clamp((sp - 450) / 500, 0, 1) * 0.3 + ')'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 12; i++) {
    const y = hash(i * 3.1) * H;
    const x = ((hash(i * 9.7) * W * 2 - T * (900 + i * 60)) % (W + 200) + (W + 200)) % (W + 200) - 100;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 40 + sp * 0.04, y); ctx.stroke();
  }
}
function drawTerrain(cx, VW, VH, cy) {
  const set = new Set(), b1 = Math.floor((cx + VW + 40) / BK);
  for (let b = Math.floor((cx - 40) / BK); b <= b1; b++) { const g = grid[b]; if (g) for (const o of g) set.add(o); }
  const arr = [...set].sort((a, b) => a.id - b.id);
  ctx.shadowBlur = 0; ctx.fillStyle = '#0a0305';
  let run = [];
  const flush = () => {
    if (run.length) {
      const bot = cy + VH + 500, f = run[0], l = run[run.length - 1];
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1);
      for (const o of run) ctx.lineTo(o.x2, o.y2);
      ctx.lineTo(l.x2, bot); ctx.lineTo(f.x1, bot); ctx.closePath(); ctx.fill();
    }
    run = [];
  };
  for (const o of arr) {
    if (o.loop) { flush(); continue; }
    const p = run[run.length - 1];
    if (p && (p.x2 !== o.x1 || p.y2 !== o.y1)) flush();
    run.push(o);
  }
  flush();
  // loop backing
  ctx.strokeStyle = '#1a0408'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.beginPath();
  for (const o of arr) if (o.loop) { ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); }
  ctx.stroke();
  // neon outline
  ctx.strokeStyle = HOT; ctx.shadowColor = HOT; ctx.shadowBlur = 12; ctx.lineWidth = 3; ctx.beginPath();
  let prev = null;
  for (const o of arr) {
    if (!prev || prev.x2 !== o.x1 || prev.y2 !== o.y1) ctx.moveTo(o.x1, o.y1);
    ctx.lineTo(o.x2, o.y2); prev = o;
  }
  ctx.stroke(); ctx.shadowBlur = 0;
}
function drawHaz(cx, VW, cy) {
  for (const h of haz) {
    if (h.x < cx - 200 || h.x > cx + VW + 200 || h.cx === undefined && h.x1 === undefined) continue;
    ctx.save();
    if (h.t === 'saw') {
      ctx.translate(h.cx, h.cy); ctx.rotate(T * 9);
      ctx.fillStyle = '#cfd2da'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 6;
      ctx.beginPath();
      for (let k = 0; k < 16; k++) { const a = k * TAU / 16, r = k % 2 ? 9 : 13; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = HOT; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, TAU); ctx.fill();
    } else if (h.t === 'pend') {
      ctx.strokeStyle = '#8a8a96'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(h.px, h.py); ctx.lineTo(h.cx, h.cy); ctx.stroke();
      ctx.fillStyle = '#16161c'; ctx.strokeStyle = HOT; ctx.lineWidth = 2.5; ctx.shadowColor = HOT; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(h.cx, h.cy, 12, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 2;
      for (let k = 0; k < 8; k++) { const a = k * TAU / 8 + h.a; ctx.beginPath(); ctx.moveTo(h.cx + Math.cos(a) * 12, h.cy + Math.sin(a) * 12); ctx.lineTo(h.cx + Math.cos(a) * 18, h.cy + Math.sin(a) * 18); ctx.stroke(); }
    } else if (h.x1 !== undefined) {
      const warn = h.u > .38 && h.u < .62 && Math.floor(T * 14) % 2 === 0;
      ctx.fillStyle = '#3a3a46'; ctx.fillRect(h.x - 3, h.gy - 700, 6, h.y1 - (h.gy - 700));
      ctx.fillStyle = '#1c1c26'; ctx.strokeStyle = warn ? '#ffffff' : HOT; ctx.lineWidth = 2.5; ctx.shadowColor = HOT; ctx.shadowBlur = warn ? 18 : 8;
      ctx.fillRect(h.x1, h.y1, h.w, h.y2 - h.y1); ctx.strokeRect(h.x1, h.y1, h.w, h.y2 - h.y1);
      ctx.fillStyle = HOT;
      for (let k = 0; k < 4; k++) ctx.fillRect(h.x1 + 3 + k * 7, h.y2 - 8, 4, 8);
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
  const c = s.dead ? '#777' : SKINS[SV.skin].c;
  ctx.shadowColor = c; ctx.shadowBlur = 7;
  for (const wx of [-HALF, HALF]) {
    ctx.save(); ctx.translate(wx, 0); ctx.rotate(s.wa);
    ctx.fillStyle = '#0a0a0a'; ctx.strokeStyle = c; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(0, 0, R - 0.9, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.moveTo(0, -5); ctx.lineTo(0, 5); ctx.stroke();
    ctx.restore();
  }
  // deck
  ctx.beginPath(); ctx.moveTo(-22, -12); ctx.lineTo(-17, -7); ctx.lineTo(17, -7); ctx.lineTo(22, -11);
  ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 4.5; ctx.stroke();
  ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.stroke();
  // engine block + exhaust + fork
  ctx.fillStyle = '#161616'; ctx.strokeStyle = c; ctx.lineWidth = 1.2;
  ctx.fillRect(-11, -13, 10, 6); ctx.strokeRect(-11, -13, 10, 6);
  ctx.strokeStyle = '#999'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-11, -9); ctx.lineTo(-23, -8); ctx.stroke();
  ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(HALF, 0); ctx.lineTo(13, -12); ctx.stroke();
  ctx.strokeStyle = c; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(11, -13); ctx.lineTo(15, -13); ctx.stroke();
  // head bump only
  ctx.shadowBlur = 3; ctx.fillStyle = c;
  ctx.beginPath(); ctx.arc(3, -8, 4.5, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#111'; ctx.lineWidth = .6;
  ctx.beginPath(); ctx.moveTo(3, -12.5); ctx.lineTo(3, -8); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.ellipse(1.4, -9.6, 1.5, .85, .4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(4.8, -9.6, 1.5, .85, -.4, 0, TAU); ctx.fill();
  ctx.restore();
}

// ---- UI ----
function rr(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function btn(x, y, w, h, label, fn, o = {}) {
  btns.push({ x, y, w, h, fn });
  ctx.save();
  ctx.shadowColor = HOT; ctx.shadowBlur = o.dim ? 0 : 12;
  ctx.fillStyle = o.dim ? 'rgba(255,255,255,.1)' : 'rgba(224,26,43,.92)';
  rr(x, y, w, h, 10); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = o.dim ? '#aaa' : '#fff'; ctx.font = '800 ' + (o.fs || 18) + 'px system-ui';
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
  btn(W / 2 - 120 * u, H * 0.46, 240 * u, 54 * u, 'PLAY', startRun, { fs: 22 * u });
  btn(W / 2 - 120 * u, H * 0.46 + 66 * u, 240 * u, 46 * u, 'GARAGE', () => { mode = 'garage'; }, { fs: 17 * u, dim: true });
  text('● ' + SV.coins, 18 + 30 * u, SAT + 30, 18 * u, '#fff');
}
function drawGarage(u) {
  ctx.fillStyle = 'rgba(0,0,0,.85)'; ctx.fillRect(0, 0, W, H);
  text('GARAGE', W / 2, SAT + 40 * u, 34 * u, '#fff', true, 900);
  text('● ' + SV.coins + ' coins', W / 2, SAT + 62 * u, 15 * u, 'rgba(255,255,255,.75)', false, 700);
  const n = SKINS.length + 1, gap = 10, cw = Math.min(160 * u, (W - 30 - gap * (n - 1)) / n), ch = 150 * u;
  const x0 = (W - (cw * n + gap * (n - 1))) / 2, y0 = Math.max(SAT + 80 * u, H / 2 - ch / 2 - 10);
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (cw + gap);
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.strokeStyle = (i < SKINS.length && SV.skin === i) ? HOT : 'rgba(255,255,255,.15)'; ctx.lineWidth = 2;
    rr(x, y0, cw, ch, 12); ctx.fill(); ctx.stroke(); ctx.restore();
    if (i < SKINS.length) {
      const k = SKINS[i], owned = SV.owned[i], eq = SV.skin === i, can = SV.coins >= k.p;
      ctx.save(); ctx.fillStyle = k.c; ctx.shadowColor = k.c; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(x + cw / 2, y0 + 38 * u, 20 * u, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.restore();
      text(k.n, x + cw / 2, y0 + 78 * u, 14 * u);
      btn(x + 8, y0 + ch - 44 * u, cw - 16, 34 * u, eq ? 'EQUIPPED' : owned ? 'EQUIP' : k.p + ' ●', () => {
        if (owned) SV.skin = i;
        else if (can) { SV.coins -= k.p; SV.owned[i] = 1; SV.skin = i; }
        save();
      }, { fs: 13 * u, dim: eq || (!owned && !can) });
    } else {
      ctx.save(); ctx.strokeStyle = '#7fe8ff'; ctx.lineWidth = 3; ctx.shadowColor = '#7fe8ff'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(x + cw / 2, y0 + 38 * u, 18 * u, 0, TAU); ctx.stroke(); ctx.restore();
      text('SHIELD', x + cw / 2, y0 + 78 * u, 14 * u);
      text('survive 1 crash · own ' + SV.shields, x + cw / 2, y0 + 96 * u, 10.5 * u, 'rgba(255,255,255,.65)', false, 600);
      btn(x + 8, y0 + ch - 44 * u, cw - 16, 34 * u, 'BUY ' + SHIELD_PRICE + ' ●', () => {
        if (SV.coins >= SHIELD_PRICE) { SV.coins -= SHIELD_PRICE; SV.shields++; save(); }
      }, { fs: 13 * u, dim: SV.coins < SHIELD_PRICE });
    }
  }
  btn(W / 2 - 90 * u, y0 + ch + 20 * u, 180 * u, 42 * u, 'BACK', () => { mode = 'menu'; }, { fs: 16 * u });
}
function drawDead(u) {
  ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(0, 0, W, H);
  const cy = Math.max(SAT + 40 * u, H * 0.1);
  text('WIPED OUT', W / 2, cy + 30 * u, 44 * u, HOT, true, 900);
  text(s.why, W / 2, cy + 54 * u, 14 * u, 'rgba(255,255,255,.7)', false, 700);
  const t = total(), lh = 24 * u, y = cy + 90 * u;
  const rows = [['DISTANCE', dist() + ' m  =  ' + dist() * 10], ['TRICKS & BONUSES', '+' + s.bonus], ['COINS COLLECTED', s.coins + ' ●']];
  rows.forEach((r, i) => {
    ctx.save(); ctx.font = '700 ' + 15 * u + 'px system-ui'; ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.textAlign = 'right'; ctx.fillText(r[0], W / 2 - 14, y + i * lh);
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText(r[1], W / 2 + 14, y + i * lh); ctx.restore();
  });
  text('SCORE ' + t, W / 2, y + 3 * lh + 22 * u, 36 * u, '#fff', true, 900);
  const st = starsOf(t);
  text('★'.repeat(st) + '☆'.repeat(3 - st) + '   RANK ' + rankOf(t) + (s.newBest ? '   NEW BEST!' : ''), W / 2, y + 3 * lh + 52 * u, 20 * u, '#ffd84a', false, 800);
  const by = y + 3 * lh + 70 * u, bw = Math.min(150 * u, (W - 40) / 3 - 8);
  btn(W / 2 - bw * 1.5 - 8, by, bw, 46 * u, 'RETRY', startRun, { fs: 17 * u });
  btn(W / 2 - bw / 2, by, bw, 46 * u, 'GARAGE', () => { mode = 'garage'; }, { fs: 15 * u, dim: true });
  btn(W / 2 + bw / 2 + 8, by, bw, 46 * u, 'MENU', () => { reset(); mode = 'menu'; }, { fs: 15 * u, dim: true });
}
function drawHUD(u) {
  const top = SAT + 8, t = total();
  text(String(t), W / 2, top + 40 * u, 42 * u, '#fff', true, 900);
  text(dist() + ' m  ·  BEST ' + SV.best, W / 2, top + 60 * u, 13 * u, 'rgba(255,255,255,.7)', false, 700);
  ctx.save(); ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = '800 ' + 17 * u + 'px system-ui';
  ctx.fillText('● ' + (SV.coins + s.coins), 16, top + 24 * u);
  if (SV.shields > 0) { ctx.fillStyle = '#7fe8ff'; ctx.font = '700 ' + 13 * u + 'px system-ui'; ctx.fillText('SHIELD x' + SV.shields, 16, top + 44 * u); }
  ctx.textAlign = 'right'; ctx.fillStyle = s.mult > 1 ? '#ffd84a' : 'rgba(255,255,255,.5)'; ctx.font = '900 ' + 26 * u + 'px system-ui';
  ctx.fillText('x' + s.mult, W - 16, top + 28 * u);
  if (s.mt > 0) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(W - 16 - 60 * u, top + 36 * u, 60 * u * clamp(s.mt / 8, 0, 1), 4); }
  ctx.restore();
  if (msgT > 0) text(msg, W / 2, H * 0.3, 26 * u, '#fff', true, 900);
  if (mode === 'ready') {
    text('HOLD TO ACCELERATE', W / 2, H * 0.8, 20 * u, '#fff', true);
    text('HOLD IN THE AIR TO BACKFLIP  ·  LAND ON YOUR WHEELS', W / 2, H * 0.86, 13 * u, 'rgba(255,255,255,.65)', false, 600);
  }
}

function draw() {
  const Z = ZOOM(), VW = W / Z, VH = H / Z, u = clamp(Math.min(W / 760, H / 420), .7, 1.4);
  btns = [];
  s.camX = s.x - VW * 0.27;
  s.camY += ((s.y - VH * 0.6) - s.camY) * 0.1;
  let sx = 0, sy = 0;
  if (shake > 0) { sx = (Math.random() - .5) * shake; sy = (Math.random() - .5) * shake; }
  const cx = s.camX + sx, cy = s.camY + sy;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#000'); bg.addColorStop(0.6, '#1c0207'); bg.addColorStop(1, '#4a0510');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); ctx.shadowBlur = 0;
  web();
  ctx.fillStyle = 'rgba(255,40,60,0.18)'; ctx.beginPath(); ctx.arc(W * 0.78, H * 0.22, 70, 0, TAU); ctx.fill();
  skyline(cx, 0.15, H * 0.70 - s.camY * 0.05, 60, 200, '#12040a', false);
  skyline(cx, 0.35, H * 0.82 - s.camY * 0.10, 50, 180, '#0a0206', true);
  speedLines();

  ctx.save(); ctx.scale(Z, Z); ctx.translate(-cx, -cy);
  drawTerrain(cx, VW, VH, cy);
  drawHaz(cx, VW, cy);
  drawCoins(cx, VW);
  for (const p of P) {
    ctx.globalAlpha = Math.max(0, p.l / p.m);
    ctx.fillStyle = p.c; ctx.shadowColor = p.c; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.z, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  drawBike();
  ctx.restore();

  if (mode === 'play' || mode === 'ready') drawHUD(u);
  else if (mode === 'menu') drawMenu(u);
  else if (mode === 'garage') drawGarage(u);
  else if (mode === 'dead') drawDead(u);
}

// ---- loop ----
reset();
let last = performance.now();
function frame(t) {
  const dt = Math.min(0.033, Math.max(0, (t - last) / 1000)); last = t;
  extend(s.x + 3500);
  updateHaz(T);
  for (let i = 0; i < SUB; i++) step(dt / SUB);
  updateFx(dt);
  engineSound();
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
