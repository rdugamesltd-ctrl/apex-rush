// Headless smoke test: loads the game in Chrome/Edge, clicks through the menus,
// runs an autopilot race on every track, fails on any JS error and saves
// screenshots to tools/screenshots/.
// Usage: npm run smoke [-- trackId] [-- --dist]   (needs: npm install; --dist tests the `npm run build` output)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { startServer } from './server.mjs';
import { TRACK_DEFS } from '../src/game/tracks/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

const BROWSERS = [
  process.env.BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const executablePath = BROWSERS.find((p) => fs.existsSync(p));
if (!executablePath) {
  console.error('No Chrome/Edge found. Set BROWSER=/path/to/chrome');
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 8123;
const BASE = `http://localhost:${PORT}/`;
const only = process.argv.slice(2).find((a) => !a.startsWith('--'));
const useDist = process.argv.includes('--dist');
const server = await startServer(PORT, useDist ? { dir: path.join(here, '..', 'dist') } : undefined);
if (useDist) console.log('testing dist/');
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPage(viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error' && !/Failed to load resource|404/.test(text)) errors.push(`[console] ${text}`);
    if (process.env.VERBOSE) console.log(`   console.${msg.type()}: ${text}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  return page;
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log(`   saved screenshots/${name}.png`);
}

async function waitFor(page, fn, timeout, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(fn)) return true;
    await sleep(250);
  }
  errors.push(`[timeout] ${label}`);
  return false;
}

const desktop = { width: 1280, height: 720, deviceScaleFactor: 1 };
const phone = { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true };

try {
  if (!only) {
    console.log('menu (desktop)');
    let page = await newPage(desktop);
    await page.goto(BASE, { waitUntil: 'load' });
    await waitFor(page, () => !!document.querySelector('.scr-menu'), 15000, 'main menu');
    await sleep(2500);
    await shot(page, 'desktop-menu');
    await page.click('[data-act="play"]');
    await sleep(600);
    await shot(page, 'desktop-tracks');
    await page.click('[data-act="back"]');
    await page.click('[data-act="garage"]');
    await sleep(600);
    await page.click('[data-act="color"][data-color="#3a7bff"]');
    await page.click('[data-act="buy"][data-id="engine"]');
    await sleep(600);
    await shot(page, 'desktop-garage');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('apexrush.save.v1')));
    if (saved.car.color !== '#3a7bff' || saved.upgrades.engine !== 1 || saved.coins !== 0) {
      errors.push(`[save] garage changes not persisted: ${JSON.stringify({ c: saved.car.color, u: saved.upgrades, coins: saved.coins })}`);
    }
    await page.click('[data-act="back"]');
    await page.click('[data-act="shop"]');
    await sleep(600);
    await shot(page, 'desktop-shop');
    await page.click('[data-act="back"]');
    await page.click('[data-act="settings"]');
    await sleep(500);
    await shot(page, 'desktop-settings');
    await page.click('[data-act="back"]');
    await page.click('[data-act="play"]');
    await page.click('[data-act="start"]');
    await sleep(900);
    await shot(page, 'desktop-race-briefing');
    await page.click('[data-act="brief-ok"]');
    await sleep(3500);
    await shot(page, 'desktop-race-lights');
    await page.keyboard.down('ArrowUp');
    await sleep(4000);
    await shot(page, 'desktop-race-driving');
    await page.keyboard.up('ArrowUp');
    await page.keyboard.press('Escape');
    await sleep(400);
    await shot(page, 'desktop-pause');
    await page.click('[data-act="quit"]');
    await sleep(500);
    await page.close();

    console.log('shop purchases (desktop, 20,000 coins)');
    page = await newPage(desktop);
    await page.evaluateOnNewDocument(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('apexrush.save.v1', JSON.stringify({ coins: 20000 }));
    });
    await page.goto(BASE, { waitUntil: 'load' });
    await waitFor(page, () => !!document.querySelector('.scr-menu'), 15000, 'menu (shop test)');
    await page.click('[data-act="play"]');
    await sleep(500);
    await page.click('[data-act="track"][data-id="pine"]');
    await sleep(300);
    await shot(page, 'desktop-tracks-locked');
    await page.click('[data-act="buytrack"]');
    await sleep(300);
    await page.click('[data-act="back"]');
    await page.click('[data-act="shop"]');
    await sleep(400);
    await page.click('[data-act="buy"][data-id="perk:booster"]');
    await sleep(200);
    await shot(page, 'desktop-shop-confirm');
    await page.click('[data-act="buy"][data-id="perk:booster"]');
    await sleep(300);
    const bought = await page.evaluate(() => JSON.parse(localStorage.getItem('apexrush.save.v1')));
    if (!bought.unlocked.includes('pine') || !bought.owned.includes('perk:booster') || bought.coins !== 20000 - 1500 - 5000) {
      errors.push(`[shop] purchases not saved: ${JSON.stringify({ u: bought.unlocked, o: bought.owned, coins: bought.coins })}`);
    }
    if (bought.lastRace.trackId !== 'pine') errors.push('[shop] bought track was not selected');
    await page.close();
  }

  for (const [k, def] of TRACK_DEFS.entries()) {
    if (only && def.id !== only) continue;
    const follow = k === 1; // one track with the rotating "follow car" camera
    console.log(`race: ${def.id} (autopilot, 1 lap, 4x speed${follow ? ', follow camera' : ''})`);
    const page = await newPage(desktop);
    if (follow) {
      await page.evaluateOnNewDocument(() => {
        const s = JSON.parse(localStorage.getItem('apexrush.save.v1') || '{}');
        localStorage.setItem('apexrush.save.v1', JSON.stringify({ ...s, settings: { ...s.settings, camera: 'follow' } }));
      });
    }
    await page.goto(`${BASE}?race=${def.id}&autopilot&laps=1&opp=7&timescale=4`, { waitUntil: 'load' });
    await waitFor(page, () => !!document.querySelector('.hud-corner.on'), 30000, `${def.id} corner hint card`);
    await sleep(3000);
    await shot(page, `race-${def.id}`);
    const ok = await waitFor(page, () => !!document.querySelector('.scr-results'), 90000, `${def.id} results screen`);
    if (ok) {
      await sleep(1500);
      await shot(page, `results-${def.id}`);
    }
    if (follow) {
      await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('apexrush.save.v1'));
        s.settings.camera = 'fixed';
        localStorage.setItem('apexrush.save.v1', JSON.stringify(s));
      });
    }
    await page.close();
  }

  if (!only) {
    console.log('phone landscape (touch)');
    const page = await newPage(phone);
    await page.goto(BASE, { waitUntil: 'load' });
    await waitFor(page, () => !!document.querySelector('.scr-menu'), 15000, 'phone menu');
    await sleep(1500);
    await shot(page, 'phone-menu');
    await page.tap('[data-act="garage"]');
    await sleep(600);
    await shot(page, 'phone-garage');
    await page.tap('[data-act="back"]');
    await page.tap('[data-act="play"]');
    await sleep(500);
    await shot(page, 'phone-tracks');
    await page.tap('[data-act="start"]');
    await sleep(900);
    await page.tap('[data-act="brief-ok"]');
    await sleep(6500);
    const touchOn = await page.evaluate(() => document.getElementById('touch').classList.contains('on'));
    if (!touchOn) errors.push('[touch] touch controls not shown on phone');
    // hold gas via a real touch
    const gas = await page.$('[data-tc="gas"]');
    const box = await gas.boundingBox();
    const cdp = await page.createCDPSession();
    const pt = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    await sleep(2500);
    const speed = await page.evaluate(() => Number(document.querySelector('[data-h="spd"]').textContent));
    await shot(page, 'phone-race');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    if (!(speed > 50)) errors.push(`[touch] gas pedal did not accelerate the car (speed ${speed})`);
    await page.close();
  }
} catch (e) {
  errors.push(`[crash] ${e.stack || e.message}`);
} finally {
  await browser.close();
  server.close();
}

if (errors.length) {
  console.log(`\nFAILED with ${errors.length} problem(s):`);
  for (const e of errors) console.log(' -', e);
  process.exit(1);
}
console.log('\nAll smoke tests passed.');
