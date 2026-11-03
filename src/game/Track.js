// Track geometry. A track is a closed polygon whose corners are rounded with
// circular arcs (fillets), resampled every ~10px. Everything the game needs
// (surface, barriers, racing line, AI speed profile) is derived from that.
// Pure math - no Phaser dependency, so it can be tested in Node.

const TAU = Math.PI * 2;
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

function filletPath(verts, warnings) {
  const n = verts.length;
  const arcs = [];
  const tans = [];
  for (let i = 0; i < n; i++) {
    const P = verts[(i - 1 + n) % n];
    const V = verts[i];
    const N = verts[(i + 1) % n];
    let ax = V[0] - P[0];
    let ay = V[1] - P[1];
    const al = Math.hypot(ax, ay);
    ax /= al;
    ay /= al;
    let bx = N[0] - V[0];
    let by = N[1] - V[1];
    const bl = Math.hypot(bx, by);
    bx /= bl;
    by /= bl;
    const phi = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
    const r = V[2];
    const t = r * Math.tan(Math.abs(phi) / 2);
    tans.push({ t, al, bl });
    const sx = V[0] - ax * t;
    const sy = V[1] - ay * t;
    const sg = Math.sign(phi) || 1;
    const cx = sx - sg * ay * r;
    const cy = sy + sg * ax * r;
    const a0 = Math.atan2(sy - cy, sx - cx);
    const steps = Math.max(2, Math.ceil((Math.abs(phi) * r) / 5));
    const pts = [];
    for (let k = 0; k <= steps; k++) {
      const a = a0 + phi * (k / steps);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    arcs.push(pts);
  }
  for (let i = 0; i < n; i++) {
    const next = tans[(i + 1) % n];
    if (tans[i].t + next.t > tans[i].bl) warnings.push(`corner ${i}/${(i + 1) % n} fillets overlap`);
  }
  const out = [arcs[0][arcs[0].length - 1]];
  for (let i = 1; i < n; i++) out.push(...arcs[i]);
  out.push(...arcs[0].slice(0, -1));
  return out;
}

function resample(pts, spacing) {
  const m = pts.length;
  const cum = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % m];
    cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const total = cum[m];
  const n = Math.round(total / spacing);
  const ds = total / n;
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const target = k * ds;
    while (cum[seg + 1] < target) seg++;
    const t = (target - cum[seg]) / (cum[seg + 1] - cum[seg] || 1);
    const a = pts[seg];
    const b = pts[(seg + 1) % m];
    xs[k] = a[0] + (b[0] - a[0]) * t;
    ys[k] = a[1] + (b[1] - a[1]) * t;
  }
  return { xs, ys, ds, total };
}

function rotateArr(arr, shift) {
  const n = arr.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = arr[(i + shift + n) % n];
  return out;
}

function smooth(arr, radius, passes = 1) {
  const n = arr.length;
  let src = arr;
  for (let p = 0; p < passes; p++) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let o = -radius; o <= radius; o++) s += src[(i + o + n) % n];
      out[i] = s / (radius * 2 + 1);
    }
    src = out;
  }
  return src;
}

function minFilter(arr, radius) {
  const n = arr.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = Infinity;
    for (let o = -radius; o <= radius; o++) m = Math.min(m, arr[(i + o + n) % n]);
    out[i] = m;
  }
  return out;
}

const CELL = 256;
export const LAKE_SHORE = 44; // default width of the beach around an infield lake

export class Track {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.warnings = [];
    const sc = def.scale;
    this.width = def.width;
    this.hw = def.width / 2;
    this.kerbW = 24;
    this.runoff = def.runoff ?? 70;
    this.barrierGap = def.barrierGap ?? 230;

    const verts = def.points.map(([x, y, r]) => [x * sc, y * sc, r * sc]);
    const dense = filletPath(verts, this.warnings);
    const { xs, ys, ds, total } = resample(dense, 10);
    const shift = Math.round((def.startOffset ?? 1000) / ds);
    this.n = xs.length;
    this.ds = ds;
    this.length = total;
    this.cx = rotateArr(xs, shift);
    this.cy = rotateArr(ys, shift);

    this.computeFrames();
    this.buildGrid();
    this.computeBarriers();
    this.computeRacingLine();
    this.computeBounds();
    this.computeCorners();
  }

  computeFrames() {
    const { n, cx, cy, ds } = this;
    this.tx = new Float32Array(n);
    this.ty = new Float32Array(n);
    this.nx = new Float32Array(n);
    this.ny = new Float32Array(n);
    this.heading = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n;
      const b = (i + 1) % n;
      let dx = cx[b] - cx[a];
      let dy = cy[b] - cy[a];
      const l = Math.hypot(dx, dy) || 1;
      dx /= l;
      dy /= l;
      this.tx[i] = dx;
      this.ty[i] = dy;
      this.nx[i] = -dy; // +normal = driver's right
      this.ny[i] = dx;
      this.heading[i] = Math.atan2(dy, dx);
    }
    // signed curvature: + = right-hand turn
    this.curv = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n;
      const b = (i + 1) % n;
      this.curv[i] = wrapAngle(this.heading[b] - this.heading[a]) / (2 * ds);
    }
    this.curvSmooth = smooth(this.curv, 6);
    // kerbs where the corner radius is under ~1600px, extended a little either side
    const raw = new Uint8Array(n);
    for (let i = 0; i < n; i++) raw[i] = Math.abs(this.curvSmooth[i]) > 1 / 1600 ? 1 : 0;
    this.kerb = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (!raw[i]) continue;
      for (let o = -8; o <= 8; o++) this.kerb[(i + o + n) % n] = 1;
    }
    // orientation: + = clockwise on screen (right turns dominate)
    let sum = 0;
    for (let i = 0; i < n; i++) sum += this.curv[i];
    this.orientation = Math.sign(sum) || 1;
  }

  buildGrid() {
    this.grid = new Map();
    for (let i = 0; i < this.n; i++) {
      const k = this.cellKey(Math.floor(this.cx[i] / CELL), Math.floor(this.cy[i] / CELL));
      let list = this.grid.get(k);
      if (!list) this.grid.set(k, (list = []));
      list.push(i);
    }
  }

  cellKey(gx, gy) {
    return (gx + 2048) * 4096 + (gy + 2048);
  }

  forEachNear(x, y, radius, fn) {
    const r = Math.ceil(radius / CELL);
    const gx = Math.floor(x / CELL);
    const gy = Math.floor(y / CELL);
    for (let ox = -r; ox <= r; ox++) {
      for (let oy = -r; oy <= r; oy++) {
        const list = this.grid.get(this.cellKey(gx + ox, gy + oy));
        if (list) for (const i of list) fn(i);
      }
    }
  }

  // Nearest centreline sample to (x, y) within `radius`, or -1.
  nearestWithin(x, y, radius) {
    let best = -1;
    let bd = radius * radius;
    this.forEachNear(x, y, radius, (i) => {
      const dx = x - this.cx[i];
      const dy = y - this.cy[i];
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  nearestGlobal(x, y) {
    let i = this.nearestWithin(x, y, 700);
    if (i >= 0) return i;
    let bd = Infinity;
    for (let k = 0; k < this.n; k++) {
      const dx = x - this.cx[k];
      const dy = y - this.cy[k];
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        i = k;
      }
    }
    return i;
  }

  // Nearest sample, searching locally around `hint` (the car's previous sample).
  nearest(x, y, hint) {
    const { n, cx, cy } = this;
    if (hint >= 0) {
      let best = -1;
      let bd = Infinity;
      for (let o = -14; o <= 32; o++) {
        const i = (hint + o + n) % n;
        const dx = x - cx[i];
        const dy = y - cy[i];
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      const lim = this.maxBarrier + 150;
      if (bd < lim * lim) return best;
    }
    return this.nearestGlobal(x, y);
  }

  lateral(i, x, y) {
    return (x - this.cx[i]) * this.nx[i] + (y - this.cy[i]) * this.ny[i];
  }

  along(i, x, y) {
    return (x - this.cx[i]) * this.tx[i] + (y - this.cy[i]) * this.ty[i];
  }

  // World point at track distance s (may be negative) and lateral offset.
  pointAt(s, lat) {
    const { n, ds } = this;
    const f = (((s / ds) % n) + n) % n;
    const i = Math.floor(f);
    const j = (i + 1) % n;
    const t = f - i;
    const x = this.cx[i] + (this.cx[j] - this.cx[i]) * t;
    const y = this.cy[i] + (this.cy[j] - this.cy[i]) * t;
    return { x: x + this.nx[i] * lat, y: y + this.ny[i] * lat, heading: this.heading[i], i };
  }

  barrierAt(i, side) {
    return side > 0 ? this.bR[i] : this.bL[i];
  }

  surfaceAt(i, lat) {
    const d = Math.abs(lat);
    if (d <= this.hw) return 'road';
    if (d <= this.hw + this.kerbW && this.kerb[i]) return 'kerb';
    if (d <= this.hw + this.runoff) return 'runoff';
    return 'grass';
  }

  computeBarriers() {
    const { n, cx, cy, nx, ny, hw, ds } = this;
    const def = hw + this.barrierGap;
    const bL = new Float32Array(n).fill(def);
    const bR = new Float32Array(n).fill(def);
    const R = def * 2 + 60;
    const minSep = Math.ceil((2.2 * def) / ds);
    for (let i = 0; i < n; i++) {
      this.forEachNear(cx[i], cy[i], R, (j) => {
        let sep = Math.abs(i - j);
        sep = Math.min(sep, n - sep);
        if (sep < minSep) return;
        const vx = cx[j] - cx[i];
        const vy = cy[j] - cy[i];
        const lat = vx * nx[i] + vy * ny[i];
        if (Math.abs(lat) < 1) return;
        const bmax = (vx * vx + vy * vy) / (2 * Math.abs(lat));
        if (lat > 0) bR[i] = Math.min(bR[i], bmax);
        else bL[i] = Math.min(bL[i], bmax);
      });
      // inside of a corner: keep the wall inside the turning radius so it never folds
      const k = this.curv[i];
      if (Math.abs(k) > 1e-6) {
        const lim = 0.92 / Math.abs(k);
        if (k > 0) bR[i] = Math.min(bR[i], lim);
        else bL[i] = Math.min(bL[i], lim);
      }
    }
    const minB = hw + this.runoff + 20;
    const fin = (arr) => {
      const s = smooth(minFilter(arr, 8), 8);
      for (let i = 0; i < n; i++) {
        if (s[i] < minB + 10) this.tight = true;
        s[i] = Math.max(minB, s[i]);
      }
      return s;
    };
    this.bL = fin(bL);
    this.bR = fin(bR);
    if (this.tight) this.warnings.push('some barriers squeezed close to the road (sections too close together)');
    let mx = 0;
    for (let i = 0; i < n; i++) mx = Math.max(mx, this.bL[i], this.bR[i]);
    this.maxBarrier = mx;
  }

  computeRacingLine() {
    const { n, cx, cy, nx, ny } = this;
    const lim = this.hw - 42;
    const off = new Float32Array(n);
    const passes = [
      [16, 160],
      [8, 160],
      [4, 120],
      [2, 80],
    ];
    for (const [step, iters] of passes) {
      for (let it = 0; it < iters; it++) {
        for (let i = 0; i < n; i++) {
          const a = (i - step + n) % n;
          const b = (i + step) % n;
          const mx = (cx[a] + nx[a] * off[a] + cx[b] + nx[b] * off[b]) * 0.5;
          const my = (cy[a] + ny[a] * off[a] + cy[b] + ny[b] * off[b]) * 0.5;
          let t = (mx - cx[i]) * nx[i] + (my - cy[i]) * ny[i];
          if (t > lim) t = lim;
          else if (t < -lim) t = -lim;
          off[i] += (t - off[i]) * 0.6;
        }
      }
    }
    this.line = smooth(off, 3);
    this.lx = new Float32Array(n);
    this.ly = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.lx[i] = cx[i] + nx[i] * this.line[i];
      this.ly[i] = cy[i] + ny[i] * this.line[i];
    }
    // curvature along the racing line
    const hd = new Float32Array(n);
    this.lineDs = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const b = (i + 1) % n;
      hd[i] = Math.atan2(this.ly[b] - this.ly[i], this.lx[b] - this.lx[i]);
      this.lineDs[i] = Math.hypot(this.lx[b] - this.lx[i], this.ly[b] - this.ly[i]);
    }
    const k = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n;
      k[i] = wrapAngle(hd[i] - hd[a]) / Math.max(1, (this.lineDs[i] + this.lineDs[a]) * 0.5);
    }
    this.lineCurv = smooth(k, 4, 2);
  }

  // Max speed at every sample for a car with the given lateral grip and braking.
  speedProfile(aLat, decel, cap = 3000) {
    const { n } = this;
    const v = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const k = Math.abs(this.lineCurv[i]);
      v[i] = k < 1e-6 ? cap : Math.min(cap, Math.sqrt(aLat / k));
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let i = n - 1; i >= 0; i--) {
        const j = (i + 1) % n;
        const lim = Math.sqrt(v[j] * v[j] + 2 * decel * this.lineDs[i]);
        if (lim < v[i]) v[i] = lim;
      }
    }
    return v;
  }

  computeBounds() {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < this.n; i++) {
      x0 = Math.min(x0, this.cx[i]);
      x1 = Math.max(x1, this.cx[i]);
      y0 = Math.min(y0, this.cy[i]);
      y1 = Math.max(y1, this.cy[i]);
    }
    const m = this.maxBarrier + 1100;
    this.bounds = { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m };
    this.core = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // Is (x, y) inside the closed centreline loop? (even-odd rule)
  insideLoop(x, y) {
    const { n, cx, cy } = this;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      if (cy[i] > y !== cy[j] > y && x < ((cx[j] - cx[i]) * (y - cy[i])) / (cy[j] - cy[i]) + cx[i]) inside = !inside;
    }
    return inside;
  }

  // The infield's outline at least `dist` px from the centreline, as a smoothed
  // closed polygon [[x, y], ...]. Where the offset curve would fold over itself
  // (tight concave bends) its points are dropped, which leaves a clean outline.
  // `keep(x, y)` can drop more points before smoothing.
  insetLoop(dist, step = 3, keep = null) {
    const side = this.orientation; // the inside of the loop is on the side the track mostly turns to
    let pts = [];
    for (let i = 0; i < this.n; i += step) {
      const x = this.cx[i] + this.nx[i] * side * dist;
      const y = this.cy[i] + this.ny[i] * side * dist;
      if (this.nearestWithin(x, y, dist - 4) < 0 && (!keep || keep(x, y))) pts.push([x, y]);
    }
    if (pts.length < 12) return [];
    for (let pass = 0; pass < 3; pass++) {
      const m = pts.length;
      pts = pts.map((_, k) => {
        let sx = 0;
        let sy = 0;
        for (let o = -3; o <= 3; o++) {
          const p = pts[(k + o + m) % m];
          sx += p[0];
          sy += p[1];
        }
        return [sx / 7, sy / 7];
      });
    }
    return pts;
  }

  // Waterline of the infield lake (tracks with `lake` in their definition), `extra` px
  // further in; negative values give rings out on the shore.
  lakeRing(extra = 0) {
    if (!this.def.lake) return [];
    this.lakeCache ||= new Map();
    if (!this.lakeCache.has(extra)) {
      const dist = this.hw + this.barrierGap + this.def.lake.margin + extra;
      let keep = null;
      if (extra < 0) {
        // shore rings only hug the water, so they don't run off into narrow gaps between sections
        const water = this.lakeRing(0);
        const lim = (-extra + 40) ** 2;
        keep = (x, y) => water.some(([wx, wy]) => (wx - x) ** 2 + (wy - y) ** 2 < lim);
      }
      this.lakeCache.set(extra, this.insetLoop(dist, 3, keep));
    }
    return this.lakeCache.get(extra);
  }

  // True if (x, y) with radius `rad` touches the lake or its shore.
  inLake(x, y, rad = 0) {
    const lake = this.def.lake;
    if (!lake) return false;
    const ring = this.lakeRing(-(lake.shore ?? LAKE_SHORE));
    if (ring.length < 3) return false;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    const r2 = rad * rad;
    return inside || ring.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 < r2);
  }

  // Corner apexes (local curvature maxima) used for scenery and signs.
  computeCorners() {
    const { n } = this;
    const k = this.curvSmooth;
    this.corners = [];
    for (let i = 0; i < n; i++) {
      const a = Math.abs(k[i]);
      if (a < 1 / 1100) continue;
      let isMax = true;
      for (let o = -25; o <= 25 && isMax; o++) if (o && Math.abs(k[(i + o + n) % n]) > a) isMax = false;
      if (isMax) this.corners.push({ i, dir: Math.sign(k[i]), radius: 1 / a });
    }
    // start of each corner (where curvature begins) for warning signs
    for (const c of this.corners) {
      let j = c.i;
      for (let s = 0; s < 120; s++) {
        const p = (j - 1 + n) % n;
        if (Math.abs(this.curv[p]) < 1 / 4000) break;
        j = p;
      }
      c.entry = j;
    }
  }
}

// Grid slot k (0 = pole): distance behind the start line and lateral offset.
export function gridSlot(track, k) {
  return { s: -150 - k * 72, lat: (k % 2 === 0 ? -1 : 1) * track.hw * 0.42 };
}
