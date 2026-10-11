/* Web Rider v8 — Complete Rewrite */
'use strict';
(function() {

// ─── Canvas & globals ────────────────────────────────────────────────────────
const cv = document.getElementById('c');
const cx = cv.getContext('2d');
let W, H;

function resize() {
  W = cv.width  = window.innerWidth;
  H = cv.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// ─── State machine ───────────────────────────────────────────────────────────
const ST = { MENU: 0, PLAY: 1, DEAD: 2, PAUSE: 3 };
let state = ST.MENU;

// ─── Audio ───────────────────────────────────────────────────────────────────
let AC, muted = false;
let bgGain, fxGain;

function initAudio() {
  if (AC) return;
  AC = new (window.AudioContext || window.webkitAudioContext)();
  bgGain = AC.createGain(); bgGain.gain.value = 0.18; bgGain.connect(AC.destination);
  fxGain = AC.createGain(); fxGain.gain.value = 0.55; fxGain.connect(AC.destination);
  startBeat();
}

function startBeat() {
  const bpm = 128, bar = 60 / bpm;
  const pattern = [1,0,0,0,1,0,1,0,1,0,0,0,1,0,0,1];
  let t = AC.currentTime;
  function schedule() {
    for (let i = 0; i < 16; i++) {
      if (pattern[i]) {
        const o = AC.createOscillator(), g = AC.createGain();
        o.type = 'sawtooth';
        o.frequency.value = i % 8 === 0 ? 55 : i % 4 === 0 ? 82 : 110;
        g.gain.setValueAtTime(0, t + i * bar);
        g.gain.linearRampToValueAtTime(0.9, t + i * bar + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * bar + bar * 0.8);
        o.connect(g); g.connect(bgGain);
        o.start(t + i * bar); o.stop(t + i * bar + bar);
      }
    }
    t += 16 * bar;
    if (!muted) setTimeout(schedule, (t - AC.currentTime - 0.5) * 1000);
  }
  schedule();
}

function beep(freq, dur, type='square', vol=0.4) {
  if (muted || !AC) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
  o.connect(g); g.connect(fxGain);
  o.start(); o.stop(AC.currentTime + dur);
}

function sfxLand()   { beep(200, 0.08, 'sawtooth', 0.5); }
function sfxCoin()   { beep(880, 0.07, 'sine', 0.4); setTimeout(() => beep(1320, 0.07, 'sine', 0.3), 50); }
function sfxTrick()  { beep(440, 0.05, 'square', 0.3); setTimeout(() => beep(660, 0.1, 'square', 0.3), 40); }
function sfxDie()    { beep(180, 0.3, 'sawtooth', 0.7); setTimeout(() => beep(90, 0.4, 'sawtooth', 0.6), 200); }
function sfxBoost()  { beep(330, 0.15, 'sawtooth', 0.35); }

// ─── Constants ───────────────────────────────────────────────────────────────
const GRAV   = 0.55;
const FRIC   = 0.985;
const BOOST  = 14.5;
const FLIP_SPD = 0.19;   // rad/frame during flip
const BIKE_W = 76;
const BIKE_H = 32;
const WHEEL_R = 18;

// Scoring — hard to get 300 at 5x
const PTS = { flip: 6, flipBonus: 3, loop: 20, coin: 2, near: 2, air: 1.5, dist: 40 };

// ─── Terrain generator ───────────────────────────────────────────────────────
// Segment types:
//   flat, slope_up, slope_down, hill, valley, ramp, loop, gap
const SEG = { FLAT: 0, UP: 1, DOWN: 2, HILL: 3, VALLEY: 4, RAMP_UP: 5, RAMP_DOWN: 6, LOOP: 7 };

class TerrainGen {
  constructor() {
    this.segs   = [];  // {x, y, w, angle}  screen-level line segments
    this.loops  = [];  // {cx, cy, r}
    this.coins  = [];  // {x, y, taken}
    this.hazards = []; // {type, x, y, ...}
    this.curX   = 0;
    this.curY   = 0;
    this.pts    = [{x: 0, y: 0}]; // raw polyline points
    this.dist   = 0;   // total horizontal distance generated
    this._diff  = 0;   // increases with distance
    this._lastSeg = SEG.FLAT;
    // Seed initial flat stretch
    this._addFlat(600);
    this._generate(4000);
  }

  _generate(upTo) {
    while (this.curX < upTo) {
      const d = this._diff;
      // Weighted random segment pick — loops appear at d>2
      const r = Math.random();
      if      (r < 0.18) this._addFlat(150 + Math.random()*200);
      else if (r < 0.35) this._addSlope(1, 120 + Math.random()*180, d*0.04+0.18);
      else if (r < 0.52) this._addSlope(-1, 120 + Math.random()*180, d*0.04+0.18);
      else if (r < 0.63) this._addHill(d);
      else if (r < 0.72) this._addValley(d);
      else if (r < 0.80) this._addRamp(d);
      else if (r < 0.88 && d > 2) this._addLoop(d);
      else                this._addFlat(100 + Math.random()*150);

      // Coins along path
      this._scatter_coins();
    }
  }

  extend(playerX) {
    if (playerX + 3000 > this.curX) {
      this._diff = Math.min(10, this._diff + 0.3);
      this._generate(playerX + 5000);
    }
  }

  _addFlat(len) {
    const x0 = this.curX, y0 = this.curY;
    this.pts.push({x: x0 + len, y: y0});
    this.curX += len; this.curY = y0;
  }

  _addSlope(dir, len, slope) {
    const x0 = this.curX, y0 = this.curY;
    const dy = dir * Math.min(slope * len, 220);
    this.pts.push({x: x0 + len, y: y0 + dy});
    this.curX += len; this.curY = y0 + dy;
  }

  _addHill(d) {
    const half = 120 + Math.random()*160;
    const h = 80 + d*18 + Math.random()*80;
    const cx = this.curX + half;
    // Approximate hill with Bezier via subdivision
    for (let t = 0; t <= 1; t += 0.1) {
      const x = this.curX + half*2*t;
      const y = this.curY - Math.sin(t*Math.PI)*h;
      this.pts.push({x, y});
    }
    this.curX += half*2; this.curY = this.pts[this.pts.length-1].y;
  }

  _addValley(d) {
    const half = 100 + Math.random()*140;
    const h = 60 + d*14 + Math.random()*70;
    for (let t = 0; t <= 1; t += 0.1) {
      const x = this.curX + half*2*t;
      const y = this.curY + Math.sin(t*Math.PI)*h;
      this.pts.push({x, y});
    }
    this.curX += half*2; this.curY = this.pts[this.pts.length-1].y;
  }

  _addRamp(d) {
    const len = 200 + Math.random()*150;
    const up = 80 + d*15;
    this.pts.push({x: this.curX + len*0.6, y: this.curY - up});
    this.pts.push({x: this.curX + len,     y: this.curY - up + 30});
    this.curX += len; this.curY -= up - 30;
    // A bit of air gap after ramp
    const gap = 80 + Math.random()*120;
    const land = this.curY + 40 + Math.random()*60;
    this.pts.push({x: this.curX + gap, y: land});
    this.curX += gap; this.curY = land;
  }

  _addLoop(d) {
    const r = 90 + d*8 + Math.random()*40;
    const loopX = this.curX + r + 30;
    const loopY = this.curY - r;   // centre sits r above current ground
    this.loops.push({cx: loopX, cy: loopY, r, entered: false, done: false});
    // Approach ramp
    this.pts.push({x: loopX - r - 10, y: this.curY});
    // Exit
    this.pts.push({x: loopX + r + 10, y: this.curY});
    this.curX = loopX + r + 80;
    this.curY = this.curY;
  }

  _scatter_coins() {
    // Add a few coins near the last added segment
    const last = this.pts[this.pts.length-1];
    const prev = this.pts[this.pts.length-2] || {x: last.x - 100, y: last.y};
    const steps = 4;
    for (let i = 1; i <= steps; i++) {
      if (Math.random() < 0.45) {
        const t = i / (steps+1);
        const x = prev.x + (last.x - prev.x)*t;
        const y = prev.y + (last.y - prev.y)*t - 35 - Math.random()*30;
        this.coins.push({x, y, taken: false});
      }
    }
  }

  // Return interpolated ground y at world-x position
  groundAt(wx) {
    const pts = this.pts;
    if (pts.length < 2) return 0;
    // Binary search for segment
    let lo = 0, hi = pts.length - 2;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid+1].x < wx) lo = mid + 1; else hi = mid;
    }
    const a = pts[lo], b = pts[lo+1];
    if (!b || b.x === a.x) return a.y;
    const t = (wx - a.x) / (b.x - a.x);
    return a.y + (b.y - a.y) * t;
  }

  // Tangent angle at wx (in radians)
  angleAt(wx) {
    const pts = this.pts;
    let lo = 0, hi = pts.length - 2;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid+1].x < wx) lo = mid + 1; else hi = mid;
    }
    const a = pts[lo], b = pts[lo+1];
    if (!b) return 0;
    return Math.atan2(b.y - a.y, b.x - a.x);
  }
}

// ─── Bike / Physics ──────────────────────────────────────────────────────────
class Bike {
  constructor(terrain) {
    this.t = terrain;
    this.x  = 200;
    this.y  = terrain.groundAt(200) - WHEEL_R - 10;
    this.vx = 0;
    this.vy = 0;
    this.angle   = 0;   // bike tilt (world)
    this.spin    = 0;   // current flip spin/frame
    this.airTime = 0;
    this.onGround = true;
    this.flips   = 0;    // full 360s in this air
    this.partFlip = 0;   // accumulated rotation this air
    this.alive   = true;
    this.boosting = false;

    // Rider lean angle (cosmetic)
    this.lean = 0;

    // Front/rear wheel for ground following
    this.frontY = 0;
    this.rearY  = 0;
  }

  update(holding) {
    if (!this.alive) return;

    // Engine / boost
    this.boosting = holding && this.vx < BOOST * 1.8;
    if (holding) {
      const maxV = BOOST * (this.onGround ? 1 : 1.15);
      if (this.vx < maxV) this.vx += this.onGround ? 1.2 : 0.6;
    }

    // Flip spin (backflip while in air)
    if (!this.onGround) {
      if (holding) {
        this.spin = Math.max(this.spin - 0.04, -FLIP_SPD);
      } else {
        this.spin += 0.02;
        this.spin = Math.min(this.spin, FLIP_SPD);
      }
      this.angle  += this.spin;
      this.partFlip += this.spin;
      this.airTime++;
    }

    // Gravity
    this.vy += GRAV;

    // Friction
    if (this.onGround) {
      this.vx *= FRIC;
      this.spin *= 0.7;
    }

    // Move
    this.x += this.vx;
    this.y += this.vy;

    // Ground collision
    const gy = this.t.groundAt(this.x) - WHEEL_R;
    if (this.y >= gy) {
      const crashed = this._checkCrash(gy);
      if (crashed) { this.alive = false; return; }
      this.y = gy;
      this.vy = 0;
      if (!this.onGround) this._land();
      this.onGround = true;
      // Align to slope
      const slope = this.t.angleAt(this.x);
      this.angle += (slope - this.angle) * 0.35;
    } else {
      this.onGround = false;
    }

    // Lean (cosmetic)
    const targetLean = holding ? -0.18 : 0.05;
    this.lean += (targetLean - this.lean) * 0.12;
  }

  _checkCrash(gy) {
    // Crash if landing near vertical (head-first) or backwards
    const a = ((this.angle % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
    const bad = (a > Math.PI*0.55 && a < Math.PI*1.45);
    if (bad && this.vy > 4) return true;
    // Crash if coming down too fast while badly tilted
    if (this.vy > 22) return true;
    return false;
  }

  _land() {
    sfxLand();
    const full = Math.abs(this.partFlip) / (Math.PI * 2);
    this.flips  = Math.floor(full);
    this.partFlip = 0;
    this.spin   = 0;
    this.angle  = this.t.angleAt(this.x);
  }
}

// ─── Score / game state ──────────────────────────────────────────────────────
class Game {
  constructor() {
    this.terrain = new TerrainGen();
    this.bike    = new Bike(this.terrain);
    this.holding = false;
    this.score   = 0;
    this.coins   = 0;
    this.mult    = 1;
    this.multTimer = 0;
    this.combo   = 0;  // consecutive tricks without touching ground
    this.dist    = 0;  // metres
    this.msgs    = []; // {text, x, y, t, alpha, color}
    this.bestDist = +(localStorage.getItem('wr_best_dist') || 0);
    this.bestScore= +(localStorage.getItem('wr_best_score')|| 0);
    // Camera
    this.camX = 0;
    this.camY = 0;
    this.camZoom = 1;
    // Parallax layers
    this.skyOffset = 0;
    // Trick tracking
    this.pendingTricks = 0;
    this.wasAir = false;
    this.airFrames = 0;
    this.pendingFlips = 0;
    // Near-miss cooldown
    this.nearCD = 0;
  }

  update() {
    const b = this.bike;
    if (!b.alive) return;

    b.update(this.holding);

    this.terrain.extend(b.x);

    // Distance
    this.dist = Math.max(this.dist, Math.floor(b.x / 50));

    // Air tracking
    if (!b.onGround) {
      this.airFrames++;
      this.wasAir = true;
    }

    // Landing — score tricks
    if (b.onGround && this.wasAir) {
      this._scoreLanding();
      this.wasAir = false;
      this.airFrames = 0;
    }

    // Coins
    for (const c of this.terrain.coins) {
      if (c.taken) continue;
      if (Math.abs(c.x - b.x) < 30 && Math.abs(c.y - b.y) < 40) {
        c.taken = true;
        this.coins++;
        this.score += PTS.coin * this.mult;
        sfxCoin();
        this._msg('+' + PTS.coin, c.x, c.y, '#FFD700');
      }
    }

    // Loops
    for (const L of this.terrain.loops) {
      const dx = b.x - L.cx, dy = b.y - L.cy;
      const inside = dx*dx + dy*dy < (L.r+WHEEL_R+8)*(L.r+WHEEL_R+8);
      if (inside && !L.entered) { L.entered = true; }
      if (!inside && L.entered && !L.done) {
        L.done = true;
        const pts = PTS.loop * this.mult;
        this.score += pts;
        this._msg('LOOP! +'+pts, b.x, b.y - 60, '#ff3366');
        this.mult = Math.min(8, this.mult + 1);
        sfxTrick();
      }
    }

    // Multiplier decay (if on ground for too long without tricks)
    if (b.onGround) {
      this.multTimer++;
      if (this.multTimer > 180) {
        this.mult = Math.max(1, this.mult - 1);
        this.multTimer = 0;
      }
    } else {
      this.multTimer = 0;
    }

    // Distance milestone bonus
    const mDist = Math.floor(b.x / 500);
    if (mDist > this.lastMile) {
      this.lastMile = mDist;
      const bonus = 5;
      this.score += bonus;
      this._msg(mDist*500+'m  +'+bonus, b.x, b.y - 80, '#aaffaa');
    }

    // Messages fade
    for (const m of this.msgs) { m.t--; m.alpha = Math.min(1, m.t / 30); }
    this.msgs = this.msgs.filter(m => m.t > 0);

    // Camera — smooth follow, pan ahead slightly
    const tx = b.x - W * 0.32;
    const ty = b.y - H * 0.55;
    this.camX += (tx - this.camX) * 0.08;
    this.camY += (ty - this.camY) * 0.06;

    // Dynamic zoom: zoom out at high speed
    const speed = Math.abs(b.vx);
    const targetZoom = speed > 15 ? Math.max(0.7, 1 - (speed - 15) / 60) : 1;
    this.camZoom += (targetZoom - this.camZoom) * 0.04;
  }

  _scoreLanding() {
    const b = this.bike;
    const flips = b.flips;
    const airF  = this.airFrames;

    if (flips > 0) {
      const base = PTS.flip * flips * flips;
      const bonus = flips > 1 ? PTS.flipBonus * (flips - 1) : 0;
      const pts = (base + bonus) * this.mult;
      this.score += pts;
      const label = flips === 1 ? 'BACKFLIP' : flips === 2 ? 'DOUBLE!' : flips + 'x FLIP!!';
      this._msg(label + '  +' + pts, b.x, b.y - 70, '#ff88ff');
      sfxTrick();
      this.mult = Math.min(8, this.mult + (flips > 1 ? 2 : 1));
    } else if (airF > 40) {
      // Big air without flip
      const pts = Math.floor(airF * PTS.air * this.mult / 10);
      if (pts > 0) {
        this.score += pts;
        this._msg('BIG AIR  +'+pts, b.x, b.y - 70, '#88ffff');
      }
    }
    this.lastMile = this.lastMile || 0;
  }

  _msg(text, x, y, color='#fff') {
    this.msgs.push({text, x, y, t: 80, alpha: 1, color});
  }

  end() {
    this.bike.alive = false;
    sfxDie();
    if (this.dist > this.bestDist) { this.bestDist = this.dist; localStorage.setItem('wr_best_dist', this.dist); }
    if (this.score > this.bestScore) { this.bestScore = this.score; localStorage.setItem('wr_best_score', this.score); }
  }
}

// ─── Renderer ────────────────────────────────────────────────────────────────
function drawSky(g, skyOffset) {
  // Dark gradient sky
  const grad = cx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#050010');
  grad.addColorStop(0.6, '#12001a');
  grad.addColorStop(1, '#1a0000');
  cx.fillStyle = grad;
  cx.fillRect(0, 0, W, H);

  // Spider-web background (static, tiled)
  cx.save();
  cx.strokeStyle = 'rgba(180,0,0,0.07)';
  cx.lineWidth = 0.8;
  const webSize = 120;
  const offX = ((-g.camX * 0.05) % webSize + webSize) % webSize;
  const offY = ((-g.camY * 0.05) % webSize + webSize) % webSize;
  for (let r = -1; r < W / webSize + 2; r++) {
    for (let c = -1; c < H / webSize + 2; c++) {
      const bx = r * webSize + offX;
      const by = c * webSize + offY;
      cx.beginPath();
      cx.moveTo(bx, by);
      cx.lineTo(bx + webSize, by);
      cx.stroke();
      cx.beginPath();
      cx.moveTo(bx, by);
      cx.lineTo(bx, by + webSize);
      cx.stroke();
      // Diagonal
      cx.beginPath();
      cx.moveTo(bx, by);
      cx.lineTo(bx + webSize, by + webSize);
      cx.stroke();
      cx.beginPath();
      cx.moveTo(bx + webSize, by);
      cx.lineTo(bx, by + webSize);
      cx.stroke();
    }
  }
  cx.restore();

  // City skyline parallax
  cx.save();
  cx.fillStyle = 'rgba(20,0,0,0.9)';
  const bldX = ((-g.camX * 0.12) % 800 + 800) % 800;
  const buildings = [
    {w:60,h:180},{w:40,h:120},{w:80,h:220},{w:50,h:160},{w:90,h:260},
    {w:45,h:140},{w:70,h:200},{w:55,h:170},{w:100,h:300},{w:40,h:110},
  ];
  let bx2 = -bldX;
  for (const bd of [...buildings, ...buildings]) {
    cx.fillRect(bx2, H - bd.h - 60, bd.w - 4, bd.h);
    // Neon windows
    cx.fillStyle = 'rgba(255,50,50,0.25)';
    for (let wy = H - bd.h - 40; wy < H - 70; wy += 18) {
      for (let wx = bx2 + 6; wx < bx2 + bd.w - 10; wx += 12) {
        if (Math.random() < 0.6) cx.fillRect(wx, wy, 6, 8);
      }
    }
    cx.fillStyle = 'rgba(20,0,0,0.9)';
    bx2 += bd.w + 10;
  }
  cx.restore();
}

function drawTerrain(g) {
  const pts = g.terrain.pts;
  const camX = g.camX, camY = g.camY;

  cx.save();
  cx.scale(g.camZoom, g.camZoom);
  const ox = -camX, oy = -camY;

  // Ground fill
  cx.beginPath();
  cx.moveTo(pts[0].x + ox, H/g.camZoom + 200);
  for (const p of pts) cx.lineTo(p.x + ox, p.y + oy);
  const last = pts[pts.length-1];
  cx.lineTo(last.x + ox, H/g.camZoom + 200);
  cx.closePath();
  const grad = cx.createLinearGradient(0, 0, 0, H/g.camZoom);
  grad.addColorStop(0, '#1a0000');
  grad.addColorStop(0.5, '#0d0000');
  grad.addColorStop(1, '#000');
  cx.fillStyle = grad;
  cx.fill();

  // Neon ground line
  cx.beginPath();
  cx.moveTo(pts[0].x + ox, pts[0].y + oy);
  for (const p of pts) cx.lineTo(p.x + ox, p.y + oy);
  cx.strokeStyle = '#cc0000';
  cx.lineWidth = 3 / g.camZoom;
  cx.shadowColor = '#ff0000';
  cx.shadowBlur = 12;
  cx.stroke();

  // Grid lines on ground (road markings)
  cx.shadowBlur = 0;
  cx.strokeStyle = 'rgba(200,0,0,0.15)';
  cx.lineWidth = 1;
  const gridSpacing = 100;
  const startX = Math.floor((camX - 100) / gridSpacing) * gridSpacing;
  for (let gx = startX; gx < camX + W/g.camZoom + 100; gx += gridSpacing) {
    const gy = g.terrain.groundAt(gx);
    cx.beginPath();
    cx.moveTo(gx + ox, gy + oy);
    cx.lineTo(gx + ox, gy + oy + 40);
    cx.stroke();
  }

  // Loops
  for (const L of g.terrain.loops) {
    const lx = L.cx + ox, ly = L.cy + oy;
    if (lx < -L.r - 50 || lx > W/g.camZoom + L.r + 50) continue;
    cx.beginPath();
    cx.arc(lx, ly, L.r, 0, Math.PI*2);
    cx.strokeStyle = L.done ? '#ff8800' : '#ff2244';
    cx.lineWidth = 6 / g.camZoom;
    cx.shadowColor = L.done ? '#ff8800' : '#ff2244';
    cx.shadowBlur = 18;
    cx.stroke();
    cx.shadowBlur = 0;
    // Inner glow
    cx.beginPath();
    cx.arc(lx, ly, L.r - 3, 0, Math.PI*2);
    cx.strokeStyle = 'rgba(255,100,100,0.15)';
    cx.lineWidth = 8 / g.camZoom;
    cx.stroke();
  }

  // Coins
  for (const c of g.terrain.coins) {
    if (c.taken) continue;
    const cx2 = c.x + ox, cy2 = c.y + oy;
    if (cx2 < -40 || cx2 > W/g.camZoom + 40) continue;
    const pulse = Math.sin(Date.now()/300 + c.x*0.01) * 3;
    cx.beginPath();
    cx.arc(cx2, cy2, 10 + pulse*0.3, 0, Math.PI*2);
    cx.fillStyle = '#FFD700';
    cx.shadowColor = '#FFD700';
    cx.shadowBlur = 10;
    cx.fill();
    cx.shadowBlur = 0;
    cx.strokeStyle = '#fff8';
    cx.lineWidth = 2;
    cx.stroke();
  }

  cx.restore();
}

function drawBike(g) {
  const b = g.bike;
  const ox = -g.camX, oy = -g.camY;
  const sx = (b.x + ox) * g.camZoom;
  const sy = (b.y + oy) * g.camZoom;

  cx.save();
  cx.translate(sx, sy);
  cx.rotate(b.angle);

  const bw = BIKE_W, bh = BIKE_H, wr = WHEEL_R;

  // Exhaust glow when boosting
  if (b.boosting) {
    cx.shadowColor = '#ff6600';
    cx.shadowBlur = 20;
    cx.fillStyle = 'rgba(255,100,0,0.5)';
    cx.beginPath();
    cx.ellipse(-bw*0.5 - 10, 0, 14, 7, 0, 0, Math.PI*2);
    cx.fill();
    cx.shadowBlur = 0;
  }

  // Wheels
  const drawWheel = (wx, wy) => {
    cx.beginPath();
    cx.arc(wx, wy, wr, 0, Math.PI*2);
    cx.fillStyle = '#111';
    cx.fill();
    cx.strokeStyle = '#cc0000';
    cx.lineWidth = 4;
    cx.shadowColor = '#ff0000';
    cx.shadowBlur = 8;
    cx.stroke();
    cx.shadowBlur = 0;
    // Spokes
    cx.strokeStyle = 'rgba(200,0,0,0.6)';
    cx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + b.angle * 0.8;
      cx.beginPath();
      cx.moveTo(wx, wy);
      cx.lineTo(wx + Math.cos(a)*wr*0.85, wy + Math.sin(a)*wr*0.85);
      cx.stroke();
    }
  };
  drawWheel(-bw*0.38, bh*0.3);
  drawWheel( bw*0.38, bh*0.3);

  // Frame
  cx.strokeStyle = '#cc0000';
  cx.lineWidth = 5;
  cx.shadowColor = '#ff2222';
  cx.shadowBlur = 10;
  cx.beginPath();
  // Main frame
  cx.moveTo(-bw*0.38, bh*0.3 - wr*0.6);
  cx.lineTo(0, -bh*0.4);
  cx.lineTo(bw*0.38, bh*0.3 - wr*0.6);
  cx.moveTo(-bw*0.38, bh*0.3 - wr*0.6);
  cx.lineTo(bw*0.38, bh*0.3 - wr*0.6);
  cx.moveTo(0, -bh*0.4);
  cx.lineTo(-bw*0.08, bh*0.3 - wr*0.6);
  cx.stroke();
  cx.shadowBlur = 0;

  // Seat/body
  cx.fillStyle = '#880000';
  cx.beginPath();
  cx.ellipse(-bw*0.06, -bh*0.15, bw*0.22, bh*0.22, -0.1, 0, Math.PI*2);
  cx.fill();

  // Handlebar
  cx.strokeStyle = '#ff4444';
  cx.lineWidth = 3;
  cx.beginPath();
  cx.moveTo(bw*0.22, -bh*0.35);
  cx.lineTo(bw*0.3,  -bh*0.55);
  cx.lineTo(bw*0.42, -bh*0.45);
  cx.stroke();

  // ─ Spider-Man Rider ─
  cx.save();
  cx.translate(-bw*0.08, -bh*0.45 + b.lean * 8);
  cx.rotate(b.lean * 0.5);

  // Body / suit
  cx.fillStyle = '#cc0000';
  cx.shadowColor = '#ff0000';
  cx.shadowBlur = 6;
  // Torso (crouched, leaning forward)
  cx.beginPath();
  cx.ellipse(4, 0, 11, 16, 0.3, 0, Math.PI*2);
  cx.fill();
  // Blue shorts / legs
  cx.fillStyle = '#000088';
  cx.beginPath();
  cx.ellipse(2, 14, 9, 9, 0.1, 0, Math.PI*2);
  cx.fill();
  // Arms forward
  cx.strokeStyle = '#cc0000';
  cx.lineWidth = 5;
  cx.lineCap = 'round';
  cx.shadowBlur = 0;
  cx.beginPath();
  cx.moveTo(8, -4);
  cx.quadraticCurveTo(22, 2, 28, -6);   // right arm on handlebar
  cx.stroke();
  cx.beginPath();
  cx.moveTo(-2, -2);
  cx.quadraticCurveTo(-14, 4, -12, 10);  // left arm
  cx.stroke();
  // Legs tucked
  cx.strokeStyle = '#000088';
  cx.beginPath();
  cx.moveTo(4, 14);
  cx.quadraticCurveTo(14, 22, 20, 18);   // right leg
  cx.stroke();
  cx.beginPath();
  cx.moveTo(0, 14);
  cx.quadraticCurveTo(-8, 24, -14, 20);  // left leg
  cx.stroke();

  // Head / helmet
  cx.shadowColor = '#ff0000';
  cx.shadowBlur = 8;
  cx.fillStyle = '#cc0000';
  cx.beginPath();
  cx.arc(6, -20, 13, 0, Math.PI*2);
  cx.fill();
  // Web on mask
  cx.shadowBlur = 0;
  cx.strokeStyle = '#000';
  cx.lineWidth = 0.8;
  for (let i = 0; i < 4; i++) {
    const a = (i/4)*Math.PI - Math.PI*0.4;
    cx.beginPath();
    cx.moveTo(6, -20);
    cx.lineTo(6 + Math.cos(a)*13, -20 + Math.sin(a)*13);
    cx.stroke();
  }
  // Concentric arcs
  for (let r2 = 4; r2 <= 12; r2 += 4) {
    cx.beginPath();
    cx.arc(6, -20, r2, -Math.PI*0.9, Math.PI*0.1);
    cx.stroke();
  }
  // Eyes (white lens)
  cx.fillStyle = '#ffffff';
  cx.shadowColor = '#ffffff';
  cx.shadowBlur = 6;
  cx.beginPath();
  cx.ellipse(2, -22, 5, 4, -0.3, 0, Math.PI*2);
  cx.fill();
  cx.beginPath();
  cx.ellipse(11, -22, 5, 4, 0.3, 0, Math.PI*2);
  cx.fill();
  cx.shadowBlur = 0;

  cx.restore();
  cx.restore();
}

function drawHUD(g) {
  const b = g.bike;

  // Score box — top left
  cx.fillStyle = 'rgba(0,0,0,0.55)';
  cx.beginPath();
  cx.roundRect(10, 10, 220, 90, 10);
  cx.fill();
  cx.strokeStyle = '#cc0000';
  cx.lineWidth = 2;
  cx.stroke();

  cx.fillStyle = '#fff';
  cx.font = 'bold 28px "Arial Black", Arial';
  cx.fillText(g.score.toLocaleString(), 20, 44);
  cx.font = '14px Arial';
  cx.fillStyle = '#aaa';
  cx.fillText(g.dist + ' m', 20, 62);
  cx.fillText('Coins: ' + g.coins, 20, 78);
  cx.fillText('Best: ' + g.bestScore.toLocaleString(), 120, 44);

  // Multiplier badge
  if (g.mult > 1) {
    const mx = W - 90, my = 14;
    cx.fillStyle = 'rgba(200,0,0,0.85)';
    cx.beginPath();
    cx.roundRect(mx, my, 76, 44, 8);
    cx.fill();
    cx.fillStyle = '#fff';
    cx.font = 'bold 26px "Arial Black", Arial';
    cx.fillText('x' + g.mult, mx + 10, my + 32);
  }

  // Floating score messages
  for (const m of g.msgs) {
    const mx2 = (m.x - g.camX) * g.camZoom;
    const my2 = (m.y - g.camY - 20) * g.camZoom;
    cx.globalAlpha = m.alpha;
    cx.fillStyle = m.color;
    cx.font = 'bold 20px "Arial Black", Arial';
    cx.shadowColor = '#000';
    cx.shadowBlur = 4;
    cx.fillText(m.text, mx2, my2 - (80 - m.t));
    cx.shadowBlur = 0;
    cx.globalAlpha = 1;
  }

  // Speed bar — bottom
  const speed = Math.abs(b.vx);
  const barW = Math.min(W * 0.4, 300);
  const barX = (W - barW) / 2;
  const barY = H - 22;
  cx.fillStyle = 'rgba(0,0,0,0.5)';
  cx.beginPath();
  cx.roundRect(barX, barY, barW, 10, 5);
  cx.fill();
  const fill = Math.min(1, speed / (BOOST * 1.8));
  const barColor = fill > 0.8 ? '#ff0000' : fill > 0.5 ? '#ff8800' : '#cc0000';
  cx.fillStyle = barColor;
  cx.shadowColor = barColor;
  cx.shadowBlur = 8;
  cx.beginPath();
  cx.roundRect(barX, barY, barW * fill, 10, 5);
  cx.fill();
  cx.shadowBlur = 0;

  // Mute button
  cx.fillStyle = 'rgba(0,0,0,0.5)';
  cx.beginPath();
  cx.roundRect(W - 50, H - 50, 40, 40, 8);
  cx.fill();
  cx.fillStyle = '#fff';
  cx.font = '22px Arial';
  cx.fillText(muted ? '🔇' : '🔊', W - 44, H - 20);
}

function drawMenu() {
  // Full overlay
  cx.fillStyle = 'rgba(5,0,0,0.88)';
  cx.fillRect(0, 0, W, H);

  // Web background
  cx.strokeStyle = 'rgba(180,0,0,0.1)';
  cx.lineWidth = 1;
  for (let r = 30; r < Math.max(W,H)*0.9; r += 60) {
    cx.beginPath();
    cx.arc(W/2, H*0.35, r, 0, Math.PI*2);
    cx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const a = (i/8)*Math.PI*2;
    cx.beginPath();
    cx.moveTo(W/2, H*0.35);
    cx.lineTo(W/2 + Math.cos(a)*Math.max(W,H), H*0.35 + Math.sin(a)*Math.max(W,H));
    cx.stroke();
  }

  // Title
  cx.fillStyle = '#cc0000';
  cx.shadowColor = '#ff0000';
  cx.shadowBlur = 30;
  cx.font = 'bold 72px "Arial Black", Arial';
  cx.textAlign = 'center';
  cx.fillText('WEB RIDER', W/2, H * 0.28);
  cx.shadowBlur = 0;
  cx.fillStyle = '#fff';
  cx.font = '22px Arial';
  cx.fillText('One-touch motorcycle trick game', W/2, H*0.36);

  // Records
  const bDist = localStorage.getItem('wr_best_dist') || 0;
  const bScr  = localStorage.getItem('wr_best_score') || 0;
  cx.fillStyle = '#888';
  cx.font = '18px Arial';
  cx.fillText('Best: ' + (+bScr).toLocaleString() + ' pts  |  ' + bDist + ' m', W/2, H*0.43);

  // Big tap button
  const bw = 280, bh = 64, bx = W/2 - bw/2, by = H*0.55;
  cx.fillStyle = '#cc0000';
  cx.shadowColor = '#ff0000';
  cx.shadowBlur = 20;
  cx.beginPath();
  cx.roundRect(bx, by, bw, bh, 14);
  cx.fill();
  cx.shadowBlur = 0;
  cx.fillStyle = '#fff';
  cx.font = 'bold 28px "Arial Black", Arial';
  cx.fillText('TAP TO RIDE', W/2, by + 42);

  // How to play
  cx.fillStyle = '#666';
  cx.font = '16px Arial';
  cx.fillText('HOLD to accelerate & flip back   |   RELEASE to stop spin', W/2, H*0.72);
  cx.fillText('Land wheels-down!   Chains tricks for x8 multiplier', W/2, H*0.77);
  cx.textAlign = 'left';
}

function drawDeadScreen(g) {
  cx.fillStyle = 'rgba(0,0,0,0.75)';
  cx.fillRect(0, 0, W, H);

  const rank = g.score >= 600 ? 'S' : g.score >= 300 ? 'A' : g.score >= 150 ? 'B' : g.score >= 60 ? 'C' : 'D';
  const rankColor = rank === 'S' ? '#FFD700' : rank === 'A' ? '#FF8800' : rank === 'B' ? '#00FF88' : '#aaaaaa';

  cx.textAlign = 'center';

  cx.fillStyle = '#cc0000';
  cx.shadowColor = '#ff0000';
  cx.shadowBlur = 20;
  cx.font = 'bold 52px "Arial Black", Arial';
  cx.fillText('WIPED OUT', W/2, H*0.22);
  cx.shadowBlur = 0;

  // Stats box
  cx.fillStyle = 'rgba(20,0,0,0.85)';
  cx.beginPath();
  cx.roundRect(W/2 - 180, H*0.3, 360, 240, 14);
  cx.fill();
  cx.strokeStyle = '#cc0000';
  cx.lineWidth = 2;
  cx.stroke();

  const lines = [
    ['SCORE', g.score.toLocaleString()],
    ['DISTANCE', g.dist + ' m'],
    ['COINS', g.coins.toString()],
    ['MAX MULT', 'x' + g.mult],
    ['BEST SCORE', g.bestScore.toLocaleString()],
    ['BEST DIST', g.bestDist + ' m'],
  ];
  cx.font = '16px Arial';
  cx.fillStyle = '#888';
  lines.forEach(([label, val], i) => {
    const ly = H*0.35 + i * 36;
    cx.fillStyle = '#888';
    cx.textAlign = 'left';
    cx.fillText(label, W/2 - 160, ly);
    cx.fillStyle = '#fff';
    cx.textAlign = 'right';
    cx.fillText(val, W/2 + 160, ly);
  });

  // Rank
  cx.textAlign = 'center';
  cx.fillStyle = rankColor;
  cx.shadowColor = rankColor;
  cx.shadowBlur = 16;
  cx.font = 'bold 64px "Arial Black", Arial';
  cx.fillText(rank, W/2, H*0.7);
  cx.shadowBlur = 0;

  // Buttons
  const btnY = H*0.78;
  cx.fillStyle = '#cc0000';
  cx.shadowColor = '#ff0000';
  cx.shadowBlur = 12;
  cx.beginPath();
  cx.roundRect(W/2 - 150, btnY, 140, 52, 10);
  cx.fill();
  cx.fillStyle = '#fff';
  cx.font = 'bold 22px "Arial Black", Arial';
  cx.fillText('RETRY', W/2 - 80, btnY + 34);

  cx.fillStyle = '#333';
  cx.shadowBlur = 0;
  cx.beginPath();
  cx.roundRect(W/2 + 10, btnY, 140, 52, 10);
  cx.fill();
  cx.strokeStyle = '#666';
  cx.lineWidth = 2;
  cx.stroke();
  cx.fillStyle = '#fff';
  cx.fillText('MENU', W/2 + 80, btnY + 34);

  cx.textAlign = 'left';
}

// ─── Main loop ───────────────────────────────────────────────────────────────
let game = null;

function startGame() {
  game = new Game();
  game.lastMile = 0;
  state = ST.PLAY;
}

function frame() {
  cx.clearRect(0, 0, W, H);

  if (state === ST.MENU) {
    drawSky({camX:0, camY:0, camZoom:1});
    drawMenu();
  } else if (state === ST.PLAY || state === ST.PAUSE) {
    if (state === ST.PLAY) game.update();
    if (game.bike && !game.bike.alive && state === ST.PLAY) {
      game.end();
      state = ST.DEAD;
    }
    drawSky(game);
    drawTerrain(game);
    drawBike(game);
    drawHUD(game);
    if (state === ST.PAUSE) {
      cx.fillStyle = 'rgba(0,0,0,0.5)';
      cx.fillRect(0,0,W,H);
      cx.fillStyle = '#fff';
      cx.font = 'bold 42px "Arial Black", Arial';
      cx.textAlign = 'center';
      cx.fillText('PAUSED', W/2, H/2);
      cx.textAlign = 'left';
    }
  } else if (state === ST.DEAD) {
    drawSky(game);
    drawTerrain(game);
    drawBike(game);
    drawDeadScreen(game);
  }

  requestAnimationFrame(frame);
}

// ─── Input ───────────────────────────────────────────────────────────────────
function onDown(ex, ey) {
  initAudio();

  if (state === ST.MENU) {
    startGame();
    return;
  }
  if (state === ST.DEAD) {
    // Check retry / menu buttons
    const btnY = H * 0.78;
    if (ey > btnY && ey < btnY + 52) {
      if (ex < W/2) { startGame(); return; }
      else { state = ST.MENU; return; }
    }
    return;
  }
  if (state === ST.PLAY) {
    // Mute button
    if (ex > W - 55 && ey > H - 55) {
      muted = !muted;
      return;
    }
    game.holding = true;
    sfxBoost();
  }
}

function onUp() {
  if (game) game.holding = false;
}

// Touch
cv.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.touches[0];
  onDown(t.clientX, t.clientY);
}, {passive: false});

cv.addEventListener('touchend', e => {
  e.preventDefault();
  onUp();
}, {passive: false});

// Mouse
cv.addEventListener('mousedown', e => onDown(e.clientX, e.clientY));
cv.addEventListener('mouseup', onUp);

// Keyboard
window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowRight') {
    e.preventDefault();
    onDown(W/4, H/2);
  }
  if (e.code === 'Escape' && state === ST.PLAY) state = ST.PAUSE;
  else if (e.code === 'Escape' && state === ST.PAUSE) state = ST.PLAY;
});
window.addEventListener('keyup', e => {
  if (e.code === 'Space' || e.code === 'ArrowRight') onUp();
});

// ─── Boot ────────────────────────────────────────────────────────────────────
frame();

})();
