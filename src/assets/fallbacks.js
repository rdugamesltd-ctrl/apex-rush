// Procedural placeholder art. Every manifest key has a drawing here so the game
// is fully playable before any generated PNGs are added to assets/images/.
import { GAME_TITLE } from '../config.js';

const DISPLAY_FONT = '"Exo 2", "Segoe UI", Roboto, Arial, sans-serif';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
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

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function circle(g, x, y, r, fill) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
}

function line(g, x1, y1, x2, y2) {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
}

function speckle(g, size, n, colors, rMin, rMax, seed, alpha = 0.5) {
  const r = rng(seed);
  g.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    circle(g, r() * size, r() * size, rMin + r() * (rMax - rMin), colors[(r() * colors.length) | 0]);
  }
  g.globalAlpha = 1;
}

// ---------- car ----------
function tyre(g, x, y, w, h) {
  rr(g, x, y, w, h, 7);
  g.fillStyle = '#1c1c22';
  g.fill();
  g.fillStyle = '#34343e';
  for (let ty = y + 5; ty < y + h - 4; ty += 7) g.fillRect(x + 4, ty, w - 8, 2);
  g.fillStyle = '#44444f';
  g.fillRect(x + 3, y + 6, 3, h - 12);
}

function drawCar() {
  const c = makeCanvas(128, 264);
  const g = c.getContext('2d');
  const OUT = '#16171d';
  g.lineJoin = 'round';
  g.lineCap = 'round';

  g.strokeStyle = OUT;
  g.lineWidth = 4;
  line(g, 30, 64, 56, 86);
  line(g, 30, 84, 56, 94);
  line(g, 98, 64, 72, 86);
  line(g, 98, 84, 72, 94);
  line(g, 32, 198, 52, 190);
  line(g, 32, 216, 52, 210);
  line(g, 96, 198, 76, 190);
  line(g, 96, 216, 76, 210);

  tyre(g, 6, 48, 26, 48);
  tyre(g, 96, 48, 26, 48);
  tyre(g, 2, 180, 32, 58);
  tyre(g, 94, 180, 32, 58);

  // rear wing
  g.fillStyle = OUT;
  g.fillRect(12, 232, 7, 28);
  g.fillRect(109, 232, 7, 28);
  rr(g, 16, 236, 96, 20, 4);
  g.fillStyle = '#ffffff';
  g.fill();
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = '#cfd0d8';
  g.fillRect(20, 248, 88, 5);

  // body
  g.beginPath();
  g.moveTo(57, 26);
  g.lineTo(71, 26);
  g.bezierCurveTo(76, 60, 78, 84, 80, 100);
  g.bezierCurveTo(98, 108, 103, 124, 103, 150);
  g.bezierCurveTo(103, 184, 92, 218, 76, 240);
  g.lineTo(52, 240);
  g.bezierCurveTo(36, 218, 25, 184, 25, 150);
  g.bezierCurveTo(25, 124, 30, 108, 48, 100);
  g.bezierCurveTo(50, 84, 52, 60, 57, 26);
  g.closePath();
  g.fillStyle = '#ffffff';
  g.fill();
  g.lineWidth = 3;
  g.stroke();

  // livery shading (light grey becomes a darker shade of the car colour)
  g.fillStyle = '#d4d5dc';
  g.beginPath();
  g.moveTo(30, 150);
  g.bezierCurveTo(30, 186, 40, 214, 54, 236);
  g.lineTo(60, 236);
  g.bezierCurveTo(48, 210, 40, 184, 40, 150);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(98, 150);
  g.bezierCurveTo(98, 186, 88, 214, 74, 236);
  g.lineTo(68, 236);
  g.bezierCurveTo(80, 210, 88, 184, 88, 150);
  g.closePath();
  g.fill();
  g.fillStyle = '#c4c5ce';
  g.fillRect(61, 32, 6, 62);

  // sidepod intakes
  g.fillStyle = OUT;
  g.beginPath();
  g.ellipse(38, 120, 6, 11, -0.3, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(90, 120, 6, 11, 0.3, 0, Math.PI * 2);
  g.fill();

  // cockpit + driver
  g.fillStyle = '#25262e';
  g.beginPath();
  g.ellipse(64, 134, 13, 28, 0, 0, Math.PI * 2);
  g.fill();
  circle(g, 64, 128, 10, '#e9e9ee');
  g.fillStyle = '#2d2e38';
  g.fillRect(56, 120, 16, 5);
  g.strokeStyle = '#34353f';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(64, 130, 17, Math.PI * 1.1, Math.PI * 1.9);
  g.stroke();

  // engine cover detail
  g.strokeStyle = '#b5b6c0';
  g.lineWidth = 3;
  line(g, 64, 168, 64, 228);

  // front wing
  g.fillStyle = OUT;
  g.fillRect(3, 8, 7, 30);
  g.fillRect(118, 8, 7, 30);
  rr(g, 6, 14, 116, 18, 6);
  g.fillStyle = '#ffffff';
  g.fill();
  g.strokeStyle = OUT;
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = '#cfd0d8';
  g.fillRect(12, 25, 104, 4);
  return c;
}

// ---------- ground tiles ----------
function drawGrass() {
  const s = 256;
  const c = makeCanvas(s, s);
  const g = c.getContext('2d');
  g.fillStyle = '#55a34a';
  g.fillRect(0, 0, s, s);
  speckle(g, s, 140, ['#4c9842', '#5daf51', '#4a9440'], 6, 18, 11, 0.45);
  speckle(g, s, 260, ['#62b555', '#47903d'], 1.5, 3.5, 12, 0.7);
  return c;
}

function drawSand() {
  const s = 256;
  const c = makeCanvas(s, s);
  const g = c.getContext('2d');
  g.fillStyle = '#e6c58c';
  g.fillRect(0, 0, s, s);
  speckle(g, s, 120, ['#dcb87a', '#efd3a3', '#d9b374'], 6, 20, 21, 0.4);
  g.strokeStyle = 'rgba(190,150,90,0.25)';
  g.lineWidth = 2;
  const r = rng(22);
  for (let i = 0; i < 14; i++) {
    const x = r() * s;
    const y = r() * s;
    g.beginPath();
    g.arc(x, y + 40, 40 + r() * 30, Math.PI * 1.2, Math.PI * 1.8);
    g.stroke();
  }
  speckle(g, s, 200, ['#c9a466', '#f5ddb2'], 1, 2.5, 23, 0.7);
  return c;
}

function drawConcrete() {
  const s = 256;
  const c = makeCanvas(s, s);
  const g = c.getContext('2d');
  g.fillStyle = '#9097a0';
  g.fillRect(0, 0, s, s);
  speckle(g, s, 90, ['#878e97', '#99a0a9'], 8, 24, 31, 0.35);
  speckle(g, s, 300, ['#7c838c', '#a7aeb6'], 1, 2.2, 32, 0.6);
  g.strokeStyle = '#7b828b';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 125, 125);
  g.strokeRect(129.5, 1.5, 125, 125);
  g.strokeRect(1.5, 129.5, 125, 125);
  g.strokeRect(129.5, 129.5, 125, 125);
  return c;
}

// ---------- scenery ----------
function drawTreeRound() {
  const c = makeCanvas(200, 200);
  const g = c.getContext('2d');
  const r = rng(41);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    circle(g, 100 + Math.cos(a) * 58, 100 + Math.sin(a) * 58, 34 + r() * 6, '#2f7d33');
  }
  circle(g, 100, 100, 70, '#3a8f3c');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    circle(g, 92 + Math.cos(a) * 36, 92 + Math.sin(a) * 36, 22 + r() * 6, '#48a546');
  }
  circle(g, 84, 82, 26, '#5bbb55');
  circle(g, 74, 72, 12, '#72cc66');
  return c;
}

function drawTreePine() {
  const c = makeCanvas(200, 200);
  const g = c.getContext('2d');
  const star = (n, ro, ri, rot, fill) => {
    g.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const rad = i % 2 ? ri : ro;
      const a = rot + (i / (n * 2)) * Math.PI * 2;
      g.lineTo(100 + Math.cos(a) * rad, 100 + Math.sin(a) * rad);
    }
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  star(10, 96, 66, 0, '#1f5e34');
  star(9, 74, 48, 0.3, '#2c7a42');
  star(8, 50, 30, 0.1, '#3d9553');
  circle(g, 100, 100, 14, '#5aae68');
  return c;
}

function drawBush() {
  const c = makeCanvas(140, 110);
  const g = c.getContext('2d');
  const blobs = [
    [45, 60, 32],
    [80, 48, 34],
    [100, 70, 28],
    [64, 78, 28],
  ];
  for (const [x, y, r] of blobs) circle(g, x, y, r, '#3f8f3a');
  for (const [x, y, r] of blobs) circle(g, x - 6, y - 7, r * 0.6, '#55aa4c');
  const r = rng(51);
  for (let i = 0; i < 7; i++) circle(g, 30 + r() * 80, 35 + r() * 50, 3.5, i % 2 ? '#ffd94a' : '#ff7aa8');
  return c;
}

function drawGrandstand() {
  const W = 520;
  const H = 220;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  // roof at the back (top of the image)
  g.fillStyle = '#3d5a8a';
  g.fillRect(0, 0, W, 72);
  g.fillStyle = '#34507c';
  for (let x = 6; x < W; x += 14) g.fillRect(x, 0, 6, 72);
  g.fillStyle = '#2a3f62';
  g.fillRect(0, 68, W, 6);
  // seating with crowd, front faces the bottom of the image
  g.fillStyle = '#cfd4dc';
  g.fillRect(0, 74, W, 132);
  g.fillStyle = '#b9bfc9';
  for (let y = 78; y < 200; y += 16) g.fillRect(0, y + 11, W, 3);
  const r = rng(61);
  const shirts = ['#e63946', '#ffd31a', '#3a7bff', '#18b26b', '#ff7a1a', '#e83a8e', '#8a4dff', '#ffffff', '#00c2d6'];
  for (let y = 84; y < 200; y += 16) {
    for (let x = 8; x < W - 6; x += 13) {
      if (r() < 0.12) continue;
      const jx = x + (r() - 0.5) * 3;
      circle(g, jx, y + 3, 5.5, shirts[(r() * shirts.length) | 0]);
      circle(g, jx, y, 3.2, ['#3b2a20', '#f1c27d', '#8d5524', '#e0ac69', '#2b2b2b'][(r() * 5) | 0]);
    }
  }
  g.fillStyle = '#eef0f3';
  g.fillRect(0, 204, W, 16);
  g.strokeStyle = '#9aa1ad';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, W - 3, H - 3);
  return c;
}

function drawTireStack() {
  const c = makeCanvas(110, 110);
  const g = c.getContext('2d');
  const spots = [
    [32, 32],
    [78, 32],
    [32, 78],
    [78, 78],
  ];
  spots.forEach(([x, y], i) => {
    circle(g, x, y, 24, '#1d1d24');
    g.strokeStyle = i % 2 ? '#e63946' : '#f4f4f4';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(x, y, 17, 0, Math.PI * 2);
    g.stroke();
    circle(g, x, y, 10, '#2c2c35');
  });
  return c;
}

function drawPitBuilding() {
  const W = 900;
  const H = 240;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#d9dde3';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#c3c8d0';
  for (let x = 0; x < W; x += 60) g.fillRect(x, 0, 4, H - 34);
  g.fillStyle = '#a9b0ba';
  [
    [60, 40],
    [240, 60],
    [470, 36],
    [700, 70],
  ].forEach(([x, y]) => {
    g.fillRect(x, y, 70, 50);
    circle(g, x + 35, y + 25, 16, '#8d95a1');
  });
  g.fillStyle = '#9fd3ff';
  for (let x = 140; x < W - 100; x += 180) g.fillRect(x, 130, 90, 30);
  g.fillStyle = '#e04848';
  g.fillRect(0, H - 34, W, 14);
  g.fillStyle = '#f4f4f4';
  g.fillRect(0, H - 20, W, 20);
  g.strokeStyle = '#99a0ab';
  g.lineWidth = 4;
  g.strokeRect(2, 2, W - 4, H - 4);
  return c;
}

function drawCactus() {
  const c = makeCanvas(140, 140);
  const g = c.getContext('2d');
  g.strokeStyle = '#2f7d45';
  g.lineCap = 'round';
  g.lineWidth = 24;
  line(g, 70, 70, 26, 52);
  line(g, 70, 70, 112, 84);
  line(g, 70, 70, 60, 120);
  g.strokeStyle = '#47a35d';
  g.lineWidth = 14;
  line(g, 70, 70, 28, 52);
  line(g, 70, 70, 110, 84);
  line(g, 70, 70, 61, 118);
  circle(g, 70, 70, 26, '#3a9150');
  circle(g, 66, 66, 16, '#5bbd70');
  g.fillStyle = '#f4f0d0';
  const r = rng(71);
  for (let i = 0; i < 30; i++) g.fillRect(20 + r() * 100, 30 + r() * 95, 2, 2);
  return c;
}

function drawRock() {
  const c = makeCanvas(150, 120);
  const g = c.getContext('2d');
  const poly = (pts, fill) => {
    g.beginPath();
    pts.forEach(([x, y]) => g.lineTo(x, y));
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  poly([[14, 70], [36, 22], [86, 10], [132, 34], [140, 80], [104, 110], [42, 108]], '#8d837a');
  poly([[36, 22], [86, 10], [96, 44], [52, 56]], '#b2a89e');
  poly([[96, 44], [132, 34], [140, 80], [104, 74]], '#a0968c');
  poly([[52, 56], [96, 44], [104, 74], [70, 86]], '#c3bab0');
  poly([[14, 70], [52, 56], [70, 86], [42, 108]], '#766d65');
  return c;
}

function drawRoof(seed, base, dark, accent) {
  const W = 360;
  const H = 280;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = dark;
  g.lineWidth = 10;
  g.strokeRect(5, 5, W - 10, H - 10);
  const r = rng(seed);
  for (let i = 0; i < 5; i++) {
    const x = 30 + r() * (W - 110);
    const y = 30 + r() * (H - 110);
    g.fillStyle = accent;
    g.fillRect(x, y, 50 + r() * 30, 40 + r() * 20);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(x + 6, y + 6, 20, 12);
  }
  circle(g, W - 70, H - 70, 26, dark);
  circle(g, W - 70, H - 70, 18, accent);
  return c;
}

function drawSign() {
  const c = makeCanvas(110, 110);
  const g = c.getContext('2d');
  g.translate(55, 55);
  g.rotate(Math.PI / 4);
  rr(g, -36, -36, 72, 72, 10);
  g.fillStyle = '#ffcc1a';
  g.fill();
  g.strokeStyle = '#2a2a30';
  g.lineWidth = 6;
  g.stroke();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.strokeStyle = '#1f1f25';
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(42, 82);
  g.lineTo(42, 58);
  g.quadraticCurveTo(42, 42, 60, 42);
  g.lineTo(66, 42);
  g.stroke();
  g.fillStyle = '#1f1f25';
  g.beginPath();
  g.moveTo(78, 42);
  g.lineTo(62, 30);
  g.lineTo(62, 54);
  g.closePath();
  g.fill();
  return c;
}

// ---------- UI icons ----------
function iconBase(bg) {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  rr(g, 6, 6, 116, 116, 26);
  g.fillStyle = bg;
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.18)';
  rr(g, 6, 6, 116, 54, 26);
  g.fill();
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#ffffff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  return { c, g };
}

function iconEngine() {
  const { c, g } = iconBase('#ff7a1a');
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? 30 : 40;
    g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  circle(g, 64, 64, 13, '#ff7a1a');
  return c;
}

function iconTurbo() {
  const { c, g } = iconBase('#f2b705');
  g.beginPath();
  g.moveTo(72, 18);
  g.lineTo(36, 70);
  g.lineTo(60, 70);
  g.lineTo(52, 110);
  g.lineTo(92, 54);
  g.lineTo(68, 54);
  g.closePath();
  g.fill();
  return c;
}

function iconTires() {
  const { c, g } = iconBase('#18a99c');
  circle(g, 64, 64, 42, '#1d1d24');
  circle(g, 64, 64, 26, '#ffffff');
  circle(g, 64, 64, 10, '#18a99c');
  g.strokeStyle = '#3a3a44';
  g.lineWidth = 4;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    line(g, 64 + Math.cos(a) * 32, 64 + Math.sin(a) * 32, 64 + Math.cos(a) * 41, 64 + Math.sin(a) * 41);
  }
  return c;
}

function iconBrakes() {
  const { c, g } = iconBase('#e63946');
  circle(g, 64, 64, 40, '#ffffff');
  circle(g, 64, 64, 14, '#e63946');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    circle(g, 64 + Math.cos(a) * 27, 64 + Math.sin(a) * 27, 4, '#e63946');
  }
  rr(g, 82, 30, 20, 44, 8);
  g.fillStyle = '#2a2a33';
  g.fill();
  return c;
}

function iconAero() {
  const { c, g } = iconBase('#3a7bff');
  g.fillRect(22, 46, 84, 16);
  g.fillRect(22, 68, 84, 10);
  g.fillRect(18, 38, 8, 50);
  g.fillRect(102, 38, 8, 50);
  g.fillRect(58, 78, 12, 22);
  g.lineWidth = 5;
  g.globalAlpha = 0.7;
  line(g, 30, 30, 98, 30);
  line(g, 40, 22, 88, 22);
  g.globalAlpha = 1;
  return c;
}

function iconCoin() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 10, 0, 118);
  grad.addColorStop(0, '#ffe066');
  grad.addColorStop(1, '#f0a20f');
  g.beginPath();
  g.arc(64, 64, 54, 0, Math.PI * 2);
  g.fillStyle = grad;
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#c97f08';
  g.stroke();
  g.beginPath();
  g.arc(64, 64, 40, 0, Math.PI * 2);
  g.strokeStyle = '#e39a10';
  g.lineWidth = 5;
  g.stroke();
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 12 : 26;
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    g.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = '#d98a0b';
  g.fill();
  return c;
}

function iconTrophy() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#f5b51a';
  g.strokeStyle = '#f5b51a';
  g.lineWidth = 9;
  g.beginPath();
  g.arc(30, 44, 14, Math.PI * 0.5, Math.PI * 1.5, false);
  g.stroke();
  g.beginPath();
  g.arc(98, 44, 14, Math.PI * 1.5, Math.PI * 0.5, false);
  g.stroke();
  g.beginPath();
  g.moveTo(28, 20);
  g.lineTo(100, 20);
  g.bezierCurveTo(100, 66, 84, 80, 64, 80);
  g.bezierCurveTo(44, 80, 28, 66, 28, 20);
  g.fill();
  g.fillRect(56, 78, 16, 22);
  rr(g, 36, 98, 56, 18, 5);
  g.fillStyle = '#d18a06';
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.fillRect(40, 26, 10, 34);
  return c;
}

// ---------- extra themes ----------
// Ground tile: base colour, soft blotches, fine grain, then an optional overlay.
function groundTile(base, blots, grain, seed, extra) {
  const s = 256;
  const c = makeCanvas(s, s);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  speckle(g, s, 120, blots, 6, 22, seed, 0.4);
  if (extra) extra(g, s, rng(seed + 1));
  speckle(g, s, 260, grain, 1, 2.8, seed + 2, 0.65);
  return c;
}

const drawAutumn = () =>
  groundTile('#7f9440', ['#71883a', '#8ea04a', '#6c7f36'], ['#97a957', '#5f7230'], 101, (g, s, r) => {
    // fallen leaves
    const leaves = ['#e2832b', '#cf5a22', '#f0b13a', '#b8452a'];
    for (let i = 0; i < 90; i++) {
      g.save();
      g.translate(r() * s, r() * s);
      g.rotate(r() * Math.PI);
      g.fillStyle = leaves[(r() * leaves.length) | 0];
      g.beginPath();
      g.ellipse(0, 0, 4 + r() * 3, 2 + r() * 1.5, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  });

const drawBeach = () =>
  groundTile('#efe0b6', ['#e8d6a6', '#f6ead0', '#e2cf9c'], ['#d8c38e', '#fff6e2'], 111, (g, s, r) => {
    for (let i = 0; i < 14; i++) circle(g, r() * s, r() * s, 1.5 + r() * 2, i % 3 ? '#f4c7c0' : '#ffffff'); // shell bits
  });

const drawSnow = () =>
  groundTile('#eef3f8', ['#e3eaf2', '#f8fbff', '#dbe4ee'], ['#d2dcea', '#ffffff'], 121, (g, s, r) => {
    g.strokeStyle = 'rgba(160,180,205,0.25)';
    g.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      g.beginPath();
      g.arc(r() * s, r() * s + 40, 40 + r() * 30, Math.PI * 1.2, Math.PI * 1.8);
      g.stroke();
    }
  });

const drawSavanna = () =>
  groundTile('#c7ae62', ['#bba158', '#d4bd74', '#b09450'], ['#a88e48', '#dcc787'], 131, (g, s, r) => {
    g.strokeStyle = 'rgba(120,96,40,0.35)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 120; i++) {
      const x = r() * s;
      const y = r() * s;
      line(g, x, y, x + (r() - 0.5) * 6, y - 4 - r() * 5); // dry grass tufts
    }
  });

const drawRedrock = () =>
  groundTile('#c5784c', ['#b86b42', '#d38a5c', '#ad6038'], ['#9e5634', '#e3a274'], 141, (g, s, r) => {
    g.strokeStyle = 'rgba(120,52,24,0.3)';
    g.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      const y = r() * s;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= s; x += 32) g.lineTo(x, y + Math.sin(x / 40 + i) * 6); // sediment bands
      g.stroke();
    }
  });

const drawBasalt = () =>
  groundTile('#46413f', ['#3a3534', '#524c49', '#2f2b2a'], ['#5f5854', '#262221'], 151, (g, s, r) => {
    g.strokeStyle = 'rgba(255,110,40,0.28)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      let x = r() * s;
      let y = r() * s;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) g.lineTo((x += (r() - 0.5) * 40), (y += (r() - 0.5) * 40)); // glowing cracks
      g.stroke();
    }
  });

const drawYard = () =>
  groundTile('#868c93', ['#7b8188', '#91979e', '#757b82'], ['#6d737a', '#a1a7ae'], 161, (g, s, r) => {
    g.fillStyle = 'rgba(240,200,40,0.55)';
    g.fillRect(40, 124, 90, 6); // faded paint dash
    for (let i = 0; i < 4; i++) circle(g, r() * s, r() * s, 10 + r() * 16, 'rgba(40,40,40,0.14)'); // oil stains
  });

// Round canopy tree in any colours (base, mid, light).
function canopyTree(seed, base, mid, light) {
  const c = makeCanvas(200, 200);
  const g = c.getContext('2d');
  const r = rng(seed);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    circle(g, 100 + Math.cos(a) * 58, 100 + Math.sin(a) * 58, 34 + r() * 6, base);
  }
  circle(g, 100, 100, 70, base);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    circle(g, 92 + Math.cos(a) * 36, 92 + Math.sin(a) * 36, 22 + r() * 6, mid);
  }
  circle(g, 84, 82, 26, light);
  return c;
}

const drawTreeAutumn = () => canopyTree(201, '#c4511f', '#e07a26', '#f6b23e');

function drawTreeSnow() {
  const c = drawTreePine();
  const g = c.getContext('2d');
  const r = rng(211);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const d = 20 + r() * 64;
    circle(g, 100 + Math.cos(a) * d - 6, 100 + Math.sin(a) * d - 6, 6 + r() * 8, 'rgba(250,252,255,0.9)');
  }
  circle(g, 96, 96, 16, '#ffffff');
  return c;
}

// Fronds radiating from the centre.
function drawPalm() {
  const c = makeCanvas(220, 220);
  const g = c.getContext('2d');
  g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    const x = 110 + Math.cos(a) * 96;
    const y = 110 + Math.sin(a) * 96;
    g.strokeStyle = '#2f8a3a';
    g.lineWidth = 26;
    g.beginPath();
    g.moveTo(110, 110);
    g.quadraticCurveTo(110 + Math.cos(a + 0.3) * 60, 110 + Math.sin(a + 0.3) * 60, x, y);
    g.stroke();
    g.strokeStyle = '#5cbf4e';
    g.lineWidth = 8;
    g.stroke();
  }
  circle(g, 110, 110, 16, '#8a6a3a');
  circle(g, 104, 104, 7, '#b38a4c');
  return c;
}

// Flat-topped acacia: wide, thin canopy made of overlapping blobs.
function drawAcacia() {
  const c = makeCanvas(260, 200);
  const g = c.getContext('2d');
  const r = rng(221);
  const blobs = [];
  for (let i = 0; i < 16; i++) blobs.push([50 + r() * 160, 50 + r() * 100, 26 + r() * 18]);
  for (const [x, y, rad] of blobs) circle(g, x, y, rad, '#5d7a2c');
  for (const [x, y, rad] of blobs) circle(g, x - 6, y - 6, rad * 0.62, '#7f9c3a');
  for (const [x, y, rad] of blobs.slice(0, 6)) circle(g, x - 10, y - 10, rad * 0.3, '#9db850');
  return c;
}

function drawTreeDead() {
  const c = makeCanvas(180, 180);
  const g = c.getContext('2d');
  const r = rng(231);
  g.lineCap = 'round';
  const branch = (x, y, a, len, w, depth) => {
    const x2 = x + Math.cos(a) * len;
    const y2 = y + Math.sin(a) * len;
    g.strokeStyle = depth > 1 ? '#2a2422' : '#3c3431';
    g.lineWidth = w;
    line(g, x, y, x2, y2);
    if (depth < 3) for (const d of [-0.5, 0.45]) branch(x2, y2, a + d + (r() - 0.5) * 0.3, len * 0.6, w * 0.6, depth + 1);
  };
  for (let i = 0; i < 5; i++) branch(90, 90, (i / 5) * Math.PI * 2 + r(), 40, 12, 1);
  circle(g, 90, 90, 14, '#2a2422');
  return c;
}

function drawRockRed() {
  const c = makeCanvas(180, 150);
  const g = c.getContext('2d');
  const poly = (pts, fill) => {
    g.beginPath();
    pts.forEach(([x, y]) => g.lineTo(x, y));
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  poly([[10, 80], [30, 26], [92, 8], [158, 30], [172, 92], [128, 140], [44, 136]], '#a24e2c');
  poly([[30, 26], [92, 8], [104, 54], [56, 66]], '#d27a4a');
  poly([[104, 54], [158, 30], [172, 92], [120, 92]], '#b9603a');
  poly([[56, 66], [104, 54], [120, 92], [78, 108]], '#e39a68');
  poly([[10, 80], [56, 66], [78, 108], [44, 136]], '#8a3f22');
  return c;
}

function drawHayBale() {
  const c = makeCanvas(120, 120);
  const g = c.getContext('2d');
  circle(g, 60, 60, 54, '#c99a3c');
  g.strokeStyle = '#a97a28';
  g.lineWidth = 3;
  for (let rad = 12; rad < 54; rad += 9) {
    g.beginPath();
    g.arc(60, 60, rad, 0, Math.PI * 2);
    g.stroke();
  }
  circle(g, 52, 50, 16, 'rgba(255,230,150,0.35)');
  return c;
}

function drawUmbrella() {
  const c = makeCanvas(120, 120);
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.moveTo(60, 60);
    g.arc(60, 60, 54, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2);
    g.closePath();
    g.fillStyle = i % 2 ? '#ffffff' : '#ff5a4e';
    g.fill();
  }
  circle(g, 60, 60, 6, '#3a3a44');
  return c;
}

function drawContainers() {
  const W = 300;
  const H = 200;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const cols = ['#d9482b', '#2f6fbf', '#e8a92a', '#2f9a5a', '#7a4fb8', '#d9482b'];
  const r = rng(241);
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 2; k++) {
      const x = 6 + k * 146;
      const y = 6 + row * 64;
      g.fillStyle = cols[(r() * cols.length) | 0];
      g.fillRect(x, y, 140, 58);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let rx = x + 8; rx < x + 134; rx += 10) g.fillRect(rx, y + 4, 4, 50); // corrugation
      g.strokeStyle = 'rgba(0,0,0,0.45)';
      g.lineWidth = 3;
      g.strokeRect(x + 1.5, y + 1.5, 137, 55);
    }
  }
  return c;
}

const DRAW = {
  car: drawCar,
  tile_grass: drawGrass,
  tile_sand: drawSand,
  tile_concrete: drawConcrete,
  tree_round: drawTreeRound,
  tree_pine: drawTreePine,
  bush: drawBush,
  grandstand: drawGrandstand,
  tire_stack: drawTireStack,
  pit_building: drawPitBuilding,
  cactus: drawCactus,
  rock: drawRock,
  building_roof_1: () => drawRoof(81, '#5d6d7e', '#46525f', '#aeb8c2'),
  building_roof_2: () => drawRoof(82, '#b8694a', '#8e4d33', '#e2c7a8'),
  sign_curve: drawSign,
  tile_autumn: drawAutumn,
  tile_beach: drawBeach,
  tile_snow: drawSnow,
  tile_savanna: drawSavanna,
  tile_redrock: drawRedrock,
  tile_basalt: drawBasalt,
  tile_yard: drawYard,
  tree_autumn: drawTreeAutumn,
  tree_snow: drawTreeSnow,
  palm_tree: drawPalm,
  acacia: drawAcacia,
  tree_dead: drawTreeDead,
  rock_red: drawRockRed,
  hay_bale: drawHayBale,
  beach_umbrella: drawUmbrella,
  container_stack: drawContainers,
  warehouse_roof: () => drawRoof(251, '#7d8a96', '#5b6570', '#c9d0d6'),
  logo: null, // the menu falls back to a styled CSS title
  icon_engine: iconEngine,
  icon_turbo: iconTurbo,
  icon_tires: iconTires,
  icon_brakes: iconBrakes,
  icon_aero: iconAero,
  icon_coin: iconCoin,
  icon_trophy: iconTrophy,
};

export function makeFallback(scene, entry) {
  const draw = DRAW[entry.key];
  if (!draw) return null;
  let c = draw();
  if (entry.kind === 'tile') {
    // fallback tiles are drawn seamless at 256, upscale-free; double them like real tiles
    const big = makeCanvas(c.width * 2, c.height * 2);
    const g = big.getContext('2d');
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) g.drawImage(c, x * c.width, y * c.height);
    c = big;
  }
  if (scene.textures.exists(entry.key)) scene.textures.remove(entry.key);
  scene.textures.addCanvas(entry.key, c);
  return c;
}

// Textures that are always generated in code (effects and branding).
export function makeEffectTextures(scene) {
  const add = (key, c) => {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.addCanvas(key, c);
  };

  // soft, slightly lumpy smoke puff (also used as a round glow)
  let c = makeCanvas(64, 64);
  let g = c.getContext('2d');
  const blob = (x, y, r, a) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.55, `rgba(255,255,255,${a * 0.45})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  };
  blob(32, 32, 31, 0.85);
  const pr = rng(91);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + pr();
    blob(32 + Math.cos(a) * 9, 32 + Math.sin(a) * 9, 13 + pr() * 6, 0.22);
  }
  add('puff', c);

  // start-light lamp (tinted red when lit)
  c = makeCanvas(48, 48);
  g = c.getContext('2d');
  circle(g, 24, 24, 22, '#0c0d11');
  const lg = g.createRadialGradient(19, 18, 2, 24, 24, 18);
  lg.addColorStop(0, '#ffffff');
  lg.addColorStop(0.35, '#e8e8ec');
  lg.addColorStop(1, '#9a9aa4');
  g.beginPath();
  g.arc(24, 24, 17, 0, Math.PI * 2);
  g.fillStyle = lg;
  g.fill();
  add('lamp', c);

  // logo painted on the grass beside the main straight
  c = makeCanvas(1024, 200);
  g = c.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `italic 900 150px ${DISPLAY_FONT}`;
  g.fillStyle = '#ffffff';
  g.fillText(GAME_TITLE.toUpperCase(), 512, 92);
  g.fillStyle = '#ff7a1a';
  g.beginPath();
  g.moveTo(150, 170);
  g.lineTo(890, 170);
  g.lineTo(870, 192);
  g.lineTo(130, 192);
  g.closePath();
  g.fill();
  add('paint_logo', c);

  // sponsor banner on the footbridge
  c = makeCanvas(512, 64);
  g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, 64);
  bg.addColorStop(0, '#2b3470');
  bg.addColorStop(1, '#161b45');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#ff7a1a';
  g.fillRect(0, 0, 512, 5);
  g.fillRect(0, 59, 512, 5);
  g.fillStyle = '#ffffff';
  g.font = `italic 900 40px ${DISPLAY_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(GAME_TITLE.toUpperCase(), 256, 34);
  g.fillStyle = '#ffb020';
  for (const x of [34, 478]) {
    g.beginPath();
    g.moveTo(x - 14, 22);
    g.lineTo(x + 2, 22);
    g.lineTo(x + 14, 32);
    g.lineTo(x + 2, 42);
    g.lineTo(x - 14, 42);
    g.lineTo(x - 2, 32);
    g.closePath();
    g.fill();
  }
  add('bridge_banner', c);

  c = makeCanvas(16, 16);
  g = c.getContext('2d');
  const sg = g.createRadialGradient(8, 8, 0, 8, 8, 8);
  sg.addColorStop(0, '#ffffff');
  sg.addColorStop(0.4, '#ffd36b');
  sg.addColorStop(1, 'rgba(255,140,0,0)');
  g.fillStyle = sg;
  g.fillRect(0, 0, 16, 16);
  add('spark', c);

  c = makeCanvas(64, 40);
  g = c.getContext('2d');
  g.strokeStyle = '#ffffff';
  g.lineWidth = 10;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(8, 34);
  g.lineTo(32, 8);
  g.lineTo(56, 34);
  g.stroke();
  add('chevron', c);

  c = makeCanvas(256, 34);
  g = c.getContext('2d');
  g.fillStyle = '#e0393e';
  g.fillRect(0, 0, 256, 34);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 3);
  g.fillRect(0, 31, 256, 3);
  g.font = `italic 900 22px ${DISPLAY_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(GAME_TITLE.toUpperCase(), 128, 18);
  add('banner', c);

  // braking marker boards (3 = furthest from the corner)
  for (const k of [1, 2, 3]) {
    c = makeCanvas(60, 84);
    g = c.getContext('2d');
    rr(g, 3, 3, 54, 78, 8);
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = '#1b1b22';
    g.stroke();
    g.fillStyle = '#1b1b22';
    g.font = `900 54px ${DISPLAY_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(k), 30, 45);
    add(`brake_board_${k}`, c);
  }

  // rear brake-light glow (drawn additively behind each car)
  c = makeCanvas(64, 32);
  g = c.getContext('2d');
  const bl = g.createRadialGradient(16, 16, 1, 16, 16, 16); // stretched 2x wide by the scale below
  bl.addColorStop(0, 'rgba(255,235,235,1)');
  bl.addColorStop(0.3, 'rgba(255,40,40,0.95)');
  bl.addColorStop(1, 'rgba(255,0,0,0)');
  g.fillStyle = bl;
  g.scale(2, 1);
  g.fillRect(0, 0, 32, 32);
  g.setTransform(1, 0, 0, 1, 0, 0);
  add('brakelight', c);

  c = makeCanvas(44, 34);
  g = c.getContext('2d');
  g.beginPath();
  g.moveTo(4, 4);
  g.lineTo(40, 4);
  g.lineTo(22, 30);
  g.closePath();
  g.fillStyle = '#ffffff';
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = '#1b1f3b';
  g.stroke();
  add('marker', c);

  // sun glint on water
  c = makeCanvas(48, 48);
  g = c.getContext('2d');
  const gl = g.createRadialGradient(24, 24, 0, 24, 24, 12);
  gl.addColorStop(0, 'rgba(255,255,255,1)');
  gl.addColorStop(1, 'rgba(200,240,255,0)');
  g.fillStyle = gl;
  g.fillRect(0, 0, 48, 48);
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.beginPath();
  g.moveTo(24, 2);
  g.lineTo(26, 24);
  g.lineTo(24, 46);
  g.lineTo(22, 24);
  g.closePath();
  g.moveTo(2, 24);
  g.lineTo(24, 22);
  g.lineTo(46, 24);
  g.lineTo(24, 26);
  g.closePath();
  g.fill();
  add('glint', c);

  add('boat_a', drawBoat('#f7f8fb', '#c98f55', '#24365e'));
  add('boat_b', drawBoat('#e8463c', '#f4f1ea', '#1d2a44', true));
}

// Small boat seen from above, bow pointing up.
function drawBoat(hull, deck, cabin, speedboat = false) {
  const c = makeCanvas(90, 220);
  const g = c.getContext('2d');
  const OUT = '#1b2233';
  const shape = (inset) => {
    g.beginPath();
    g.moveTo(45, 6 + inset * 1.6);
    g.bezierCurveTo(78 - inset, 50, 84 - inset, 110, 82 - inset, 206 - inset);
    g.lineTo(8 + inset, 206 - inset);
    g.bezierCurveTo(6 + inset, 110, 12 + inset, 50, 45, 6 + inset * 1.6);
    g.closePath();
  };
  shape(0);
  g.fillStyle = hull;
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = OUT;
  g.stroke();
  shape(9);
  g.fillStyle = deck;
  g.fill();
  if (!speedboat) {
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 150; y < 196; y += 9) g.fillRect(18, y, 54, 3);
  }
  rr(g, 22, speedboat ? 92 : 70, 46, speedboat ? 46 : 74, 12);
  g.fillStyle = speedboat ? hull : '#ffffff';
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = OUT;
  g.stroke();
  rr(g, 28, speedboat ? 96 : 76, 34, speedboat ? 14 : 22, 6);
  g.fillStyle = cabin;
  g.fill();
  if (speedboat) {
    rr(g, 30, 150, 30, 36, 6);
    g.fillStyle = '#d7d2c6';
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.ellipse(36, 40, 6, 16, -0.2, 0, Math.PI * 2);
  g.fill();
  return c;
}
