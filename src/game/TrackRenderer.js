// Draws a Track with Phaser: layered ground (graded tile, large-scale colour
// variation, mowing stripes, surface grain), the vector road split into culled
// chunks (shaded walls, raised kerbs, rubbered-in line), gravel traps, brake
// marks, the start grid and light gantry, an overhead bridge, painted logos,
// banners, grandstands and scenery with soft shadows.

import { gridSlot, LAKE_SHORE } from './Track.js';
import { cornerNotes, guideProfile } from './RaceGuide.js';
import { BASE_STATS } from '../config.js';
import { gradedTile, macroTexture, mowTexture, grainTexture, softShadow } from '../assets/worldTextures.js';
import { StaticGeometry } from './Geometry.js';

const CHUNK = 48;

// The sun sits to the top left: shadows fall along this direction, by object height.
export const LIGHT = { x: 0.6, y: 0.8 };

// Infield lake looks. rings: [distance past the waterline (negative = on the shore), colour].
const LAKE_STYLES = {
  harbor: {
    rings: [
      [-1, 0xe9d9a8],
      [-0.72, 0xdcc995],
      [-12, 0xc8b383],
      [0, 0x6cc9d6],
      [36, 0x46acd0],
      [100, 0x3492c2],
      [200, 0x2b7db3],
      [340, 0x246ca2],
    ],
    boats: true,
  },
  oasis: {
    rings: [
      [-1, 0x86a845],
      [-0.82, 0x6f9a39],
      [-0.3, 0x7fae46],
      [-12, 0xc9b47c],
      [0, 0x7fe0cf],
      [34, 0x55cbc6],
      [90, 0x3bb2bb],
      [180, 0x2d98ad],
    ],
    palms: true,
  },
};

export const DEPTH = {
  ground: -10,
  groundMacro: -9.8,
  groundMow: -9.6,
  water: 0.2,
  waterFx: 0.3,
  decorShadow: 0.5,
  paint: 0.6,
  gravel: 0.9,
  barrier: 1,
  banner: 1.5,
  runoff: 2,
  kerb: 3,
  road: 4,
  rubber: 4.5,
  lines: 5,
  grid: 6,
  grain: 6.5, // multiply layer that textures everything below it
  skids: 7,
  flat: 8, // signs and tyre stacks lying on the ground
  decor: 9,
  carShadow: 19,
  car: 20,
  smoke: 21,
  fx: 22,
  overheadShadow: 23,
  overhead: 25,
  clouds: 28,
  overlay: 30,
};

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

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

export class TrackRenderer {
  constructor(scene, track, theme, quality = 'high') {
    this.scene = scene;
    this.track = track;
    this.theme = theme;
    this.hq = quality !== 'low';
    this.chunks = [];
    this.decor = [];
    this.reserved = [];
    this.lamps = [];
    this.rand = rng(hashStr(track.id));
    this.notes = cornerNotes(track, guideProfile(track, BASE_STATS), BASE_STATS.topSpeed);
    // static vector shapes live in GPU buffers, in three depth groups with nothing
    // else drawn between their depths (banners sit outside the run-off, so the
    // gravel..rubber group can safely draw before them)
    this.geo = new StaticGeometry(scene, [
      [DEPTH.water, DEPTH.water, DEPTH.water],
      [DEPTH.gravel, DEPTH.gravel, DEPTH.rubber],
      [DEPTH.lines, DEPTH.lines, DEPTH.grid],
    ]);
    this.buildGround();
    this.buildLake();
    this.buildRoad();
    this.buildGravel();
    this.buildRubber();
    this.buildGrid();
    this.buildGantry();
    this.buildBridge();
    this.buildPaint();
    this.buildScenery();
    this.geo.finish();
  }

  // ---------- ground ----------
  // Tile sprites that follow the camera; `scale` is the tile scale, so the
  // pattern can be pinned to the world in update().
  buildGround() {
    const scene = this.scene;
    const th = this.theme;
    const layer = (key, depth, scale = 1) => {
      const obj = scene.add.tileSprite(0, 0, 64, 64, key).setOrigin(0, 0).setDepth(depth).setTileScale(scale);
      this.layers.push({ obj, scale });
      return obj;
    };
    this.layers = [];
    this.groundW = 64;
    this.groundH = 64;
    this.ground = layer(gradedTile(scene, th.ground, th.grade), DEPTH.ground);
    if (!this.hq) return;
    if (th.macro) layer(macroTexture(scene, th), DEPTH.groundMacro, 6);
    if (th.mow) layer(mowTexture(scene), DEPTH.groundMow, 2.2).setAlpha(th.mow);
    layer(grainTexture(scene), DEPTH.grain, 1.5).setBlendMode(Phaser.BlendModes.MULTIPLY).setAlpha(th.grain ?? 1);
  }

  // ---------- infield lake ----------
  // Filled polygon, triangulated once (Graphics would re-triangulate it every frame).
  fillPoly(g, pts, color, alpha = 1) {
    if (pts.length < 3) return;
    const flat = pts.flat();
    const tri = Phaser.Geom.Polygon.Earcut(flat);
    g.fillStyle(color, alpha);
    for (let k = 0; k < tri.length; k += 3) {
      const a = tri[k] * 2;
      const b = tri[k + 1] * 2;
      const c = tri[k + 2] * 2;
      g.fillTriangle(flat[a], flat[a + 1], flat[b], flat[b + 1], flat[c], flat[c + 1]);
    }
  }

  // Shore, shallows and deep water in rings, then per style: a jetty with moored
  // boats and boats at anchor, or palms around an oasis; sun glints on the water.
  buildLake() {
    const t = this.track;
    const lake = t.def.lake;
    if (!lake) return;
    const shore = t.lakeRing(0);
    if (shore.length < 12) return;
    const style = LAKE_STYLES[lake.style] || LAKE_STYLES.harbor;
    const width = lake.shore ?? LAKE_SHORE;
    const scene = this.scene;
    const g = this.geo.seg(DEPTH.water);
    // ring distances between -1 and 0 are fractions of the shore width
    for (const [d, color] of style.rings) this.fillPoly(g, t.lakeRing(d > -1.01 && d < 0 ? Math.round(d * width) : d), color);
    // foam where the water laps the shore
    g.lineStyle(5, 0xffffff, 0.5);
    g.strokePoints(shore.map(([x, y]) => ({ x, y })), true, true);
    g.lineStyle(3, 0xffffff, 0.22);
    g.strokePoints(t.lakeRing(14).map(([x, y]) => ({ x, y })), true, true);

    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let cx = 0;
    let cy = 0;
    for (const [x, y] of shore) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      cx += x / shore.length;
      cy += y / shore.length;
    }
    this.addDecor([g], (x0 + x1) / 2, (y0 + y1) / 2, Math.hypot(x1 - x0, y1 - y0) / 2 + width);
    const deep = t.hw + t.barrierGap + lake.margin;
    const inWater = (x, y, m) => t.nearestWithin(x, y, deep + m) < 0 && t.insideLoop(x, y);
    const rand = this.rand;
    if (style.palms) {
      // palms around the oasis, on the green ring
      const ring = t.lakeRing(-Math.round(width * 0.5));
      for (let k = 0; k < ring.length; k += 2 + ((rand() * 3) | 0)) {
        const [x, y] = ring[k];
        const w = 120 + rand() * 60;
        this.place('tree_pine', x + (rand() - 0.5) * 50, y + (rand() - 0.5) * 50, w, rand() * Math.PI * 2, {
          shadow: Math.round(w * 0.18),
        });
      }
    }
    if (style.boats) this.buildJetty(shore, cx, cy, inWater);
    this.buildGlints(shore, cx, cy, inWater);
  }

  buildJetty(shore, cx, cy, inWater) {
    const scene = this.scene;
    const rand = this.rand;
    // jetty from the shore point nearest the middle of the lake
    let pier = shore[0];
    for (const p of shore) if (Math.hypot(p[0] - cx, p[1] - cy) < Math.hypot(pier[0] - cx, pier[1] - cy)) pier = p;
    const ang = Math.atan2(cy - pier[1], cx - pier[0]);
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const len = Math.min(320, Math.hypot(cx - pier[0], cy - pier[1]) * 0.5);
    const px = pier[0] + ux * (len / 2 - 30);
    const py = pier[1] + uy * (len / 2 - 30);
    const jetty = scene.add.graphics().setDepth(DEPTH.flat).setPosition(px, py).setRotation(ang);
    const shadow = scene.add
      .graphics()
      .setDepth(DEPTH.waterFx)
      .setPosition(px + LIGHT.x * 10, py + LIGHT.y * 10)
      .setRotation(ang);
    const half = len / 2;
    shadow.fillStyle(0x000000, 0.22);
    shadow.fillRect(-half, -20, len, 40);
    jetty.fillStyle(0x8a5a34, 1);
    jetty.fillRect(-half, -18, len, 36);
    jetty.fillStyle(0xa8703f, 1);
    for (let x = -half; x < half; x += 13) jetty.fillRect(x + 1, -18, 10, 36);
    jetty.fillStyle(0x5b3a22, 1);
    for (let x = -half + 10; x < half; x += 52) {
      jetty.fillRect(x, -22, 8, 8);
      jetty.fillRect(x, 14, 8, 8);
    }
    this.addDecor([jetty, shadow], px, py, half + 40);

    // boats: two moored at the jetty, a few at anchor
    const boats = [];
    for (const [f, s, key] of [
      [0.45, 1, 'boat_a'],
      [0.8, -1, 'boat_b'],
    ]) {
      const along = -half + len * f;
      boats.push({ x: px + ux * along - uy * s * 62, y: py + uy * along + ux * s * 62, rot: ang + Math.PI / 2, key });
    }
    for (let k = 0, tries = 0; k < 4 && tries < 200; tries++) {
      const p = shore[(rand() * shore.length) | 0];
      const f = 0.25 + rand() * 0.5;
      const x = p[0] + (cx - p[0]) * f;
      const y = p[1] + (cy - p[1]) * f;
      if (!inWater(x, y, 160) || Math.hypot(x - px, y - py) < half + 160) continue;
      if (boats.some((b) => Math.hypot(b.x - x, b.y - y) < 260)) continue;
      boats.push({ x, y, rot: rand() * Math.PI * 2, key: rand() < 0.5 ? 'boat_a' : 'boat_b' });
      k++;
    }
    for (const b of boats) {
      const img = this.place(b.key, b.x, b.y, b.key === 'boat_a' ? 64 : 50, b.rot, { shadow: 12 });
      const sh = this.decor[this.decor.length - 1].objs[1];
      scene.tweens.add({
        targets: [img, sh],
        rotation: b.rot + 0.05,
        duration: 1800 + rand() * 1400,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
        delay: rand() * 1500,
      });
    }
  }

  // Sun glints twinkling on the open water.
  buildGlints(shore, cx, cy, inWater) {
    if (!this.hq) return;
    const scene = this.scene;
    const rand = this.rand;
    for (let k = 0, tries = 0; k < 36 && tries < 400; tries++) {
      const p = shore[(rand() * shore.length) | 0];
      const f = 0.1 + rand() * 0.85;
      const x = p[0] + (cx - p[0]) * f;
      const y = p[1] + (cy - p[1]) * f;
      if (!inWater(x, y, 60)) continue;
      k++;
      const s = 0.5 + rand() * 0.8;
      const glint = scene.add
        .image(x, y, 'glint')
        .setDepth(DEPTH.waterFx)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(s)
        .setAlpha(0);
      scene.tweens.add({
        targets: glint,
        alpha: 0.85,
        duration: 500 + rand() * 500,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
        delay: rand() * 3000,
        repeatDelay: 800 + rand() * 2600,
      });
      this.addDecor([glint], x, y, 20);
    }
  }

  // ---------- road ----------
  quad(g, i, j, a0, b0, a1, b1, dx = 0, dy = 0) {
    const t = this.track;
    const x1 = t.cx[i] + t.nx[i] * a0 + dx;
    const y1 = t.cy[i] + t.ny[i] * a0 + dy;
    const x2 = t.cx[i] + t.nx[i] * b0 + dx;
    const y2 = t.cy[i] + t.ny[i] * b0 + dy;
    const x3 = t.cx[j] + t.nx[j] * b1 + dx;
    const y3 = t.cy[j] + t.ny[j] * b1 + dy;
    const x4 = t.cx[j] + t.nx[j] * a1 + dx;
    const y4 = t.cy[j] + t.ny[j] * a1 + dy;
    g.fillTriangle(x1, y1, x2, y2, x3, y3);
    g.fillTriangle(x1, y1, x3, y3, x4, y4);
  }

  // A band between two lateral offsets (numbers or functions of the sample),
  // optionally shifted by (dx, dy) - used for cast shadows.
  strip(g, k0, k1, offA, offB, color, alpha = 1, dx = 0, dy = 0) {
    const n = this.track.n;
    const val = (v, i) => (typeof v === 'number' ? v : v(i));
    g.fillStyle(color, alpha);
    for (let k = k0; k < k1; k++) {
      const i = k % n;
      const j = (k + 1) % n;
      this.quad(g, i, j, val(offA, i), val(offB, i), val(offA, j), val(offB, j), dx, dy);
    }
  }

  // Both sides of the track at once: a band from `a` to `b` outside each barrier
  // line (`a`, `b` measured outward from the wall).
  wallBand(g, k0, k1, a, b, color, alpha = 1, dx = 0, dy = 0) {
    const t = this.track;
    this.strip(g, k0, k1, (i) => -t.bL[i] - b, (i) => -t.bL[i] - a, color, alpha, dx, dy);
    this.strip(g, k0, k1, (i) => t.bR[i] + a, (i) => t.bR[i] + b, color, alpha, dx, dy);
  }

  drawWalls(g, k0, k1) {
    const t = this.track;
    const n = t.n;
    const concrete = this.theme.wall === 'concrete';
    const W = concrete ? 20 : 14;
    const sh = (h) => [LIGHT.x * h, LIGHT.y * h];
    const hq = this.hq;

    // catch fence behind the guard rail: tall, so its thin shadow lands far away
    if (hq && !concrete) this.wallBand(g, k0, k1, W + 6, W + 9, 0x000000, 0.1, ...sh(30));
    // the wall's own soft shadow
    this.wallBand(g, k0, k1, 0, W, 0x000000, hq ? 0.17 : 0.25, ...sh(6));
    if (hq) this.wallBand(g, k0, k1, 0, W, 0x000000, 0.1, ...sh(12));
    // wall top, a shaded lip facing the track and a darker back edge
    this.wallBand(g, k0, k1, 0, W, concrete ? 0xc7cad1 : 0xe3e6ec);
    this.wallBand(g, k0, k1, 0, 4, concrete ? 0x8a919d : 0x959dab);
    if (!hq) return;
    this.wallBand(g, k0, k1, W - 3, W, concrete ? 0xa4aab4 : 0xb9bfca);
    if (!concrete) {
      this.wallBand(g, k0, k1, 6, 8, 0xb0b7c3); // guard rail beam
      this.wallBand(g, k0, k1, W + 6, W + 8, 0x5d6472, 0.85); // catch fence
    }

    // posts / block joints
    g.fillStyle(0x6f7684, 1);
    g.lineStyle(2, 0x9aa0aa, 1);
    for (let k = k0; k < k1; k++) {
      if (k % 5) continue;
      const i = k % n;
      const j = (k + 1) % n;
      for (const side of [-1, 1]) {
        const b = side > 0 ? t.bR : t.bL;
        if (concrete) {
          const ax = t.cx[i] + t.nx[i] * side * b[i];
          const ay = t.cy[i] + t.ny[i] * side * b[i];
          const ex = t.cx[i] + t.nx[i] * side * (b[i] + W);
          const ey = t.cy[i] + t.ny[i] * side * (b[i] + W);
          g.lineBetween(ax, ay, ex, ey);
        } else {
          const o0 = side * (b[i] + W + 4);
          const o1 = side * (b[i] + W + 10);
          this.quad(g, i, j, o0, o1, o0, o1);
        }
      }
    }
  }

  buildRoad() {
    const t = this.track;
    const th = this.theme;
    const { n, hw } = t;
    const scene = this.scene;
    const runoff = hw + t.runoff;
    const kerbOut = hw + t.kerbW;
    const clampRoad = (v) => Math.max(-hw, Math.min(hw, v));

    for (let k0 = 0; k0 < n; k0 += CHUNK) {
      const k1 = Math.min(n, k0 + CHUNK);
      const layer = (depth) => this.geo.seg(depth);
      const gBar = layer(DEPTH.barrier);
      const gRun = layer(DEPTH.runoff);
      const gKerb = layer(DEPTH.kerb);
      const gRoad = layer(DEPTH.road);
      const gLine = layer(DEPTH.lines);

      this.drawWalls(gBar, k0, k1);

      // run-off band with a soft edge where it meets the verge
      this.strip(gRun, k0, k1, -runoff, runoff, th.runoff);
      if (this.hq) {
        this.strip(gRun, k0, k1, -runoff, -runoff + 5, 0x000000, 0.14);
        this.strip(gRun, k0, k1, runoff - 5, runoff, 0x000000, 0.14);
      }

      // raised kerbs: lit inner lip, dark outer lip and a small drop shadow
      for (let k = k0; k < k1; k++) {
        const i = k % n;
        if (!t.kerb[i]) continue;
        const j = (k + 1) % n;
        const red = Math.floor((i * t.ds) / 36) % 2 === 0;
        const band = (a, b, color, alpha) => {
          gKerb.fillStyle(color, alpha);
          this.quad(gKerb, i, j, a, b, a, b);
          this.quad(gKerb, i, j, -b, -a, -b, -a);
        };
        if (this.hq) band(kerbOut, kerbOut + 6, 0x000000, 0.18);
        band(hw - 2, kerbOut, red ? 0xe0393e : 0xf4f4f4, 1);
        band(kerbOut - 5, kerbOut, 0x000000, 0.22);
        if (this.hq) band(hw - 2, hw + 5, 0xffffff, red ? 0.22 : 0.5);
      }

      // asphalt: dusty, lighter edges and a darker rubbered-in racing line
      this.strip(gRoad, k0, k1, -hw, hw, th.asphalt);
      if (this.hq) {
        this.strip(gRoad, k0, k1, -hw, -hw + 56, 0xffffff, 0.035);
        this.strip(gRoad, k0, k1, hw - 56, hw, 0xffffff, 0.035);
        this.strip(gRoad, k0, k1, (i) => clampRoad(t.line[i] - 50), (i) => clampRoad(t.line[i] + 50), 0x000000, 0.045);
      }
      this.strip(gRoad, k0, k1, (i) => clampRoad(t.line[i] - 28), (i) => clampRoad(t.line[i] + 28), 0x000000, 0.06);
      // white edge lines
      this.strip(gLine, k0, k1, -hw + 6, -hw + 12, 0xf2f2f2, 0.92);
      this.strip(gLine, k0, k1, hw - 12, hw - 6, 0xf2f2f2, 0.92);

      // chunk bounds
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let k = k0; k <= k1; k++) {
        const i = k % n;
        const r = Math.max(t.bL[i], t.bR[i]) + 50;
        x0 = Math.min(x0, t.cx[i] - r);
        x1 = Math.max(x1, t.cx[i] + r + 30);
        y0 = Math.min(y0, t.cy[i] - r);
        y1 = Math.max(y1, t.cy[i] + r + 30);
      }
      this.chunks.push({ objs: [gBar, gRun, gKerb, gRoad, gLine], x0, y0, x1, y1, vis: true });
    }

    // banners on the fence every ~650px, only where the wall runs straight
    // (a straight banner on a bending wall would stick out across it)
    const concrete = th.wall === 'concrete';
    const every = Math.round(650 / t.ds);
    const span = Math.ceil(100 / t.ds);
    const wallIsStraight = (i, side) => {
      const b0 = t.barrierAt((i - span + n) % n, side);
      const b1 = t.barrierAt((i + span) % n, side);
      if (Math.abs(b1 - b0) > 6) return false;
      for (let o = -span; o <= span; o++) {
        if (Math.abs(t.curvSmooth[(i + o + n) % n]) > 1 / 1500) return false;
      }
      return true;
    };
    for (let i = 0; i < n; i += every) {
      for (const side of [-1, 1]) {
        const b = t.barrierAt(i, side);
        if (b < hw + t.runoff + 60 || !wallIsStraight(i, side)) continue;
        const off = side * (b + (concrete ? 10 : 7));
        const x = t.cx[i] + t.nx[i] * off;
        const y = t.cy[i] + t.ny[i] * off;
        const img = scene.add
          .image(x, y, 'banner')
          .setRotation(t.heading[i])
          .setDisplaySize(190, concrete ? 18 : 14)
          .setDepth(DEPTH.banner);
        this.addDecor([img], x, y, 100);
      }
    }
  }

  // Gravel traps on the outside of medium and slow corners, between the
  // run-off and the wall, tapering in and out.
  buildGravel() {
    const gv = this.theme.gravel;
    if (!gv) return;
    const t = this.track;
    const { n, hw, ds } = t;
    const wrap = (i) => ((i % n) + n) % n;
    const inner = hw + t.runoff - 3;
    for (const c of this.notes) {
      if (c.vMin > BASE_STATS.topSpeed * 0.74) continue;
      const side = -c.dir;
      const len = wrap(c.exit - c.entry) + 1;
      const i0 = c.entry - 10;
      const i1 = c.entry + len + Math.round(len * 0.5) + 16;
      const span = i1 - i0;
      const outer = (k) => {
        const u = (k - i0) / span;
        const room = t.barrierAt(wrap(k), side) - 30 - inner;
        return inner + Math.max(0, room) * Math.pow(Math.sin(Math.PI * u), 0.45);
      };
      const g = this.geo.seg(DEPTH.gravel);
      const band = (k, a0, b0, a1, b1, color, alpha = 1) => {
        g.fillStyle(color, alpha);
        if (side > 0) this.quad(g, wrap(k), wrap(k + 1), a0, b0, a1, b1);
        else this.quad(g, wrap(k), wrap(k + 1), -b0, -a0, -b1, -a1);
      };
      for (let k = i0; k < i1; k++) {
        const o0 = outer(k);
        const o1 = outer(k + 1);
        if (Math.max(o0, o1) - inner < 8) continue;
        band(k, inner, o0 + 4, inner, o1 + 4, gv.rim);
        band(k, inner, o0, inner, o1, gv.fill);
        band(k, Math.max(inner, o0 - 10), o0, Math.max(inner, o1 - 10), o1, 0x000000, 0.06);
      }
      // a few raked lines and pebbles
      const rand = this.rand;
      g.fillStyle(gv.rim, 0.8);
      for (let p = 0; p < span * 1.6; p++) {
        const k = i0 + Math.floor(rand() * span);
        const o = outer(k);
        if (o - inner < 20) continue;
        const lat = side * (inner + 6 + rand() * (o - inner - 12));
        const i = wrap(k);
        const sz = 2 + rand() * 3;
        g.fillRect(t.cx[i] + t.nx[i] * lat - sz / 2, t.cy[i] + t.ny[i] * lat - sz / 2, sz, sz);
      }
      const m = wrap(c.entry + Math.round(span / 2) - 10);
      this.addDecor([g], t.cx[m], t.cy[m], (span * ds) / 2 + t.maxBarrier);
    }
  }

  // Rubber laid down by braking and by wheelspin out of each corner.
  buildRubber() {
    const t = this.track;
    const { n, ds } = t;
    const wrap = (i) => ((i % n) + n) % n;
    const rand = this.rand;
    for (const c of this.notes) {
      const streaks = [];
      const zone = c.brakes ? Math.min(60, Math.max(10, wrap(c.minIdx - c.brakeIdx))) : 0;
      for (let k = 0; c.brakes && k < 5; k++) {
        const len = Math.round(zone * (0.4 + rand() * 0.6));
        const end = wrap(c.minIdx - Math.round(rand() * 6));
        streaks.push({ start: wrap(end - len), len, lat: (rand() - 0.5) * 36, a: 0.06 + rand() * 0.07, swing: 0 });
      }
      for (let k = 0; k < 3; k++) {
        const len = 8 + Math.round(rand() * 16);
        streaks.push({
          start: wrap(c.minIdx + Math.round(rand() * 8)),
          len,
          lat: (rand() - 0.5) * 30,
          a: 0.05 + rand() * 0.05,
          swing: -c.dir * (16 + rand() * 30),
        });
      }
      const g = this.geo.seg(DEPTH.rubber);
      for (const s of streaks) {
        for (const tyre of [-20, 20]) {
          let px = 0;
          let py = 0;
          for (let m = 0; m <= s.len; m += 2) {
            const i = wrap(s.start + m);
            const u = m / s.len;
            const lat = t.line[i] + s.lat + tyre + s.swing * u;
            const x = t.cx[i] + t.nx[i] * lat;
            const y = t.cy[i] + t.ny[i] * lat;
            if (m > 0) {
              g.lineStyle(7, 0x121217, s.a * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.5));
              g.lineBetween(px, py, x, y);
            }
            px = x;
            py = y;
          }
        }
      }
      const i = c.minIdx;
      this.addDecor([g], t.cx[i], t.cy[i], (zone + 40) * ds);
    }
  }

  buildGrid() {
    const t = this.track;
    const g = this.geo.seg(DEPTH.grid);
    // chequered start/finish line across the road at s = 0
    const sq = 20;
    const cols = Math.ceil(t.width / sq);
    const p = (s, lat) => [t.cx[0] + t.tx[0] * s + t.nx[0] * lat, t.cy[0] + t.ty[0] * s + t.ny[0] * lat];
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < cols; c++) {
        g.fillStyle((r + c) % 2 ? 0x1b1b22 : 0xffffff, 1);
        const s0 = -sq + r * sq;
        const l0 = -t.hw + c * sq;
        const l1 = Math.min(t.hw, l0 + sq);
        const a = p(s0, l0);
        const b = p(s0, l1);
        const cc = p(s0 + sq, l1);
        const d = p(s0 + sq, l0);
        g.fillPoints(
          [
            { x: a[0], y: a[1] },
            { x: b[0], y: b[1] },
            { x: cc[0], y: cc[1] },
            { x: d[0], y: d[1] },
          ],
          true
        );
      }
    }
    // grid boxes
    g.lineStyle(4, 0xffffff, 0.85);
    for (let k = 0; k < 12; k++) {
      const slot = gridSlot(t, k);
      const pt = t.pointAt(slot.s + 60, slot.lat);
      const fx = Math.cos(pt.heading);
      const fy = Math.sin(pt.heading);
      const rx = -fy;
      const ry = fx;
      const hwBox = 34;
      const ax = pt.x - rx * hwBox;
      const ay = pt.y - ry * hwBox;
      const bx = pt.x + rx * hwBox;
      const by = pt.y + ry * hwBox;
      g.lineBetween(ax, ay, bx, by);
      g.lineBetween(ax, ay, ax - fx * 36, ay - fy * 36);
      g.lineBetween(bx, by, bx - fx * 36, by - fy * 36);
    }
  }

  // ---------- overhead structures ----------
  // A beam across the track at distance s, drawn in its own frame (x along the
  // track, y to the driver's right) with a shadow on the ground below.
  overhead(s, depthAlong, height, drawBody) {
    const t = this.track;
    const scene = this.scene;
    const pt = t.pointAt(s, 0);
    const i = pt.i;
    const L = t.bL[i] + 40;
    const R = t.bR[i] + 40;
    const shadow = scene.add.graphics().setDepth(DEPTH.overheadShadow);
    const body = scene.add.graphics().setDepth(DEPTH.overhead);
    const hd = depthAlong / 2;
    shadow.fillStyle(0x000000, 0.2);
    shadow.fillRect(-hd - 4, -L - 4, depthAlong + 8, L + R + 8);
    shadow.fillStyle(0x000000, 0.14);
    shadow.fillRect(-hd, -L, depthAlong, L + R);
    shadow.fillRect(-24, -L - 24, 48, 48);
    shadow.fillRect(-24, R - 24, 48, 48);
    drawBody(body, L, R, hd);
    const rot = t.heading[i];
    body.setPosition(pt.x, pt.y).setRotation(rot);
    shadow.setPosition(pt.x + LIGHT.x * height, pt.y + LIGHT.y * height).setRotation(rot);
    this.addDecor([shadow, body], pt.x, pt.y, Math.max(L, R) + height + 80);
    return pt;
  }

  // Start-light gantry just past the line. Its five lamps follow the start sequence.
  buildGantry() {
    const t = this.track;
    const pt = this.overhead(70, 28, 54, (g, L, R, hd) => {
      for (const y of [-L, R]) {
        g.fillStyle(0x3d4454, 1);
        g.fillRect(-22, y - 22, 44, 44);
        g.fillStyle(0x5d6578, 1);
        g.fillRect(-22, y - 22, 44, 12);
        g.fillRect(-22, y - 22, 10, 44);
      }
      g.fillStyle(0x1f2549, 1);
      g.fillRect(-hd, -L, hd * 2, L + R);
      g.fillStyle(0x3b4683, 1);
      g.fillRect(-hd, -L, 7, L + R);
      g.fillStyle(0xff7a1a, 1);
      g.fillRect(hd - 5, -L, 5, L + R);
      g.fillStyle(0x111318, 1);
      g.fillRoundedRect(-28, -94, 56, 188, 10);
      g.lineStyle(3, 0x4f5666, 1);
      g.strokeRoundedRect(-28, -94, 56, 188, 10);
    });
    const scene = this.scene;
    const i = pt.i;
    // sponsor boards on the beam either side of the lights
    const h = t.heading[i];
    const rot = h + Math.PI / 2 + (Math.sin(h) > 0 ? Math.PI : 0);
    for (const lat of [-(t.hw + 40), t.hw + 40]) {
      const x = pt.x + t.nx[i] * lat;
      const y = pt.y + t.ny[i] * lat;
      const board = scene.add.image(x, y, 'banner').setRotation(rot).setDisplaySize(150, 18).setDepth(DEPTH.overhead + 0.1);
      this.addDecor([board], x, y, 120);
    }
    for (let k = 0; k < 5; k++) {
      const lat = -68 + k * 34;
      const x = pt.x + t.nx[i] * lat;
      const y = pt.y + t.ny[i] * lat;
      const lamp = scene.add.image(x, y, 'lamp').setDepth(DEPTH.overhead + 0.1).setDisplaySize(26, 26).setTint(0x3b3e48);
      const glow = scene.add
        .image(x, y, 'puff')
        .setDepth(DEPTH.overhead + 0.2)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDisplaySize(110, 110)
        .setTint(0xff2a1a)
        .setAlpha(0.8)
        .setVisible(false);
      this.lamps.push({ lamp, glow });
    }
  }

  setLights(n) {
    this.lamps.forEach(({ lamp, glow }, k) => {
      lamp.setTint(k < n ? 0xff3a30 : 0x3b3e48);
      glow.setVisible(k < n);
    });
  }

  // Sponsor footbridge over the longest straight away from the start.
  buildBridge() {
    const t = this.track;
    const { n, ds } = t;
    const span = Math.ceil(260 / ds);
    let best = -1;
    let bestScore = 0;
    for (let i = Math.floor(n * 0.3); i < n * 0.8; i++) {
      let ok = true;
      for (let o = -span; o <= span && ok; o += 2) ok = Math.abs(t.curvSmooth[(i + o + n) % n]) < 1 / 5000;
      if (!ok) continue;
      const score = Math.min(i, n - i);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) return;
    const pt = this.overhead(best * ds, 64, 70, (g, L, R, hd) => {
      for (const y of [-L, R]) {
        g.fillStyle(0x2a2f3a, 1);
        g.fillRect(-hd - 6, y - 26, hd * 2 + 12, 52);
        g.fillStyle(0x485063, 1);
        g.fillRect(-hd - 6, y - 26, hd * 2 + 12, 14);
      }
      g.fillStyle(0x1d2346, 1);
      g.fillRect(-hd, -L, hd * 2, L + R);
      g.fillStyle(0xe0393e, 1);
      g.fillRect(-hd, -L, 8, L + R);
      g.fillRect(hd - 8, -L, 8, L + R);
      g.fillStyle(0xffffff, 0.85);
      g.fillRect(-hd + 8, -L, 3, L + R);
      g.fillRect(hd - 11, -L, 3, L + R);
    });
    this.bridgeAt = { x: pt.x, y: pt.y };
    // banner across the deck, readable with north up
    const h = t.heading[pt.i];
    const rot = h + Math.PI / 2 + (Math.sin(h) > 0 ? Math.PI : 0);
    const banner = this.scene.add
      .image(pt.x, pt.y, 'bridge_banner')
      .setRotation(rot)
      .setDisplaySize(Math.min(t.width + 120, 460), 40)
      .setDepth(DEPTH.overhead + 0.1);
    this.addDecor([banner], pt.x, pt.y, 300);
  }

  // Big logos painted on the verges of the main straight.
  buildPaint() {
    if (!this.theme.paint) return;
    const t = this.track;
    const { n, hw } = t;
    const idx = (s) => ((Math.round(s / t.ds) % n) + n) % n;
    for (const [s, side] of [
      [-520, 1],
      [520, -1],
    ]) {
      const i = idx(s);
      let straight = true;
      for (let o = -30; o <= 30 && straight; o += 3) straight = Math.abs(t.curvSmooth[(i + o + n) % n]) < 1 / 4000;
      const verge = t.barrierAt(i, side) - (hw + t.runoff);
      if (!straight || verge < 90) continue;
      const off = side * (hw + t.runoff + verge / 2);
      const x = t.cx[i] + t.nx[i] * off;
      const y = t.cy[i] + t.ny[i] * off;
      const h = Math.min(104, verge * 0.66);
      const rot = t.heading[i] + (Math.cos(t.heading[i]) < -0.01 ? Math.PI : 0);
      const img = this.scene.add
        .image(x, y, 'paint_logo')
        .setRotation(rot)
        .setDepth(DEPTH.paint)
        .setAlpha(0.82);
      img.setScale(h / img.height);
      this.addDecor([img], x, y, img.displayWidth / 2 + 20);
    }
  }

  // ---------- scenery ----------
  addDecor(objs, x, y, r) {
    this.decor.push({ objs, x, y, r, vis: true });
  }

  // True if a point (with radius) sits outside every barrier, reserved area and lake.
  isClear(x, y, rad) {
    const t = this.track;
    if (t.inLake(x, y, rad)) return false;
    const i = t.nearestWithin(x, y, t.maxBarrier + rad + 60);
    if (i >= 0) {
      const lat = t.lateral(i, x, y);
      const along = t.along(i, x, y);
      const d = Math.hypot(lat, along);
      const side = lat >= 0 ? 1 : -1;
      if (d - rad < t.barrierAt(i, side) + 24) return false;
    }
    for (const r of this.reserved) {
      if (Math.hypot(x - r.x, y - r.y) < r.r + rad) return false;
    }
    return true;
  }

  rectClear(x, y, w, h, rot, pad = 0) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    for (const [u, v] of [
      [0, 0],
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
      [0, -0.5],
      [0, 0.5],
      [-0.5, 0],
      [0.5, 0],
    ]) {
      const px = x + c * u * w - s * v * h;
      const py = y + s * u * w + c * v * h;
      if (!this.isClear(px, py, pad)) return false;
    }
    return true;
  }

  // `shadow` is the object's height in world px: how far its soft shadow falls.
  place(key, x, y, width, rot, { shadow = 14, depth = DEPTH.decor, tint, flipX = false } = {}) {
    const scene = this.scene;
    const img = scene.add.image(x, y, key).setRotation(rot).setDepth(depth);
    const sc = width / img.width;
    img.setScale(sc);
    if (flipX) img.setFlipX(true);
    if (tint) img.setTint(tint);
    const objs = [img];
    if (shadow) {
      const soft = softShadow(scene, key);
      const sh = scene.add
        .image(x + LIGHT.x * shadow, y + LIGHT.y * shadow, soft.key)
        .setRotation(rot)
        .setScale(sc * soft.scale)
        .setAlpha(depth === DEPTH.decor ? 0.4 : 0.3)
        .setDepth(depth === DEPTH.decor ? DEPTH.decorShadow : depth - 0.1);
      if (flipX) sh.setFlipX(true);
      objs.push(sh);
    }
    const r = Math.max(img.displayWidth, img.displayHeight) * 0.75 + shadow * 2;
    this.addDecor(objs, x, y, r);
    return img;
  }

  // Place a rectangular building beside the track, front (image bottom) facing the road.
  placeFacing(key, i, side, width, extra = 30) {
    const t = this.track;
    const tex = this.scene.textures.get(key).getSourceImage();
    const h = (width * tex.height) / tex.width;
    const off = side * (t.barrierAt(i, side) + extra + h / 2);
    const x = t.cx[i] + t.nx[i] * off;
    const y = t.cy[i] + t.ny[i] * off;
    const rot = Math.atan2(-side * t.ty[i], -side * t.tx[i]);
    if (!this.rectClear(x, y, width, h, rot, 4)) return false;
    this.place(key, x, y, width, rot, { shadow: 26 });
    this.reserved.push({ x, y, r: Math.max(width, h) * 0.55 });
    return true;
  }

  buildScenery() {
    const t = this.track;
    const th = this.theme;
    const rand = this.rand;
    const n = t.n;
    const idx = (s) => ((Math.round(s / t.ds) % n) + n) % n;
    const outside = -t.orientation;

    // grandstands along the main straight, pit building opposite
    for (const s of [-560, 20, 600]) this.placeFacing('grandstand', idx(s), outside, 520);
    if (!this.placeFacing('pit_building', idx(180), -outside, 900)) this.placeFacing('grandstand', idx(180), -outside, 520);

    // grandstands on the outside of the tightest corners
    const corners = [...t.corners].sort((a, b) => a.radius - b.radius);
    let stands = 0;
    for (const c of corners) {
      if (stands >= 3) break;
      if (Math.abs(c.i) < 120 || n - c.i < 120) continue;
      if (this.placeFacing('grandstand', c.i, -c.dir, 460, 40)) stands++;
    }

    // tyre stacks and warning signs at corners
    for (const c of t.corners) {
      if (c.radius > 1000) continue;
      const side = -c.dir;
      for (let o = -24; o <= 24; o += 8) {
        const i = (c.i + o + n) % n;
        const off = side * (t.barrierAt(i, side) + 36);
        const x = t.cx[i] + t.nx[i] * off;
        const y = t.cy[i] + t.ny[i] * off;
        if (this.isClear(x, y, 20)) this.place('tire_stack', x, y, 62, rand() * 6.28, { shadow: 7, depth: DEPTH.flat });
      }
      const e = (c.entry - 32 + n) % n;
      const verge = t.barrierAt(e, side) - (t.hw + t.runoff);
      if (verge > 90) {
        const off = side * (t.hw + t.runoff + verge / 2);
        const x = t.cx[e] + t.nx[e] * off;
        const y = t.cy[e] + t.ny[e] * off;
        this.place('sign_curve', x, y, 74, t.heading[e] + Math.PI / 2, {
          shadow: 6,
          depth: DEPTH.flat,
          flipX: c.dir < 0,
        });
      }
    }

    this.buildBrakeBoards();

    // scattered decor
    const b = t.bounds;
    const total = th.decor.reduce((s, d) => s + d.weight, 0);
    const count = Math.round(b.w * b.h * th.density);
    const placedBlocks = [];
    const fx = rand() * 10;
    const fy = rand() * 10;
    const clump = (x, y) =>
      0.5 + 0.25 * Math.sin(x / 900 + fx) * Math.cos(y / 700 + fy) + 0.25 * Math.sin((x + y) / 1500 + fy);
    for (let k = 0; k < count; k++) {
      const x = b.x + rand() * b.w;
      const y = b.y + rand() * b.h;
      if (rand() > 1 - th.clumping + th.clumping * clump(x, y)) continue;
      let pick = rand() * total;
      const d = th.decor.find((dd) => (pick -= dd.weight) < 0) || th.decor[0];
      const w = d.w[0] + rand() * (d.w[1] - d.w[0]);
      if (d.gap !== undefined) {
        const rot = rand() < 0.5 ? 0 : Math.PI / 2;
        const tex = this.scene.textures.get(d.key).getSourceImage();
        const h = (w * tex.height) / tex.width;
        const r = Math.hypot(w, h) / 2;
        if (placedBlocks.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r * 0.8 + d.gap)) continue;
        if (!this.rectClear(x, y, w, h, rot, 10)) continue;
        placedBlocks.push({ x, y, r });
        this.place(d.key, x, y, w, rot, { shadow: 34 + rand() * 30 });
      } else {
        if (!this.isClear(x, y, w * 0.45)) continue;
        this.place(d.key, x, y, w, rand() * Math.PI * 2, { shadow: Math.round(w * (d.height ?? 0.12)), tint: d.tint });
      }
    }
  }

  // 3-2-1 marker boards counting down to the braking point of each slow corner
  // (placed for a stock car arriving at top speed), on the outside of the turn.
  buildBrakeBoards() {
    const t = this.track;
    const { n, ds, hw } = t;
    const gap = 130;
    for (const c of this.notes) {
      if (!c.brakes || c.vMin > BASE_STATS.topSpeed * 0.8) continue;
      const side = -c.dir;
      for (const k of [3, 2, 1]) {
        const i = (c.brakeIdx - Math.round(((k - 1) * gap) / ds) + n) % n;
        if (Math.abs(t.curvSmooth[i]) > 1 / 900) continue; // only on the approach straight
        const off = hw + t.kerbW + 20;
        if (t.barrierAt(i, side) < off + 40) continue;
        const x = t.cx[i] + t.nx[i] * side * off;
        const y = t.cy[i] + t.ny[i] * side * off;
        this.place(`brake_board_${k}`, x, y, 30, t.heading[i] + Math.PI / 2, { shadow: 6, depth: DEPTH.flat });
      }
    }
  }

  // ---------- per frame ----------
  update(v) {
    // ground layers follow the camera; tile offsets keep their patterns fixed in the world
    const pad = 64;
    const needW = Math.ceil(v.width + pad * 2);
    const needH = Math.ceil(v.height + pad * 2);
    if (needW > this.groundW || needH > this.groundH) {
      this.groundW = Math.max(this.groundW, needW + 256);
      this.groundH = Math.max(this.groundH, needH + 256);
      for (const l of this.layers) l.obj.setSize(this.groundW, this.groundH);
    }
    const gx = Math.floor(v.x - pad);
    const gy = Math.floor(v.y - pad);
    for (const l of this.layers) {
      l.obj.setPosition(gx, gy);
      l.obj.tilePositionX = gx / l.scale;
      l.obj.tilePositionY = gy / l.scale;
    }

    const m = 120;
    const x0 = v.x - m;
    const y0 = v.y - m;
    const x1 = v.right + m;
    const y1 = v.bottom + m;
    for (const c of this.chunks) {
      const vis = c.x1 >= x0 && c.x0 <= x1 && c.y1 >= y0 && c.y0 <= y1;
      if (vis !== c.vis) {
        c.vis = vis;
        for (const o of c.objs) o.setVisible(vis);
      }
    }
    for (const d of this.decor) {
      const vis = d.x + d.r >= x0 && d.x - d.r <= x1 && d.y + d.r >= y0 && d.y - d.r <= y1;
      if (vis !== d.vis) {
        d.vis = vis;
        for (const o of d.objs) o.setVisible(vis);
      }
    }
  }

  drawDebug() {
    const t = this.track;
    const g = this.scene.add.graphics().setDepth(DEPTH.overlay);
    g.lineStyle(3, 0xffee00, 0.9);
    g.beginPath();
    for (let i = 0; i <= t.n; i++) {
      const k = i % t.n;
      if (i === 0) g.moveTo(t.lx[k], t.ly[k]);
      else g.lineTo(t.lx[k], t.ly[k]);
    }
    g.strokePath();
    g.lineStyle(2, 0xff00ff, 0.8);
    for (let i = 0; i < t.n; i += 4) {
      g.lineBetween(t.cx[i], t.cy[i], t.cx[i] + t.nx[i] * t.bR[i], t.cy[i] + t.ny[i] * t.bR[i]);
    }
    return g;
  }
}
