// Live lap delta: records the time at every BUCKET px of the lap and compares
// the current lap against the best one (this race or a saved personal best).
const BUCKET = 200;

export class LapDelta {
  // ref: { time, splits } from the save file, or null
  constructor(track, ref) {
    this.L = track.length;
    this.n = Math.ceil(this.L / BUCKET);
    this.ref = ref && ref.splits?.length === this.n ? ref : null;
    this.cur = [];
    this.lap = -1;
    this.delta = null;
  }

  update(car, raceTime) {
    const lap = car.lapsDone;
    if (lap !== this.lap) {
      this.lap = lap;
      this.cur = [];
    }
    const d = car.dist - lap * this.L;
    const t = raceTime - car.lapStart;
    while (this.cur.length < this.n && d >= this.cur.length * BUCKET) this.cur.push(t);
    const ref = this.ref;
    if (!ref || d < 0 || car.finished) {
      this.delta = null;
      return null;
    }
    const k = Math.min(this.n - 1, Math.floor(d / BUCKET));
    const r0 = ref.splits[k];
    const r1 = k + 1 < this.n ? ref.splits[k + 1] : ref.time;
    const f = Math.min(1, (d - k * BUCKET) / (Math.min(this.L, (k + 1) * BUCKET) - k * BUCKET));
    this.delta = t - (r0 + (r1 - r0) * f);
    return this.delta;
  }

  // Call when the car completes a lap. Returns the delta to the previous best
  // (negative = faster), or null if there was no reference yet.
  completeLap(lapTime) {
    const prev = this.ref;
    const gap = prev ? lapTime - prev.time : null;
    const cur = this.cur;
    // the last bucket or two can be crossed in the same frame as the line
    if (cur.length >= this.n - 3 && cur.length > 0) {
      const k0 = cur.length - 1;
      const d0 = k0 * BUCKET;
      for (let k = cur.length; k < this.n; k++) cur.push(cur[k0] + ((lapTime - cur[k0]) * (k * BUCKET - d0)) / (this.L - d0));
    }
    const complete = cur.length === this.n && cur[0] < 2;
    if (complete && (!prev || lapTime < prev.time)) {
      this.ref = { time: lapTime, splits: this.cur.map((v) => Math.round(v * 1000) / 1000) };
      this.improved = true;
    }
    this.cur = [];
    return gap;
  }
}
