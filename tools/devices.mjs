// Screenshots of every screen on several touch devices (phones, portrait, tablet).
// Usage: node tools/devices.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { startServer } from './server.mjs';

const outDir = process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), 'screenshots', 'devices');
fs.mkdirSync(outDir, { recursive: true });
const BROWSERS = [process.env.BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].filter(Boolean);
const PORT = 8125;
const server = await startServer(PORT);
const browser = await puppeteer.launch({
  executablePath: BROWSERS.find((p) => fs.existsSync(p)),
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEVICES = {
  se: { width: 667, height: 375, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true },
  big: { width: 932, height: 430, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true },
  portrait: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  tablet: { width: 1024, height: 768, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true },
};
const only = process.argv[3];
const errors = [];
for (const [name, vp] of Object.entries(DEVICES)) {
  if (only && only !== name) continue;
  const page = await browser.newPage();
  await page.setViewport(vp);
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.evaluateOnNewDocument(() => {
    if (!localStorage.getItem('apexrush.save.v1')) localStorage.setItem('apexrush.save.v1', JSON.stringify({ coins: 5000 }));
  });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('.scr-menu', { timeout: 20000 });
  await sleep(1200);
  const shot = (s) => page.screenshot({ path: path.join(outDir, `${name}-${s}.png`) });
  await shot('menu');
  for (const s of ['play', 'garage', 'shop', 'settings']) {
    await page.tap(`[data-act="${s}"]`);
    await sleep(500);
    await shot(s);
    await page.tap('[data-act="back"]');
    await sleep(300);
  }
  await page.tap('[data-act="play"]');
  await sleep(300);
  await page.tap('[data-act="start"]');
  await sleep(5000);
  await shot('race');
  const pause = await page.$('[data-act="pause"]');
  if (pause) {
    await pause.tap();
    await sleep(400);
    await shot('pause');
  }
  await page.close();
}
await browser.close();
server.close();
console.log(errors.length ? errors.join('\n') : 'ok');
