// Drift scoring for the player: points build while the car slides at speed, a
// multiplier grows the longer the drift is held, and a wall hit loses the chain.
export class DriftScore {
  constructor() {
    this.total = 0;
    this.best = 0;
    this.chain = 0;
    this.time = 0;
    this.mult = 1;
    this.grace = 0;
    this.active = false;
  }

  // Returns { points } when a drift is banked, { failed: true } when it is lost.
  update(dt, car) {
    const sliding =
      car.drifting && car.speed > 220 && Math.abs(car.slip) > 70 && car.surface !== 'grass' && car.ghost <= 0;
    if (this.active && car.wallHit > 80) {
      const lost = this.chain;
      this.reset();
      return lost > 150 ? { failed: true } : null;
    }
    if (sliding) {
      this.active = true;
      this.grace = 0.5;
      this.time += dt;
      this.mult = Math.min(5, 1 + Math.floor(this.time / 1.2));
      this.chain += Math.abs(car.slip) * (car.speed / car.stats.topSpeed) * this.mult * dt;
      return null;
    }
    if (!this.active) return null;
    this.grace -= dt;
    if (this.grace > 0) return null;
    const points = Math.round(this.chain);
    this.reset();
    if (points < 150) return null;
    this.total += points;
    this.best = Math.max(this.best, points);
    return { points };
  }

  reset() {
    this.active = false;
    this.chain = 0;
    this.time = 0;
    this.mult = 1;
  }
}
