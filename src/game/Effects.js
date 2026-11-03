// Visual effects: skid marks, tyre smoke, off-road dust, sparks, slipstream chevrons.
import { DEPTH } from './TrackRenderer.js';
import { GeoLayer, webglAvailable } from './Geometry.js';

// Canvas fallback: skid marks in a few Graphics layers, the oldest dropped as they fill.
const MAX_SKID_LAYERS = 6;
const SKIDS_PER_LAYER = 400;
// WebGL: a ring buffer of skid quads on the GPU (oldest marks overwritten).
const SKID_RING = 7000;

export class Effects {
  // playerSmoke: hex colour of the player's tyre smoke (shop item), null = same as everyone
  constructor(scene, theme, quality, playerSmoke = null) {
    this.scene = scene;
    this.low = quality === 'low';
    this.skidLayers = [];
    this.skidCount = 0;
    this.cur = null;
    this.lastRear = new Map();
    this.skidRing = webglAvailable(scene) ? new GeoLayer(scene, DEPTH.skids, { mode: 'ring', capacity: SKID_RING * 6 }) : null;

    this.smoke = scene.add
      .particles(0, 0, 'puff', {
        lifespan: 900,
        speed: { min: 5, max: 35 },
        scale: { start: 0.35, end: 1.4 },
        alpha: { start: 0.35, end: 0 },
        rotate: { min: 0, max: 360 },
        emitting: false,
      })
      .setDepth(DEPTH.smoke);
    this.playerSmoke = playerSmoke
      ? scene.add
          .particles(0, 0, 'puff', {
            lifespan: 1000,
            speed: { min: 5, max: 35 },
            scale: { start: 0.4, end: 1.5 },
            alpha: { start: 0.55, end: 0 },
            rotate: { min: 0, max: 360 },
            tint: parseInt(playerSmoke.slice(1), 16),
            emitting: false,
          })
          .setDepth(DEPTH.smoke)
      : this.smoke;
    this.dust = scene.add
      .particles(0, 0, 'puff', {
        lifespan: 700,
        speed: { min: 10, max: 50 },
        scale: { start: 0.3, end: 1.1 },
        alpha: { start: 0.5, end: 0 },
        tint: theme.dust,
        emitting: false,
      })
      .setDepth(DEPTH.smoke);
    this.sparks = scene.add
      .particles(0, 0, 'spark', {
        lifespan: 380,
        speed: { min: 120, max: 420 },
        scale: { start: 1.3, end: 0 },
        blendMode: 'ADD',
        emitting: false,
      })
      .setDepth(DEPTH.fx);

    this.chevrons = [0, 1, 2].map(() =>
      scene.add.image(0, 0, 'chevron').setDepth(DEPTH.fx).setScale(0.55).setVisible(false)
    );
  }

  skidLine(x1, y1, x2, y2, alpha) {
    if (this.skidRing) {
      this.skidRing.rec.lineStyle(8, 0x15151a, alpha).lineBetween(x1, y1, x2, y2);
      return;
    }
    if (!this.cur || this.skidCount >= SKIDS_PER_LAYER) {
      this.cur = this.scene.add.graphics().setDepth(DEPTH.skids);
      this.skidLayers.push(this.cur);
      this.skidCount = 0;
      if (this.skidLayers.length > MAX_SKID_LAYERS) this.skidLayers.shift().destroy();
    }
    this.cur.lineStyle(8, 0x15151a, alpha);
    this.cur.lineBetween(x1, y1, x2, y2);
    this.skidCount++;
  }

  // Called every physics step for every car near the camera.
  carFx(car, dt) {
    const sk = car.skidAmount;
    const fx = Math.cos(car.heading);
    const fy = Math.sin(car.heading);
    const bx = car.x - fx * 30;
    const by = car.y - fy * 30;
    const lx = bx + fy * 20;
    const ly = by - fx * 20;
    const rx = bx - fy * 20;
    const ry = by + fx * 20;
    const onTarmac = car.surface !== 'grass';

    if (sk > 0.15 && onTarmac && Math.abs(car.speed) > 20) {
      const prev = this.lastRear.get(car);
      if (!this.low && prev && Math.hypot(prev.lx - lx, prev.ly - ly) < 60) {
        const a = Math.min(0.32, 0.1 + sk * 0.25);
        this.skidLine(prev.lx, prev.ly, lx, ly, a);
        this.skidLine(prev.rx, prev.ry, rx, ry, a);
      }
      this.lastRear.set(car, { lx, ly, rx, ry });
      if (sk > 0.55 && Math.random() < (sk - 0.4) * dt * (this.low ? 6 : 16)) {
        (car.isPlayer ? this.playerSmoke : this.smoke).emitParticleAt(bx, by, 1);
      }
    } else {
      this.lastRear.delete(car);
    }
    if (!onTarmac && Math.abs(car.speed) > 100 && Math.random() < dt * (this.low ? 8 : 24)) {
      this.dust.emitParticleAt(bx, by, 1);
    }
  }

  impact(x, y, strength) {
    this.sparks.emitParticleAt(x, y, Math.min(14, Math.round(strength / 40)));
  }

  updateChevrons(car, time) {
    const show = car && car.slipstream > 0.15;
    const fx = car ? Math.cos(car.heading) : 0;
    const fy = car ? Math.sin(car.heading) : 0;
    this.chevrons.forEach((c, k) => {
      c.setVisible(show);
      if (!show) return;
      const d = 78 + k * 26;
      c.setPosition(car.x + fx * d, car.y + fy * d);
      c.setRotation(car.heading + Math.PI / 2);
      const pulse = 0.5 + 0.5 * Math.sin(time * 10 - k * 1.2);
      c.setAlpha(Math.min(1, car.slipstream * 1.4) * (0.35 + 0.65 * pulse));
      c.setTint(0x6fe3ff);
    });
  }
}
