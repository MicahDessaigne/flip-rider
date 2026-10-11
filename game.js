// ==========================================
// RIDER PWA: ENHANCED CYBERPUNK PHYSICS ENGINE
// ==========================================

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

let W = innerWidth;
let H = innerHeight;
let dpr = window.devicePixelRatio || 1;

function resize() {
  dpr = window.devicePixelRatio || 1;
  W = innerWidth;
  H = innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------
// SYNTHETIC SOUND ENGINE (Pure Web Audio)
// ------------------------------------------
class SoundFX {
  constructor() {
    this.ctx = null;
  }
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
  playEngine(speedRatio) {
    if (!this.ctx) return;
    // Engine sound is generated via subtle oscillator modulation
  }
  flipPing(count) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const freq = 520 + count * 180;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, this.ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }
  gem() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(980, this.ctx.currentTime);
    osc.frequency.setValueAtTime(1310, this.ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.26);
  }
  land() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.11);
  }
  crash() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, this.ctx.currentTime);
    filter.frequency.linearRampToValueAtTime(100, this.ctx.currentTime + 0.35);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.38);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start();
  }
}
const sfx = new SoundFX();

// ------------------------------------------
// PROCEDURAL STITCHED TRACK GENERATOR
// ------------------------------------------
class TrackSegment {
  constructor(p1, p2, type = 'line', cp1 = null, cp2 = null) {
    this.p1 = p1; // {x, y}
    this.p2 = p2;
    this.type = type; // 'line' | 'bezier'
    this.cp1 = cp1;
    this.cp2 = cp2;
    this.length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }
}

class TrackManager {
  constructor() {
    this.segments = [];
    this.gems = [];
    this.lastEnd = { x: -300, y: 400 };
    this.generatedUpToX = -300;
  }

  reset() {
    this.segments = [];
    this.gems = [];
    this.lastEnd = { x: -400, y: 400 };
    this.generatedUpToX = -400;

    // Runway spawn pad
    this.addStraight(800, 0);
    this.extend(2000);
  }

  addSegment(p2, type = 'line', cp1 = null, cp2 = null) {
    const seg = new TrackSegment({ ...this.lastEnd }, p2, type, cp1, cp2);
    this.segments.push(seg);
    this.lastEnd = { ...p2 };
    this.generatedUpToX = p2.x;
  }

  addStraight(length, angleRad = 0) {
    const end = {
      x: this.lastEnd.x + Math.cos(angleRad) * length,
      y: this.lastEnd.y + Math.sin(angleRad) * length
    };
    this.addSegment(end, 'line');
  }

  addBezier(dx, dy, c1x, c1y, c2x, c2y) {
    const start = this.lastEnd;
    const end = { x: start.x + dx, y: start.y + dy };
    const cp1 = { x: start.x + c1x, y: start.y + c1y };
    const cp2 = { x: start.x + c2x, y: start.y + c2y };
    this.addSegment(end, 'bezier', cp1, cp2);
  }

  spawnGem(x, y) {
    this.gems.push({ x, y, collected: false, pulse: Math.random() * 6 });
  }

  extend(targetX) {
    while (this.generatedUpToX < targetX) {
      const choice = Math.random();

      if (choice < 0.28) {
        // Roll & Hill (gentle roller-coaster wave)
        const len = 450 + Math.random() * 300;
        const depth = 80 + Math.random() * 110;
        this.addBezier(len, 0, len * 0.35, depth, len * 0.65, -depth);
        this.spawnGem(this.lastEnd.x - len * 0.5, this.lastEnd.y - depth * 0.6);
      } else if (choice < 0.52) {
        // Launch Ramp + Chasm Gap (Jump)
        const rampLen = 300 + Math.random() * 150;
        const rampUp = -(120 + Math.random() * 80);
        this.addBezier(rampLen, rampUp, rampLen * 0.4, 0, rampLen * 0.8, rampUp);

        // Gap into air
        const gapSize = 160 + Math.random() * 120;
        const dropDown = 80 + Math.random() * 140;
        
        // Spawn gem arc in mid-air
        for (let i = 1; i <= 3; i++) {
          this.spawnGem(this.lastEnd.x + (gapSize * i) / 4, this.lastEnd.y - 60 + i * 15);
        }

        // Catch ramp after gap
        this.lastEnd = { x: this.lastEnd.x + gapSize, y: this.lastEnd.y + dropDown };
        this.addStraight(220, 0.25);
      } else if (choice < 0.76) {
        // Neon Loop-the-Loop
        const r = 160 + Math.random() * 50;
        const loopStart = { ...this.lastEnd };
        
        // Entry into loop
        this.addBezier(r * 1.1, -r * 0.4, r * 0.6, 0, r * 0.9, -r * 0.2);
        // Peak of loop
        this.addBezier(0, -r * 1.5, -r * 0.5, -r * 0.6, 0, -r * 1.2);
        // Descent loop exit
        this.addBezier(r * 1.2, r * 1.9, r * 0.5, -r * 0.4, r * 0.8, r * 1.2);
        
        this.spawnGem(loopStart.x + r * 0.7, loopStart.y - r * 1.4);
      } else {
        // Speed Flat with Neon Speed Bump
        const flat = 250 + Math.random() * 200;
        this.addStraight(flat, 0.05);
        this.spawnGem(this.lastEnd.x - flat * 0.5, this.lastEnd.y - 30);
      }
    }

    // Prune segments that are far behind player to keep 60 FPS
    const cutoffX = targetX - 3500;
    this.segments = this.segments.filter(s => Math.max(s.p1.x, s.p2.x) > cutoffX);
    this.gems = this.gems.filter(g => g.x > cutoffX && !g.collected);
  }

  // Find track altitude and surface normal at specific coordinate X
  sampleAt(x) {
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const s = this.segments[i];
      const minX = Math.min(s.p1.x, s.p2.x);
      const maxX = Math.max(s.p1.x, s.p2.x);

      if (x >= minX - 1 && x <= maxX + 1) {
        if (s.type === 'line') {
          const ratio = (x - s.p1.x) / (s.p2.x - s.p1.x || 1);
          const y = s.p1.y + ratio * (s.p2.y - s.p1.y);
          const dx = s.p2.x - s.p1.x;
          const dy = s.p2.y - s.p1.y;
          const angle = Math.atan2(dy, dx);
          return { y, angle, dx, dy, valid: true };
        } else if (s.type === 'bezier') {
          // Accurate 10-step Bezier numeric probe
          let bestT = 0.5;
          let minDiff = Infinity;
          for (let step = 0; step <= 20; step++) {
            const t = step / 20;
            const it = 1 - t;
            const bx = it*it*it*s.p1.x + 3*it*it*t*s.cp1.x + 3*it*t*t*s.cp2.x + t*t*t*s.p2.x;
            const diff = Math.abs(bx - x);
            if (diff < minDiff) { minDiff = diff; bestT = t; }
          }
          const t = bestT;
          const it = 1 - t;
          const y = it*it*it*s.p1.y + 3*it*it*t*s.cp1.y + 3*it*t*t*s.cp2.y + t*t*t*s.p2.y;
          const dxdt = 3*it*it*(s.cp1.x - s.p1.x) + 6*it*t*(s.cp2.x - s.cp1.x) + 3*t*t*(s.p2.x - s.cp2.x);
          const dydt = 3*it*it*(s.cp1.y - s.p1.y) + 6*it*t*(s.cp2.y - s.cp1.y) + 3*t*t*(s.p2.y - s.cp2.y);
          const angle = Math.atan2(dydt, dxdt);
          return { y, angle, dx: dxdt, dy: dydt, valid: true };
        }
      }
    }
    return { y: 20000, angle: 0, dx: 1, dy: 0, valid: false }; // Abyss gap
  }
}

// ------------------------------------------
// PARTICLES & SPECIAL EFFECTS
// ------------------------------------------
class ParticleSystem {
  constructor() {
    this.particles = [];
  }
  emitSpark(x, y, vx, vy, color) {
    this.particles.push({
      x, y,
      vx: vx + (Math.random() - 0.5) * 120,
      vy: vy + (Math.random() - 0.5) * 120,
      life: 0.35 + Math.random() * 0.25,
      maxLife: 0.5,
      size: 2.5 + Math.random() * 3,
      color
    });
  }
  emitExplosion(x, y, color) {
    for (let i = 0; i < 45; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 340;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.6 + Math.random() * 0.5,
        maxLife: 1.0,
        size: 3 + Math.random() * 4,
        color
      });
    }
  }
  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 400 * dt; // gravity on sparks
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }
  draw(ctx, camX, camY) {
    ctx.save();
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x - camX, p.y - camY, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ------------------------------------------
// PLAYER BIKE WITH 2-WHEEL RAYCAST PHYSICS
// ------------------------------------------
class Bike {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = 0;
    this.y = 380;
    this.vx = 250;
    this.vy = 0;
    this.angle = 0;
    this.angularVel = 0;
    this.wheelDist = 42; // Distance between front & back wheels
    this.radius = 12;

    this.grounded = true;
    this.isDead = false;
    this.started = false;

    this.flips = 0;
    this.airTime = 0;
    this.rotationAccumulator = 0;
    this.combo = 1;
    this.gemsCollected = 0;
  }

  getRearPos() {
    const half = this.wheelDist / 2;
    return {
      x: this.x - Math.cos(this.angle) * half,
      y: this.y - Math.sin(this.angle) * half
    };
  }

  getFrontPos() {
    const half = this.wheelDist / 2;
    return {
      x: this.x + Math.cos(this.angle) * half,
      y: this.y + Math.sin(this.angle) * half
    };
  }

  update(dt, holding, track, particles, onFlip, onCrash) {
    if (!this.started || this.isDead) return;

    const GRAV = 1450;
    const ACCEL = 880;
    const MAX_SPEED = 1050;
    const FLIP_TORQUE = 9.8; // Snappy neon backflip speed

    const rear = this.getRearPos();
    const front = this.getFrontPos();

    const rearSample = track.sampleAt(rear.x);
    const frontSample = track.sampleAt(front.x);

    const rearGroundY = rearSample.y - this.radius;
    const frontGroundY = frontSample.y - this.radius;

    const rearContact = rear.y >= rearGroundY - 4 && rearSample.valid;
    const frontContact = front.y >= frontGroundY - 4 && frontSample.valid;

    // Check if player fell into the kill-zone void
    if (this.y > 1400) {
      this.isDead = true;
      sfx.crash();
      onCrash('FELL INTO THE VOID');
      return;
    }

    if (rearContact || frontContact) {
      // ON GROUND
      if (!this.grounded) {
        // Landing event
        sfx.land();
        this.grounded = true;

        // Process flip scoring
        const fullSpins = Math.floor(Math.abs(this.rotationAccumulator) / (Math.PI * 1.9));
        if (fullSpins > 0) {
          const pts = fullSpins * 100 * this.combo;
          this.combo++;
          onFlip(fullSpins, pts);
          for (let k = 0; k < 15; k++) {
            particles.emitSpark(this.x, this.y, this.vx * 0.4, -120, '#00ffff');
          }
        }
        this.rotationAccumulator = 0;
      }

      // Calculate track angle from wheels
      const targetAngle = Math.atan2(frontGroundY - rearGroundY, this.wheelDist);
      const angleErr = Math.atan2(Math.sin(targetAngle - this.angle), Math.cos(targetAngle - this.angle));

      // CRASH CONDITION: upside down landing
      if (Math.abs(angleErr) > 1.25) {
        this.isDead = true;
        sfx.crash();
        particles.emitExplosion(this.x, this.y, '#ff0055');
        onCrash('HEAD CRASH');
        return;
      }

      // Snap alignment to terrain
      this.angle += angleErr * Math.min(1, 16 * dt);
      this.angularVel = 0;

      // Forward drive acceleration along the slope
      let forward = holding ? ACCEL : 0;
      // Gravity component pushing down the slope
      const slopeForce = GRAV * Math.sin(this.angle);

      let forwardSpeed = Math.hypot(this.vx, this.vy);
      if (Math.cos(this.angle) * this.vx < 0) forwardSpeed = -forwardSpeed;

      forwardSpeed += (forward + slopeForce) * dt;
      forwardSpeed -= forwardSpeed * 0.18 * dt; // Rolling friction
      forwardSpeed = Math.max(120, Math.min(MAX_SPEED, forwardSpeed));

      this.vx = Math.cos(this.angle) * forwardSpeed;
      this.vy = Math.sin(this.angle) * forwardSpeed;

      // Follow track contour
      this.x += this.vx * dt;
      const curTrack = track.sampleAt(this.x);
      this.y = curTrack.y - this.radius - 2;

      // Exhaust sparks when holding boost
      if (holding && Math.random() < 0.6) {
        particles.emitSpark(rear.x, rear.y, -this.vx * 0.4, -50, '#ff00aa');
      }

      // Launch off ramps
      if (curTrack.dy < -20 && this.vx > 450) {
        // High momentum ramp exit
        this.grounded = false;
        this.vy -= 120;
      }
    } else {
      // IN AIR
      this.grounded = false;
      this.vy += GRAV * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Mid-Air Backflip Mechanic
      if (holding) {
        this.angularVel = -FLIP_TORQUE;
        // Jet thruster trail while backflipping in air
        particles.emitSpark(rear.x, rear.y, -this.vx * 0.2, 50, '#00ffff');
      } else {
        this.angularVel *= 0.94; // Air resistance damping
      }

      const deltaRot = this.angularVel * dt;
      this.angle += deltaRot;
      this.rotationAccumulator += deltaRot;

      // Sound ding for every completed 360 in the air
      const currentSpins = Math.floor(Math.abs(this.rotationAccumulator) / (Math.PI * 2));
      if (currentSpins > this.flips) {
        this.flips = currentSpins;
        sfx.flipPing(this.flips);
      }
    }

    // Check Gem Pickups
    for (const gem of track.gems) {
      if (!gem.collected && Math.hypot(gem.x - this.x, gem.y - this.y) < 38) {
        gem.collected = true;
        this.gemsCollected++;
        sfx.gem();
        particles.emitExplosion(gem.x, gem.y, '#00ffcc');
      }
    }
  }

  draw(ctx, camX, camY, neonColor) {
    ctx.save();
    ctx.translate(this.x - camX, this.y - camY);
    ctx.rotate(this.angle);

    const half = this.wheelDist / 2;
    const mainColor = this.isDead ? '#ff1744' : neonColor;

    ctx.shadowColor = mainColor;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = mainColor;
    ctx.fillStyle = mainColor;
    ctx.lineWidth = 3.5;

    // Glowing Neon Wheels
    ctx.beginPath();
    ctx.arc(-half, 0, this.radius, 0, Math.PI * 2);
    ctx.arc(half, 0, this.radius, 0, Math.PI * 2);
    ctx.stroke();

    // Wheel hubs
    ctx.beginPath();
    ctx.arc(-half, 0, 3, 0, Math.PI * 2);
    ctx.arc(half, 0, 3, 0, Math.PI  2);
    ctx.fill();

    // Futuristic Rider Cyber-Chassis
    ctx.beginPath();
    ctx.moveTo(-half, 0);
    ctx.lineTo(-6, -14);
    ctx.lineTo(12, -14);
    ctx.lineTo(half, 0);
    ctx.lineTo(-4, -4);
    ctx.closePath();
    ctx.stroke();

    // Neon Cockpit Glow
    ctx.fillStyle = '#ffffff';
    ctx.shadowCo
