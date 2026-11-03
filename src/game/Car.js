// Arcade top-down car physics. Velocity is a free 2D vector; heading turns with
// steering (limited by lateral grip), and sideways velocity bleeds off at the
// grip rate - which gives slides, skids and speed scrub in corners.
import { CAR_LENGTH, CAR_RADIUS, gearInfo } from '../config.js';

const SURFACE = {
  road: { top: 1, grip: 1, drag: 0 },
  kerb: { top: 0.97, grip: 0.85, drag: 0.05 },
  runoff: { top: 0.9, grip: 0.8, drag: 0.15 },
  grass: { top: 0.5, grip: 0.38, drag: 1.3 },
};

const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

export class Car {
  constructor({ id, name, color, stats, isPlayer = false }) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.stats = stats;
    this.isPlayer = isPlayer;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.heading = 0;
    this.prevX = 0;
    this.prevY = 0;
    this.prevHeading = 0;
    this.steer = 0;
    this.throttle = 0;
    this.brake = 0;
    this.handbrake = false;
    this.speed = 0; // forward speed (px/s)
    this.slip = 0; // sideways speed (px/s)
    this.surface = 'road';
    this.slipstream = 0;
    this.drifting = false;
    this.ghost = 0;
    // race tracking (filled by RaceManager)
    this.idx = -1;
    this.lat = 0;
    this.s = 0;
    this.dist = 0;
    this.lapsDone = 0;
    this.lapStart = 0;
    this.lastLap = 0;
    this.bestLap = 0;
    this.finished = false;
    this.finishTime = 0;
    this.position = 0;
    this.stuckTime = 0;
  }

  place(x, y, heading) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.heading = this.prevHeading = heading;
    this.vx = this.vy = 0;
    this.speed = 0;
    this.slip = 0;
    this.steer = 0;
  }

  get forwardX() {
    return Math.cos(this.heading);
  }

  get forwardY() {
    return Math.sin(this.heading);
  }

  get gear() {
    return gearInfo(this.speed, this.stats.topSpeed);
  }

  // Two collision circles along the body.
  circles() {
    const f = CAR_LENGTH * 0.25;
    const fx = Math.cos(this.heading) * f;
    const fy = Math.sin(this.heading) * f;
    return [
      [this.x + fx, this.y + fy],
      [this.x - fx, this.y - fy],
    ];
  }

  step(dt, ctl) {
    const st = this.stats;
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevHeading = this.heading;
    this.throttle = ctl.throttle;
    this.brake = ctl.brake;
    this.handbrake = !!ctl.handbrake;
    if (this.ghost > 0) this.ghost = Math.max(0, this.ghost - dt);

    // steering: quick to centre, slightly slower to lock
    const back = Math.abs(ctl.steer) < Math.abs(this.steer) || Math.sign(ctl.steer) !== Math.sign(this.steer);
    this.steer = approach(this.steer, ctl.steer, (back ? 9 : 5.5) * dt);

    const surf = SURFACE[this.surface] || SURFACE.road;
    let fx = Math.cos(this.heading);
    let fy = Math.sin(this.heading);
    let vf = this.vx * fx + this.vy * fy;
    let vr = this.vx * -fy + this.vy * fx;

    const top = st.topSpeed * surf.top * (1 + 0.07 * this.slipstream);
    if (ctl.throttle > 0 && vf >= -10) {
      const r = Math.max(0, vf) / top;
      vf += ctl.throttle * st.accel * Math.max(0, 1 - r * r) * (r < 0.2 ? 1.15 : 1) * dt;
    }
    if (ctl.brake > 0) {
      if (vf > 15) vf = Math.max(0, vf - ctl.brake * st.brake * dt);
      else vf = Math.max(-st.topSpeed * 0.22, vf - ctl.brake * 280 * dt); // reverse
    } else if (vf < 0 && ctl.throttle > 0) {
      vf = Math.min(0, vf + st.brake * dt);
    }
    // rolling resistance / engine braking / surface drag
    const drag = (ctl.throttle > 0 ? 0.04 : 0.32) + surf.drag;
    vf -= vf * drag * dt;
    if (vf > top) vf -= (vf - top) * 2.4 * dt; // e.g. running onto grass at speed

    // yaw: limited by turn rate at low speed and by lateral grip at high speed
    const sp = Math.abs(vf);
    const aLat = st.aLat * (1 + st.aero * Math.min(1, sp / st.topSpeed)) * surf.grip;
    let wMax = Math.min(st.turnRate, (aLat * 1.15) / Math.max(sp, 1));
    // drifting: the nose may rotate past what the tyres could carry, so the tail hangs out
    if (this.drifting) wMax = Math.max(wMax, st.turnRate * 0.8);
    wMax *= Math.min(1, sp / 110);
    this.heading += this.steer * wMax * (vf >= 0 ? 1 : -1) * dt;

    // rebuild velocity in the old frame, then express it in the new heading frame
    const vx = fx * vf - fy * vr;
    const vy = fy * vf + fx * vr;
    fx = Math.cos(this.heading);
    fy = Math.sin(this.heading);
    vf = vx * fx + vy * fy;
    vr = vx * -fy + vy * fx;

    // Drift model: grip drops once the tyres break away (sliding friction < static),
    // and recovers only when the slide has mostly died. Power-over and the handbrake
    // both push the rear loose; thrust always stays along the nose.
    const slipAbs = Math.abs(vr);
    const hard = Math.abs(this.steer) > 0.5 && vf > st.topSpeed * 0.4;
    if (ctl.handbrake && vf > 120) this.drifting = true;
    else if (!this.drifting && slipAbs > 95) this.drifting = true;
    else if (this.drifting && slipAbs < 35 && !ctl.handbrake) this.drifting = false;
    let g = st.grip * surf.grip;
    if (hard && ctl.throttle > 0) g *= 0.65; // power oversteer
    if (hard && ctl.throttle === 0 && !ctl.brake) g *= 0.7; // lift-off oversteer
    if (this.drifting) g *= 0.4;
    if (ctl.handbrake) {
      g *= 0.4;
      vf -= vf * 0.5 * dt;
    }
    const before = vr;
    vr *= Math.exp(-g * dt);
    // sliding tyres can only pull so hard: a drift corners a little slower than grip
    const maxDv = st.aLat * surf.grip * (this.drifting ? 0.95 : 1.6) * dt;
    if (Math.abs(before - vr) > maxDv) vr = before - Math.sign(before) * maxDv;
    // a little of the scrubbed sideways speed is kept as forward drive out of the slide
    if (this.drifting && ctl.throttle > 0) vf += Math.abs(before - vr) * 0.3;

    this.vx = fx * vf - fy * vr;
    this.vy = fy * vf + fx * vr;
    this.speed = vf;
    this.slip = vr;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  // How hard the tyres are working (0..1+) - drives skid marks, smoke and sound.
  get skidAmount() {
    const lateral = Math.abs(this.slip);
    let s = Math.max(0, (lateral - 45) / 160);
    if (this.brake > 0 && this.speed > 350) s = Math.max(s, ((this.speed - 350) / 600) * this.brake);
    if (this.throttle > 0 && this.speed > 5 && this.speed < 160) s = Math.max(s, 0.35 * (1 - this.speed / 160));
    return s;
  }
}

export { CAR_RADIUS };
