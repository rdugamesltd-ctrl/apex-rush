// GPU vector layers. Phaser's Graphics objects re-transform and re-batch every
// triangle on the CPU each frame, which is most of the frame time on phones.
// A GeoLayer keeps its triangles in a WebGL vertex buffer instead: static track
// geometry is uploaded once and drawn with one call per visible run, skid marks
// go into a ring buffer, and per-frame overlays rebuild a small dynamic buffer.
//
// Shapes are recorded through a Graphics-like API (fillStyle, fillTriangle,
// fillRect, fillPoints, lineStyle, lineBetween, strokePoints), so drawing code
// works with either a recorder or a real Graphics (the Canvas renderer fallback).

const VERT = `
precision highp float;
attribute vec2 aPos;
attribute vec4 aColor;
uniform vec3 uRowX;
uniform vec3 uRowY;
varying vec4 vColor;
void main() {
  vec3 p = vec3(aPos, 1.0);
  gl_Position = vec4(dot(uRowX, p), dot(uRowY, p), 0.0, 1.0);
  vColor = aColor;
}`;

const FRAG = `
precision mediump float;
uniform float uAlpha;
varying vec4 vColor;
void main() {
  gl_FragColor = vColor * uAlpha;
}`;

const STRIDE = 12; // bytes per vertex: x, y (float32) + premultiplied RGBA (4 x uint8)

// Colour + alpha -> premultiplied RGBA packed for a little-endian Uint32 view.
function premul(color, alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  const r = Math.round(((color >> 16) & 255) * a);
  const g = Math.round(((color >> 8) & 255) * a);
  const b = Math.round((color & 255) * a);
  return (r | (g << 8) | (b << 16) | (Math.round(a * 255) << 24)) >>> 0;
}

// Growable interleaved vertex store.
class Verts {
  constructor(cap = 1024) {
    this.alloc(cap);
    this.count = 0;
  }

  alloc(cap) {
    const old = this.buf;
    this.cap = cap;
    this.buf = new ArrayBuffer(cap * STRIDE);
    this.f = new Float32Array(this.buf);
    this.u = new Uint32Array(this.buf);
    if (old) new Uint8Array(this.buf).set(new Uint8Array(old, 0, Math.min(old.byteLength, this.buf.byteLength)));
  }

  push(x, y, c) {
    if (this.count >= this.cap) this.alloc(this.cap * 2);
    const o = this.count * 3;
    this.f[o] = x;
    this.f[o + 1] = y;
    this.u[o + 2] = c;
    this.count++;
  }
}

// Graphics-like shape recorder writing triangles into a vertex store.
class Recorder {
  constructor(out) {
    this.out = out; // { push(x, y, c), reserve?(n) }
    this.fc = premul(0xffffff, 1);
    this.lc = this.fc;
    this.lw = 1;
  }

  fillStyle(color, alpha = 1) {
    this.fc = premul(color, alpha);
    return this;
  }

  lineStyle(width, color, alpha = 1) {
    this.lw = width;
    this.lc = premul(color, alpha);
    return this;
  }

  tri(x1, y1, x2, y2, x3, y3, c) {
    const o = this.out;
    o.reserve?.(3);
    o.push(x1, y1, c);
    o.push(x2, y2, c);
    o.push(x3, y3, c);
  }

  quad(x1, y1, x2, y2, x3, y3, x4, y4, c) {
    const o = this.out;
    o.reserve?.(6);
    o.push(x1, y1, c);
    o.push(x2, y2, c);
    o.push(x3, y3, c);
    o.push(x1, y1, c);
    o.push(x3, y3, c);
    o.push(x4, y4, c);
  }

  fillTriangle(x1, y1, x2, y2, x3, y3) {
    this.tri(x1, y1, x2, y2, x3, y3, this.fc);
    return this;
  }

  fillRect(x, y, w, h) {
    this.quad(x, y, x + w, y, x + w, y + h, x, y + h, this.fc);
    return this;
  }

  // Convex polygon (used for quads), fanned from the first point.
  fillPoints(pts) {
    for (let k = 1; k < pts.length - 1; k++) {
      this.tri(pts[0].x, pts[0].y, pts[k].x, pts[k].y, pts[k + 1].x, pts[k + 1].y, this.fc);
    }
    return this;
  }

  lineBetween(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l = Math.hypot(dx, dy);
    if (l < 1e-6) return this;
    const h = this.lw / 2;
    const nx = (-dy / l) * h;
    const ny = (dx / l) * h;
    this.quad(x1 + nx, y1 + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny, x1 - nx, y1 - ny, this.lc);
    return this;
  }

  // Polyline with mitred joins (no overlaps, so translucent strokes stay even).
  strokePoints(pts, closed = false) {
    const n = pts.length;
    if (n < 2) return this;
    const h = this.lw / 2;
    const off = [];
    for (let k = 0; k < n; k++) {
      const p = pts[k];
      const a = pts[closed ? (k - 1 + n) % n : Math.max(0, k - 1)];
      const b = pts[closed ? (k + 1) % n : Math.min(n - 1, k + 1)];
      let ax = p.x - a.x;
      let ay = p.y - a.y;
      let bx = b.x - p.x;
      let by = b.y - p.y;
      const la = Math.hypot(ax, ay) || 1;
      const lb = Math.hypot(bx, by) || 1;
      ax /= la;
      ay /= la;
      bx /= lb;
      by /= lb;
      if (k === 0 && !closed) [ax, ay] = [bx, by];
      if (k === n - 1 && !closed) [bx, by] = [ax, ay];
      let mx = -(ay + by);
      let my = ax + bx;
      const ml = Math.hypot(mx, my) || 1;
      mx /= ml;
      my /= ml;
      const s = Math.min(3, 1 / Math.max(0.2, mx * -ay + my * ax));
      off.push([mx * h * s, my * h * s]);
    }
    const segs = closed ? n : n - 1;
    for (let k = 0; k < segs; k++) {
      const j = (k + 1) % n;
      const p = pts[k];
      const q = pts[j];
      const [ox, oy] = off[k];
      const [qx, qy] = off[j];
      this.quad(p.x + ox, p.y + oy, q.x + qx, q.y + qy, q.x - qx, q.y - qy, p.x - ox, p.y - oy, this.lc);
    }
    return this;
  }
}

// A culling unit inside a static layer: records shapes, then becomes a vertex range.
class Segment extends Recorder {
  constructor(layer, order) {
    super(new Verts(256));
    this.layer = layer;
    this.order = order;
    this.sub = 0;
    this.visible = true;
    this.start = 0;
    this.count = 0;
  }

  setVisible(v) {
    this.visible = v;
    return this;
  }

  setDepth() {
    return this;
  }
}

// GL program per context generation (rebuilt after a lost context is restored).
const programs = new WeakMap();

function getProgram(renderer) {
  const gl = renderer.gl;
  let p = programs.get(gl);
  if (p && p.gen === renderer.__geoGen) return p;
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.bindAttribLocation(prog, 1, 'aColor');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  p = {
    gen: renderer.__geoGen,
    prog,
    rowX: gl.getUniformLocation(prog, 'uRowX'),
    rowY: gl.getUniformLocation(prog, 'uRowY'),
    alpha: gl.getUniformLocation(prog, 'uAlpha'),
  };
  programs.set(gl, p);
  return p;
}

export const webglAvailable = (scene) => scene.renderer.type === Phaser.WEBGL;

// mode: 'static' (segments, uploaded once), 'dynamic' (cleared and rebuilt) or
// 'ring' (fixed capacity in vertices, oldest shapes overwritten).
export class GeoLayer extends Phaser.GameObjects.Extern {
  constructor(scene, depth, { mode = 'static', capacity = 0 } = {}) {
    super(scene);
    scene.add.existing(this);
    this.setDepth(depth);
    this.mode = mode;
    this.verts = new Verts(mode === 'ring' ? capacity : 1024);
    this.segments = [];
    this.runs = [];
    this.dirty = true;
    this.dirtyLo = 0;
    this.dirtyHi = 0;
    this.hi = 0; // ring: highest vertex index ever written
    this.glBuf = null;
    this.glGen = -1;
    this.glCap = 0;
    const r = scene.renderer;
    if (r.__geoGen === undefined) {
      r.__geoGen = 0;
      r.on?.(Phaser.Renderer.Events.RESTORE_WEBGL, () => r.__geoGen++);
    }
    if (mode !== 'static') {
      const v = this.verts;
      const layer = this;
      this.rec = new Recorder({
        push(x, y, c) {
          v.push(x, y, c);
        },
        reserve(n) {
          if (mode !== 'ring') return;
          if (v.count + n > v.cap) v.count = 0;
          const lo = v.count;
          layer.dirtyLo = layer.dirty ? Math.min(layer.dirtyLo, lo) : lo;
          layer.dirtyHi = layer.dirty ? Math.max(layer.dirtyHi, lo + n) : lo + n;
          layer.dirty = true;
          layer.hi = Math.max(layer.hi, lo + n);
        },
      });
    }
  }

  // ---------- static ----------
  segment() {
    const s = new Segment(this, this.segments.length);
    this.segments.push(s);
    return s;
  }

  // Concatenate all segments (sorted by sub-depth, then creation order) into one buffer.
  finish() {
    const segs = this.segments.filter((s) => s.out.count > 0);
    segs.sort((a, b) => a.sub - b.sub || a.order - b.order);
    let total = 0;
    for (const s of segs) total += s.out.count;
    const v = new Verts(Math.max(1, total));
    const bytes = new Uint8Array(v.buf);
    for (const s of segs) {
      s.start = v.count;
      s.count = s.out.count;
      bytes.set(new Uint8Array(s.out.buf, 0, s.count * STRIDE), v.count * STRIDE);
      v.count += s.count;
      s.out = null; // free the recording
    }
    this.verts = v;
    this.segments = segs;
    this.dirty = true;
    return this;
  }

  // ---------- dynamic ----------
  clear() {
    this.verts.count = 0;
    this.dirty = true;
    return this;
  }

  // ---------- rendering ----------
  upload(gl) {
    const v = this.verts;
    const gen = this.scene.renderer.__geoGen;
    if (!this.glBuf || this.glGen !== gen) {
      this.glBuf = gl.createBuffer();
      this.glGen = gen;
      this.glCap = 0;
      this.dirty = true;
      this.dirtyLo = 0;
      this.dirtyHi = this.mode === 'ring' ? this.hi : v.count;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuf);
    if (!this.dirty) return;
    if (this.mode === 'ring') {
      if (this.glCap !== v.cap) {
        gl.bufferData(gl.ARRAY_BUFFER, v.buf, gl.DYNAMIC_DRAW);
        this.glCap = v.cap;
      } else if (this.dirtyHi > this.dirtyLo) {
        gl.bufferSubData(gl.ARRAY_BUFFER, this.dirtyLo * STRIDE, new Uint8Array(v.buf, this.dirtyLo * STRIDE, (this.dirtyHi - this.dirtyLo) * STRIDE));
      }
    } else if (this.mode === 'static') {
      gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(v.buf, 0, v.count * STRIDE), gl.STATIC_DRAW);
    } else if (v.count * STRIDE > this.glCap) {
      this.glCap = v.buf.byteLength;
      gl.bufferData(gl.ARRAY_BUFFER, v.buf, gl.DYNAMIC_DRAW);
    } else if (v.count) {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Uint8Array(v.buf, 0, v.count * STRIDE));
    }
    this.dirty = false;
  }

  // Visible vertex ranges, neighbouring ranges merged into one draw.
  visibleRuns() {
    const runs = this.runs;
    runs.length = 0;
    if (this.mode === 'ring') {
      if (this.hi) runs.push(0, this.hi);
      return runs;
    }
    if (this.mode === 'dynamic') {
      if (this.verts.count) runs.push(0, this.verts.count);
      return runs;
    }
    let start = -1;
    let end = -1;
    for (const s of this.segments) {
      if (!s.visible) continue;
      if (s.start === end) end += s.count;
      else {
        if (start >= 0) runs.push(start, end - start);
        start = s.start;
        end = s.start + s.count;
      }
    }
    if (start >= 0) runs.push(start, end - start);
    return runs;
  }

  render(renderer, camera, m) {
    const runs = this.visibleRuns();
    if (!runs.length || renderer.contextLost) return;
    const gl = renderer.gl;
    const p = getProgram(renderer);
    this.upload(gl);
    const P = renderer.projectionMatrix?.val;
    const p0 = P ? P[0] : 2 / renderer.width;
    const p5 = P ? P[5] : -2 / renderer.height;
    const p12 = P ? P[12] : -1;
    const p13 = P ? P[13] : 1;
    gl.useProgram(p.prog);
    gl.uniform3f(p.rowX, p0 * m.a, p0 * m.c, p0 * m.e + p12);
    gl.uniform3f(p.rowY, p5 * m.b, p5 * m.d, p5 * m.f + p13);
    gl.uniform1f(p.alpha, this.alpha * camera.alpha);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE, 0);
    gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, STRIDE, 8);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    for (let k = 0; k < runs.length; k += 2) gl.drawArrays(gl.TRIANGLES, runs[k], runs[k + 1]);
    gl.disableVertexAttribArray(1);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  preDestroy() {
    const gl = this.scene?.renderer?.gl;
    if (gl && this.glBuf && this.glGen === this.scene.renderer.__geoGen) gl.deleteBuffer(this.glBuf);
    this.glBuf = null;
  }
}

// Static vector geometry split over a few depth groups. `seg(depth)` returns a
// recorder for that depth (or a real Graphics on the Canvas renderer). Depths
// inside one group draw in depth order within the group's single layer.
export class StaticGeometry {
  // groups: [[layerDepth, minDepth, maxDepth], ...]
  constructor(scene, groups) {
    this.scene = scene;
    this.gl = webglAvailable(scene);
    this.groups = this.gl ? groups.map(([depth, lo, hi]) => ({ lo, hi, layer: new GeoLayer(scene, depth) })) : [];
  }

  seg(depth) {
    if (!this.gl) return this.scene.add.graphics().setDepth(depth);
    const g = this.groups.find((gr) => depth >= gr.lo && depth <= gr.hi);
    if (!g) return this.scene.add.graphics().setDepth(depth);
    const s = g.layer.segment();
    s.sub = depth;
    return s;
  }

  finish() {
    for (const g of this.groups) g.layer.finish();
  }
}
