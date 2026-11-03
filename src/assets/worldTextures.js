// Procedural textures for the world look: surface grain, mowing stripes,
// large-scale ground variation, cloud shadows and soft (blurred) shadows.
// All are generated once on first use and cached in the Phaser texture manager.

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
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

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Value noise that wraps around the tile edges (`cells` lattice cells across).
function valueNoise(size, cells, rand) {
  const lat = new Float32Array(cells * cells);
  for (let i = 0; i < lat.length; i++) lat[i] = rand();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const gy = (y / size) * cells;
    const y0 = Math.floor(gy);
    const ty = fade(gy - y0);
    const r0 = (y0 % cells) * cells;
    const r1 = ((y0 + 1) % cells) * cells;
    for (let x = 0; x < size; x++) {
      const gx = (x / size) * cells;
      const x0 = Math.floor(gx);
      const tx = fade(gx - x0);
      const x1 = (x0 + 1) % cells;
      const a = lat[r0 + x0] + (lat[r0 + x1] - lat[r0 + x0]) * tx;
      const b = lat[r1 + x0] + (lat[r1 + x1] - lat[r1 + x0]) * tx;
      out[y * size + x] = a + (b - a) * ty;
    }
  }
  return out;
}

// Sum of octaves ([cells, weight] pairs), stretched to the full 0..1 range.
function fbm(size, octaves, seed) {
  const rand = rng(seed);
  const out = new Float32Array(size * size);
  for (const [cells, w] of octaves) {
    const n = valueNoise(size, cells, rand);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * w;
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of out) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const k = 1 / (hi - lo || 1);
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) * k;
  return out;
}

function addCanvas(scene, key, c) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, c);
  return key;
}

function fromPixels(size, fn) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < size * size; i++) fn(i, d, i * 4);
  g.putImageData(img, 0, 0);
  return c;
}

const hexRgb = (v) => [(v >> 16) & 255, (v >> 8) & 255, v & 255];

// Near-white grain drawn with MULTIPLY over the ground and the road: worn patches,
// fine aggregate and the odd stone. Mean brightness ~0.94.
export function grainTexture(scene) {
  const key = 'fx_grain';
  if (scene.textures.exists(key)) return key;
  const S = 256;
  const patches = fbm(S, [[4, 1], [8, 0.7], [16, 0.35]], 11);
  const fine = fbm(S, [[64, 1], [128, 0.9]], 12);
  const rand = rng(13);
  const spots = new Float32Array(S * S);
  for (let k = 0; k < S * S * 0.006; k++) {
    const x = (rand() * S) | 0;
    const y = (rand() * S) | 0;
    const v = rand() < 0.6 ? -0.13 : 0.05;
    for (let o = 0; o < 4; o++) spots[((y + (o >> 1)) % S) * S + ((x + (o & 1)) % S)] = v;
  }
  const c = fromPixels(S, (i, d, p) => {
    const b = Math.min(1, 0.94 + 0.045 * (patches[i] - 0.5) * 2 + 0.035 * (fine[i] - 0.5) * 2 + spots[i]);
    const v = Math.round(Math.max(0, b) * 255);
    d[p] = v;
    d[p + 1] = v;
    d[p + 2] = Math.min(255, v + 2);
    d[p + 3] = 255;
  });
  return addCanvas(scene, key, c);
}

// Diagonal mowing stripes (white / black bands, used at low alpha). Tiles seamlessly.
export function mowTexture(scene) {
  const key = 'fx_mow';
  if (scene.textures.exists(key)) return key;
  const S = 256;
  const wob = fbm(S, [[4, 1], [8, 0.5]], 21);
  const c = fromPixels(S, (i, d, p) => {
    const x = i % S;
    const y = (i / S) | 0;
    const ph = ((x + y) % S) / S + (wob[i] - 0.5) * 0.03;
    const band = smoothstep(-0.18, 0.18, Math.sin(ph * Math.PI * 2));
    const v = Math.round(band * 255);
    d[p] = v;
    d[p + 1] = v;
    d[p + 2] = v;
    d[p + 3] = 255;
  });
  return addCanvas(scene, key, c);
}

// Large soft patches of lighter and darker ground that break up tile repetition.
export function macroTexture(scene, theme) {
  const key = `fx_macro_${theme.ground}`;
  if (scene.textures.exists(key)) return key;
  const m = theme.macro;
  const S = 256;
  const n = fbm(S, [[3, 1], [6, 0.6], [12, 0.3], [24, 0.12]], 31);
  const lo = hexRgb(m.dark);
  const hi = hexRgb(m.light);
  const c = fromPixels(S, (i, d, p) => {
    const v = (n[i] - 0.5) * 2;
    const col = v > 0 ? hi : lo;
    d[p] = col[0];
    d[p + 1] = col[1];
    d[p + 2] = col[2];
    d[p + 3] = Math.round(Math.min(1, Math.abs(v) * 1.15) * m.alpha * 255);
  });
  return addCanvas(scene, key, c);
}

// Soft blobs for drifting cloud shadows (alpha only).
export function cloudTexture(scene) {
  const key = 'fx_clouds';
  if (scene.textures.exists(key)) return key;
  const S = 256;
  const n = fbm(S, [[3, 1], [6, 0.55], [12, 0.3], [24, 0.15]], 41);
  const c = fromPixels(S, (i, d, p) => {
    d[p] = 0;
    d[p + 1] = 0;
    d[p + 2] = 0;
    d[p + 3] = Math.round(smoothstep(0.5, 0.78, n[i]) * 255);
  });
  return addCanvas(scene, key, c);
}

// Copy of a ground tile pulled toward a target colour with calmer contrast.
// grade: { color: 0xrrggbb, contrast: 0..1 }
export function gradedTile(scene, key, grade) {
  if (!grade) return key;
  const out = `${key}~graded`;
  if (scene.textures.exists(out)) return out;
  const src = scene.textures.get(key).getSourceImage();
  const c = makeCanvas(src.width, src.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let mr = 0;
  let mg = 0;
  let mb = 0;
  const px = d.length / 4;
  for (let p = 0; p < d.length; p += 4) {
    mr += d[p];
    mg += d[p + 1];
    mb += d[p + 2];
  }
  mr /= px;
  mg /= px;
  mb /= px;
  const [tr, tg, tb] = hexRgb(grade.color);
  const k = grade.contrast;
  for (let p = 0; p < d.length; p += 4) {
    d[p] = tr + (d[p] - mr) * k;
    d[p + 1] = tg + (d[p + 1] - mg) * k;
    d[p + 2] = tb + (d[p + 2] - mb) * k;
    d[p + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return addCanvas(scene, out, c);
}

// Three box-blur passes on an alpha buffer approximate a gaussian blur.
function blurAlpha(a, w, h, r) {
  const tmp = new Float32Array(a.length);
  const pass = (src, dst, horiz) => {
    const len = horiz ? w : h;
    const lines = horiz ? h : w;
    const stride = horiz ? 1 : w;
    const step = horiz ? w : 1;
    const norm = 1 / (r * 2 + 1);
    for (let l = 0; l < lines; l++) {
      const base = l * step;
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += src[base + Math.min(len - 1, Math.max(0, k)) * stride];
      for (let k = 0; k < len; k++) {
        dst[base + k * stride] = acc * norm;
        const add = Math.min(len - 1, k + r + 1);
        const sub = Math.max(0, k - r);
        acc += src[base + add * stride] - src[base + sub * stride];
      }
    }
  };
  for (let n = 0; n < 3; n++) {
    pass(a, tmp, true);
    pass(tmp, a, false);
  }
}

const shadows = new Map();

// Blurred black silhouette of a texture, stored small (it is soft anyway).
// Returns { key, scale }: draw it with the same origin as the source and
// multiply the source's scale by `scale`.
export function softShadow(scene, key, blur = 0.035) {
  const out = `${key}~shadow`;
  if (shadows.has(out) && scene.textures.exists(out)) return shadows.get(out);
  const src = scene.textures.get(key).getSourceImage();
  const big = Math.max(src.width, src.height);
  const down = Math.max(1, big / 160);
  const pad = Math.ceil((big * blur * 2.2) / down) + 2;
  const w = Math.ceil(src.width / down);
  const h = Math.ceil(src.height / down);
  const W = w + pad * 2;
  const H = h + pad * 2;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, pad, pad, w, h);
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  const a = new Float32Array(W * H);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
  blurAlpha(a, W, H, Math.max(1, Math.round((big * blur) / down)));
  for (let i = 0; i < a.length; i++) {
    d[i * 4] = 0;
    d[i * 4 + 1] = 0;
    d[i * 4 + 2] = 0;
    d[i * 4 + 3] = Math.min(255, a[i] * 1.08);
  }
  g.putImageData(img, 0, 0);
  addCanvas(scene, out, c);
  const info = { key: out, scale: down };
  shadows.set(out, info);
  return info;
}
