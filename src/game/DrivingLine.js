// Dynamic driving line (as in modern racing games): chevrons along the racing
// line ahead of the player. Each chevron's colour comes from projecting the
// car's speed forward - green = accelerate, yellow = hold / lift, red = brake.
import { DEPTH } from './TrackRenderer.js';
import { GeoLayer, webglAvailable } from './Geometry.js';

const AHEAD = 2100; // px of line shown in front of the car
const EVERY = 4; // samples between chevrons (~40px)
const GREEN = [47, 227, 90];
const YELLOW = [255, 211, 26];
const RED = [255, 59, 59];

function mix(u) {
  const [a, b, f] = u < 0.5 ? [GREEN, YELLOW, u * 2] : [YELLOW, RED, (u - 0.5) * 2];
  const r = Math.round(a[0] + (b[0] - a[0]) * f);
  const g = Math.round(a[1] + (b[1] - a[1]) * f);
  const bl = Math.round(a[2] + (b[2] - a[2]) * f);
  return (r << 16) | (g << 8) | bl;
}

export class DrivingLine {
  constructor(scene, track, guide) {
    this.track = track;
    this.guide = guide;
    this.mode = 'full';
    // rebuilt every frame: a small GPU buffer on WebGL, a Graphics on Canvas
    if (webglAvailable(scene)) {
      this.layer = new GeoLayer(scene, DEPTH.rubber + 0.2, { mode: 'dynamic' });
      this.g = this.layer.rec;
    } else {
      this.g = scene.add.graphics().setDepth(DEPTH.rubber + 0.2);
    }
    this.u = new Float32Array(Math.ceil(AHEAD / track.ds) + EVERY + 2);
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'off') this.clear();
  }

  // Projected speed at each sample ahead -> colour value u (0 green .. 1 red).
  project(car) {
    const t = this.track;
    const { n, ds } = t;
    const prof = this.guide.profile;
    const st = car.stats;
    const top = st.topSpeed;
    const u = this.u;
    let vp = Math.max(0, car.speed);
    for (let k = 0; k < u.length; k++) {
      const j = (car.idx + k) % n;
      const r = vp / top;
      const acc = st.accel * 0.85 * Math.max(0, 1 - r * r);
      const vFree = Math.sqrt(vp * vp + 2 * acc * ds);
      const lim = prof[j];
      if (vFree <= lim) {
        u[k] = vFree < top * 0.97 ? 0 : 0.12;
        vp = vFree;
      } else if (vp > lim + 0.5) {
        const decel = (vp * vp - lim * lim) / (2 * ds);
        u[k] = 0.62 + 0.38 * Math.min(1, decel / (st.brake * 0.45));
        vp = lim;
      } else {
        u[k] = 0.5;
        vp = lim;
      }
    }
  }

  clear() {
    if (this.layer) this.layer.clear();
    else this.g.clear();
  }

  update(car, show = true) {
    this.clear();
    if (this.mode === 'off' || !car || !show) return;
    const t = this.track;
    const { n, ds, lx, ly } = t;
    this.project(car);
    const u = this.u;
    const braking = this.mode === 'braking';
    const first = Math.ceil((car.idx + 70 / ds) / EVERY) * EVERY; // fixed to the track, starts ahead of the nose
    const count = Math.floor(AHEAD / (EVERY * ds));
    for (let c = 0; c < count; c++) {
      const kk = first + c * EVERY - car.idx;
      if (kk + EVERY >= u.length) break;
      // a chevron shows the most urgent colour of the samples it covers
      let v = u[kk];
      for (let m = 1; m < EVERY; m++) v = Math.max(v, u[kk + m]);
      if (braking && v < 0.55) continue;
      const dist = kk * ds;
      let alpha = Math.min(1, (dist - 60) / 120) * Math.min(1, (AHEAD - dist) / 500);
      if (alpha <= 0.02) continue;
      alpha *= 0.85;
      const j = (first + c * EVERY) % n;
      const j2 = (j + 1) % n;
      let tx = lx[j2] - lx[j];
      let ty = ly[j2] - ly[j];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l;
      ty /= l;
      this.chevron(lx[j] + 3, ly[j] + 4, tx, ty, 0x000000, alpha * 0.3);
      this.chevron(lx[j], ly[j], tx, ty, mix(v), alpha);
    }
  }

  chevron(x, y, tx, ty, color, alpha) {
    const g = this.g;
    const nx = -ty;
    const ny = tx;
    const W = 15;
    const tipX = x + tx * 10;
    const tipY = y + ty * 10;
    const notchX = x - tx * 2;
    const notchY = y - ty * 2;
    const r1x = x - tx * 6 + nx * W;
    const r1y = y - ty * 6 + ny * W;
    const r2x = x - tx * 14 + nx * W;
    const r2y = y - ty * 14 + ny * W;
    const l1x = x - tx * 6 - nx * W;
    const l1y = y - ty * 6 - ny * W;
    const l2x = x - tx * 14 - nx * W;
    const l2y = y - ty * 14 - ny * W;
    g.fillStyle(color, alpha);
    g.fillTriangle(tipX, tipY, r1x, r1y, r2x, r2y);
    g.fillTriangle(tipX, tipY, r2x, r2y, notchX, notchY);
    g.fillTriangle(tipX, tipY, notchX, notchY, l2x, l2y);
    g.fillTriangle(tipX, tipY, l2x, l2y, l1x, l1y);
  }
}
