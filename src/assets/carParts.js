// Splits the 'car' texture into parts:
// - steerable front wheels: the two front tyres are cut out into their own
//   textures ('car_wheel_l' / 'car_wheel_r'), the body keeps holes there;
// - a paint mask: only the bodywork takes the car colour, not the tyres, the
//   driver or dark carbon parts. Painted versions are baked per colour.
// 'car' itself stays whole and unpainted (shadows). The car faces up.

// Parts of the built-in placeholder car (see drawCar in fallbacks.js).
const FALLBACK = {
  tyres: [
    { x: 6, y: 48, w: 26, h: 48 },
    { x: 96, y: 48, w: 26, h: 48 },
    { x: 2, y: 180, w: 32, h: 58 },
    { x: 94, y: 180, w: 32, h: 58 },
  ],
  driver: { cx: 64, cy: 128, rx: 11, ry: 11 },
};

// Result for RaceScene: ok=false means "draw the body without separate wheels".
// Offsets are wheel centres relative to the texture centre, in texture px.
export const carWheels = { ok: false, left: null, right: null };

const SOLID = 128;
const lum = (d, i) => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

let src = null; // unpainted car canvas
let pixels = null; // its RGBA data
let mask = null; // paint amount per pixel, 0..1
let holes = []; // front wheel boxes cut out of the body
const painted = new Map(); // colour -> full painted car canvas

// Finds the outermost tyre on one side (-1 left, 1 right) of the front or rear
// half of an AI-generated car image. Returns a box in texture px, or null.
function findTyre(d, W, H, side, rear) {
  const a = (x, y) => d[(y * W + x) * 4 + 3];
  const yMin = rear ? Math.floor(H * 0.5) : 0;
  const yMax = rear ? H : Math.floor(H * 0.5);
  const minRun = Math.floor(H * 0.1);
  const col = (k) => (side < 0 ? k : W - 1 - k);

  // longest vertical opaque run of a column within that half
  const run = (x) => {
    let best = null;
    let start = -1;
    for (let y = yMin; y <= yMax; y++) {
      const on = y < yMax && a(x, y) > SOLID;
      if (on && start < 0) start = y;
      if (!on && start >= 0) {
        if (!best || y - start > best.y1 - best.y0) best = { y0: start, y1: y };
        start = -1;
      }
    }
    return best;
  };

  // first column from the outside with a tall enough run is the tyre's outer edge
  let edge = -1;
  for (let k = 0; k < W * 0.35; k++) {
    const r = run(col(k));
    if (r && r.y1 - r.y0 >= minRun) {
      edge = k;
      break;
    }
  }
  if (edge < 0) return null;
  const r = run(col(edge + 2));
  if (!r) return null;

  // tyre width: median of each row's run from the outer edge, leaving out rows
  // where the run carries on into a suspension arm or wing (far wider than a
  // tyre). Rear tyres often touch the floor and wing on most rows; their box only
  // feeds the paint mask, where a rougher fit is fine.
  const ends = [];
  const maxW = r.y1 - r.y0;
  for (let y = r.y0; y < r.y1; y++) {
    let k = edge;
    while (k < edge + 4 && a(col(k), y) <= 12) k++; // rounded corner rows start further in
    if (a(col(k), y) <= 12) continue;
    while (k < W * 0.5 && a(col(k), y) > 12) k++;
    if (k - edge <= maxW) ends.push(k);
  }
  if (ends.length < Math.max(3, (r.y1 - r.y0) * (rear ? 0.1 : 0.3))) return null;
  ends.sort((p, q) => p - q);
  const inner = ends[ends.length >> 1];
  // include the soft outline on the outer side
  let outer = edge;
  const mid = (r.y0 + r.y1) >> 1;
  while (outer > 0 && edge - outer < 3 && a(col(outer - 1), mid) > 12) outer--;

  // height: the tyre is rounded, so take the tallest column (through the middle
  // row, outline included) but skip columns that run on into a wing
  let y0 = r.y0;
  let y1 = r.y1;
  const maxH = (r.y1 - r.y0) * 1.35;
  for (let k = outer; k < inner; k++) {
    const x = col(k);
    if (a(x, mid) <= 12) continue;
    let t = mid;
    while (t > 0 && a(x, t - 1) > 12) t--;
    let b = mid;
    while (b < H - 1 && a(x, b + 1) > 12) b++;
    if (b + 1 - t > maxH) continue;
    y0 = Math.min(y0, t);
    y1 = Math.max(y1, b + 1);
  }
  const x0 = side < 0 ? outer : W - inner;
  return { x: x0, y: y0, w: inner - outer, h: y1 - y0 };
}

function plausible(b, W, H) {
  return b && b.h >= H * 0.1 && b.h <= H * 0.3 && b.w >= W * 0.06 && b.w <= W * 0.3 && b.h > b.w;
}

function findTyres(d, W, H, rear) {
  const l = findTyre(d, W, H, -1, rear);
  const r = findTyre(d, W, H, 1, rear);
  return plausible(l, W, H) && plausible(r, W, H) && Math.abs(l.h - r.h) <= H * 0.04 ? [l, r] : null;
}

// The driver's helmet: small bright blobs on the centre line around the
// cockpit (the bodywork around it is one big blob, separated by the dark cockpit).
function findDriver(d, W, H) {
  const bright = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) bright[p] = d[p * 4 + 3] > SOLID && lum(d, p * 4) > 150 ? 1 : 0;
  const seen = new Uint8Array(W * H);
  const blobs = [];
  let total = 0;
  for (let p0 = 0; p0 < W * H; p0++) {
    if (!bright[p0] || seen[p0]) continue;
    const st = [p0];
    seen[p0] = 1;
    const b = { n: 0, x0: W, x1: 0, y0: H, y1: 0 };
    while (st.length) {
      const p = st.pop();
      const x = p % W;
      const y = (p / W) | 0;
      b.n++;
      b.x0 = Math.min(b.x0, x);
      b.x1 = Math.max(b.x1, x);
      b.y0 = Math.min(b.y0, y);
      b.y1 = Math.max(b.y1, y);
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
        if (q >= 0 && bright[q] && !seen[q]) {
          seen[q] = 1;
          st.push(q);
        }
      }
    }
    total += b.n;
    blobs.push(b);
  }
  const parts = blobs.filter((b) => {
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    return Math.abs(cx - W / 2) < W * 0.06 && cy > H * 0.25 && cy < H * 0.7 && b.n < total * 0.03 && b.x1 - b.x0 < W * 0.25;
  });
  if (!parts.length) return null;
  const x0 = Math.min(...parts.map((b) => b.x0));
  const x1 = Math.max(...parts.map((b) => b.x1));
  const y0 = Math.min(...parts.map((b) => b.y0));
  const y1 = Math.max(...parts.map((b) => b.y1));
  if (y1 - y0 > H * 0.15) return null;
  return { cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2, rx: (x1 - x0 + 1) / 2 + 1, ry: (y1 - y0 + 1) / 2 + 1 };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function buildMask(W, H, tyres, driver) {
  const m = new Float32Array(W * H);
  // dark carbon parts (floor, suspension, cockpit, outlines) stay unpainted
  for (let p = 0; p < W * H; p++) m[p] = smoothstep(45, 115, lum(pixels, p * 4));
  // tyres (dark, highlights included) stay unpainted; bodywork reaching into a
  // tyre box is much brighter and keeps its paint
  for (const b of tyres) {
    for (let y = Math.max(0, b.y - 1); y < Math.min(H, b.y + b.h + 1); y++) {
      for (let x = Math.max(0, b.x - 1); x < Math.min(W, b.x + b.w + 1); x++) {
        m[y * W + x] *= smoothstep(130, 165, lum(pixels, (y * W + x) * 4));
      }
    }
  }
  if (driver) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5 - driver.cx) / driver.rx;
        const v = (y + 0.5 - driver.cy) / driver.ry;
        if (u * u + v * v <= 1) m[y * W + x] = 0;
      }
    }
  }
  return m;
}

// custom = true for a loaded car.png (auto-detect), false for the placeholder.
export function buildCarParts(scene, custom) {
  carWheels.ok = false;
  painted.clear();
  holes = [];
  src = scene.textures.get('car').getSourceImage();
  const W = src.width;
  const H = src.height;
  const probe = makeCanvas(W, H);
  const pg = probe.getContext('2d', { willReadFrequently: true });
  pg.drawImage(src, 0, 0);
  pixels = pg.getImageData(0, 0, W, H).data;

  let front = FALLBACK.tyres.slice(0, 2);
  let rear = FALLBACK.tyres.slice(2);
  let driver = FALLBACK.driver;
  if (custom) {
    front = findTyres(pixels, W, H, false);
    rear = findTyres(pixels, W, H, true);
    driver = findDriver(pixels, W, H);
    if (!front) console.info('[assets] car: front wheels not found, steering animation off');
    if (!rear) console.info('[assets] car: rear wheels not found, they may take some paint');
    if (!driver) console.info('[assets] car: driver not found, helmet will take the paint');
  }
  mask = buildMask(W, H, [...(front || []), ...(rear || [])], driver);
  if (!front) return;

  const keys = ['car_wheel_l', 'car_wheel_r'];
  const out = [];
  front.forEach((b0, k) => {
    // 1px margin catches the tyre's soft outline
    const x = Math.max(0, b0.x - 1);
    const y = Math.max(0, b0.y - 1);
    const w = Math.min(W, b0.x + b0.w + 1) - x;
    const h = Math.min(H, b0.y + b0.h + 1) - y;
    const c = makeCanvas(w, h);
    c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, w, h);
    if (scene.textures.exists(keys[k])) scene.textures.remove(keys[k]);
    scene.textures.addCanvas(keys[k], c);
    holes.push({ x, y, w, h });
    out.push({ dx: x + w / 2 - W / 2, dy: y + h / 2 - H / 2 });
  });
  [carWheels.left, carWheels.right] = out;
  carWheels.ok = true;
}

// The whole car (wheels included) painted in `color` ('#rrggbb'), for menus and
// as the base of the on-track body. Same multiply as a tint, but masked.
export function paintedCar(color) {
  if (!src) return null;
  const key = color.toLowerCase();
  if (painted.has(key)) return painted.get(key);
  if (painted.size > 40) painted.clear(); // the garage colour picker makes many
  const n = parseInt(key.slice(1), 16);
  const tint = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const c = makeCanvas(src.width, src.height);
  const g = c.getContext('2d');
  const img = g.createImageData(src.width, src.height);
  const o = img.data;
  for (let p = 0; p < mask.length; p++) {
    const i = p * 4;
    const m = mask[p];
    o[i] = pixels[i] * (1 - m + m * tint[0]);
    o[i + 1] = pixels[i + 1] * (1 - m + m * tint[1]);
    o[i + 2] = pixels[i + 2] * (1 - m + m * tint[2]);
    o[i + 3] = pixels[i + 3];
  }
  g.putImageData(img, 0, 0);
  painted.set(key, c);
  return c;
}

// Texture key of the painted race body (front wheels cut out when they steer).
export function paintedBodyKey(scene, color) {
  const key = `car_body_${color.toLowerCase()}`;
  if (scene.textures.exists(key)) return key;
  const base = paintedCar(color);
  const c = makeCanvas(base.width, base.height);
  const g = c.getContext('2d');
  g.drawImage(base, 0, 0);
  for (const h of holes) g.clearRect(h.x, h.y, h.w, h.h);
  scene.textures.addCanvas(key, c);
  return key;
}
