// Race rules and simulation: grid, start lights, car/wall/car collisions,
// lap counting, standings, slipstream, respawns and results.
// Pure logic (no Phaser) so whole races can be simulated in Node.
import { Car } from './Car.js';
import { AIDriver } from './AIDriver.js';
import { DriftScore } from './DriftScore.js';
import { gridSlot, wrapAngle } from './Track.js';
import { AI_COLORS, AI_DRIVERS, CAR_RADIUS, DIFFICULTIES, computeStats } from '../config.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function colorDist(a, b) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

const approach = (v, t, s) => (v < t ? Math.min(t, v + s) : Math.max(t, v - s));

export class RaceManager {
  // opts: { mode: 'race'|'attract', laps, opponents, autopilot, player: {name, color, upgrades}, seed }
  // opts.difficulty overrides the track's own difficulty (dev/sim only).
  constructor(track, opts, hooks = {}) {
    this.track = track;
    this.opts = opts;
    this.hooks = hooks;
    this.attract = opts.mode === 'attract';
    this.laps = this.attract ? Infinity : opts.laps;
    this.difficulty = DIFFICULTIES[opts.difficulty] ? opts.difficulty : track.def.difficulty;
    this.diff = DIFFICULTIES[this.difficulty];
    this.rand = rng(opts.seed ?? (Math.random() * 1e9) | 0);
    this.cars = [];
    this.drivers = new Map();
    this.clock = 0;
    this.time = 0;
    this.state = this.attract ? 'racing' : 'lights';
    this.lights = 0;
    this.goAt = 4.2 + 0.6 + this.rand() * 1.0;
    this.finishedCount = 0;
    this.gasDownAt = -1; // when the player last pressed the gas (launch timing)
    this.launchDone = false;
    this.player = null;
    this.overtakes = 0;
    this.drift = new DriftScore();
    this.wrongWay = false;
    this.wrongTime = 0;
    this.setupCars();
  }

  setupCars() {
    const { track, opts, rand } = this;
    const nAI = this.attract ? 7 : opts.opponents;
    const playerColor = opts.player?.color || '#e63946';
    const colors = [...AI_COLORS].sort((a, b) => colorDist(b, playerColor) - colorDist(a, playerColor));
    const pool = colors.slice(0, Math.max(nAI, 8)).sort(() => rand() - 0.5);
    const names = [...AI_DRIVERS].sort(() => rand() - 0.5);

    const ais = [];
    for (let k = 0; k < nAI; k++) {
      const lvl = Math.max(0, Math.min(5, this.diff.aiLevel + (rand() - 0.5)));
      const stats = computeStats({ engine: lvl, turbo: lvl, tires: lvl, brakes: lvl, aero: lvl });
      const car = new Car({ id: `ai${k}`, name: names[k % names.length], color: pool[k % pool.length], stats });
      const skill = this.attract ? 0.9 + rand() * 0.06 : this.diff.skill * (0.965 + rand() * 0.05);
      ais.push({ car, skill });
    }
    ais.sort((a, b) => b.skill - a.skill);

    let order = ais.map((a) => a.car);
    if (!this.attract) {
      const p = opts.player;
      const stats = computeStats(p.upgrades);
      this.player = new Car({ id: 'player', name: p.name || 'Player', color: p.color, stats, isPlayer: true });
      const slot = Math.min(order.length, Math.floor((order.length + 1) * 0.55));
      order.splice(slot, 0, this.player);
    }

    order.forEach((car, k) => {
      const slot = gridSlot(track, k);
      const pt = track.pointAt(slot.s, slot.lat);
      car.place(pt.x, pt.y, pt.heading);
      car.idx = pt.i;
      car.lat = slot.lat;
      car.s = (slot.s + track.length) % track.length;
      car.dist = slot.s;
      this.cars.push(car);
    });

    for (const { car, skill } of ais) {
      this.drivers.set(
        car,
        new AIDriver(car, track, {
          skill,
          lineOffset: (rand() - 0.5) * 40,
          wobble: (1 - skill) * 60,
          seed: rand() * 100,
        })
      );
    }
    if (this.player) {
      this.drivers.set(this.player, new AIDriver(this.player, track, { skill: 0.97, seed: 7 }));
    }
    this.cars.forEach((c, k) => (c.position = k + 1));
    this.bestPos = this.player ? this.player.position : 0;
    this.updateStandings();
  }

  get racing() {
    return this.state !== 'lights';
  }

  update(dt, playerCtl) {
    this.clock += dt;
    if (this.state === 'lights') {
      this.watchLaunch(playerCtl);
      this.updateLights();
      for (const car of this.cars) car.throttle = car.isPlayer ? playerCtl.throttle : 0;
      return;
    }
    this.time += dt;
    this.watchLaunch(playerCtl);

    for (const car of this.cars) {
      const ai = this.drivers.get(car);
      let ctl;
      if (car.isPlayer && !car.finished && !this.opts.autopilot) ctl = playerCtl;
      else ctl = ai.control(dt, this.cars, this.clock);
      if (car.finished && car.isPlayer) ctl.throttle *= 0.6; // cool-down lap
      car.wallHit = 0;
      car.step(dt, ctl);
    }

    for (const car of this.cars) this.trackCar(car);
    this.collideCars();
    for (const car of this.cars) {
      this.collideWall(car);
      this.updateLaps(car);
      this.updateStuck(car, dt);
    }
    this.updateSlipstream(dt);
    this.updateStandings();
    this.updateRubberBand();
    if (this.player) {
      this.updateWrongWay(dt);
      if (!this.player.finished) {
        const ev = this.drift.update(dt, this.player);
        if (ev) this.hooks.onDrift?.(ev, this.drift);
      }
    }

    if (this.state === 'cooldown') {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        this.state = 'done';
        this.hooks.onResults?.(this.results());
      }
    }
  }

  updateLights() {
    const t = this.clock;
    const lit = t < 1 ? 0 : Math.min(5, Math.floor((t - 1) / 0.8) + 1);
    if (lit !== this.lights) {
      this.lights = lit;
      this.hooks.onLight?.(lit);
    }
    if (t >= this.goAt) {
      this.state = 'racing';
      this.lights = 0;
      this.hooks.onGo?.();
    }
  }

  // Perfect start: press the gas as the lights go out. It rewards reacting, not
  // holding the pedal through the countdown (lights-out timing is random).
  watchLaunch(ctl) {
    const p = this.player;
    if (!p || this.launchDone || this.opts.autopilot) return;
    if (ctl.throttle > 0 && p.throttle === 0) this.gasDownAt = this.clock;
    if (this.state !== 'racing') return;
    const late = this.clock - this.goAt;
    if (ctl.throttle > 0 && this.gasDownAt >= this.goAt - 0.1 && late <= 0.35) {
      this.launchDone = true;
      p.boost = 1.2;
      this.hooks.onPerfectStart?.();
    } else if (late > 0.35) {
      this.launchDone = true;
    }
  }

  trackCar(car) {
    const t = this.track;
    const L = t.length;
    car.idx = t.nearest(car.x, car.y, car.idx);
    car.lat = t.lateral(car.idx, car.x, car.y);
    const s = (car.idx * t.ds + t.along(car.idx, car.x, car.y) + L) % L;
    let d = s - car.s;
    if (d > L / 2) d -= L;
    else if (d < -L / 2) d += L;
    car.s = s;
    car.dist += d;
    car.surface = t.surfaceAt(car.idx, car.lat);
  }

  collideWall(car) {
    const t = this.track;
    const i = car.idx;
    const lat = t.lateral(i, car.x, car.y);
    const side = lat >= 0 ? 1 : -1;
    const limit = t.barrierAt(i, side) - 26;
    if (Math.abs(lat) <= limit) return;
    const nx = t.nx[i] * side;
    const ny = t.ny[i] * side;
    const push = Math.abs(lat) - limit;
    car.x -= nx * push;
    car.y -= ny * push;
    car.lat = side * limit;
    const vn = car.vx * nx + car.vy * ny;
    if (vn > 0) {
      // a glancing scrape slides along the barrier keeping most of its speed; a
      // square hit bounces off harder and costs a lot more
      const bounce = vn < 150 ? 1.1 : 1.35;
      car.vx -= nx * vn * bounce;
      car.vy -= ny * vn * bounce;
      const loss = Math.min(0.5, (vn / 1400) * Math.min(1, vn / 400));
      car.vx *= 1 - loss;
      car.vy *= 1 - loss;
      const err = wrapAngle(t.heading[i] - car.heading);
      if (Math.abs(err) < 1.7) car.heading += err * Math.min(0.35, vn / 1000);
      car.wallHit = vn;
      if (vn > 70) this.hooks.onImpact?.(car, vn, car.x + nx * 30, car.y + ny * 30);
    }
  }

  collideCars() {
    const cars = this.cars;
    const R2 = CAR_RADIUS * 2;
    for (let a = 0; a < cars.length; a++) {
      const A = cars[a];
      if (A.ghost > 0) continue;
      for (let b = a + 1; b < cars.length; b++) {
        const B = cars[b];
        if (B.ghost > 0) continue;
        const dx0 = B.x - A.x;
        const dy0 = B.y - A.y;
        if (dx0 * dx0 + dy0 * dy0 > 120 * 120) continue;
        for (const ca of A.circles()) {
          for (const cb of B.circles()) {
            const dx = cb[0] - ca[0];
            const dy = cb[1] - ca[1];
            const d = Math.hypot(dx, dy);
            if (d >= R2 || d < 0.001) continue;
            const nx = dx / d;
            const ny = dy / d;
            // the heavier car (the player's) moves less on contact
            const wa = B.mass / (A.mass + B.mass);
            const wb = 1 - wa;
            const pen = R2 - d;
            A.x -= nx * pen * wa;
            A.y -= ny * pen * wa;
            B.x += nx * pen * wb;
            B.y += ny * pen * wb;
            const vrel = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
            if (vrel < 0) {
              const j = -1.3 * vrel;
              A.vx -= nx * j * wa;
              A.vy -= ny * j * wa;
              B.vx += nx * j * wb;
              B.vy += ny * j * wb;
              if (-vrel > 90) this.hooks.onBump?.(A, B, -vrel, (ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2);
            }
          }
        }
      }
    }
  }

  updateLaps(car) {
    if (car.finished) return;
    const L = this.track.length;
    const done = Math.max(0, Math.floor(car.dist / L));
    if (done <= car.lapsDone) return;
    const lapTime = this.time - car.lapStart;
    car.lapStart = this.time;
    car.lapsDone = done;
    car.lastLap = lapTime;
    if (!car.bestLap || lapTime < car.bestLap) car.bestLap = lapTime;
    this.hooks.onLap?.(car, lapTime);
    if (done >= this.laps) {
      car.finished = true;
      car.finishTime = this.time;
      car.finishPos = ++this.finishedCount;
      this.hooks.onFinish?.(car);
      if (car.isPlayer) {
        this.state = 'cooldown';
        this.cooldown = 3;
      }
    } else if (car.isPlayer && done === this.laps - 1) {
      this.hooks.onFinalLap?.();
    }
  }

  updateStuck(car, dt) {
    const blocked = car.wallHit > 0 || car.surface === 'grass' || car.throttle > 0 || car.speed < -5;
    if (Math.abs(car.speed) < 30 && blocked) car.stuckTime += dt;
    else car.stuckTime = Math.max(0, car.stuckTime - dt * 2);
    if (car.stuckTime > 2.6) this.respawn(car);
  }

  respawn(car) {
    const t = this.track;
    const i = car.idx;
    const pt = t.pointAt(i * t.ds, t.line[i] * 0.5);
    car.place(pt.x, pt.y, pt.heading);
    car.ghost = 2;
    car.stuckTime = 0;
    this.trackCar(car);
    this.hooks.onRespawn?.(car);
  }

  updateSlipstream(dt) {
    for (const a of this.cars) {
      let target = 0;
      if (a.speed > 300) {
        const fx = Math.cos(a.heading);
        const fy = Math.sin(a.heading);
        for (const b of this.cars) {
          if (b === a || b.speed < 300) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const along = dx * fx + dy * fy;
          if (along < 70 || along > 300) continue;
          const side = Math.abs(-dx * fy + dy * fx);
          if (side > 42 || Math.abs(wrapAngle(b.heading - a.heading)) > 0.35) continue;
          target = Math.max(target, 1 - (along - 70) / 400);
        }
      }
      a.slipstream = approach(a.slipstream, target, dt * (target > a.slipstream ? 1.2 : 2.5));
    }
  }

  updateStandings() {
    const order = [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishPos - b.finishPos;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.dist - a.dist;
    });
    order.forEach((c, k) => (c.position = k + 1));
    this.order = order;
    const p = this.player;
    if (p && !p.finished && this.state === 'racing' && p.position < this.bestPos) {
      const gained = this.bestPos - p.position;
      this.overtakes += gained;
      this.bestPos = p.position;
      this.hooks.onOvertake?.(gained);
    }
  }

  updateRubberBand() {
    const p = this.player;
    const r = this.diff.rubber;
    for (const [car, ai] of this.drivers) {
      if (car.isPlayer) continue;
      if (!p || !r || p.finished) {
        ai.rubber = 1;
        continue;
      }
      const gap = (car.dist - p.dist) / this.track.length;
      ai.rubber = gap > 0.25 ? 1 - 0.05 * r : gap < -0.15 ? 1 + 0.04 * r : 1;
    }
  }

  updateWrongWay(dt) {
    const p = this.player;
    const t = this.track;
    const bad =
      !p.finished && Math.abs(wrapAngle(p.heading - t.heading[p.idx])) > 2.1 && p.speed > 40 && !this.opts.autopilot;
    this.wrongTime = bad ? this.wrongTime + dt : 0;
    const ww = this.wrongTime > 1;
    if (ww !== this.wrongWay) {
      this.wrongWay = ww;
      this.hooks.onWrongWay?.(ww);
    }
  }

  playerRespawn() {
    if (this.player && this.racing && !this.player.finished) this.respawn(this.player);
  }

  results() {
    const total = this.laps * this.track.length;
    const rows = this.cars.map((c) => {
      const avg = c.dist / Math.max(1, this.time);
      const time = c.finished ? c.finishTime : this.time + (total - c.dist) / Math.max(250, avg);
      return { name: c.name, color: c.color, isPlayer: c.isPlayer, time, estimated: !c.finished, bestLap: c.bestLap };
    });
    rows.sort((a, b) => a.time - b.time);
    rows.forEach((r, k) => (r.position = k + 1));
    const me = rows.find((r) => r.isPlayer);
    return {
      rows,
      position: me ? me.position : 0,
      cars: this.cars.length,
      bestLap: this.player?.bestLap || 0,
      overtakes: this.overtakes,
      drift: this.drift.total,
      bestDrift: this.drift.best,
      time: me ? me.time : 0,
    };
  }
}
