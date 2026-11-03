// Cleans up AI-generated images so they drop straight into the game:
// removes a solid/checkerboard background, trims empty margins, scales down,
// and turns ground textures into seamless tiles.

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function ctx2d(c) {
  return c.getContext('2d', { willReadFrequently: true });
}

export function imageToCanvas(img, maxDim) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const s = Math.min(1, maxDim / Math.max(w, h));
  const c = makeCanvas(w * s, h * s);
  const g = ctx2d(c);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function scaleToMax(canvas, max) {
  const s = Math.min(1, max / Math.max(canvas.width, canvas.height));
  if (s >= 1) return canvas;
  const c = makeCanvas(canvas.width * s, canvas.height * s);
  const g = ctx2d(c);
  g.imageSmoothingQuality = 'high';
  g.drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

// If the border is mostly opaque, flood-fill the background colour(s) away from the edges.
export function removeBackground(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const g = ctx2d(canvas);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;

  const border = [];
  const step = Math.max(1, Math.floor(Math.min(w, h) / 64));
  for (let x = 0; x < w; x += step) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y += step) border.push(y * w, y * w + w - 1);

  let opaque = 0;
  const buckets = new Map();
  for (const p of border) {
    const i = p * 4;
    if (d[i + 3] > 240) {
      opaque++;
      const q = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
      const b = buckets.get(q) || { n: 0, r: 0, g: 0, b: 0 };
      b.n++;
      b.r += d[i];
      b.g += d[i + 1];
      b.b += d[i + 2];
      buckets.set(q, b);
    }
  }
  if (opaque < border.length * 0.6) return false; // already transparent

  // Up to two dominant border colours (handles fake checkerboard backgrounds).
  const colors = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 2)
    .filter((b) => b.n > opaque * 0.15)
    .map((b) => [b.r / b.n, b.g / b.n, b.b / b.n]);

  const TOL = 60;
  const near = (i, tol) => {
    for (const c of colors) {
      if (Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]) < tol) return true;
    }
    return false;
  };

  const visited = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  const pushIf = (p) => {
    if (visited[p]) return;
    visited[p] = 1;
    if (near(p * 4, TOL)) stack[sp++] = p;
    else visited[p] = 2; // edge pixel of the subject
  };
  for (let x = 0; x < w; x++) {
    pushIf(x);
    pushIf((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    pushIf(y * w);
    pushIf(y * w + w - 1);
  }
  while (sp > 0) {
    const p = stack[--sp];
    d[p * 4 + 3] = 0;
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) pushIf(p - 1);
    if (x < w - 1) pushIf(p + 1);
    if (y > 0) pushIf(p - w);
    if (y < h - 1) pushIf(p + w);
  }
  // Soften the halo: subject pixels touching the background that are still close to it.
  for (let p = 0; p < w * h; p++) {
    if (visited[p] === 2 && near(p * 4, TOL * 2)) d[p * 4 + 3] = 110;
  }
  g.putImageData(img, 0, 0);
  return true;
}

export function trim(canvas, pad = 2) {
  const w = canvas.width;
  const h = canvas.height;
  const d = ctx2d(canvas).getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 12) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return canvas;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad);
  y1 = Math.min(h - 1, y1 + pad);
  const c = makeCanvas(x1 - x0 + 1, y1 - y0 + 1);
  ctx2d(c).drawImage(canvas, -x0, -y0);
  return c;
}

export function mirrorTile(canvas) {
  const n = Math.min(canvas.width, canvas.height);
  const sx = (canvas.width - n) / 2;
  const sy = (canvas.height - n) / 2;
  const c = makeCanvas(n * 2, n * 2);
  const g = ctx2d(c);
  const draw = (fx, fy, ox, oy) => {
    g.save();
    g.translate(ox + (fx < 0 ? n : 0), oy + (fy < 0 ? n : 0));
    g.scale(fx, fy);
    g.drawImage(canvas, sx, sy, n, n, 0, 0, n, n);
    g.restore();
  };
  draw(1, 1, 0, 0);
  draw(-1, 1, n, 0);
  draw(1, -1, 0, n);
  draw(-1, -1, n, n);
  return c;
}

// How visible the wrap-around seam is, relative to normal pixel-to-pixel change.
// About 1 means the texture already tiles seamlessly.
export function seamRatio(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const d = ctx2d(canvas).getImageData(0, 0, w, h).data;
  const diff = (a, b) => Math.abs(d[a] - d[b]) + Math.abs(d[a + 1] - d[b + 1]) + Math.abs(d[a + 2] - d[b + 2]);
  let inner = 0;
  let ni = 0;
  let seam = 0;
  let ns = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w - 1; x += 2) {
      inner += diff((y * w + x) * 4, (y * w + x + 1) * 4);
      ni++;
    }
    seam += diff(y * w * 4, (y * w + w - 1) * 4);
    ns++;
  }
  for (let x = 0; x < w; x += 2) {
    for (let y = 0; y < h - 1; y += 2) {
      inner += diff((y * w + x) * 4, ((y + 1) * w + x) * 4);
      ni++;
    }
    seam += diff(x * 4, ((h - 1) * w + x) * 4);
    ns++;
  }
  return seam / ns / Math.max(1, inner / ni);
}

// The full clean-up for one manifest entry. Also run ahead of time by
// tools/optimize-images.mjs, which saves the result as a small WebP.
export function normalizeImage(src, entry) {
  let c;
  if (entry.kind === 'tile') {
    c = imageToCanvas(src, entry.max);
    const ratio = seamRatio(c);
    const mirror = ratio > 1.8;
    if (mirror) c = mirrorTile(c);
    console.info(`[assets] ${entry.key}: seam ratio ${ratio.toFixed(2)} -> ${mirror ? 'mirrored to hide seams' : 'used as-is'}`);
  } else {
    c = imageToCanvas(src, Math.max(entry.max * 2, 512));
    removeBackground(c);
    c = scaleToMax(trim(c), entry.max);
  }
  return c;
}

// Replace a loaded Phaser texture with its normalised canvas version.
export function normalizeTexture(scene, entry) {
  const c = normalizeImage(scene.textures.get(entry.key).getSourceImage(), entry);
  scene.textures.remove(entry.key);
  scene.textures.addCanvas(entry.key, c);
  return c;
}
