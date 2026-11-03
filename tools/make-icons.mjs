// Renders assets/icon.svg to the PNG app icons that phones need (iOS home screen,
// Android install, maskable). Usage: node tools/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(root, 'assets/icon.svg'), 'utf8');
const BROWSERS = [process.env.BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].filter(Boolean);
const browser = await puppeteer.launch({ executablePath: BROWSERS.find((p) => fs.existsSync(p)), headless: true });
const page = await browser.newPage();
const data = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
// [file, size, full-bleed scale (0 = the SVG as is, with its rounded corners)]
const ICONS = [
  ['icon-180.png', 180, 1],
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['icon-maskable-512.png', 512, 1],
];
for (const [file, size, bleed] of ICONS) {
  const url = await page.evaluate(
    async (src, size, bleed) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      if (bleed) {
        // full-bleed square (the platform rounds or masks it): the same gradient behind,
        // and the art scaled up so its own rounded corners fall outside the canvas
        const bg = g.createLinearGradient(0, 0, 0, size);
        bg.addColorStop(0, '#2a2f6b');
        bg.addColorStop(1, '#14172e');
        g.fillStyle = bg;
        g.fillRect(0, 0, size, size);
        const s = size * bleed;
        g.drawImage(img, (size - s) / 2, (size - s) / 2, s, s);
      } else g.drawImage(img, 0, 0, size, size);
      return c.toDataURL('image/png');
    },
    data,
    size,
    bleed
  );
  fs.writeFileSync(path.join(root, 'assets', file), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote assets/' + file);
}
await browser.close();
