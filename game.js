const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let W, H;
function resize() {
  const d = devicePixelRatio || 1;
  W = innerWidth; H = innerHeight;
  cv.width = W * d; cv.height = H * d;
  ctx.setTransform(d, 0, 0, d, 0, 0);
}
addEventListener('resize', resize); resize();

const G = 1600, ACCEL = 900, MAX_V = 950, FRICTION = 0.35, SPIN = 7, TAU = Math.PI * 2;
const groundY = x => {
  const k = Math.min(1 + x / 15000, 2.2); // terrain gets wilder with distance
  return 80 * Math.sin(x * .004) + k * (40 * Math.sin(x * .011 + 1) + 22 * Math.sin(x * .023 + 2));
};
const slope = x => (groundY(x + 1) - groundY(x - 1)) / 2;
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

let s, holding = false, best = +localStorage.getItem('best') || 0;
function reset() {
  const y = groundY(0);
  s = { x: 0, y, v: 250, vx: 250, vy: 0, a: Math.atan(slope(0)), grounded: true, spin: 0,
        bonus: 0, dead: false, started: false, deadAt: 0, camY: y - H * .6, msg: '', msgT: 0 };
}
reset();
const score = () => Math.floor(s.x / 40) + s.bonus;

function press() {
  if (s.dead) { if (performance.now() - s.deadAt > 600) reset(); return; }
  s.started = true; holding = true;
}
const release = () => holding = false;
cv.addEventListener('pointerdown', e => { e.preventDefault(); press(); });
addEventListener('pointerup', release);
addEventListener('pointercancel', release);
addEventListener('keydown', e => { if (e.code === 'Space' && !e.repeat) press(); });
addEventListener('keyup', e => { if (e.code === 'Space') release(); });

function crash() {
  s.dead = true; s.deadAt = performance.now(); holding = false;
  const sc = score();
  if (sc > best) { best = sc; localStorage.setItem('best', best); }
  if (navigator.vibrate) navigator.vibrate(150);
}

function step(dt) {
  if (!s.started || s.dead) return;
  s.msgT -= dt;
  if (s.grounded) {
    const th = Math.atan(slope(s.x));
    s.v += G * Math.sin(th) * dt;
    if (holding) s.v += ACCEL * dt;
    s.v -= s.v * FRICTION * dt;
    s.v = Math.max(80, Math.min(MAX_V, s.v));
    s.vx = s.v * Math.cos(th); s.vy = s.v * Math.sin(th);
    const nx = s.x + s.vx * dt;
    const yBall = s.y + s.vy * dt + 0.5 * G * dt * dt;
    const gy = groundY(nx);
    s.x = nx;
    if (gy > yBall) { // ground drops away faster than gravity -> airborne
      s.grounded = false; s.y = yBall; s.vy += G * dt; s.spin = 0;
    } else { s.y = gy; s.a = Math.atan(slope(s.x)); }
  } else {
    s.vy += G * dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (holding) { s.a -= SPIN * dt; s.spin -= SPIN * dt; } // backflip
    const gy = groundY(s.x);
    if (s.y >= gy) {
      s.y = gy;
      const th = Math.atan(slope(s.x));
      if (Math.abs(angDiff(s.a, th)) < 0.9) {
        s.grounded = true;
        s.v = s.vx * Math.cos(th) + s.vy * Math.sin(th);
        s.a = th;
        const f = Math.round(Math.abs(s.spin) / TAU);
        if (f > 0) {
          const pts = f * f * 25;
          s.bonus += pts;
          s.msg = (f > 1 ? f + 'x FLIP! +' : 'FLIP! +') + pts;
          s.msgT = 1.2;
        }
      } else crash();
    }
  }
}

function trace(cx, cy) {
  ctx.beginPath();
  for (let sx = -20; sx <= W + 20; sx += 6) {
    const y = groundY(sx + cx) - cy;
    sx === -20 ? ctx.moveTo(sx, y) : ctx.lineTo(sx, y);
  }
}

function draw() {
  const camX = s.x - W * .3;
  s.camY += ((s.y - H * .6) - s.camY) * .08;
  const cy = s.camY, hue = (s.x / 15) % 360;

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a0a1a'); g.addColorStop(1, `hsl(${hue},60%,12%)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  trace(camX, cy); ctx.lineTo(W + 20, H + 20); ctx.lineTo(-20, H + 20); ctx.closePath();
  ctx.fillStyle = '#05050d'; ctx.fill();
  trace(camX, cy);
  ctx.strokeStyle = `hsl(${hue},100%,60%)`; ctx.lineWidth = 4;
  ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 15; ctx.stroke();

  // bike
  ctx.save(); ctx.translate(s.x - camX, s.y - cy); ctx.rotate(s.a);
  const col = s.dead ? '#f33' : '#fff';
  ctx.strokeStyle = col; ctx.shadowColor = col; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(-18, -10, 10, 0, TAU); ctx.moveTo(28, -10); ctx.arc(18, -10, 10, 0, TAU); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-18, -10); ctx.lineTo(-4, -24); ctx.lineTo(18, -10);
  ctx.moveTo(-4, -24); ctx.lineTo(12, -26);
  ctx.moveTo(-4, -24); ctx.lineTo(-6, -36);
  ctx.stroke();
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(-5, -42, 6, 0, TAU); ctx.fill();
  ctx.restore(); ctx.shadowBlur = 0;

  // HUD
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.font = 'bold 48px system-ui'; ctx.fillText(score(), W / 2, 70);
  ctx.font = '16px system-ui'; ctx.fillText('BEST ' + best, W / 2, 96);
  if (s.msgT > 0) {
    ctx.font = 'bold 28px system-ui'; ctx.fillStyle = `hsl(${hue},100%,70%)`;
    ctx.fillText(s.msg, W / 2, H * .3);
  }
  ctx.fillStyle = '#fff'; ctx.font = '20px system-ui';
  if (!s.started) ctx.fillText('Hold to ride · Hold in the air to flip', W / 2, H * .8);
  if (s.dead) {
    ctx.font = 'bold 36px system-ui'; ctx.fillText('CRASHED', W / 2, H * .4);
    ctx.font = '20px system-ui'; ctx.fillText('Tap to retry', W / 2, H * .4 + 34);
  }
}

let last = performance.now();
function loop(t) {
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  for (let i = 0; i < 4; i++) step(dt / 4);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
