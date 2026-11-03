// AI: follows the track's racing line toward a speed-dependent lookahead point,
// brakes using a per-car speed profile, and steps aside for slower cars.
import { wrapAngle } from './Track.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (v, t, s) => (v < t ? Math.min(t, v + s) : Math.max(t, v - s));

export class AIDriver {
  constructor(car, track, { skill = 0.95, lineOffset = 0, wobble = 0, seed = 1 } = {}) {
    this.car = car;
    this.track = track;
    this.skill = skill;
    this.lineOffset = lineOffset;
    this.wobble = wobble;
    this.phase = seed * 1.7;
    this.rubber = 1;
    this.avoidW = 0;
    this.avoidLat = 0;
    this.startLat = car.lat; // hold the grid lane for the first seconds
    this.raceTime = 0;
    this.refreshProfile();
  }

  refreshProfile() {
    const st = this.car.stats;
    this.profile = this.track.speedProfile(st.aLat * (1 + st.aero * 0.6) * 0.92, st.brake * 0.72, st.topSpeed * 1.05);
  }

  control(dt, cars, time) {
    const c = this.car;
    const t = this.track;
    const { n, length } = t;
    const i = c.idx < 0 ? 0 : c.idx;
    const sp = Math.max(0, c.speed);
    const lim = t.hw - 34;

    this.raceTime += dt;
    const look = 95 + sp * 0.3;
    const j = (i + Math.round(look / t.ds)) % n;
    let baseLat = t.line[j] * 0.92 + this.lineOffset;
    const settle = clamp((this.raceTime - 2.5) / 4, 0, 1);
    baseLat = this.startLat + (baseLat - this.startLat) * settle;
    if (this.wobble) baseLat += Math.sin(time * 0.7 + this.phase) * this.wobble;

    // traffic
    let blocker = null;
    let blockDs = Infinity;
    let side = 0;
    let follow = Infinity;
    for (const o of cars) {
      if (o === c || o.ghost > 0 || c.ghost > 0) continue;
      let ds = o.s - c.s;
      if (ds > length / 2) ds -= length;
      else if (ds < -length / 2) ds += length;
      const dl = o.lat - c.lat;
      const closing = c.speed - o.speed;
      const threat = ds < 110 || (closing > 15 && ds / closing < 1.6);
      if (ds > 0 && ds < 300 && Math.abs(dl) < 70 && threat) {
        if (ds < blockDs) {
          blockDs = ds;
          blocker = o;
        }
      }
      if (ds > -70 && ds < 150 && Math.abs(dl) < 80) side -= Math.sign(dl || 1) * (80 - Math.abs(dl));
    }
    if (blocker) {
      const roomLeft = blocker.lat + lim;
      const roomRight = lim - blocker.lat;
      const dir = roomRight > roomLeft ? 1 : -1;
      const want = blocker.lat + dir * 95;
      if (Math.abs(want) <= lim + 10 && this.raceTime > 2.5) {
        this.avoidLat = want;
        this.avoidW = approach(this.avoidW, 1, 3 * dt);
      } else {
        this.avoidW = approach(this.avoidW, 0, 2 * dt);
      }
      if (blockDs < 170) follow = blocker.speed - 15 * (1 - blockDs / 170);
    } else {
      this.avoidW = approach(this.avoidW, 0, 1.2 * dt);
    }
    let lat = baseLat + (this.avoidLat - baseLat) * this.avoidW + side * 0.8;
    lat = clamp(lat, -lim, lim);

    const tx = t.cx[j] + t.nx[j] * lat;
    const ty = t.cy[j] + t.ny[j] * lat;
    const err = wrapAngle(Math.atan2(ty - c.y, tx - c.x) - c.heading);
    let steer = clamp(err * 2.6, -1, 1);

    let target = this.profile[(i + 3) % n] * this.skill * this.rubber;
    if (follow < target && this.avoidW < 0.5) target = Math.max(follow, 120);
    let throttle = 0;
    let brake = 0;
    if (c.speed < target - 10) throttle = 1;
    else if (c.speed > target + 30) brake = clamp((c.speed - target) / 140, 0.25, 1);
    else throttle = 0.5;

    // pointing the wrong way (after a spin) - turn hard toward the track direction
    const toTrack = wrapAngle(t.heading[i] - c.heading);
    if (Math.abs(toTrack) > 1.6) {
      steer = Math.sign(toTrack);
      throttle = 0.6;
      brake = 0;
    }
    return { throttle, brake, steer };
  }
}
