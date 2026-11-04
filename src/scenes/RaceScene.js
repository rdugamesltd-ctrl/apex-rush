// The race (and the menu's background "attract mode"): world rendering, the
// fixed-step simulation loop, camera, effects, sound and HUD updates.
import { getTrack, TRACK_DEFS } from '../game/tracks/index.js';
import { THEMES } from '../game/themes.js';
import { TrackRenderer, DEPTH, LIGHT } from '../game/TrackRenderer.js';
import { RaceManager } from '../game/RaceManager.js';
import { Effects } from '../game/Effects.js';
import { Atmosphere } from '../game/Atmosphere.js';
import { softShadow } from '../assets/worldTextures.js';
import { carWheels, paintedBodyKey } from '../assets/carParts.js';
import { PlayerInput } from '../game/PlayerInput.js';
import { RaceGuide } from '../game/RaceGuide.js';
import { DrivingLine } from '../game/DrivingLine.js';
import { LapDelta } from '../game/LapDelta.js';
import { wrapAngle } from '../game/Track.js';
import { PHYSICS_DT, CAR_LENGTH, raceReward } from '../config.js';
import { save } from '../save.js';
import { perksOf, playerSmoke } from '../shop.js';
import { UI } from '../ui/ui.js';
import { fmtTime, fmtCoins } from '../ui/util.js';
import { sfx } from '../audio/Sfx.js';
import { display, isCoarsePointer, isPortraitTouch } from '../display.js';
import { bus } from '../events.js';
import { effectiveQuality } from '../perf.js';

const IDLE = { throttle: 0, brake: 0, steer: 0 };

export class RaceScene extends Phaser.Scene {
  constructor() {
    super('race');
  }

  init(data) {
    this.cfg = { mode: 'attract', trackId: 'harbor', laps: 3, opponents: 7, ...data };
  }

  create() {
    const cfg = this.cfg;
    const sd = save.data;
    this.isRace = cfg.mode === 'race';
    this.track = getTrack(cfg.trackId);
    this.theme = THEMES[this.track.def.theme];
    this.cameras.main.setBackgroundColor(this.theme.bg);

    const quality = effectiveQuality(sd.settings);
    this.trackView = new TrackRenderer(this, this.track, this.theme, quality);
    if (cfg.debug) this.trackView.drawDebug();
    this.fx = new Effects(this, this.theme, quality, this.isRace ? playerSmoke(sd) : null);
    this.atmo = new Atmosphere(this, this.theme, { quality, menu: !this.isRace });

    this.rm = new RaceManager(
      this.track,
      { ...cfg, player: { name: sd.car.name, color: sd.car.color, upgrades: sd.upgrades } },
      this.hooks()
    );
    this.player = this.rm.player;
    this.sprites = new Map();
    for (const car of this.rm.cars) this.createCarSprite(car);

    // driving assists (player only)
    this.guide = this.player ? new RaceGuide(this.track, this.player.stats) : null;
    this.drivingLine = this.guide ? new DrivingLine(this, this.track, this.guide) : null;
    this.lapDelta = this.player ? new LapDelta(this.track, sd.bestSplits[cfg.trackId]) : null;
    this.lastWarn = false;
    this.warnAt = -10;
    this.camRot = 0;
    this.applyRaceSettings(sd.settings);

    this.paused = false;
    this.portraitHold = false;
    this.acc = 0;
    this.timeScale = cfg.timescale || 1;
    this.slipPopAt = -10;
    this.focus = this.player || this.rm.cars[0];
    if (this.followCam) this.camRot = wrapAngle(-Math.PI / 2 - this.focus.heading);
    this.focusTimer = 10;
    this.camX = this.focus.x;
    this.camY = this.focus.y;
    // races open on the front of the grid; the camera pans back to the player during the lights
    if (this.isRace) {
      this.camX = this.track.cx[0];
      this.camY = this.track.cy[0];
    }
    this.resetCameraMotion();
    this.zoom = 0;
    this.updateZoom();
    // races open wide and settle in on the grid while the lights come on
    this.zoom = this.isRace ? this.baseZoom * 0.62 : this.baseZoom;
    this.cameras.main.setZoom(this.zoom);
    this.cameras.main.centerOn(this.camX, this.camY);

    this.input2 = this.isRace
      ? new PlayerInput({
          onPause: () => bus.emit(this.paused ? 'ui:resume' : 'ui:pause'),
          onRespawn: () => !this.waiting && this.rm.playerRespawn(),
        })
      : null;

    this.scale.on('resize', this.onResize, this);
    this.offSettings = bus.on('ui:settings', (s) => {
      this.updateZoom();
      this.applyRaceSettings(s);
      this.atmo.setQuality(effectiveQuality(s));
    });
    this.events.once('shutdown', () => this.cleanup());

    // races hold on the grid (lights off) until the controls briefing is dismissed;
    // autopilot (debug/automation) races start straight away
    this.waiting = this.isRace && !cfg.autopilot;
    if (this.isRace) {
      UI.enterRace(
        {
          track: this.track,
          laps: cfg.laps,
          total: this.rm.cars.length,
          unitsSetting: sd.settings.units,
        },
        this.waiting ? () => (this.waiting = false) : null
      );
      sfx.startEngine();
      bus.emit('race:start');
    }
    bus.emit('scene:ready');
  }

  applyRaceSettings(s) {
    this.drivingLine?.setMode(s.racingLine || 'full');
    this.hints = s.cornerHints !== false;
    this.followCam = this.isRace && s.camera === 'follow';
    this.camMotion = this.isRace && s.camMotion !== 'low';
    if (this.isRace && !this.hints) UI.hud.corner(null);
  }

  createCarSprite(car) {
    const depth = DEPTH.car + (car.isPlayer ? 0.5 : 0);
    // paint is baked into the body texture (bodywork only, not tyres or driver)
    const body = this.add.image(car.x, car.y, paintedBodyKey(this, car.color)).setDepth(depth);
    const sc = CAR_LENGTH / body.height;
    body.setScale(sc);
    // steerable front wheels, just under the body so the suspension arms overlap them
    const wheels = carWheels.ok
      ? [
          { img: this.add.image(car.x, car.y, 'car_wheel_l'), dx: carWheels.left.dx * sc, dy: carWheels.left.dy * sc },
          { img: this.add.image(car.x, car.y, 'car_wheel_r'), dx: carWheels.right.dx * sc, dy: carWheels.right.dy * sc },
        ]
      : [];
    for (const w of wheels) w.img.setScale(sc).setDepth(depth - 0.01);
    const light = this.add
      .image(car.x, car.y, 'brakelight')
      .setDepth(depth + 0.05)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(44, 22)
      .setVisible(false);
    // soft drop shadow cast by the sun, plus a tight contact shadow under the floor
    const soft = softShadow(this, 'car', 0.045);
    const shadow = this.add
      .image(car.x, car.y, soft.key)
      .setScale(sc * soft.scale)
      .setAlpha(0.42)
      .setDepth(DEPTH.carShadow);
    const contact = this.add
      .image(car.x, car.y, soft.key)
      .setScale(sc * soft.scale * 0.94)
      .setAlpha(0.5)
      .setDepth(DEPTH.carShadow + 0.01);
    let marker = null;
    if (car.isPlayer) {
      marker = this.add.image(car.x, car.y, 'marker').setDepth(DEPTH.fx).setScale(0.9);
      this.tweens.add({ targets: marker, scale: 1.1, yoyo: true, repeat: -1, duration: 420 });
    }
    this.sprites.set(car, { body, wheels, shadow, contact, marker, light, lightA: 0 });
  }

  hooks() {
    const popup = (text, kind) => this.isRace && UI.hud.popup(text, kind);
    const vibrate = (ms) => {
      if (save.data.settings.vibration && isCoarsePointer() && navigator.userActivation?.hasBeenActive) navigator.vibrate?.(ms);
    };
    return {
      onLight: (n) => {
        this.trackView.setLights(n);
        if (!this.isRace) return;
        UI.hud.lights(n);
        if (n > 0) sfx.light();
      },
      onGo: () => {
        this.trackView.setLights(0);
        if (!this.isRace) return;
        UI.hud.go();
        sfx.go();
        if (this.camMotion) this.zoomPunch = -0.07;
        this.time.delayedCall(2500, () => this.sprites.get(this.player)?.marker?.setVisible(false));
      },
      onPerfectStart: () => {
        if (!this.isRace) return;
        popup('PERFECT START!', 'best');
        sfx.whoosh();
        if (this.camMotion) this.zoomPunch = -0.1;
        vibrate(40);
      },
      onImpact: (car, v, x, y) => {
        if (this.nearCamera(car)) this.fx.impact(x, y, v);
        if (car === this.player) {
          sfx.thud(v);
          this.cameraHit(x - car.x, y - car.y, Math.min(1, v / 520));
          vibrate(Math.min(70, Math.round(v / 8)));
        }
      },
      onBump: (a, b, v, x, y) => {
        if (a !== this.player && b !== this.player) return;
        sfx.bump(v);
        this.fx.impact(x, y, v * 0.6);
        const me = a === this.player ? a : b;
        this.cameraHit(x - me.x, y - me.y, Math.min(0.45, v / 700));
        vibrate(25);
      },
      onLap: (car, lapTime) => {
        if (car !== this.player || !this.isRace) return;
        const gap = this.lapDelta.completeLap(lapTime);
        const best = save.data.bestLaps[this.cfg.trackId];
        if (car.lastLap && (!best || car.lastLap < best)) popup('NEW BEST LAP!', 'best');
        else if (car.lapsDone < this.rm.laps - 1) popup(`LAP ${car.lapsDone + 1}`, '');
        const gapText = gap === null ? '' : `  ${gap < 0 ? '−' : '+'}${Math.abs(gap).toFixed(3)}`;
        popup(`${fmtTime(lapTime)}${gapText}`, `time ${gap === null ? '' : gap < 0 ? 'neg' : 'pos'}`);
      },
      onDrift: (ev) => {
        if (!this.isRace) return;
        if (ev.failed) popup('DRIFT LOST', 'fail');
        else {
          popup(`DRIFT +${fmtCoins(ev.points)}`, 'drift');
          sfx.drift();
        }
      },
      onFinalLap: () => popup('FINAL LAP', 'final'),
      onFinish: (car) => {
        if (car === this.player) popup(car.finishPos === 1 ? 'WINNER!' : 'FINISH!', 'go');
      },
      onOvertake: (n) => {
        popup(n > 1 ? `OVERTAKE ×${n}` : 'OVERTAKE!', 'ok');
        sfx.whoosh();
      },
      onWrongWay: (on) => this.isRace && UI.hud.wrongWay(on),
      onRespawn: (car) => {
        if (car === this.player) popup('RESET', '');
      },
      onResults: (r) => this.finishRace(r),
    };
  }

  // ---------- loop ----------
  update(time, delta) {
    if (this.paused) return;
    if (this.isRace && isPortraitTouch()) {
      if (!this.portraitHold) {
        this.portraitHold = true;
        sfx.updateEngine(0, 0, 0, 0, false);
      }
      return;
    }
    if (this.portraitHold) {
      this.portraitHold = false;
      if (this.rm.state !== 'done') {
        bus.emit('ui:pause');
        return;
      }
    }

    const dt = Math.min(delta, 100) / 1000;
    if (this.waiting) this.acc = 0;
    else this.acc += dt * this.timeScale;
    const ctl = this.input2 && this.rm.state !== 'done' ? this.input2.read() : IDLE;
    let steps = 0;
    while (this.acc >= PHYSICS_DT && steps < 40) {
      this.rm.update(PHYSICS_DT, ctl);
      for (const car of this.rm.cars) if (this.nearCamera(car)) this.fx.carFx(car, PHYSICS_DT);
      this.acc -= PHYSICS_DT;
      steps++;
    }
    if (steps >= 40) this.acc = 0;

    this.renderCars(this.acc / PHYSICS_DT);
    if (!this.isRace) this.updateAttractFocus(dt);
    this.updateCamera(dt);
    const view = this.viewRect();
    this.trackView.update(view);
    const f = this.focus;
    const fast = Math.max(0, Math.min(1, (Math.abs(f.speed) / f.stats.topSpeed - 0.55) / 0.45));
    this.atmo.update(view, time / 1000, fast * 0.9, this.viewRot, f.vx, f.vy);
    this.fx.updateChevrons(this.player, time / 1000);

    if (this.isRace) {
      const p = this.player;
      const live = this.rm.state !== 'done' && !p.finished;
      this.drivingLine.update(p, live);
      if (this.rm.state !== 'done') {
        UI.hud.update(this.rm, p, dt);
        this.updateAssists(p, live);
        if (!sfx.engine && sfx.ctx) sfx.startEngine(); // audio unlocked mid-race
      }
      const gi = p.gear;
      const racing = this.rm.racing;
      const rpm = racing && Math.abs(p.speed) > 8 ? gi.rpm : 0.15 + p.throttle * 0.55;
      sfx.updateEngine(rpm, p.throttle, Math.abs(p.speed) / p.stats.topSpeed, racing ? Math.min(1, p.skidAmount) : 0, this.rm.state !== 'done');
      if (p.slipstream > 0.6 && this.rm.time - this.slipPopAt > 6) {
        this.slipPopAt = this.rm.time;
        UI.hud.popup('SLIPSTREAM', 'slip');
      }
    }
  }

  // Corner card + brake warning, lap delta and drift counter.
  updateAssists(p, live) {
    const a = live && this.hints && this.rm.racing ? this.guide.update(p) : null;
    // flat-out corners need no hint
    const show = a && a.corner && a.corner.sev !== 'FLAT' && (a.inside || a.dist < 2600);
    UI.hud.corner(show ? a : null);
    const warn = !!(show && a.warn);
    if (warn && !this.lastWarn && this.rm.time - this.warnAt > 1.5) {
      this.warnAt = this.rm.time;
      sfx.warn();
    }
    this.lastWarn = warn;
    UI.hud.delta(this.lapDelta.update(p, this.rm.time));
    UI.hud.drift(this.rm.drift);
  }

  // Visible world area. With a rotated camera the view is a turned rectangle,
  // so use the box that contains it for culling.
  viewRect() {
    const v = this.cameras.main.worldView;
    const rot = this.viewRot || 0;
    if (Math.abs(rot) < 1e-3) return v;
    const c = Math.abs(Math.cos(rot));
    const s = Math.abs(Math.sin(rot));
    const hw = (v.width * c + v.height * s) / 2;
    const hh = (v.width * s + v.height * c) / 2;
    const cx = v.centerX;
    const cy = v.centerY;
    const q = this.rotView || (this.rotView = {});
    q.x = cx - hw;
    q.y = cy - hh;
    q.width = hw * 2;
    q.height = hh * 2;
    q.right = cx + hw;
    q.bottom = cy + hh;
    return q;
  }

  nearCamera(car) {
    const v = this.viewRect();
    const m = 400;
    return car.x > v.x - m && car.x < v.right + m && car.y > v.y - m && car.y < v.bottom + m;
  }

  renderCars(alpha) {
    for (const [car, s] of this.sprites) {
      const x = car.prevX + (car.x - car.prevX) * alpha;
      const y = car.prevY + (car.y - car.prevY) * alpha;
      const h = car.prevHeading + wrapAngle(car.heading - car.prevHeading) * alpha;
      car.rx = x;
      car.ry = y;
      car.rh = h;
      const rot = h + Math.PI / 2;
      s.body.setPosition(x, y).setRotation(rot);
      s.shadow.setPosition(x + LIGHT.x * 11, y + LIGHT.y * 11).setRotation(rot);
      s.contact.setPosition(x + LIGHT.x * 2.5, y + LIGHT.y * 2.5).setRotation(rot);
      const ghost = car.ghost > 0 ? 0.45 + 0.35 * Math.sin(car.ghost * 18) : 1;
      s.body.setAlpha(ghost);
      if (s.wheels.length) {
        // full lock when slow, less at speed (like a real wheel at racing speed)
        const lock = 0.5 - 0.22 * Math.min(1, Math.abs(car.speed) / car.stats.topSpeed);
        const wr = rot + car.steer * lock;
        const cs = Math.cos(rot);
        const sn = Math.sin(rot);
        for (const w of s.wheels) {
          w.img.setPosition(x + w.dx * cs - w.dy * sn, y + w.dx * sn + w.dy * cs).setRotation(wr).setAlpha(ghost);
        }
      }
      // brake lights: quick on, slightly slower fade
      const on = (car.brake > 0 && car.speed > 5) || car.handbrake ? 1 : 0;
      s.lightA += (on - s.lightA) * (on ? 0.5 : 0.2);
      const lit = s.lightA > 0.03;
      s.light.setVisible(lit);
      if (lit) {
        const back = CAR_LENGTH * 0.5;
        s.light.setPosition(x - Math.cos(h) * back, y - Math.sin(h) * back).setRotation(rot).setAlpha(s.lightA * ghost);
      }
      if (s.marker) {
        // keep the "you" marker above the car on screen, whatever the camera angle
        const r = this.viewRot;
        s.marker.setPosition(x - Math.sin(r) * 80, y - Math.cos(r) * 80).setRotation(-r);
      }
    }
  }

  updateAttractFocus(dt) {
    this.focusTimer -= dt;
    if (this.focusTimer <= 0) {
      this.focusTimer = 9 + Math.random() * 5;
      const cars = this.rm.cars;
      this.focus = cars[(Math.random() * cars.length) | 0];
    }
  }

  // World px visible across the short side of the screen when standing still.
  // The camera pulls back with speed (see updateCamera).
  updateZoom() {
    const short = Math.min(window.innerWidth, window.innerHeight);
    const visible = this.isRace ? (short < 520 ? 790 : 880) : 1150;
    this.baseZoom = (short * display.dpr) / visible;
  }

  resetCameraMotion() {
    this.camRot = this.followCam ? wrapAngle(-Math.PI / 2 - this.focus.heading) : 0;
    this.viewRot = this.camRot;
    this.lean = 0; // roll with cornering force
    this.accX = 0; // smoothed acceleration of the focus car
    this.accY = 0;
    this.lastV = null;
    this.kickX = 0; // spring offset from impacts
    this.kickY = 0;
    this.kickVX = 0;
    this.kickVY = 0;
    this.trauma = 0; // 0..1, shake strength (squared when applied)
    this.zoomPunch = 0;
    this.finishSpin = 0;
  }

  // Jolt the camera after a hit: (dx, dy) points from the car to the contact.
  cameraHit(dx, dy, strength) {
    if (!this.camMotion || strength <= 0) return;
    const l = Math.hypot(dx, dy) || 1;
    this.kickVX += (dx / l) * 900 * strength;
    this.kickVY += (dy / l) * 900 * strength;
    this.trauma = Math.min(1, this.trauma + strength * 0.75);
    this.zoomPunch = Math.max(this.zoomPunch, 0.035 * strength);
  }

  updateCamera(dt) {
    const cam = this.cameras.main;
    const car = this.focus;
    const x = car.rx ?? car.x;
    const y = car.ry ?? car.y;
    const sp = Math.hypot(car.vx, car.vy);
    const motion = this.camMotion;
    const top = car.stats.topSpeed;
    const viewShort = Math.min(cam.width, cam.height) / this.zoom;
    const look = Math.min(sp * 0.34, viewShort * 0.27);
    let dirX = sp > 1 ? car.vx / sp : 0;
    let dirY = sp > 1 ? car.vy / sp : 0;
    // look into the coming corner: aim partly at the track further ahead, so the
    // view swings into a turn before the car does (skipped when facing backwards)
    const t = this.track;
    if (car.idx >= 0 && sp > 60) {
      const ahead = (car.idx + Math.round((look * 1.8 + 120) / t.ds)) % t.n;
      const ax = t.cx[ahead] - x;
      const ay = t.cy[ahead] - y;
      const al = Math.hypot(ax, ay);
      if (al > 1 && (ax * dirX + ay * dirY) / al > 0.3) {
        dirX = dirX * 0.45 + (ax / al) * 0.55;
        dirY = dirY * 0.45 + (ay / al) * 0.55;
        const dl = Math.hypot(dirX, dirY) || 1;
        dirX /= dl;
        dirY /= dl;
      }
    }
    let tx = x + dirX * look;
    let ty = y + dirY * look;

    // inertia: smoothed acceleration shifts the framing, so a launch lets the car
    // pull ahead of the camera and hard braking lets it drop back
    if (dt > 0) {
      if (this.lastV) {
        let ax = (car.vx - this.lastV[0]) / dt;
        let ay = (car.vy - this.lastV[1]) / dt;
        const am = Math.hypot(ax, ay);
        if (am > 2500) {
          ax *= 2500 / am;
          ay *= 2500 / am;
        }
        const ka = 1 - Math.exp(-dt * 5);
        this.accX += (ax - this.accX) * ka;
        this.accY += (ay - this.accY) * ka;
      }
      this.lastV = [car.vx, car.vy];
    }
    if (motion) {
      let ox = -this.accX * 0.12;
      let oy = -this.accY * 0.12;
      const ol = Math.hypot(ox, oy);
      if (ol > 90) {
        ox *= 90 / ol;
        oy *= 90 / ol;
      }
      tx += ox;
      ty += oy;
    }

    // start: pan from the front of the grid back to the player while the lights come on
    if (this.isRace && this.rm.state === 'lights') {
      const p = Math.min(1, Math.max(0, (this.rm.clock - 0.5) / Math.max(1, this.rm.goAt - 1.6)));
      const e = p * p * (3 - 2 * p);
      tx = t.cx[0] + (tx - t.cx[0]) * e;
      ty = t.cy[0] + (ty - t.cy[0]) * e;
    }

    const k = 1 - Math.exp(-dt * (this.isRace ? 7 : 2.5));
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;

    // zoom: pull back with speed; wider in a drift or the slipstream, closer under hard braking
    let zf = 1 - 0.24 * Math.min(1, sp / 950);
    const finished = this.isRace && car.finished;
    if (motion) {
      if (car.drifting) zf *= 0.93;
      if (car.slipstream > 0) zf *= 0.97;
      if (car.brake > 0.5 && car.speed > 300) zf *= 1.05;
      if (finished) zf *= 1.14;
    }
    this.zoom += (this.baseZoom * zf - this.zoom) * (1 - Math.exp(-dt * 1.8));
    this.zoomPunch *= Math.exp(-dt * 4);

    // "follow" camera: rotate so the car points up the screen. It tracks a blend of
    // the nose and the direction of travel, so drifts show as the car turning sideways.
    let rotTarget = 0;
    if (this.followCam) {
      const h = car.rh ?? car.heading;
      const dir = car.speed > 150 ? h + wrapAngle(Math.atan2(car.vy, car.vx) - h) * 0.5 : h;
      rotTarget = -Math.PI / 2 - dir;
    }
    // after the flag: a slow orbit
    if (finished && motion) {
      this.finishSpin = Math.min(0.6, this.finishSpin + dt * 0.08);
      rotTarget += this.finishSpin;
    }
    this.camRot = wrapAngle(this.camRot + wrapAngle(rotTarget - this.camRot) * (1 - Math.exp(-dt * 5)));
    if (Math.abs(rotTarget) < 1e-6 && Math.abs(this.camRot) < 1e-3) this.camRot = 0;

    let offX = 0;
    let offY = 0;
    let shakeRot = 0;
    if (motion) {
      // lean: roll a little with the sideways (cornering) force, toward the turn
      const lat = sp > 80 ? this.accX * -dirY + this.accY * dirX : 0;
      const leanTarget = -Math.max(-1, Math.min(1, lat / 650)) * 0.05;
      this.lean += (leanTarget - this.lean) * (1 - Math.exp(-dt * 3));

      // impact spring
      this.kickVX += (-this.kickX * 140 - this.kickVX * 15) * dt;
      this.kickVY += (-this.kickY * 140 - this.kickVY * 15) * dt;
      this.kickX += this.kickVX * dt;
      this.kickY += this.kickVY * dt;

      // rumble on kerbs and off the road, a light buzz near top speed, plus impact shake
      const fast = Math.min(1, sp / 400);
      let amp = car.surface === 'kerb' ? 2.4 * fast : car.surface !== 'road' ? 4.5 * fast : 0;
      amp += 1.1 * Math.max(0, (sp / top - 0.82) / 0.18);
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
      const tr = this.trauma * this.trauma;
      amp += 16 * tr;
      const s = this.time.now / 1000;
      const px = (display.dpr / this.zoom) * amp; // screen px -> world px
      offX = (Math.sin(s * 53.1) + 0.6 * Math.sin(s * 31.7 + 1.3)) * px * 0.62 + this.kickX;
      offY = (Math.sin(s * 47.3 + 2.1) + 0.6 * Math.sin(s * 27.9 + 0.4)) * px * 0.62 + this.kickY;
      shakeRot = Math.sin(s * 41.3 + 0.7) * 0.03 * tr;
    } else {
      this.lean = 0;
    }

    this.viewRot = this.camRot + this.lean + shakeRot;
    cam.setRotation(this.viewRot);
    cam.setZoom(this.zoom * (1 + this.zoomPunch));
    cam.centerOn(this.camX + offX, this.camY + offY);
  }

  onResize() {
    const prev = this.baseZoom;
    this.updateZoom();
    // keep the current framing (speed pull-back etc.) when only the resolution changed
    this.zoom = prev ? this.zoom * (this.baseZoom / prev) : this.baseZoom;
    if (this.isRace) UI.hud.resize(this.track);
  }

  // ---------- race flow ----------
  pauseRace() {
    if (!this.isRace || this.paused || this.waiting || this.rm.state === 'done') return;
    this.paused = true;
    sfx.updateEngine(0, 0, 0, 0, false);
    UI.showPause();
  }

  resumeRace() {
    if (!this.paused) return;
    this.paused = false;
    this.acc = 0;
    UI.hidePause();
  }

  finishRace(r) {
    const cfg = this.cfg;
    const sd = save.data;
    const reward = raceReward(
      {
        position: r.position,
        cars: r.cars,
        difficulty: this.rm.difficulty,
        laps: cfg.laps,
        overtakes: r.overtakes,
        drift: r.drift,
      },
      perksOf(sd)
    );
    sd.coins += reward.total;
    sd.stats.races++;
    sd.stats.coinsEarned += reward.total;
    if (r.position === 1) sd.stats.wins++;
    if (r.position <= 3) {
      sd.stats.podiums++;
      sd.podiums[cfg.trackId] = Math.min(sd.podiums[cfg.trackId] || 99, r.position);
    }
    const prevBest = sd.bestLaps[cfg.trackId];
    const newBest = !!r.bestLap && (!prevBest || r.bestLap < prevBest);
    if (newBest) sd.bestLaps[cfg.trackId] = r.bestLap;
    // reference lap for the live delta (only replaced by a faster recorded lap)
    if (this.lapDelta?.improved) sd.bestSplits[cfg.trackId] = this.lapDelta.ref;

    save.persist();

    const idx = TRACK_DEFS.findIndex((d) => d.id === cfg.trackId);
    const next = TRACK_DEFS[idx + 1];
    sfx.stopEngine();
    if (r.position <= 3) sfx.fanfare();
    this.time.delayedCall(600, () => sfx.coin());
    UI.showResults({ ...r, reward, newBest, difficulty: this.rm.difficulty, nextTrack: next ? next.id : null, cfg });
  }

  cleanup() {
    this.input2?.destroy();
    this.offSettings?.();
    this.scale.off('resize', this.onResize, this);
    if (this.isRace) sfx.stopEngine();
  }
}
