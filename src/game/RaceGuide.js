// Driving assists: the player's own speed profile along the racing line, corner
// "pace notes" (number, direction, severity, advised speed) and the
// per-corner "too fast" warning. Pure logic (no Phaser) so it can be tested in Node.

const STRAIGHT = 1 / 4000; // |curvature| below this counts as straight

// Speed profile for a car with these stats: corner limit from lateral grip and
// braking zones from a slightly conservative deceleration (leaves a margin).
export function guideProfile(track, st) {
  return track.speedProfile(st.aLat * (1 + st.aero * 0.6), st.brake * 0.72, st.topSpeed * 1.05);
}

// Groups the track's corner apexes into whole corners and describes each one.
export function cornerNotes(track, profile, topSpeed) {
  const { n, curv, ds } = track;
  const wrap = (i) => ((i % n) + n) % n;
  const regions = new Map();
  for (const c of track.corners) {
    const sameDir = (i) => Math.abs(curv[i]) >= STRAIGHT && Math.sign(curv[i]) === c.dir;
    let entry = c.i;
    for (let s = 0; s < 200 && sameDir(wrap(entry - 1)); s++) entry = wrap(entry - 1);
    let exit = c.i;
    for (let s = 0; s < 200 && sameDir(wrap(exit + 1)); s++) exit = wrap(exit + 1);
    const prev = regions.get(entry);
    if (!prev || c.radius < prev.radius) regions.set(entry, { entry, exit, dir: c.dir, radius: c.radius, apex: c.i });
  }

  const notes = [...regions.values()].sort((a, b) => a.entry - b.entry);
  for (const c of notes) {
    const len = wrap(c.exit - c.entry) + 1;
    let angle = 0;
    for (let k = 0; k < len; k++) angle += Math.abs(curv[wrap(c.entry + k)]) * ds;
    // slowest point (the racing line's apex can sit a little outside the arc)
    let vMin = Infinity;
    let minIdx = c.apex;
    for (let k = -10; k < len + 10; k++) {
      const i = wrap(c.entry + k);
      if (profile[i] < vMin) {
        vMin = profile[i];
        minIdx = i;
      }
    }
    // braking starts where the profile tops out when walking back from the apex
    // (over the flat mid-corner part and small dips, then up the braking slope)
    let brakeIdx = minIdx;
    let peak = vMin;
    for (let s = 1, p = minIdx; s < 500; s++) {
      p = wrap(p - 1);
      const v = profile[p];
      if (v > peak) {
        peak = v;
        brakeIdx = p;
      }
      if (v >= topSpeed * 1.04 || v < peak - Math.max(15, peak * 0.06)) break;
    }
    const r = vMin / topSpeed;
    const deg = (angle * 180) / Math.PI;
    let sev = r > 0.9 ? 'FLAT' : r > 0.7 ? 'FAST' : r > 0.55 ? 'MEDIUM' : r > 0.33 ? 'SLOW' : 'TIGHT';
    if (deg > 140 && r <= 0.55) sev = 'HAIRPIN';
    Object.assign(c, {
      angle: deg,
      vMin,
      minIdx,
      brakeIdx,
      sev,
      shape: deg < 65 ? 'kink' : deg < 135 ? 'turn' : 'hairpin',
      brakes: r < 0.85,
    });
  }
  notes.forEach((c, k) => (c.num = k + 1));
  return notes;
}

export class RaceGuide {
  constructor(track, stats) {
    this.track = track;
    this.stats = stats;
    this.top = stats.topSpeed;
    this.profile = guideProfile(track, stats);
    this.notes = cornerNotes(track, this.profile, stats.topSpeed);
    this.advice = { corner: null, then: 0, dist: 0, inside: false, warn: false, target: 0 };
    this.over = 0; // consecutive frames over the advised speed
  }

  ahead(from, to) {
    const n = this.track.n;
    return (((to - from) % n) + n) % n;
  }

  // Next corner for a car at sample i: the first whose slowest point is still ahead.
  nextCorner(i) {
    let best = null;
    let bd = Infinity;
    for (const c of this.notes) {
      const d = this.ahead(i, c.minIdx);
      if (d > 0 && d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  update(car) {
    const a = this.advice;
    const t = this.track;
    const i = car.idx < 0 ? 0 : car.idx;
    const c = this.nextCorner(i);
    if (c !== a.corner) {
      a.warn = false;
      this.over = 0;
    }
    a.corner = c;
    if (!c) return a;
    const toEntry = this.ahead(i, c.entry);
    a.inside = toEntry > this.ahead(i, c.minIdx);
    a.dist = a.inside ? 0 : toEntry * t.ds;
    a.target = c.vMin;
    // a second corner straight after this one ("left into right")
    const k = this.notes.indexOf(c);
    const nx = this.notes[(k + 1) % this.notes.length];
    a.then = nx !== c && this.ahead(c.exit, nx.entry) < 70 && this.ahead(i, nx.entry) > 0 ? nx.dir : 0;

    // "too fast" warning: needs a sustained overspeed, then stays on until the
    // corner is done, so the card changes at most once per corner
    const allowed = this.profile[(i + 2) % t.n];
    this.over = car.speed > allowed + (a.inside ? 45 : 25) ? this.over + 1 : 0;
    if (this.over >= 12) a.warn = true;
    return a;
  }
}
